import { useState, useEffect, useRef } from 'react';
import { Bell, AlertTriangle, AlertCircle, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { API } from '../api';
import './NotificationCenter.css';

export interface AlertItem {
  id: string;
  type: 'CERTIFICATE_EXPIRED' | 'CERTIFICATE_EXPIRING' | 'FISCAL_DEADLINE' | 'UNASSIGNED_RESPONSIBLE';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  message: string;
  companyId?: string;
  companyName?: string;
  companyCode?: string | null;
  daysRemaining?: number;
  date?: string;
  responsibleName?: string;
}

interface NotificationPayload {
  timestamp: string;
  totalAlerts: number;
  criticalCount: number;
  warningCount: number;
  alerts: AlertItem[];
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<NotificationPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'ALL' | 'CRITICAL' | 'CERTIFICATES'>('ALL');
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/notifications`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Ignora falhas de rede transitórias
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const total = data?.totalAlerts || 0;
  const critical = data?.criticalCount || 0;
  const badgeClass = critical > 0 ? 'critical' : 'warning';

  const alerts = (data?.alerts || []).filter((a) => {
    if (tab === 'CRITICAL') return a.severity === 'CRITICAL';
    if (tab === 'CERTIFICATES') return a.type.startsWith('CERTIFICATE');
    return true;
  });

  const handleOpenCompany = (companyId?: string) => {
    if (!companyId) return;
    setIsOpen(false);
    window.dispatchEvent(
      new CustomEvent('open-company-360', { detail: { companyId } })
    );
  };

  return (
    <div className="notification-center-container" ref={containerRef}>
      <button
        type="button"
        className="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Centro de Alertas & Vencimentos"
        aria-label="Notificações"
      >
        <Bell size={18} />
        {total > 0 && (
          <span className={`notification-badge ${badgeClass}`}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h4>
              <Bell size={15} color="#3b82f6" />
              Alertas Proativos
              {total > 0 && (
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>
                  ({total})
                </span>
              )}
            </h4>
            <div className="notification-header-actions">
              <button
                type="button"
                onClick={fetchNotifications}
                disabled={loading}
                title="Atualizar alertas"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="notification-filter-tabs">
            <button
              type="button"
              className={`notification-tab-btn ${tab === 'ALL' ? 'active' : ''}`}
              onClick={() => setTab('ALL')}
            >
              Todos ({data?.alerts.length || 0})
            </button>
            <button
              type="button"
              className={`notification-tab-btn ${tab === 'CRITICAL' ? 'active' : ''}`}
              onClick={() => setTab('CRITICAL')}
            >
              Críticos ({data?.criticalCount || 0})
            </button>
            <button
              type="button"
              className={`notification-tab-btn ${tab === 'CERTIFICATES' ? 'active' : ''}`}
              onClick={() => setTab('CERTIFICATES')}
            >
              Certificados
            </button>
          </div>

          <div className="notification-list">
            {alerts.length === 0 ? (
              <div className="notification-empty">
                <CheckCircle size={28} color="#10b981" />
                <span>Nenhum alerta pendente no momento. Tudo em dia!</span>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`notification-item ${alert.severity === 'CRITICAL' ? 'critical' : 'warning'}`}
                >
                  <div className="notification-item-header">
                    <div className="notification-title">
                      {alert.severity === 'CRITICAL' ? (
                        <AlertCircle size={14} color="#ef4444" />
                      ) : (
                        <AlertTriangle size={14} color="#f59e0b" />
                      )}
                      <span>{alert.title}</span>
                    </div>
                  </div>
                  <div className="notification-message">{alert.message}</div>
                  <div className="notification-footer">
                    <span>
                      {alert.responsibleName ? `Resp: ${alert.responsibleName}` : ''}
                    </span>
                    {alert.companyId && (
                      <button
                        type="button"
                        className="notification-action-btn"
                        onClick={() => handleOpenCompany(alert.companyId)}
                      >
                        Abrir Raio-X <ExternalLink size={10} style={{ marginLeft: 3 }} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
