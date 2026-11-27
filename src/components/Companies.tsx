import {ExitMonthQuestion} from './ExitMonthQuestion';
import {isExternalInstallmentCompany} from '../config/installmentCompanies';
import React, { useState, useEffect, useMemo } from 'react';
import { API } from '../api';
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
  Edit2,
  FileText,
  Calendar,
  Globe,
  AlertCircle,
  Layers,
  Copy,
  Check,
  Briefcase,
  KeyRound,
  X,
  CalendarX,
  RotateCcw,
  ArrowRight,
  Users,
  CheckSquare,
  Award,
  Calculator,
  FileSpreadsheet,
  Download,
  ArrowUpDown,
  SlidersHorizontal,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TableSkeleton, ButtonSpinner } from './LoadingSkeleton';
import { BulkAssignResponsibleModal } from './BulkAssignResponsibleModal';
import type { CurrentUser } from '../types/auth';
import './Dashboard.css';
import './Companies.css';
import { compareCodes, formatCompanyCode } from '../utils/codeSort';
import { canUserEditCompany, canUserViewCompany, isUserResponsibleForCompany } from '../config/companyPermissions';
import { installmentHeaders } from '../config/installments';
import { formatFlexibleDateBr } from '../config/dateUtils';
import { DEFAULT_COMPANY_CATALOG, normalizeCompanyCatalog, mergeOptionsWithCurrent, type CompanyCatalogConfig } from '../config/systemCatalogs';
import { exportToCsv } from '../utils/exportCsv';

interface Company {
  id: string;
  code?: string | null;
  name: string;
  tradeName?: string | null;
  cnpj: string;
  taxRegime: string;
  groupName?: string | null;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  city?: string | null;
  contractDate: string | null;
  obligationStartDate: string | null;
  exitDate?: string | null;
  exitMonthHasObligations?: boolean;
  targetProxyIssueDate?: string | null;
  targetProxyDate?: string | null;
  fgtsProxyIssueDate?: string | null;
  fgtsProxyDate?: string | null;
  decProxyIssueDate?: string | null;
  decProxyDate?: string | null;
  empregadorProxyIssueDate?: string | null;
  empregadorProxyDate?: string | null;
  hasClientCertificate: boolean;
  certificateType?: string | null;
  certificatePassword?: string | null;
  certificatePasswordDecrypted?: string | null;
  certificateIssue?: string | null;
  certificateExpiration?: string | null;
  companyType?: string | null;
  deliveryMethod?: string | null;
  activeSectors?: string | null;
  cityHallLogin?: string | null;
  cityHallLink?: string | null;
  ginfessPassword?: string | null;
  ginfessPasswordDecrypted?: string | null;
  gissOnlinePassword?: string | null;
  gissOnlinePasswordDecrypted?: string | null;
  sdLogin?: string | null;
  sdPassword?: string | null;
  sdPasswordDecrypted?: string | null;
  nfAccessType?: string | null;
  nfLogin?: string | null;
  nfPassword?: string | null;
  nfPasswordDecrypted?: string | null;
  dissidioMonthYear?: string | null;
  notes?: string | null;
  notesScope?: string | null;
  isSuspended?: boolean;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  responsibles?: Array<{
    id: string;
    sector?: string | null;
    userId: string;
    user?: { id: string; name: string; email: string };
  }>;
}

interface CompaniesProps {
  currentView: string;
  onNavigate: (view: string) => void;
  currentUser?: CurrentUser | null;
  onLogout?: () => void;
}

