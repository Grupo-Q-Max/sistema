export interface LegalDeadlineInfo {
  day: number;
  label: string;
  description: string;
}

export const DEFAULT_LEGAL_DEADLINES: Record<string, LegalDeadlineInfo> = {
  // Fiscal
  pgdas: { day: 20, label: 'PGDAS-D', description: 'Programa Gerador do Documento de Arrecadação do Simples Nacional (Dia 20)' },
  iss: { day: 10, label: 'ISS Municipal', description: 'Imposto Sobre Serviços (Dia 10)' },
  dctfweb: { day: 15, label: 'DCTFWeb', description: 'Declaração de Débitos e Créditos Tributários Federais Previdenciários (Dia 15)' },
  reinf: { day: 15, label: 'EFD-Reinf', description: 'Escrituração Fiscal Digital de Retenções (Dia 15)' },
  sped_fiscal: { day: 20, label: 'SPED Fiscal', description: 'EFD ICMS IPI (Dia 20)' },
  efd_contribuicoes: { day: 15, label: 'EFD Contribuições', description: 'PIS/Cofins (Dia 15)' },
  darf: { day: 20, label: 'DARF IRPJ/CSLL', description: 'Tributos Federais (Dia 20)' },
  devec: { day: 10, label: 'DEVEC', description: 'Declaração Eletrônica de Serviços de Veículos (Dia 10)' },
  gia: { day: 20, label: 'GIA', description: 'Guia de Informação e Apuração do ICMS (Dia 20)' },

  // DP
  dp_folha: { day: 15, label: 'Folha de Pagamento', description: 'Fechamento da folha e adiantamento (Dia 15)' },
  dp_esocial: { day: 15, label: 'eSocial', description: 'Transmissão dos eventos periódicos (Dia 15)' },
  dp_fgts: { day: 20, label: 'FGTS Digital', description: 'Guia do FGTS Digital (Dia 20)' },
  dp_dctfweb: { day: 15, label: 'DCTFWeb Previdenciária', description: 'Transmissão da DCTFWeb de folha (Dia 15)' },
  dp_reinf_fiscal: { day: 15, label: 'REINF Fiscal (DP)', description: 'Espelho da Reinf (Dia 15)' },

  // Cushman
  cush_iss: { day: 10, label: 'ISS Cushman', description: 'Apuração e guias municipais (Dia 10)' },
  cush_reinf: { day: 15, label: 'REINF Cushman', description: 'Retenções e eventos da Cushman (Dia 15)' },
  cush_sped_fiscal: { day: 20, label: 'SPED Fiscal Cushman', description: 'EFD ICMS IPI Cushman (Dia 20)' },
  cush_esocial: { day: 15, label: 'e-social Cushman', description: 'Folha e eventos Cushman (Dia 15)' },
  cush_devec: { day: 10, label: 'DEVEC Cushman', description: 'Declaração Cushman (Dia 10)' },
};

const normalizeKey = (key: string): string => {
  return String(key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^_+|_+$/g, '');
};

/**
 * Obtém o dia do mês limite legal configurado para uma obrigação/coluna.
 */
export function getColumnDeadlineDay(column: any): number | null {
  if (!column) return null;

  // 1. Configuração explícita na coluna
  if (typeof column.deadlineDay === 'number' && column.deadlineDay >= 1 && column.deadlineDay <= 31) {
    return column.deadlineDay;
  }
  if (typeof column.fieldConfig?.deadlineDay === 'number' && column.fieldConfig.deadlineDay >= 1 && column.fieldConfig.deadlineDay <= 31) {
    return column.fieldConfig.deadlineDay;
  }
  if (typeof column.popupConfig?.deadlineDay === 'number' && column.popupConfig.deadlineDay >= 1 && column.popupConfig.deadlineDay <= 31) {
    return column.popupConfig.deadlineDay;
  }

  // 2. Mapeamento padrão por chave ou nome
  const rawKey = column.columnKey || column.id || '';
  const normKey = normalizeKey(rawKey);

  for (const [defKey, info] of Object.entries(DEFAULT_LEGAL_DEADLINES)) {
    if (normKey === defKey || normKey.includes(defKey)) {
      return info.day;
    }
  }

  const normName = normalizeKey(column.name || '');
  for (const [defKey, info] of Object.entries(DEFAULT_LEGAL_DEADLINES)) {
    if (normName.includes(defKey) || defKey.includes(normName)) {
      return info.day;
    }
  }

  return null;
}

/**
 * Calcula a data limite exata da obrigação referente a uma competência,
 * ajustando para o dia útil anterior se cair em final de semana (regra tributária padrão).
 */
