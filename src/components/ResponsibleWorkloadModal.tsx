import { useState, useMemo } from 'react';
import { X, BarChart3, Filter, ArrowRightLeft, CheckCircle2 } from 'lucide-react';
import { TransferResponsibleModal } from './TransferResponsibleModal';
import type { CurrentUser } from '../types/auth';
import './ResponsibleWorkloadModal.css';

export interface ResponsibleWorkloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  users: any[];
  sector: 'CONTABIL' | 'DP' | 'FISCAL';
  onSelectResponsible?: (userId: string) => void;
  onReload?: () => void;
  currentUser?: CurrentUser | null;
}

export function ResponsibleWorkloadModal({
  isOpen,
  onClose,
  rows,
  users,
  sector,
  onSelectResponsible,
  onReload,
  currentUser,
}: ResponsibleWorkloadModalProps) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFromId, setTransferFromId] = useState('');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const sectorLabel = sector === 'CONTABIL' ? 'Contábil' : sector === 'DP' ? 'Departamento Pessoal' : 'Fiscal';

  const getResponsible = (company: any) => {
    return company.responsibles?.find((r: any) => r.sector === sector) || null;
  };

  const workloadData = useMemo(() => {
    const userMap = new Map<string, { user: any; total: number; completed: number; inProgress: number; pending: number }>();

    // Inicializa com usuários conhecidos
    for (const u of users) {
      userMap.set(u.id, {
        user: u,
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
      });
    }

    let unassigned = {
      user: { id: '__UNASSIGNED__', name: 'Não atribuído', email: '' },
      total: 0,
      completed: 0,
      inProgress: 0,
      pending: 0,
    };

    for (const r of rows) {
      const resp = getResponsible(r.company);
      const respId = resp?.userId || resp?.user?.id;
      const status = r.calculatedStatus;

      let entry = respId ? userMap.get(respId) : null;
      if (!entry && respId && resp?.user) {
        entry = {
          user: resp.user,
          total: 0,
          completed: 0,
          inProgress: 0,
          pending: 0,
        };
        userMap.set(respId, entry);
      }

      const target = entry || unassigned;
      target.total += 1;
      if (status === 'COMPLETED') target.completed += 1;
      else if (status === 'IN_PROGRESS') target.inProgress += 1;
      else target.pending += 1;
    }

    const list = Array.from(userMap.values())
      .filter(item => item.total > 0)
      .sort((a, b) => b.total - a.total);

    if (unassigned.total > 0) {
      list.push(unassigned);
    }

    return list;
  }, [rows, users, sector]);

  const totalAssignedCompanies = workloadData.reduce((acc, curr) => acc + curr.total, 0);

  const handleOpenTransfer = (userId?: string) => {
    setTransferFromId(userId || '');
    setTransferOpen(true);
  };

  const handleTransferSuccess = (count: number, fromName: string, toName: string, secLabel: string) => {
    setSuccessToast(`${count} empresas transferidas com sucesso de ${fromName} para ${toName} no ${secLabel}!`);
    setTimeout(() => setSuccessToast(null), 5000);
    onReload?.();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="workload-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
        <div className="workload-modal-container" onClick={e => e.stopPropagation()}>
          <div className="workload-modal-header">
            <div className="workload-title-group">
              <div className="workload-icon-box">
                <BarChart3 size={20} />
              </div>
              <div>
                <h3>Carga de Trabalho por Responsável</h3>
                <p className="workload-subtitle">
                  Setor <strong>{sectorLabel}</strong> · <strong>{totalAssignedCompanies}</strong> empresas distribuídas
                </p>
              </div>
            </div>
            <div className="workload-header-actions">
              <button
                type="button"
                className="workload-open-transfer-btn"
                title="Transferir empresas de um colaborador para outro"
                onClick={() => handleOpenTransfer()}
              >
                <ArrowRightLeft size={15} />
                <span>Transferir Carteira</span>
              </button>
              <button type="button" className="workload-close-btn" onClick={onClose} aria-label="Fechar modal">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="workload-modal-body">
            <table className="workload-table">
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th style={{ textAlign: 'center' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Concluídos</th>
                  <th style={{ textAlign: 'center' }}>Em Andamento</th>
                  <th style={{ textAlign: 'center' }}>Pendentes</th>
                  <th style={{ minWidth: 140 }}>Progresso</th>
                  <th style={{ textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {workloadData.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      Nenhuma empresa encontrada com responsável definido.
                    </td>
                  </tr>
                ) : (
                  workloadData.map(item => {
                    const percent = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
                    const isUnassigned = item.user.id === '__UNASSIGNED__';
                    return (
                      <tr key={item.user.id} className={isUnassigned ? 'workload-row-unassigned' : ''}>
                        <td>
                          <div className="workload-user-cell">
                            <span className="workload-user-name">{item.user.name || item.user.email}</span>
                            {item.user.email && item.user.name && (
                              <span className="workload-user-email">{item.user.email}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.total}</td>
                        <td style={{ textAlign: 'center', color: '#4ade80', fontWeight: 600 }}>{item.completed}</td>
                        <td style={{ textAlign: 'center', color: '#facc15', fontWeight: 600 }}>{item.inProgress}</td>
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>{item.pending}</td>
                        <td>
                          <div className="workload-progress-cell">
                            <div className="workload-progress-bar">
                              <div
                                className="workload-progress-fill"
                                style={{
                                  width: `${percent}%`,
                                  background: percent === 100 ? '#22c55e' : percent > 50 ? '#818cf8' : '#eab308'
                                }}
                              />
                            </div>
                            <span className="workload-progress-percent">{percent}%</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="workload-action-group">
                            {onSelectResponsible && (
                              <button
                                type="button"
                                className="workload-filter-btn"
                                title={`Filtrar tabela apenas para ${item.user.name || item.user.email}`}
                                onClick={() => {
                                  onSelectResponsible(isUnassigned ? '' : item.user.id);
                                  onClose();
                                }}
                              >
                                <Filter size={12} />
                                <span>Filtrar</span>
                              </button>
                            )}
                            {!isUnassigned && item.total > 0 && (
                              <button
                                type="button"
                                className="workload-transfer-btn"
                                title={`Transferir carteira de ${item.user.name || item.user.email}`}
                                onClick={() => handleOpenTransfer(item.user.id)}
                              >
                                <ArrowRightLeft size={12} />
                                <span>Transferir</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="workload-modal-footer">
            <div>
              {successToast && (
                <div className="workload-success-toast">
                  <CheckCircle2 size={15} />
                  <span>{successToast}</span>
                </div>
              )}
            </div>
            <button type="button" className="btn-secondary-light" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>

      <TransferResponsibleModal
        isOpen={transferOpen}
        onClose={() => setTransferOpen(false)}
        users={users}
        initialFromUserId={transferFromId}
        initialSector={sector}
        onSuccess={handleTransferSuccess}
        currentUser={currentUser}
      />
    </>
  );
}
