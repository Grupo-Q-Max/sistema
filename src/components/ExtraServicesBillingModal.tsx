import { useState, useEffect } from 'react';
import { Tag, X, Plus, CheckCircle, Clock } from 'lucide-react';
import { API } from '../api';
import './ExtraServicesBillingModal.css';

interface ExtraServicesBillingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExtraServicesBillingModal({ isOpen, onClose }: ExtraServicesBillingModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // Form states
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [serviceType, setServiceType] = useState('Alteração Contratual');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('850');
  const [saving, setSaving] = useState(false);

  const loadData = () => {
    setLoading(true);
    fetch(`${API}/api/extra-services`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao buscar serviços extraordinários:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      fetch(`${API}/api/companies`)
        .then(res => res.json())
        .then(json => {
          if (Array.isArray(json)) setCompanies(json);
          else if (Array.isArray(json?.companies)) setCompanies(json.companies);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId || !amount) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/extra-services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          serviceType,
          description,
          amount: Number(amount),
        }),
      });
      if (res.ok) {
        setIsAdding(false);
        setDescription('');
        loadData();
      }
    } catch (err) {
      console.error('Erro ao criar serviço:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (service: any) => {
    const nextStatus = service.status === 'PENDING_BILLING' ? 'BILLED' : 'PENDING_BILLING';
    try {
      const res = await fetch(`${API}/api/extra-services/${service.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: service.companyId,
          status: nextStatus,
        }),
      });
      if (res.ok) loadData();
    } catch (err) {
      console.error('Erro ao atualizar status do serviço:', err);
    }
  };

  const services = data?.services || [];

  return (
    <div className="extrasvc-overlay" onClick={onClose}>
      <div className="extrasvc-card" onClick={e => e.stopPropagation()}>
        <div className="extrasvc-header">
          <div className="extrasvc-title-group">
            <Tag className="extrasvc-icon" />
            <div>
              <h2 className="extrasvc-title">Central de Serviços Extraordinários & Cobrança Adicional</h2>
              <div className="extrasvc-subtitle">
                Gestão e faturamento de demandas extras fora do contrato (alterações, DECORE, parcelamentos)
              </div>
            </div>
          </div>
          <button className="extrasvc-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="extrasvc-content">
          {/* Banner de KPIs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                Total a Faturar no Próximo Boleto (Serviços Pendentes)
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>
                R$ {(data?.pendingBillingTotal || 0).toLocaleString('pt-BR')}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAdding(!isAdding)}
              style={{
                background: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Plus size={16} />
              <span>{isAdding ? 'Fechar Formulário' : 'Novo Serviço Extra'}</span>
            </button>
          </div>

          {/* Formulário de Registro de Serviço */}
          {isAdding && (
            <form onSubmit={handleCreateService} style={{ background: '#1e293b', border: '1px solid #10b981', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc' }}>
                Registrar Demanda Extraordinária para Cobrança
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Empresa Cliente</label>
                  <select
                    value={selectedCompanyId}
                    onChange={e => setSelectedCompanyId(e.target.value)}
                    required
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '6px', padding: '0.45rem' }}
                  >
                    <option value="">Selecione a empresa...</option>
                    {companies.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.code ? `[${c.code}] ` : ''}{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Tipo de Serviço Extra</label>
                  <select
                    value={serviceType}
                    onChange={e => setServiceType(e.target.value)}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '6px', padding: '0.45rem' }}
                  >
                    <option value="Alteração Contratual">Alteração Contratual / Distrato</option>
                    <option value="Abertura de Filial">Abertura de Filial / CNPJ Adicional</option>
                    <option value="Parcelamento Especial">Parcelamento de Débitos / Regularize</option>
                    <option value="Emissão de DECORE">Emissão de DECORE / Balancete Especial</option>
                    <option value="Rescisão Complementar">Rescisão Complementar / Fora do Prazo</option>
                    <option value="Homologação Presencial">Homologação Trabalhista no Sindicato</option>
                    <option value="Outro Serviço">Outro Serviço Extraordinário</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Valor do Honorário Extra (R$)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '6px', padding: '0.45rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Descrição / Observações (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Alteração de cláusula de sócios e capital social"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '6px', padding: '0.45rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #334155', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0.4rem 1.25rem', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {saving ? 'Registrando...' : 'Lançar no Faturamento'}
                </button>
              </div>
            </form>
          )}

          {/* Tabela de Serviços Extraordinários */}
          <div style={{ border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                Carregando registros de serviços extraordinários...
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Empresa</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Serviço Executado</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Valor Cobrado</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Data Registro</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status Financeiro</th>
                  </tr>
                </thead>
                <tbody>
                  {services.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                        Nenhum serviço extraordinário registrado ainda.
                      </td>
                    </tr>
                  ) : (
                    services.map((s: any) => {
                      const isBilled = s.status === 'BILLED';

                      return (
                        <tr key={s.id} style={{ borderBottom: '1px solid #1e293b' }}>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 600, color: '#f8fafc' }}>{s.companyName}</div>
                            {s.companyCode && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Cód: {s.companyCode}</div>}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 600, color: '#cbd5e1' }}>{s.serviceType}</div>
                            {s.description && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{s.description}</div>}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#10b981', fontWeight: 800 }}>
                            R$ {(Number(s.amount) || 0).toLocaleString('pt-BR')}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>
                            {s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(s)}
                              style={{
                                background: isBilled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: isBilled ? '#10b981' : '#f59e0b',
                                border: `1px solid ${isBilled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                                padding: '0.25rem 0.6rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="Clique para alternar entre Pendente de Cobrança e Faturado"
                            >
                              {isBilled ? <CheckCircle size={12} /> : <Clock size={12} />}
                              {isBilled ? 'Faturado no Boleto' : 'Pendente de Cobrança'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
