import { useState, useEffect } from 'react';
import { API } from '../api';
import { Activity, Search } from 'lucide-react';
import './SystemLogs.css';

interface SystemLog {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details: any;
  ipAddress: string;
  createdAt: string;
}

export function SystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API}/api/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const s = searchTerm.toLowerCase();
    return (
      (log.userName && log.userName.toLowerCase().includes(s)) ||
      (log.userEmail && log.userEmail.toLowerCase().includes(s)) ||
      (log.action && log.action.toLowerCase().includes(s)) ||
      (log.entity && log.entity.toLowerCase().includes(s))
    );
  });

  return (
    <main className="logs-page">
      <header className="page-header">
        <div>
          <h1><Activity size={26} /> Logs do Sistema</h1>
          <p>Registro de atividades e auditoria geral</p>
        </div>
      </header>

      <section className="table-controls">
        <div className="search-box">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por usuário, ação ou entidade..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>
      </section>

      <section className="table-container">
        {loading ? (
          <div className="loading-state">
            <Activity size={32} />
            <p>Carregando logs...</p>
          </div>
        ) : (
          <table className="logs-table">
            <thead>
              <tr>
                <th>Data / Hora (BRT)</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Detalhes / Mudanças</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => {
                const date = new Date(log.createdAt);
                const formatter = new Intl.DateTimeFormat('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', second: '2-digit'
                });
                return (
                  <tr key={log.id}>
                    <td>{formatter.format(date)}</td>
                    <td>
                      <div className="user-info">
                        <strong>{log.userName || 'Sistema'}</strong>
                        <small>{log.userEmail || '-'}</small>
                      </div>
                    </td>
                    <td><span className="log-badge">{log.action}</span></td>
                    <td>{log.entity || '-'}</td>
                    <td>
                      <div className="log-details">
                        {log.details ? JSON.stringify(log.details).substring(0, 50) + '...' : '-'}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <Search size={32} />
                      <p>Nenhum log encontrado.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
