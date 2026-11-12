import { latestOpenPeriod } from '../config/competenceCalendar';
import { useCompetenceCalendar } from './useCompetenceCalendar';
import { useEffect, useState, useMemo } from 'react';
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
  Snowflake,
  Tv,
  DollarSign,
  Activity,
  Calculator,
  Trophy,
  ShieldCheck,
  HeartPulse,
  Timer,
  FileCheck,
  Download,
  Sparkles,
  KeyRound,
  Landmark,
  Tag,
  Share2,
  Award,
  MailWarning,
  FileCode,
  LayoutGrid,
  BarChart3,
} from 'lucide-react';
import './Dashboard.css';
import './Progress.css';
import './Closings.css';
import { Sidebar } from './Sidebar';
import { ManualCompetenceModal } from './ManualCompetenceModal';
import { DashboardSkeleton, LoadingSpinner } from './LoadingSkeleton';
import { SmartAlertDrawer } from './SmartAlertDrawer';
import { ExecutiveReportModal } from './ExecutiveReportModal';
import { CompetenceSnapshotModal } from './CompetenceSnapshotModal';
import { WarRoomModal } from './WarRoomModal';
import { FeeAdjustmentRadarModal } from './FeeAdjustmentRadarModal';
import { BottleneckForecastModal } from './BottleneckForecastModal';
import { UserActivityHistoryModal } from './UserActivityHistoryModal';
import { TaxSimulatorModal } from './TaxSimulatorModal';
import { GamificationLeaderboardModal } from './GamificationLeaderboardModal';
import { CndMonitorModal } from './CndMonitorModal';
import { SpecialObligationsModal } from './SpecialObligationsModal';
import { CustomerHealthRadarModal } from './CustomerHealthRadarModal';
import { SlaMatrixModal } from './SlaMatrixModal';
import { DocumentReceptionModal } from './DocumentReceptionModal';
import { PricingCalculatorModal } from './PricingCalculatorModal';
import { CompetenceExportModal } from './CompetenceExportModal';
import { TaxOpportunityRadarModal } from './TaxOpportunityRadarModal';
import { TeamWorkloadThermometerModal } from './TeamWorkloadThermometerModal';
import { PowerOfAttorneyMonitorModal } from './PowerOfAttorneyMonitorModal';
import { TaxReformSimulatorModal } from './TaxReformSimulatorModal';
import { ExtraServicesBillingModal } from './ExtraServicesBillingModal';
import { ClientPortalShareModal } from './ClientPortalShareModal';
import { FactorRSimulatorModal } from './FactorRSimulatorModal';
import { MonthlyComplianceDossierModal } from './MonthlyComplianceDossierModal';
import { DteInboxModal } from './DteInboxModal';
import { SpedPreValidatorModal } from './SpedPreValidatorModal';
import { RiskRadarWidget } from './RiskRadarWidget';
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

