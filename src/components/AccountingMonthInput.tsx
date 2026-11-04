import { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { MONTH_OPTIONS } from '../config/accountingColumns';

export function parseMonthValue(val: any): { status: string; date: string } {
  if (!val) return { status: '', date: '' };
  if (typeof val === 'object' && val !== null) {
    return {
      status: val.status || val.value || '',
      date: val.date || val.completionDate || '',
    };
  }
  const str = String(val).trim();
  if (str.startsWith('COBRANÇA DOC.')) {
    const after = str.substring('COBRANÇA DOC.'.length).trim();
    const clean = after.replace(/^[-–—:]\s*/, '').replace(/^\(|\)$/g, '').trim();
    return { status: 'COBRANÇA DOC.', date: clean };
  }
  return { status: str, date: '' };
}

export function formatMonthValue(status: string, date?: string): string {
  if (status === 'COBRANÇA DOC.' && date && date.trim()) {
    return `COBRANÇA DOC. - ${date.trim()}`;
  }
  return status;
}

export function brToIsoDate(br: string): string {
  if (!br) return '';
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

export function isoToBrDate(iso: string): string {
  if (!iso) return '';
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function getTodayBr(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

interface Props {
  value: any;
  disabled?: boolean;
  onSave: (nextVal: any) => Promise<void>;
  ariaLabel?: string;
}

export function AccountingMonthInput({ value, disabled, onSave, ariaLabel }: Props) {
  const parsed = useMemo(() => parseMonthValue(value), [value]);
  const [selectedStatus, setSelectedStatus] = useState(parsed.status);
  const [dateDraft, setDateDraft] = useState(parsed.date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lastSavedVal = useRef<string>(typeof value === 'string' ? value : parsed.status);

  useEffect(() => {
    setSelectedStatus(parsed.status);
    setDateDraft(parsed.date);
    lastSavedVal.current = typeof value === 'string' ? value : formatMonthValue(parsed.status, parsed.date);
  }, [value, parsed.status, parsed.date]);

  async function handleStatusChange(newStatus: string) {
    setSelectedStatus(newStatus);
    const dateToUse = newStatus === 'COBRANÇA DOC.' ? (dateDraft || getTodayBr()) : '';
    if (newStatus === 'COBRANÇA DOC.' && !dateDraft) {
      setDateDraft(dateToUse);
    }
    const finalVal = formatMonthValue(newStatus, dateToUse);
    if (finalVal === lastSavedVal.current) return;
    lastSavedVal.current = finalVal;
    setSaving(true);
    setError('');
    try {
      await onSave(finalVal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDateBlur(targetDate: string) {
    const trimmed = targetDate.trim();
    if (selectedStatus !== 'COBRANÇA DOC.') return;
    const finalVal = formatMonthValue('COBRANÇA DOC.', trimmed);
    if (finalVal === lastSavedVal.current) return;
    lastSavedVal.current = finalVal;
    setSaving(true);
    setError('');
    try {
      await onSave(finalVal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar data');
    } finally {
      setSaving(false);
    }
  }

  const isCobranca = selectedStatus === 'COBRANÇA DOC.';

  return (
    <div className="accounting-month-input-cell notranslate">
      <div className="accounting-month-select-row">
        <select
          className={`accounting-month-dropdown ${
            selectedStatus === 'OK - FINALIZADO' ? 'done' :
            selectedStatus === 'SEM MOVIMENTO' ? 'no-movement' :
            selectedStatus === 'DOC. REDE' ? 'documents' :
            selectedStatus === 'COBRANÇA DOC.' ? 'collection' : 'pending'
          }`}
          value={selectedStatus}
          disabled={disabled || saving}
          aria-label={ariaLabel}
          onChange={e => void handleStatusChange(e.target.value)}
        >
          <option value="">Selecione...</option>
          {MONTH_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {isCobranca && (
        <div className="accounting-cobranca-date-panel">
          <div className="accounting-cobranca-controls">
            <span className="cobranca-date-label">Data cobrança:</span>
            <div className="cobranca-input-container">
              <input
                type="text"
                className="cobranca-date-text-input"
                value={dateDraft}
                placeholder="DD/MM/AAAA"
                disabled={disabled || saving}
                onChange={e => setDateDraft(e.target.value)}
                onBlur={e => void handleDateBlur(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                title="Digite a data que desejar (ex: 10/11/2026)"
              />
              <label className="cobranca-picker-label" title="Abrir calendário">
                <Calendar size={13} />
                <input
                  type="date"
                  className="cobranca-native-date-hidden"
                  value={brToIsoDate(dateDraft)}
                  disabled={disabled || saving}
                  onChange={e => {
                    if (e.target.value) {
                      const br = isoToBrDate(e.target.value);
                      setDateDraft(br);
                      void handleDateBlur(br);
                    }
                  }}
                />
              </label>
            </div>
            <button
              type="button"
              className="cobranca-quick-today-btn"
              disabled={disabled || saving}
              onClick={() => {
                const today = getTodayBr();
                setDateDraft(today);
                void handleDateBlur(today);
              }}
              title="Preencher com a data de hoje"
            >
              Hoje
            </button>
          </div>
        </div>
      )}

      {saving && <span className="accounting-input-hint saving">Salvando...</span>}
      {error && <span className="accounting-input-hint error" role="alert">{error}</span>}
    </div>
  );
}
