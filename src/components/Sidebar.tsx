import { canConfigureInstallments } from '../config/installments';
import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  FileCheck,
  Users,
  Building2,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronUp,
  LogOut,
  ShieldCheck,
  Columns3,
  Menu,
  X,
  AlertTriangle,
  Activity,
  BarChart3,
  KeyRound,
} from 'lucide-react';
import type { CurrentUser } from '../types/auth';
import { ChangePasswordModal } from './ChangePasswordModal';
import './Dashboard.css';
import './Sidebar.css';
import './CompanyQuality.css';
import { hasSectorAccess } from './ClosingSectorTabs';
import { API } from '../api';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  currentUser?: CurrentUser | null;
  onLogout?: () => void;
}

export function Sidebar({ currentView, onNavigate, currentUser, onLogout }: SidebarProps) {
  const [mobileOpen,setMobileOpen]=useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const menuButton=useRef<HTMLButtonElement>(null);
  const sidebar=useRef<HTMLElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{setMobileOpen(false);},[currentView]);
  useEffect(()=>{
    const media=window.matchMedia('(max-width: 1023px)');
    const resize=()=>{if(!media.matches)setMobileOpen(false);};
    media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);
  },[]);
  useEffect(()=>{
    if(!mobileOpen)return;
    const overflow=document.body.style.overflow;
    const main=document.querySelector<HTMLElement>('.crm-main');const wasInert=main?.inert;
    document.body.style.overflow='hidden';if(main)main.inert=true;
    closeButton.current?.focus();
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setMobileOpen(false);}
      if(event.key==='Tab'){
        const controls=Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled])')||[]).filter(element=>element.getClientRects().length>0);
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',keyboard);
    return()=>{document.body.style.overflow=overflow;if(main)main.inert=wasInert||false;document.removeEventListener('keydown',keyboard);menuButton.current?.focus();};
  },[mobileOpen]);
  const navigate = (view: string) => {
    setMobileOpen(false);
    onNavigate(view);
  };
  const isClosingsActive = ['closings','closings-dp','closings-accounting','closings-cushman'].includes(currentView);
  const [isClosingsOpen,setIsClosingsOpen] = useState(isClosingsActive);
  const isSettingsActive = currentView.startsWith('settings');
  const [isSettingsOpen, setIsSettingsOpen] = useState(isSettingsActive);

  // Verificação de permissões de tela
  const isPrivileged = currentUser?.role === 'ADMIN' || currentUser?.role === 'SOCIO';

  const canAccessScreen = (screenId: string) => {
    if (!currentUser) return true;
    if (isPrivileged) return true;
    const perm = currentUser.screenPermissions?.find((p) => p.screen === screenId);
    return perm ? perm.allowed : false;
  };

  const [qualityCount,setQualityCount]=useState(0);
  useEffect(()=>{
    if(!isPrivileged||!currentUser?.sessionToken)return;
    const controller=new AbortController();
    const refresh=()=>fetch(`${API}/api/admin/company-quality?summary=1`,{headers:{Authorization:`Bearer ${currentUser.sessionToken}`},signal:controller.signal}).then(async response=>{if(response.ok){const data=await response.json();setQualityCount(data.summary?.affected||0);}}).catch(()=>{});
    void refresh();const timer=window.setInterval(()=>void refresh(),60000);
    return()=>{controller.abort();window.clearInterval(timer);};
  },[isPrivileged,currentUser?.sessionToken,currentView]);
  const showDashboard = canAccessScreen('dashboard');
  const showClosings = canAccessScreen('closings');
  const closingItems = [
    {view:'closings',label:'Fiscal',sector:'FISCAL' as const,Icon:FileCheck},
    {view:'closings-dp',label:'DP',sector:'DP' as const,Icon:Users},
    {view:'closings-accounting',label:'Contábil',sector:'CONTABIL' as const,Icon:FileCheck},
    {view:'closings-cushman',label:'Cushman',sector:'CUSHMAN' as const,Icon:Building2},
  ].filter(item => showClosings && hasSectorAccess(currentUser,item.sector));
  const showCompanies = canAccessScreen('companies');
  const showPermissions = canAccessScreen('settings-permissions');
  const showColumns = canAccessScreen('settings-columns');
  const showSettingsGroup = showPermissions || showColumns;

  const roleLabelMap: Record<string, string> = {
    ADMIN: 'Administrador',
    SOCIO: 'Sócio',
    FISCAL: 'Fiscal',
    DP: 'DP',
    CONTABIL: 'Contábil',
    FINANCEIRO: 'Financeiro',
    CADASTRO: 'Cadastro',
  };

  return (
    <>
      <header className="mobile-app-header">
        <button type="button" ref={menuButton} aria-label="Abrir menu de navegação" aria-expanded={mobileOpen} aria-controls="main-sidebar" onClick={()=>setMobileOpen(true)}><Menu size={22}/></button>
        <span>Fechamento <strong>Pro</strong></span>
      </header>
      {mobileOpen&&<button type="button" className="mobile-sidebar-backdrop" aria-label="Fechar menu de navegação" onClick={()=>setMobileOpen(false)}/>}
      <aside ref={sidebar} id="main-sidebar" aria-label="Navegação principal" className={`crm-sidebar ${mobileOpen?'is-mobile-open':''}`}>
      <button type="button" ref={closeButton} className="mobile-sidebar-close" aria-label="Fechar menu" onClick={()=>setMobileOpen(false)}><X size={22}/></button>
      <div className="crm-sidebar__brand">
        Fechamento <span>Pro</span>
      </div>

      <nav className="crm-sidebar__nav">
        {showDashboard && (
          <a
            href="#"
            className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              navigate('dashboard');
            }}
          >
            <LayoutDashboard size={20} />
            Visão Geral
          </a>
        )}

        {showDashboard && (
          <a
            href="#"
            id="nav-analytics"
            className={`nav-item ${currentView === 'analytics' ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              navigate('analytics');
            }}
          >
            <BarChart3 size={20} />
            Gráficos
          </a>
        )}

        {closingItems.length > 0 && (
          <div className="nav-item-group">
            <button type="button" className={`nav-item sidebar-group-toggle ${isClosingsActive?'active':''}`} aria-expanded={isClosingsOpen} aria-controls="sidebar-closings-menu" onClick={()=>setIsClosingsOpen(open=>!open)}>
              <span className="sidebar-group-label"><FileCheck size={20}/>Fechamentos</span>
              {isClosingsOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
            </button>
            {isClosingsOpen && <div className="nav-submenu" id="sidebar-closings-menu">
              {closingItems.map(({view,label,Icon})=><a key={view} href="#" className={`nav-subitem ${currentView===view?'active':''}`} aria-current={currentView===view?'page':undefined} onClick={event=>{event.preventDefault();navigate(view);}}><Icon size={16}/>{label}</a>)}
            </div>}
          </div>
        )}

        {showCompanies && (
          <a
            href="#"
            className={`nav-item ${currentView === 'companies' ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              navigate('companies');
            }}
          >
            <Building2 size={20} />
            Empresas
          </a>
        )}

        {showCompanies && (
          <a
            href="#"
            className={`nav-item ${currentView === 'certificates' ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              navigate('certificates');
            }}
          >
            <ShieldCheck size={20} />
            Certificados/Proc.
          </a>
        )}

        {isPrivileged&&<a href="#" className={`nav-item ${currentView==='settings-data-quality'?'active':''}`} onClick={event=>{event.preventDefault();navigate('settings-data-quality');}}><AlertTriangle size={20}/>Avisos de cadastro{qualityCount>0&&<span className="quality-nav-count">{qualityCount}</span>}</a>}
        {showSettingsGroup && (
          <>
            <div className="nav-divider"></div>

            <div className="nav-item-group">
              <a
                href="#"
                className={`nav-item ${isSettingsActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  setIsSettingsOpen(!isSettingsOpen);
                  if (!isSettingsOpen && !isSettingsActive) {
                    navigate(showPermissions ? 'settings-permissions' : 'settings-columns');
                  }
                }}
                style={{ justifyContent: 'space-between' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <SettingsIcon size={20} />
                  Configurações
                </div>
                {isSettingsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </a>

              {isSettingsOpen && (
                <div className="nav-submenu">
                  {showPermissions && (
                    <a
                      href="#"
                      className={`nav-subitem ${currentView === 'settings-permissions' ? 'active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('settings-permissions');
                      }}
                    >
                      <ShieldCheck size={16} />
                      Permissões
                    </a>
                  )}
                  {showColumns && (
                    <a
                      href="#"
                      className={`nav-subitem ${currentView === 'settings-columns' ? 'active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('settings-columns');
                      }}
                    >
                      <Columns3 size={16} />
                      Colunas
                    </a>
                  )}
                  {canConfigureInstallments(currentUser)&&<a href="#" className={`nav-subitem ${currentView==='settings-installments'?'active':''}`} onClick={event=>{event.preventDefault();navigate('settings-installments');}}><FileCheck size={16}/>Parcelamentos</a>}
                  {isPrivileged && (
                    <a
                      href="#"
                      className={`nav-subitem ${currentView === 'logs' ? 'active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('logs');
                      }}
                    >
                      <Activity size={16} />
                      Logs do Sistema
                    </a>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </nav>

      {isPrivileged&&qualityCount>0&&currentView!=='settings-data-quality'&&<a href="#" className="quality-sidebar-alert" role="status" onClick={event=>{event.preventDefault();navigate('settings-data-quality');}}><strong>{qualityCount} empresa(s) com avisos</strong><span>Revise datas, certificados e cadastro</span></a>}
      {/* User profile footer in sidebar */}
      {currentUser && (
        <div className="sidebar-footer">
          <div className="user-profile-badge">
            <div className="user-avatar-small">
              {(currentUser.name || currentUser.email)[0].toUpperCase()}
            </div>
            <div className="user-profile-details">
              <strong>{currentUser.name || currentUser.email.split('@')[0]}</strong>
              <span>{roleLabelMap[currentUser.role] || currentUser.role}</span>
            </div>
          </div>
          <div className="sidebar-footer-actions">
            <button
              type="button"
              className="change-password-btn"
              title="Alterar minha senha"
              aria-label="Alterar minha senha"
              onClick={() => setIsPasswordModalOpen(true)}
            >
              <KeyRound size={15} />
            </button>
            {onLogout && (
              <button type="button" className="logout-btn" title="Encerrar sessão" aria-label="Sair do sistema" onClick={onLogout}>
                <LogOut size={16} /><span>Sair</span>
              </button>
            )}
          </div>
        </div>
      )}
    </aside>

    {currentUser && (
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        currentUser={currentUser}
      />
    )}
    </>
  );
}
