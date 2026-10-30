export function toMysqlUtcString(d: Date): string {
  return d.toISOString().slice(0, 23).replace('T', ' ');
}

export function parseMysqlUtcDate(val: any): Date {
  if (val instanceof Date) return val;
  const s = String(val || '').trim();
  if (!s) return new Date(0);
  if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

export function parseJsonCol(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        const inner = parsed.trim();
        if ((inner.startsWith('{') && inner.endsWith('}')) || (inner.startsWith('[') && inner.endsWith(']'))) {
          try {
            return JSON.parse(inner);
          } catch {
            return parsed;
          }
        }
      }
      return parsed;
    } catch {
      return val;
    }
  }
  return val;
}

function normalizeRow(row: any) {
  return {
    id: row.id,
    companyId: row.companyId,
    type: row.type,
    referencePeriod: parseMysqlUtcDate(row.referencePeriod),
    status: row.status,
    dashboardMetrics: parseJsonCol(row.dashboardMetrics),
    columnsData: parseJsonCol(row.columnsData) || {},
    ...(row.createdAt !== undefined ? { createdAt: parseMysqlUtcDate(row.createdAt) } : {}),
    ...(row.updatedAt !== undefined ? { updatedAt: parseMysqlUtcDate(row.updatedAt) } : {}),
    ...(row.hasLegacy !== undefined ? { hasLegacy: Boolean(row.hasLegacy && Number(row.hasLegacy) > 0) } : {}),
  };
}

export async function queryClosingsBySectorAndRange(
  pool: any,
  prisma: any,
  sector: string,
  start: Date,
  end: Date,
  opts?: { includeHasLegacy?: boolean; companyIds?: string[] }
): Promise<any[]> {
  if (opts?.companyIds && opts.companyIds.length === 0) return [];
  if (!pool) {
    const rows = await prisma.closing.findMany({
      where: {
        type: sector,
        referencePeriod: { gte: start, lt: end },
        ...(opts?.companyIds ? { companyId: { in: opts.companyIds } } : {}),
      },
    });
    return rows.map((r: any) => {
      const raw = (r.columnsData && typeof r.columnsData === 'object') ? r.columnsData : {};
      const hasLegacy = Boolean(raw._legacy);
      const clean = { ...raw };
      delete clean._legacy;
      return { ...r, columnsData: clean, ...(opts?.includeHasLegacy ? { hasLegacy } : {}) };
    });
  }

  const legacySelect = opts?.includeHasLegacy
    ? `, JSON_CONTAINS_PATH(columnsData, 'one', '$._legacy') AS hasLegacy`
    : '';
  const params: any[] = [sector, toMysqlUtcString(start), toMysqlUtcString(end)];
  let companyClause = '';
  if (opts?.companyIds && opts.companyIds.length > 0) {
    companyClause = ` AND \`companyId\` IN (${opts.companyIds.map(() => '?').join(',')})`;
    params.push(...opts.companyIds);
  }

  const rows = await pool.query(
    `SELECT \`id\`, \`companyId\`, \`type\`, \`referencePeriod\`, \`status\`, \`dashboardMetrics\`,
            JSON_REMOVE(\`columnsData\`, '$._legacy') AS \`columnsData\`,
            \`createdAt\`, \`updatedAt\`${legacySelect}
     FROM \`Closing\`
     WHERE \`type\` = ? AND \`referencePeriod\` >= ? AND \`referencePeriod\` < ?${companyClause}`,
    params
  );
  return (rows as any[]).map(normalizeRow);
}

export async function queryClosingsByRangeAllSectors(
  pool: any,
  prisma: any,
  start: Date,
  end: Date
): Promise<any[]> {
  if (!pool) {
    const rows = await prisma.closing.findMany({
      where: { referencePeriod: { gte: start, lt: end } },
    });
    return rows.map((r: any) => {
      const clean = { ...((r.columnsData && typeof r.columnsData === 'object') ? r.columnsData : {}) };
      delete clean._legacy;
      return { ...r, columnsData: clean };
    });
  }

  const rows = await pool.query(
    `SELECT \`id\`, \`companyId\`, \`type\`, \`referencePeriod\`, \`status\`, \`dashboardMetrics\`,
            JSON_REMOVE(\`columnsData\`, '$._legacy') AS \`columnsData\`,
            \`updatedAt\`
     FROM \`Closing\`
     WHERE \`referencePeriod\` >= ? AND \`referencePeriod\` < ?`,
    [toMysqlUtcString(start), toMysqlUtcString(end)]
  );
  return (rows as any[]).map(normalizeRow);
}

