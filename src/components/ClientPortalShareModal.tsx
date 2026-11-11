import { useState, useEffect } from 'react';
import { ExternalLink, X, Copy, Check, Share2, ShieldCheck, MessageCircle } from 'lucide-react';
import { API, authHeaders } from '../api';
import './ClientPortalShareModal.css';

interface ClientPortalShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId?: string | null;
  companyName?: string;
}

export function ClientPortalShareModal({
  isOpen,
  onClose,
  companyId,
  companyName,
}: ClientPortalShareModalProps) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>(companyId || '');
  const [token, setToken] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (companyId) setSelectedId(companyId);
  }, [companyId]);

  useEffect(() => {
    if (!isOpen) return;
    if (companies.length === 0) {
      fetch(`${API}/api/companies`)
        .then(res => res.json())
        .then(json => {
          if (Array.isArray(json)) setCompanies(json);
          else if (Array.isArray(json?.companies)) setCompanies(json.companies);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (!selectedId) {
      setToken('');
      return;
    }
    setLoading(true);
    fetch(`${API}/api/companies/${selectedId}/portal-link`, {
      headers: authHeaders(),
    })
      .then(res => res.json())
      .then(json => {
        setToken(json.token || '');
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao gerar token do portal:', err);
        setLoading(false);
      });
  }, [selectedId]);

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const portalUrl = token ? `${currentOrigin}/?portal=${token}` : '';

  const handleCopy = () => {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleOpenPreview = () => {
    if (!portalUrl) return;
    window.open(portalUrl, '_blank');
  };

  const handleShareWhatsapp = () => {
    if (!portalUrl) return;
    const text = encodeURIComponent(
      `Olá! Segue o link seguro para acompanhar o status do fechamento contábil e consultar as guias de pagamento da sua empresa:\n\n${portalUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className="portalshare-overlay" onClick={onClose}>
      <div className="portalshare-card" onClick={e => e.stopPropagation()}>
        <div className="portalshare-header">
          <div className="portalshare-title-group">
            <Share2 className="portalshare-icon" />
            <div>
              <h2 className="portalshare-title">Link Seguro de Consulta do Cliente</h2>
              <div className="portalshare-subtitle">
                Acesso público seguro (sem senha) para o cliente consultar status de guias e certidões
              </div>
            </div>
          </div>
          <button className="portalshare-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="portalshare-content">
          {/* Seletor de Empresa caso não venha pré-selecionada */}
          {!companyId && (
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Selecione a Empresa Cliente:
              </label>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '0.6rem 0.8rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Selecione uma empresa...</option>
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.code ? `[${c.code}] ` : ''}{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {companyName && (
            <div style={{ background: '#1e293b', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #334155', fontSize: '0.875rem', color: '#f8fafc', fontWeight: 600 }}>
              Empresa: {companyName}
            </div>
          )}

          {/* Campo com Link Gerado */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Link Exclusivo do Cliente:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                readOnly
                value={loading ? 'Gerando link seguro...' : portalUrl || 'Selecione uma empresa para gerar o link'}
                style={{
                  flex: 1,
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '0.6rem 0.8rem',
                  color: '#38bdf8',
                  fontSize: '0.8125rem',
                  fontFamily: 'monospace',
                }}
              />
              <button
                type="button"
                disabled={!portalUrl}
                onClick={handleCopy}
                style={{
                  background: copied ? '#10b981' : '#38bdf8',
                  color: '#0f172a',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.6rem 1rem',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  cursor: portalUrl ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? 'Copiado!' : 'Copiar Link'}</span>
              </button>
            </div>
          </div>

          {/* Ações Rápidas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <button
              type="button"
              disabled={!portalUrl}
              onClick={handleShareWhatsapp}
              style={{
                background: 'rgba(37, 211, 102, 0.15)',
                border: '1px solid rgba(37, 211, 102, 0.4)',
                color: '#25d366',
                borderRadius: '8px',
                padding: '0.75rem',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: portalUrl ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <MessageCircle size={16} />
              <span>Compartilhar no WhatsApp</span>
            </button>

            <button
              type="button"
              disabled={!portalUrl}
              onClick={handleOpenPreview}
              style={{
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                borderRadius: '8px',
                padding: '0.75rem',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: portalUrl ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <ExternalLink size={16} />
              <span>Ver como o Cliente Vê</span>
            </button>
          </div>

          {/* Dica de Segurança */}
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#cbd5e1', fontSize: '0.8125rem' }}>
            <ShieldCheck size={18} color="#10b981" />
            <span>
              O cliente não precisa de login ou senha. O token criptografado dá acesso exclusivo apenas aos dados da empresa dele.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

