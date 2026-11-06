import { useState, useEffect, useMemo } from 'react';
import { API } from '../api';
import {
  Shield,
  Search,
  Building2,
  Copy,
  ExternalLink,
  Check,
  FileSpreadsheet,
  RotateCcw,
} from 'lucide-react';
import { canUserViewCompany } from '../config/companyPermissions';
import { CompanyDetailsModal, formatCnpj } from './CompanyDetailsModal';
import { getCertificateExpirationStatus, formatFlexibleDateBr } from '../config/dateUtils';
import { exportToCsv } from '../utils/exportCsv';
import { formatCompanyCode } from '../utils/codeSort';
import './Certificates.css';

interface Company {
  id: string;
  code?: string | null;
  name: string;
  tradeName?: string | null;
  cnpj: string;
  status: string;
  groupName?: string | null;
  certificateExpiration?: string;
  hasClientCertificate?: boolean;
  certificateType?: string | null;
  certificateIssue?: string | null;
  targetProxyIssueDate?: string | null;
  targetProxyDate?: string | null;
  fgtsProxyIssueDate?: string | null;
  fgtsProxyDate?: string | null;
  decProxyIssueDate?: string | null;
  decProxyDate?: string | null;
  empregadorProxyIssueDate?: string | null;
  empregadorProxyDate?: string | null;
  exitDate?: string | null;
  responsibles?: any[];
}

interface CertificatesProps {
  currentUser: any;
}

type TabType = 'ALL' | 'PROXIES' | 'CERTS';
type UrgencyFilter = 'ALL' | 'EXPIRED' | 'EXPIRING_30' | 'EXPIRING_60' | 'OK' | 'MISSING';

