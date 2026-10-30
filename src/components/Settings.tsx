import {isExternalInstallmentCompany} from '../config/installmentCompanies';
import React, { useState, useEffect } from 'react';
import { API } from '../api';
import {
  Settings as SettingsIcon,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  ShieldCheck,
  Columns3,
  Users,
  Lock,
  Eye,
  Type,
  CheckSquare,
  MessageSquare,
  Repeat,
  X,
  Building2,
  Search,
  AlertCircle,
  Check,
  LayoutDashboard,
  FileCheck,
  TrendingUp,
  KeyRound,
  UserX,
  GripVertical,
  ChevronUp,
  ChevronDown,
  BarChart3,
  Activity,
  AlertTriangle,
  Scale,
  ListChecks,
  CalendarClock,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ChangePasswordModal } from './ChangePasswordModal';
import { UserOffboardModal } from './UserOffboardModal';
import { SettingsSkeleton, ButtonSpinner } from './LoadingSkeleton';
import { InstallmentSettingsPanel } from './InstallmentSettings';
import { FiscalRegimeRulesPanel, SystemCatalogsPanel } from './SystemConfigPanels';
import type { CurrentUser } from '../types/auth';
import './Dashboard.css';
import './Settings.css';
import { effectiveFieldConfig, resolveColumnKey, validateFieldConfig, type FieldConfig } from '../config/payrollColumns';
import { ColumnVisibilityEditor } from './ColumnVisibilityEditor';
import { defaultVisibility, effectiveVisibility, validateVisibility, visibilitySummary, type ColumnVisibility } from '../config/columnVisibility';
import './SettingsSelectors.css';
import { PopupConfigEditor } from './PopupConfigEditor';
import { resolveFiscalKey, effectivePopup, defaultPopup, validatePopup, type PopupConfig } from '../config/fiscalPopups';
import { installmentHeaders } from '../config/installments';

interface SettingsProps {
  currentView: string;
  onNavigate: (view: string) => void;
  currentUser?: CurrentUser | null;
  onLogout?: () => void;
}

const SECTORS: { key: 'CONTABIL' | 'FISCAL' | 'PARCELAMENTO' | 'DP' | 'CUSHMAN'; label: string; color: string }[] = [
  { key: 'CONTABIL', label: 'Contábil', color: '#8b5cf6' },
  { key: 'FISCAL', label: 'Fiscal', color: '#10b981' },
  { key: 'PARCELAMENTO', label: 'Parcelamento', color: '#f59e0b' },
  { key: 'DP', label: 'DP', color: '#3b82f6' },
  { key: 'CUSHMAN', label: 'Cushman', color: '#ef4444' },
];

const INPUT_TYPES: Record<string, { label: string; Icon: any }> = {
  TEXT: { label: 'Texto / Número', Icon: Type },
  CHECKBOX: { label: 'Checkbox (Sim/Não)', Icon: CheckSquare },
  POPUP: { label: 'Popup Informativo', Icon: MessageSquare },
  SELECT: { label: 'Lista de opções', Icon: Columns3 },
  MULTISELECT: { label: 'Múltipla Seleção', Icon: CheckSquare },
  NUMBER: { label: 'Número inteiro', Icon: Type },
  TEXTAREA: { label: 'Observação / texto longo', Icon: MessageSquare },
  PASSWORD: { label: 'Senha', Icon: Lock },
  READONLY: { label: 'Fiscal · somente leitura', Icon: Eye },
};

const ROLES = [
  { value: 'ADMIN', label: 'Administrador (Acesso Total)' },
  { value: 'SOCIO', label: 'Sócio' },
  { value: 'FISCAL', label: 'Setor Fiscal' },
  { value: 'DP', label: 'Setor DP' },
  { value: 'CONTABIL', label: 'Setor Contábil' },
  { value: 'FINANCEIRO', label: 'Setor Financeiro' },
  { value: 'CADASTRO', label: 'Cadastro / Operacional' },
];

const SCREENS = [
  { id: 'dashboard', label: 'Visão Geral (Dashboard)', icon: LayoutDashboard },
  { id: 'analytics', label: 'Gráficos e Indicadores', icon: BarChart3 },
  { id: 'closings', label: 'Fechamentos Mensais', icon: FileCheck },
  { id: 'companies', label: 'Empresas', icon: Building2 },
  { id: 'certificates', label: 'Certificados e Procurações', icon: ShieldCheck },
  { id: 'installments-create', label: 'Criar parcelamentos no Fiscal (exige Parcelamento: Editar)', icon: FileCheck },
  { id: 'settings-data-quality', label: 'Avisos de Cadastro', icon: AlertTriangle },
  { id: 'logs', label: 'Logs de Auditoria do Sistema', icon: Activity },
  { id: 'settings-permissions', label: 'Configurações: Permissões de Usuários', icon: ShieldCheck },
  { id: 'settings-columns', label: 'Configurações: Colunas, Regras Fiscais e Listas de Cadastro', icon: Columns3 },
];

const SCREEN_FALLBACK: Record<string, string> = {
  analytics: 'dashboard',
  certificates: 'companies',
  'settings-data-quality': 'companies',
};

const SETTINGS_SECTIONS = [
  { id: 'settings-permissions', label: 'Permissões', icon: ShieldCheck },
  { id: 'settings-columns', label: 'Colunas & Setores', icon: Columns3 },
  { id: 'settings-fiscal-rules', label: 'Regras Fiscais', icon: Scale },
  { id: 'settings-catalogs', label: 'Listas de Cadastro', icon: ListChecks },
];

