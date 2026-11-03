import { latestOpenPeriod } from '../config/competenceCalendar';
import { useCompetenceCalendar } from './useCompetenceCalendar';
import { useEffect, useState } from 'react';
import { 
  Building2, 
  Users, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  ChevronDown, 
  LogOut, 
  CalendarClock,
  Search,
  X,
  UserCheck,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  AlertCircle,
  Bell,
  FileSpreadsheet,
} from 'lucide-react';
import './Dashboard.css';
import './Progress.css';
import './Closings.css';
import { Sidebar } from './Sidebar';
import { ManualCompetenceModal } from './ManualCompetenceModal';
import { DashboardSkeleton, LoadingSpinner } from './LoadingSkeleton';
import { SmartAlertDrawer } from './SmartAlertDrawer';
import { ExecutiveReportModal } from './ExecutiveReportModal';
import type { CurrentUser } from '../types/auth';
import { API } from '../api';

interface MovementItem {
  id: string;
  name: string;
  taxRegime: string;
  date: string;
}

interface SectorProgress {
  type: string;
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  percent: number;
  totalFields?: number;
  completedFields?: number;
}

interface CompanyResponsibleItem {
  id: string;
  sector: string | null;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

interface CompanyItem {
  id: string;
  name: string;
  cnpj: string;
  taxRegime: string;
  contractDate: string | null;
  obligationStartDate: string;
  exitDate: string | null;
  responsibles?: CompanyResponsibleItem[];
}

interface AvailableMonth {
  year: number;
  month: number;
  label: string;
  iso: string;
}

interface DashboardStats {
  referencePeriod?: string;
  totalActive: number;
  totalEmployees: number;
  regimes: Record<string, number>;
  movements?: Record<string, MovementItem[]>;
  progress?: SectorProgress[];
  companies?: CompanyItem[];
  availableMonths?: AvailableMonth[];
}

// ===== Configuração visual =====
const SECTOR_CONFIG: Record<string, { label: string; color: string }> = {
  CONTABIL: { label: 'Contábil', color: '#8b5cf6' },
  FISCAL: { label: 'Fiscal', color: '#10b981' },
  PARCELAMENTO: { label: 'Parcelamento', color: '#f59e0b' },
  DP: { label: 'DP', color: '#3b82f6' },
  CUSHMAN: { label: 'Cushman', color: '#ef4444' },
};

const MOVEMENT_GROUPS = [
  { key: 'enteredThisMonth', title: 'Entraram esse mês', variant: 'success', Icon: TrendingUp },
  { key: 'enteringFuture', title: 'Entrarão futuramente', variant: 'success-light', Icon: CalendarClock },
  { key: 'leftThisMonth', title: 'Saíram esse mês', variant: 'danger', Icon: LogOut },
  { key: 'leavingThisMonth', title: 'Sairão esse mês', variant: 'danger', Icon: TrendingDown },
  { key: 'leavingFuture', title: 'Sairão futuramente', variant: 'danger-light', Icon: CalendarClock },
];

const REGIME_CONFIG: { key: string; name: string; class: string }[] = [
  { key: 'MEI', name: 'MEI', class: 'card-mei' },
  { key: 'SIMPLES_NACIONAL', name: 'Simples Nacional', class: 'card-simples' },
  { key: 'LUCRO_PRESUMIDO', name: 'Lucro Presumido', class: 'card-presumido' },
  { key: 'LUCRO_REAL_TRIMESTRAL', name: 'Lucro Real / Trimestral', class: 'card-real-trimestral' },
  { key: 'LUCRO_REAL_ESTIMATIVA', name: 'Lucro Real / Estimativa', class: 'card-real-estimativa' },
  { key: 'LUCRO_REAL_ANUAL', name: 'Lucro Real / Anual', class: 'card-real-anual' },
  { key: 'IMUNE_IRPJ', name: 'Imune IRPJ', class: 'card-imune' },
  { key: 'CONDOMINIOS', name: 'Condomínios', class: 'card-condominio' },
  { key: 'DOMESTICA', name: 'Doméstica', class: 'card-domestica' },
  { key: 'ASSOCIACOES', name: 'Associações', class: 'card-associacao' },
  { key: 'PESSOA_FISICA', name: 'Pessoa Física', class: 'card-pf' },
];

const REGIME_LABEL: Record<string, string> = {
  MEI: 'MEI',
  SIMPLES_NACIONAL: 'Simples Nacional',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL_TRIMESTRAL: 'Lucro Real / Trimestral',
  LUCRO_REAL_ESTIMATIVA: 'Lucro Real / Estimativa',
  LUCRO_REAL_ANUAL: 'Lucro Real / Anual',
  IMUNE_IRPJ: 'Imune IRPJ',
  CONDOMINIOS: 'Condomínios',
  DOMESTICA: 'Doméstica',
  ASSOCIACOES: 'Associações',
  PESSOA_FISICA: 'Pessoa Física',
};

const ROLE_LABEL_MAP: Record<string, string> = {
  ADMIN: 'Administrador',
  SOCIO: 'Sócio',
  FISCAL: 'Fiscal',
  DP: 'DP',
  CONTABIL: 'Contábil',
  FINANCEIRO: 'Financeiro',
  CADASTRO: 'Cadastro',
  CUSHMAN: 'Cushman',
};

const formatDate = (iso: string) => {
  if (!iso) return '-';
  const clean = String(iso).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) return clean;
  const ymd = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  const d = new Date(clean);
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
};