export function Certificates({ currentUser }: CertificatesProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('ALL');
  const [specificProxy, setSpecificProxy] = useState<string>('ALL');
  const [selectedCompanyDetails, setSelectedCompanyDetails] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/companies`);
      if (res.ok) {
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Erro ao buscar empresas:', err);
    } finally {
      setLoading(false);
    }
  };

  const getExpirationStatus = (dateStr?: string | null) => {
    return getCertificateExpirationStatus(dateStr);
  };

  const formatDate = (dateStr?: string | null) => {
    return formatFlexibleDateBr(dateStr);
  };

  // Filtragem dos dados
  const filtered = useMemo(() => {
    return companies.filter((c) => {
      if (c.exitDate) return false; // Ativas apenas
      if (!canUserViewCompany(currentUser, c, null)) return false;

      const search = searchTerm.toLowerCase().trim();
      const matchSearch =
        !search ||
        c.name?.toLowerCase().includes(search) ||
        c.code?.toLowerCase().includes(search) ||
        (c.cnpj && c.cnpj.replace(/\D/g, '').includes(search.replace(/\D/g, ''))) ||
        c.tradeName?.toLowerCase().includes(search) ||
        c.groupName?.toLowerCase().includes(search);

      if (!matchSearch) return false;

      const certStat = getExpirationStatus(c.certificateExpiration);
      const recStat = getExpirationStatus(c.targetProxyDate);
      const fgtsStat = getExpirationStatus(c.fgtsProxyDate);
      const decStat = getExpirationStatus(c.decProxyDate);
      const empStat = getExpirationStatus(c.empregadorProxyDate);

      // Filtro de aba
      if (activeTab === 'CERTS' && !c.hasClientCertificate) return false;
      if (activeTab === 'PROXIES') {
        const hasAnyProxy = !!(c.targetProxyDate || c.fgtsProxyDate || c.decProxyDate || c.empregadorProxyDate);
        if (!hasAnyProxy && urgencyFilter !== 'MISSING') return false;
      }

      // Filtro por tipo específico de procuração
      if (specificProxy === 'RECEITA' && !c.targetProxyDate) return false;
      if (specificProxy === 'FGTS' && !c.fgtsProxyDate) return false;
      if (specificProxy === 'DEC' && !c.decProxyDate) return false;
      if (specificProxy === 'EMPREGADOR' && !c.empregadorProxyDate) return false;

      // Filtro por urgência
      if (urgencyFilter !== 'ALL') {
        const relevantStats =
          activeTab === 'CERTS'
            ? [certStat]
            : activeTab === 'PROXIES'
            ? [recStat, fgtsStat, decStat, empStat]
            : [certStat, recStat, fgtsStat, decStat, empStat];

        if (urgencyFilter === 'EXPIRED') {
          if (!relevantStats.some((s) => s.status === 'EXPIRED')) return false;
        } else if (urgencyFilter === 'EXPIRING_30') {
          if (!relevantStats.some((s) => s.status === 'WARNING')) return false;
        } else if (urgencyFilter === 'EXPIRING_60') {
          if (!relevantStats.some((s) => s.status === 'EXPIRING_60')) return false;
        } else if (urgencyFilter === 'OK') {
          if (!relevantStats.every((s) => s.status === 'OK' || s.status === 'NONE') || !relevantStats.some((s) => s.status === 'OK')) {
            return false;
          }
        } else if (urgencyFilter === 'MISSING') {
          if (activeTab === 'CERTS') {
            if (c.hasClientCertificate) return false;
          } else {
            if (c.targetProxyDate && c.fgtsProxyDate && c.decProxyDate && c.empregadorProxyDate) return false;
          }
        }
      }

      return true;
    });
  }, [companies, searchTerm, activeTab, urgencyFilter, specificProxy, currentUser]);

  // Estatísticas Globais
  const stats = useMemo(() => {
    const active = companies.filter((c) => !c.exitDate);
    const total = active.length;

    let certCount = 0;
    let recCount = 0;
    let fgtsCount = 0;
    let decCount = 0;
    let empCount = 0;
    let expiredCount = 0;
    let expiring30Count = 0;

    for (const c of active) {
      if (c.hasClientCertificate) certCount++;
      if (c.targetProxyDate) recCount++;
      if (c.fgtsProxyDate) fgtsCount++;
      if (c.decProxyDate) decCount++;
      if (c.empregadorProxyDate) empCount++;

      const allStats = [
        getExpirationStatus(c.certificateExpiration),
        getExpirationStatus(c.targetProxyDate),
        getExpirationStatus(c.fgtsProxyDate),
        getExpirationStatus(c.decProxyDate),
        getExpirationStatus(c.empregadorProxyDate),
      ];

      if (allStats.some((s) => s.status === 'EXPIRED')) expiredCount++;
      if (allStats.some((s) => s.status === 'WARNING')) expiring30Count++;
    }

    return {
      total,
      certCount,
      recCount,
      fgtsCount,
      decCount,
      empCount,
      expiredCount,
      expiring30Count,
      criticalTotal: expiredCount + expiring30Count,
    };
  }, [companies]);

  const handleCopyCnpj = async (id: string, cnpj: string) => {
    try {
      await navigator.clipboard.writeText(cnpj.replace(/\D/g, ''));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignora erro de clipboard
    }
  };

  const handleCopyAllFilteredCnpjs = async () => {
    const cleanList = filtered
      .map((c) => c.cnpj?.replace(/\D/g, ''))
      .filter(Boolean)
      .join('\n');

    if (!cleanList) return;

    try {
      await navigator.clipboard.writeText(cleanList);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    } catch {
      // Ignora erro de clipboard
    }
  };

  const handleExportCsv = () => {
    const csvColumns = [
      { header: 'Código', key: 'code' },
      { header: 'Razão Social', key: 'name' },
      { header: 'Nome Fantasia', key: 'tradeName' },
      { header: 'CNPJ', key: 'cnpj' },
      { header: 'Grupo', key: 'groupName' },
      { header: 'Certificado Digital (Status)', key: 'certStatus' },
      { header: 'Certificado Digital (Vencimento)', key: 'certExpiration' },
      { header: 'Proc. Receita Federal (Vencimento)', key: 'targetProxyDate' },
      { header: 'Proc. FGTS Digital (Vencimento)', key: 'fgtsProxyDate' },
      { header: 'Proc. DEC (Vencimento)', key: 'decProxyDate' },
      { header: 'Proc. Empregador Web (Vencimento)', key: 'empregadorProxyDate' },
    ];

    const data = filtered.map((c) => ({
      code: formatCompanyCode(c.code) || '',
      name: c.name || '',
      tradeName: c.tradeName || '',
      cnpj: formatCnpj(c.cnpj) || '',
      groupName: c.groupName || '',
      certStatus: c.hasClientCertificate ? getExpirationStatus(c.certificateExpiration).label : 'Não possui',
      certExpiration: formatDate(c.certificateExpiration),
      targetProxyDate: formatDate(c.targetProxyDate),
      fgtsProxyDate: formatDate(c.fgtsProxyDate),
      decProxyDate: formatDate(c.decProxyDate),
      empregadorProxyDate: formatDate(c.empregadorProxyDate),
    }));

    exportToCsv(`certificados_e_procuracoes_${new Date().toISOString().slice(0, 10)}`, csvColumns, data);
  };

  return (
    <main className="certificates-page">
      <header className="page-header">
        <div className="header-title-container">
          <div className="header-title-left">
            <div className="header-icon-box">
              <Shield size={26} />
            </div>
            <div>
              <h1>Central de Certificados e Procurações</h1>
              <p>Monitoramento ativo de validades, renovações e procurações eletrônicas</p>
            </div>
          </div>

          <div className="header-actions-right">
            <button
              type="button"
              className="btn-secondary-light"
              onClick={handleCopyAllFilteredCnpjs}
              title="Copiar CNPJs das empresas filtradas"
            >
              {copiedAll ? <Check size={15} color="#4ade80" /> : <Copy size={15} />}
              <span>{copiedAll ? 'CNPJs Copiados!' : 'Copiar CNPJs'}</span>
            </button>
            <button
              type="button"
              className="btn-secondary-light"
              onClick={handleExportCsv}
              title="Exportar planilha Excel (CSV)"
            >
              <FileSpreadsheet size={15} />
              <span>Exportar Excel</span>
            </button>
          </div>
        </div>
      </header>

      {/* Cards de Estatísticas com Contadores Clicáveis */}
      <section className="dashboard-stats">
        <div
          className={`stat-card ${urgencyFilter === 'ALL' && activeTab === 'ALL' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('ALL');
            setUrgencyFilter('ALL');
            setSpecificProxy('ALL');
          }}
          title="Clique para listar todas as empresas ativas"
        >
          <div className="stat-info">
            <span className="stat-label">Empresas Ativas</span>
            <span className="stat-value">{stats.total}</span>
          </div>
        </div>

        <div
          className={`stat-card cert-card ${activeTab === 'CERTS' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('CERTS');
            setUrgencyFilter('ALL');
          }}
          title="Clique para filtrar apenas com Certificado Digital"
        >
          <div className="stat-info">
            <span className="stat-label">Certificados Digitais</span>
            <span className="stat-value">
              {stats.certCount} <small style={{ fontSize: '13px', color: '#94a3b8' }}>/ {stats.total}</small>
            </span>
          </div>
        </div>

        <div
          className={`stat-card proxy-card ${activeTab === 'PROXIES' && specificProxy === 'RECEITA' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('PROXIES');
            setSpecificProxy('RECEITA');
          }}
          title="Clique para filtrar Procurações da Receita Federal"
        >
          <div className="stat-info">
            <span className="stat-label">Proc. Receita / eCAC</span>
            <span className="stat-value">{stats.recCount}</span>
          </div>
        </div>

        <div
          className={`stat-card proxy-card ${activeTab === 'PROXIES' && specificProxy === 'FGTS' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('PROXIES');
            setSpecificProxy('FGTS');
          }}
          title="Clique para filtrar Procurações do FGTS Digital"
        >
          <div className="stat-info">
            <span className="stat-label">Proc. FGTS Digital</span>
            <span className="stat-value">{stats.fgtsCount}</span>
          </div>
        </div>

        <div
          className={`stat-card alert-card ${urgencyFilter === 'EXPIRED' || urgencyFilter === 'EXPIRING_30' ? 'active' : ''}`}
          onClick={() => {
            setUrgencyFilter((prev) => (prev === 'EXPIRING_30' ? 'ALL' : 'EXPIRING_30'));
          }}
          title="Clique para filtrar documentos vencidos ou vencendo em até 30 dias"
        >
          <div className="stat-info">
            <span className="stat-label" style={{ color: '#f87171' }}>
              Atenção Imediata (≤ 30d)
            </span>
            <span className="stat-value" style={{ color: '#ef4444' }}>
              {stats.criticalTotal}
            </span>
          </div>
        </div>
      </section>

      {/* Barra de Abas de Navegação */}
      <div className="certificates-tabs-bar">
        <button
          type="button"
          className={`cert-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('ALL');
            setSpecificProxy('ALL');
          }}
        >
          <Shield size={16} />
          <span>Visão Geral (Todos os Documentos)</span>
          <span className="tab-pill-count">{stats.total}</span>
        </button>

        <button
          type="button"
          className={`cert-tab-btn ${activeTab === 'PROXIES' ? 'active' : ''}`}
          onClick={() => setActiveTab('PROXIES')}
        >
          <Building2 size={16} />
          <span>Procurações Eletrônicas</span>
          <span className="tab-pill-count">{stats.recCount + stats.fgtsCount}</span>
        </button>

        <button
          type="button"
          className={`cert-tab-btn ${activeTab === 'CERTS' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('CERTS');
            setSpecificProxy('ALL');
          }}
        >
          <Shield size={16} />
          <span>Apenas Certificados Digitais</span>
          <span className="tab-pill-count">{stats.certCount}</span>
        </button>
      </div>

      {/* Controles da Tabela */}
      <section className="table-controls">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por código, empresa, CNPJ ou grupo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filtro por Urgência */}
        <select value={urgencyFilter} onChange={(e) => setUrgencyFilter(e.target.value as UrgencyFilter)}>
          <option value="ALL">Validade: Todos os Prazos</option>
          <option value="EXPIRED">🔴 Apenas Vencidos</option>
          <option value="EXPIRING_30">🟡 Vencendo em até 30 dias</option>
          <option value="EXPIRING_60">🟠 Vencendo em 31 a 60 dias</option>
          <option value="OK">🟢 Válidos (&gt; 60 dias)</option>
          <option value="MISSING">⚪ Não Cadastrado / Ausente</option>
        </select>

        {/* Filtro Específico de Procuração (quando na aba de Procurações) */}
        {activeTab === 'PROXIES' && (
          <select value={specificProxy} onChange={(e) => setSpecificProxy(e.target.value)}>
            <option value="ALL">Procuração: Todas as 4</option>
            <option value="RECEITA">Apenas Receita / eCAC</option>
            <option value="FGTS">Apenas FGTS Digital</option>
            <option value="DEC">Apenas Caixa Postal DEC</option>
            <option value="EMPREGADOR">Apenas Portal Empregador</option>
          </select>
        )}

        {(urgencyFilter !== 'ALL' || specificProxy !== 'ALL' || searchTerm) && (
          <button
            type="button"
            className="filter-clear-btn"
            title="Limpar todos os filtros"
            onClick={() => {
              setUrgencyFilter('ALL');
              setSpecificProxy('ALL');
              setSearchTerm('');
            }}
          >
            <RotateCcw size={14} />
            <span>Limpar Filtros</span>
          </button>
        )}

        <div className="table-count-meta">
          <span>
            {loading ? 'Carregando...' : `${filtered.length} de ${stats.total} empresas`}
          </span>
        </div>
      </section>

      {/* Tabela de Monitoramento */}
      <section className="table-container">
        {loading ? (
          <div className="loading-state">
            <Search size={32} />
            <p>Carregando monitoramento de documentos...</p>
          </div>
        ) : (
          <div className="certificates-table-wrapper">
            <table className="certificates-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  {activeTab !== 'PROXIES' && <th>Certificado Digital</th>}
                  {activeTab !== 'CERTS' && (
                    <>
                      <th>Proc. Receita (eCAC)</th>
                      <th>Proc. FGTS Digital</th>
                      <th>Caixa Postal DEC</th>
                      <th>Portal Empregador</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const certStat = getExpirationStatus(c.certificateExpiration);
                  const recStat = getExpirationStatus(c.targetProxyDate);
                  const fgtsStat = getExpirationStatus(c.fgtsProxyDate);
                  const decStat = getExpirationStatus(c.decProxyDate);
                  const empStat = getExpirationStatus(c.empregadorProxyDate);

                  return (
                    <tr key={c.id}>
                      {/* Célula da Empresa */}
                      <td className="company-col">
                        <div className="cert-company-wrapper">
                          <div className="cert-company-header">
                            <span className="cert-company-code">
                              {formatCompanyCode(c.code) || '—'}
                            </span>
                            <button
                              type="button"
                              className="cert-company-name-btn"
                              onClick={() => setSelectedCompanyDetails(c)}
                              title="Ver ficha cadastral completa da empresa"
                            >
                              <span>{c.name}</span>
                              <ExternalLink size={11} />
                            </button>
                          </div>

                          <div className="cert-company-meta-row">
                            <button
                              type="button"
                              className="cert-cnpj-pill"
                              onClick={() => handleCopyCnpj(c.id, c.cnpj)}
                              title="Clique para copiar CNPJ"
                            >
                              <span>{formatCnpj(c.cnpj)}</span>
                              {copiedId === c.id ? (
                                <Check size={11} color="#4ade80" />
                              ) : (
                                <Copy size={11} />
                              )}
                            </button>
                            {c.groupName && (
                              <span className="cert-group-tag">{c.groupName}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Certificado Digital */}
                      {activeTab !== 'PROXIES' && (
                        <td>
                          <div
                            className={`status-badge ${
                              c.hasClientCertificate ? certStat.status : 'NONE'
                            }`}
                          >
                            {c.hasClientCertificate ? (
                              <>
                                <strong>{certStat.label}</strong>
                                {c.certificateExpiration && (
                                  <span>Venc: {formatDate(c.certificateExpiration)}</span>
                                )}
                                {c.certificateType && (
                                  <small className="cert-type-tag">{c.certificateType}</small>
                                )}
                              </>
                            ) : (
                              <strong>Não possui</strong>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Procurações */}
                      {activeTab !== 'CERTS' && (
                        <>
                          {/* Receita Federal */}
                          <td>
                            <div className={`status-badge ${c.targetProxyDate ? recStat.status : 'NONE'}`}>
                              {c.targetProxyDate ? (
                                <>
                                  <strong>{recStat.label}</strong>
                                  <span>Venc: {formatDate(c.targetProxyDate)}</span>
                                  {c.targetProxyIssueDate && (
                                    <small className="doc-issue-tag">
                                      Emissão: {formatDate(c.targetProxyIssueDate)}
                                    </small>
                                  )}
                                </>
                              ) : (
                                <strong>Não possui</strong>
                              )}
                            </div>
                          </td>

                          {/* FGTS Digital */}
                          <td>
                            <div className={`status-badge ${c.fgtsProxyDate ? fgtsStat.status : 'NONE'}`}>
                              {c.fgtsProxyDate ? (
                                <>
                                  <strong>{fgtsStat.label}</strong>
                                  <span>Venc: {formatDate(c.fgtsProxyDate)}</span>
                                  {c.fgtsProxyIssueDate && (
                                    <small className="doc-issue-tag">
                                      Emissão: {formatDate(c.fgtsProxyIssueDate)}
                                    </small>
                                  )}
                                </>
                              ) : (
                                <strong>Não possui</strong>
                              )}
                            </div>
                          </td>

                          {/* Caixa Postal DEC */}
                          <td>
                            <div className={`status-badge ${c.decProxyDate ? decStat.status : 'NONE'}`}>
                              {c.decProxyDate ? (
                                <>
                                  <strong>{decStat.label}</strong>
                                  <span>Venc: {formatDate(c.decProxyDate)}</span>
                                  {c.decProxyIssueDate && (
                                    <small className="doc-issue-tag">
                                      Emissão: {formatDate(c.decProxyIssueDate)}
                                    </small>
                                  )}
                                </>
                              ) : (
                                <strong>Não possui</strong>
                              )}
                            </div>
                          </td>

                          {/* Portal Empregador */}
                          <td>
                            <div
                              className={`status-badge ${
                                c.empregadorProxyDate ? empStat.status : 'NONE'
                              }`}
                            >
                              {c.empregadorProxyDate ? (
                                <>
                                  <strong>{empStat.label}</strong>
                                  <span>Venc: {formatDate(c.empregadorProxyDate)}</span>
                                  {c.empregadorProxyIssueDate && (
                                    <small className="doc-issue-tag">
                                      Emissão: {formatDate(c.empregadorProxyIssueDate)}
                                    </small>
                                  )}
                                </>
                              ) : (
                                <strong>Não possui</strong>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={activeTab === 'CERTS' ? 2 : activeTab === 'PROXIES' ? 5 : 6}>
                      <div className="empty-state">
                        <Search size={32} />
                        <p>Nenhuma empresa encontrada com os filtros selecionados.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal de Detalhes da Empresa */}
      {selectedCompanyDetails && (
        <CompanyDetailsModal
          company={selectedCompanyDetails}
          currentUser={currentUser}
          onClose={() => setSelectedCompanyDetails(null)}
        />
      )}
    </main>
  );
}
