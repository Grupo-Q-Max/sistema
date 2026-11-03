import { useEffect, useState } from 'react';
import {
  Scale,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Sliders,
  Check
} from 'lucide-react';
import { API } from '../api';
import './WorkloadBalancerModal.css';

export interface WorkloadAnalyst {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  totalCompanies: number;
  regimes: Record<string, number>;
  status: 'OVERLOAD' | 'BALANCED' | 'LIGHT';
  deviationFromAverage: number;
  companies: Array<{ id: string; code: string | null; name: string; cnpj: string; taxRegime: string }>;
}

export interface WorkloadBalancerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
}

export function WorkloadBalancerModal({
  isOpen,
  onClose,
  currentUserId,
}: WorkloadBalancerModalProps) {
  const [sector, setSector] = useState<'FISCAL' | 'DP' | 'CONTABIL'>('FISCAL');
  const [data, setData] = useState<{
    sector: string;
    totalAssigned: number;
    averagePerAnalyst: number;
    analysts: WorkloadAnalyst[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // Form de rebalanceamento
  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [regimeFilter, setRegimeFilter] = useState('ALL');
  const [quantity, setQuantity] = useState<number>(10);
  const [transferring, setTransferring] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API}/api/workload/balance?sector=${sector}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((resData) => {
        if (resData) {
          setData(resData);
          if (resData.analysts.length > 0) {
            // Sugere o mais sobrecarregado como origem e o com menor carga como destino
            const sorted = [...resData.analysts].sort((a, b) => b.totalCompanies - a.totalCompanies);
            setFromUserId(sorted[0]?.userId || '');
            setToUserId(sorted[sorted.length - 1]?.userId || '');
          }
        }
      })
      .catch((err) => console.error('Erro ao buscar balanceador:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setFeedbackMsg(null);
    }
  }, [isOpen, sector]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromUserId || !toUserId) {
      setFeedbackMsg({ type: 'error', text: 'Selecione o colaborador de origem e de destino.' });
      return;
    }
    if (fromUserId === toUserId) {
      setFeedbackMsg({ type: 'error', text: 'Origem e destino não podem ser o mesmo usuário.' });
      return;
    }

    setTransferring(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch(`${API}/api/workload/transfer-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId,
          toUserId,
          sector,
          regimeFilter,
          quantity: Number(quantity) || undefined,
          actorId: currentUserId,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Erro ao rebalancear carteira.');
      }

      setFeedbackMsg({ type: 'success', text: json.message });
      fetchData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Falha na transferência.' });
    } finally {
      setTransferring(false);
    }
  };

  const analysts = data?.analysts || [];
  const average = data?.averagePerAnalyst || 0;
  const maxCompanies = Math.max(...analysts.map((a) => a.totalCompanies), 1);

  return (
    <div className="workload-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="workload-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="workload-header">
          <div className="workload-header-left">
            <div className="workload-icon-box">
              <Scale size={22} />
            </div>
            <div>
              <h3>Balanceador Visual de Carga da Equipe</h3>
              <p>Monitore a distribuição de empresas por analista e faça transferências inteligentes em lote.</p>
            </div>
          </div>

          <div className="workload-header-right">
            <button
              type="button"
              className="btn-refresh-workload"
              onClick={fetchData}
              disabled={loading}
              title="Atualizar dados"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button type="button" className="workload-close-btn" onClick={onClose} aria-label="Fechar">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* SELETOR DE SETOR */}
        <div className="workload-sector-tabs">
          <button
            type="button"
            className={`sector-tab-btn ${sector === 'FISCAL' ? 'active' : ''}`}
            onClick={() => setSector('FISCAL')}
          >
            Fiscal
          </button>
          <button
            type="button"
            className={`sector-tab-btn ${sector === 'DP' ? 'active' : ''}`}
            onClick={() => setSector('DP')}
          >
            Departamento Pessoal
          </button>
          <button
            type="button"
            className={`sector-tab-btn ${sector === 'CONTABIL' ? 'active' : ''}`}
            onClick={() => setSector('CONTABIL')}
          >
            Contábil
          </button>
        </div>

        <div className="workload-body">
          {/* CARDS VISUAIS DE CARGA POR ANALISTA */}
          <div className="workload-analysts-grid">
            {analysts.map((a) => {
              const percentOfMax = Math.round((a.totalCompanies / maxCompanies) * 100);
              const isOverload = a.status === 'OVERLOAD';
              const isLight = a.status === 'LIGHT';

              return (
                <div
                  key={a.userId}
                  className={`analyst-card ${isOverload ? 'card-overload' : isLight ? 'card-light' : 'card-balanced'}`}
                >
                  <div className="analyst-card-header">
                    <div className="analyst-info">
                      <strong className="analyst-name">{a.userName}</strong>
                      <span className="analyst-role">{a.role}</span>
                    </div>

                    <span className={`status-pill ${isOverload ? 'overload' : isLight ? 'light' : 'balanced'}`}>
                      {isOverload ? 'Sobrecarga' : isLight ? 'Capacidade Livre' : 'Equilibrado'}
                    </span>
                  </div>

                  <div className="analyst-count-row">
                    <span className="count-number">{a.totalCompanies}</span>
                    <span className="count-label">empresas ativas</span>
                    {a.deviationFromAverage !== 0 && (
                      <span className={`deviation-pill ${a.deviationFromAverage > 0 ? 'pos' : 'neg'}`}>
                        {a.deviationFromAverage > 0 ? `+${a.deviationFromAverage}` : a.deviationFromAverage} vs média ({average})
                      </span>
                    )}
                  </div>

                  {/* Barra de Progresso Relativa */}
                  <div className="analyst-bar-track">
                    <div
                      className={`analyst-bar-fill ${isOverload ? 'bg-red' : isLight ? 'bg-blue' : 'bg-green'}`}
                      style={{ width: `${percentOfMax}%` }}
                    />
                  </div>

                  {/* Mini Tags de Regimes */}
                  <div className="analyst-regimes-list">
                    {Object.entries(a.regimes).map(([regime, count]) => (
                      <span key={regime} className="regime-mini-badge" title={`${regime}: ${count} empresas`}>
                        {regime.replace(/_/g, ' ').slice(0, 10)}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* PAINEL DE TRANSFERÊNCIA / EQUILÍBRIO RÁPIDO */}
          <div className="workload-transfer-box">
            <h4 className="transfer-title">
              <Sliders size={16} /> Rebalanceamento e Transferência Rápida em Lote
            </h4>

            {feedbackMsg && (
              <div className={`transfer-feedback ${feedbackMsg.type}`}>
                {feedbackMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>{feedbackMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleExecuteTransfer} className="transfer-form-grid">
              <div className="form-group">
                <label>Transferir De (Origem):</label>
                <select value={fromUserId} onChange={(e) => setFromUserId(e.target.value)} required>
                  <option value="">Selecione o analista...</option>
                  {analysts.map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.userName} ({a.totalCompanies} empresas)
                    </option>
                  ))}
                </select>
              </div>

              <div className="transfer-arrow-icon">
                <ArrowRight size={20} />
              </div>

              <div className="form-group">
                <label>Transferir Para (Destino):</label>
                <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} required>
                  <option value="">Selecione o analista...</option>
                  {analysts.map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.userName} ({a.totalCompanies} empresas)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Filtro de Regime:</label>
                <select value={regimeFilter} onChange={(e) => setRegimeFilter(e.target.value)}>
                  <option value="ALL">Todos os Regimes</option>
                  <option value="SIMPLES_NACIONAL">Simples Nacional</option>
                  <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                  <option value="LUCRO_REAL_TRIMESTRAL">Lucro Real / Trimestral</option>
                  <option value="LUCRO_REAL_ESTIMATIVA">Lucro Real / Estimativa</option>
                  <option value="CONDOMINIOS">Condomínios</option>
                </select>
              </div>

              <div className="form-group small">
                <label>Quantidade:</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-execute-transfer"
                disabled={transferring}
              >
                {transferring ? (
                  <span>Transferindo...</span>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Executar Transferência</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* FOOTER */}
        <div className="workload-footer">
          <span className="workload-footer-info">
            Total no setor {sector}: <strong>{data?.totalAssigned || 0} empresas</strong> atribuídas · Média:{' '}
            <strong>{average} empresas/analista</strong>
          </span>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
