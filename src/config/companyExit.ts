// One rule shared by monthly lists, counters and monthly accounting cells.
export function companyExitWhere(period: Date) {
  const start = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1));
  const next = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));
  return { OR: [
    { exitDate: null },
    { exitDate: { gt: next } },
    { exitMonthHasObligations: true, exitDate: { gt: start } },
  ] };
}

export function companyExitAllowsPeriod(company: any, period: Date): boolean {
  if (!company.exitDate) return true;
  const exit = new Date(company.exitDate).getTime();
  const cutoff = Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + (company.exitMonthHasObligations === true ? 0 : 1), 1);
  return Number.isFinite(exit) && exit > cutoff;
}

export function exitDecisionError(body: any, existing: any, parsedExit: Date | null | undefined): string | null {
  if (body.exitMonthHasObligations !== undefined && typeof body.exitMonthHasObligations !== 'boolean') return 'Informe Sim ou Não para as obrigações no mês de saída.';
  if (body.exitDate !== undefined && body.exitDate !== null && String(body.exitDate).trim() && !parsedExit) return 'Data de saída inválida.';
  if (body.exitDate !== undefined && parsedExit && typeof body.exitMonthHasObligations !== 'boolean') return 'Essa empresa tem obrigações no mês de saída? Responda Sim ou Não.';
  if (body.exitMonthHasObligations === true && !(body.exitDate !== undefined ? parsedExit : existing?.exitDate)) return 'Informe a data de saída antes de marcar obrigações no mês de saída.';
  return null;
}

export function exitDecisionValue(body: any, existing: any, parsedExit: Date | null | undefined): boolean {
  const exit = body.exitDate !== undefined ? parsedExit : existing?.exitDate;
  return !!exit && (body.exitMonthHasObligations !== undefined ? body.exitMonthHasObligations : existing?.exitMonthHasObligations) === true;
}
