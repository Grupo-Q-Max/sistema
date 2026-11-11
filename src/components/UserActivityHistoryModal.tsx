import { useState, useEffect } from 'react';
import { Users, X, Search } from 'lucide-react';
import { API } from '../api';
import './UserActivityHistoryModal.css';

interface UserActivityHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserActivityHistoryModal({ isOpen, onClose }: UserActivityHistoryModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API}/api/users/activity-history`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao carregar atividade dos usuários:', err);
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredUsers = (data?.users || []).filter((u: any) =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="user-activity-overlay" onClick={onClose}>
      <div className="user-activity-card" onClick={e => e.stopPropagation()}>
        <div className="user-activity-header">
          <div className="user-activity-title-group">
            <Users className="user-activity-icon" />
            <div>
              <h2 className="user-activity-title">Painel de Presença & Produtividade da Equipe</h2>
              <div className="user-activity-subtitle">
                Monitoramento de status online, horas ativas e histórico de fechamentos por operador
              </div>
            </div>
          </div>
          <button className="user-activity-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="user-activity-content">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              Carregando status e auditoria da equipe...
            </div>
          ) : data ? (
            <>
              <div className="user-activity-metrics">
                <div className="user-activity-stat">
                  <span className="user-activity-stat-label">Colaboradores Online</span>
                  <span className="user-activity-stat-val" style={{ color: '#10b981' }}>
                    {data.onlineCount} <span style={{ fontSize: '0.875rem', color: '#94a3b8', fontWeight: 500 }}>/ {data.totalUsers}</span>
                  </span>
                </div>
                <div className="user-activity-stat">
                  <span className="user-activity-stat-label">Ações / Baixas Hoje</span>
                  <span className="user-activity-stat-val" style={{ color: '#38bdf8' }}>
                    {data.totalActionsToday}
                  </span>
                </div>
                <div className="user-activity-stat">
                  <span className="user-activity-stat-label">Maior Produtor do Mês</span>
                  <span className="user-activity-stat-val" style={{ color: '#f59e0b', fontSize: '1.25rem' }}>
                    {data.users?.[0]?.name || 'N/A'}
                  </span>
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="Buscar colaborador por nome ou email..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '0.6rem 1rem 0.6rem 2.25rem',
                    color: '#f8fafc',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div className="user-activity-grid">
                {filteredUsers.map((u: any) => (
                  <div
                    key={u.id}
                    className="user-card"
                    style={{ cursor: 'pointer', border: selectedUser?.id === u.id ? '1px solid #38bdf8' : undefined }}
                    onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}
                  >
                    <div className="user-card-header">
                      <div className="user-card-name-group">
                        <span className={`user-status-dot ${u.isOnline ? 'online' : 'offline'}`} />
                        <span className="user-card-name">{u.name}</span>
                      </div>
                      <span className="user-card-role">{u.role}</span>
                    </div>

                    <div className="user-card-stats">
                      <div className="user-card-stat-item">
                        <span>Hoje (Ações)</span>
                        <span style={{ color: '#38bdf8' }}>{u.todayActionsCount}</span>
                      </div>
                      <div className="user-card-stat-item">
                        <span>Tempo Ativo Hoje</span>
                        <span style={{ color: '#10b981' }}>{u.activeHoursToday}h</span>
                      </div>
                      <div className="user-card-stat-item">
                        <span>Mês Atual</span>
                        <span style={{ color: '#e2e8f0' }}>{u.closuresMonth}</span>
                      </div>
                      <div className="user-card-stat-item">
                        <span>Total Histórico</span>
                        <span style={{ color: '#f59e0b' }}>{u.lifetimeClosures}</span>
                      </div>
                    </div>

                    <div className="user-card-footer">
                      <span>{u.isOnline ? '🟢 Ativo agora' : u.lastActionAt ? `Última ação: ${new Date(u.lastActionAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Sem registros'}</span>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>{u.recentActions?.length || 0} logs</span>
                    </div>
                  </div>
                ))}
              </div>

              {selectedUser && (
                <div style={{ background: '#1e293b', border: '1px solid #38bdf8', borderRadius: '12px', padding: '1rem' }}>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#38bdf8', margin: '0 0 0.5rem 0' }}>
                    Últimas Ações de {selectedUser.name}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '180px', overflowY: 'auto' }}>
                    {selectedUser.recentActions?.map((act: any) => (
                      <div key={act.id} style={{ fontSize: '0.75rem', color: '#cbd5e1', padding: '0.35rem', background: '#0f172a', borderRadius: '6px' }}>
                        <span style={{ color: '#94a3b8', marginRight: '0.5rem' }}>
                          {new Date(act.createdAt).toLocaleString('pt-BR')}
                        </span>
                        <strong style={{ color: '#38bdf8' }}>{act.action}</strong>
                        {act.details?.companyName && ` — Empresa: ${act.details.companyName}`}
                        {act.details?.columnKey && ` (${act.details.columnKey})`}
                      </div>
                    ))}
                    {(!selectedUser.recentActions || selectedUser.recentActions.length === 0) && (
                      <div style={{ color: '#64748b', fontSize: '0.8125rem' }}>Nenhum log recente deste colaborador.</div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: '#ef4444', textAlign: 'center' }}>Erro ao carregar dados.</div>
          )}
        </div>
      </div>
    </div>
  );
}
