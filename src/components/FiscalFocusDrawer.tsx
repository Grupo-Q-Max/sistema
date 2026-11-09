import { useState, useEffect } from 'react';
import { API } from '../api';
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
  Edit3,
  Sparkles,
  FileSpreadsheet,
  RotateCcw,
} from 'lucide-react';
import { formatCompanyCode } from '../utils/codeSort';
import { formatCnpj, formatRegimeLabel, getCertificateStatus } from './CompanyDetailsModal';
import { getColumnDeadlineDay, getDeadlineDate, getDeadlineUrgency } from '../config/legalDeadlines';
import { effectivePopup } from '../config/fiscalPopups';
import { isFiscalObligationNA } from '../config/fiscalRegimeRules';
import './FiscalFocusDrawer.css';

interface FiscalFocusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  popupColumns: any[];
  onSaveColumn: (closingId: string, colKey: string, payload: any) => Promise<void>;
  onOpenObligationModal: (row: any, colKey: string) => void;
  onOpenCompanyInfo: (row: any) => void;
  fiscalUsers: any[];
  onResponsibleChange: (companyId: string, userId: string) => Promise<void>;
  isRowEditable: (row: any) => boolean;
  currentUser?: any;
  selectedYear: number;
  selectedMonth: number;
  monthLabel: string;
}