// Opções do Regime Tributário (Foto 1)
const TAX_REGIME_OPTIONS = [
  { value: 'ASSOCIACOES', label: 'Associações' },
  { value: 'CONDOMINIOS', label: 'Condominios' },
  { value: 'DOMESTICA', label: 'Doméstica' },
  { value: 'IMUNE_IRPJ', label: 'Imune IRPJ' },
  { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { value: 'LUCRO_REAL_TRIMESTRAL', label: 'Lucro Real/Trimestral' },
  { value: 'LUCRO_REAL_ESTIMATIVA', label: 'Lucro Real/Estimativa' },
  { value: 'LUCRO_REAL_ANUAL', label: 'Lucro Real/Anual' },
  { value: 'MEI', label: 'MEI' },
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { value: 'SIMPLES_NACIONAL_HIBRIDO', label: 'Simples Nacional Híbrido' },
  { value: 'PESSOA_FISICA', label: 'Pessoa Física' },
];

// Opções do Tipo de Empresa (Foto 2)
const COMPANY_TYPE_OPTIONS = [
  'Comércio',
  'Holding',
  'Igreja',
  'Indústria',
  'Serv/Com',
  'Serviço',
  'Transporte',
];

// Setores disponíveis
const SECTOR_OPTIONS = [
  { key: 'FISCAL', label: 'Fiscal' },
  { key: 'DP', label: 'DP' },
  { key: 'CONTABIL', label: 'Contábil' },
  { key: 'CUSHMAN', label: 'Cushman' },
];

function formatCnpjMask(value: string | null | undefined): string {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '').slice(0, 14);
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function formatDateToBr(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  return formatFlexibleDateBr(isoDate);
}

function formatBrDateMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatMonthYearMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function Companies({ currentView, onNavigate, currentUser, onLogout }: CompaniesProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const isPrivileged = currentUser?.role === 'ADMIN' || currentUser?.role === 'SOCIO';
  const canManageSd = isPrivileged || currentUser?.role === 'CADASTRO' || currentUser?.role === 'CUSHMAN';
  const [onlyMyCompanies, setOnlyMyCompanies] = useState(false);
  const [catalog, setCatalog] = useState<CompanyCatalogConfig>(() => normalizeCompanyCatalog(DEFAULT_COMPANY_CATALOG));
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRegime, setFilterRegime] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterCert, setFilterCert] = useState('ALL');
  const [filterSituation, setFilterSituation] = useState<'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | 'EXTERNAL' | 'ALL'>('ACTIVE');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchingCnpj, setSearchingCnpj] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  // Exit Date Modal State (em vez de apagar empresa)
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [exitModalCompany, setExitModalCompany] = useState<Company | null>(null);
  const [exitModalDate, setExitModalDate] = useState('');
  const [exitModalDecision,setExitModalDecision] = useState('');
  const [exitSubmitting, setExitSubmitting] = useState(false);
  const [exitModalError, setExitModalError] = useState<string | null>(null);

  // Assistente de Transição de Regime Tributário
  const [isTaxTransitionModalOpen, setIsTaxTransitionModalOpen] = useState(false);
  const [selectedTaxStrategy, setSelectedTaxStrategy] = useState<'NEXT_MONTH' | 'CURRENT_MONTH' | 'SPLIT'>('NEXT_MONTH');

  // Modal de Exportação Excel com Ordenação
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportSortBy, setExportSortBy] = useState<'CODE' | 'NAME' | 'TAX_REGIME' | 'CITY' | 'GROUP' | 'SITUATION' | 'CONTRACT_DATE'>('CODE');
  const [exportSortDirection, setExportSortDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [exportScope, setExportScope] = useState<'FILTERED' | 'ALL'>('FILTERED');
  const [exportIncludeCredentials, setExportIncludeCredentials] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Form Fields State
  const [code, setCode] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [stateRegistration, setStateRegistration] = useState('');
  const [municipalRegistration, setMunicipalRegistration] = useState('');
  const [city, setCity] = useState('');
  const [contractDate, setContractDate] = useState('');
  const [obligationStartDate, setObligationStartDate] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [exitMonthDecision,setExitMonthDecision] = useState('');
  const [targetProxyIssueDate, setTargetProxyIssueDate] = useState('');
  const [targetProxyDate, setTargetProxyDate] = useState('');
  const [fgtsProxyIssueDate, setFgtsProxyIssueDate] = useState('');
  const [fgtsProxyDate, setFgtsProxyDate] = useState('');
  const [decProxyIssueDate, setDecProxyIssueDate] = useState('');
  const [decProxyDate, setDecProxyDate] = useState('');
  const [empregadorProxyIssueDate, setEmpregadorProxyIssueDate] = useState('');
  const [empregadorProxyDate, setEmpregadorProxyDate] = useState('');
  const [hasClientCertificate, setHasClientCertificate] = useState(false);
  const [certificateType, setCertificateType] = useState('A1');
  const [certificatePassword, setCertificatePassword] = useState('');
  const [certificateIssue, setCertificateIssue] = useState('');
  const [certificateExpiration, setCertificateExpiration] = useState('');
  const [taxRegime, setTaxRegime] = useState('SIMPLES_NACIONAL');
  const [companyType, setCompanyType] = useState('Serviço');
  const [deliveryMethod, setDeliveryMethod] = useState('E-mail');
  const [selectedSectors, setSelectedSectors] = useState<string[]>(['Todos']);
  const [cityHallLogin, setCityHallLogin] = useState('');
  const [cityHallLink, setCityHallLink] = useState('');
  const [ginfessPassword, setGinfessPassword] = useState('');
  const [gissOnlinePassword, setGissOnlinePassword] = useState('');
  const [sdLogin, setSdLogin] = useState('');
  const [sdPassword, setSdPassword] = useState('');
  const [nfAccessType, setNfAccessType] = useState('');
  const [nfLogin, setNfLogin] = useState('');
  const [nfPassword, setNfPassword] = useState('');
  const [dissidioMonthYear, setDissidioMonthYear] = useState('');
  const [notes, setNotes] = useState('');
  const [notesScope, setNotesScope] = useState('GERAL');
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspendedReason, setSuspendedReason] = useState('');

  // Password visibility toggles
  const [showCertPwd, setShowCertPwd] = useState(false);
  const [showGinfessPwd, setShowGinfessPwd] = useState(false);
  const [showGissPwd, setShowGissPwd] = useState(false);
  const [showSdPwd, setShowSdPwd] = useState(false);
  const [showNfPwd, setShowNfPwd] = useState(false);

  // Table password reveals
  const [revealedTablePasswords, setRevealedTablePasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Seleção e Atribuição em Massa (Bulk Assign)
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API}/api/users`, {
        headers: currentUser ? installmentHeaders(currentUser) : {},
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
    }
  };

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4500);
  };

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const [compsRes, cfgRes] = await Promise.all([
        fetch(`${API}/api/companies`),
        fetch(`${API}/api/app-config`).catch(() => null),
      ]);
      if (compsRes.ok) {
        const data = await compsRes.json();
        setCompanies(Array.isArray(data) ? data : []);
      }
      if (cfgRes && cfgRes.ok) {
        const cfgData = await cfgRes.json();
        if (cfgData?.companyCatalog) {
          setCatalog(normalizeCompanyCatalog(cfgData.companyCatalog));
        }
      }
    } catch (err) {
      console.error('Erro ao buscar empresas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
    fetchUsers();
  }, []);

  // Sincronização em tempo real de empresas via SSE
  useEffect(() => {
    const handleRealtime = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      if (
        detail.type === 'COMPANY_CREATED' ||
        detail.type === 'COMPANY_UPDATED' ||
        detail.type === 'COMPANY_DELETED' ||
        detail.type === 'COMPANY_RESTORED' ||
        detail.type === 'COMPANY_NOTES_UPDATED'
      ) {
        fetchCompanies();
      }
    };
    window.addEventListener('app-realtime-update', handleRealtime);
    return () => window.removeEventListener('app-realtime-update', handleRealtime);
  }, []);

  // Fecha modal ao pressionar ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isExportModalOpen) setIsExportModalOpen(false);
        else if (isTaxTransitionModalOpen) setIsTaxTransitionModalOpen(false);
        else if (isExitModalOpen) setIsExitModalOpen(false);
        else if (isModalOpen) setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, isExitModalOpen, isTaxTransitionModalOpen, isExportModalOpen]);

  const openNewCompanyModal = () => {
    setEditingCompany(null);
    setCode('');
    setCnpj('');
    setName('');
    setTradeName('');
    setGroupName('');
    setStateRegistration('');
    setMunicipalRegistration('');
    setCity('');
    
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    setContractDate(todayStr);
    setObligationStartDate(todayStr);
    setExitDate('');
    setExitMonthDecision('');
    setTargetProxyIssueDate('');
    setTargetProxyDate('');
    setFgtsProxyIssueDate('');
    setFgtsProxyDate('');
    setDecProxyIssueDate('');
    setDecProxyDate('');
    setEmpregadorProxyIssueDate('');
    setEmpregadorProxyDate('');
    setHasClientCertificate(false);
    setCertificateType('A1');
    setCertificatePassword('');
    setCertificateIssue('');
    setCertificateExpiration('');
    setTaxRegime('SIMPLES_NACIONAL');
    setCompanyType('Serviço');
    setDeliveryMethod('E-mail');
    setSelectedSectors(['Todos']);
    setCityHallLogin('');
    setCityHallLink('');
    setGinfessPassword('');
    setGissOnlinePassword('');
    setSdLogin('');
    setSdPassword('');
    setNfAccessType('');
    setNfLogin('');
    setNfPassword('');
    setDissidioMonthYear('');
    setNotes('');
    setNotesScope('GERAL');
    setIsSuspended(false);
    setSuspendedReason('');

    setModalError(null);
    setModalSuccess(null);
    setShowCertPwd(false);
    setShowGinfessPwd(false);
    setShowGissPwd(false);
    setIsModalOpen(true);
  };

  const openEditCompanyModal = (company: Company) => {
    setEditingCompany(company);
    setCode(company.code || '');
    setCnpj(formatCnpjMask(company.cnpj));
    setName(company.name);
    setTradeName(company.tradeName || '');
    setGroupName(company.groupName || '');
    setStateRegistration(company.stateRegistration || '');
    setMunicipalRegistration(company.municipalRegistration || '');
    setCity(company.city || '');
    setContractDate(formatDateToBr(company.contractDate));
    setObligationStartDate(formatDateToBr(company.obligationStartDate));
    setExitDate(formatDateToBr(company.exitDate));
    setExitMonthDecision(company.exitDate ? (company.exitMonthHasObligations ? 'SIM' : 'NAO') : '');
    setTargetProxyIssueDate(formatDateToBr(company.targetProxyIssueDate));
    setTargetProxyDate(formatDateToBr(company.targetProxyDate));
    setFgtsProxyIssueDate(formatDateToBr(company.fgtsProxyIssueDate));
    setFgtsProxyDate(formatDateToBr(company.fgtsProxyDate));
    setDecProxyIssueDate(formatDateToBr(company.decProxyIssueDate));
    setDecProxyDate(formatDateToBr(company.decProxyDate));
    setEmpregadorProxyIssueDate(formatDateToBr(company.empregadorProxyIssueDate));
    setEmpregadorProxyDate(formatDateToBr(company.empregadorProxyDate));
    setHasClientCertificate(Boolean(company.hasClientCertificate));
    setCertificateType(company.certificateType || 'A1');
    setCertificatePassword(company.certificatePasswordDecrypted || '');
    setCertificateIssue(company.certificateIssue || '');
    setCertificateExpiration(company.certificateExpiration || '');
    setTaxRegime(company.taxRegime || 'SIMPLES_NACIONAL');
    setCompanyType(company.companyType || 'Serviço');
    setDeliveryMethod(company.deliveryMethod || 'E-mail');

    const rawSectors = company.activeSectors;
    let sectors: string[] = ['TODOS'];
    if (rawSectors && rawSectors !== 'TODOS') {
      sectors = rawSectors.split(',').map((s: string) => {
        const upper = s.trim().toUpperCase();
        if (upper === 'CONTÁBIL') return 'CONTABIL';
        return upper;
      });
    }
    setSelectedSectors(sectors.length ? sectors : ['TODOS']);

    setCityHallLogin(company.cityHallLogin || '');
    setCityHallLink(company.cityHallLink || '');
    setGinfessPassword(company.ginfessPasswordDecrypted || '');
    setGissOnlinePassword(company.gissOnlinePasswordDecrypted || '');
    setSdLogin(company.sdLogin || '');
    setSdPassword(company.sdPasswordDecrypted || '');
    setNfAccessType(company.nfAccessType || '');
    setNfLogin(company.nfLogin || '');
    setNfPassword(company.nfPasswordDecrypted || '');
    setDissidioMonthYear(company.dissidioMonthYear || '');
    setNotes(company.notes || '');
    setNotesScope(company.notesScope || 'GERAL');
    setIsSuspended(Boolean(company.isSuspended));
    setSuspendedReason(company.suspendedReason || '');

    setModalError(null);
    setModalSuccess(null);
    setShowCertPwd(false);
    setShowGinfessPwd(false);
    setShowGissPwd(false);
    setIsModalOpen(true);
  };

  useEffect(() => {
    const id = sessionStorage.getItem('fechamento_edit_company');
    if (!id) return;
    if (companies.length) {
      const company = companies.find((item) => item.id === id);
      if (company) {
        sessionStorage.removeItem('fechamento_edit_company');
        if (isExternalInstallmentCompany(company)) {
          setFilterSituation('ALL');
        }
        openEditCompanyModal(company);
        return;
      }
    }
    if (!loading && companies.length > 0) {
      sessionStorage.removeItem('fechamento_edit_company');
      fetch(`${API}/api/companies/${id}`, {
        headers: currentUser ? installmentHeaders(currentUser) : {},
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((comp) => {
          if (comp) {
            setFilterSituation('ALL');
            openEditCompanyModal(comp);
          }
        })
        .catch((err) => console.error('Erro ao abrir empresa para edição:', err));
    }
  }, [companies, loading]);

  useEffect(() => {
    const handleOpenNewCompany = () => openNewCompanyModal();
    window.addEventListener('open-new-company', handleOpenNewCompany);
    return () => window.removeEventListener('open-new-company', handleOpenNewCompany);
  }, []);

  const handleLookupCnpj = async () => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length === 11) {
      setModalError('A consulta automática da Receita Federal é disponível apenas para CNPJ (Pessoa Jurídica). Para clientes Pessoa Física (CPF), preencha o Nome e dados cadastrais manualmente.');
      return;
    }
    if (clean.length !== 14) {
      setModalError('Digite um CNPJ válido com 14 dígitos para consultar.');
      return;
    }

    setSearchingCnpj(true);
    setModalError(null);
    try {
      const res = await fetch(`${API}/api/cnpj/${clean}`);
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || 'CNPJ não encontrado na Receita Federal.');
        return;
      }

      if (data.name) setName(data.name);
      if (data.tradeName) setTradeName(data.tradeName);
      if (data.city) setCity(data.city);
      if (data.taxRegime) setTaxRegime(data.taxRegime);
      if (data.companyType) setCompanyType(data.companyType);

      setModalSuccess('Dados puxados com sucesso da Receita Federal!');
      setTimeout(() => setModalSuccess(null), 3500);
    } catch (err) {
      console.error(err);
      setModalError('Erro ao consultar Receita Federal. Preencha manualmente.');
    } finally {
      setSearchingCnpj(false);
    }
  };

  const handleToggleSector = (sectorKey: string) => {
    if (sectorKey === 'TODOS' || sectorKey === 'Todos') {
      setSelectedSectors(['TODOS']);
      return;
    }
    let updated = selectedSectors.filter((s) => s !== 'TODOS' && s !== 'Todos');
    if (updated.includes(sectorKey)) {
      updated = updated.filter((s) => s !== sectorKey);
      if (updated.length === 0) updated = ['TODOS'];
    } else {
      updated.push(sectorKey);
      if (updated.length === SECTOR_OPTIONS.length) {
        updated = ['TODOS'];
      }
    }
    setSelectedSectors(updated);
  };

  const executeSaveCompany = async (transitionStrategy?: string) => {
    if(exitDate.trim()&&!exitMonthDecision){setModalError('Responda se a empresa tem obrigações no mês de saída.');return;}
    setSubmitting(true);
    setModalError(null);

    const cleanCnpj = cnpj.replace(/\D/g, '');
    const payload = {
      code: code.trim() || null,
      name: name.trim(),
      tradeName: tradeName.trim() || null,
      cnpj: cleanCnpj,
      taxRegime,
      groupName: groupName.trim() || null,
      stateRegistration: stateRegistration.trim() || null,
      municipalRegistration: municipalRegistration.trim() || null,
      city: city.trim() || null,
      contractDate: contractDate || null,
      obligationStartDate: obligationStartDate || null,
      exitDate: exitDate.trim() || null,
      exitMonthHasObligations: !!exitDate.trim() && exitMonthDecision === 'SIM',
      targetProxyIssueDate: targetProxyIssueDate.trim() || null,
      targetProxyDate: targetProxyDate.trim() || null,
      fgtsProxyIssueDate: fgtsProxyIssueDate.trim() || null,
      fgtsProxyDate: fgtsProxyDate.trim() || null,
      decProxyIssueDate: decProxyIssueDate.trim() || null,
      decProxyDate: decProxyDate.trim() || null,
      empregadorProxyIssueDate: empregadorProxyIssueDate.trim() || null,
      empregadorProxyDate: empregadorProxyDate.trim() || null,
      hasClientCertificate,
      certificateType: hasClientCertificate ? certificateType : null,
      certificatePassword: hasClientCertificate ? certificatePassword : null,
      certificateIssue: hasClientCertificate ? certificateIssue.trim() : null,
      certificateExpiration: hasClientCertificate ? certificateExpiration.trim() : null,
      companyType,
      deliveryMethod,
      activeSectors: (selectedSectors.includes('TODOS') || selectedSectors.includes('Todos')) ? 'TODOS' : selectedSectors.join(','),
      cityHallLogin: cityHallLogin.trim() || null,
      cityHallLink: cityHallLink.trim() || null,
      ginfessPassword: ginfessPassword.trim() || null,
      gissOnlinePassword: gissOnlinePassword.trim() || null,
      sdLogin: sdLogin.trim() || null,
      sdPassword: sdPassword.trim() || null,
      nfAccessType: nfAccessType.trim() || null,
      nfLogin: nfLogin.trim() || null,
      nfPassword: nfPassword.trim() || null,
      dissidioMonthYear: dissidioMonthYear.trim() || null,
      notes: notes.trim() || null,
      notesScope,
      isSuspended,
      suspendedReason: isSuspended ? suspendedReason.trim() : null,
      transitionStrategy,
      userId: currentUser?.id,
      userName: currentUser?.name,
      userEmail: currentUser?.email
    };

    try {
      const url = editingCompany
        ? `${API}/api/companies/${editingCompany.id}`
        : `${API}/api/companies`;
      const method = editingCompany ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: installmentHeaders(currentUser),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || 'Erro ao salvar empresa.');
        return;
      }

      setIsTaxTransitionModalOpen(false);
      setIsModalOpen(false);
      fetchCompanies();
    } catch (err: any) {
      console.error(err);
      setModalError(err.message || 'Erro de conexão ao salvar empresa.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setModalSuccess(null);

    if (!name.trim()) {
      setModalError('O Nome/Razão Social da empresa é obrigatório.');
      return;
    }
    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14 && cleanCnpj.length !== 11) {
      setModalError('O documento deve ser um CNPJ válido (14 dígitos) ou CPF válido (11 dígitos).');
      return;
    }

    // Se for edição e o regime tributário foi alterado, abre o assistente de transição
    if (editingCompany && editingCompany.taxRegime !== taxRegime) {
      setIsTaxTransitionModalOpen(true);
      return;
    }

    await executeSaveCompany();
  };

  // Abertura e manipulação do Modal de Saída / Inativação da Empresa (não apaga do BD)
  const openExitModal = (company: Company) => {
    setExitModalCompany(company);
    setExitModalDate(formatDateToBr(company.exitDate) || '');
    setExitModalDecision(company.exitDate ? (company.exitMonthHasObligations ? 'SIM' : 'NAO') : '');
    setExitModalError(null);
    setIsExitModalOpen(true);
  };

  const handleSaveExitDate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!exitModalCompany) return;
    if(exitModalDate.trim()&&!exitModalDecision){setExitModalError('Responda se a empresa tem obrigações no mês de saída.');return;}
    setExitModalError(null);
    setExitSubmitting(true);

    try {
      const res = await fetch(`${API}/api/companies/${exitModalCompany.id}`, {
        method: 'PUT',
        headers: installmentHeaders(currentUser),
        body: JSON.stringify({ 
          exitDate: exitModalDate.trim() || null, 
          exitMonthHasObligations: !!exitModalDate.trim() && exitModalDecision === 'SIM',
          userId: currentUser?.id,
          userName: currentUser?.name,
          userEmail: currentUser?.email
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setExitModalError(data.error || 'Erro ao registrar saída da empresa.');
        return;
      }

      setIsExitModalOpen(false);
      fetchCompanies();
    } catch (err: any) {
      console.error(err);
      setExitModalError(err.message || 'Erro ao registrar data de saída.');
    } finally {
      setExitSubmitting(false);
    }
  };

  const handleReactivateCompany = async () => {
    if (!exitModalCompany) return;
    setExitModalError(null);
    setExitSubmitting(true);

    try {
      const res = await fetch(`${API}/api/companies/${exitModalCompany.id}`, {
        method: 'PUT',
        headers: installmentHeaders(currentUser),
        body: JSON.stringify({ 
          exitDate: null, 
          exitMonthHasObligations: false,
          userId: currentUser?.id,
          userName: currentUser?.name,
          userEmail: currentUser?.email
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setExitModalError(data.error || 'Erro ao reativar empresa.');
        return;
      }

      setIsExitModalOpen(false);
      fetchCompanies();
    } catch (err: any) {
      console.error(err);
      setExitModalError(err.message || 'Erro ao reativar empresa.');
    } finally {
      setExitSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      if (onlyMyCompanies && !isUserResponsibleForCompany(currentUser, c, null)) return false;
      if (!isPrivileged && !canUserViewCompany(currentUser, c, null)) return false;
      const search = searchTerm.toLowerCase().trim();
      const matchSearch =
        !search ||
        (c.name && c.name.toLowerCase().includes(search)) ||
        (c.tradeName && c.tradeName.toLowerCase().includes(search)) ||
        (c.cnpj && c.cnpj.includes(search)) ||
        (c.code && c.code.toLowerCase().includes(search)) ||
        (c.groupName && c.groupName.toLowerCase().includes(search)) ||
        (c.city && c.city.toLowerCase().includes(search));

      const isExternal = isExternalInstallmentCompany(c);
      const isCompanyActive = !c.exitDate && !isExternal;
      const matchSituation =
        search.length > 0 || filterSituation === 'ALL'
          ? true
          : filterSituation === 'ACTIVE'
            ? isCompanyActive && !c.isSuspended
            : filterSituation === 'SUSPENDED'
              ? Boolean(c.isSuspended)
              : filterSituation === 'INACTIVE'
                ? !isCompanyActive && !isExternal
                : isExternal;

      const matchRegime = filterRegime === 'ALL' || c.taxRegime === filterRegime;
      const matchType = filterType === 'ALL' || c.companyType === filterType;
      const matchCert =
        filterCert === 'ALL' ||
        (filterCert === 'SIM' && c.hasClientCertificate) ||
        (filterCert === 'NAO' && !c.hasClientCertificate);

      return matchSearch && matchSituation && matchRegime && matchType && matchCert;
    }).sort((a, b) => compareCodes(a.code, b.code, true));
  }, [companies, searchTerm, filterRegime, filterType, filterCert, filterSituation, onlyMyCompanies, currentUser, isPrivileged]);

  const stats = useMemo(() => {
    const total = companies.length;
    const active = companies.filter((c) => !c.exitDate && !isExternalInstallmentCompany(c) && !c.isSuspended).length;
    const suspended = companies.filter((c) => c.isSuspended).length;
    const external = companies.filter((c) => isExternalInstallmentCompany(c)).length;
    const withCert = companies.filter((c) => c.hasClientCertificate).length;
    const simples = companies.filter((c) => c.taxRegime === 'SIMPLES_NACIONAL' || c.taxRegime === 'SIMPLES_NACIONAL_HIBRIDO').length;
    return { total, active, suspended, external, withCert, simples };
  }, [companies]);

  const getRegimeLabel = (val: string) => {
    const found = TAX_REGIME_OPTIONS.find((r) => r.value === val);
    return found ? found.label : val;
  };

  const getRegimeClass = (val: string) => {
    if (val === 'SIMPLES_NACIONAL' || val === 'SIMPLES_NACIONAL_HIBRIDO') return 'badge-regime--simples';
    if (val === 'LUCRO_PRESUMIDO') return 'badge-regime--lucro-presumido';
    if (val?.startsWith('LUCRO_REAL')) return 'badge-regime--lucro-real';
    if (val === 'MEI') return 'badge-regime--mei';
    return 'badge-regime--outros';
  };

  const getSortLabel = (sortBy: string) => {
    switch (sortBy) {
      case 'CODE': return 'Código';
      case 'NAME': return 'Ordem Alfabética (Razão Social)';
      case 'TAX_REGIME': return 'Regime Tributário';
      case 'CITY': return 'Município / Praça';
      case 'GROUP': return 'Grupo Empresarial';
      case 'SITUATION': return 'Situação Cadastral';
      case 'CONTRACT_DATE': return 'Data de Contrato';
      default: return sortBy;
    }
  };

  const handleExecuteExportExcel = () => {
    setExporting(true);
    try {
      const sourceCompanies = exportScope === 'FILTERED' ? [...filteredCompanies] : [...companies];

      // Ordenação conforme selecionado
      sourceCompanies.sort((a, b) => {
        let comparison = 0;
        switch (exportSortBy) {
          case 'CODE':
            comparison = compareCodes(a.code, b.code, true);
            break;
          case 'NAME':
            comparison = (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
            break;
          case 'TAX_REGIME': {
            const regA = getRegimeLabel(a.taxRegime) || '';
            const regB = getRegimeLabel(b.taxRegime) || '';
            comparison = regA.localeCompare(regB, 'pt-BR');
            if (comparison === 0) comparison = (a.name || '').localeCompare(b.name || '', 'pt-BR');
            break;
          }
          case 'CITY': {
            const cityA = (a.city || '').trim();
            const cityB = (b.city || '').trim();
            comparison = cityA.localeCompare(cityB, 'pt-BR');
            if (comparison === 0) comparison = compareCodes(a.code, b.code, true);
            break;
          }
          case 'GROUP': {
            const groupA = (a.groupName || '').trim();
            const groupB = (b.groupName || '').trim();
            comparison = groupA.localeCompare(groupB, 'pt-BR');
            if (comparison === 0) comparison = (a.name || '').localeCompare(b.name || '', 'pt-BR');
            break;
          }
          case 'SITUATION': {
            const getSitRank = (c: Company) => (c.exitDate ? 2 : isExternalInstallmentCompany(c) ? 3 : 1);
            comparison = getSitRank(a) - getSitRank(b);
            if (comparison === 0) comparison = compareCodes(a.code, b.code, true);
            break;
          }
          case 'CONTRACT_DATE': {
            const dateA = a.contractDate ? new Date(a.contractDate).getTime() : 0;
            const dateB = b.contractDate ? new Date(b.contractDate).getTime() : 0;
            comparison = dateA - dateB;
            if (comparison === 0) comparison = compareCodes(a.code, b.code, true);
            break;
          }
          default:
            comparison = compareCodes(a.code, b.code, true);
        }

        return exportSortDirection === 'DESC' ? -comparison : comparison;
      });

      // Mapeamento dos dados
      const exportData = sourceCompanies.map((c) => {
        const isExternal = isExternalInstallmentCompany(c);
        const situation = c.exitDate
          ? `Inativa (Saída: ${formatDateToBr(c.exitDate)})`
          : isExternal
          ? 'Externa (Parcelamento)'
          : 'Ativa';

        // Responsáveis atribuídos
        const responsiblesBySector = (c.responsibles || []).reduce((acc: Record<string, string>, r) => {
          const sec = (r.sector || 'Geral').toUpperCase();
          const uName = r.user?.name || r.user?.email || 'Atribuído';
          acc[sec] = acc[sec] ? `${acc[sec]}, ${uName}` : uName;
          return acc;
        }, {});

        const row: Record<string, any> = {
          code: c.code ? formatCompanyCode(c.code) : 'Sem código',
          name: c.name || '',
          tradeName: c.tradeName || '',
          cnpj: c.cnpj ? formatCnpjMask(c.cnpj) : '',
          groupName: c.groupName || '',
          taxRegime: getRegimeLabel(c.taxRegime),
          companyType: c.companyType || '',
          deliveryMethod: c.deliveryMethod || '',
          activeSectors: c.activeSectors === 'TODOS' ? 'Todos' : (c.activeSectors || 'Todos'),
          city: c.city || '',
          stateRegistration: c.stateRegistration || '',
          municipalRegistration: c.municipalRegistration || '',
          situation,
          contractDate: formatDateToBr(c.contractDate),
          obligationStartDate: formatDateToBr(c.obligationStartDate),
          exitDate: formatDateToBr(c.exitDate),
          hasClientCertificate: c.hasClientCertificate ? 'Sim' : 'Não',
          certificateType: c.hasClientCertificate ? (c.certificateType || 'A1') : '',
          certificateExpiration: formatDateToBr(c.certificateExpiration),
          targetProxyDate: formatDateToBr(c.targetProxyDate),
          fgtsProxyDate: formatDateToBr(c.fgtsProxyDate),
          decProxyDate: formatDateToBr(c.decProxyDate),
          empregadorProxyDate: formatDateToBr(c.empregadorProxyDate),
          dissidioMonthYear: c.dissidioMonthYear || '',
          respFiscal: responsiblesBySector['FISCAL'] || '',
          respDp: responsiblesBySector['DP'] || '',
          respContabil: responsiblesBySector['CONTABIL'] || '',
          respCushman: responsiblesBySector['CUSHMAN'] || '',
          notes: c.notes || '',
        };

        if (exportIncludeCredentials) {
          row.cityHallLink = c.cityHallLink || '';
          row.cityHallLogin = c.cityHallLogin || '';
          row.nfAccessType = c.nfAccessType || '';
          row.nfLogin = c.nfLogin || '';
        }

        return row;
      });

      const columns = [
        { header: 'Código', key: 'code' },
        { header: 'Razão Social', key: 'name' },
        { header: 'Nome Fantasia', key: 'tradeName' },
        { header: 'CNPJ / CPF', key: 'cnpj' },
        { header: 'Grupo Empresarial', key: 'groupName' },
        { header: 'Regime Tributário', key: 'taxRegime' },
        { header: 'Tipo de Empresa', key: 'companyType' },
        { header: 'Método de Envio', key: 'deliveryMethod' },
        { header: 'Setores Ativos', key: 'activeSectors' },
        { header: 'Município', key: 'city' },
        { header: 'Inscrição Estadual', key: 'stateRegistration' },
        { header: 'Inscrição Municipal', key: 'municipalRegistration' },
        { header: 'Situação', key: 'situation' },
        { header: 'Data de Contrato', key: 'contractDate' },
        { header: 'Início Obrigação', key: 'obligationStartDate' },
        { header: 'Data Saída', key: 'exitDate' },
        { header: 'Certificado Próprio', key: 'hasClientCertificate' },
        { header: 'Tipo Certificado', key: 'certificateType' },
        { header: 'Vencimento Certificado', key: 'certificateExpiration' },
        { header: 'Proc. Receita Federal (Vencimento)', key: 'targetProxyDate' },
        { header: 'Proc. FGTS Digital (Vencimento)', key: 'fgtsProxyDate' },
        { header: 'Proc. DEC (Vencimento)', key: 'decProxyDate' },
        { header: 'Proc. Empregador Web (Vencimento)', key: 'empregadorProxyDate' },
        { header: 'Mês/Ano Dissídio', key: 'dissidioMonthYear' },
        { header: 'Responsável Fiscal', key: 'respFiscal' },
        { header: 'Responsável DP', key: 'respDp' },
        { header: 'Responsável Contábil', key: 'respContabil' },
        { header: 'Responsável Cushman', key: 'respCushman' },
        { header: 'Observações Cadastrais', key: 'notes' },
      ];

      if (exportIncludeCredentials) {
        columns.push(
          { header: 'Link Prefeitura', key: 'cityHallLink' },
          { header: 'Usuário Prefeitura', key: 'cityHallLogin' },
          { header: 'Tipo Acesso NF', key: 'nfAccessType' },
          { header: 'Usuário NF', key: 'nfLogin' }
        );
      }

      const today = new Date().toISOString().slice(0, 10);
      const sortSuffix = exportSortBy.toLowerCase();
      const filename = `relatorio_empresas_qmax_${sortSuffix}_${today}`;

      exportToCsv(filename, columns, exportData);
      setIsExportModalOpen(false);
      showToast(`Planilha gerada com sucesso! (${exportData.length} empresas ordenadas por ${getSortLabel(exportSortBy)})`, 'success');
    } catch (err: any) {
      console.error('Erro ao exportar empresas para Excel:', err);
      showToast('Erro ao exportar dados para Excel.', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="crm-dashboard">
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <main className="crm-main">
        {/* Header padrão consistente */}
        <header className="crm-header">
          <div className="page-header">
            <h1>
              <Building2 size={26} color="#d90f81" />
              Cadastrar & Gerenciar Empresas
              <span className="companies-badge-count">{companies.length} cadastradas</span>
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Cadastro unificado de obrigações, tributação, certificados digitais e acessos municipais
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-export-excel"
              onClick={() => setIsExportModalOpen(true)}
              title="Exportar catálogo de empresas para planilha Excel"
            >
              <FileSpreadsheet size={18} />
              <span>Exportar Excel</span>
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={openNewCompanyModal}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
            >
              <Plus size={18} />
              Nova Empresa
            </button>
          </div>
        </header>

        {/* Conteúdo Principal com padding correto */}
        <div className="dashboard-content">
          <div className="companies-page-container">
            {/* Top Stat Cards */}
            <div className="companies-stats-grid">
              <div className="companies-stat-card">
                <div className="companies-stat-icon" style={{ background: 'rgba(217, 15, 129, 0.15)', color: '#f472b6' }}>
                  <Building2 size={22} />
                </div>
                <div className="companies-stat-info">
                  <strong>{stats.total}</strong>
                  <span>Total de Empresas</span>
                </div>
              </div>

              <div className="companies-stat-card">
                <div className="companies-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                  <CheckCircle2 size={22} />
                </div>
                <div className="companies-stat-info">
                  <strong>{stats.active}</strong>
                  <span>Empresas Ativas</span>
                </div>
              </div>

              <div className="companies-stat-card">
                <div className="companies-stat-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                  <KeyRound size={22} />
                </div>
                <div className="companies-stat-info">
                  <strong>{stats.withCert}</strong>
                  <span>Com Certificado Digital</span>
                </div>
              </div>

              <div className="companies-stat-card">
                <div className="companies-stat-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                  <Layers size={22} />
                </div>
                <div className="companies-stat-info">
                  <strong>{stats.simples}</strong>
                  <span>Simples Nacional</span>
                </div>
              </div>
            </div>

            {/* Toolbar de Pesquisa & Filtros */}
            <div className="companies-toolbar-card">
              <div className="companies-search-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Buscar por Razão Social, CNPJ, Código, Grupo ou Município..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="companies-filters-group">
                <label className="checkbox-label filter-my-companies" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, padding: '0 8px', cursor: 'pointer', userSelect: 'none', fontSize: 13, color: '#cbd5e1' }}>
                  <input
                    type="checkbox"
                    checked={onlyMyCompanies}
                    onChange={(e) => setOnlyMyCompanies(e.target.checked)}
                    style={{ accentColor: '#d90f81', cursor: 'pointer' }}
                  />
                  <span>Minhas empresas</span>
                </label>

                <select
                  className="companies-filter-select"
                  value={filterSituation}
                  onChange={(e) => setFilterSituation(e.target.value as any)}
                  style={{
                    fontWeight: 600,
                    color: filterSituation === 'ACTIVE' ? '#34d399' : filterSituation === 'SUSPENDED' ? '#f59e0b' : filterSituation === 'INACTIVE' ? '#f87171' : filterSituation === 'EXTERNAL' ? '#c084fc' : undefined
                  }}
                >
                  <option value="ACTIVE">Situação: Apenas Ativas ({stats.active})</option>
                  <option value="SUSPENDED">Situação: Suspensos ({stats.suspended})</option>
                  <option value="INACTIVE">Situação: Inativas (Saíram)</option>
                  <option value="EXTERNAL">Situação: Externas (Parcelamento)</option>
                  <option value="ALL">Situação: Todas as Empresas</option>
                </select>

                <select
                  className="companies-filter-select"
                  value={filterRegime}
                  onChange={(e) => setFilterRegime(e.target.value)}
                >
                  <option value="ALL">Todas as Tributações</option>
                  {TAX_REGIME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <select
                  className="companies-filter-select"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="ALL">Todos os Tipos</option>
                  {COMPANY_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <select
                  className="companies-filter-select"
                  value={filterCert}
                  onChange={(e) => setFilterCert(e.target.value)}
                >
                  <option value="ALL">Certificado: Todos</option>
                  <option value="SIM">Com Certificado (SIM)</option>
                  <option value="NAO">Sem Certificado (NÃO)</option>
                </select>
              </div>
            </div>

            {/* Tabela de Empresas */}
            <div className="companies-table-container">
              {loading ? (
                <div style={{ padding: '24px' }}>
                  <TableSkeleton count={6} />
                </div>
              ) : filteredCompanies.length === 0 ? (
                <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Building2 size={36} style={{ opacity: 0.3, marginBottom: '10px' }} />
                  <p style={{ fontSize: '14px', color: '#fff', fontWeight: 600 }}>Nenhuma empresa encontrada</p>
                  <p style={{ fontSize: '12px', marginTop: '4px' }}>Ajuste os filtros ou adicione uma nova empresa.</p>
                </div>
              ) : (
                <div className="companies-table-responsive">
                  <table className="comp-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            className="bulk-table-checkbox"
                            checked={filteredCompanies.length > 0 && selectedCompanyIds.length === filteredCompanies.length}
                            onChange={() => {
                              if (selectedCompanyIds.length === filteredCompanies.length) {
                                setSelectedCompanyIds([]);
                              } else {
                                setSelectedCompanyIds(filteredCompanies.map((c) => c.id));
                              }
                            }}
                            title={selectedCompanyIds.length === filteredCompanies.length ? "Desmarcar todas" : "Selecionar todas as empresas filtradas"}
                          />
                        </th>
                        <th style={{ width: '70px' }}>Cód.</th>
                        <th>Empresa & CNPJ/CPF</th>
                        <th>Grupo</th>
                        <th>Tributação</th>
                        <th>Tipo / Envio</th>
                        <th>Certificado</th>
                        <th>Município</th>
                        <th>Acessos & Senhas</th>
                        <th style={{ textAlign: 'right', width: '90px' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompanies.map((comp) => {
                        const isCertPwdRevealed = Boolean(revealedTablePasswords[`cert_${comp.id}`]);
                        const isGinfessRevealed = Boolean(revealedTablePasswords[`ginfess_${comp.id}`]);
                        const isSelected = selectedCompanyIds.includes(comp.id);

                        return (
                          <tr key={comp.id} style={{ background: isSelected ? 'rgba(59, 130, 246, 0.08)' : undefined }}>
                            {/* Checkbox de Seleção */}
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                className="bulk-table-checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedCompanyIds((prev) =>
                                    prev.includes(comp.id) ? prev.filter((id) => id !== comp.id) : [...prev, comp.id]
                                  );
                                }}
                              />
                            </td>

                            {/* Código */}
                            <td>
                              {comp.code ? (
                                <span className="comp-code-tag">{formatCompanyCode(comp.code)}</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                              )}
                            </td>

                            {/* Nome & CNPJ */}
                            <td>
                              <div className="comp-name-group">
                                <span className="comp-name-title">
                                  {comp.name}
                                  {comp.isSuspended && (
                                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)', fontWeight: 600 }} title={`Serviços Suspensos: ${comp.suspendedReason || ''}`}>
                                      SUSPENSO
                                    </span>
                                  )}
                                  {comp.exitDate && (
                                    <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
                                      Inativa
                                    </span>
                                  )}
                                  {isExternalInstallmentCompany(comp) && (
                                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(168,85,247,0.2)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.3)' }} title="Empresa cadastrada apenas para controle de parcelamentos (sem obrigações contábeis mensais)">
                                      Externa · Parcelamento
                                    </span>
                                  )}
                                </span>
                                <div className="comp-cnpj-row">
                                  <span>{formatCnpjMask(comp.cnpj)}</span>
                                  <button
                                    type="button"
                                    className="comp-btn-copy"
                                    onClick={() => copyToClipboard(comp.cnpj, comp.id)}
                                    title="Copiar CNPJ/CPF"
                                  >
                                    {copiedId === comp.id ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                                  </button>
                                  {comp.tradeName && <span style={{ opacity: 0.65 }}>• {comp.tradeName}</span>}
                                </div>
                              </div>
                            </td>

                            {/* Grupo */}
                            <td>
                              {comp.groupName ? (
                                <span className="comp-group-badge">{comp.groupName}</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                              )}
                            </td>

                            {/* Tributação */}
                            <td>
                              <span className={`badge-regime ${getRegimeClass(comp.taxRegime)}`}>
                                {getRegimeLabel(comp.taxRegime)}
                              </span>
                            </td>

                            {/* Tipo e Método */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px' }}>
                                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{comp.companyType || 'Não inf.'}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{comp.deliveryMethod || 'E-mail'}</span>
                              </div>
                            </td>

                            {/* Certificado */}
                            <td>
                              {comp.hasClientCertificate ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span className="cert-pill-yes">
                                    <CheckCircle2 size={11} /> SIM ({comp.certificateType || 'A1'})
                                  </span>
                                  {comp.certificateExpiration && (
                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                      Venc: {formatDateToBr(comp.certificateExpiration)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="cert-pill-no">
                                  <XCircle size={11} /> NÃO
                                </span>
                              )}
                            </td>

                            {/* Município */}
                            <td>
                              <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                                {comp.city || '-'}
                              </span>
                            </td>

                            {/* Senhas */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {comp.hasClientCertificate && comp.certificatePasswordDecrypted && (
                                  <div className="comp-pwd-chip" title="Senha Certificado">
                                    <span style={{ color: '#f472b6', marginRight: '2px' }}>Cert:</span>
                                    <span>{isCertPwdRevealed ? comp.certificatePasswordDecrypted : '••••••••'}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRevealedTablePasswords((prev) => ({
                                          ...prev,
                                          [`cert_${comp.id}`]: !isCertPwdRevealed,
                                        }))
                                      }
                                    >
                                      {isCertPwdRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
                                    </button>
                                  </div>
                                )}

                                {comp.ginfessPasswordDecrypted && (
                                  <div className="comp-pwd-chip" title="Senha Ginfess">
                                    <span style={{ color: '#60a5fa', marginRight: '2px' }}>Ginf:</span>
                                    <span>{isGinfessRevealed ? comp.ginfessPasswordDecrypted : '••••••••'}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRevealedTablePasswords((prev) => ({
                                          ...prev,
                                          [`ginfess_${comp.id}`]: !isGinfessRevealed,
                                        }))
                                      }
                                    >
                                      {isGinfessRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
                                    </button>
                                  </div>
                                )}

                                {!comp.certificatePasswordDecrypted && !comp.ginfessPasswordDecrypted && (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Sem senhas</span>
                                )}
                              </div>
                            </td>

                            {/* Ações */}
                            <td style={{ textAlign: 'right' }}>
                              {(() => {
                                const canEditThis = isPrivileged || canUserEditCompany(currentUser, comp, null);
                                return (
                                  <div className="comp-actions-cell">
                                    {comp.cityHallLink && (
                                      <a
                                        href={comp.cityHallLink.startsWith('http') ? comp.cityHallLink : `https://${comp.cityHallLink}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="comp-action-btn"
                                        title="Abrir Link da Prefeitura"
                                      >
                                        <ExternalLink size={13} />
                                      </a>
                                    )}
                                    <button
                                      type="button"
                                      className="comp-action-btn"
                                      title="Emitir Dossiê Mensal de Conformidade (PDF)"
                                      onClick={() => {
                                        window.dispatchEvent(new CustomEvent('open-monthly-dossier', { detail: { company: comp } }));
                                      }}
                                      style={{ color: '#10b981' }}
                                    >
                                      <Award size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="comp-action-btn"
                                      title="Simular Fator R (Simples Nacional)"
                                      onClick={() => {
                                        window.dispatchEvent(new CustomEvent('open-factor-r', { detail: { companyName: comp.name } }));
                                      }}
                                      style={{ color: '#c084fc' }}
                                    >
                                      <Calculator size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="comp-action-btn"
                                      disabled={!canEditThis}
                                      title={canEditThis ? "Editar Empresa" : "Somente visualização (você não é responsável por esta empresa)"}
                                      onClick={() => openEditCompanyModal(comp)}
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!canEditThis}
                                      className={`comp-action-btn ${comp.exitDate ? 'comp-action-btn--inactive' : ''}`}
                                      title={!canEditThis ? "Somente visualização (você não é responsável por esta empresa)" : comp.exitDate ? `Saída registrada: ${formatDateToBr(comp.exitDate)}. Clique para gerenciar ou reativar.` : "Registrar Data de Saída"}
                                      onClick={() => openExitModal(comp)}
                                      style={{ color: comp.exitDate ? '#fbbf24' : '#f87171' }}
                                    >
                                      {comp.exitDate ? <RotateCcw size={13} /> : <CalendarX size={13} />}
                                    </button>
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal de Cadastro/Edição com os 22 Campos */}
        {isModalOpen && (
          <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-header-left">
                  <div className="modal-header-icon">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h2>{editingCompany ? `Editar Empresa: ${editingCompany.name}` : 'Cadastrar Nova Empresa'}</h2>
                    <p>Preencha os dados cadastrais, obrigações, acessos e particularidades</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="modal-body">
                {modalError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontSize: '13px' }}>
                    <AlertCircle size={16} />
                    <span>{modalError}</span>
                  </div>
                )}
                {modalSuccess && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#6ee7b7', fontSize: '13px' }}>
                    <CheckCircle2 size={16} />
                    <span>{modalSuccess}</span>
                  </div>
                )}

                {/* SEÇÃO 1: IDENTIFICAÇÃO E DADOS FISCAIS */}
                <div className="form-section">
                  <div className="form-section-title">
                    <Building2 size={15} />
                    <span>1. Identificação & Dados Fiscais</span>
                  </div>

                  <div className="grid-3">
                    <div className="input-field">
                      <label htmlFor="modal-code">
                        1. Código <span className="hint">(letras/números)</span>
                      </label>
                      <input
                        id="modal-code"
                        type="text"
                        placeholder="Ex: 001, EMP-A"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </div>

                    <div className="input-field" style={{ gridColumn: 'span 2' }}>
                      <label htmlFor="modal-cnpj">
                        2. CNPJ / CPF <span className="req">*</span> <span className="hint">(com busca na Receita para CNPJ)</span>
                      </label>
                      <div className="cnpj-input-wrap">
                        <input
                          id="modal-cnpj"
                          type="text"
                          placeholder="CNPJ (14 dígitos) ou CPF (11 dígitos)"
                          value={cnpj}
                          onChange={(e) => setCnpj(formatCnpjMask(e.target.value))}
                          required
                        />
                        {(() => {
                          const digits = cnpj.replace(/\D/g, '');
                          const isCpf = digits.length === 11;
                          return (
                            <button
                              type="button"
                              className="btn-cnpj-query"
                              onClick={handleLookupCnpj}
                              disabled={searchingCnpj || isCpf}
                              title={isCpf ? 'A Receita Federal não disponibiliza consulta automática para CPF (Pessoa Física). Preencha o nome abaixo manualmente.' : 'Consultar dados na Receita Federal (CNPJ)'}
                              style={{ opacity: isCpf ? 0.75 : 1 }}
                            >
                              {searchingCnpj ? <ButtonSpinner /> : <Sparkles size={12} />}
                              <span>{searchingCnpj ? 'Buscando...' : isCpf ? 'Consulta só PJ' : 'Consultar'}</span>
                            </button>
                          );
                        })()}
                      </div>
                      {cnpj.replace(/\D/g, '').length === 11 && (
                        <span style={{ fontSize: '11px', color: '#38bdf8', marginTop: '4px', display: 'block' }}>
                          ✓ Identificado como <strong>CPF (Pessoa Física)</strong>. Preencha a Razão Social/Nome e dados cadastrais abaixo.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid-2">
                    <div className="input-field">
                      <label htmlFor="modal-name">
                        3. Nome da Empresa / Razão Social <span className="req">*</span>
                      </label>
                      <input
                        id="modal-name"
                        type="text"
                        placeholder="Nome oficial"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-trade">Nome Fantasia</label>
                      <input
                        id="modal-trade"
                        type="text"
                        placeholder="Nome comercial"
                        value={tradeName}
                        onChange={(e) => setTradeName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid-4">
                    <div className="input-field">
                      <label htmlFor="modal-group">4. GRUPO</label>
                      <input
                        id="modal-group"
                        type="text"
                        list="company-group-suggestions"
                        placeholder="Grupo econômico"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                      />
                      <datalist id="company-group-suggestions">
                        {catalog.groupSuggestions.map((g) => (
                          <option key={g} value={g} />
                        ))}
                      </datalist>
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-ie">5. Inscrição Estadual</label>
                      <input
                        id="modal-ie"
                        type="text"
                        placeholder="Inscrição Estadual"
                        value={stateRegistration}
                        onChange={(e) => setStateRegistration(e.target.value)}
                      />
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-im">6. Inscrição Municipal</label>
                      <input
                        id="modal-im"
                        type="text"
                        placeholder="Inscrição Municipal"
                        value={municipalRegistration}
                        onChange={(e) => setMunicipalRegistration(e.target.value)}
                      />
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-city">7. Município</label>
                      <input
                        id="modal-city"
                        type="text"
                        placeholder="Cidade - UF"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 2: DATAS E CICLO */}
                <div className="form-section">
                  <div className="form-section-title">
                    <Calendar size={15} />
                    <span>2. Datas & Ciclo de Obrigações (Formato BR)</span>
                  </div>

                  <div className="grid-4">
                    <div className="input-field">
                      <label htmlFor="modal-contract">
                        8. Data de Contrato <span className="req">*</span>
                      </label>
                      <input
                        id="modal-contract"
                        type="text"
                        placeholder="DD/MM/AAAA"
                        value={contractDate}
                        onChange={(e) => setContractDate(formatBrDateMask(e.target.value))}
                        required
                      />
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-obligation">
                        9. Data de Obrigação <span className="req">*</span>
                      </label>
                      <input
                        id="modal-obligation"
                        type="text"
                        placeholder="DD/MM/AAAA"
                        value={obligationStartDate}
                        onChange={(e) => setObligationStartDate(formatBrDateMask(e.target.value))}
                        required
                      />
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-exit">
                        10. Data de Saída <span className="hint">(vazio = ativa)</span>
                      </label>
                      <input
                        id="modal-exit"
                        type="text"
                        placeholder="DD/MM/AAAA"
                        value={exitDate}
                        onChange={(e) => {setExitDate(formatBrDateMask(e.target.value));setExitMonthDecision('');}}
                      />
                    </div>

                    {exitDate.trim()&&<ExitMonthQuestion value={exitMonthDecision} onChange={setExitMonthDecision} disabled={submitting}/>}
                  </div>
                </div>

                {/* SEÇÃO PROCURAÇÕES */}
                <div className="form-section">
                  <div className="form-section-title">
                    <FileText size={15} />
                    <span>Procurações (Emissão e Vencimento)</span>
                  </div>
                  <div className="grid-4">
                    <div className="input-field">
                      <label htmlFor="modal-proxy-receita-issue">Rec. Federal (eCAC) Emissão</label>
                      <input id="modal-proxy-receita-issue" type="text" placeholder="DD/MM/AAAA" value={targetProxyIssueDate} onChange={(e) => setTargetProxyIssueDate(formatBrDateMask(e.target.value))} />
                    </div>
                    <div className="input-field">
                      <label htmlFor="modal-proxy-receita">Rec. Federal (eCAC) Venc.</label>
                      <input id="modal-proxy-receita" type="text" placeholder="DD/MM/AAAA" value={targetProxyDate} onChange={(e) => setTargetProxyDate(formatBrDateMask(e.target.value))} />
                    </div>
                    <div className="input-field">
                      <label htmlFor="modal-proxy-fgts-issue">FGTS Digital Emissão</label>
                      <input id="modal-proxy-fgts-issue" type="text" placeholder="DD/MM/AAAA" value={fgtsProxyIssueDate} onChange={(e) => setFgtsProxyIssueDate(formatBrDateMask(e.target.value))} />
                    </div>
                    <div className="input-field">
                      <label htmlFor="modal-proxy-fgts">FGTS Digital Venc.</label>
                      <input id="modal-proxy-fgts" type="text" placeholder="DD/MM/AAAA" value={fgtsProxyDate} onChange={(e) => setFgtsProxyDate(formatBrDateMask(e.target.value))} />
                    </div>
                    <div className="input-field">
                      <label htmlFor="modal-proxy-dec-issue">Caixa Postal DEC Emissão</label>
                      <input id="modal-proxy-dec-issue" type="text" placeholder="DD/MM/AAAA" value={decProxyIssueDate} onChange={(e) => setDecProxyIssueDate(formatBrDateMask(e.target.value))} />
                    </div>
                    <div className="input-field">
                      <label htmlFor="modal-proxy-dec">Caixa Postal DEC Venc.</label>
                      <input id="modal-proxy-dec" type="text" placeholder="DD/MM/AAAA" value={decProxyDate} onChange={(e) => setDecProxyDate(formatBrDateMask(e.target.value))} />
                    </div>
                    <div className="input-field">
                      <label htmlFor="modal-proxy-emp-issue">Portal Empregador Emissão</label>
                      <input id="modal-proxy-emp-issue" type="text" placeholder="DD/MM/AAAA" value={empregadorProxyIssueDate} onChange={(e) => setEmpregadorProxyIssueDate(formatBrDateMask(e.target.value))} />
                    </div>
                    <div className="input-field">
                      <label htmlFor="modal-proxy-emp">Portal Empregador Venc.</label>
                      <input id="modal-proxy-emp" type="text" placeholder="DD/MM/AAAA" value={empregadorProxyDate} onChange={(e) => setEmpregadorProxyDate(formatBrDateMask(e.target.value))} />
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 3: TRIBUTAÇÃO, TIPO E SETORES */}
                <div className="form-section">
                  <div className="form-section-title">
                    <Briefcase size={15} />
                    <span>3. Tributação, Tipo de Empresa & Setores</span>
                  </div>

                  <div className="grid-3">
                    <div className="input-field">
                      <label htmlFor="modal-tax">
                        13. Tributação <span className="req">*</span>
                      </label>
                      <select
                        id="modal-tax"
                        value={taxRegime}
                        onChange={(e) => setTaxRegime(e.target.value)}
                        required
                      >
                        {TAX_REGIME_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-type">
                        14. Tipo de Empresa <span className="req">*</span>
                      </label>
                      <select
                        id="modal-type"
                        value={companyType}
                        onChange={(e) => setCompanyType(e.target.value)}
                        required
                      >
                        {mergeOptionsWithCurrent(catalog.companyTypes, companyType).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-method">
                        15. Método de Envio <span className="req">*</span>
                      </label>
                      <select
                        id="modal-method"
                        value={deliveryMethod}
                        onChange={(e) => setDeliveryMethod(e.target.value)}
                        required
                      >
                        {mergeOptionsWithCurrent(catalog.deliveryMethods, deliveryMethod).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="input-field" style={{ marginTop: '6px' }}>
                    <label>16. Setores Ativos</label>
                    <div className="sectors-wrap">
                      <button
                        type="button"
                        className={`sector-btn ${(selectedSectors.includes('TODOS') || selectedSectors.includes('Todos')) ? 'selected' : ''}`}
                        onClick={() => handleToggleSector('TODOS')}
                      >
                        ✓ Todos os Setores
                      </button>
                      {SECTOR_OPTIONS.map((opt) => {
                        const isSel = (selectedSectors.includes(opt.key) || selectedSectors.includes(opt.label)) && !selectedSectors.includes('TODOS') && !selectedSectors.includes('Todos');
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            className={`sector-btn ${isSel ? 'selected' : ''}`}
                            onClick={() => handleToggleSector(opt.key)}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 4: CERTIFICADO DIGITAL */}
                <div className="form-section">
                  <div className="form-section-title">
                    <KeyRound size={15} />
                    <span>4. Certificado Digital do Cliente</span>
                  </div>

                  <div className="input-field">
                    <label>12. Possui Certificado do Cliente?</label>
                    <div className="radio-toggle">
                      <button
                        type="button"
                        className={hasClientCertificate ? 'active-yes' : ''}
                        onClick={() => setHasClientCertificate(true)}
                      >
                        <CheckCircle2 size={14} /> SIM
                      </button>
                      <button
                        type="button"
                        className={!hasClientCertificate ? 'active-no' : ''}
                        onClick={() => setHasClientCertificate(false)}
                      >
                        <XCircle size={14} /> NÃO
                      </button>
                    </div>
                  </div>

                  {hasClientCertificate && (
                    <div style={{ padding: '14px', background: 'rgba(217, 15, 129, 0.04)', border: '1px solid rgba(217, 15, 129, 0.2)', borderRadius: '8px', marginTop: '4px' }}>
                      <div className="grid-4">
                        <div className="input-field">
                          <label htmlFor="modal-cert-type">Tipo Certificado</label>
                          <select
                            id="modal-cert-type"
                            value={certificateType}
                            onChange={(e) => setCertificateType(e.target.value)}
                          >
                            {mergeOptionsWithCurrent(catalog.certificateTypes, certificateType).map((ct) => (
                              <option key={ct} value={ct}>
                                {ct}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="input-field">
                          <label htmlFor="modal-cert-pwd">
                            Senha <span className="hint">(🔒 Criptografada)</span>
                          </label>
                          <div className="pwd-input-wrap">
                            <input
                              id="modal-cert-pwd"
                              type={showCertPwd ? 'text' : 'password'}
                              placeholder="Senha certificado"
                              value={certificatePassword}
                              onChange={(e) => setCertificatePassword(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn-eye"
                              onClick={() => setShowCertPwd(!showCertPwd)}
                              title={showCertPwd ? 'Ocultar' : 'Revelar'}
                            >
                              {showCertPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>

                        <div className="input-field">
                          <label htmlFor="modal-cert-issue">Emissão (Mês/Ano)</label>
                          <input
                            id="modal-cert-issue"
                            type="text"
                            placeholder="MM/AAAA"
                            value={certificateIssue}
                            onChange={(e) => setCertificateIssue(formatMonthYearMask(e.target.value))}
                          />
                        </div>

                        <div className="input-field">
                          <label htmlFor="modal-cert-exp">Vencimento (Mês/Ano)</label>
                          <input
                            id="modal-cert-exp"
                            type="text"
                            placeholder="MM/AAAA"
                            value={certificateExpiration}
                            onChange={(e) => setCertificateExpiration(formatMonthYearMask(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* SEÇÃO 5: ACESSOS PREFEITURA & GINFESS */}
                <div className="form-section">
                  <div className="form-section-title">
                    <Globe size={15} />
                    <span>5. Acessos Prefeitura & Portais</span>
                  </div>

                  <div className="grid-2">
                    <div className="input-field">
                      <label htmlFor="modal-city-login">17. Login Prefeitura</label>
                      <input
                        id="modal-city-login"
                        type="text"
                        placeholder="Login / Usuário"
                        value={cityHallLogin}
                        onChange={(e) => setCityHallLogin(e.target.value)}
                      />
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-city-link">20. Link Prefeitura</label>
                      <input
                        id="modal-city-link"
                        type="text"
                        placeholder="https://..."
                        value={cityHallLink}
                        onChange={(e) => setCityHallLink(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid-2">
                    <div className="input-field">
                      <label htmlFor="modal-ginfess">
                        18. Senha Ginfess <span className="hint">(🔒 Criptografada)</span>
                      </label>
                      <div className="pwd-input-wrap">
                        <input
                          id="modal-ginfess"
                          type={showGinfessPwd ? 'text' : 'password'}
                          placeholder="Senha Ginfess"
                          value={ginfessPassword}
                          onChange={(e) => setGinfessPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-eye"
                          onClick={() => setShowGinfessPwd(!showGinfessPwd)}
                          title={showGinfessPwd ? 'Ocultar' : 'Revelar'}
                        >
                          {showGinfessPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-giss">
                        19. Senha Giss Online <span className="hint">(🔒 Criptografada)</span>
                      </label>
                      <div className="pwd-input-wrap">
                        <input
                          id="modal-giss"
                          type={showGissPwd ? 'text' : 'password'}
                          placeholder="Senha Giss Online"
                          value={gissOnlinePassword}
                          onChange={(e) => setGissOnlinePassword(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-eye"
                          onClick={() => setShowGissPwd(!showGissPwd)}
                          title={showGissPwd ? 'Ocultar' : 'Revelar'}
                        >
                          {showGissPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid-3" style={{ marginTop: '12px' }}>
                    <div className="input-field">
                      <label htmlFor="modal-nf-access">20. Tipo Acesso NF Contribuinte</label>
                      <select
                        id="modal-nf-access"
                        value={nfAccessType}
                        onChange={(e) => setNfAccessType(e.target.value)}
                      >
                        <option value="">Selecione o tipo...</option>
                        {mergeOptionsWithCurrent(catalog.nfAccessTypes, nfAccessType).map((nat) => (
                          <option key={nat} value={nat}>
                            {nat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-nf-login">21. Login NF Contribuinte</label>
                      <input
                        id="modal-nf-login"
                        type="text"
                        placeholder="Login / Usuário NF"
                        value={nfLogin}
                        onChange={(e) => setNfLogin(e.target.value)}
                      />
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-nf-senha">
                        22. Senha NF Contribuinte <span className="hint">(🔒 Criptografada)</span>
                      </label>
                      <div className="pwd-input-wrap">
                        <input
                          id="modal-nf-senha"
                          type={showNfPwd ? 'text' : 'password'}
                          placeholder="Senha NF"
                          value={nfPassword}
                          onChange={(e) => setNfPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-eye"
                          onClick={() => setShowNfPwd(!showNfPwd)}
                          title={showNfPwd ? 'Ocultar' : 'Revelar'}
                        >
                          {showNfPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 6: OPERAÇÕES, DISSÍDIO & OBSERVAÇÕES */}
                <div className="form-section">
                  <div className="form-section-title">
                    <FileText size={15} />
                    <span>6. Operações, Dissídio & Observações</span>
                  </div>

                  <div className="grid-2">
                    <div className="input-field">
                      <label htmlFor="modal-sd-login">
                        23. SD Login (Empregador Web) {!canManageSd && <span className="hint">(🔒 Somente Sócio/Admin/Cadastro)</span>}
                      </label>
                      <input
                        id="modal-sd-login"
                        type="text"
                        placeholder="Login SD"
                        value={sdLogin}
                        disabled={!canManageSd}
                        onChange={(e) => setSdLogin(e.target.value)}
                      />
                    </div>

                    <div className="input-field">
                      <label htmlFor="modal-sd-senha">
                        24. SD Senha {!canManageSd && <span className="hint">(🔒 Somente Sócio/Admin/Cadastro)</span>}
                      </label>
                      <div className="pwd-input-wrap">
                        <input
                          id="modal-sd-senha"
                          type={showSdPwd ? 'text' : 'password'}
                          placeholder="Senha SD"
                          value={sdPassword}
                          disabled={!canManageSd}
                          onChange={(e) => setSdPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-eye"
                          onClick={() => setShowSdPwd(!showSdPwd)}
                          title={showSdPwd ? 'Ocultar' : 'Revelar'}
                        >
                          {showSdPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid-3" style={{ marginTop: '12px' }}>
                    <div className="input-field">
                      <label htmlFor="modal-dissidio">25. Dissídio (Mês/Ano)</label>
                      <input
                        id="modal-dissidio"
                        type="text"
                        placeholder="MM/AAAA"
                        value={dissidioMonthYear}
                        onChange={(e) => setDissidioMonthYear(formatMonthYearMask(e.target.value))}
                      />
                    </div>

                    <div className="input-field" style={{ gridColumn: 'span 2' }}>
                      <label htmlFor="modal-scope">26. Escopo da Observação</label>
                      <select
                        id="modal-scope"
                        value={notesScope}
                        onChange={(e) => setNotesScope(e.target.value)}
                      >
                        <option value="GERAL">Geral (Todos os setores)</option>
                        <option value="FISCAL">Setor Fiscal</option>
                        <option value="DP">Setor DP</option>
                        <option value="CONTABIL">Setor Contábil</option>
                        <option value="CUSHMAN">Setor Cushman</option>
                      </select>
                    </div>
                  </div>

                  <div className="input-field" style={{ marginTop: '12px' }}>
                    <label htmlFor="modal-notes">Observações</label>
                    <textarea
                      id="modal-notes"
                      rows={3}
                      placeholder="Observações importantes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <div className="input-field" style={{ marginTop: '16px', padding: '12px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: '#fde68a' }}>
                      <input
                        type="checkbox"
                        checked={isSuspended}
                        onChange={(e) => setIsSuspended(e.target.checked)}
                        style={{ accentColor: '#f59e0b', width: 16, height: 16 }}
                      />
                      <span>Prestação de serviços suspensa (bloqueia preenchimento nos fechamentos)</span>
                    </label>
                    {isSuspended && (
                      <div style={{ marginTop: '10px' }}>
                        <label htmlFor="modal-suspended-reason" style={{ fontSize: '12px', color: '#cbd5e1' }}>Motivo da suspensão</label>
                        <input
                          id="modal-suspended-reason"
                          type="text"
                          className="modal-input"
                          style={{ width: '100%', marginTop: '4px' }}
                          placeholder="Ex: Inadimplência, Solicitação do cliente, Bloqueio cadastral..."
                          value={suspendedReason}
                          onChange={(e) => setSuspendedReason(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsModalOpen(false)}
                    disabled={submitting}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {submitting ? <ButtonSpinner /> : <Check size={16} />}
                    <span>{submitting ? 'Salvando...' : (editingCompany ? 'Atualizar Empresa' : 'Cadastrar Empresa')}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Registro de Saída / Inativação da Empresa */}
        {isExitModalOpen && exitModalCompany && (
          <div className="modal-overlay" onClick={() => setIsExitModalOpen(false)}>
            <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-header-left">
                  <div className="modal-header-icon" style={{ background: exitModalCompany.exitDate ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: exitModalCompany.exitDate ? '#fbbf24' : '#f87171' }}>
                    <CalendarX size={20} />
                  </div>
                  <div>
                    <h2>Registrar Saída da Empresa</h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{exitModalCompany.name} ({formatCnpjMask(exitModalCompany.cnpj)})</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExitModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveExitDate} className="modal-body" style={{ gap: '16px' }}>
                {exitModalError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontSize: '13px' }}>
                    <AlertCircle size={16} />
                    <span>{exitModalError}</span>
                  </div>
                )}

                <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
                  ℹ️ <strong>Atenção:</strong> As empresas não são excluídas do banco de dados para preservar todo o histórico fiscal, contábil e de DP. Ao registrar uma <strong>Data de Saída</strong>, a presença na contagem e nos fechamentos do mês de saída dependerá da resposta sobre as obrigações nesse mês.
                </div>

                <div className="input-field">
                  <label htmlFor="exit-modal-date">
                    Data de Saída da Empresa <span className="req">*</span>
                  </label>
                  <input
                    id="exit-modal-date"
                    type="text"
                    placeholder="DD/MM/AAAA"
                    value={exitModalDate}
                    onChange={(e) => {setExitModalDate(formatBrDateMask(e.target.value));setExitModalDecision('');}}
                    required
                  />
                </div>

                {exitModalDate.trim()&&<ExitMonthQuestion value={exitModalDecision} onChange={setExitModalDecision} disabled={exitSubmitting}/>}
                <div className="modal-footer" style={{ padding: '16px 0 0', justifyContent: 'space-between' }}>
                  {exitModalCompany.exitDate ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleReactivateCompany}
                      disabled={exitSubmitting}
                      style={{ color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                    >
                      <RotateCcw size={14} />
                      <span>Reativar Empresa</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setIsExitModalOpen(false)}
                      disabled={exitSubmitting}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={exitSubmitting}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', background: '#e11d48', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {exitSubmitting ? <ButtonSpinner /> : <CalendarX size={16} />}
                      <span>{exitSubmitting ? 'Salvando...' : 'Salvar Saída'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Assistente de Transição de Regime Tributário */}
        {isTaxTransitionModalOpen && editingCompany && (
          <div className="modal-overlay" onClick={() => setIsTaxTransitionModalOpen(false)}>
            <div className="modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-header-left">
                  <div className="modal-header-icon" style={{ background: 'rgba(217, 15, 129, 0.15)', color: '#f472b6' }}>
                    <Briefcase size={20} />
                  </div>
                  <div>
                    <h2>Alteração de Regime Tributário</h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{editingCompany.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTaxTransitionModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body" style={{ gap: '16px' }}>
                <div className="tax-transition-comparison">
                  <div className="tax-transition-item">
                    <span className="label">Regime Anterior</span>
                    <span className={`badge-regime ${getRegimeClass(editingCompany.taxRegime)}`}>
                      {getRegimeLabel(editingCompany.taxRegime)}
                    </span>
                  </div>
                  <div className="tax-transition-arrow">
                    <ArrowRight size={18} />
                  </div>
                  <div className="tax-transition-item">
                    <span className="label">Novo Regime</span>
                    <span className={`badge-regime ${getRegimeClass(taxRegime)}`}>
                      {getRegimeLabel(taxRegime)}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                  Como você deseja aplicar a mudança de tributação no fechamento e obrigações?
                </div>

                <div className="tax-strategies-list">
                  {/* Opção 1 */}
                  <div
                    className={`tax-strategy-option ${selectedTaxStrategy === 'NEXT_MONTH' ? 'active' : ''}`}
                    onClick={() => setSelectedTaxStrategy('NEXT_MONTH')}
                  >
                    <div className="tax-strategy-radio" />
                    <div className="tax-strategy-content">
                      <div className="tax-strategy-title">
                        <span>1. A partir do Próximo Mês</span>
                        <span className="badge-recommended">Recomendado</span>
                      </div>
                      <div className="tax-strategy-desc">
                        O fechamento da competência atual continua no regime anterior. A nova tributação será aplicada automaticamente a partir do próximo mês.
                      </div>
                    </div>
                  </div>

                  {/* Opção 2 */}
                  <div
                    className={`tax-strategy-option ${selectedTaxStrategy === 'CURRENT_MONTH' ? 'active' : ''}`}
                    onClick={() => setSelectedTaxStrategy('CURRENT_MONTH')}
                  >
                    <div className="tax-strategy-radio" />
                    <div className="tax-strategy-content">
                      <div className="tax-strategy-title">
                        <span>2. Imediatamente no Mês Atual</span>
                      </div>
                      <div className="tax-strategy-desc">
                        Atualiza o cadastro e a tributação do fechamento da competência atual (preservando todas as tarefas já preenchidas).
                      </div>
                    </div>
                  </div>

                  {/* Opção 3 */}
                  <div
                    className={`tax-strategy-option ${selectedTaxStrategy === 'SPLIT' ? 'active' : ''}`}
                    onClick={() => setSelectedTaxStrategy('SPLIT')}
                  >
                    <div className="tax-strategy-radio" />
                    <div className="tax-strategy-content">
                      <div className="tax-strategy-title">
                        <span>3. Transição Proporcional / Desenquadramento</span>
                      </div>
                      <div className="tax-strategy-desc">
                        Registra o desenquadramento proporcional no histórico e notas da empresa para acompanhamento da equipe contábil e fiscal.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer" style={{ padding: '14px 0 0', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsTaxTransitionModalOpen(false)}
                    disabled={submitting}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => executeSaveCompany(selectedTaxStrategy)}
                    disabled={submitting}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {submitting ? <ButtonSpinner /> : <Check size={16} />}
                    <span>{submitting ? 'Aplicando...' : 'Confirmar Transição e Salvar'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Barra Flutuante de Ações em Massa */}
        {selectedCompanyIds.length > 0 && (
          <div className="companies-bulk-bar">
            <div className="bulk-bar-info">
              <CheckSquare size={18} />
              <span>
                <strong>{selectedCompanyIds.length}</strong> empresa(s) selecionada(s)
              </span>
            </div>
            <div className="bulk-bar-actions">
              {isPrivileged && (
                <button
                  type="button"
                  className="bulk-btn-assign"
                  onClick={() => setIsBulkAssignOpen(true)}
                >
                  <Users size={16} />
                  <span>Atribuir Responsável em Massa</span>
                </button>
              )}
              <button
                type="button"
                className="bulk-btn-clear"
                onClick={() => setSelectedCompanyIds([])}
              >
                Desmarcar Todas
              </button>
            </div>
          </div>
        )}

        {/* Modal de Atribuição em Massa */}
        <BulkAssignResponsibleModal
          isOpen={isBulkAssignOpen}
          onClose={() => setIsBulkAssignOpen(false)}
          selectedCompanyIds={selectedCompanyIds}
          companies={companies}
          users={users}
          currentUser={currentUser}
          onSuccess={(count, sectorLabel, respName) => {
            setSelectedCompanyIds([]);
            fetchCompanies();
            showToast(`Responsável do setor ${sectorLabel} atualizado para ${respName} em ${count} empresa(s)!`, 'success');
          }}
        />

        {/* Modal: Configuração de Exportação para Excel com Ordenação */}
        {isExportModalOpen && (
          <div className="modal-overlay" onClick={() => !exporting && setIsExportModalOpen(false)}>
            <div className="modal-card export-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-header-left">
                  <div className="modal-header-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399' }}>
                    <FileSpreadsheet size={20} />
                  </div>
                  <div>
                    <h2>Exportar Empresas para Excel</h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Escolha a ordenação dos registros e os dados a incluir no relatório
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  disabled={exporting}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  title="Fechar"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body export-modal-body">
                {/* 1. SELEÇÃO DE ORDENAÇÃO */}
                <div className="export-section">
                  <div className="export-section-header">
                    <ArrowUpDown size={16} color="#34d399" />
                    <strong>Qual ordenação deseja aplicar na planilha?</strong>
                  </div>
                  <div className="export-sort-grid">
                    {[
                      { key: 'CODE', title: 'Código da Empresa', desc: 'Ordenação numérica natural (00001, 00002... e sem código ao final)', badge: 'Padrão' },
                      { key: 'NAME', title: 'Ordem Alfabética (A-Z)', desc: 'Ordenação pela Razão Social em ordem alfabética', badge: 'Alfabética' },
                      { key: 'TAX_REGIME', title: 'Regime Tributário', desc: 'Agrupado por Simples Nacional, Lucro Presumido, Real, MEI...', badge: 'Tributação' },
                      { key: 'CITY', title: 'Município / Praça', desc: 'Agrupado alfabeticamente pela cidade onde a empresa está sediada', badge: 'Localização' },
                      { key: 'GROUP', title: 'Grupo Empresarial', desc: 'Agrupado pelo nome do grupo econômico cadastrado', badge: 'Grupo' },
                      { key: 'SITUATION', title: 'Situação Cadastral', desc: 'Empresas ativas primeiro, seguidas de inativas e externas', badge: 'Status' },
                      { key: 'CONTRACT_DATE', title: 'Data de Contrato', desc: 'Ordenado pela data de contrato / início de obrigação', badge: 'Cronológica' },
                    ].map((opt) => (
                      <div
                        key={opt.key}
                        className={`export-sort-card ${exportSortBy === opt.key ? 'active' : ''}`}
                        onClick={() => setExportSortBy(opt.key as any)}
                      >
                        <div className="export-radio-circle" />
                        <div className="export-card-content">
                          <div className="export-card-title-row">
                            <span className="export-card-title">{opt.title}</span>
                            <span className={`export-card-badge ${exportSortBy === opt.key ? 'active' : ''}`}>{opt.badge}</span>
                          </div>
                          <span className="export-card-desc">{opt.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. DIREÇÃO DA ORDENAÇÃO */}
                <div className="export-section">
                  <div className="export-section-header">
                    <SlidersHorizontal size={16} color="#38bdf8" />
                    <strong>Sentido da Ordenação:</strong>
                  </div>
                  <div className="export-direction-row">
                    <button
                      type="button"
                      className={`export-dir-btn ${exportSortDirection === 'ASC' ? 'active' : ''}`}
                      onClick={() => setExportSortDirection('ASC')}
                    >
                      <span className="dir-indicator">↑</span>
                      <span>Crescente (A → Z / 0 → 9 / Mais antigas)</span>
                    </button>
                    <button
                      type="button"
                      className={`export-dir-btn ${exportSortDirection === 'DESC' ? 'active' : ''}`}
                      onClick={() => setExportSortDirection('DESC')}
                    >
                      <span className="dir-indicator">↓</span>
                      <span>Decrescente (Z → A / 9 → 0 / Mais recentes)</span>
                    </button>
                  </div>
                </div>

                {/* 3. ESCOPO DOS DADOS */}
                <div className="export-section">
                  <div className="export-section-header">
                    <Layers size={16} color="#a855f7" />
                    <strong>Empresas a incluir na exportação:</strong>
                  </div>
                  <div className="export-scope-row">
                    <div
                      className={`export-scope-card ${exportScope === 'FILTERED' ? 'active' : ''}`}
                      onClick={() => setExportScope('FILTERED')}
                    >
                      <div className="export-radio-circle" />
                      <div className="export-card-content">
                        <div className="export-card-title-row">
                          <span className="export-card-title">Visualização Atual (Filtradas)</span>
                          <span className="export-scope-count">{filteredCompanies.length} empresas</span>
                        </div>
                        <span className="export-card-desc">
                          Exporta apenas as empresas que atendem aos filtros ativos na tela (pesquisa, situação, tributação).
                        </span>
                      </div>
                    </div>

                    <div
                      className={`export-scope-card ${exportScope === 'ALL' ? 'active' : ''}`}
                      onClick={() => setExportScope('ALL')}
                    >
                      <div className="export-radio-circle" />
                      <div className="export-card-content">
                        <div className="export-card-title-row">
                          <span className="export-card-title">Todas as Empresas</span>
                          <span className="export-scope-count all">{companies.length} empresas</span>
                        </div>
                        <span className="export-card-desc">
                          Exporta todo o catálogo cadastrado no sistema (ativas, inativas e parcelamento externo).
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. OPÇÕES ADICIONAIS */}
                <div className="export-section">
                  <label className="export-checkbox-label">
                    <input
                      type="checkbox"
                      checked={exportIncludeCredentials}
                      onChange={(e) => setExportIncludeCredentials(e.target.checked)}
                    />
                    <div>
                      <strong>Incluir acessos municipais e da Nota Fiscal</strong>
                      <span>Adiciona colunas com links de portais e usuários da prefeitura / emissor NF (senhas permanecem protegidas por segurança).</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="modal-footer" style={{ padding: '16px 24px', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Total a exportar: <strong style={{ color: '#fff' }}>{exportScope === 'FILTERED' ? filteredCompanies.length : companies.length} empresas</strong> · Ordenadas por <strong style={{ color: '#34d399' }}>{getSortLabel(exportSortBy)} ({exportSortDirection === 'ASC' ? 'Crescente' : 'Decrescente'})</strong>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsExportModalOpen(false)}
                    disabled={exporting}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleExecuteExportExcel}
                    disabled={exporting || (exportScope === 'FILTERED' ? filteredCompanies.length === 0 : companies.length === 0)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 22px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    {exporting ? <ButtonSpinner /> : <Download size={17} />}
                    <span>{exporting ? 'Gerando planilha...' : 'Baixar Planilha Excel'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toastMsg && (
          <div className={`comp-toast-alert comp-toast-${toastMsg.type}`}>
            {toastMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{toastMsg.text}</span>
          </div>
        )}
      </main>
    </div>
  );
}
