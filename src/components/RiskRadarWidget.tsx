import { useEffect, useState, useMemo } from 'react';
import {
  Activity,
  Flame,
  ShieldAlert,
  CheckCircle2,
  Clock,
  FileText,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  Users,
  X,
  ExternalLink,
  Building2
} from 'lucide-react';
import { API } from '../api';
import './RiskRadarWidget.css';

export interface RiskTrigger {
  type: 'CERTIFICATE' | 'PROXY' | 'DOCUMENTATION' | 'DEADLINE' | 'WORKLOAD';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
}

export interface RiskRadarCompany {
  id: string;
  code: string | null;
  name: string;
  cnpj: string;
  taxRegime: string;
  score: number;
  level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  triggers: RiskTrigger[];
  pendingSectors: string[];
  completedSectors: string[];
  responsibles: Array<{
    sector: string;
    name: string;
    email: string;
    userId: string;
    pendingCount?: number;
    isOverloaded?: boolean;
  }>;
  notesSnippet?: string;
  certificateExpiration?: string | null;
}

export interface RiskRadarData {
  referencePeriod: string;
  monthCode: string;
  totalCompanies: number;
  healthIndex: number;
  distribution: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
  };
  bottlenecks: {
    expiredCertificates: number;
    expiringCertificates: number;
    expiredProxies: number;
    documentFrictionNotes: number;
    urgentDeadlines: number;
    overloadedAnalysts: number;
  };
  analystWorkload: Array<{
    userId: string;
    userName: string;
    sector: string;
    pendingCount: number;
    completedCount: number;
    totalCount: number;
    isOverloaded: boolean;
  }>;
  companies: RiskRadarCompany[];
}

export interface RiskRadarWidgetProps {
  year: number;
  month: number; // 0-11
  currentUserId?: string;
  onNavigateToCompany?: (companyId: string) => void;
  onNavigateToSector?: (sector: string) => void;
}

