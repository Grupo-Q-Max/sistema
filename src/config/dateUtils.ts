/**
 * Utilitário robusto para conversão e formatação de datas em formato brasileiro e ISO.
 * Elimina problemas de "Invalid Date" e "NaNd" causados por new Date("DD/MM/AAAA").
 */

export function parseFlexibleDate(val: any): Date | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  const str = String(val).trim();
  if (!str || str === '-' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'null') {
    return null;
  }

  // 1. DD/MM/AAAA ou DD-MM-AAAA ou DD.MM.AAAA (com ou sem hora)
  const dmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const year = parseInt(dmy[3], 10);
    const hour = dmy[4] ? parseInt(dmy[4], 10) : 23;
    const min = dmy[5] ? parseInt(dmy[5], 10) : 59;
    const sec = dmy[6] ? parseInt(dmy[6], 10) : 59;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(year, month, day, hour, min, sec);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 2. MM/AAAA ou MM-AAAA (muito comum em vencimento de certificado)
  const my = str.match(/^(\d{1,2})[\/\-\.](\d{4})$/);
  if (my) {
    const month = parseInt(my[1], 10) - 1;
    const year = parseInt(my[2], 10);
    if (month >= 0 && month <= 11) {
      // Considera até o último dia do mês às 23:59:59
      const d = new Date(year, month + 1, 0, 23, 59, 59);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 3. YYYY-MM-DD ou YYYY/MM/DD (com ou sem hora)
  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10) - 1;
    const day = parseInt(ymd[3], 10);
    const hour = ymd[4] ? parseInt(ymd[4], 10) : 23;
    const min = ymd[5] ? parseInt(ymd[5], 10) : 59;
    const sec = ymd[6] ? parseInt(ymd[6], 10) : 59;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(year, month, day, hour, min, sec);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 4. ISO timestamp completo ou formato padrão do JavaScript
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    return fallback;
  }

  return null;
}

export function formatFlexibleDateBr(val: any, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  const str = String(val).trim();
  if (!str || str === '-' || str.toLowerCase() === 'n/a') return fallback;

  // Se já for DD/MM/AAAA válido, devolve diretamente
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }

  // Se for MM/AAAA (formato mês/ano), preserva MM/AAAA
  if (/^\d{2}\/\d{4}$/.test(str)) {
    return str;
  }

  const parsed = parseFlexibleDate(val);
  if (!parsed) return fallback || str;

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

export type CertificateExpirationResult = {
  status: 'NONE' | 'EXPIRED' | 'WARNING' | 'EXPIRING_60' | 'OK' | 'INVALID';
  label: string;
  color: string;
  days: number | null;
  formattedDate: string;
};

export function getCertificateExpirationStatus(dateStr?: string | Date | null): CertificateExpirationResult {
  if (!dateStr || !String(dateStr).trim()) {
    return { status: 'NONE', label: 'Não possui', color: '#64748b', days: null, formattedDate: '' };
  }

  const expDate = parseFlexibleDate(dateStr);
  if (!expDate) {
    return { status: 'INVALID', label: 'Data inválida', color: '#ef4444', days: null, formattedDate: String(dateStr) };
  }

  const formattedDate = formatFlexibleDateBr(dateStr);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expDay = new Date(expDate);
  expDay.setHours(0, 0, 0, 0);

  const diffTime = expDay.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: 'EXPIRED', label: 'Vencido', color: '#ef4444', days: diffDays, formattedDate };
  }
  if (diffDays === 0) {
    return { status: 'WARNING', label: 'Vence hoje!', color: '#f59e0b', days: diffDays, formattedDate };
  }
  if (diffDays <= 30) {
    return { status: 'WARNING', label: `Vence em ${diffDays}d`, color: '#f59e0b', days: diffDays, formattedDate };
  }
  if (diffDays <= 60) {
    return { status: 'EXPIRING_60', label: `Vence em ${diffDays}d`, color: '#fb923c', days: diffDays, formattedDate };
  }
  return { status: 'OK', label: `Válido (${diffDays}d)`, color: '#10b981', days: diffDays, formattedDate };
}
