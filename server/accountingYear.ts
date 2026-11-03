import {latestOpenPeriod} from '../src/config/competenceCalendar';
import {externalCompaniesExcluded} from '../src/config/installmentCompanies';
import { annualValues, accountingYear, accountingProgress } from '../src/config/accountingColumns';
import { queryClosingsBySectorAndRange } from './cleanClosingsSql';
import { companyBelongsToSector } from '../src/config/companyPermissions';

export function createAccountingYearEngine(prisma:any,now:()=>Date=()=>new Date(),pool?:any) {
  let queue:Promise<any>=Promise.resolve();
  const syncedYears = new Map<number, number>();

  const sectorCondition = {
    OR: [
      { activeSectors: null },
      { activeSectors: 'TODOS' },
      { activeSectors: '' },
      { activeSectors: { contains: 'CONTABIL' } },
    ],
  };

  async function synchronize(year:number){
    if(!Number.isInteger(year)||year<1900||year>accountingYear(now()))throw new Error('Ano contábil inválido ou ainda não liberado.');
    const lastSync = syncedYears.get(year) || 0;
    const nowMs = Date.now();
    // Cache de 15 minutos para sincronização pesada do Contábil anual
    if (nowMs - lastSync < 15 * 60 * 1000) {
      const startCached = new Date(Date.UTC(year, 0, 1));
      const nextJanCached = new Date(Date.UTC(year, 1, 1));
      const endCached = new Date(Date.UTC(year + 1, 0, 1));
      const [companies, columns, closings] = await Promise.all([
        prisma.company.findMany({
          where: {
            AND: [externalCompaniesExcluded, sectorCondition],
            OR: [
              { obligationStartDate: { lt: endCached }, OR: [{ exitDate: null }, { exitDate: { gte: startCached } }] },
              { closings: { some: { type: 'CONTABIL', referencePeriod: startCached } } },
            ],
          },
          omit: { legacyData: true },
          include: {
            responsibles: {
              where: { sector: { in: ['CONTABIL', 'FISCAL'] } },
              include: { user: { select: { id: true, name: true, email: true, role: true, active: true } } },
            },
          },
        }),
        prisma.departmentColumn.findMany({where:{department:'CONTABIL'},orderBy:{orderIndex:'asc'}}),
        queryClosingsBySectorAndRange(pool, prisma, 'CONTABIL', startCached, nextJanCached),
      ]);
      const eligibleCached = companies.filter((company: any) => companyBelongsToSector(company, 'CONTABIL'));
      return { createdCount: 0, companies: eligibleCached, columns, closings };
    }

    const start=new Date(Date.UTC(year,0,1));const nextJan=new Date(Date.UTC(year,1,1));const end=new Date(Date.UTC(year+1,0,1));
    const [companies,columns,existing]=await Promise.all([
      prisma.company.findMany({where:{AND:[externalCompaniesExcluded, sectorCondition],OR:[{obligationStartDate:{lt:end},OR:[{exitDate:null},{exitDate:{gte:start}}]},{closings:{some:{type:'CONTABIL',referencePeriod:start}}}]},omit:{legacyData:true},include:{responsibles:{where:{sector:{in:['CONTABIL','FISCAL']}},include:{user:{select:{id:true,name:true,email:true,role:true,active:true}}}}}}),
      prisma.departmentColumn.findMany({where:{department:'CONTABIL'},orderBy:{orderIndex:'asc'}}),
      queryClosingsBySectorAndRange(pool, prisma, 'CONTABIL', start, end),
    ]);
    const annual=existing.filter((row:any)=>new Date(row.referencePeriod).getTime()===start.getTime());
    const mapped=new Map<string,any>(annual.map((row:any)=>[row.companyId,row]));
    const eligible=companies.filter((company:any)=>companyBelongsToSector(company, 'CONTABIL'));
    const newRows=eligible.filter((company:any)=>!mapped.has(company.id)).map((company:any)=>({companyId:company.id,type:'CONTABIL',referencePeriod:start,status:'PENDING',columnsData:annualValues(company,year,columns,{})}));
    const result=newRows.length?await prisma.closing.createMany({data:newRows,skipDuplicates:true}):{count:0};
    const closings=result.count?await queryClosingsBySectorAndRange(pool, prisma, 'CONTABIL', start, nextJan):annual;
    if(columns.length){
      const eligibleById = new Map<string, any>(eligible.map((item: any) => [item.id, item]));
      const idsByNextStatus = new Map<string, string[]>();
      const openPeriod = latestOpenPeriod(now());
      for(const closing of closings){
        const company=eligibleById.get(closing.companyId);if(!company)continue;
        const data=annualValues(company,year,columns,closing.columnsData||{});
        const progress=accountingProgress(company,year,columns,data,openPeriod);
        if(closing.status!==progress.calculatedStatus){
          const bucket = idsByNextStatus.get(progress.calculatedStatus) || [];
          bucket.push(closing.id);
          idsByNextStatus.set(progress.calculatedStatus, bucket);
          closing.status = progress.calculatedStatus;
        }
      }
      if (idsByNextStatus.size > 0) {
        await Promise.all(
          Array.from(idsByNextStatus.entries()).map(([nextStatus, ids]) =>
            prisma.closing.updateMany({ where: { id: { in: ids } }, data: { status: nextStatus } })
          )
        );
      }
    }
    syncedYears.set(year, Date.now());
    return {createdCount:result.count,companies:eligible,columns,closings};
  }
  function sync(year:number){const result=queue.catch(()=>{}).then(()=>synchronize(year));queue=result;return result;}
  return {sync,ensureAutomatic:()=>sync(accountingYear(now()))};
}