const formatCNPJ = (cnpj: string) => {
  if (!cnpj) return '';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length === 14) {
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (clean.length === 11) {
    return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return cnpj;
};

// Competência padrão é sempre 1 mês antes da data real (ex: em outubro a obrigação é setembro)
const getDefaultCompetence = () => {
  const period = latestOpenPeriod();
  return {year:period.getUTCFullYear(),month:period.getUTCMonth()};
};

interface DashboardProps {
  currentView: string;
  onNavigate: (view: string) => void;
  currentUser?: CurrentUser | null;
  onLogout?: () => void;
}

export function Dashboard({ currentView, onNavigate, currentUser, onLogout }: DashboardProps) {
  const latestPeriod = useCompetenceCalendar();
  const defaultComp = getDefaultCompetence();
  const [selectedYear, setSelectedYear] = useState(defaultComp.year);
  const [selectedMonth, setSelectedMonth] = useState(defaultComp.month); // 0-11
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRegime, setSelectedRegime] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Alertas e Relatório Executivo
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    fetch(`${API}/api/alerts/summary`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.totalCount !== undefined) setAlertCount(data.totalCount);
      })
      .catch(() => {});
  }, []);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [progressMode, setProgressMode] = useState<'COMPANIES' | 'FIELDS'>('FIELDS');

  const fetchStats = (year: number, month: number, showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    fetch(`${API}/api/dashboard?year=${year}&month=${month + 1}&userId=${currentUser?.id || ''}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          console.error("Backend error:", data.error);
          setStats({
            totalActive: 0,
            totalEmployees: 0,
            regimes: { MEI: 0, SIMPLES_NACIONAL: 0, LUCRO_PRESUMIDO: 0, LUCRO_REAL_TRIMESTRAL: 0, LUCRO_REAL_ESTIMATIVA: 0, LUCRO_REAL_ANUAL: 0, IMUNE_IRPJ: 0, CONDOMINIOS: 0, DOMESTICA: 0, ASSOCIACOES: 0, PESSOA_FISICA: 0 },
            companies: [],
            availableMonths: []
          });
        } else {
          setStats(data);
        }
      })
      .catch(err => console.error("Erro ao buscar stats", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats(selectedYear, selectedMonth, !stats);
  }, [selectedYear, selectedMonth]);

  const availableMonths = (stats?.availableMonths || []).filter(period => Date.UTC(period.year,period.month,1) <= latestPeriod.getTime());
  const currentMonthIdx = availableMonths.findIndex(
    m => m.year === selectedYear && m.month === selectedMonth
  );

  const handlePrevMonth = () => {
    if (currentMonthIdx > 0) {
      const prev = availableMonths[currentMonthIdx - 1];
      setSelectedYear(prev.year);
      setSelectedMonth(prev.month);
    }
  };

  const handleNextMonth = () => {
    if (currentMonthIdx >= 0 && currentMonthIdx < availableMonths.length - 1) {
      const next = availableMonths[currentMonthIdx + 1];
      setSelectedYear(next.year);
      setSelectedMonth(next.month);
    }
  };

  const handleSelectAvailableMonth = (m: AvailableMonth) => {
    setSelectedYear(m.year);
    setSelectedMonth(m.month);
    setIsMonthPickerOpen(false);
  };

  const handleCardClick = (regimeKey: string) => {
    setSelectedRegime(prev => prev === regimeKey ? null : regimeKey);
    setSearchFilter('');
  };

  const selectedRegimeMeta = selectedRegime ? REGIME_CONFIG.find(r => r.key === selectedRegime) : null;
  
  const filteredCompanies = (stats?.companies || []).filter(c => {
    if (selectedRegime && c.taxRegime !== selectedRegime) return false;
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return c.name.toLowerCase().includes(term) || c.cnpj.includes(term);
  });

  const monthCode = `${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`;
  const isDefaultCompetence = selectedYear === defaultComp.year && selectedMonth === defaultComp.month;

  const hasPrev = currentMonthIdx > 0;
  const hasNext = currentMonthIdx >= 0 && currentMonthIdx < availableMonths.length - 1;

  return (
    <div className="crm-dashboard">
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate as any}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <main className="crm-main">
        <header className="crm-header">
          <div className="page-header">
            <h1><Building2 size={24} /> Empresas Ativas</h1>
            
            <div className="month-inline-picker">
              <button 
                className={`nav-arrow-btn ${!hasPrev ? 'disabled' : ''}`} 
                onClick={handlePrevMonth}
                disabled={!hasPrev}
                title={hasPrev ? `Mês Anterior (${String(availableMonths[currentMonthIdx - 1]?.month + 1).padStart(2, '0')}/${availableMonths[currentMonthIdx - 1]?.year})` : 'Sem meses anteriores'}
              >
                ◀
              </button>

              <div className="month-dropdown-container">
                <button 
                  className={`month-trigger-btn ${isMonthPickerOpen ? 'active' : ''}`}
                  onClick={() => setIsMonthPickerOpen(!isMonthPickerOpen)}
                  title="Clique para escolher entre os meses de fechamento"
                >
                  <Calendar size={15} className="trigger-icon" />
                  <span className="trigger-code">{monthCode}</span>
                  {isDefaultCompetence && <span className="trigger-tag">Vigente</span>}
                  <ChevronDown size={14} className={`trigger-arrow ${isMonthPickerOpen ? 'open' : ''}`} />
                </button>

                {isMonthPickerOpen && (
                  <>
                    <div className="dropdown-overlay" onClick={() => setIsMonthPickerOpen(false)} />
                    <div className="month-dropdown-menu">
                      <div className="dropdown-header">
                        <span>Meses de Fechamento</span>
                        <button className="dropdown-close-btn" onClick={() => setIsMonthPickerOpen(false)}>
                          <X size={14} />
                        </button>
                      </div>

                      <div className="month-boxes-grid">
                        {availableMonths.map((m) => {
                          const isSelected = selectedYear === m.year && selectedMonth === m.month;
                          const isCur = m.year === defaultComp.year && m.month === defaultComp.month;
                          const code = `${String(m.month + 1).padStart(2, '0')}/${m.year}`;
                          return (
                            <button
                              key={`${m.year}-${m.month}`}
                              className={`month-box-btn ${isSelected ? 'selected' : ''}`}
                              onClick={() => handleSelectAvailableMonth(m)}
                            >
                              <span className="box-code">{code}</span>
                              {isCur && <span className="box-tag">Vigente</span>}
                            </button>
                          );
                        })}
                      </div>

                      <div className="dropdown-footer" style={{color:'#94a3b8',fontSize:'0.75rem',padding:'12px',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                        <div>Abertura automática na virada do mês · horário de Brasília</div>
                        <button
                          type="button"
                          className="btn-secondary-light"
                          style={{ marginTop: '8px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                          onClick={() => { setIsMonthPickerOpen(false); setIsManualModalOpen(true); }}
                        >
                          <CalendarPlus size={14} />
                          Abrir Competência Manual
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <button 
                className={`nav-arrow-btn ${!hasNext ? 'disabled' : ''}`} 
                onClick={handleNextMonth}
                disabled={!hasNext}
                title={hasNext ? `Próximo Mês (${String(availableMonths[currentMonthIdx + 1]?.month + 1).padStart(2, '0')}/${availableMonths[currentMonthIdx + 1]?.year})` : 'Sem meses posteriores'}
              >
                ▶
              </button>
            </div>
          </div>

          <div className="crm-header-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="btn-executive-report"
              title="Gerar Relatório Executivo da Competência"
              onClick={() => setIsReportOpen(true)}
            >
              <FileSpreadsheet size={16} />
              <span>Relatório Executivo</span>
            </button>

            <button
              type="button"
              className="smart-alert-bell-btn"
              title={alertCount > 0 ? `${alertCount} alertas no sistema` : 'Central de Alertas'}
              onClick={() => setIsAlertDrawerOpen(true)}
            >
              <Bell size={18} />
              {alertCount > 0 && <span className="bell-badge-count">{alertCount}</span>}
            </button>

            {currentUser && (
              <div className="crm-user">
                <div className="avatar">{(currentUser.name || currentUser.email)[0].toUpperCase()}</div>
                <div className="crm-user-details">
                  <span className="user-name">{currentUser.name || currentUser.email.split('@')[0]}</span>
                  <span className="user-role-tag">{ROLE_LABEL_MAP[currentUser.role] || currentUser.role}</span>
                </div>
              </div>
            )}
          </div>
        </header>



        <div className="dashboard-content">
          {loading && !stats ? (
            <DashboardSkeleton />
          ) : !stats ? (
            <LoadingSpinner text="Carregando dados da competência..." />
          ) : (
            <>
              {/* Regime Cards Grid */}
              <div className="regimes-section-header">
                <span className="section-subtitle">
                  Competência <strong>{monthCode}</strong> · Clique em um regime tributário para visualizar empresas
                </span>
              </div>

              <div className="tax-regimes-grid">
                {REGIME_CONFIG.map(card => {
                  const count = stats.regimes[card.key] || 0;
                  const isSelected = selectedRegime === card.key;
                  return (
                    <div 
                      key={card.key} 
                      className={`regime-card ${card.class} ${isSelected ? 'active-regime' : ''}`}
                      onClick={() => handleCardClick(card.key)}
                      title={`Clique para ver empresas de ${card.name}`}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="regime-icon-wrapper">
                        <Building2 size={22} />
                      </div>
                      <span className="regime-name">{card.name}</span>
                      <div className="regime-card-footer">
                        <span className="regime-count">{count}</span>
                        <span className="regime-tag-click">
                          {isSelected ? 'Selecionado' : 'Ver lista'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Modal de Empresas do Regime Selecionado */}
              {selectedRegime && (
                <div className="closing-modal-backdrop" onClick={() => setSelectedRegime(null)}>
                  <div className="closing-modal-content dashboard-regime-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '90%' }}>
                    <div className="closing-modal-header">
                      <div className="closing-modal-title purple">
                        <Building2 size={22} />
                        {selectedRegimeMeta?.name || selectedRegime}
                      </div>
                      <button 
                        className="closing-modal-close-btn" 
                        onClick={() => setSelectedRegime(null)}
                        title="Fechar visualização de empresas"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <div className="closing-modal-body" style={{ padding: '0 0 1.5rem 0' }}>
                      <div className="regime-panel-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="regime-panel-title">
                          <span className="regime-panel-count" style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                            {filteredCompanies.length} {filteredCompanies.length === 1 ? 'empresa encontrada' : 'empresas encontradas'}
                          </span>
                        </div>

                        <div className="regime-panel-actions">
                          <div className="regime-search-box">
                            <Search size={16} />
                            <input 
                              type="text" 
                              placeholder="Buscar por nome ou CNPJ..."
                              value={searchFilter}
                              onChange={(e) => setSearchFilter(e.target.value)}
                              autoFocus
                            />
                            {searchFilter && (
                              <button className="clear-search-btn" onClick={() => setSearchFilter('')}>
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="regime-table-wrapper" style={{ padding: '0 1.5rem' }}>
                        {filteredCompanies.length === 0 ? (
                          <div className="regime-empty-state">
                            <AlertCircle size={36} />
                            <p>Nenhuma empresa encontrada para o filtro informado.</p>
                          </div>
                        ) : (
                      <table className="regime-companies-table">
                        <thead>
                          <tr>
                            <th>EMPRESA</th>
                            <th>CNPJ</th>
                            <th>INÍCIO OBRIGAÇÃO</th>
                            <th>RESPONSÁVEIS (EQUIPE)</th>
                            <th>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCompanies.map(comp => {
                            const responsibles = comp.responsibles || [];
                            const isExiting = !!comp.exitDate;
                            return (
                              <tr key={comp.id}>
                                <td className="company-cell-name">
                                  <strong>{comp.name}</strong>
                                </td>
                                <td className="company-cell-cnpj">
                                  <code>{formatCNPJ(comp.cnpj)}</code>
                                </td>
                                <td className="company-cell-date">
                                  <span className="date-badge">
                                    <Calendar size={13} />
                                    {formatDate(comp.obligationStartDate)}
                                  </span>
                                </td>
                                <td className="company-cell-responsibles">
                                  {responsibles.length === 0 ? (
                                    <span className="no-resp-badge">Sem responsável definido</span>
                                  ) : (
                                    <div className="resp-chips-container">
                                      {responsibles.map((r, i) => (
                                        <span key={i} className="resp-chip" title={`${r.user.name} (${r.user.role}) - ${r.sector || 'Geral'}`}>
                                          <UserCheck size={12} />
                                          <strong className="resp-sector">{r.sector || 'Geral'}:</strong>
                                          <span className="resp-user-name">{r.user.name || r.user.email}</span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="company-cell-status">
                                  {isExiting ? (
                                    <span className="status-badge status-exiting">
                                      Saída: {formatDate(comp.exitDate!)}
                                    </span>
                                  ) : (
                                    <span className="status-badge status-active">
                                      <CheckCircle2 size={13} />
                                      Ativa
                                    </span>
                                  )}
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
          )}

              {/* Dashboard Total Summary */}
              <div className="dashboard-summary">
                <div className="summary-item">
                  <Building2 size={20} />
                  <span>Total Empresas <strong>{stats.totalActive}</strong></span>
                </div>
                <div className="summary-item">
                  <Users size={20} />
                  <span>Funcionários <strong>{stats.totalEmployees}</strong></span>
                </div>
              </div>

              {/* Progresso dos Setores */}
              <div className="progress-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className="section-title">Andamento do Fechamento ({monthCode})</h2>
                  <button 
                    className="btn btn-outline" 
                    style={{ fontSize: '0.875rem', padding: '0.25rem 0.75rem' }}
                    onClick={() => setProgressMode(p => p === 'FIELDS' ? 'COMPANIES' : 'FIELDS')}
                  >
                    Alternar Tipo de Progresso
                  </button>
                </div>
                <div className="progress-grid">
                  {(stats.progress || []).map(sector => {
                    const cfg = SECTOR_CONFIG[sector.type] || { label: sector.type, color: '#94a3b8' };
                    const isFields = progressMode === 'FIELDS' && sector.totalFields !== undefined;
                    const percent = isFields ? (sector.totalFields ? Math.round(((sector.completedFields || 0) / sector.totalFields) * 100) : 0) : sector.percent;
                    
                    return (
                      <div key={sector.type} className="progress-card">
                        <div className="progress-header">
                          <h3>{cfg.label}</h3>
                          <span>{percent}%</span>
                        </div>
                        <div className="progress-bar-bg">
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${percent}%`, backgroundColor: cfg.color }}
                          ></div>
                        </div>
                        <div className="progress-meta">
                          {isFields ? (
                            <>{sector.completedFields} de {sector.totalFields} {sector.type === 'PARCELAMENTO' ? 'parcelas' : 'campos'}</>
                          ) : (
                            <>{sector.completed}/{sector.total} concluídos · {sector.inProgress} em andamento</>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Movimentações Expansíveis */}
              <div className="movements-container">
                <h2 className="section-title">Movimentações</h2>
                <div className="accordion-grid">
                  {MOVEMENT_GROUPS.map(({ key, title, variant, Icon }) => {
                    const items = stats.movements?.[key] || [];
                    const iconClass = variant.startsWith('success') ? 'icon-success' : 'icon-danger';
                    return (
                      <details key={key} className={`accordion-item ${variant}`}>
                        <summary className="accordion-header">
                          <div className="accordion-title">
                            <Icon size={20} className={iconClass} />
                            <h3>{title}</h3>
                            <span className="count-badge">{items.length}</span>
                          </div>
                          <ChevronDown className="chevron" size={20} />
                        </summary>
                        <div className="accordion-content">
                          {items.length === 0 ? (
                            <div className="movement-empty">Nenhuma empresa neste grupo.</div>
                          ) : (
                            items.map(item => (
                              <div key={item.id} className="movement-row">
                                <div className="movement-info">
                                  <strong>{item.name}</strong>
                                  <span><Clock size={14} /> {formatDate(item.date)} · {REGIME_LABEL[item.taxRegime] || item.taxRegime}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <ManualCompetenceModal
          isOpen={isManualModalOpen}
          onClose={() => setIsManualModalOpen(false)}
          initialYear={selectedYear}
          initialMonth={selectedMonth + 1}
          onSuccess={(newYear, newMonth) => {
            setSelectedYear(newYear);
            setSelectedMonth(newMonth - 1);
            fetchStats(newYear, newMonth - 1);
          }}
        />

        {/* Central de Alertas Pró-Ativos */}
        <SmartAlertDrawer
          isOpen={isAlertDrawerOpen}
          onClose={() => setIsAlertDrawerOpen(false)}
          onNavigateToCompany={() => onNavigate('companies')}
          onNavigateToInstallments={() => onNavigate('settings-installments')}
        />

        {/* Relatório Executivo da Competência */}
        <ExecutiveReportModal
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          year={selectedYear}
          month={selectedMonth}
        />
      </main>
    </div>
  );
}