export function FiscalFocusDrawer({
  isOpen,
  onClose,
  rows,
  currentIndex,
  onSelectIndex,
  popupColumns,
  onSaveColumn,
  onOpenObligationModal,
  onOpenCompanyInfo,
  fiscalUsers,
  onResponsibleChange,
  isRowEditable,
  currentUser,
  selectedYear,
  selectedMonth,
  monthLabel,
}: FiscalFocusDrawerProps) {
  const [activePendencyKey, setActivePendencyKey] = useState<string | null>(null);
  const [pendencyReasonDraft, setPendencyReasonDraft] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSuccess, setNotesSuccess] = useState(false);
  const [copiedCnpj, setCopiedCnpj] = useState(false);

  const currentRow = rows[currentIndex] || null;
  const company = currentRow?.company || null;
  const editable = currentRow ? isRowEditable(currentRow) : false;

  useEffect(() => {
    if (company) {
      setNotesDraft(company.notes || '');
      setActivePendencyKey(null);
      setPendencyReasonDraft('');
      setNotesSuccess(false);
    }
  }, [company?.id]);

  // Navegação por teclado: Alt+Seta ou Seta Esquerda/Direita quando não estiver digitando
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Se o foco estiver num input ou textarea, não intercepta as setas
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      if (e.key === 'ArrowRight' && (e.altKey || !isInput)) {
        if (currentIndex < rows.length - 1) {
          e.preventDefault();
          onSelectIndex(currentIndex + 1);
        }
      } else if (e.key === 'ArrowLeft' && (e.altKey || !isInput)) {
        if (currentIndex > 0) {
          e.preventDefault();
          onSelectIndex(currentIndex - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, rows.length, onClose, onSelectIndex]);

  if (!isOpen || !currentRow || !company) return null;

  const certInfo = company.hasClientCertificate
    ? getCertificateStatus(company.certificateExpiration)
    : null;

  const fiscalResp = company.responsibles?.find(
    (r: any) => r.sector === 'FISCAL' || r.sector === null
  );
  const currentRespId = fiscalResp?.userId || fiscalResp?.user?.id || '';

  const handleCopyCnpj = async () => {
    if (!company.cnpj) return;
    try {
      await navigator.clipboard.writeText(company.cnpj.replace(/\D/g, ''));
      setCopiedCnpj(true);
      setTimeout(() => setCopiedCnpj(false), 2000);
    } catch {}
  };

  const handleQuickAction = async (colKey: string, actionType: 'OK_HOJE' | 'SEM_MOV' | 'NA' | 'LIMPAR' | 'PENDENCIA') => {
    if (!editable) return;
    setSavingKey(colKey);
    try {
      if (actionType === 'OK_HOJE') {
        const todayBr = new Date().toLocaleDateString('pt-BR');
        await onSaveColumn(currentRow.closingId, colKey, {
          status: 'CONCLUIDO',
          label: todayBr,
          completionDate: todayBr,
          updatedAt: new Date().toISOString(),
        });
      } else if (actionType === 'SEM_MOV') {
        await onSaveColumn(currentRow.closingId, colKey, {
          status: 'OK - SEM MOVIMENTO',
          label: 'OK - S/ MOV',
          updatedAt: new Date().toISOString(),
        });
      } else if (actionType === 'NA') {
        await onSaveColumn(currentRow.closingId, colKey, {
          status: 'N/A',
          label: 'N/A',
          updatedAt: new Date().toISOString(),
        });
      } else if (actionType === 'LIMPAR') {
        await onSaveColumn(currentRow.closingId, colKey, null);
      } else if (actionType === 'PENDENCIA') {
        const reason = pendencyReasonDraft.trim() || 'Pendência informada';
        await onSaveColumn(currentRow.closingId, colKey, {
          status: 'PENDENCIA',
          label: 'PENDÊNCIA',
          pendingReason: reason,
          updatedAt: new Date().toISOString(),
        });
        setActivePendencyKey(null);
        setPendencyReasonDraft('');
      }
    } finally {
      setSavingKey(null);
    }
  };

  const handleInsertStamp = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const author = currentUser?.name || currentUser?.email || 'Usuário';
    const stamp = `[${day}/${month} ${hours}:${minutes} - ${author}]: `;
    setNotesDraft(prev => prev ? `${stamp}\n${prev}` : stamp);
    setNotesSuccess(false);
  };

  const handleSaveNotes = async () => {
    if (!editable) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`${API}/api/companies/${company.id}/notes`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || '',
        },
        body: JSON.stringify({ notes: notesDraft, notesScope: 'FISCAL' }),
      });
      if (res.ok) {
        setNotesSuccess(true);
        setTimeout(() => setNotesSuccess(false), 3000);
      }
    } finally {
      setSavingNotes(false);
    }
  };

  const progress = currentRow.progressPercent || 0;

  return (
    <div className="focus-drawer-overlay" onClick={onClose}>
      <aside className="focus-drawer" onClick={e => e.stopPropagation()}>
        {/* Topo / Barra de Navegação */}
        <div className="focus-drawer-header">
          <div className="focus-header-brand">
            <div className="focus-brand-badge">
              <Zap size={15} />
              <span>Modo Foco · Fiscal</span>
            </div>
            <div className="focus-counter">
              Empresa <strong>{currentIndex + 1}</strong> de <strong>{rows.length}</strong>
            </div>
          </div>

          <div className="focus-nav-controls">
            <button
              type="button"
              className="focus-nav-btn"
              disabled={currentIndex <= 0}
              onClick={() => onSelectIndex(currentIndex - 1)}
              title="Empresa anterior (Alt + Seta Esquerda)"
            >
              <ChevronLeft size={18} />
              <span>Anterior</span>
            </button>
            <button
              type="button"
              className="focus-nav-btn highlight"
              disabled={currentIndex >= rows.length - 1}
              onClick={() => onSelectIndex(currentIndex + 1)}
              title="Próxima empresa (Alt + Seta Direita)"
            >
              <span>Próxima</span>
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              className="focus-close-btn"
              onClick={onClose}
              title="Fechar Modo Foco (ESC)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Conteúdo rolável */}
        <div className="focus-drawer-scroll">
          {/* Card de Informações da Empresa */}
          <div className="focus-company-card">
            <div className="focus-company-top">
              <div className="focus-code-badge">
                {formatCompanyCode(company.code) || '—'}
              </div>
              <div className="focus-company-title">
                <h3>{company.name}</h3>
                {company.tradeName && <span>{company.tradeName}</span>}
              </div>
              <button
                type="button"
                className="focus-details-btn"
                onClick={() => onOpenCompanyInfo(currentRow)}
                title="Ver dados cadastrais completos e senhas"
              >
                <Building2 size={14} />
                <span>Ver Dados</span>
                <ExternalLink size={11} />
              </button>
            </div>

            <div className="focus-meta-grid">
              <div className="focus-meta-item">
                <label>CNPJ</label>
                <button
                  type="button"
                  className="focus-copy-cnpj"
                  onClick={handleCopyCnpj}
                  title="Copiar CNPJ limpo"
                >
                  <span>{formatCnpj(company.cnpj)}</span>
                  <Copy size={12} />
                  {copiedCnpj && <small>Copiado!</small>}
                </button>
              </div>

              <div className="focus-meta-item">
                <label>Tributação</label>
                <span className="focus-regime-tag">
                  {formatRegimeLabel(company.taxRegime)}
                </span>
              </div>

              <div className="focus-meta-item">
                <label>Responsável</label>
                <select
                  className="focus-select"
                  value={currentRespId}
                  disabled={!editable}
                  onChange={e => onResponsibleChange(company.id, e.target.value)}
                >
                  <option value="">Não atribuído</option>
                  {fiscalUsers.map(u => (
                    <option key={u.id} value={u.id} disabled={u.active === false}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>

              {certInfo && (
                <div className="focus-meta-item">
                  <label>Certificado Digital</label>
                  <div
                    className={`focus-cert-badge ${certInfo.status === 'EXPIRED' ? 'expired' : certInfo.status === 'WARNING' ? 'warning' : 'ok'}`}
                    onClick={() => onOpenCompanyInfo(currentRow)}
                    style={{ cursor: 'pointer' }}
                  >
                    <AlertTriangle size={12} />
                    <span>{certInfo.label} ({company.certificateExpiration})</span>
                  </div>
                </div>
              )}
            </div>

            {/* Barra de Progresso da Empresa */}
            <div className="focus-progress-wrap">
              <div className="focus-progress-labels">
                <span>Progresso nesta competência ({monthLabel})</span>
                <strong>{progress}%</strong>
              </div>
              <div className="focus-progress-track">
                <div
                  className="focus-progress-fill"
                  style={{
                    width: `${progress}%`,
                    background:
                      progress === 100
                        ? 'linear-gradient(90deg, #10b981, #059669)'
                        : 'linear-gradient(90deg, #818cf8, #d90f81)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Seção das Obrigações (Checklist Vertical) */}
          <div className="focus-section-title">
            <FileSpreadsheet size={16} />
            <span>Obrigações Fiscais</span>
            <small>({popupColumns.length} obrigações)</small>
          </div>

          <div className="focus-obligations-list">
            {popupColumns.map(col => {
              const val = currentRow.columnsData?.[col.columnKey];
              const st = val?.status || (val ? 'CONCLUIDO' : 'PENDENTE');
              const isNA = isFiscalObligationNA(company.taxRegime, col.columnKey);
              const isSaving = savingKey === col.columnKey;
              const hasFormFields = Boolean(effectivePopup(col, col.columnKey)?.fields?.length);

              const isCompleted = Boolean(val && (st === 'CONCLUIDO' || st.includes('OK - DATA') || st.includes('OK')));
              const deadlineDay = getColumnDeadlineDay(col);
              const competenceDate = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1));
              const deadlineDate = deadlineDay
                ? getDeadlineDate(deadlineDay, competenceDate)
                : null;
              const urgency = deadlineDate ? getDeadlineUrgency(deadlineDate, isCompleted, isNA) : null;

              let statusClass = 'pending';
              let statusLabel = 'Pendente';

              if (isNA && !val) {
                statusClass = 'na';
                statusLabel = 'N/A (Dispensado)';
              } else if (val) {
                if (st === 'CONCLUIDO' || st.includes('OK - DATA') || st.includes('OK')) {
                  statusClass = 'completed';
                  statusLabel = val.label || val.completionDate || 'Concluído';
                } else if (st === 'OK - SEM MOVIMENTO' || st.includes('SEM MOV')) {
                  statusClass = 'no-movement';
                  statusLabel = 'OK - Sem Movimento';
                } else if (st === 'PENDENCIA') {
                  statusClass = 'issue';
                  statusLabel = `Pendência: ${val.pendingReason || 'Informada'}`;
                } else if (st === 'N/A') {
                  statusClass = 'na';
                  statusLabel = 'N/A';
                }
              }

              return (
                <div key={col.columnKey} className={`focus-ob-card ${statusClass}`}>
                  <div className="focus-ob-header">
                    <div className="focus-ob-name">
                      <h4>{col.name}</h4>
                      {deadlineDay && (
                        <span className={`focus-deadline-tag ${urgency ? urgency.type.toLowerCase() : 'normal'}`}>
                          <Clock size={11} />
                          Dia {deadlineDay} ({deadlineDate?.toLocaleDateString('pt-BR', { timeZone: 'UTC' })})
                        </span>
                      )}
                    </div>
                    <span className={`focus-status-badge ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Ações Rápidas */}
                  <div className="focus-ob-actions">
                    <button
                      type="button"
                      className="focus-action-btn ok"
                      disabled={!editable || isSaving}
                      onClick={() => handleQuickAction(col.columnKey, 'OK_HOJE')}
                      title="Concluir com a data de hoje"
                    >
                      <CheckCircle2 size={14} />
                      <span>OK (Hoje)</span>
                    </button>

                    <button
                      type="button"
                      className="focus-action-btn sem-mov"
                      disabled={!editable || isSaving}
                      onClick={() => handleQuickAction(col.columnKey, 'SEM_MOV')}
                      title="Marcar como Sem Movimento"
                    >
                      <span>Sem Mov.</span>
                    </button>

                    <button
                      type="button"
                      className="focus-action-btn pendencia"
                      disabled={!editable || isSaving}
                      onClick={() => {
                        setActivePendencyKey(
                          activePendencyKey === col.columnKey ? null : col.columnKey
                        );
                        setPendencyReasonDraft(val?.pendingReason || '');
                      }}
                      title="Registrar motivo de pendência"
                    >
                      <AlertCircle size={14} />
                      <span>Pendência</span>
                    </button>

                    <button
                      type="button"
                      className="focus-action-btn na"
                      disabled={!editable || isSaving}
                      onClick={() => handleQuickAction(col.columnKey, 'NA')}
                      title="Marcar como N/A"
                    >
                      <span>N/A</span>
                    </button>

                    {hasFormFields && (
                      <button
                        type="button"
                        className="focus-action-btn details"
                        disabled={!editable}
                        onClick={() => onOpenObligationModal(currentRow, col.columnKey)}
                        title="Abrir formulário com campos adicionais"
                      >
                        <Edit3 size={13} />
                        <span>Formulário</span>
                      </button>
                    )}

                    {val && (
                      <button
                        type="button"
                        className="focus-action-btn clear"
                        disabled={!editable || isSaving}
                        onClick={() => handleQuickAction(col.columnKey, 'LIMPAR')}
                        title="Limpar e voltar para pendente"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>

                  {/* Caixa de Digitação da Pendência Inline */}
                  {activePendencyKey === col.columnKey && (
                    <div className="focus-pendency-box">
                      <label>Descreva a pendência:</label>
                      <input
                        type="text"
                        placeholder="Ex: Aguardando extrato bancário ou notas fiscais..."
                        value={pendencyReasonDraft}
                        onChange={e => setPendencyReasonDraft(e.target.value)}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleQuickAction(col.columnKey, 'PENDENCIA');
                          }
                        }}
                      />
                      <div className="focus-pendency-actions">
                        <button
                          type="button"
                          className="btn-cancel"
                          onClick={() => setActivePendencyKey(null)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn-confirm"
                          onClick={() => handleQuickAction(col.columnKey, 'PENDENCIA')}
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

          {/* Observações da Empresa */}
          <div className="focus-section-title" style={{ marginTop: '24px' }}>
            <Edit3 size={16} />
            <span>Observações do Fiscal</span>
          </div>

          <div className="focus-notes-card">
            <div className="focus-notes-header">
              <button
                type="button"
                className="focus-stamp-btn"
                disabled={!editable}
                onClick={handleInsertStamp}
                title="Inserir data, hora e seu nome nas observações"
              >
                <Sparkles size={14} />
                <span>+ Inserir Data e Autor</span>
              </button>
              {notesSuccess && <span className="focus-success-toast">Salvo com sucesso!</span>}
            </div>
            <textarea
              rows={4}
              value={notesDraft}
              disabled={!editable || savingNotes}
              onChange={e => setNotesDraft(e.target.value)}
              placeholder="Digite anotações ou lembretes sobre esta empresa..."
            />
            {editable && (
              <button
                type="button"
                className="focus-save-notes-btn"
                disabled={savingNotes}
                onClick={handleSaveNotes}
              >
                {savingNotes ? 'Salvando...' : 'Salvar Observações'}
              </button>
            )}
          </div>
        </div>

        {/* Rodapé Fixo */}
        <div className="focus-drawer-footer">
          <div className="focus-footer-hint">
            <span>Dica: Use <strong>Alt + ➔</strong> para avançar para a próxima empresa.</span>
          </div>
          <button
            type="button"
            className="focus-btn-next-company"
            disabled={currentIndex >= rows.length - 1}
            onClick={() => onSelectIndex(currentIndex + 1)}
          >
            <span>Próxima Empresa</span>
            <ChevronRight size={18} />
          </button>
        </div>
      </aside>
    </div>
  );
}