export function Settings({ currentView, onNavigate, currentUser, onLogout }: SettingsProps) {
  const [columns, setColumns] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isSavingColumn, setIsSavingColumn] = useState(false);
  const [activeSector, setActiveSector] = useState<string>(SECTORS[0].key);

  // Modais
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<any | null>(null);
  const [pwdTargetUser, setPwdTargetUser] = useState<any | null>(null);
  const [isPwdModalOpen, setIsPwdModalOpen] = useState(false);
  const [offboardingUser, setOffboardingUser] = useState<any | null>(null);
  const [isOffboardModalOpen, setIsOffboardModalOpen] = useState(false);

  // Feedback Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Estados do Formulário de Usuário
  const [modalTab, setModalTab] = useState<'info' | 'sectors' | 'companies' | 'screens'>('info');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('CADASTRO');
  const [userActive, setUserActive] = useState(true);
  const [userCompanyScope, setUserCompanyScope] = useState<'ALL' | 'RESPONSIBLE' | 'CUSTOM'>('ALL');
  const [userEditOnlyResponsible, setUserEditOnlyResponsible] = useState(false);
  const [userSelectedCompanies, setUserSelectedCompanies] = useState<string[]>([]);
  const [userSectorAccess, setUserSectorAccess] = useState<Record<string, 'NONE' | 'VIEW' | 'EDIT'>>({});
  const [userScreenAccess, setUserScreenAccess] = useState<Record<string, boolean>>({});
  const [companySearch, setCompanySearch] = useState('');

  // Estados do Formulário de Coluna
  const [colActive, setColActive] = useState(true);
  const [colFieldConfig, setColFieldConfig] = useState<FieldConfig & { pendingOptions?: string[] }>({ version: 1, placeholder: '', options: [] });
  const [colVisibility, setColVisibility] = useState<ColumnVisibility>(defaultVisibility());
  const [colPopupConfig, setColPopupConfig] = useState<PopupConfig>(defaultPopup(''));
  const [colName, setColName] = useState('');
  const [colDepartment, setColDepartment] = useState('FISCAL');
  const [colInputType, setColInputType] = useState('TEXT');
  const [colReplicates, setColReplicates] = useState(false);
  const [colCountsProgress, setColCountsProgress] = useState(false);
  const [colIsEditable, setColIsEditable] = useState(true);
  const [colOrderIndex, setColOrderIndex] = useState<number | ''>('');
  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const isPermissions = currentView === 'settings-permissions';
  const isFiscalRules = currentView === 'settings-fiscal-rules';
  const isCatalogs = currentView === 'settings-catalogs';
  const isActorSocio = currentUser?.role === 'SOCIO';

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    try {
      const [colsRes, usersRes, compsRes] = await Promise.all([
        fetch(`${API}/api/columns`).then((r) => r.json()),
        fetch(`${API}/api/users`).then((r) => r.json()),
        fetch(`${API}/api/companies`).then((r) => r.json()),
      ]);
      if (Array.isArray(colsRes)) setColumns(colsRes);
      if (Array.isArray(usersRes)) setUsers(usersRes);
      if (Array.isArray(compsRes)) setCompanies(compsRes);
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar dados do servidor', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fecha modais com a tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isUserModalOpen) setIsUserModalOpen(false);
        if (isColumnModalOpen) setIsColumnModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isUserModalOpen, isColumnModalOpen]);

  // Abrir Modal de Usuário para Criação
  const handleOpenCreateUser = () => {
    setEditingUser(null);
    setUserName('');
    setUserEmail('');
    setUserPassword('');
    setUserRole(isActorSocio ? 'FISCAL' : 'CADASTRO');
    setUserActive(true);
    setUserCompanyScope('ALL');
    setUserEditOnlyResponsible(false);
    setUserSelectedCompanies([]);

    // Default sector access
    const defaultSectors: Record<string, 'NONE' | 'VIEW' | 'EDIT'> = {};
    SECTORS.forEach((s) => (defaultSectors[s.key] = 'NONE'));
    setUserSectorAccess(defaultSectors);

    // Default screens access
    const defaultScreens: Record<string, boolean> = {
      dashboard: true,
      analytics: true,
      closings: true,
      companies: false,
      certificates: false,
      'installments-create': false,
      'settings-data-quality': false,
      logs: false,
      'settings-permissions': false,
      'settings-columns': false,
    };
    setUserScreenAccess(defaultScreens);

    setModalTab('info');
    setIsUserModalOpen(true);
  };

  // Abrir Modal de Usuário para Edição
  const handleOpenEditUser = (user: any) => {
    if (isActorSocio && user.role === 'ADMIN') {
      showToast('Sócios não possuem permissão para editar Administradores.', 'error');
      return;
    }

    setEditingUser(user);
    setUserName(user.name || '');
    setUserEmail(user.email || '');
    setUserPassword('');
    setUserRole(user.role);
    setUserActive(user.active ?? true);
    setUserCompanyScope(user.companyScope || (user.canViewAllCompanies === false ? 'CUSTOM' : 'ALL'));
    setUserEditOnlyResponsible(Boolean(user.editOnlyResponsible));

    const compIds = Array.isArray(user.companyAccess)
      ? user.companyAccess.map((ca: any) => ca.companyId || ca.company?.id)
      : [];
    setUserSelectedCompanies(compIds.filter(Boolean));

    const sectorsMap: Record<string, 'NONE' | 'VIEW' | 'EDIT'> = {};
    SECTORS.forEach((s) => {
      const found = user.sectorPermissions?.find((p: any) => p.sector === s.key);
      sectorsMap[s.key] = found?.access || (user.role === 'ADMIN' || user.role === 'SOCIO' ? 'EDIT' : 'NONE');
    });
    setUserSectorAccess(sectorsMap);

    const screensMap: Record<string, boolean> = {};
    const isSuperUser = user.role === 'ADMIN' || user.role === 'SOCIO';
    SCREENS.forEach((sc) => {
      const found = user.screenPermissions?.find((p: any) => p.screen === sc.id);
      if (found) {
        screensMap[sc.id] = Boolean(found.allowed);
        return;
      }
      const fallbackId = SCREEN_FALLBACK[sc.id];
      const fallback = fallbackId ? user.screenPermissions?.find((p: any) => p.screen === fallbackId) : null;
      screensMap[sc.id] = fallback ? Boolean(fallback.allowed) : isSuperUser;
    });
    setUserScreenAccess(screensMap);

    setModalTab('info');
    setIsUserModalOpen(true);
  };

  // Salvar Usuário (Criar ou Atualizar)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail) {
      showToast('E-mail é obrigatório', 'error');
      return;
    }

    if (isActorSocio && userRole === 'ADMIN') {
      showToast('Sócios não podem atribuir o cargo de Administrador.', 'error');
      return;
    }

    const sectorPermissionsArray = Object.entries(userSectorAccess).map(([sector, access]) => ({
      sector,
      access,
    }));

    const screenPermissionsArray = Object.entries(userScreenAccess).map(([screen, allowed]) => ({
      screen,
      allowed,
    }));

    const payload = {
      name: userName,
      email: userEmail,
      password: userPassword || undefined,
      role: userRole,
      active: userActive,
      companyScope: userCompanyScope,
      canViewAllCompanies: userCompanyScope === 'ALL',
      editOnlyResponsible: userCompanyScope === 'RESPONSIBLE' ? true : userEditOnlyResponsible,
      companyAccessIds: userCompanyScope === 'CUSTOM' ? userSelectedCompanies : [],
      sectorPermissions: sectorPermissionsArray,
      screenPermissions: screenPermissionsArray,
      actorRole: currentUser?.role || 'ADMIN',
    };

    setIsSavingUser(true);
    try {
      const url = editingUser
        ? `${API}/api/users/${editingUser.id}`
        : `${API}/api/users`;
      const method = editingUser ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: installmentHeaders(currentUser),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Erro ao salvar usuário', 'error');
        return;
      }

      // Se o admin editou a si mesmo, aplica imediatamente na sessão local
      if (editingUser && currentUser && editingUser.id === currentUser.id) {
        try {
          const saved = JSON.parse(localStorage.getItem('fechamento_user') || '{}');
          localStorage.setItem(
            'fechamento_user',
            JSON.stringify({
              ...saved,
              companyScope: payload.companyScope,
              canViewAllCompanies: payload.canViewAllCompanies,
              editOnlyResponsible: payload.editOnlyResponsible,
            })
          );
        } catch {
          // ignora
        }
      }

      showToast(editingUser ? 'Usuário e permissões atualizados com sucesso!' : 'Novo usuário criado com sucesso!');
      setIsUserModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Erro de conexão ao salvar usuário', 'error');
    } finally {
      setIsSavingUser(false);
    }
  };

  // Desligamento de Usuário (Não faz mais parte da empresa)
  const handleOpenOffboard = (user: any) => {
    if (user.id === currentUser?.id) {
      showToast('Você não pode desligar sua própria conta.', 'error');
      return;
    }

    if (isActorSocio && (user.role === 'ADMIN' || user.role === 'SOCIO')) {
      showToast('Sócios não podem desligar Administradores ou outros Sócios.', 'error');
      return;
    }

    setOffboardingUser(user);
    setIsOffboardModalOpen(true);
  };

  const sector = SECTORS.find((s) => s.key === activeSector) || SECTORS[0];
  const sectorColumns = columns
    .filter((c) => c.department === activeSector)
    .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

  const getDisplayColumns = (secCols: any[]) => {
    if (activeSector !== 'CONTABIL') return secCols;
    const months = secCols.filter(c => resolveColumnKey(c)?.startsWith('cont_mes_'));
    if (months.length === 0) return secCols;
    const withoutMonths = secCols.filter(c => !resolveColumnKey(c)?.startsWith('cont_mes_'));
    const firstMonthOrder = months[0].orderIndex || 1;
    const targetIdx = Math.max(0, Math.min(firstMonthOrder - 1, withoutMonths.length));
    const result = [...withoutMonths];
    result.splice(targetIdx, 0, { ...months[0], isMonthsGroup: true, name: 'Meses (Todos os 12)' });
    return result;
  };

  const displayColumns = getDisplayColumns(sectorColumns);

  const handleReorderColumns = async (newOrderedList: any[]) => {
    setIsReordering(true);
    const columnIds: string[] = [];
    for (const item of newOrderedList) {
      if (item.isMonthsGroup || resolveColumnKey(item)?.startsWith('cont_mes_')) {
        const contMonths = columns
          .filter(c => c.department === 'CONTABIL' && resolveColumnKey(c)?.startsWith('cont_mes_'))
          .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        for (const m of contMonths) {
          columnIds.push(m.id);
        }
      } else {
        columnIds.push(item.id);
      }
    }

    const orderMap = new Map<string, number>();
    columnIds.forEach((id, idx) => orderMap.set(id, idx + 1));
    setColumns(prev => prev.map(c => {
      if (orderMap.has(c.id)) {
        return { ...c, orderIndex: orderMap.get(c.id)! };
      }
      return c;
    }));

    try {
      const res = await fetch(`${API}/api/columns/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao salvar nova ordenação');
      }
      showToast('Ordem das colunas atualizada com sucesso!');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao reordenar colunas', 'error');
      loadData();
    } finally {
      setIsReordering(false);
    }
  };

  const handleMoveColumn = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= displayColumns.length) return;
    const reordered = [...displayColumns];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    await handleReorderColumns(reordered);
  };

  const handleDragStart = (e: React.DragEvent, colId: string) => {
    setDraggedColId(colId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colId);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColId !== colId) {
      setDragOverColId(colId);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    if (!draggedColId || draggedColId === targetColId) {
      setDraggedColId(null);
      setDragOverColId(null);
      return;
    }

    const fromIdx = displayColumns.findIndex(c => c.id === draggedColId);
    const toIdx = displayColumns.findIndex(c => c.id === targetColId);

    setDraggedColId(null);
    setDragOverColId(null);

    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

    const reordered = [...displayColumns];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    await handleReorderColumns(reordered);
  };

  const handleDragEnd = () => {
    setDraggedColId(null);
    setDragOverColId(null);
  };

  // Abrir Modal de Coluna
  const handleOpenCreateColumn = (departmentKey: string) => {
    setEditingColumn(null);
    setColActive(true);
    setColFieldConfig({ version: 1, placeholder: '', options: [] });
    setColName('');
    setColDepartment(departmentKey);
    setColInputType('TEXT');
    setColPopupConfig(defaultPopup(''));
    setColVisibility(defaultVisibility());
    setColReplicates(false);
    setColCountsProgress(false);
    setColIsEditable(true);
    const count = columns.filter(c => c.department === departmentKey).length;
    setColOrderIndex(count + 1);
    setIsColumnModalOpen(true);
  };

  const handleOpenEditColumn = (col: any) => {
    setEditingColumn(col);
    setColActive(col.isActive !== false);
    setColFieldConfig(effectiveFieldConfig(col));
    setColVisibility(effectiveVisibility(col));
    setColPopupConfig(effectivePopup(col, resolveColumnKey(col) || col.id));
    setColName(col.name);
    setColDepartment(col.department);
    setColInputType(col.inputType);
    setColReplicates(col.replicates);
    setColCountsProgress(col.countsProgress ?? false);
    setColIsEditable(col.isEditable);
    const pos = displayColumns.findIndex(c => c.id === col.id);
    setColOrderIndex(pos >= 0 ? pos + 1 : (col.orderIndex || 1));
    setIsColumnModalOpen(true);
  };

  const handleSaveColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!colName.trim()) {
      showToast('Nome da coluna é obrigatório', 'error');
      return;
    }

    const cleanedFieldConfig: FieldConfig = {
      ...colFieldConfig,
      options: (colFieldConfig.options || []).map(o => o.trim()).filter(Boolean),
      ...(colFieldConfig.pendingOptions ? { pendingOptions: colFieldConfig.pendingOptions.map(o => o.trim()).filter(Boolean) } : {}),
    };
    const fieldError = validateFieldConfig(cleanedFieldConfig);
    if (fieldError) { showToast(fieldError, 'error'); return; }
    if ((colInputType === 'SELECT' || (colInputType === 'MULTISELECT' && colDepartment === 'FISCAL' && !editingColumn)) && !cleanedFieldConfig.options.length) { showToast('Informe as opções da lista.', 'error'); return; }
    const visibilityError = validateVisibility(colVisibility);
    if (visibilityError) { showToast(visibilityError, 'error'); return; }
    if (colInputType === 'POPUP') {
      const error = validatePopup(colPopupConfig);
      if (error) { showToast(error, 'error'); return; }
    }
    const payload: any = {
      isActive: colActive,
      fieldConfig: cleanedFieldConfig,
      visibilityConfig: colVisibility,
      popupConfig: colInputType === 'POPUP' ? colPopupConfig : undefined,
      name: colName.trim(),
      department: colDepartment,
      inputType: colInputType,
      replicates: colReplicates,
      countsProgress: colCountsProgress,
      isEditable: colIsEditable,
    };
    if (colOrderIndex !== '') {
      payload.orderIndex = Number(colOrderIndex);
    }

    setIsSavingColumn(true);
    try {
      const url = editingColumn
        ? `${API}/api/columns/${editingColumn.id}`
        : `${API}/api/columns`;
      const method = editingColumn ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Erro ao salvar coluna', 'error');
        return;
      }

      // Se editando e a posição foi alterada, reposiciona na lista
      if (editingColumn && colOrderIndex !== '') {
        const currentPos = displayColumns.findIndex(c => c.id === editingColumn.id) + 1;
        const targetPos = Math.max(1, Math.min(Number(colOrderIndex), displayColumns.length));
        if (currentPos > 0 && currentPos !== targetPos) {
          const reordered = [...displayColumns];
          const [moved] = reordered.splice(currentPos - 1, 1);
          reordered.splice(targetPos - 1, 0, moved);
          await handleReorderColumns(reordered);
        }
      }

      showToast(editingColumn ? 'Coluna atualizada com sucesso!' : 'Nova coluna criada com sucesso!');
      setIsColumnModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar coluna', 'error');
    } finally {
      setIsSavingColumn(false);
    }
  };

  const handleDeleteColumn = async (col: any) => {
    if (!window.confirm(`Deseja remover a coluna "${col.name}" do setor ${col.department}?`)) {
      return;
    }

    try {
      const res = await fetch(`${API}/api/columns/${col.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Erro ao excluir coluna', 'error');
        return;
      }
      showToast('Coluna excluída com sucesso!');
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Erro ao excluir coluna', 'error');
    }
  };

  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(companySearch.toLowerCase()) || c.cnpj.includes(companySearch)
  );

  return (
    <div className="crm-dashboard">
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate as any}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <main className="crm-main">
        {toast && (
          <div className={`toast-notification toast-${toast.type}`}>
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{toast.message}</span>
          </div>
        )}

        <header className="crm-header">
          <div className="page-header">
            <h1>
              {isPermissions ? <ShieldCheck size={24} /> : isFiscalRules ? <Scale size={24} /> : isCatalogs ? <ListChecks size={24} /> : <Columns3 size={24} />}
              {isPermissions
                ? 'Permissões e Acessos da Equipe'
                : isFiscalRules
                ? 'Regras Fiscais por Regime Tributário'
                : isCatalogs
                ? 'Listas e Opções de Cadastro'
                : 'Configuração Dinâmica de Colunas'}
            </h1>
            <p className="page-subtitle">
              {isPermissions
                ? 'Configure quem pode visualizar ou editar cada setor, quais telas estão liberadas e o acesso a empresas.'
                : isFiscalRules
                ? 'Defina quais obrigações fiscais são dispensadas automaticamente (N/A) para cada regime tributário.'
                : isCatalogs
                ? 'Edite e crie as opções usadas nos formulários de empresas e certificados.'
                : 'Crie e configure as colunas de fechamento para cada setor diretamente no banco.'}
            </p>
          </div>
          {currentUser && (
            <div className="crm-user">
              <div className="avatar">{(currentUser.name || currentUser.email)[0].toUpperCase()}</div>
              <div>
                <strong>{currentUser.name || currentUser.email.split('@')[0]}</strong>
                <span className="user-role-tag">{currentUser.role}</span>
              </div>
            </div>
          )}
        </header>

        <div className="dashboard-content settings-content">
          <div className="settings-breadcrumb">
            <SettingsIcon size={14} /> Configurações <span>/</span>
            <strong>{SETTINGS_SECTIONS.find((s) => s.id === currentView)?.label || 'Colunas & Setores'}</strong>
          </div>

          <nav className="settings-section-switcher" aria-label="Seções de configurações">
            {SETTINGS_SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const active = currentView === sec.id || (sec.id === 'settings-columns' && !SETTINGS_SECTIONS.some((s) => s.id === currentView));
              return (
                <button
                  key={sec.id}
                  type="button"
                  className={`settings-section-btn ${active ? 'active' : ''}`}
                  onClick={() => onNavigate(sec.id)}
                >
                  <Icon size={15} />
                  <span>{sec.label}</span>
                </button>
              );
            })}
          </nav>

          {loading ? (
            <SettingsSkeleton />
          ) : isFiscalRules ? (
            <FiscalRegimeRulesPanel currentUser={currentUser} columns={columns} onSaved={loadData} />
          ) : isCatalogs ? (
            <SystemCatalogsPanel currentUser={currentUser} />
          ) : isPermissions ? (
            /* ========================================================
               1. TELA DE PERMISSÕES
            ======================================================== */
            <>
              <div className="settings-stats">
                <div className="stat-card">
                  <Users size={20} />
                  <div>
                    <strong>{users.length}</strong>
                    <span>Usuários Cadastrados</span>
                  </div>
                </div>
                <div className="stat-card accent">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>{users.filter((u) => u.role === 'ADMIN' || u.role === 'SOCIO').length}</strong>
                    <span>Sócios / Administradores</span>
                  </div>
                </div>
                <div className="stat-card">
                  <Lock size={20} />
                  <div>
                    <strong>{users.filter((u) => u.role !== 'ADMIN' && u.role !== 'SOCIO').length}</strong>
                    <span>Usuários com Regras Customizadas</span>
                  </div>
                </div>
              </div>

              <div className="settings-panel">
                <div className="panel-toolbar">
                  <div>
                    <h2>
                      <ShieldCheck size={20} /> Usuários e Regras de Acesso
                    </h2>
                    <p>
                      {isActorSocio
                        ? 'Você está logado como Sócio. Você pode criar e gerenciar usuários, exceto Administradores.'
                        : 'Administradores têm controle total sobre criação e atribuição de permissões.'}
                    </p>
                  </div>
                  <button className="btn-primary" onClick={handleOpenCreateUser}>
                    <Plus size={18} /> Novo Usuário
                  </button>
                </div>

                {activeSector === 'CONTABIL' && <details className="dp-base-column-guide"><summary>Contábil anual e controle dos meses</summary><p>Cadastro e certificado ficam em Ver Dados. Janeiro a dezembro usam as opções do controle mensal. Não é cliente é calculado pelas datas da empresa. Empresas que saíram ficam no ano histórico.</p><p>Na virada anual os campos começam zerados, independentemente da marca Replicar. Os meses só permitem edição quando a competência é liberada. Colunas podem ser organizadas abaixo.</p></details>}
                {activeSector === 'DP' && <details className="dp-base-column-guide"><summary>Dados cadastrais no popup Empresa / Certificado</summary><p>Código, Empresa, Tributação, Status, Responsável e CNPJ ficam na tabela. Grupo, inscrições, logins, senhas, link da prefeitura, tipo, envio, município e certificado ficam juntos no botão Ver Dados da empresa.</p><p>As colunas abaixo são salvas por competência. REINF consulta o Fiscal da mesma empresa e mês, apenas para leitura.</p></details>}
                <div className="columns-table">
                  <div className="columns-table-header">
                    <div className="col-user">Usuário / E-mail</div>
                    <div className="col-role">Cargo</div>
                    <div className="col-sectors">Acesso por Setor</div>
                    <div className="col-companies">Empresas</div>
                    <div className="col-status">Status</div>
                    <div className="col-actions">Ações</div>
                  </div>

                  {users.length === 0 ? (
                    <div className="empty-state">Nenhum usuário cadastrado.</div>
                  ) : (
                    users.map((user) => {
                      const isSuper = user.role === 'ADMIN' || user.role === 'SOCIO';
                      return (
                        <div key={user.id} className={`columns-table-row ${!user.active ? 'row-inactive' : ''}`}>
                          <div className="col-user">
                            <div className="user-avatar">
                              {(user.name || user.email)[0].toUpperCase()}
                            </div>
                            <div className="user-info">
                              <strong>{user.name || user.email.split('@')[0]}</strong>
                              <span>{user.email}</span>
                            </div>
                          </div>

                          <div className="col-role">
                            <span className={`role-badge ${isSuper ? 'role-full' : ''}`}>
                              {user.role}
                            </span>
                          </div>

                          <div className="col-sectors">
                            {isSuper ? (
                              <span className="access-all">
                                <ShieldCheck size={14} /> Acesso Total (Todos os Setores)
                              </span>
                            ) : (
                              <div className="sector-chips">
                                {SECTORS.map((s) => {
                                  const perm = user.sectorPermissions?.find((p: any) => p.sector === s.key);
                                  const access = perm?.access || 'NONE';
                                  if (access === 'NONE') {
                                    return (
                                      <span key={s.key} className="sector-chip off" title={`${s.label}: Sem Acesso`}>
                                        {s.label}
                                      </span>
                                    );
                                  }
                                  return (
                                    <span
                                      key={s.key}
                                      className={`sector-chip on ${access === 'EDIT' ? 'chip-edit' : 'chip-view'}`}
                                      style={{ borderColor: s.color, color: s.color, background: `${s.color}15` }}
                                      title={`${s.label}: ${access === 'EDIT' ? 'Pode Editar' : 'Apenas Ver'}`}
                                    >
                                      {access === 'EDIT' ? <Edit2 size={10} /> : <Eye size={10} />}
                                      {s.label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="col-companies">
                            {user.companyScope === 'RESPONSIBLE' ? (
                              <span className="company-badge-resp" title="Apenas onde é responsável">
                                👤 Responsável ({user.responsibleAssignments?.length || 0})
                              </span>
                            ) : user.companyScope === 'CUSTOM' || user.canViewAllCompanies === false ? (
                              <span className="company-badge-restricted" title={user.editOnlyResponsible ? 'Empresas manuais · edita só onde é responsável' : 'Empresas manuais específicas'}>
                                🏢 {user.companyAccess?.length || 0} manual{user.editOnlyResponsible ? ' (Edita Resp.)' : ''}
                              </span>
                            ) : user.editOnlyResponsible ? (
                              <span className="company-badge-resp" title="Vê todas as empresas, mas só edita onde é responsável">
                                👁️ Todas (Edita Resp.)
                              </span>
                            ) : (
                              <span className="company-badge-all">🌐 Todas</span>
                            )}
                          </div>

                          <div className="col-status">
                            {user.leftAt ? (
                              <span
                                className="status-pill offboarded"
                                title={`Saiu em ${new Date(user.leftAt).toLocaleDateString('pt-BR')}${user.exitReason ? ` - ${user.exitReason}` : ''}`}
                              >
                                Não faz mais parte
                              </span>
                            ) : user.active ? (
                              <span className="status-pill active">Ativo</span>
                            ) : (
                              <span className="status-pill inactive">Inativo</span>
                            )}
                          </div>

                          <div className="col-actions">
                            <button
                              className="icon-btn edit"
                              title="Redefinir Senha do Usuário"
                              onClick={() => {
                                setPwdTargetUser(user);
                                setIsPwdModalOpen(true);
                              }}
                            >
                              <KeyRound size={16} />
                            </button>
                            <button
                              className="icon-btn edit"
                              title="Editar Usuário e Permissões"
                              onClick={() => handleOpenEditUser(user)}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className="icon-btn offboard"
                              title={user.leftAt ? "Gerenciar Saída / Reatribuir Empresas" : "Não faz mais parte da empresa (Desligar & Transferir Empresas)"}
                              disabled={isActorSocio && (user.role === 'ADMIN' || user.role === 'SOCIO')}
                              onClick={() => handleOpenOffboard(user)}
                            >
                              <UserX size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            /* ========================================================
               2. TELA DE COLUNAS DOS SETORES
            ======================================================== */
            <>
              <div className="sector-tabs">
                {SECTORS.map((s) => {
                  let count = columns.filter((c) => c.department === s.key).length;
                  if (s.key === 'CONTABIL') {
                    const months = columns.filter(c => c.department === 'CONTABIL' && resolveColumnKey(c)?.startsWith('cont_mes_'));
                    if (months.length > 0) count = count - months.length + 1;
                  }
                  const active = s.key === activeSector;
                  return (
                    <button
                      key={s.key}
                      className={`sector-tab ${active ? 'active' : ''}`}
                      style={{ ['--sector-color' as any]: s.color }}
                      onClick={() => setActiveSector(s.key)}
                    >
                      <span className="sector-dot" />
                      {s.label}
                      <span className="sector-count">{s.key === 'PARCELAMENTO' ? 'Config' : count}</span>
                    </button>
                  );
                })}
              </div>

              {activeSector === 'PARCELAMENTO' ? (
                <div className="settings-panel" style={{ ['--sector-color' as any]: sector.color }}>
                  <div className="panel-toolbar">
                    <div>
                      <h2>
                        <CalendarClock size={20} /> Parcelamentos: Regras de Vencimento e Tipos
                      </h2>
                      <p>
                        O progresso do Parcelamento no Dashboard é calculado pelas parcelas pagas no mês. Configure aqui os prazos de atraso e os tipos de parcelamento.
                      </p>
                    </div>
                  </div>
                  <div style={{ padding: '20px 24px' }}>
                    <InstallmentSettingsPanel currentUser={currentUser} />
                  </div>
                </div>
              ) : (
              <div className="settings-panel" style={{ ['--sector-color' as any]: sector.color }}>
                <div className="panel-toolbar">
                  <div>
                    <h2>
                      <span className="sector-dot" /> Colunas Dinâmicas: {sector.label}
                    </h2>
                    <p>
                      {sectorColumns.length} coluna(s) configurada(s). Crie campos customizados sem mexer no código.
                    </p>
                  </div>
                  <button className="btn-primary" onClick={() => handleOpenCreateColumn(sector.key)}>
                    <Plus size={18} /> Nova Coluna para {sector.label}
                  </button>
                </div>

                <div className="columns-table">
                  <div className="columns-table-header">
                    <div className="col-drag" title="Ordem das colunas">Ordem</div>
                    <div className="col-name">Nome da Coluna</div>
                    <div className="col-type">Tipo de Campo</div>
                    <div className="col-progress">Contabiliza Progresso?</div>
                    <div className="col-replicate">Replica Mês?</div>
                    <div className="col-edit">Permissão</div>
                    <div className="col-actions">Ações</div>
                  </div>

                  {displayColumns.length === 0 ? (
                    <div className="empty-state">
                      <Columns3 size={32} />
                      <p>Nenhuma coluna configurada para {sector.label} ainda.</p>
                      <button className="btn-primary" onClick={() => handleOpenCreateColumn(sector.key)}>
                        <Plus size={16} /> Criar Primeira Coluna
                      </button>
                    </div>
                  ) : (
                    displayColumns.map((col, index) => {
                      const t = INPUT_TYPES[col.inputType] || { label: col.inputType, Icon: Type };
                      const isDraggable = !col.isMonthsGroup && !isReordering;
                      return (
                        <div
                          key={col.id}
                          className={`columns-table-row ${!col.isActive ? 'row-inactive' : ''} ${draggedColId === col.id ? 'is-dragging' : ''} ${dragOverColId === col.id ? 'drag-over' : ''}`}
                          draggable={isDraggable}
                          onDragStart={(e) => isDraggable && handleDragStart(e, col.id)}
                          onDragOver={(e) => isDraggable && handleDragOver(e, col.id)}
                          onDrop={(e) => isDraggable && handleDrop(e, col.id)}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="col-drag">
                            <div
                              className="col-drag-grip"
                              title={col.isMonthsGroup ? 'Grupo de meses' : 'Arraste para alterar a ordem da coluna'}
                            >
                              <GripVertical size={16} />
                            </div>
                            <span className="order-number" title={`Ordem: ${index + 1}`}>{index + 1}</span>
                            <div className="order-nav-btns">
                              <button
                                type="button"
                                className="order-btn"
                                title="Mover para cima"
                                disabled={index === 0 || isReordering}
                                onClick={(e) => { e.stopPropagation(); handleMoveColumn(index, -1); }}
                              >
                                <ChevronUp size={13} />
                              </button>
                              <button
                                type="button"
                                className="order-btn"
                                title="Mover para baixo"
                                disabled={index === displayColumns.length - 1 || isReordering}
                                onClick={(e) => { e.stopPropagation(); handleMoveColumn(index, 1); }}
                              >
                                <ChevronDown size={13} />
                              </button>
                            </div>
                          </div>
                          <div className="col-name">
                            <strong>{col.name}</strong>{col.isActive === false && <small className="popup-column-summary">Inativa · dados preservados</small>}
                            <small className="popup-column-summary">{visibilitySummary(col)}</small>
                            {col.inputType === 'POPUP' && <small className="popup-column-summary">{effectivePopup(col, resolveColumnKey(col) || col.id).fields.length} campos · {effectivePopup(col, resolveColumnKey(col) || col.id).actions.filter(a => a.enabled).length} botões · {col.popupConfig ? 'Personalizado' : 'Modelo original'}</small>}
                          </div>
                          <div className="col-type">
                            <span className="type-badge">
                              <t.Icon size={13} /> {t.label}
                            </span>
                          </div>
                          <div className="col-progress">
                            {col.countsProgress ? (
                              <span className="status-progress-yes" title="A conclusão deste campo conta para a porcentagem de fechamento do setor">
                                <TrendingUp size={14} /> Sim (Soma no %)
                              </span>
                            ) : (
                              <span className="status-progress-no" title="Campo apenas informativo / suporte">
                                Não (Informativo)
                              </span>
                            )}
                          </div>
                          <div className="col-replicate">
                            {col.replicates ? (
                              <span className="status-yes">
                                <Repeat size={14} /> Sim (Copia)
                              </span>
                            ) : (
                              <span className="status-no">Não</span>
                            )}
                          </div>
                          <div className="col-edit">
                            {col.isEditable ? (
                              <span className="perm-edit">
                                <CheckCircle2 size={14} /> Editável
                              </span>
                            ) : (
                              <span className="perm-view">
                                <Eye size={14} /> Somente Leitura
                              </span>
                            )}
                          </div>
                          <div className="col-actions">
                            <button
                              className="icon-btn edit"
                              title="Editar Coluna"
                              onClick={() => handleOpenEditColumn(col)}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className="icon-btn delete"
                              title="Excluir Coluna"
                              onClick={() => handleDeleteColumn(col)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ========================================================
          MODAL: USUÁRIO E PERMISSÕES
      ======================================================== */}
      {isUserModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUserModalOpen(false)}>
          <div className="modal-card modal-large settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingUser ? `Editar Usuário: ${editingUser.email}` : 'Novo Usuário do Sistema'}</h2>
                <p>Configure dados de acesso, permissões de setor, empresas e telas.</p>
              </div>
              <button className="icon-btn close-btn" onClick={() => setIsUserModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {isActorSocio && (
              <div className="hierarchy-warning">
                <AlertCircle size={16} />
                <span>
                  <strong>Aviso de Sócio:</strong> Você pode atribuir qualquer setor e permissão, exceto criar ou
                  promover para Administrador.
                </span>
              </div>
            )}

            {/* Abas Internas do Modal */}
            <div className="modal-tabs">
              <button
                type="button"
                className={`modal-tab-btn ${modalTab === 'info' ? 'active' : ''}`}
                onClick={() => setModalTab('info')}
              >
                1. Dados e Cargo
              </button>
              <button
                type="button"
                className={`modal-tab-btn ${modalTab === 'sectors' ? 'active' : ''}`}
                onClick={() => setModalTab('sectors')}
              >
                2. Acesso por Setor
              </button>
              <button
                type="button"
                className={`modal-tab-btn ${modalTab === 'companies' ? 'active' : ''}`}
                onClick={() => setModalTab('companies')}
              >
                3. Acesso a Empresas
              </button>
              <button
                type="button"
                className={`modal-tab-btn ${modalTab === 'screens' ? 'active' : ''}`}
                onClick={() => setModalTab('screens')}
              >
                4. Acesso a Telas
              </button>
            </div>

            <form onSubmit={handleSaveUser}>
              <div className="modal-body">
                {/* ABA 1: DADOS BÁSICOS */}
                {modalTab === 'info' && (
                  <div className="tab-pane">
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Nome Completo</label>
                        <input
                          type="text"
                          placeholder="Ex: João da Silva"
                          value={userName}
                          onChange={(e) => setUserName(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label>E-mail Corporativo *</label>
                        <input
                          type="email"
                          placeholder="nome@empresa.com"
                          required
                          value={userEmail}
                          onChange={(e) => setUserEmail(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label>{editingUser ? 'Nova Senha (opcional)' : 'Senha de Acesso *'}</label>
                        <input
                          type="password"
                          placeholder={editingUser ? 'Deixe em branco para manter' : '••••••••'}
                          required={!editingUser}
                          value={userPassword}
                          onChange={(e) => setUserPassword(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label>Cargo / Função</label>
                        <select value={userRole} onChange={(e) => setUserRole(e.target.value)}>
                          {ROLES.map((r) => {
                            const disabled = isActorSocio && r.value === 'ADMIN';
                            return (
                              <option key={r.value} value={r.value} disabled={disabled}>
                                {r.label} {disabled ? '(Bloqueado para Sócios)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div className="form-group full-width">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={userActive}
                            onChange={(e) => setUserActive(e.target.checked)}
                          />
                          <span>Usuário Ativo (Pode fazer login no sistema)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* ABA 2: PERMISSÃO POR SETOR */}
                {modalTab === 'sectors' && (
                  <div className="tab-pane">
                    <p className="tab-explanation">
                      Escolha o nível de permissão deste usuário em cada um dos 5 setores de fechamento:
                    </p>

                    <div className="sectors-access-list">
                      {SECTORS.map((s) => {
                        const currentAccess = userSectorAccess[s.key] || 'NONE';
                        return (
                          <div key={s.key} className="sector-access-row">
                            <div className="sector-access-title">
                              <span
                                className="sector-dot"
                                style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }}
                              />
                              <strong>{s.label}</strong>
                            </div>

                            <div className="access-options">
                              <label className={`access-option-label ${currentAccess === 'NONE' ? 'active-none' : ''}`}>
                                <input
                                  type="radio"
                                  name={`sector_${s.key}`}
                                  value="NONE"
                                  checked={currentAccess === 'NONE'}
                                  onChange={() =>
                                    setUserSectorAccess({ ...userSectorAccess, [s.key]: 'NONE' })
                                  }
                                />
                                <span>Sem Acesso</span>
                              </label>

                              <label className={`access-option-label ${currentAccess === 'VIEW' ? 'active-view' : ''}`}>
                                <input
                                  type="radio"
                                  name={`sector_${s.key}`}
                                  value="VIEW"
                                  checked={currentAccess === 'VIEW'}
                                  onChange={() =>
                                    setUserSectorAccess({ ...userSectorAccess, [s.key]: 'VIEW' })
                                  }
                                />
                                <Eye size={14} />
                                <span>Apenas Ver</span>
                              </label>

                              <label className={`access-option-label ${currentAccess === 'EDIT' ? 'active-edit' : ''}`}>
                                <input
                                  type="radio"
                                  name={`sector_${s.key}`}
                                  value="EDIT"
                                  checked={currentAccess === 'EDIT'}
                                  onChange={() =>
                                    setUserSectorAccess({ ...userSectorAccess, [s.key]: 'EDIT' })
                                  }
                                />
                                <Edit2 size={14} />
                                <span>Pode Editar</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ABA 3: ACESSO A EMPRESAS */}
                {modalTab === 'companies' && (
                  <div className="tab-pane">
                    <p className="tab-explanation">
                      Defina quais empresas o usuário pode <strong>visualizar</strong> e em quais ele pode <strong>editar</strong>:
                    </p>

                    <div className="companies-access-toggle four-cols">
                      <label className={`access-card-option ${userCompanyScope === 'ALL' && !userEditOnlyResponsible ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="companyScope"
                          checked={userCompanyScope === 'ALL' && !userEditOnlyResponsible}
                          onChange={() => { setUserCompanyScope('ALL'); setUserEditOnlyResponsible(false); }}
                        />
                        <div>
                          <strong>🌐 Ver e Editar Todas</strong>
                          <p>Vê e edita todas as empresas ativas (respeitando a permissão de cada setor).</p>
                        </div>
                      </label>

                      <label className={`access-card-option ${userCompanyScope === 'ALL' && userEditOnlyResponsible ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="companyScope"
                          checked={userCompanyScope === 'ALL' && userEditOnlyResponsible}
                          onChange={() => { setUserCompanyScope('ALL'); setUserEditOnlyResponsible(true); }}
                        />
                        <div>
                          <strong>👁️ Ver Todas · Editar Só as Suas</strong>
                          <p>Visualiza todas as empresas, mas só pode alterar aquelas em que é responsável.</p>
                        </div>
                      </label>

                      <label className={`access-card-option ${userCompanyScope === 'RESPONSIBLE' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="companyScope"
                          checked={userCompanyScope === 'RESPONSIBLE'}
                          onChange={() => { setUserCompanyScope('RESPONSIBLE'); setUserEditOnlyResponsible(true); }}
                        />
                        <div>
                          <strong>👤 Só Onde é Responsável</strong>
                          <p>Vê e edita apenas as empresas em que for atribuído como responsável.</p>
                        </div>
                      </label>

                      <label className={`access-card-option ${userCompanyScope === 'CUSTOM' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="companyScope"
                          checked={userCompanyScope === 'CUSTOM'}
                          onChange={() => setUserCompanyScope('CUSTOM')}
                        />
                        <div>
                          <strong>🏢 Empresas Específicas</strong>
                          <p>Seleção manual das empresas que este usuário poderá visualizar.</p>
                        </div>
                      </label>
                    </div>

                    {userCompanyScope === 'CUSTOM' && (
                      <label className={`checkbox-label ${userEditOnlyResponsible ? 'highlight-checked' : ''}`} style={{ marginBottom: 14 }}>
                        <input
                          type="checkbox"
                          checked={userEditOnlyResponsible}
                          onChange={(e) => setUserEditOnlyResponsible(e.target.checked)}
                        />
                        <div className="checkbox-info">
                          <strong>Editar apenas onde também é responsável</strong>
                          <span>Nas empresas selecionadas abaixo, o usuário só altera dados das que for responsável; as demais ficam somente leitura.</span>
                        </div>
                      </label>
                    )}

                    {userCompanyScope === 'CUSTOM' && (
                      <div className="company-selection-box">
                        <div className="company-search-bar">
                          <Search size={16} />
                          <input
                            type="text"
                            placeholder="Buscar por nome ou CNPJ..."
                            value={companySearch}
                            onChange={(e) => setCompanySearch(e.target.value)}
                          />
                          <span className="selected-counter">
                            {userSelectedCompanies.length} selecionada(s)
                          </span>
                        </div>

                        <div className="companies-checklist">
                          {filteredCompanies.length === 0 ? (
                            <div className="empty-substate">Nenhuma empresa encontrada.</div>
                          ) : (
                            filteredCompanies.map((c) => {
                              const isChecked = userSelectedCompanies.includes(c.id);
                              return (
                                <label key={c.id} className={`company-check-item ${isChecked ? 'checked' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setUserSelectedCompanies([...userSelectedCompanies, c.id]);
                                      } else {
                                        setUserSelectedCompanies(
                                          userSelectedCompanies.filter((id) => id !== c.id)
                                        );
                                      }
                                    }}
                                  />
                                  <div className="company-check-info">
                                    <strong>{c.name}{isExternalInstallmentCompany(c)?' · Externa (somente parcelamento)':''}</strong>
                                    <span>{c.cnpj} · {c.taxRegime}</span>
                                  </div>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ABA 4: ACESSO A TELAS */}
                {modalTab === 'screens' && (
                  <div className="tab-pane">
                    <p className="tab-explanation">
                      Marque quais menus e telas do Fechamento Pro o usuário tem permissão para acessar:
                    </p>

                    <div className="screens-list">
                      {SCREENS.map((sc) => {
                        const isAllowed = Boolean(userScreenAccess[sc.id]);
                        const Icon = sc.icon;
                        return (
                          <label key={sc.id} className={`screen-check-card ${isAllowed ? 'allowed' : ''}`}>
                            <div className="screen-check-left">
                              <input
                                type="checkbox"
                                checked={isAllowed}
                                onChange={(e) =>
                                  setUserScreenAccess({ ...userScreenAccess, [sc.id]: e.target.checked })
                                }
                              />
                              <Icon size={18} />
                              <span>{sc.label}</span>
                            </div>
                            <span className={`badge-perm ${isAllowed ? 'badge-on' : 'badge-off'}`}>
                              {isAllowed ? 'Liberado' : 'Bloqueado'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsUserModalOpen(false)} disabled={isSavingUser}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={isSavingUser}>
                  {isSavingUser ? <ButtonSpinner /> : <Check size={18} />}
                  <span>{isSavingUser ? 'Salvando Usuário...' : 'Salvar Usuário'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: COLUNA DO SETOR
      ======================================================== */}
      {isColumnModalOpen && (
        <div className="modal-overlay" onClick={() => setIsColumnModalOpen(false)}>
          <div className="modal-card modal-large settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingColumn ? 'Editar Coluna' : `Nova Coluna para ${colDepartment}`}</h2>
                <p>Define uma coluna personalizada na planilha de fechamento do setor.</p>
              </div>
              <button className="icon-btn close-btn" onClick={() => setIsColumnModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveColumn}>
              <div className="modal-body">
                <div className="form-group full-width">
                  <label>Nome da Coluna *</label>
                  <input
                    type="text"
                    placeholder="Ex: Faturamento, Envio de Guia, Folha..."
                    required
                    value={colName}
                    onChange={(e) => setColName(e.target.value)}
                  />
                </div>

                <div className="form-group full-width">
                  <label>Setor</label>
                  <select disabled={!!editingColumn} value={colDepartment} onChange={(e) => setColDepartment(e.target.value)}>
                    {SECTORS.filter((s) => s.key !== 'PARCELAMENTO' || colDepartment === 'PARCELAMENTO').map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group full-width">
                  <label>Ordem / Posição na Planilha</label>
                  <input
                    type="number"
                    min="1"
                    max={displayColumns.length + (editingColumn ? 0 : 1)}
                    value={colOrderIndex}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                      setColOrderIndex(isNaN(val as number) ? '' : (val as number));
                    }}
                    placeholder="Ex: 1"
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    Posição onde a coluna é exibida (1 = primeira coluna).
                  </small>
                </div>

                <div className="form-group full-width">
                  <label>Tipo de Entrada de Dados</label>
                  <div className="column-type-options">
                    {Object.entries(INPUT_TYPES).filter(([type]) => {
                      if (['DP','CONTABIL'].includes(colDepartment)) {
                        return ['POPUP','TEXT','CHECKBOX','SELECT','NUMBER','TEXTAREA','PASSWORD'].includes(type) || (type === 'READONLY' && editingColumn?.inputType === 'READONLY');
                      }
                      if (colDepartment === 'FISCAL') {
                        return ['POPUP','SELECT','MULTISELECT','TEXT','NUMBER','CHECKBOX','TEXTAREA','PASSWORD'].includes(type);
                      }
                      return ['POPUP','TEXT','CHECKBOX','TEXTAREA','MULTISELECT'].includes(type);
                    }).map(([type, item]) => <button type="button" key={type} aria-pressed={colInputType === type} className={colInputType === type ? 'selected' : ''} disabled={!!editingColumn && ((['FISCAL','CUSHMAN'].includes(colDepartment) && editingColumn.inputType==='POPUP' && !!resolveColumnKey(editingColumn) && type !== 'POPUP') || (colDepartment==='CONTABIL'&&String(resolveColumnKey(editingColumn)||'').startsWith('cont_')&&type!==editingColumn.inputType) || (['dp_reinf_fiscal','dp_qtde_funcionarios','dp_sd_senha'].includes(resolveColumnKey(editingColumn) || '') && type !== editingColumn.inputType))} onClick={() => {
                      setColInputType(type);
                      if (!editingColumn && type === 'POPUP') setColPopupConfig(defaultPopup(resolveFiscalKey({ department: colDepartment, name: colName }) || '', colName));
                    }}><item.Icon size={20} /><strong>{type === 'POPUP' ? 'Popup com detalhes' : item.label}</strong><small>{type === 'POPUP' ? 'Campos e botões configuráveis' : type === 'CHECKBOX' ? 'Marcar ou desmarcar' : type === 'READONLY' ? 'Consulta dados do Fiscal' : type === 'SELECT' ? 'Escolher uma opção configurada' : 'Preencher um valor ou texto'}</small></button>)}
                  </div>
                </div>

                <div className="form-group full-width">
                  <label className={`checkbox-label ${colCountsProgress ? 'highlight-checked' : ''}`}>
                    <input
                      type="checkbox"
                      disabled={colInputType === 'READONLY'}
                      checked={colCountsProgress}
                      onChange={(e) => setColCountsProgress(e.target.checked)}
                    />
                    <div className="checkbox-info">
                      <strong>Contabilizar no Progresso do Fechamento (%)</strong>
                      <span>Define se a conclusão desta etapa conta para a barra e porcentagem de andamento do setor</span>
                    </div>
                  </label>
                </div>

                <div className="form-group full-width">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      disabled={colInputType === 'READONLY'}
                      checked={colReplicates}
                      onChange={(e) => setColReplicates(e.target.checked)}
                    />
                    <span>Replicar valor automaticamente para o próximo mês</span>
                  </label>
                </div>

                <div className="form-group full-width">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      disabled={colInputType === 'READONLY'}
                      checked={colIsEditable}
                      onChange={(e) => setColIsEditable(e.target.checked)}
                    />
                    <span>Coluna editável pelo operador (desmarque para apenas visualização/aviso)</span>
                  </label>
                </div>
                <div className="form-group full-width"><label className="checkbox-label"><input type="checkbox" checked={colActive} onChange={e=>setColActive(e.target.checked)}/><span>Coluna ativa (desmarque para ocultar sem apagar dados)</span></label></div>
                {(['DP','CONTABIL'].includes(colDepartment) || (colDepartment === 'FISCAL' && ['SELECT','MULTISELECT','TEXT','NUMBER','TEXTAREA','PASSWORD'].includes(colInputType))) && colInputType !== 'READONLY' && <div className="dp-field-config"><h3>Detalhes do campo</h3><label>Texto de exemplo<input type="text" value={colFieldConfig.placeholder} onChange={e=>setColFieldConfig({...colFieldConfig,placeholder:e.target.value})}/></label>{(colInputType === 'SELECT' || colInputType === 'MULTISELECT') && <><label>Opções disponíveis (uma por linha)<textarea rows={5} value={colFieldConfig.options.join('\n')} onChange={e=>setColFieldConfig({...colFieldConfig,options:e.target.value.split('\n')})}/></label>{colInputType === 'SELECT' && <label>Opções que <strong>NÃO</strong> contabilizam progresso (ex: Pendente)<textarea rows={3} placeholder="Deixe em branco para que todas as opções (exceto vazias) contem como concluído" value={(colFieldConfig.pendingOptions || []).join('\n')} onChange={e=>setColFieldConfig({...colFieldConfig,pendingOptions:e.target.value.split('\n').filter(Boolean)})}/></label>}</>}</div>}
                {colInputType === 'READONLY' && <p>Esta REINF vem do Fiscal da mesma empresa e competência. Nenhum campo pode ser alterado pelo DP.</p>}
                <ColumnVisibilityEditor value={colVisibility} onChange={setColVisibility} />
                {colInputType === 'POPUP' && <PopupConfigEditor value={colPopupConfig} onChange={setColPopupConfig} columnKey={resolveColumnKey(editingColumn || { department: colDepartment, name: colName }) || ''} name={colName} />}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsColumnModalOpen(false)} disabled={isSavingColumn}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={isSavingColumn}>
                  {isSavingColumn ? <ButtonSpinner /> : <Check size={18} />}
                  <span>{isSavingColumn ? 'Salvando Coluna...' : 'Salvar Coluna'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ChangePasswordModal
        isOpen={isPwdModalOpen}
        onClose={() => {
          setIsPwdModalOpen(false);
          setPwdTargetUser(null);
        }}
        currentUser={currentUser || null}
        targetUser={pwdTargetUser}
        onSuccess={() => {
          showToast('Senha redefinida com sucesso!', 'success');
        }}
      />

      <UserOffboardModal
        isOpen={isOffboardModalOpen}
        onClose={() => {
          setIsOffboardModalOpen(false);
          setOffboardingUser(null);
        }}
        targetUser={offboardingUser}
        currentUser={currentUser || null}
        allUsers={users}
        onSuccess={() => {
          showToast('Colaborador e empresas atualizados com sucesso!', 'success');
          loadData();
        }}
      />
    </div>
  );
}