interface DashboardToolItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'FISCAL' | 'EQUIPE' | 'CLIENTES';
  icon: any;
  iconColor: string;
  badge?: string;
  badgeBg?: string;
  badgeColor?: string;
  action: () => void;
  privilegedOnly?: boolean;
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

  // Alertas, Relatório Executivo e Congelamento
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [isWarRoomOpen, setIsWarRoomOpen] = useState(false);
  const [isFeeRadarOpen, setIsFeeRadarOpen] = useState(false);
  const [isBottleneckOpen, setIsBottleneckOpen] = useState(false);
  const [isUserActivityOpen, setIsUserActivityOpen] = useState(false);
  const [isTaxSimOpen, setIsTaxSimOpen] = useState(false);
  const [isGamifyOpen, setIsGamifyOpen] = useState(false);
  const [isCndOpen, setIsCndOpen] = useState(false);
  const [isSpecialOpen, setIsSpecialOpen] = useState(false);
  const [isChurnOpen, setIsChurnOpen] = useState(false);
  const [isSlaOpen, setIsSlaOpen] = useState(false);
  const [isDocRecOpen, setIsDocRecOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isTaxOppOpen, setIsTaxOppOpen] = useState(false);
  const [isWorkloadThermOpen, setIsWorkloadThermOpen] = useState(false);
  const [isPoaOpen, setIsPoaOpen] = useState(false);
  const [isTaxReformOpen, setIsTaxReformOpen] = useState(false);
  const [isExtraServicesOpen, setIsExtraServicesOpen] = useState(false);
  const [isClientPortalOpen, setIsClientPortalOpen] = useState(false);
  const [isFactorROpen, setIsFactorROpen] = useState(false);
  const [factorRCompanyName, setFactorRCompanyName] = useState<string>('');
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [dossierCompany, setDossierCompany] = useState<any>(null);
  const [isDteOpen, setIsDteOpen] = useState(false);
  const [criticalDteCount, setCriticalDteCount] = useState(0);
  const [isSpedValidatorOpen, setIsSpedValidatorOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [isToolsHubOpen, setIsToolsHubOpen] = useState(false);
  const [toolsSearchFilter, setToolsSearchFilter] = useState('');
  const isPrivileged = currentUser?.role === 'ADMIN' || currentUser?.role === 'SOCIO';

  const ALL_TOOLS: DashboardToolItem[] = useMemo(() => [
    // FISCAL & TRIBUTÁRIO
    {
      id: 'factor-r',
      title: 'Simulador do Fator R',
      subtitle: 'Anexo III (6%) vs Anexo V (15,5%) no Simples Nacional',
      category: 'FISCAL' as const,
      icon: Calculator,
      iconColor: '#c084fc',
      badge: 'Economia',
      badgeBg: 'rgba(168, 85, 247, 0.15)',
      badgeColor: '#c084fc',
      action: () => { setIsToolsHubOpen(false); setIsFactorROpen(true); },
    },
    {
      id: 'sped-validator',
      title: 'Pré-Validador SPED (.txt)',
      subtitle: 'Auditoria de integridade SPED Fiscal & Contribuições',
      category: 'FISCAL' as const,
      icon: FileCode,
      iconColor: '#38bdf8',
      badge: 'PVA',
      badgeBg: 'rgba(56, 189, 248, 0.15)',
      badgeColor: '#7dd3fc',
      action: () => { setIsToolsHubOpen(false); setIsSpedValidatorOpen(true); },
    },
    {
      id: 'cnd-monitor',
      title: 'Monitor de Certidões (CNDs)',
      subtitle: 'Acompanhamento unificado Federal, Estadual, FGTS e Municipal',
      category: 'FISCAL' as const,
      icon: ShieldCheck,
      iconColor: '#10b981',
      badge: 'Validade',
      badgeBg: 'rgba(16, 185, 129, 0.15)',
      badgeColor: '#34d399',
      action: () => { setIsToolsHubOpen(false); setIsCndOpen(true); },
    },
    {
      id: 'tax-opp',
      title: 'Radar de Monofásicos',
      subtitle: 'Recuperação tributária de produtos com tributação monofásica',
      category: 'FISCAL' as const,
      icon: Sparkles,
      iconColor: '#10b981',
      action: () => { setIsToolsHubOpen(false); setIsTaxOppOpen(true); },
    },
    {
      id: 'tax-sim',
      title: 'Comparador Tributário',
      subtitle: 'Simulação comparativa Simples vs Presumido vs Lucro Real',
      category: 'FISCAL' as const,
      icon: Calculator,
      iconColor: '#38bdf8',
      action: () => { setIsToolsHubOpen(false); setIsTaxSimOpen(true); },
    },
    {
      id: 'tax-reform',
      title: 'Reforma Tributária (IBS/CBS)',
      subtitle: 'Simulador de impacto do novo IVA Dual da EC 132/2023',
      category: 'FISCAL' as const,
      icon: Landmark,
      iconColor: '#a855f7',
      action: () => { setIsToolsHubOpen(false); setIsTaxReformOpen(true); },
    },
    {
      id: 'special-obligations',
      title: 'Obrigações Especiais e Anuais',
      subtitle: 'Calendário de DEFIS, ECD, ECF, DIRF e IBGE',
      category: 'FISCAL' as const,
      icon: Calendar,
      iconColor: '#a855f7',
      action: () => { setIsToolsHubOpen(false); setIsSpecialOpen(true); },
    },
    {
      id: 'poa-monitor',
      title: 'Procurações Eletrônicas',
      subtitle: 'Monitor de validade de procurações e-CAC, Caixa e DTE',
      category: 'FISCAL' as const,
      icon: KeyRound,
      iconColor: '#38bdf8',
      action: () => { setIsToolsHubOpen(false); setIsPoaOpen(true); },
    },

    // EQUIPE & PRODUTIVIDADE
    {
      id: 'workload-therm',
      title: 'Termômetro de Carga & Burnout',
      subtitle: 'Equilíbrio da carteira de empresas por analista da equipe',
      category: 'EQUIPE' as const,
      icon: Users,
      iconColor: '#f59e0b',
      badge: 'Carga',
      badgeBg: 'rgba(245, 158, 11, 0.15)',
      badgeColor: '#fbbf24',
      action: () => { setIsToolsHubOpen(false); setIsWorkloadThermOpen(true); },
    },
    {
      id: 'war-room',
      title: 'Painel TV War Room',
      subtitle: 'Modo telão para acompanhamento em tempo real no escritório',
      category: 'EQUIPE' as const,
      icon: Tv,
      iconColor: '#ef4444',
      action: () => { setIsToolsHubOpen(false); setIsWarRoomOpen(true); },
    },
    {
      id: 'user-activity',
      title: 'Presença & Horas da Equipe',
      subtitle: 'Auditoria de horas ativas e produtividade por pessoa',
      category: 'EQUIPE' as const,
      icon: Users,
      iconColor: '#10b981',
      privilegedOnly: true,
      action: () => { setIsToolsHubOpen(false); setIsUserActivityOpen(true); },
    },
    {
      id: 'gamification',
      title: 'Ranking & Gamificação',
      subtitle: 'Pontuação de agilidade e entrega pontual dos analistas',
      category: 'EQUIPE' as const,
      icon: Trophy,
      iconColor: '#f59e0b',
      action: () => { setIsToolsHubOpen(false); setIsGamifyOpen(true); },
    },
    {
      id: 'sla-matrix',
      title: 'Matriz de SLA & Lead Time',
      subtitle: 'Tempo médio de execução das rotas operacionais',
      category: 'EQUIPE' as const,
      icon: Timer,
      iconColor: '#38bdf8',
      action: () => { setIsToolsHubOpen(false); setIsSlaOpen(true); },
    },
    {
      id: 'bottlenecks',
      title: 'Previsor de Gargalos (Dia 20)',
      subtitle: 'Predição de atrasos críticos para a data limite de fechamento',
      category: 'EQUIPE' as const,
      icon: Activity,
      iconColor: '#38bdf8',
      action: () => { setIsToolsHubOpen(false); setIsBottleneckOpen(true); },
    },

    // CLIENTES & GESTÃO
    {
      id: 'client-portal',
      title: 'Portal do Cliente (Uploads)',
      subtitle: 'Link externo seguro sem senha para envio de documentos',
      category: 'CLIENTES' as const,
      icon: Share2,
      iconColor: '#38bdf8',
      badge: 'Link Externo',
      badgeBg: 'rgba(56, 189, 248, 0.15)',
      badgeColor: '#38bdf8',
      action: () => { setIsToolsHubOpen(false); setIsClientPortalOpen(true); },
    },
    {
      id: 'doc-rec',
      title: 'Recepção de Documentos',
      subtitle: 'Checklist de entrada de extratos e cobrança via WhatsApp',
      category: 'CLIENTES' as const,
      icon: FileCheck,
      iconColor: '#10b981',
      action: () => { setIsToolsHubOpen(false); setIsDocRecOpen(true); },
    },
    {
      id: 'churn-radar',
      title: 'Radar de Saúde & Churn',
      subtitle: 'Indicador de risco de cancelamento e insatisfação de clientes',
      category: 'CLIENTES' as const,
      icon: HeartPulse,
      iconColor: '#ef4444',
      action: () => { setIsToolsHubOpen(false); setIsChurnOpen(true); },
    },
    {
      id: 'fee-radar',
      title: 'Radar de Honorários',
      subtitle: 'Identificação de desvios de escopo e reajuste justo',
      category: 'CLIENTES' as const,
      icon: DollarSign,
      iconColor: '#10b981',
      privilegedOnly: true,
      action: () => { setIsToolsHubOpen(false); setIsFeeRadarOpen(true); },
    },
    {
      id: 'pricing',
      title: 'Calculadora de Precificação',
      subtitle: 'Rentabilidade real e preço sugerido por contrato',
      category: 'CLIENTES' as const,
      icon: DollarSign,
      iconColor: '#f59e0b',
      action: () => { setIsToolsHubOpen(false); setIsPricingOpen(true); },
    },
    {
      id: 'extra-services',
      title: 'Serviços Extras & Avulsos',
      subtitle: 'Cobrança avulsa de alterações, certidões e retrabalho',
      category: 'CLIENTES' as const,
      icon: Tag,
      iconColor: '#10b981',
      action: () => { setIsToolsHubOpen(false); setIsExtraServicesOpen(true); },
    },
    {
      id: 'export-excel',
      title: 'Exportar Competência (Excel)',
      subtitle: 'Download consolidado de auditoria e relatórios em planilha',
      category: 'CLIENTES' as const,
      icon: Download,
      iconColor: '#38bdf8',
      action: () => { setIsToolsHubOpen(false); setIsExportOpen(true); },
    },
    {
      id: 'snapshot-freeze',
      title: 'Congelar Competência',
      subtitle: 'Snapshot imutável e homologação da competência fechada',
      category: 'CLIENTES' as const,
      icon: Snowflake,
      iconColor: '#60a5fa',
      privilegedOnly: true,
      action: () => { setIsToolsHubOpen(false); setIsSnapshotModalOpen(true); },
    },
  ], [isPrivileged]);

  const filteredTools: DashboardToolItem[] = useMemo(() => {
    const q = toolsSearchFilter.trim().toLowerCase();
    const visible: DashboardToolItem[] = ALL_TOOLS.filter((t: DashboardToolItem) => !t.privilegedOnly || isPrivileged);
    if (!q) return visible;
    return visible.filter((t: DashboardToolItem) => t.title.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q));
  }, [ALL_TOOLS, toolsSearchFilter, isPrivileged]);

  const averageCompletionPercent = useMemo(() => {
    if (!stats?.progress || stats.progress.length === 0) return 0;
    const sum = stats.progress.reduce((acc, p) => acc + (p.percent || 0), 0);
    return Math.round(sum / stats.progress.length);
  }, [stats]);

  useEffect(() => {
    fetch(`${API}/api/alerts/summary`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.totalCount !== undefined) setAlertCount(data.totalCount);
      })
      .catch(() => {});

    fetch(`${API}/api/dte-notifications`)
      .then((res) => (res.ok ? res.json() : []))
      .then((items) => {
        if (Array.isArray(items)) {
          const now = Date.now();
          const critical = items.filter((n: any) => {
            if (n.status === 'RESOLVED') return false;
            const diffDays = Math.ceil((new Date(n.dueDate).getTime() - now) / (1000 * 60 * 60 * 24));
            return diffDays <= 5;
          }).length;
          setCriticalDteCount(critical);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleOpenFactorR = (e: any) => {
      if (e.detail?.companyName) setFactorRCompanyName(e.detail.companyName);
      setIsFactorROpen(true);
    };
    const handleOpenDossier = (e: any) => {
      if (e.detail?.company) setDossierCompany(e.detail.company);
      setIsDossierOpen(true);
    };
    const handleOpenDte = () => setIsDteOpen(true);
    const handleOpenSped = () => setIsSpedValidatorOpen(true);
    const handleOpenClientPortal = () => setIsClientPortalOpen(true);

    window.addEventListener('open-factor-r', handleOpenFactorR);
    window.addEventListener('open-monthly-dossier', handleOpenDossier);
    window.addEventListener('open-dte-inbox', handleOpenDte);
    window.addEventListener('open-sped-validator', handleOpenSped);
    window.addEventListener('open-client-portal', handleOpenClientPortal);

    return () => {
      window.removeEventListener('open-factor-r', handleOpenFactorR);
      window.removeEventListener('open-monthly-dossier', handleOpenDossier);
      window.removeEventListener('open-dte-inbox', handleOpenDte);
      window.removeEventListener('open-sped-validator', handleOpenSped);
      window.removeEventListener('open-client-portal', handleOpenClientPortal);
    };
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

          <div className="crm-header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
            {/* Dossiê Mensal & Relatório */}
            <button
              type="button"
              className="btn-header-action primary"
              title="Emitir Dossiê Executivo de Regularidade Mensal (A4)"
              onClick={() => setIsDossierOpen(true)}
            >
              <Award size={15} />
              <span>Dossiê Mensal</span>
            </button>

            <button
              type="button"
              className="btn-header-action"
              title="Gerar Relatório Executivo Analítico da Competência"
              onClick={() => setIsReportOpen(true)}
            >
              <FileSpreadsheet size={15} />
              <span>Relatório</span>
            </button>

            {/* Guardião DTE com Badge de Prazos Críticos */}
            <button
              type="button"
              className="btn-header-action warning"
              style={{ position: 'relative' }}
              title="Guardião do DTE & Intimações Eletrônicas da Receita / SEFAZ"
              onClick={() => setIsDteOpen(true)}
            >
              <MailWarning size={15} color="#f59e0b" />
              <span>Guardião DTE</span>
              {criticalDteCount > 0 && (
                <span className="header-counter-badge" title={`${criticalDteCount} notificação(ões) com prazo crítico (≤ 5 dias)`}>
                  {criticalDteCount}
                </span>
              )}
            </button>

            {/* Central de Ferramentas / Tools Hub Popover */}
            <div className="tools-hub-container">
              <button
                type="button"
                className={`btn-header-action tools-hub-btn ${isToolsHubOpen ? 'active' : ''}`}
                onClick={() => setIsToolsHubOpen((prev) => !prev)}
                title="Abrir Central com todas as ferramentas e simuladores do Fechamento Pro"
              >
                <LayoutGrid size={15} color="#38bdf8" />
                <span>Ferramentas</span>
                <span className="tools-count-pill">{filteredTools.length}</span>
                <ChevronDown size={14} className={`tools-arrow ${isToolsHubOpen ? 'open' : ''}`} />
              </button>

              {isToolsHubOpen && (
                <>
                  <div className="tools-hub-backdrop" onClick={() => setIsToolsHubOpen(false)} />
                  <div className="tools-hub-popover">
                    <div className="tools-hub-header">
                      <div className="tools-hub-title">
                        <Sparkles size={16} color="#38bdf8" />
                        <strong>Central de Ferramentas & Módulos</strong>
                        <span className="tools-hint">{filteredTools.length} utilitários</span>
                      </div>
                      <div className="tools-hub-search">
                        <Search size={14} />
                        <input
                          type="text"
                          placeholder="Buscar ferramenta (ex: Fator R, SPED, War Room, CND)..."
                          value={toolsSearchFilter}
                          onChange={(e) => setToolsSearchFilter(e.target.value)}
                          autoFocus
                        />
                        {toolsSearchFilter && (
                          <button type="button" onClick={() => setToolsSearchFilter('')}>
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="tools-hub-grid">
                      {/* Coluna 1: Fiscal & Tributário */}
                      <div className="tools-category-col">
                        <div className="tools-category-header">
                          <Calculator size={13} color="#a855f7" />
                          <span>Fiscal & Tributário</span>
                        </div>
                        <div className="tools-list">
                          {filteredTools
                            .filter((t: DashboardToolItem) => t.category === 'FISCAL')
                            .map((t: DashboardToolItem) => {
                              const IconComponent = t.icon;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  className="tool-item-card"
                                  onClick={t.action}
                                >
                                  <div className="tool-icon-wrapper" style={{ color: t.iconColor }}>
                                    <IconComponent size={16} />
                                  </div>
                                  <div className="tool-item-content">
                                    <div className="tool-title-row">
                                      <span className="tool-title">{t.title}</span>
                                      {t.badge && (
                                        <span className="tool-badge" style={{ background: t.badgeBg, color: t.badgeColor }}>
                                          {t.badge}
                                        </span>
                                      )}
                                    </div>
                                    <span className="tool-desc">{t.subtitle}</span>
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      {/* Coluna 2: Equipe & Produtividade */}
                      <div className="tools-category-col">
                        <div className="tools-category-header">
                          <Users size={13} color="#38bdf8" />
                          <span>Equipe & Produtividade</span>
                        </div>
                        <div className="tools-list">
                          {filteredTools
                            .filter((t: DashboardToolItem) => t.category === 'EQUIPE')
                            .map((t: DashboardToolItem) => {
                              const IconComponent = t.icon;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  className="tool-item-card"
                                  onClick={t.action}
                                >
                                  <div className="tool-icon-wrapper" style={{ color: t.iconColor }}>
                                    <IconComponent size={16} />
                                  </div>
                                  <div className="tool-item-content">
                                    <div className="tool-title-row">
                                      <span className="tool-title">{t.title}</span>
                                      {t.badge && (
                                        <span className="tool-badge" style={{ background: t.badgeBg, color: t.badgeColor }}>
                                          {t.badge}
                                        </span>
                                      )}
                                    </div>
                                    <span className="tool-desc">{t.subtitle}</span>
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      {/* Coluna 3: Clientes & Gestão */}
                      <div className="tools-category-col">
                        <div className="tools-category-header">
                          <DollarSign size={13} color="#10b981" />
                          <span>Clientes & Gestão</span>
                        </div>
                        <div className="tools-list">
                          {filteredTools
                            .filter((t: DashboardToolItem) => t.category === 'CLIENTES')
                            .map((t: DashboardToolItem) => {
                              const IconComponent = t.icon;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  className="tool-item-card"
                                  onClick={t.action}
                                >
                                  <div className="tool-icon-wrapper" style={{ color: t.iconColor }}>
                                    <IconComponent size={16} />
                                  </div>
                                  <div className="tool-item-content">
                                    <div className="tool-title-row">
                                      <span className="tool-title">{t.title}</span>
                                      {t.badge && (
                                        <span className="tool-badge" style={{ background: t.badgeBg, color: t.badgeColor }}>
                                          {t.badge}
                                        </span>
                                      )}
                                    </div>
                                    <span className="tool-desc">{t.subtitle}</span>
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    </div>

                    <div className="tools-hub-footer">
                      <span>💡 Dica: Você também pode abrir qualquer ferramenta via teclado com <strong>Ctrl + Espaço</strong> ou <strong>/</strong>.</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Central de Alertas Inteligentes */}
            <button
              type="button"
              className="smart-alert-bell-btn"
              title={alertCount > 0 ? `${alertCount} alertas no sistema` : 'Central de Alertas'}
              onClick={() => setIsAlertDrawerOpen(true)}
            >
              <Bell size={18} />
              {alertCount > 0 && <span className="bell-badge-count">{alertCount}</span>}
            </button>

            {/* Usuário logado */}
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
              {/* 1. HERO KPI BAR: Indicadores Macro do Escritório */}
              <div className="hero-kpis-grid">
                <div className="hero-kpi-card">
                  <div className="hero-kpi-icon blue">
                    <Building2 size={22} />
                  </div>
                  <div className="hero-kpi-data">
                    <span>Empresas Ativas</span>
                    <strong>{stats.totalActive}</strong>
                    <small>Clientes na competência {monthCode}</small>
                  </div>
                </div>

                <div className="hero-kpi-card">
                  <div className="hero-kpi-icon purple">
                    <Users size={22} />
                  </div>
                  <div className="hero-kpi-data">
                    <span>Vidas / Empregados</span>
                    <strong>{stats.totalEmployees}</strong>
                    <small>Processados na folha de pagamento</small>
                  </div>
                </div>

                <div className="hero-kpi-card">
                  <div className="hero-kpi-icon green">
                    <BarChart3 size={22} />
                  </div>
                  <div className="hero-kpi-data">
                    <span>Conclusão Global</span>
                    <strong>{averageCompletionPercent}%</strong>
                    <div className="hero-kpi-mini-bar">
                      <div className="hero-kpi-mini-fill" style={{ width: `${averageCompletionPercent}%` }} />
                    </div>
                  </div>
                </div>

                <div className="hero-kpi-card" onClick={() => setIsAlertDrawerOpen(true)} style={{ cursor: 'pointer' }} title="Clique para abrir Central de Alertas">
                  <div className="hero-kpi-icon amber">
                    <AlertCircle size={22} />
                  </div>
                  <div className="hero-kpi-data">
                    <span>Alertas Operacionais</span>
                    <strong>{alertCount}</strong>
                    <small>Pendências na competência</small>
                  </div>
                </div>
              </div>

              {/* 2. ANDAMENTO DO FECHAMENTO POR SETOR (EM PRIMEIRO PLANO) */}
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

              {/* 3. TERMÔMETRO DE RISCO & PREDIÇÃO DE ATRASO */}
              <RiskRadarWidget
                year={selectedYear}
                month={selectedMonth}
                currentUserId={currentUser?.id}
                onNavigateToCompany={() => onNavigate('companies')}
                onNavigateToSector={(sector) => onNavigate(sector.toLowerCase())}
              />

              {/* 4. CARTEIRA POR REGIME TRIBUTÁRIO */}
              <div className="regimes-section-header">
                <div>
                  <h2 className="section-title">Carteira por Regime Tributário</h2>
                  <span className="section-subtitle">
                    Competência <strong>{monthCode}</strong> · Clique em um regime para visualizar as empresas
                  </span>
                </div>
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

        {/* Modal de Congelamento e Homologação de Snapshot */}
        <CompetenceSnapshotModal
          isOpen={isSnapshotModalOpen}
          onClose={() => setIsSnapshotModalOpen(false)}
          referencePeriod={`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`}
          periodLabel={`${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`}
        />

        {/* Painel Telão War Room para TV */}
        <WarRoomModal
          isOpen={isWarRoomOpen}
          onClose={() => setIsWarRoomOpen(false)}
          year={selectedYear}
          month={selectedMonth}
        />

        {/* Radar de Reajuste de Honorários */}
        <FeeAdjustmentRadarModal
          isOpen={isFeeRadarOpen}
          onClose={() => setIsFeeRadarOpen(false)}
        />

        {/* Previsor de Gargalos e SLA */}
        <BottleneckForecastModal
          isOpen={isBottleneckOpen}
          onClose={() => setIsBottleneckOpen(false)}
        />

        {/* Painel de Presença e Histórico por Pessoa */}
        <UserActivityHistoryModal
          isOpen={isUserActivityOpen}
          onClose={() => setIsUserActivityOpen(false)}
        />

        {/* Comparador Tributário Inteligente */}
        <TaxSimulatorModal
          isOpen={isTaxSimOpen}
          onClose={() => setIsTaxSimOpen(false)}
        />

        {/* Ranking & Gamificação da Equipe */}
        <GamificationLeaderboardModal
          isOpen={isGamifyOpen}
          onClose={() => setIsGamifyOpen(false)}
        />

        {/* Monitor Unificado de CNDs */}
        <CndMonitorModal
          isOpen={isCndOpen}
          onClose={() => setIsCndOpen(false)}
        />

        {/* Calendário de Obrigações Especiais e Anuais */}
        <SpecialObligationsModal
          isOpen={isSpecialOpen}
          onClose={() => setIsSpecialOpen(false)}
        />

        {/* Radar de Risco de Churn e Retenção */}
        <CustomerHealthRadarModal
          isOpen={isChurnOpen}
          onClose={() => setIsChurnOpen(false)}
        />

        {/* Matriz de SLA e Lead Time */}
        <SlaMatrixModal
          isOpen={isSlaOpen}
          onClose={() => setIsSlaOpen(false)}
        />

        {/* Painel de Recepção de Documentos */}
        <DocumentReceptionModal
          isOpen={isDocRecOpen}
          onClose={() => setIsDocRecOpen(false)}
        />

        {/* Calculadora de Precificação de Contratos */}
        <PricingCalculatorModal
          isOpen={isPricingOpen}
          onClose={() => setIsPricingOpen(false)}
        />

        {/* Central de Exportação Consolidada */}
        <CompetenceExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
        />

        {/* Radar de Oportunidades Tributárias (Monofásicos) */}
        <TaxOpportunityRadarModal
          isOpen={isTaxOppOpen}
          onClose={() => setIsTaxOppOpen(false)}
        />

        {/* Termômetro de Carga e Burnout da Equipe */}
        <TeamWorkloadThermometerModal
          isOpen={isWorkloadThermOpen}
          onClose={() => setIsWorkloadThermOpen(false)}
        />

        {/* Monitor de Validade de Procurações Eletrônicas */}
        <PowerOfAttorneyMonitorModal
          isOpen={isPoaOpen}
          onClose={() => setIsPoaOpen(false)}
        />

        {/* Simulador da Reforma Tributária */}
        <TaxReformSimulatorModal
          isOpen={isTaxReformOpen}
          onClose={() => setIsTaxReformOpen(false)}
        />

        {/* Central de Serviços Extraordinários e Cobrança */}
        <ExtraServicesBillingModal
          isOpen={isExtraServicesOpen}
          onClose={() => setIsExtraServicesOpen(false)}
        />

        {/* Gerador e Compartilhamento do Portal do Cliente */}
        <ClientPortalShareModal
          isOpen={isClientPortalOpen}
          onClose={() => setIsClientPortalOpen(false)}
        />

        {/* Simulador de Fator R do Simples Nacional */}
        <FactorRSimulatorModal
          isOpen={isFactorROpen}
          onClose={() => {
            setIsFactorROpen(false);
            setFactorRCompanyName('');
          }}
          initialCompanyName={factorRCompanyName}
        />

        {/* Guardião do DTE & Intimações e-CAC */}
        <DteInboxModal
          isOpen={isDteOpen}
          onClose={() => setIsDteOpen(false)}
          currentUser={currentUser}
        />

        {/* Pré-Validador Express de SPED (.txt) */}
        <SpedPreValidatorModal
          isOpen={isSpedValidatorOpen}
          onClose={() => setIsSpedValidatorOpen(false)}
        />

        {/* Dossiê Executivo de Regularidade Mensal */}
        <MonthlyComplianceDossierModal
          isOpen={isDossierOpen}
          onClose={() => {
            setIsDossierOpen(false);
            setDossierCompany(null);
          }}
          company={dossierCompany}
          periodLabel={`${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`}
        />
      </main>
    </div>
  );
}

