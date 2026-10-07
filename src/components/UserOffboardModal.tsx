import { useState, useEffect } from 'react';
import { UserX, Calendar, Building2, AlertTriangle, ArrowRight, X, Check, Users, RefreshCw } from 'lucide-react';
import { API } from '../api';
import type { CurrentUser } from '../types/auth';
import './UserOffboardModal.css';

interface UserOffboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: any | null;
  currentUser: CurrentUser | null;
  allUsers: any[];
  onSuccess: () => void;
}

export function UserOffboardModal({
  isOpen,
  onClose,
  targetUser,
  currentUser,
  allUsers,
  onSuccess,
}: UserOffboardModalProps) {
  const [leftAt, setLeftAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [exitReason, setExitReason] = useState('Não faz mais parte da empresa');
  const [transferMode, setTransferMode] = useState<'ALL' | 'MANUAL' | 'NONE'>('ALL');
  const [targetUserId, setTargetUserId] = useState('');
  const [manualReassignments, setManualReassignments] = useState<Record<string, string>>({});

  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Usuários ativos para onde as empresas podem ser transferidas (exceto o próprio)
  const candidateUsers = allUsers.filter(u => u.id !== targetUser?.id && u.active && !u.leftAt);

  useEffect(() => {
    if (isOpen && targetUser) {
      const initialDate = targetUser.leftAt
        ? new Date(targetUser.leftAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      setLeftAt(initialDate);
      setExitReason(targetUser.exitReason || 'Não faz mais parte da empresa');
      setTransferMode('ALL');
      setErrorMsg(null);

      // Preenche com o primeiro usuário disponível
      if (candidateUsers.length > 0) {
        setTargetUserId(candidateUsers[0].id);
      }

      fetchAssignments(targetUser.id);
    }
  }, [isOpen, targetUser]);

  const fetchAssignments = async (userId: string) => {
    setLoadingAssignments(true);
    try {
      const res = await fetch(`${API}/api/users/${userId}/assignments`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.responsibleAssignments) ? data.responsibleAssignments : [];
        setAssignments(list);

        // Inicializa o mapa manual com vazio ou primeiro candidato
        const initialMap: Record<string, string> = {};
        list.forEach((item: any) => {
          const key = `${item.companyId}_${item.sector || 'ALL'}`;
          initialMap[key] = '';
        });
        setManualReassignments(initialMap);
      }
    } catch (err) {
      console.error('Erro ao buscar atribuições:', err);
    } finally {
      setLoadingAssignments(false);
    }
  };

  if (!isOpen || !targetUser) return null;

  const isAlreadyOffboarded = Boolean(targetUser.leftAt);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!leftAt) {
      setErrorMsg('Informe a data de saída do colaborador.');
      return;
    }

    if (transferMode === 'ALL' && assignments.length > 0 && !targetUserId) {
      setErrorMsg('Selecione para qual colaborador deseja transferir as empresas.');
      return;
    }

    setSaving(true);

    try {
      const reassignmentsArray = assignments.map((item: any) => {
        const key = `${item.companyId}_${item.sector || 'ALL'}`;
        return {
          companyId: item.companyId,
          sector: item.sector,
          newUserId: manualReassignments[key] || null,
        };
      });

      const res = await fetch(`${API}/api/users/${targetUser.id}/offboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leftAt,
          exitReason,
          transferMode,
          targetUserId: transferMode === 'ALL' ? targetUserId : undefined,
          reassignments: transferMode === 'MANUAL' ? reassignmentsArray : undefined,
          actorRole: currentUser?.role || 'ADMIN',
          actorId: currentUser?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Erro ao processar desligamento.');
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro de conexão ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleRehire = async () => {
    if (!window.confirm(`Deseja reativar o colaborador ${targetUser.name || targetUser.email}? Ele voltará a ter acesso ativo ao sistema.`)) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API}/api/users/${targetUser.id}/rehire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: currentUser?.id }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="offboard-modal-overlay" onClick={onClose}>
      <div
        className="offboard-modal-card"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          className="offboard-modal-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={20} />
        </button>

        <div className="offboard-modal-header">
          <div className="offboard-modal-icon">
            <UserX size={24} />
          </div>
          <div>
            <h2>
              {isAlreadyOffboarded
                ? 'Gerenciar Desligamento / Transferência'
                : 'Não faz mais parte da empresa'}
            </h2>
            <p className="offboard-subtitle">
              Colaborador: <strong>{targetUser.name || targetUser.email}</strong> ({targetUser.email})
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="offboard-alert error" role="alert">
            <AlertTriangle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="offboard-modal-form">
          <div className="offboard-form-grid">
            <div className="offboard-form-group">
              <label htmlFor="offboard-left-at">
                <Calendar size={14} /> Data em que saiu da empresa:
              </label>
              <input
                id="offboard-left-at"
                type="date"
                value={leftAt}
                onChange={e => setLeftAt(e.target.value)}
                required
              />
            </div>

            <div className="offboard-form-group">
              <label htmlFor="offboard-reason">Motivo / Observação:</label>
              <input
                id="offboard-reason"
                type="text"
                placeholder="Ex: Não faz mais parte da empresa"
                value={exitReason}
                onChange={e => setExitReason(e.target.value)}
              />
            </div>
          </div>

          {/* Seção de Transferência de Empresas */}
          <div className="offboard-companies-section">
            <div className="offboard-section-title">
              <Building2 size={16} />
              <span>Empresas Vinculadas a este Colaborador</span>
              {loadingAssignments ? (
                <span className="badge-loading">Carregando...</span>
              ) : (
                <span className="badge-count">{assignments.length} empresa(s)</span>
              )}
            </div>

            {assignments.length > 0 ? (
              <>
                <p className="offboard-section-desc">
                  Este colaborador é responsável por <strong>{assignments.length}</strong> empresa(s).
                  Escolha como deseja transferir essas responsabilidades:
                </p>

                <div className="transfer-options">
                  <label className={`transfer-option-card ${transferMode === 'ALL' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="transferMode"
                      value="ALL"
                      checked={transferMode === 'ALL'}
                      onChange={() => setTransferMode('ALL')}
                    />
                    <div className="option-content">
                      <strong>Transferir todas para um colaborador (Recomendado)</strong>
                      <span>Manda todas as empresas vinculadas deste usuário para outro operador de uma só vez.</span>
                    </div>
                  </label>

                  <label className={`transfer-option-card ${transferMode === 'MANUAL' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="transferMode"
                      value="MANUAL"
                      checked={transferMode === 'MANUAL'}
                      onChange={() => setTransferMode('MANUAL')}
                    />
                    <div className="option-content">
                      <strong>Selecionar manual (empresa por empresa)</strong>
                      <span>Escolha individualmente quem assume cada empresa da lista.</span>
                    </div>
                  </label>

                  <label className={`transfer-option-card ${transferMode === 'NONE' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="transferMode"
                      value="NONE"
                      checked={transferMode === 'NONE'}
                      onChange={() => setTransferMode('NONE')}
                    />
                    <div className="option-content">
                      <strong>Deixar empresas sem responsável por enquanto</strong>
                      <span>Remove o vínculo do usuário desligado sem transferir para ninguém agora.</span>
                    </div>
                  </label>
                </div>

                {/* Bloco quando transferMode === 'ALL' */}
                {transferMode === 'ALL' && (
                  <div className="transfer-block-all">
                    <label>
                      <Users size={14} /> Selecione o novo colaborador responsável:
                    </label>
                    <select
                      value={targetUserId}
                      onChange={e => setTargetUserId(e.target.value)}
                      required
                    >
                      <option value="">Selecione um colaborador ativo...</option>
                      {candidateUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email} ({u.email} - {u.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Bloco quando transferMode === 'MANUAL' */}
                {transferMode === 'MANUAL' && (
                  <div className="transfer-block-manual">
                    <div className="manual-table-container">
                      <table className="manual-reassign-table">
                        <thead>
                          <tr>
                            <th>Empresa</th>
                            <th>Setor</th>
                            <th>Novo Responsável</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignments.map((item: any) => {
                            const key = `${item.companyId}_${item.sector || 'ALL'}`;
                            return (
                              <tr key={key}>
                                <td>
                                  <strong>{item.company?.name || 'Empresa'}</strong>
                                  <small>{item.company?.cnpj || '-'}</small>
                                </td>
                                <td>
                                  <span className="sector-tag">{item.sector || 'Geral'}</span>
                                </td>
                                <td>
                                  <select
                                    value={manualReassignments[key] || ''}
                                    onChange={e =>
                                      setManualReassignments({
                                        ...manualReassignments,
                                        [key]: e.target.value,
                                      })
                                    }
                                  >
                                    <option value="">(Deixar sem responsável)</option>
                                    {candidateUsers.map(u => (
                                      <option key={u.id} value={u.id}>
                                        {u.name || u.email}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="no-companies-box">
                <Check size={18} />
                <span>Este usuário não possui nenhuma empresa vinculada como responsável.</span>
              </div>
            )}
          </div>

          <div className="offboard-modal-actions">
            {isAlreadyOffboarded && (
              <button
                type="button"
                className="btn-rehire"
                onClick={handleRehire}
                disabled={saving}
                title="Reativar acesso do colaborador à empresa"
              >
                <RefreshCw size={15} /> Reativar Colaborador
              </button>
            )}

            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="btn-confirm-offboard"
              disabled={saving}
            >
              <ArrowRight size={16} />
              <span>
                {saving
                  ? 'Salvando...'
                  : assignments.length > 0
                  ? 'Confirmar Saída & Transferir Empresas'
                  : 'Confirmar que não faz mais parte'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