export function RiskRadarWidget({
  year,
  month,
  currentUserId,
  onNavigateToCompany,
  onNavigateToSector
}: RiskRadarWidgetProps) {
  const [data, setData] = useState<RiskRadarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'CRITICAL' | 'CERT' | 'DOCS' | 'WORKLOAD'>('ALL');
  const [sectorFilter, setSectorFilter] = useState<'ALL' | 'FISCAL' | 'DP' | 'CONTABIL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<RiskRadarCompany | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);

    const monthNum = month + 1;
    fetch(`${API}/api/dashboard/risk-radar?year=${year}&month=${monthNum}&sector=${sectorFilter}&userId=${currentUserId || ''}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (isCurrent && payload) {
          setData(payload);
        }
      })
      .catch((err) => console.error('Erro ao carregar Risk Radar:', err))
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [year, month, sectorFilter, currentUserId]);

  const filteredCompanies = useMemo(() => {
    if (!data?.companies) return [];

    return data.companies.filter((c) => {
      // Filtro da aba
      if (activeTab === 'CRITICAL' && c.level !== 'CRITICAL') return false;
      if (activeTab === 'CERT' && !c.triggers.some((t) => t.type === 'CERTIFICATE' || t.type === 'PROXY')) return false;
      if (activeTab === 'DOCS' && !c.triggers.some((t) => t.type === 'DOCUMENTATION')) return false;
      if (activeTab === 'WORKLOAD' && !c.triggers.some((t) => t.type === 'WORKLOAD')) return false;

      // Filtro de busca textual
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(query);
        const matchesCode = c.code ? c.code.toLowerCase().includes(query) : false;
        const matchesCnpj = c.cnpj.includes(query);
        const matchesResp = c.responsibles.some((r) => r.name.toLowerCase().includes(query));
        if (!matchesName && !matchesCode && !matchesCnpj && !matchesResp) {
          return false;
        }
      }

      // Se estiver na aba ALL, esconde as que têm score 0 se houver empresas com risco
      if (activeTab === 'ALL' && c.score === 0 && data.companies.some((x) => x.score > 0)) {
        return false;
      }

      return true;
    });
  }, [data, activeTab, searchQuery]);

  const handleCopyAlert = (c: RiskRadarCompany, e: React.MouseEvent) => {
    e.stopPropagation();
    const primaryResp = c.responsibles.map((r) => `${r.sector}: ${r.name}`).join(' | ') || 'Não definido';
    const triggersText = c.triggers.map((t) => `• ${t.title}: ${t.description}`).join('\n');

    const text = `🚨 *ALERTA DE FECHAMENTO - RISCO ${c.level}* (Score ${c.score}/100)
🏢 *Empresa:* ${c.name} (${c.cnpj})
📊 *Regime:* ${c.taxRegime}
⏳ *Setores Pendentes:* ${c.pendingSectors.join(', ') || 'Nenhum'}
👤 *Responsáveis:* ${primaryResp}
⚠️ *Motivos de Alerta:*
${triggersText || '• Pendências operacionais gerais.'}

_Gerado pelo Fechamento Pro_`;

    navigator.clipboard.writeText(text);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  if (loading && !data) {
    return (
      <div className="risk-radar-card loading-card">
        <div className="risk-radar-spinner">
          <Activity className="animate-spin" size={24} />
          <span>Calculando termômetro preditivo de risco da competência...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { distribution, bottlenecks, healthIndex, totalCompanies } = data;
  const criticalPercent = totalCompanies > 0 ? Math.round((distribution.critical / totalCompanies) * 100) : 0;
  const highPercent = totalCompanies > 0 ? Math.round((distribution.high / totalCompanies) * 100) : 0;
  const moderatePercent = totalCompanies > 0 ? Math.round((distribution.moderate / totalCompanies) * 100) : 0;
  const lowPercent = Math.max(0, 100 - (criticalPercent + highPercent + moderatePercent));

  const totalAtRisk = distribution.critical + distribution.high + distribution.moderate;

  return (
    <div className={`risk-radar-card ${distribution.critical > 0 ? 'border-critical' : ''}`}>
      {/* CABEÇALHO DO WIDGET */}
      <div className="risk-radar-header" onClick={() => setIsExpanded((prev) => !prev)}>
        <div className="radar-title-section">
          <div className={`radar-icon-box ${distribution.critical > 0 ? 'critical' : distribution.high > 0 ? 'high' : 'safe'}`}>
            <Flame size={22} />
          </div>
          <div className="radar-header-texts">
            <div className="radar-title-row">
              <h3>Termômetro de Risco & Predição de Atraso</h3>
              <span className={`health-pill ${healthIndex >= 80 ? 'good' : healthIndex >= 60 ? 'warning' : 'bad'}`}>
                {healthIndex}% Sob Controle
              </span>
              {distribution.critical > 0 && (
                <span className="critical-pill">
                  <ShieldAlert size={13} />
                  {distribution.critical} em Risco Crítico
                </span>
              )}
            </div>
            <p className="radar-subtitle">
              Motor preditivo que cruza certificados vencendo, prazos legais (dias 07, 15, 20), anotações de cobrança documental e sobrecarga da equipe.
            </p>
          </div>
        </div>

        <div className="radar-toggle-box">
          <button
            type="button"
            className="radar-collapse-btn"
            aria-label={isExpanded ? 'Recolher Termômetro' : 'Expandir Termômetro'}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      {/* BARRA SEGMENTADA DE RISCO DA CARTEIRA */}
      <div className="risk-meter-container">
        <div className="risk-meter-bar">
          {criticalPercent > 0 && (
            <div
              className="meter-segment critical"
              style={{ width: `${criticalPercent}%` }}
              title={`Crítico: ${distribution.critical} empresas (${criticalPercent}%)`}
            />
          )}
          {highPercent > 0 && (
            <div
              className="meter-segment high"
              style={{ width: `${highPercent}%` }}
              title={`Alto Risco: ${distribution.high} empresas (${highPercent}%)`}
            />
          )}
          {moderatePercent > 0 && (
            <div
              className="meter-segment moderate"
              style={{ width: `${moderatePercent}%` }}
              title={`Moderado: ${distribution.moderate} empresas (${moderatePercent}%)`}
            />
          )}
          {lowPercent > 0 && (
            <div
              className="meter-segment safe"
              style={{ width: `${lowPercent}%` }}
              title={`Seguro / No Prazo: ${distribution.low} empresas (${lowPercent}%)`}
            />
          )}
        </div>

        <div className="risk-meter-legend">
          <span className="legend-item critical">
            <span className="dot" /> Crítico: <strong>{distribution.critical}</strong>
          </span>
          <span className="legend-item high">
            <span className="dot" /> Alto: <strong>{distribution.high}</strong>
          </span>
          <span className="legend-item moderate">
            <span className="dot" /> Moderado: <strong>{distribution.moderate}</strong>
          </span>
          <span className="legend-item safe">
            <span className="dot" /> Sob Controle: <strong>{distribution.low}</strong>
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="risk-radar-body">
          {/* CARDS DE GARGALOS E CAUSAS-RAIZ */}
          <div className="bottlenecks-grid">
            <div
              className={`bottleneck-card ${bottlenecks.expiredCertificates > 0 ? 'alert' : ''}`}
              onClick={() => setActiveTab('CERT')}
              role="button"
              tabIndex={0}
            >
              <div className="bottleneck-icon-wrap">
                <ShieldAlert size={18} />
              </div>
              <div className="bottleneck-info">
                <span className="bottleneck-count">{bottlenecks.expiredCertificates + bottlenecks.expiringCertificates}</span>
                <span className="bottleneck-label">Certificados Críticos</span>
              </div>
            </div>

            <div
              className={`bottleneck-card ${bottlenecks.urgentDeadlines > 0 ? 'alert' : ''}`}
              onClick={() => setActiveTab('CRITICAL')}
              role="button"
              tabIndex={0}
            >
              <div className="bottleneck-icon-wrap">
                <Clock size={18} />
              </div>
              <div className="bottleneck-info">
                <span className="bottleneck-count">{bottlenecks.urgentDeadlines}</span>
                <span className="bottleneck-label">Prazos Iminentes</span>
              </div>
            </div>

            <div
              className={`bottleneck-card ${bottlenecks.documentFrictionNotes > 0 ? 'alert' : ''}`}
              onClick={() => setActiveTab('DOCS')}
              role="button"
              tabIndex={0}
            >
              <div className="bottleneck-icon-wrap">
                <FileText size={18} />
              </div>
              <div className="bottleneck-info">
                <span className="bottleneck-count">{bottlenecks.documentFrictionNotes}</span>
                <span className="bottleneck-label">Cobrança de Documentos</span>
              </div>
            </div>

            <div
              className={`bottleneck-card ${bottlenecks.overloadedAnalysts > 0 ? 'alert' : ''}`}
              onClick={() => setActiveTab('WORKLOAD')}
              role="button"
              tabIndex={0}
            >
              <div className="bottleneck-icon-wrap">
                <Users size={18} />
              </div>
              <div className="bottleneck-info">
                <span className="bottleneck-count">{bottlenecks.overloadedAnalysts}</span>
                <span className="bottleneck-label">Analistas Sobrecarregados</span>
              </div>
            </div>
          </div>

          {/* BARRA DE FILTROS & BUSCA */}
          <div className="radar-filter-bar">
            <div className="radar-tabs">
              <button
                type="button"
                className={`radar-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
                onClick={() => setActiveTab('ALL')}
              >
                Todas com Risco ({totalAtRisk})
              </button>
              <button
                type="button"
                className={`radar-tab-btn ${activeTab === 'CRITICAL' ? 'active critical' : ''}`}
                onClick={() => setActiveTab('CRITICAL')}
              >
                🔴 Crítico ({distribution.critical})
              </button>
              <button
                type="button"
                className={`radar-tab-btn ${activeTab === 'CERT' ? 'active' : ''}`}
                onClick={() => setActiveTab('CERT')}
              >
                Certificados & Procurações
              </button>
              <button
                type="button"
                className={`radar-tab-btn ${activeTab === 'DOCS' ? 'active' : ''}`}
                onClick={() => setActiveTab('DOCS')}
              >
                Cobrança de Docs
              </button>
              <button
                type="button"
                className={`radar-tab-btn ${activeTab === 'WORKLOAD' ? 'active' : ''}`}
                onClick={() => setActiveTab('WORKLOAD')}
              >
                Sobrecarga
              </button>
            </div>

            <div className="radar-controls-right">
              {/* Seletor de Setor */}
              <select
                className="radar-sector-select"
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value as any)}
              >
                <option value="ALL">Todos os Setores</option>
                <option value="FISCAL">Fiscal</option>
                <option value="DP">Departamento Pessoal</option>
                <option value="CONTABIL">Contábil</option>
              </select>

              {/* Busca rápida */}
              <div className="radar-search-box">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Buscar empresa, CNPJ ou analista..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" className="clear-search" onClick={() => setSearchQuery('')}>
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* LISTA DE EMPRESAS EM RISCO */}
          <div className="radar-companies-list">
            {filteredCompanies.length === 0 ? (
              <div className="radar-empty-state">
                <CheckCircle2 size={38} className="empty-check" />
                <h4>Nenhuma empresa encontrada neste filtro</h4>
                <p>Nenhuma pendência crítica ou ameaça iminente de prazo identificada para esta seleção.</p>
              </div>
            ) : (
              filteredCompanies.slice(0, 15).map((comp) => {
                const isCrit = comp.level === 'CRITICAL';
                const isHigh = comp.level === 'HIGH';

                return (
                  <div
                    key={comp.id}
                    className={`risk-company-row ${isCrit ? 'level-critical' : isHigh ? 'level-high' : 'level-moderate'}`}
                    onClick={() => setSelectedCompany(comp)}
                  >
                    {/* Score / Termômetro */}
                    <div className="company-score-gauge">
                      <span className="score-num">{comp.score}</span>
                      <span className="score-tag">{comp.level}</span>
                    </div>

                    {/* Informações Principais */}
                    <div className="company-main-info">
                      <div className="company-title-line">
                        <span className="company-code-badge">{comp.code || 'S/C'}</span>
                        <h4 className="company-name">{comp.name}</h4>
                        <span className="company-regime-pill">{comp.taxRegime}</span>
                      </div>

                      {/* Gatilhos explicativos */}
                      <div className="company-triggers-list">
                        {comp.triggers.map((trig, idx) => (
                          <span
                            key={idx}
                            className={`trigger-badge ${trig.severity.toLowerCase()}`}
                            title={trig.description}
                          >
                            {trig.severity === 'CRITICAL' ? (
                              <Flame size={12} />
                            ) : trig.type === 'DEADLINE' ? (
                              <Clock size={12} />
                            ) : trig.type === 'CERTIFICATE' ? (
                              <ShieldAlert size={12} />
                            ) : trig.type === 'DOCUMENTATION' ? (
                              <FileText size={12} />
                            ) : (
                              <Users size={12} />
                            )}
                            {trig.title}
                          </span>
                        ))}
                      </div>

                      {/* Setores Pendentes & Responsáveis */}
                      <div className="company-meta-line">
                        <div className="pending-sectors-chips">
                          <span className="meta-label">Setores Pendentes:</span>
                          {comp.pendingSectors.length === 0 ? (
                            <span className="sector-done-chip">Todos Concluídos</span>
                          ) : (
                            comp.pendingSectors.map((s) => (
                              <span key={s} className="sector-pending-chip">
                                {s}
                              </span>
                            ))
                          )}
                        </div>

                        <div className="responsibles-chips">
                          {comp.responsibles.map((r, i) => (
                            <span
                              key={i}
                              className={`resp-avatar-chip ${r.isOverloaded ? 'overloaded' : ''}`}
                              title={`${r.name} (${r.sector}) ${r.isOverloaded ? `· Sobrecarga: ${r.pendingCount} pendentes` : ''}`}
                            >
                              <strong>{r.sector}:</strong> {r.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Ações Rápidas */}
                    <div className="company-actions-area" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`action-btn-copy ${copiedId === comp.id ? 'copied' : ''}`}
                        title="Copiar Alerta formatado para enviar no WhatsApp ou e-mail"
                        onClick={(e) => handleCopyAlert(comp, e)}
                      >
                        {copiedId === comp.id ? (
                          <>
                            <Check size={14} />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            <span>Alerta</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        className="action-btn-inspect"
                        title="Abrir Raio-X detalhado de Risco"
                        onClick={() => setSelectedCompany(comp)}
                      >
                        <span>Raio-X</span>
                        <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {filteredCompanies.length > 15 && (
              <div className="radar-more-footer">
                <span>
                  Mostrando as 15 mais críticas de <strong>{filteredCompanies.length}</strong> empresas em risco.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE RAIO-X COMPLETO DA EMPRESA */}
      {selectedCompany && (
        <div className="radar-modal-backdrop" onClick={() => setSelectedCompany(null)}>
          <div className="radar-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="radar-modal-header">
              <div className="radar-modal-title-box">
                <div className={`score-badge-large ${selectedCompany.level.toLowerCase()}`}>
                  <span className="score-val">{selectedCompany.score}</span>
                  <span className="score-lbl">{selectedCompany.level}</span>
                </div>
                <div>
                  <h3>{selectedCompany.name}</h3>
                  <p>CNPJ: {selectedCompany.cnpj} · Regime: {selectedCompany.taxRegime} · Código: {selectedCompany.code || '-'}</p>
                </div>
              </div>

              <button
                type="button"
                className="radar-modal-close"
                onClick={() => setSelectedCompany(null)}
                aria-label="Fechar modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="radar-modal-body">
              {/* DIAGNÓSTICO PREDITIVO */}
              <div className="radar-section">
                <h4>
                  <ShieldAlert size={16} /> Diagnóstico Preditivo de Risco
                </h4>
                <div className="modal-triggers-list">
                  {selectedCompany.triggers.length === 0 ? (
                    <div className="trigger-item info">
                      Nenhum gargalo severo identificado. Empresa em ritmo de fechamento regular.
                    </div>
                  ) : (
                    selectedCompany.triggers.map((trig, idx) => (
                      <div key={idx} className={`trigger-item ${trig.severity.toLowerCase()}`}>
                        <strong>{trig.title}</strong>
                        <p>{trig.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* SITUAÇÃO DOS SETORES */}
              <div className="radar-section">
                <h4>
                  <Building2 size={16} /> Situação dos Setores da Competência
                </h4>
                <div className="modal-sectors-grid">
                  <div
                    className="modal-sector-card"
                    style={{ cursor: onNavigateToSector ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (onNavigateToSector) {
                        onNavigateToSector('fiscal');
                        setSelectedCompany(null);
                      }
                    }}
                    title={onNavigateToSector ? 'Clique para ir ao Fechamento Fiscal' : undefined}
                  >
                    <span className="sector-name">Fiscal</span>
                    <span className={`sector-status-pill ${selectedCompany.pendingSectors.includes('FISCAL') ? 'pending' : 'done'}`}>
                      {selectedCompany.pendingSectors.includes('FISCAL') ? 'Pendente' : 'Concluído'}
                    </span>
                  </div>
                  <div
                    className="modal-sector-card"
                    style={{ cursor: onNavigateToSector ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (onNavigateToSector) {
                        onNavigateToSector('dp');
                        setSelectedCompany(null);
                      }
                    }}
                    title={onNavigateToSector ? 'Clique para ir ao Fechamento de DP' : undefined}
                  >
                    <span className="sector-name">Departamento Pessoal</span>
                    <span className={`sector-status-pill ${selectedCompany.pendingSectors.includes('DP') ? 'pending' : 'done'}`}>
                      {selectedCompany.pendingSectors.includes('DP') ? 'Pendente' : 'Concluído'}
                    </span>
                  </div>
                  <div
                    className="modal-sector-card"
                    style={{ cursor: onNavigateToSector ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (onNavigateToSector) {
                        onNavigateToSector('contabil');
                        setSelectedCompany(null);
                      }
                    }}
                    title={onNavigateToSector ? 'Clique para ir ao Fechamento Contábil' : undefined}
                  >
                    <span className="sector-name">Contábil</span>
                    <span className={`sector-status-pill ${selectedCompany.pendingSectors.includes('CONTABIL') ? 'pending' : 'done'}`}>
                      {selectedCompany.pendingSectors.includes('CONTABIL') ? 'Pendente' : 'Concluído'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ANOTAÇÕES DE COBRANÇA */}
              {selectedCompany.notesSnippet && (
                <div className="radar-section">
                  <h4>
                    <FileText size={16} /> Anotação / Observação Cadastral
                  </h4>
                  <div className="modal-notes-box">
                    "{selectedCompany.notesSnippet}"
                  </div>
                </div>
              )}

              {/* RESPONSÁVEIS */}
              <div className="radar-section">
                <h4>
                  <Users size={16} /> Analistas Responsáveis Designados
                </h4>
                <div className="modal-resp-list">
                  {selectedCompany.responsibles.map((r, i) => (
                    <div key={i} className="modal-resp-item">
                      <div>
                        <strong>{r.sector}:</strong> {r.name} ({r.email})
                      </div>
                      {r.isOverloaded && (
                        <span className="resp-overload-tag">
                          Fila Alta: {r.pendingCount} empresas pendentes
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="radar-modal-footer">
              <button
                type="button"
                className="btn-modal-copy"
                onClick={(e) => handleCopyAlert(selectedCompany, e)}
              >
                <Copy size={16} />
                <span>Copiar Alerta Formatado</span>
              </button>

              {onNavigateToCompany && (
                <button
                  type="button"
                  className="btn-modal-navigate"
                  onClick={() => {
                    onNavigateToCompany(selectedCompany.id);
                    setSelectedCompany(null);
                  }}
                >
                  <ExternalLink size={16} />
                  <span>Abrir Cadastro da Empresa</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
