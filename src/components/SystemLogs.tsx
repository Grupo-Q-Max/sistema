import { useState, useEffect, useMemo } from 'react';
import { API } from '../api';
import {
  Activity,
  Search,
  Filter,
  RotateCw,
  LogIn,
  LogOut,
  ShieldAlert,
  KeyRound,
  FileCheck,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Globe,
  UserX,
  UserCheck,
} from 'lucide-react';
import './SystemLogs.css';

interface SystemLog {
  id: string;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  details?: any;
  ipAddress?: string | null;
  createdAt: string;
}

export function SystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('TODOS');
  const [actionFilter, setActionFilter] = useState<string>('TODAS');
  const [entityFilter, setEntityFilter] = useState<string>('TODAS');
  const [userFilter, setUserFilter] = useState<string>('TODOS');
  const [periodFilter, setPeriodFilter] = useState<string>('TODOS');

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal de Detalhes
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(`${API}/api/logs?limit=2500`);
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Erro ao buscar logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Extrai lista única de ações, entidades e usuários
  const distinctActions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => { if (l.action) set.add(l.action); });
    return Array.from(set).sort();
  }, [logs]);

  const distinctEntities = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => { if (l.entity) set.add(l.entity); });
    return Array.from(set).sort();
  }, [logs]);

  const distinctUsers = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach(l => {
      const name = l.userName || l.userEmail || 'Desconhecido';
      if (l.userEmail) map.set(l.userEmail, name);
    });
    return Array.from(map.entries()).map(([email, name]) => ({ email, name }));
  }, [logs]);

  // Contadores para os Cards de Métricas
  const stats = useMemo(() => {
    const total = logs.length;
    let logins = 0;
    let loginFailures = 0;
    let passwordChanges = 0;
    let obligationUpdates = 0;

    logs.forEach(log => {
      if (log.action === 'LOGIN') logins++;
      else if (log.action === 'LOGIN_FALHA') loginFailures++;
      else if (log.action === 'ALTEROU_SENHA') passwordChanges++;
      else if (log.action === 'ATUALIZOU_OBRIGACAO' || log.action === 'OBRIGACAO_CONCLUIDA') {
        obligationUpdates++;
      }
    });

    return { total, logins, loginFailures, passwordChanges, obligationUpdates };
  }, [logs]);

  // Aplicação dos Filtros
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = todayStart - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = todayStart - 30 * 24 * 60 * 60 * 1000;

    return logs.filter(log => {
      // 1. Busca textual
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase();
        const inUser = (log.userName && log.userName.toLowerCase().includes(s)) || false;
        const inEmail = (log.userEmail && log.userEmail.toLowerCase().includes(s)) || false;
        const inAction = (log.action && log.action.toLowerCase().includes(s)) || false;
        const inEntity = (log.entity && log.entity.toLowerCase().includes(s)) || false;
        const inIp = (log.ipAddress && log.ipAddress.toLowerCase().includes(s)) || false;
        let inDetails = false;
        if (log.details) {
          try {
            inDetails = JSON.stringify(log.details).toLowerCase().includes(s);
          } catch {
            inDetails = false;
          }
        }
        if (!inUser && !inEmail && !inAction && !inEntity && !inIp && !inDetails) {
          return false;
        }
      }

      // 2. Categoria
      if (categoryFilter !== 'TODOS') {
        if (categoryFilter === 'ACESSOS') {
          if (!['LOGIN', 'LOGIN_FALHA', 'LOGOUT'].includes(log.action)) return false;
        } else if (categoryFilter === 'OBRIGACOES') {
          if (!['ATUALIZOU_OBRIGACAO', 'OBRIGACAO_CONCLUIDA'].includes(log.action)) return false;
        } else if (categoryFilter === 'SEGURANCA') {
          if (!['ALTEROU_SENHA', 'RESET_SENHA', 'DESLIGOU_USUARIO', 'REATIVOU_USUARIO'].includes(log.action)) return false;
        } else if (categoryFilter === 'EMPRESAS') {
          if (!log.action.includes('EMPRESA')) return false;
        }
      }

      // 3. Ação específica
      if (actionFilter !== 'TODAS' && log.action !== actionFilter) {
        return false;
      }

      // 4. Entidade / Setor
      if (entityFilter !== 'TODAS' && log.entity !== entityFilter) {
        return false;
      }

      // 5. Usuário
      if (userFilter !== 'TODOS' && log.userEmail !== userFilter) {
        return false;
      }

      // 6. Período
      if (periodFilter !== 'TODOS') {
        const logTime = new Date(log.createdAt).getTime();
        if (periodFilter === 'HOJE' && logTime < todayStart) return false;
        if (periodFilter === '7DIAS' && logTime < sevenDaysAgo) return false;
        if (periodFilter === '30DIAS' && logTime < thirtyDaysAgo) return false;
      }

      return true;
    });
  }, [logs, searchTerm, categoryFilter, actionFilter, entityFilter, userFilter, periodFilter]);

  // Reseta página quando os filtros mudam
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, actionFilter, entityFilter, userFilter, periodFilter, pageSize]);

  // Paginação
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const hasActiveFilters =
    searchTerm !== '' ||
    categoryFilter !== 'TODOS' ||
    actionFilter !== 'TODAS' ||
    entityFilter !== 'TODAS' ||
    userFilter !== 'TODOS' ||
    periodFilter !== 'TODOS';

  const clearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('TODOS');
    setActionFilter('TODAS');
    setEntityFilter('TODAS');
    setUserFilter('TODOS');
    setPeriodFilter('TODOS');
  };

  const renderActionBadge = (action: string) => {
    switch (action) {
      case 'LOGIN':
        return (
          <span className="log-badge badge-login">
            <LogIn size={13} /> Login
          </span>
        );
      case 'LOGIN_FALHA':
        return (
          <span className="log-badge badge-login-fail">
            <ShieldAlert size={13} /> Falha no Login
          </span>
        );
      case 'LOGOUT':
        return (
          <span className="log-badge badge-logout">
            <LogOut size={13} /> Logout
          </span>
        );
      case 'ALTEROU_SENHA':
        return (
          <span className="log-badge badge-password">
            <KeyRound size={13} /> Alterou Senha
          </span>
        );
      case 'ATUALIZOU_OBRIGACAO':
        return (
          <span className="log-badge badge-obligation">
            <FileCheck size={13} /> Obrigação
          </span>
        );
      case 'DESLIGOU_USUARIO':
        return (
          <span className="log-badge badge-offboard">
            <UserX size={13} /> Desligamento
          </span>
        );
      case 'REATIVOU_USUARIO':
        return (
          <span className="log-badge badge-login">
            <UserCheck size={13} /> Reativou Usuário
          </span>
        );
      case 'ATUALIZOU_EMPRESA':
      case 'CRIOU_EMPRESA':
        return (
          <span className="log-badge badge-company">
            <Building2 size={13} /> Empresa
          </span>
        );
      default:
        return <span className="log-badge badge-default">{action}</span>;
    }
  };

  const renderDetailsSummary = (log: SystemLog) => {
    const d = log.details;
    if (!d) return <span className="text-muted">-</span>;

    if (log.action === 'LOGIN' || log.action === 'LOGOUT') {
      return (
        <span className="details-text">
          {d.motivo || d.message || 'Sessão iniciada'}
        </span>
      );
    }

    if (log.action === 'LOGIN_FALHA') {
      return (
        <span className="details-text text-danger">
          <strong>Motivo:</strong> {d.motivo || d.reason || 'Tentativa inválida'}
        </span>
      );
    }

    if (log.action === 'ALTEROU_SENHA') {
      return (
        <span className="details-text text-warning">
          {d.alteradoPorAdmin ? 'Redefinida por Administrador' : 'Alterada pelo próprio usuário'}
        </span>
      );
    }

    if (log.action === 'DESLIGOU_USUARIO') {
      const saida = d.dataSaida ? ` (Saída em ${new Date(d.dataSaida).toLocaleDateString('pt-BR')})` : '';
      const dest = d.novoResponsavel ? ` → transferido para ${d.novoResponsavel}` : '';
      const total = d.empresasTransferidas ? ` [${d.empresasTransferidas} emp. transferidas]` : '';
      return (
        <span className="details-text text-danger">
          <strong>{d.usuarioDesligado || 'Colaborador'}</strong>: Não faz mais parte da empresa{saida}{dest}{total}
        </span>
      );
    }

    if (log.action === 'REATIVOU_USUARIO') {
      return (
        <span className="details-text" style={{ color: '#34d399' }}>
          <strong>{d.usuarioReativado || 'Colaborador'}</strong> foi reativado no sistema
        </span>
      );
    }

    if (log.action === 'ATUALIZOU_OBRIGACAO') {
      const col = d.columnKey || 'campo';
      const val = d.newValue !== undefined ? String(d.newValue) : '';
      return (
        <span className="details-text">
          <strong>{col}:</strong> {val ? `“${val}”` : 'limpo'}
        </span>
      );
    }

    if (typeof d === 'object') {
      const str = JSON.stringify(d);
      return <span className="details-text">{str.length > 55 ? str.slice(0, 55) + '...' : str}</span>;
    }

    return <span className="details-text">{String(d)}</span>;
  };

  return (
    <main className="logs-page">
      <header className="page-header">
        <div>
          <h1><Activity size={26} /> Logs e Auditoria do Sistema</h1>
          <p>Rastreamento detalhado de acessos, alterações de obrigações e eventos de segurança</p>
        </div>
        <button
          type="button"
          className={`refresh-logs-btn ${refreshing ? 'is-spinning' : ''}`}
          onClick={() => fetchLogs(true)}
          disabled={loading || refreshing}
          title="Recarregar logs mais recentes"
        >
          <RotateCw size={16} />
          <span>{refreshing ? 'Atualizando...' : 'Atualizar'}</span>
        </button>
      </header>

      {/* Cards de Métricas e KPIs */}
      <section className="logs-stats-grid">
        <div
          className={`stat-card ${categoryFilter === 'TODOS' ? 'is-selected' : ''}`}
          onClick={() => setCategoryFilter('TODOS')}
        >
          <div className="stat-icon total"><Activity size={20} /></div>
          <div className="stat-info">
            <span className="stat-label">Total de Logs</span>
            <strong className="stat-value">{stats.total}</strong>
          </div>
        </div>

        <div
          className={`stat-card ${categoryFilter === 'ACESSOS' ? 'is-selected' : ''}`}
          onClick={() => setCategoryFilter('ACESSOS')}
        >
          <div className="stat-icon login"><LogIn size={20} /></div>
          <div className="stat-info">
            <span className="stat-label">Logins com Sucesso</span>
            <strong className="stat-value">{stats.logins}</strong>
          </div>
        </div>

        <div
          className={`stat-card ${actionFilter === 'LOGIN_FALHA' ? 'is-selected' : ''}`}
          onClick={() => {
            setCategoryFilter('TODOS');
            setActionFilter(actionFilter === 'LOGIN_FALHA' ? 'TODAS' : 'LOGIN_FALHA');
          }}
        >
          <div className="stat-icon alert"><ShieldAlert size={20} /></div>
          <div className="stat-info">
            <span className="stat-label">Falhas de Login</span>
            <strong className="stat-value" style={{ color: stats.loginFailures > 0 ? '#f43f5e' : undefined }}>
              {stats.loginFailures}
            </strong>
          </div>
        </div>

        <div
          className={`stat-card ${categoryFilter === 'OBRIGACOES' ? 'is-selected' : ''}`}
          onClick={() => setCategoryFilter('OBRIGACOES')}
        >
          <div className="stat-icon obligation"><FileCheck size={20} /></div>
          <div className="stat-info">
            <span className="stat-label">Obrigações Alteradas</span>
            <strong className="stat-value">{stats.obligationUpdates}</strong>
          </div>
        </div>

        <div
          className={`stat-card ${categoryFilter === 'SEGURANCA' ? 'is-selected' : ''}`}
          onClick={() => setCategoryFilter('SEGURANCA')}
        >
          <div className="stat-icon password"><KeyRound size={20} /></div>
          <div className="stat-info">
            <span className="stat-label">Trocas de Senha</span>
            <strong className="stat-value">{stats.passwordChanges}</strong>
          </div>
        </div>
      </section>

      {/* Barra de Filtros Multifuncionais */}
      <section className="logs-filter-panel">
        <div className="filter-row-top">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Buscar por usuário, e-mail, ação, setor, IP ou conteúdo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchTerm('')}
                title="Limpar pesquisa"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="category-pill-group">
            <button
              type="button"
              className={`pill-btn ${categoryFilter === 'TODOS' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('TODOS')}
            >
              Todos
            </button>
            <button
              type="button"
              className={`pill-btn ${categoryFilter === 'ACESSOS' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('ACESSOS')}
            >
              <LogIn size={13} /> Acessos
            </button>
            <button
              type="button"
              className={`pill-btn ${categoryFilter === 'OBRIGACOES' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('OBRIGACOES')}
            >
              <FileCheck size={13} /> Obrigações
            </button>
            <button
              type="button"
              className={`pill-btn ${categoryFilter === 'SEGURANCA' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('SEGURANCA')}
            >
              <KeyRound size={13} /> Senhas
            </button>
            <button
              type="button"
              className={`pill-btn ${categoryFilter === 'EMPRESAS' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('EMPRESAS')}
            >
              <Building2 size={13} /> Empresas
            </button>
          </div>
        </div>

        <div className="filter-row-dropdowns">
          <div className="filter-group">
            <label><Filter size={13} /> Ação Específica:</label>
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              aria-label="Filtrar por ação específica"
            >
              <option value="TODAS">Todas as Ações</option>
              {distinctActions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label><Building2 size={13} /> Setor / Entidade:</label>
            <select
              value={entityFilter}
              onChange={e => setEntityFilter(e.target.value)}
              aria-label="Filtrar por setor ou entidade"
            >
              <option value="TODAS">Todos os Setores</option>
              {distinctEntities.map(entity => (
                <option key={entity} value={entity}>{entity}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Usuário:</label>
            <select
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
              aria-label="Filtrar por usuário"
            >
              <option value="TODOS">Todos os Usuários</option>
              {distinctUsers.map(u => (
                <option key={u.email} value={u.email}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label><Calendar size={13} /> Período:</label>
            <select
              value={periodFilter}
              onChange={e => setPeriodFilter(e.target.value)}
              aria-label="Filtrar por período"
            >
              <option value="TODOS">Todo o Histórico</option>
              <option value="HOJE">Hoje</option>
              <option value="7DIAS">Últimos 7 dias</option>
              <option value="30DIAS">Últimos 30 dias</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="clear-filters-btn"
              onClick={clearFilters}
              title="Redefinir todos os filtros"
            >
              <X size={14} /> Limpar Filtros
            </button>
          )}
        </div>
      </section>

      {/* Tabela de Resultados */}
      <section className="table-container">
        {loading ? (
          <div className="loading-state">
            <Activity size={32} className="is-spinning" />
            <p>Carregando logs do sistema...</p>
          </div>
        ) : (
          <>
            <table className="logs-table">
              <thead>
                <tr>
                  <th style={{ width: '165px' }}>Data / Hora (BRT)</th>
                  <th style={{ width: '220px' }}>Usuário</th>
                  <th style={{ width: '160px' }}>Ação</th>
                  <th style={{ width: '120px' }}>Setor / Entidade</th>
                  <th style={{ width: '130px' }}>IP de Origem</th>
                  <th>Detalhes do Evento</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>Ver</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map(log => {
                  const date = new Date(log.createdAt);
                  const formatter = new Intl.DateTimeFormat('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="log-table-row"
                    >
                      <td className="log-date-cell">
                        <span>{formatter.format(date)}</span>
                      </td>
                      <td>
                        <div className="user-info">
                          <strong>{log.userName || 'Sistema'}</strong>
                          <small>{log.userEmail || 'Automático'}</small>
                        </div>
                      </td>
                      <td>{renderActionBadge(log.action)}</td>
                      <td>
                        <span className="log-entity-tag">{log.entity || 'SISTEMA'}</span>
                      </td>
                      <td>
                        <div className="ip-cell">
                          <Globe size={13} />
                          <span>{log.ipAddress || '127.0.0.1'}</span>
                        </div>
                      </td>
                      <td>{renderDetailsSummary(log)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="view-log-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          title="Ver detalhes completos"
                          aria-label="Ver detalhes completos do log"
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        <Search size={36} />
                        <p>Nenhum log encontrado com os filtros aplicados.</p>
                        {hasActiveFilters && (
                          <button
                            type="button"
                            className="btn-reset-empty"
                            onClick={clearFilters}
                          >
                            Redefinir Filtros
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Rodapé com Paginação */}
            {filteredLogs.length > 0 && (
              <div className="logs-pagination-footer">
                <div className="pagination-info">
                  Mostrando <strong>{(currentPage - 1) * pageSize + 1}</strong> a{' '}
                  <strong>{Math.min(currentPage * pageSize, filteredLogs.length)}</strong> de{' '}
                  <strong>{filteredLogs.length}</strong> registros
                </div>

                <div className="pagination-controls">
                  <div className="page-size-selector">
                    <label>Por página:</label>
                    <select
                      value={pageSize}
                      onChange={e => setPageSize(Number(e.target.value))}
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div className="page-nav-buttons">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      aria-label="Página anterior"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span>
                      {currentPage} de {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      aria-label="Próxima página"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Modal de Detalhes Completos do Log */}
      {selectedLog && (
        <div className="log-modal-overlay" onClick={() => setSelectedLog(null)}>
          <div
            className="log-modal-card"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="log-modal-close"
              onClick={() => setSelectedLog(null)}
              aria-label="Fechar"
            >
              <X size={20} />
            </button>

            <div className="log-modal-header">
              <div className="log-modal-icon">
                <Activity size={22} />
              </div>
              <div>
                <h2>Detalhes do Evento de Auditoria</h2>
                <p>ID do Registro: {selectedLog.id}</p>
              </div>
            </div>

            <div className="log-modal-grid">
              <div className="detail-item">
                <span className="detail-label">Data e Horário</span>
                <span className="detail-val">
                  {new Date(selectedLog.createdAt).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Ação Realizada</span>
                <span className="detail-val">{renderActionBadge(selectedLog.action)}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Usuário Responsável</span>
                <span className="detail-val">
                  {selectedLog.userName || 'Sistema'}{' '}
                  {selectedLog.userEmail && `(${selectedLog.userEmail})`}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Setor / Módulo</span>
                <span className="detail-val">{selectedLog.entity || 'SISTEMA'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Endereço IP</span>
                <span className="detail-val">{selectedLog.ipAddress || 'Não registrado'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">ID da Entidade</span>
                <span className="detail-val">{selectedLog.entityId || '-'}</span>
              </div>
            </div>

            <div className="log-modal-payload">
              <span className="payload-title">Dados e Mudanças (Payload JSON):</span>
              <pre className="payload-json">
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>

            <div className="log-modal-footer">
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setSelectedLog(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
