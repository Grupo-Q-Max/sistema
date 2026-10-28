// Calendário de fechamento: competência anterior, liberada na virada em Brasília, ou competência liberada manualmente.
export const CLOSING_TIME_ZONE = 'America/Sao_Paulo';
export function normalizePeriod(period: Date): Date {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1));
}

let manualLatestPeriod: Date | null = null;

export function setManualLatestPeriod(period: Date | string | null) {
  if (!period) {
    manualLatestPeriod = null;
    return;
  }
  const d = typeof period === 'string' ? new Date(period) : period;
  if (Number.isFinite(d.getTime())) {
    const normalized = normalizePeriod(d);
    if (!manualLatestPeriod || normalized.getTime() > manualLatestPeriod.getTime()) {
      manualLatestPeriod = normalized;
    }
  }
}

export function getManualLatestPeriod(): Date | null {
  return manualLatestPeriod;
}

export function latestOpenPeriod(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: CLOSING_TIME_ZONE, year: 'numeric', month: 'numeric' }).formatToParts(now);
  const year = Number(parts.find(part => part.type === 'year')!.value);
  const month = Number(parts.find(part => part.type === 'month')!.value);
  const automatic = new Date(Date.UTC(year, month - 2, 1));
  if (manualLatestPeriod && manualLatestPeriod.getTime() > automatic.getTime()) {
    return manualLatestPeriod;
  }
  return automatic;
}
export function periodIsOpen(period: Date, now = new Date()): boolean {
  return Number.isFinite(period.getTime()) && normalizePeriod(period).getTime() <= latestOpenPeriod(now).getTime();
}
export function releaseDate(period: Date): string {
  const next = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));
  return next.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
export function blockedPeriodMessage(period: Date): string {
  return `Esta competência será liberada automaticamente em ${releaseDate(period)}, à meia-noite no horário de Brasília.`;
}
