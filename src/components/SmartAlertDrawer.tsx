import { useEffect, useState } from 'react';
import { Bell, X, ShieldAlert, FileText, CreditCard, ChevronRight, CheckCircle2 } from 'lucide-react';
import { API } from '../api';
import './SmartAlertDrawer.css';

export interface SmartAlertDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToCompany?: (companyId: string) => void;
  onNavigateToInstallments?: () => void;
}

export interface AlertSummaryData {
  certificates: Array<{
    companyId: string;
    companyCode: string;
    companyName: string;
    expiration: string;
    daysRemaining: number;
    severity: 'EXPIRED' | 'CRITICAL' | 'WARNING';
    type: string;
  }>;
  proxies: Array<{
    companyId: string;
    companyCode: string;
    companyName: string;
    proxyType: string;
    expiration: string;
    daysRemaining: number;
    severity: 'EXPIRED' | 'CRITICAL' | 'WARNING';
  }>;
  installments: Array<{
    planId: string;
    companyId: string;
    companyCode: string;
    companyName: string;
    typeName: string;
    dueDay: number;
  }>;
  totalCount: number;
}

export function SmartAlertDrawer({
  isOpen,
  onClose,
  onNavigateToCompany,
  onNavigateToInstallments,
}: SmartAlertDrawerProps) {
  const [data, setData] = useState<AlertSummaryData | null>(null);
  const [activeTab, setActiveTab] = useState<'certs' | 'proxies' | 'installments'>('certs');

  useEffect(() => {
    let isMounted = true;
    const fetchAlerts = () => {
      fetch(`${API}/api/alerts/summary`)
        .then((res) => (res.ok ? res.json() : null))
        .then((resData) => {
          if (isMounted && resData) setData(resData);
        })
        .catch(() => {});
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const certs = data?.certificates || [];
  const proxies = data?.proxies || [];
  const installments = data?.installments || [];

  return (
    <div className="alert-drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="alert-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="alert-drawer-header">
          <div className="alert-header-left">
            <div className="alert-bell-icon">
              <Bell size={20} />
            </div>
            <div>
              <h3>Central de Alertas</h3>
              <p>Avisos pró-ativos de certificados, procurações e parcelas</p>
            </div>
          </div>
          <button type="button" className="alert-close-btn" onClick={onClose} aria-label="Fechar painel">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="alert-drawer-tabs">
          <button
            type="button"
            className={`alert-tab-btn ${activeTab === 'certs' ? 'active' : ''}`}
            onClick={() => setActiveTab('certs')}
          >
            <ShieldAlert size={15} />
            <span>Certificados</span>
            {certs.length > 0 && <span className="tab-pill red">{certs.length}</span>}
          </button>

          <button
            type="button"
            className={`alert-tab-btn ${activeTab === 'proxies' ? 'active' : ''}`}
            onClick={() => setActiveTab('proxies')}
          >
            <FileText size={15} />
            <span>Procurações</span>
            {proxies.length > 0 && <span className="tab-pill orange">{proxies.length}</span>}
          </button>

          <button
            type="button"
            className={`alert-tab-btn ${activeTab === 'installments' ? 'active' : ''}`}
            onClick={() => setActiveTab('installments')}
          >
            <CreditCard size={15} />
            <span>Parcelamentos</span>
            {installments.length > 0 && <span className="tab-pill blue">{installments.length}</span>}
          </button>
        </div>

        {/* Content */}
        <div className="alert-drawer-content">
          {activeTab === 'certs' && (
            <div className="alert-cards-list">
              {certs.length === 0 ? (
                <div className="alert-empty-state">
                  <CheckCircle2 size={36} color="#34d399" />
                  <h4>Tudo certo por aqui!</h4>
                  <p>Nenhum certificado digital vencido ou prestes a vencer nos próximos 30 dias.</p>
                </div>
              ) : (
                certs.map((c, i) => (
                  <div key={i} className={`alert-item-card severity-${c.severity.toLowerCase()}`}>
                    <div className="alert-item-top">
                      <div className="alert-item-title">
                        {c.companyCode && <span className="company-code-badge">[{c.companyCode}]</span>}
                        <strong>{c.companyName}</strong>
                      </div>
                      <span className={`alert-badge badge-${c.severity.toLowerCase()}`}>
                        {c.daysRemaining < 0
                          ? `Vencido há ${Math.abs(c.daysRemaining)} dias`
                          : c.daysRemaining === 0
                          ? 'Vence hoje!'
                          : `Vence em ${c.daysRemaining} dias`}
                      </span>
                    </div>

                    <div className="alert-item-meta">
                      <span>Tipo: <strong>{c.type}</strong></span>
                      <span>Validade: <strong>{c.expiration}</strong></span>
                    </div>

                    {onNavigateToCompany && (
                      <button
                        type="button"
                        className="alert-action-btn"
                        onClick={() => {
                          onNavigateToCompany(c.companyId);
                          onClose();
                        }}
                      >
                        <span>Ver detalhes da empresa</span>
                        <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'proxies' && (
            <div className="alert-cards-list">
              {proxies.length === 0 ? (
                <div className="alert-empty-state">
                  <CheckCircle2 size={36} color="#34d399" />
                  <h4>Procurações em dia!</h4>
                  <p>Nenhuma procuração da Receita, FGTS ou DEC prestes a vencer.</p>
                </div>
              ) : (
                proxies.map((p, i) => (
                  <div key={i} className={`alert-item-card severity-${p.severity.toLowerCase()}`}>
                    <div className="alert-item-top">
                      <div className="alert-item-title">
                        {p.companyCode && <span className="company-code-badge">[{p.companyCode}]</span>}
                        <strong>{p.companyName}</strong>
                      </div>
                      <span className={`alert-badge badge-${p.severity.toLowerCase()}`}>
                        {p.daysRemaining < 0
                          ? `Vencida há ${Math.abs(p.daysRemaining)} dias`
                          : p.daysRemaining === 0
                          ? 'Vence hoje!'
                          : `Vence em ${p.daysRemaining} dias`}
                      </span>
                    </div>

                    <div className="alert-item-meta">
                      <span>Procuração: <strong>{p.proxyType}</strong></span>
                      <span>Vencimento: <strong>{p.expiration}</strong></span>
                    </div>

                    {onNavigateToCompany && (
                      <button
                        type="button"
                        className="alert-action-btn"
                        onClick={() => {
                          onNavigateToCompany(p.companyId);
                          onClose();
                        }}
                      >
                        <span>Ver cadastro da procuração</span>
                        <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'installments' && (
            <div className="alert-cards-list">
              {installments.length === 0 ? (
                <div className="alert-empty-state">
                  <CheckCircle2 size={36} color="#34d399" />
                  <h4>Parcelas em dia!</h4>
                  <p>Não há parcelamentos com pagamentos pendentes na competência atual.</p>
                </div>
              ) : (
                installments.map((inst, i) => (
                  <div key={i} className="alert-item-card severity-warning">
                    <div className="alert-item-top">
                      <div className="alert-item-title">
                        {inst.companyCode && <span className="company-code-badge">[{inst.companyCode}]</span>}
                        <strong>{inst.companyName}</strong>
                      </div>
                      <span className="alert-badge badge-warning">Pendente no Mês</span>
                    </div>

                    <div className="alert-item-meta">
                      <span>Tipo: <strong>{inst.typeName}</strong></span>
                      <span>Vencimento: dia <strong>{inst.dueDay}</strong></span>
                    </div>

                    {onNavigateToInstallments && (
                      <button
                        type="button"
                        className="alert-action-btn"
                        onClick={() => {
                          onNavigateToInstallments();
                          onClose();
                        }}
                      >
                        <span>Ir para tela de parcelamentos</span>
                        <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
