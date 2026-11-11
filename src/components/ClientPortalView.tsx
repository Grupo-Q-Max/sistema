import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, ShieldCheck, AlertCircle, FileText } from 'lucide-react';
import { API } from '../api';
import './ClientPortalView.css';

interface ClientPortalViewProps {
  token: string;
}

export function ClientPortalView({ token }: ClientPortalViewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/client-portal/${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Link expirado ou token inválido');
        return res.json();
      })
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Erro ao carregar portal do cliente');
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#090d16', color: '#94a3b8', gap: '1rem' }}>
        <div style={{ fontSize: '2rem' }}>⏳</div>
        <span style={{ fontSize: '0.875rem' }}>Carregando dados seguros da sua empresa...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#090d16', color: '#f8fafc', padding: '1.5rem', textAlign: 'center' }}>
        <AlertCircle size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Link Indisponível ou Expirado</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', maxWidth: '400px' }}>
          Este link seguro de consulta não foi encontrado. Favor solicitar um novo link de acesso à equipe de contabilidade.
        </p>
      </div>
    );
  }

  const { company, period, closingStatus, guides, certificates, announcement } = data;

  return (
    <div className="client-portal-wrapper">
      <header className="client-portal-header">
        <div className="client-portal-logo">
          Área do Cliente · <span>Fechamento Pro</span>
        </div>
        <div style={{ fontSize: '0.8125rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={16} color="#10b981" />
          <span>Ambiente Seguro & Autenticado</span>
        </div>
      </header>

      <main className="client-portal-container">
        {/* Card da Empresa */}
        <div className="client-portal-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
              Competência em Aberto: {period.label}
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 4px 0', color: '#f8fafc' }}>
              {company.name}
            </h1>
            <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
              CNPJ: <code>{company.cnpj || '-'}</code> · Regime: {company.taxRegime || 'Não informado'}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Situação do Fechamento</span>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: closingStatus.fiscal === 'COMPLETED' ? '#10b981' : '#38bdf8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {closingStatus.fiscal === 'COMPLETED' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
              {closingStatus.fiscal === 'COMPLETED' ? 'Obrigações Concluídas' : 'Apuração em Andamento'}
            </div>
          </div>
        </div>

        {/* Guias de Pagamento e Tributos */}
        <div className="client-portal-card">
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="#38bdf8" />
            <span>Guias & Impostos do Mês</span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
            Acompanhe a emissão das guias e tributos para quitação antes do vencimento.
          </p>

          <div>
            {guides.map((g: any, idx: number) => {
              const isReady = g.status === 'DISPONIVEL';

              return (
                <div key={idx} className="client-portal-guide-item">
                  <div>
                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.95rem' }}>{g.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                      Vencimento: <strong>{g.dueDate}</strong>
                    </div>
                  </div>

                  <div>
                    {isReady ? (
                      <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={14} /> Guia Emitida
                      </span>
                    ) : (
                      <span style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} /> Em Apuração
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Certidões de Regularidade Fiscal (CNDs) */}
        <div className="client-portal-card">
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={20} color="#10b981" />
            <span>Regularidade Fiscal & Certidões (CNDs)</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>RECEITA FEDERAL / PGFN</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                {certificates.federal === 'REGULAR' ? '✓ Regular' : 'Em Análise'}
              </div>
            </div>

            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>FGTS / CAIXA</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                {certificates.fgts === 'REGULAR' ? '✓ Regular' : 'Em Análise'}
              </div>
            </div>

            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>TRABALHISTA (CNDT)</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                {certificates.trabalhista === 'REGULAR' ? '✓ Regular' : 'Em Análise'}
              </div>
            </div>
          </div>
        </div>

        {/* Comunicados do Escritório */}
        {announcement && (
          <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '12px', padding: '1.25rem', fontSize: '0.8125rem', color: '#cbd5e1' }}>
            <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '0.25rem' }}>
              📢 Mensagem da Contabilidade:
            </div>
            <span>{announcement}</span>
          </div>
        )}
      </main>
    </div>
  );
}
