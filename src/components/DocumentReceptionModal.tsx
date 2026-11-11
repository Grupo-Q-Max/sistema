import { useState, useEffect } from 'react';
import { FileCheck, X, Search, ShieldAlert, Check } from 'lucide-react';
import { API, authHeaders } from '../api';
import './DocumentReceptionModal.css';

interface DocumentReceptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentReceptionModal({ isOpen, onClose }: DocumentReceptionModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [searchTerm, setSearchTerm] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchDocuments = () => {
    setLoading(true);
    fetch(`${API}/api/document-reception?year=${year}&month=${month}`, { headers: authHeaders() })
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao buscar recepção de documentos:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) fetchDocuments();
  }, [isOpen, year, month]);

  if (!isOpen) return null;

  const handleUpdate = async (companyId: string, currentReception: any, updates: Partial<any>) => {
    setSavingId(companyId);
    const updatedReception = { ...currentReception, ...updates };
    try {
      const res = await fetch(`${API}/api/companies/${companyId}/document-reception`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          periodKey: data?.periodKey || `${year}-${String(month).padStart(2, '0')}`,
          reception: updatedReception,
        }),
      });
      if (res.ok) {
        setData((prev: any) => ({
          ...prev,
          companies: prev.companies.map((c: any) =>
            c.id === companyId ? { ...c, reception: updatedReception } : c
          ),
        }));
      }
    } catch (err) {
      console.error('Erro ao atualizar recepção:', err);
    } finally {
      setSavingId(null);
    }
  };

  const companies = (data?.companies || []).filter((c: any) =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="docrec-overlay" onClick={onClose}>
      <div className="docrec-card" onClick={e => e.stopPropagation()}>
        <div className="docrec-header">
          <div className="docrec-title-group">
            <FileCheck className="docrec-icon" />
            <div>
              <h2 className="docrec-title">Checklist de Entrada & Recepção de Documentos</h2>
              <div className="docrec-subtitle">
                Acompanhamento de envio de Extratos, Notas e Ponto · Proteção do Escritório
              </div>
            </div>
          </div>
          <button className="docrec-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="docrec-content">
          {/* Controles de Competência e Busca */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: '#94a3b8', fontWeight: 600 }}>Competência:</span>
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                style={{
                  background: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  padding: '0.35rem 0.6rem',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>Mês {String(m).padStart(2, '0')}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                style={{
                  background: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  padding: '0.35rem 0.6rem',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                }}
              >
                {[2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748b' }} />
              <input
                type="text"
                placeholder="Filtrar por nome ou código..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '0.45rem 0.8rem 0.45rem 2rem',
                  color: '#f8fafc',
                  fontSize: '0.8125rem',
                }}
              />
            </div>
          </div>

          {/* Banner de Proteção Jurídica */}
          <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '10px', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShieldAlert size={18} color="#38bdf8" />
            <span>
              Ao marcar <strong>"Atraso do Cliente"</strong>, o fechamento é resguardado contra multas e contestações no Extrato de Entregas do cliente.
            </span>
          </div>

          {/* Tabela de Checklist */}
          <div style={{ border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                Carregando checklist de recepção...
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Cód</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Razão Social</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Notas Fiscais</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Extrato Bancário</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Ponto / Folha</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Blindagem</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c: any) => {
                    const rec = c.reception || {};
                    const isSaving = savingId === c.id;

                    const renderCycleButton = (key: 'fiscal' | 'bank' | 'payroll', label: string) => {
                      const cur = rec[key] || 'PENDING';
                      const next = cur === 'PENDING' ? 'RECEIVED' : cur === 'RECEIVED' ? 'LATE' : 'PENDING';
                      const className =
                        cur === 'RECEIVED'
                          ? 'docrec-status-received'
                          : cur === 'LATE'
                          ? 'docrec-status-late'
                          : 'docrec-status-pending';

                      return (
                        <button
                          type="button"
                          disabled={isSaving}
                          className={`docrec-status-btn ${className}`}
                          onClick={() => handleUpdate(c.id, rec, { [key]: next })}
                          title="Clique para alternar: Pendente -> Recebido -> Atrasado"
                        >
                          {cur === 'RECEIVED' ? `✓ ${label} OK` : cur === 'LATE' ? `⚠️ ${label} c/ Atraso` : `⏳ Aguardando`}
                        </button>
                      );
                    };

                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#f8fafc' }}>{c.code || '-'}</td>
                        <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{c.name}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{renderCycleButton('fiscal', 'Fiscal')}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{renderCycleButton('bank', 'Extrato')}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{renderCycleButton('payroll', 'Ponto')}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleUpdate(c.id, rec, { clientBlamed: !rec.clientBlamed })}
                            style={{
                              padding: '0.25rem 0.6rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: rec.clientBlamed ? 'rgba(239, 68, 68, 0.2)' : 'rgba(51, 65, 85, 0.4)',
                              color: rec.clientBlamed ? '#ef4444' : '#94a3b8',
                              border: rec.clientBlamed ? '1px solid #ef4444' : '1px solid #334155',
                            }}
                            title="Indica se os prazos do fechamento foram impactados pelo atraso do cliente"
                          >
                            {rec.clientBlamed ? <ShieldAlert size={12} /> : <Check size={12} />}
                            {rec.clientBlamed ? 'Atraso do Cliente' : 'Normal'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

