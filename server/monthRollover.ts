import {companyExitWhere} from '../src/config/companyExit';
import {externalCompaniesExcluded} from '../src/config/installmentCompanies';
import { latestOpenPeriod, normalizePeriod, periodIsOpen } from '../src/config/competenceCalendar';
import { isColumnActive, isColumnComplete } from '../src/config/columnVisibility';
import { resolveColumnKey } from '../src/config/payrollColumns';
import { FISCAL_POPUPS } from '../src/config/fiscalPopups';
import { applyFiscalRegimeRules } from '../src/config/fiscalRegimeRules';
import { queryClosingsByRangeAllSectors } from './cleanClosingsSql';

const SECTORS = ['FISCAL', 'PARCELAMENTO', 'DP', 'CUSHMAN'];
const owns = (object: Record<string, any>, key: string) => Object.prototype.hasOwnProperty.call(object, key);
export function isNotApplicable(value: any): boolean {
  return typeof value === 'string' ? value.trim().toUpperCase() === 'N/A' : !!value && typeof value === 'object' && typeof value.status === 'string' && value.status.trim().toUpperCase() === 'N/A';
}
export function replicatedData(columns: any[], source: Record<string, any>, target: Record<string, any>, period: Date): Record<string, any> {
  const copied: Record<string, any> = {};
  for (const column of columns) {
    const key = resolveColumnKey(column) || column.id;
    if (key === 'dp_reinf_fiscal' || column.inputType === 'READONLY' || !isColumnActive(column, period)) continue;
    const aliases = Array.from(new Set([key, column.columnKey, column.id, column.name].filter(Boolean)));
    // Um valor existente no destino, inclusive vazio/null, representa uma escolha do usuário.
    if (aliases.some(alias => owns(target, alias))) continue;
    const sourceKey = aliases.find(alias => owns(source, alias));
    if (!sourceKey) continue;
    const value = source[sourceKey];
    if (value !== undefined && (column.replicates || isNotApplicable(value))) copied[key] = structuredClone(value);
  }
  return copied;
}
function closingStatus(columns: any[], data: Record<string, any>, period: Date): string {
  const tracked = columns.filter(column => column.countsProgress && isColumnActive(column, period));
  const done = tracked.filter(column => isColumnComplete(column, data[resolveColumnKey(column) || column.id])).length;
  if (tracked.length && done === tracked.length) return 'COMPLETED';
  return done || tracked.some(column => ['PENDENCIA','PENDÊNCIA'].includes(data[resolveColumnKey(column) || column.id]?.status)) ? 'IN_PROGRESS' : 'PENDING';
}
export function createRolloverEngine(prisma: any, now: () => Date = () => new Date(), pool?: any) {
  let queue: Promise<any> = Promise.resolve();
  let automaticRun: Promise<any> | null = null;
  const syncedCache = new Map<string, number>();

  async function synchronize(target: Date, force = false) {
    const monthStart = normalizePeriod(target);
    const cacheKey = monthStart.toISOString().slice(0, 7);
    const lastSyncTime = syncedCache.get(cacheKey) || 0;
    const nowMs = Date.now();
    
    // Se sincronizou nos últimos 15 minutos e não for forçado, não repete as milhares de queries
    if (!force && nowMs - lastSyncTime < 15 * 60 * 1000) {
      return { createdCount: 0, replicatedColsCount: 0 };
    }

    if (!force && !periodIsOpen(monthStart, now())) throw new Error('Competência ainda não liberada.');
    const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const prevMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));
    const [companies, definitions, existing, previous] = await Promise.all([
      prisma.company.findMany({ where: { AND:[externalCompaniesExcluded,companyExitWhere(monthStart)], obligationStartDate: { lt: nextMonthStart } }, select: {id:true,activeSectors:true,taxRegime:true} }),
      prisma.departmentColumn.findMany(),
      queryClosingsByRangeAllSectors(pool, prisma, monthStart, nextMonthStart),
      queryClosingsByRangeAllSectors(pool, prisma, prevMonthStart, monthStart),
    ]);
    if (!companies.length) return {createdCount:0,replicatedColsCount:0};
    const current = new Map<string, any>(existing.map((row:any)=>[`${row.companyId}:${row.type}`,row]));
    const sources = new Map<string, any>(previous.map((row:any)=>[`${row.companyId}:${row.type}`,row]));
    const create: any[] = [];
    const pendingUpdates: Array<{ destination: any; copy: Record<string, any>; copiedKeysCount: number; sector: string; taxRegime: any; columns: any[] }> = [];
    let replicatedColsCount = 0;
    for (const company of companies) for (const sector of SECTORS) {
      const enabled = !company.activeSectors || company.activeSectors === 'TODOS' || company.activeSectors.split(',').map((item:string)=>item.trim()).includes(sector);
      if (!enabled) continue;
      const id = `${company.id}:${sector}`;
      const destination = current.get(id);
      const source = sources.get(id);
      let columns = definitions.filter((column:any)=>column.department===sector);
      // Instalações antigas do Fiscal ainda podem não possuir definições persistidas.
      if (!columns.length && sector === 'FISCAL') columns = Object.keys(FISCAL_POPUPS).map(columnKey=>({id:columnKey,columnKey,inputType:'POPUP',countsProgress:true}));
      const copy = replicatedData(columns, source?.columnsData || {}, destination?.columnsData || {}, monthStart);
      const copiedKeys = Object.keys(copy);
      if (destination && !copiedKeys.length) continue;
      if (destination) {
        if (copiedKeys.length > 0) {
          pendingUpdates.push({ destination, copy, copiedKeysCount: copiedKeys.length, sector, taxRegime: company.taxRegime, columns });
        }
      } else {
        let data = { ...copy };
        if (sector === 'FISCAL') data = applyFiscalRegimeRules(company.taxRegime, data);
        const dashboardMetrics: Record<string, any> = {};
        if (sector === 'DP' && owns(copy,'dp_qtde_funcionarios')) dashboardMetrics.employees = Number(copy.dp_qtde_funcionarios) || 0;
        create.push({companyId:company.id,type:sector,referencePeriod:monthStart,columnsData:data,status:closingStatus(columns,data,monthStart),dashboardMetrics});
        replicatedColsCount += copiedKeys.length;
      }
    }
    if (pendingUpdates.length > 0) {
      const fullRows = await prisma.closing.findMany({
        where: { id: { in: pendingUpdates.map(u => u.destination.id) } },
        select: { id: true, columnsData: true, dashboardMetrics: true, updatedAt: true },
      });
      const fullById = new Map<string, any>(fullRows.map((r: any) => [r.id, r]));
      const BATCH = 10;
      for (let i = 0; i < pendingUpdates.length; i += BATCH) {
        const slice = pendingUpdates.slice(i, i + BATCH);
        await Promise.all(slice.map(async (u) => {
          const full = fullById.get(u.destination.id) || u.destination;
          let data = { ...((full.columnsData as Record<string, any>) || {}), ...u.copy };
          if (u.sector === 'FISCAL') data = applyFiscalRegimeRules(u.taxRegime, data);
          const dashboardMetrics = { ...(full.dashboardMetrics || {}) };
          if (u.sector === 'DP' && owns(u.copy, 'dp_qtde_funcionarios')) dashboardMetrics.employees = Number(u.copy.dp_qtde_funcionarios) || 0;
          const upd = await prisma.closing.updateMany({
            where: { id: u.destination.id, updatedAt: full.updatedAt },
            data: { columnsData: data, status: closingStatus(u.columns, data, monthStart), dashboardMetrics },
          });
          if (upd.count) replicatedColsCount += u.copiedKeysCount;
        }));
      }
    }
    const result = create.length ? await prisma.closing.createMany({data:create,skipDuplicates:true}) : {count:0};
    syncedCache.set(cacheKey, Date.now());
    return {createdCount:result.count,replicatedColsCount};
  }
  function sync(target: Date, force = false) {
    const run = queue.catch(()=>{}).then(()=>synchronize(target, force));
    queue = run;
    return run;
  }
  function ensureAutomatic() {
    if (automaticRun) return automaticRun;
    automaticRun = (async()=>{
      const latest = latestOpenPeriod(now());
      // Ignora meses futuros já criados. Recupera meses perdidos em ordem após uma parada da API.
      const last = await prisma.closing.findFirst({where:{referencePeriod:{lt:latest}},orderBy:{referencePeriod:'desc'},select:{referencePeriod:true}});
      let cursor = last ? new Date(Date.UTC(last.referencePeriod.getUTCFullYear(),last.referencePeriod.getUTCMonth()+1,1)) : latest;
      const result = {createdCount:0,replicatedColsCount:0};
      while (cursor.getTime() <= latest.getTime()) {
        const part = await sync(cursor);result.createdCount += part.createdCount;result.replicatedColsCount += part.replicatedColsCount;
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1));
      }
      return result;
    })().finally(()=>{automaticRun=null;});
    return automaticRun;
  }
  return {sync,ensureAutomatic};
}