export function getDeadlineDate(day: number, period: Date): Date {
  const year = period.getUTCFullYear();
  const month = period.getUTCMonth(); // 0 a 11

  // Vencimento no mês subsequente
  const nextMonthYear = month === 11 ? year + 1 : year;
  const nextMonth = (month + 1) % 12;

  // Último dia do mês subsequente (caso o dia solicitado seja 31 e o mês tenha 30)
  const lastDayOfMonth = new Date(Date.UTC(nextMonthYear, nextMonth + 1, 0)).getUTCDate();
  const effectiveDay = Math.min(day, lastDayOfMonth);

  const date = new Date(Date.UTC(nextMonthYear, nextMonth, effectiveDay, 23, 59, 59));

  // Ajuste de fim de semana (Sábado -> Sexta; Domingo -> Sexta)
  const dayOfWeek = date.getUTCDay(); // 0 = Domingo, 6 = Sábado
  if (dayOfWeek === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  } else if (dayOfWeek === 0) {
    date.setUTCDate(date.getUTCDate() - 2);
  }

  return date;
}

export type UrgencyType = 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'ON_TRACK' | 'COMPLETED' | 'NA';

export interface DeadlineUrgency {
  type: UrgencyType;
  label: string;
  badgeText: string;
  color: string;
  bgColor: string;
  daysRemaining: number;
  formattedDate: string;
}

/**
 * Avalia o status de urgência do prazo para uma obrigação.
 */
export function getDeadlineUrgency(
  deadlineDate: Date,
  isCompleted: boolean,
  isNA: boolean = false
): DeadlineUrgency {
  const formattedDate = `${String(deadlineDate.getUTCDate()).padStart(2, '0')}/${String(deadlineDate.getUTCMonth() + 1).padStart(2, '0')}`;

  if (isNA) {
    return {
      type: 'NA',
      label: 'Não se aplica',
      badgeText: 'N/A',
      color: '#94a3b8',
      bgColor: 'rgba(148, 163, 184, 0.12)',
      daysRemaining: 999,
      formattedDate
    };
  }

  if (isCompleted) {
    return {
      type: 'COMPLETED',
      label: 'Concluído no prazo',
      badgeText: 'OK',
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.15)',
      daysRemaining: 999,
      formattedDate
    };
  }

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59));
  const diffTime = deadlineDate.getTime() - todayUtc.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      type: 'OVERDUE',
      label: `Atrasado há ${overdueDays} dia(s)`,
      badgeText: `Venceu ${formattedDate}`,
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.18)',
      daysRemaining: diffDays,
      formattedDate
    };
  }

  if (diffDays === 0) {
    return {
      type: 'DUE_TODAY',
      label: 'Vence HOJE!',
      badgeText: 'Vence hoje',
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.22)',
      daysRemaining: 0,
      formattedDate
    };
  }

  if (diffDays <= 3) {
    return {
      type: 'DUE_SOON',
      label: `Vence em ${diffDays} dia(s)`,
      badgeText: `${diffDays}d p/ vencer`,
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.15)',
      daysRemaining: diffDays,
      formattedDate
    };
  }

  return {
    type: 'ON_TRACK',
    label: `Prazo até ${formattedDate}`,
    badgeText: `Prazo: ${formattedDate}`,
    color: '#818cf8',
    bgColor: 'rgba(129, 140, 248, 0.12)',
    daysRemaining: diffDays,
    formattedDate
  };
}

export interface ColumnDeadlineSummary {
  columnKey: string;
  name: string;
  day: number;
  deadlineDate: Date;
  urgency: DeadlineUrgency;
  totalPending: number;
  totalCompleted: number;
  totalNA: number;
  totalEligible: number;
}

/**
 * Computa o resumo cronológico de prazos de todas as colunas para a competência.
 */
export function computeDeadlinesSummary(
  columns: any[],
  rows: any[],
  period: Date
): ColumnDeadlineSummary[] {
  const result: ColumnDeadlineSummary[] = [];

  for (const col of columns) {
    const day = getColumnDeadlineDay(col);
    if (!day) continue;

    const key = col.columnKey || col.id;
    const deadlineDate = getDeadlineDate(day, period);

    let totalPending = 0;
    let totalCompleted = 0;
    let totalNA = 0;

    for (const r of rows) {
      const val = r.columnsData?.[key];
      const status = typeof val === 'object' && val !== null ? val.status : (val ? 'CONCLUIDO' : 'PENDENTE');

      if (status === 'N/A') {
        totalNA++;
      } else if (status === 'CONCLUIDO' || status === 'OK - SEM MOVIMENTO') {
        totalCompleted++;
      } else {
        totalPending++;
      }
    }

    const isAllDone = totalPending === 0 && (totalCompleted > 0 || totalNA > 0);
    const urgency = getDeadlineUrgency(deadlineDate, isAllDone, false);

    result.push({
      columnKey: key,
      name: col.name || key,
      day,
      deadlineDate,
      urgency,
      totalPending,
      totalCompleted,
      totalNA,
      totalEligible: totalPending + totalCompleted
    });
  }

  // Ordenar cronologicamente pelo dia de vencimento
  result.sort((a, b) => a.deadlineDate.getTime() - b.deadlineDate.getTime());

  return result;
}

