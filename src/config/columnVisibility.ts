export type ColumnVisibility = { version: 1; mode: 'ALL' | 'ANNUAL' | 'SPECIFIC'; months: number[]; years: number[] };
export const ALL_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
export const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export function defaultVisibility(): ColumnVisibility { return { version: 1, mode: 'ALL', months: [...ALL_MONTHS], years: [] }; }
export function effectiveVisibility(column: { visibilityConfig?: ColumnVisibility | null }): ColumnVisibility { return column.visibilityConfig ? structuredClone(column.visibilityConfig) : defaultVisibility(); }
export function validateVisibility(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Configuração de competências inválida.';
  const c = value as ColumnVisibility;
  if (c.version !== 1 || !['ALL','ANNUAL','SPECIFIC'].includes(c.mode)) return 'Escolha a frequência da coluna.';
  if (!Array.isArray(c.months) || c.months.some(m => !Number.isInteger(m) || m < 1 || m > 12) || new Set(c.months).size !== c.months.length) return 'Selecione meses válidos, sem repetições.';
  if (!Array.isArray(c.years) || c.years.some(y => !Number.isInteger(y) || y < 1900 || y > 9999) || new Set(c.years).size !== c.years.length) return 'Informe anos válidos, sem repetições.';
  if (c.mode !== 'ALL' && !c.months.length) return 'Selecione pelo menos um mês.';
  if (c.mode === 'SPECIFIC' && !c.years.length) return 'Selecione pelo menos um ano.';
  return null;
}
export function isColumnActive(column: { visibilityConfig?: ColumnVisibility | null; isActive?: boolean }, period: Date): boolean {
  if (column.isActive === false) return false;
  const c = column.visibilityConfig;
  if (!c || c.mode === 'ALL') return true;
  if (!c.months.includes(period.getUTCMonth() + 1)) return false;
  return c.mode === 'ANNUAL' || c.years.includes(period.getUTCFullYear());
}
export function visibilitySummary(column: { visibilityConfig?: ColumnVisibility | null }): string {
  const c = effectiveVisibility(column);
  if (c.mode === 'ALL') return 'Todas as competências';
  const months = [...c.months].sort((a,b)=>a-b).map(m=>MONTH_NAMES[m-1].slice(0,3)).join(', ');
  return c.mode === 'ANNUAL' ? `${months} · todos os anos` : `${months} · anos ${[...c.years].sort((a,b)=>a-b).join(', ')}`;
}
export function progressStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[_\s]+/g, ' ') : '';
}
export function isColumnFilled(value: any): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return !!value.trim() && !['PENDENTE','PENDING','NAO E CLIENTE'].includes(progressStatus(value));
  if (typeof value === 'object') return isColumnFilled(value.status) || Object.values(value.data || {}).some(isColumnFilled) || isColumnFilled(value.pendingReason) || isColumnFilled(value.completionDate);
  return value === true;
}
export function isColumnComplete(column: { inputType?: string; columnKey?: string | null; department?: string }, value: any): boolean {
  if (column.inputType === 'CHECKBOX') return value === true;
  if (column.inputType === 'READONLY') return false;
  if (column.inputType === 'NUMBER') return typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && !!value.trim() && Number.isFinite(Number(value));
  if (column.inputType === 'TEXT' && (column.department === 'CUSHMAN' || column.columnKey?.startsWith('cush_')) && typeof value === 'string' && /^(pendente|pend[êe]ncia)(\s|:|$)/i.test(value.trim())) return false;
  if (['TEXT','SELECT','TEXTAREA','PASSWORD'].includes(column.inputType || '')) {
    const isPending = column.inputType === 'SELECT' && Array.isArray((column as any).fieldConfig?.pendingOptions)
      ? (column as any).fieldConfig.pendingOptions.some((opt: string) => progressStatus(opt) === progressStatus(value))
      : ['PENDENCIA','PENDENTE'].includes(progressStatus(value));
    return (typeof value === 'string' || typeof value === 'number') && isColumnFilled(value) && !isPending;
  }
  return ['CONCLUIDO','SEM MOVIMENTO','N/A','OK - DATA','OK - SEM MOVIMENTO','OK - FINALIZADO'].includes(progressStatus(typeof value === 'object' ? value?.status : value));
}
export function calculateColumnProgress(columns: any[], data: Record<string, any>, keyOf: (column: any) => string) {
  const applicableColumns = columns.filter(column => {
    const val = data[keyOf(column)];
    return progressStatus(typeof val === 'object' ? val?.status : val) !== 'NAO E CLIENTE';
  });
  if (columns.length > 0 && applicableColumns.length === 0) {
    return { progressTotal: 0, progressDone: 0, progressPercent: 100, calculatedStatus: 'NOT_APPLICABLE' };
  }
  const progressTotal = applicableColumns.length;
  const progressDone = applicableColumns.filter(column => isColumnComplete(column, data[keyOf(column)])).length;
  const started = applicableColumns.some(column => isColumnFilled(data[keyOf(column)]));
  return {progressTotal, progressDone, progressPercent: progressTotal ? Math.round(progressDone / progressTotal * 100) : 0, calculatedStatus: progressTotal && progressDone === progressTotal ? 'COMPLETED' : started ? 'IN_PROGRESS' : 'PENDING'};
}
