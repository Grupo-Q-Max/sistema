import { useState, useEffect } from 'react';
import {
  X,
  Zap,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Building2,
  Copy,
  AlertTriangle,
  ExternalLink,
  Users,
  Sparkles,
  RotateCcw,
  Check,
} from 'lucide-react';
import { formatCompanyCode } from '../utils/codeSort';
import { formatCnpj, formatRegimeLabel, getCertificateStatus } from './CompanyDetailsModal';
import { resolveColumnKey } from '../config/payrollColumns';
import { ButtonSpinner } from './LoadingSkeleton';
import './PayrollFocusDrawer.css';

interface PayrollFocusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  columns: any[];
  onSaveColumn: (row: any, column: any, value: any) => Promise<void>;
  onOpenCompanyInfo: (company: any) => void;
  users: any[];
  onResponsibleChange: (row: any, userId: string) => Promise<void>;
  isRowEditable: (row: any) => boolean;
  currentUser?: any;
  monthLabel: string;
}

export function PayrollFocusDrawer({
  isOpen,
  onClose,
  rows,
  currentIndex,
  onSelectIndex,
  columns,
  onSaveColumn,
  onOpenCompanyInfo,
  users,
  onResponsibleChange,
  isRowEditable,
  monthLabel,
}: PayrollFocusDrawerProps) {
  const [activePendencyKey, setActivePendencyKey] = useState<string | null>(null);
  const [pendencyReasonDraft, setPendencyReasonDraft] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [copiedCnpj, setCopiedCnpj] = useState(false);

  const currentRow = rows[currentIndex] || null;
  const company = currentRow?.company || null;
  const editable = currentRow ? isRowEditable(currentRow) : false;

  const getTodayBr = () => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}/${m}/${y}`;
  };

  useEffect(() => {
    setActivePendencyKey(null);
    setPendencyReasonDraft('');
  }, [currentIndex]);

  // Teclas de atalho para navegação
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        if (e.key === 'Escape') {
          (document.activeElement as HTMLElement)?.blur();
        }
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'h') {
        e.preventDefault();
        if (currentIndex > 0) onSelectIndex(currentIndex - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        if (currentIndex < rows.length - 1) onSelectIndex(currentIndex + 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, rows.length, onSelectIndex, onClose]);

  if (!isOpen || !currentRow || !company) return null;

  const currentResponsible = company.responsibles?.find((r: any) => r.sector === 'DP') || null;

  const handleCopyCnpj = async () => {
    if (!company.cnpj) return;
    try {
      await navigator.clipboard.writeText(company.cnpj.replace(/\D/g, ''));
      setCopiedCnpj(true);
      setTimeout(() => setCopiedCnpj(false), 2000);
    } catch {
      // Ignora erro de clipboard
    }
  };

  const handleQuickStatus = async (col: any, statusType: 'OK' | 'SEM_MOV' | 'NA' | 'CLEAR') => {
    if (!editable) return;
    const key = resolveColumnKey(col) || col.id;
    setSavingKey(key);

    try {
      if (statusType === 'CLEAR') {
        await onSaveColumn(currentRow, col, '');
      } else if (statusType === 'OK') {
        const today = getTodayBr();
        await onSaveColumn(currentRow, col, {
          status: 'CONCLUIDO',
          label: today,
          completionDate: today,
          updatedAt: new Date().toISOString(),
        });
      } else if (statusType === 'SEM_MOV') {
        await onSaveColumn(currentRow, col, {
          status: 'OK - SEM MOVIMENTO',
          label: 'OK - S/ MOV',
          updatedAt: new Date().toISOString(),
        });
      } else if (statusType === 'NA') {
        await onSaveColumn(currentRow, col, {
          status: 'NAO_SE_APLICA',
          label: 'N/A',
          updatedAt: new Date().toISOString(),
        });
      }
    } finally {
      setSavingKey(null);
    }
  };

  const handleSavePendency = async (col: any) => {
    if (!editable) return;
    const key = resolveColumnKey(col) || col.id;
    setSavingKey(key);

    try {
      await onSaveColumn(currentRow, col, {
        status: 'PENDENTE',
        label: 'PENDENTE',
        pendingReason: pendencyReasonDraft.trim() || 'Pendência operacional no DP',
        updatedAt: new Date().toISOString(),
      });
      setActivePendencyKey(null);
      setPendencyReasonDraft('');
    } finally {
      setSavingKey(null);
    }
  };

  const certificate = company.hasClientCertificate
    ? getCertificateStatus(company.certificateExpiration)
    : null;

  // Filtragem de colunas operacionais do DP
  const dpColumns = columns.filter((c: any) => c.department === 'DP');

  // Cálculo de progresso da empresa
  const progressPercent = currentRow.progressPercent ?? 0;
  const statusLabel =
    currentRow.calculatedStatus === 'COMPLETED'
      ? 'Concluído'
      : currentRow.calculatedStatus === 'IN_PROGRESS'
      ? 'Em Andamento'
      : 'Pendente';

  const employeeCount = currentRow.columnsData?.dp_qtde_funcionarios ?? '—';

  return (
    <div className="dp-focus-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="dp-focus-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header do Drawer */}
        <div className="dp-focus-header">
          <div className="dp-focus-header-brand">
            <div className="dp-focus-badge">
              <Zap size={13} />
              <span>Modo Foco · Departamento Pessoal</span>
            </div>
            <span className="dp-focus-period">Competência {monthLabel}</span>
          </div>

          <div className="dp-focus-nav-group">
            <button
              type="button"
              className="dp-focus-nav-btn"
              disabled={currentIndex <= 0}
              onClick={() => onSelectIndex(currentIndex - 1)}
              title="Empresa anterior (Seta esquerda ou H)"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="dp-focus-nav-counter">
              <strong>{currentIndex + 1}</strong> de {rows.length}
            </span>
            <button
              type="button"
              className="dp-focus-nav-btn"
              disabled={currentIndex >= rows.length - 1}
              onClick={() => onSelectIndex(currentIndex + 1)}
              title="Próxima empresa (Seta direita ou L)"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="dp-focus-close-btn"
              onClick={onClose}
              title="Sair do Modo Foco (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corpo do Drawer com Scroll */}
        <div className="dp-focus-body">
          {/* Card Principal da Empresa */}
          <div className="dp-focus-company-card">
            <div className="dp-focus-company-top">
              <div className="dp-focus-code-tag">
                {formatCompanyCode(company.code) || 'S/ CÓD'}
              </div>
              <div className="dp-focus-company-titles">
                <h4>{company.name}</h4>
                {company.tradeName && <span className="dp-focus-trade">{company.tradeName}</span>}
              </div>
              <button
                type="button"
                className="dp-focus-details-btn"
                onClick={() => onOpenCompanyInfo(company)}
                title="Ver cadastro completo e senhas"
              >
                <Building2 size={14} />
                <span>Ver Dados</span>
                <ExternalLink size={11} />
              </button>
            </div>

            <div className="dp-focus-meta-grid">
              <div className="dp-focus-meta-item">
                <span className="dp-focus-meta-label">CNPJ</span>
                <button
                  type="button"
                  className="dp-focus-cnpj-btn"
                  onClick={handleCopyCnpj}
                  title="Clique para copiar CNPJ limpo"
                >
                  <span>{formatCnpj(company.cnpj)}</span>
                  {copiedCnpj ? <Check size={12} color="#4ade80" /> : <Copy size={12} />}
                </button>
              </div>

              <div className="dp-focus-meta-item">
                <span className="dp-focus-meta-label">Tributação</span>
                <span className="dp-focus-meta-value">{formatRegimeLabel(company.taxRegime)}</span>
              </div>

              <div className="dp-focus-meta-item">
                <span className="dp-focus-meta-label">Grupo</span>
                <span className="dp-focus-meta-value">{company.groupName || '—'}</span>
              </div>

              <div className="dp-focus-meta-item">
                <span className="dp-focus-meta-label">Funcionários</span>
                <span className="dp-focus-meta-value dp-focus-employees">
                  <Users size={12} />
                  <strong>{employeeCount}</strong>
                </span>
              </div>
            </div>

            {/* Certificado Digital */}
            {certificate && (
              <div className={`dp-focus-cert-banner ${certificate.status === 'EXPIRED' ? 'expired' : ''}`}>
                <AlertTriangle size={14} />
                <span>Certificado Cliente: {certificate.label}</span>
              </div>
            )}

            {/* Responsável DP */}
            <div className="dp-focus-resp-row">
              <label htmlFor="dp-resp-select">Responsável DP:</label>
              <select
                id="dp-resp-select"
                value={currentResponsible?.userId || ''}
                disabled={!editable}
                onChange={(e) => onResponsibleChange(currentRow, e.target.value)}
              >
                <option value="">Não atribuído</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Progresso Geral da Empresa */}
            <div className="dp-focus-progress-box">
              <div className="dp-focus-progress-header">
                <div className="dp-focus-status-chip">
                  {currentRow.calculatedStatus === 'COMPLETED' ? (
                    <CheckCircle2 size={13} color="#4ade80" />
                  ) : currentRow.calculatedStatus === 'IN_PROGRESS' ? (
                    <Clock size={13} color="#facc15" />
                  ) : (
                    <AlertCircle size={13} color="#94a3b8" />
                  )}
                  <span>{statusLabel}</span>
                </div>
                <span className="dp-focus-percent-text">{progressPercent}% concluído</span>
              </div>
              <div className="dp-focus-progress-bar">
                <div
                  className="dp-focus-progress-fill"
                  style={{
                    width: `${progressPercent}%`,
                    background:
                      progressPercent === 100
                        ? '#22c55e'
                        : progressPercent > 50
                        ? '#818cf8'
                        : '#eab308',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Lista Vertical de Obrigações do DP */}
          <div className="dp-focus-section-title">
            <Sparkles size={15} color="#818cf8" />
            <span>Obrigações e Campos do DP</span>
          </div>

          <div className="dp-focus-columns-list">
            {dpColumns.map((col: any) => {
              const key = resolveColumnKey(col) || col.id;
              const value = currentRow.columnsData[key];
              const isSaving = savingKey === key;
              const isPendencyOpen = activePendencyKey === key;

              // Identifica status do valor
              const isOk =
                typeof value === 'object' && value !== null && value.status === 'CONCLUIDO';
              const isSemMov =
                typeof value === 'object' && value !== null && value.status === 'OK - SEM MOVIMENTO';
              const isNA =
                typeof value === 'object' && value !== null && value.status === 'NAO_SE_APLICA';
              const isPendente =
                typeof value === 'object' && value !== null && value.status === 'PENDENTE';
              const isStringDate =
                typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value.trim());

              const displayLabel =
                typeof value === 'object' && value !== null
                  ? value.label || value.status
                  : typeof value === 'string'
                  ? value
                  : typeof value === 'number'
                  ? String(value)
                  : '';

              const pendencyReason =
                typeof value === 'object' && value !== null ? value.pendingReason : '';

              // Campo comum de entrada (ex: quantidade de funcionários ou observação direta)
              const isInputField = col.inputType === 'NUMBER' || col.inputType === 'TEXT';

              return (
                <div
                  key={key}
                  className={`dp-focus-col-card ${
                    isOk || isStringDate
                      ? 'status-ok'
                      : isSemMov
                      ? 'status-semmov'
                      : isPendente
                      ? 'status-pendente'
                      : isNA
                      ? 'status-na'
                      : ''
                  }`}
                >
                  <div className="dp-focus-col-header">
                    <div className="dp-focus-col-name-group">
                      <span className="dp-focus-col-name">{col.name}</span>
                      {col.description && (
                        <span className="dp-focus-col-desc">{col.description}</span>
                      )}
                    </div>

                    <div className="dp-focus-col-status-badge">
                      {isSaving ? (
                        <div className="dp-focus-col-saving">
                          <ButtonSpinner />
                          <span>Salvando...</span>
                        </div>
                      ) : displayLabel ? (
                        <span
                          className={`dp-col-badge ${
                            isOk || isStringDate
                              ? 'ok'
                              : isSemMov
                              ? 'sem-mov'
                              : isPendente
                              ? 'pendente'
                              : isNA
                              ? 'na'
                              : 'custom'
                          }`}
                        >
                          {displayLabel}
                        </span>
                      ) : (
                        <span className="dp-col-badge empty">Pendente</span>
                      )}
                    </div>
                  </div>

                  {/* Justificativa de pendência salva */}
                  {isPendente && pendencyReason && (
                    <div className="dp-focus-pendency-alert">
                      <AlertCircle size={13} />
                      <span>{pendencyReason}</span>
                    </div>
                  )}

                  {/* Ações do Campo */}
                  {isInputField ? (
                    <div className="dp-focus-input-row">
                      <input
                        type={col.inputType === 'NUMBER' ? 'number' : 'text'}
                        defaultValue={value ?? ''}
                        disabled={!editable || col.isEditable === false}
                        placeholder={`Preencher ${col.name.toLowerCase()}...`}
                        onBlur={(e) => {
                          const nextVal = e.target.value.trim();
                          if (nextVal !== String(value ?? '').trim()) {
                            void onSaveColumn(currentRow, col, col.inputType === 'NUMBER' ? (nextVal ? Number(nextVal) : null) : nextVal);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="dp-focus-action-buttons">
                      <button
                        type="button"
                        className={`dp-focus-btn ok ${isOk || isStringDate ? 'active' : ''}`}
                        title="Marcar como Concluído (Data de hoje)"
                        disabled={!editable || isSaving}
                        onClick={() => handleQuickStatus(col, 'OK')}
                      >
                        <CheckCircle2 size={13} />
                        <span>Concluído</span>
                      </button>

                      <button
                        type="button"
                        className={`dp-focus-btn sem-mov ${isSemMov ? 'active' : ''}`}
                        title="Marcar como OK - Sem Movimento"
                        disabled={!editable || isSaving}
                        onClick={() => handleQuickStatus(col, 'SEM_MOV')}
                      >
                        <span>S/ Movimento</span>
                      </button>

                      <button
                        type="button"
                        className={`dp-focus-btn na ${isNA ? 'active' : ''}`}
                        title="Marcar como Não se Aplica"
                        disabled={!editable || isSaving}
                        onClick={() => handleQuickStatus(col, 'NA')}
                      >
                        <span>N/A</span>
                      </button>

                      <button
                        type="button"
                        className={`dp-focus-btn pendente ${isPendente ? 'active' : ''}`}
                        title="Apontar pendência com motivo"
                        disabled={!editable || isSaving}
                        onClick={() => {
                          setActivePendencyKey(isPendencyOpen ? null : key);
                          setPendencyReasonDraft(pendencyReason || '');
                        }}
                      >
                        <Clock size={13} />
                        <span>Pendência</span>
                      </button>

                      {displayLabel && (
                        <button
                          type="button"
                          className="dp-focus-btn clear"
                          title="Limpar campo"
                          disabled={!editable || isSaving}
                          onClick={() => handleQuickStatus(col, 'CLEAR')}
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Drawer de Motivo da Pendência */}
                  {isPendencyOpen && (
                    <div className="dp-focus-pendency-form">
                      <label htmlFor={`pendency-${key}`}>Motivo da pendência no DP:</label>
                      <input
                        id={`pendency-${key}`}
                        type="text"
                        autoFocus
                        value={pendencyReasonDraft}
                        placeholder="Ex: Aguardando envio das variáveis da folha pelo cliente..."
                        onChange={(e) => setPendencyReasonDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleSavePendency(col);
                        }}
                      />
                      <div className="dp-focus-pendency-actions">
                        <button
                          type="button"
                          className="btn-secondary-light"
                          onClick={() => setActivePendencyKey(null)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => handleSavePendency(col)}
                        >
                          Salvar Pendência
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer do Drawer */}
        <div className="dp-focus-footer">
          <div className="dp-focus-footer-hint">
            <span>Dica: Use <strong>← / →</strong> para navegar entre empresas e <strong>Esc</strong> para sair.</span>
          </div>
          <button type="button" className="btn-secondary-light" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
