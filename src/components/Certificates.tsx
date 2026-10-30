import { useState, useEffect, useMemo } from 'react';
import { API } from '../api';
import { Shield, Search } from 'lucide-react';
import { canUserViewCompany } from '../config/companyPermissions';
import './Certificates.css';

interface Company {
  id: string;
  name: string;
  cnpj: string;
  status: string;
  certificateExpiration?: string;
  hasClientCertificate?: boolean;
  targetProxyDate?: string;
  fgtsProxyDate?: string;
  decProxyDate?: string;
  empregadorProxyDate?: string;
  exitDate?: string;
}

interface CertificatesProps {
  currentUser: any;
}

export function Certificates({ currentUser }: CertificatesProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const res = await fetch(`${API}/api/companies`);
      if (res.ok) {
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getExpirationStatus = (dateStr?: string | null) => {
    if (!dateStr) return { status: 'NONE', label: 'Não possui', color: '#64748b', days: 0 };
    
    // As datas do banco vêm como UTC ISO (ex: 2026-10-07T00:00:00.000Z)
    // Precisamos ajustar para o fuso local para evitar perda de 1 dia dependendo do fuso
    const expDate = new Date(dateStr);
    const tzOffset = expDate.getTimezoneOffset() * 60000;
    const localExpDate = new Date(expDate.getTime() + tzOffset);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = localExpDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { status: 'EXPIRED', label: 'Vencido', color: '#ef4444', days: diffDays };
    if (diffDays <= 30) return { status: 'WARNING', label: `Vence em ${diffDays} d`, color: '#f59e0b', days: diffDays };
    return { status: 'OK', label: `Válido (${diffDays} d)`, color: '#10b981', days: diffDays };
  };

  const filtered = useMemo(() => {
    return companies.filter(c => {
      if (c.exitDate) return false; // Ativas apenas
      if (!canUserViewCompany(currentUser, c, null)) return false;
      
      const search = searchTerm.toLowerCase();
      const matchSearch = c.name?.toLowerCase().includes(search) || c.cnpj?.includes(search);
      
      const certStat = getExpirationStatus(c.certificateExpiration);
      const recStat = getExpirationStatus(c.targetProxyDate);
      const fgtsStat = getExpirationStatus(c.fgtsProxyDate);
      const decStat = getExpirationStatus(c.decProxyDate);
      const empStat = getExpirationStatus(c.empregadorProxyDate);

      let matchFilter = true;
      if (filterType === 'CERT') matchFilter = Boolean(c.hasClientCertificate);
      if (filterType === 'RECEITA') matchFilter = !!c.targetProxyDate;
      if (filterType === 'FGTS') matchFilter = !!c.fgtsProxyDate;
      if (filterType === 'DEC') matchFilter = !!c.decProxyDate;
      if (filterType === 'EMPREGADOR') matchFilter = !!c.empregadorProxyDate;
      if (filterType === 'WARNING') {
        matchFilter = [certStat, recStat, fgtsStat, decStat, empStat].some(s => s.status === 'WARNING' || s.status === 'EXPIRED');
      }

      return matchSearch && matchFilter;
    });
  }, [companies, searchTerm, filterType, currentUser]);

  const stats = useMemo(() => {
    const active = companies.filter(c => !c.exitDate);
    return {
      total: active.length,
      cert: active.filter(c => c.hasClientCertificate).length,
      receita: active.filter(c => c.targetProxyDate).length,
      fgts: active.filter(c => c.fgtsProxyDate).length,
      dec: active.filter(c => c.decProxyDate).length,
      emp: active.filter(c => c.empregadorProxyDate).length,
      warnings: active.filter(c => {
        return [
          getExpirationStatus(c.certificateExpiration).status,
          getExpirationStatus(c.targetProxyDate).status,
          getExpirationStatus(c.fgtsProxyDate).status,
          getExpirationStatus(c.decProxyDate).status,
          getExpirationStatus(c.empregadorProxyDate).status
        ].some(s => s === 'WARNING' || s === 'EXPIRED');
      }).length
    };
  }, [companies]);

  return (
    <main className="certificates-page">
      <header className="page-header">
        <div>
          <h1><Shield size={26} /> Certificados e Procurações</h1>
          <p>Monitoramento de vencimentos e renovações</p>
        </div>
      </header>

      <section className="dashboard-stats" style={{ marginBottom: '20px' }}>
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Com Certificado Digital</span>
            <span className="stat-value">{stats.cert}/{stats.total}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Procuração Receita/eCAC</span>
            <span className="stat-value">{stats.receita}/{stats.total}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Procuração FGTS Digital</span>
            <span className="stat-value">{stats.fgts}/{stats.total}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Atenção Necessária</span>
            <span className="stat-value" style={{color: '#ef4444'}}>{stats.warnings}</span>
          </div>
        </div>
      </section>

      <section className="table-controls">
        <div className="search-box">
          <Search size={18} />
          <input type="text" placeholder="Buscar empresa..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="ALL">Todas Ativas</option>
          <option value="CERT">Com Certificado</option>
          <option value="RECEITA">Com Proc. Receita</option>
          <option value="FGTS">Com Proc. FGTS</option>
          <option value="DEC">Com Proc. DEC</option>
          <option value="EMPREGADOR">Com Proc. Empregador</option>
          <option value="WARNING">Vencendo ou Vencidos</option>
        </select>
      </section>

      <section className="table-container">
        {loading ? (
          <div className="loading-state">
            <Search size={32} />
            <p>Carregando certificados...</p>
          </div>
        ) : (
          <table className="certificates-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Certificado Digital</th>
                <th>Proc. Receita (eCAC)</th>
                <th>Proc. FGTS Digital</th>
                <th>Caixa Postal DEC</th>
                <th>Portal Empregador</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const certStat = getExpirationStatus(c.certificateExpiration);
                const recStat = getExpirationStatus(c.targetProxyDate);
                const fgtsStat = getExpirationStatus(c.fgtsProxyDate);
                const decStat = getExpirationStatus(c.decProxyDate);
                const empStat = getExpirationStatus(c.empregadorProxyDate);

                const formatDate = (dateStr?: string | null) => {
                  if (!dateStr) return '';
                  const d = new Date(dateStr);
                  const tzOffset = d.getTimezoneOffset() * 60000;
                  return new Date(d.getTime() + tzOffset).toLocaleDateString('pt-BR');
                };

                return (
                  <tr key={c.id}>
                    <td>
                      <div className="company-cell-wrapper">
                        <strong>{c.name}</strong>
                        <small>CNPJ: {c.cnpj}</small>
                      </div>
                    </td>
                    <td>
                      <div className={`status-badge ${c.hasClientCertificate ? certStat.status : 'NONE'}`}>
                        {c.hasClientCertificate ? (
                          <>
                            <strong>{certStat.label}</strong>
                            {c.certificateExpiration && <span>{formatDate(c.certificateExpiration)}</span>}
                          </>
                        ) : (
                          <strong>Não possui</strong>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={`status-badge ${c.targetProxyDate ? recStat.status : 'NONE'}`}>
                        {c.targetProxyDate ? (
                          <>
                            <strong>{recStat.label}</strong>
                            <span>{formatDate(c.targetProxyDate)}</span>
                          </>
                        ) : (
                          <strong>Não possui</strong>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={`status-badge ${c.fgtsProxyDate ? fgtsStat.status : 'NONE'}`}>
                        {c.fgtsProxyDate ? (
                          <>
                            <strong>{fgtsStat.label}</strong>
                            <span>{formatDate(c.fgtsProxyDate)}</span>
                          </>
                        ) : (
                          <strong>Não possui</strong>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={`status-badge ${c.decProxyDate ? decStat.status : 'NONE'}`}>
                        {c.decProxyDate ? (
                          <>
                            <strong>{decStat.label}</strong>
                            <span>{formatDate(c.decProxyDate)}</span>
                          </>
                        ) : (
                          <strong>Não possui</strong>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={`status-badge ${c.empregadorProxyDate ? empStat.status : 'NONE'}`}>
                        {c.empregadorProxyDate ? (
                          <>
                            <strong>{empStat.label}</strong>
                            <span>{formatDate(c.empregadorProxyDate)}</span>
                          </>
                        ) : (
                          <strong>Não possui</strong>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Search size={32} />
                      <p>Nenhuma empresa encontrada com os filtros atuais.</p>
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