export async function queryClosingsForDashboard(
  pool: any,
  prisma: any,
  monthStart: Date,
  nextMonthStart: Date,
  annualStart: Date
): Promise<any[]> {
  if (!pool) {
    const rows = await prisma.closing.findMany({
      where: {
        OR: [
          { type: { not: 'CONTABIL' }, referencePeriod: { gte: monthStart, lt: nextMonthStart } },
          { type: 'CONTABIL', referencePeriod: annualStart },
        ],
      },
      select: { type: true, status: true, dashboardMetrics: true, columnsData: true, companyId: true, referencePeriod: true },
    });
    return rows.map((r: any) => {
      const clean = { ...((r.columnsData && typeof r.columnsData === 'object') ? r.columnsData : {}) };
      delete clean._legacy;
      return { ...r, columnsData: clean };
    });
  }

  const rows = await pool.query(
    `SELECT \`companyId\`, \`type\`, \`status\`, \`referencePeriod\`, \`dashboardMetrics\`,
            JSON_REMOVE(\`columnsData\`, '$._legacy') AS \`columnsData\`
     FROM \`Closing\`
     WHERE (\`type\` <> 'CONTABIL' AND \`referencePeriod\` >= ? AND \`referencePeriod\` < ?)
        OR (\`type\` = 'CONTABIL' AND \`referencePeriod\` = ?)`,
    [toMysqlUtcString(monthStart), toMysqlUtcString(nextMonthStart), toMysqlUtcString(annualStart)]
  );
  return (rows as any[]).map(normalizeRow);
}

export async function queryFiscalReinfMap(
  pool: any,
  prisma: any,
  monthStart: Date,
  nextMonthStart: Date
): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!pool) {
    const rows = await prisma.closing.findMany({
      where: { type: 'FISCAL', referencePeriod: { gte: monthStart, lt: nextMonthStart } },
      select: { companyId: true, columnsData: true },
    });
    for (const r of rows) {
      map.set(r.companyId, r.columnsData?.reinf || null);
    }
    return map;
  }

  const rows = await pool.query(
    `SELECT \`companyId\`, JSON_EXTRACT(\`columnsData\`, '$.reinf') AS \`reinf\`
     FROM \`Closing\`
     WHERE \`type\` = 'FISCAL' AND \`referencePeriod\` >= ? AND \`referencePeriod\` < ?`,
    [toMysqlUtcString(monthStart), toMysqlUtcString(nextMonthStart)]
  );
  for (const r of rows as any[]) {
    map.set(r.companyId, parseJsonCol(r.reinf) || null);
  }
  return map;
}

export async function queryFallbackClosingsForPeriods(
  pool: any,
  prisma: any,
  sector: string,
  periods: Date[],
  companyIds: string[]
): Promise<Array<{ companyId: string; referencePeriod: Date; columnsData: Record<string, any> }>> {
  if (!periods.length || !companyIds.length) return [];
  if (!pool) {
    const rows = await prisma.closing.findMany({
      where: {
        type: sector,
        referencePeriod: { in: periods },
        companyId: { in: companyIds },
      },
      select: { companyId: true, referencePeriod: true, columnsData: true },
      orderBy: { referencePeriod: 'desc' },
    });
    return rows.map((r: any) => {
      const clean = { ...((r.columnsData && typeof r.columnsData === 'object') ? r.columnsData : {}) };
      delete clean._legacy;
      return { companyId: r.companyId, referencePeriod: new Date(r.referencePeriod), columnsData: clean };
    });
  }

  const periodStrings = Array.from(new Set(periods.map(toMysqlUtcString)));
  const pPlaceholders = periodStrings.map(() => '?').join(',');
  const cPlaceholders = companyIds.map(() => '?').join(',');
  const rows = await pool.query(
    `SELECT \`companyId\`, \`referencePeriod\`,
            JSON_REMOVE(\`columnsData\`, '$._legacy') AS \`columnsData\`
     FROM \`Closing\`
     WHERE \`type\` = ?
       AND \`referencePeriod\` IN (${pPlaceholders})
       AND \`companyId\` IN (${cPlaceholders})
     ORDER BY \`referencePeriod\` DESC`,
    [sector, ...periodStrings, ...companyIds]
  );
  return (rows as any[]).map((r: any) => ({
    companyId: r.companyId,
    referencePeriod: parseMysqlUtcDate(r.referencePeriod),
    columnsData: parseJsonCol(r.columnsData) || {},
  }));
}
