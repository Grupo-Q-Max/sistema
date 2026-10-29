import {CompanyQuality} from './components/CompanyQuality';
import {CushmanClosings} from './components/CushmanClosings';
import { InstallmentSettings } from './components/InstallmentSettings';
import { AccountingClosings } from './components/AccountingClosings';
import { ErrorBoundary } from './components/ErrorBoundary';
import React, { useState, useEffect } from 'react';
import './index.css';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { Companies } from './components/Companies';
import { hasSectorAccess } from './components/ClosingSectorTabs';
import { PayrollClosings } from './components/PayrollClosings';
import { Closings } from './components/Closings';
import { Certificates } from './components/Certificates';
import { SystemLogs } from './components/SystemLogs';
import { Analytics } from './components/Analytics';
import { Sidebar } from './components/Sidebar';
import type { CurrentUser } from './types/auth';
import { API } from './api';
import { AlertCircle, LogIn } from 'lucide-react';
import { ButtonSpinner } from './components/LoadingSkeleton';

function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [currentView, setCurrentView] = useState<string>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getDefaultView = (user: CurrentUser) => {
    if (user.role === 'ADMIN' || user.role === 'SOCIO') return 'dashboard';
    if (hasSectorAccess(user, 'FISCAL')) return 'closings';
    if (hasSectorAccess(user, 'DP')) return 'closings-dp';
    if (hasSectorAccess(user, 'CONTABIL')) return 'closings-accounting';
    if (hasSectorAccess(user, 'CUSHMAN')) return 'closings-cushman';
    return 'companies';
  };

  const handleNavigate = (view: string) => setCurrentView(view === 'closings' && !hasSectorAccess(currentUser, 'FISCAL') && hasSectorAccess(currentUser, 'DP') ? 'closings-dp' : view==='closings'&&!hasSectorAccess(currentUser,'FISCAL')&&hasSectorAccess(currentUser,'CONTABIL')?'closings-accounting':view==='closings'&&!hasSectorAccess(currentUser,'FISCAL')&&hasSectorAccess(currentUser,'CUSHMAN')?'closings-cushman':view);

  // Restaura sessão se existir
  useEffect(() => {
    const saved = localStorage.getItem('fechamento_user');
    if (saved) {
      try {
        const user = JSON.parse(saved);
        setCurrentUser(user);
        setCurrentView(getDefaultView(user));
      } catch {
        localStorage.removeItem('fechamento_user');
      }
    }
  }, []);

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPassword?: string) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const loginEmail = (customEmail || email).trim().toLowerCase();
    const loginPass = customPassword !== undefined ? customPassword : password;

    try {
      const res = await fetch(`${API}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Erro ao realizar login');
        return;
      }

      setCurrentUser(data);
      localStorage.setItem('fechamento_user', JSON.stringify(data));
      setCurrentView(getDefaultView(data));
    } catch (err) {
      console.error(err);
      setErrorMsg('Servidor offline ou inacessível');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (currentUser) {
      try {
        await fetch(`${API}/api/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            userEmail: currentUser.email,
            userName: currentUser.name || currentUser.email,
          }),
        });
      } catch {
        // Ignora erro de rede no logout
      }
    }
    localStorage.removeItem('fechamento_user');
    setCurrentUser(null);
    setCurrentView('login');
    setEmail('');
    setPassword('');
  };

  if (currentView === 'dashboard') {
    return (
      <Dashboard
        currentView={currentView}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  if (currentView === 'analytics') return <Analytics currentView={currentView} onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout} />;

  if (currentView === 'closings-cushman') return <CushmanClosings currentView={currentView} onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout}/>;

  if (currentView === 'closings-accounting') return <AccountingClosings currentView={currentView} onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout} />;

  if (currentView === 'closings-dp') return <ErrorBoundary fallbackTitle="Erro ao carregar o Fechamento DP"><PayrollClosings currentView={currentView} onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout} /></ErrorBoundary>;

  if (currentView === 'closings') {
    return (
      <Closings
        currentView={currentView}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  if (currentView === 'companies') {
    return (
      <Companies
        currentView={currentView}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  if (currentView==='settings-data-quality') return <CompanyQuality currentView={currentView} onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout}/>;

  if (currentView==='settings-installments') return <InstallmentSettings currentView={currentView} onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout}/>;

  if (currentView === 'certificates') {
    return (
      <div style={{ display: 'flex' }}>
        <Sidebar currentView={currentView} onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout} />
        <div style={{ flex: 1, height: '100vh', overflowY: 'auto' }}>
          <Certificates currentUser={currentUser} />
        </div>
      </div>
    );
  }

  if (currentView === 'logs') {
    return (
      <div style={{ display: 'flex' }}>
        <Sidebar currentView={currentView} onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout} />
        <div style={{ flex: 1, height: '100vh', overflowY: 'auto' }}>
          <SystemLogs />
        </div>
      </div>
    );
  }

  if (currentView.startsWith('settings')) {
    return (
      <Settings
        currentView={currentView}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="crm-login">
      <div className="crm-login__card">
        <div className="crm-login__brand">
          Fechamento <span>Pro</span>
        </div>

        {errorMsg && (
          <div className="login-error-alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '13px', marginBottom: '16px' }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <label htmlFor="email">
            E-mail
            <input
              type="email"
              id="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label htmlFor="password">
            Senha
            <input
              type="password"
              id="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <p className="crm-login__switch" style={{ textAlign: 'right', marginTop: '-4px', marginBottom: '12px' }}>
            <a href="#" onClick={(e) => e.preventDefault()}>Esqueceu a senha?</a>
          </p>

          <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {loading ? <ButtonSpinner /> : <LogIn size={16} />}
            <span>{loading ? 'Autenticando...' : 'Entrar no Sistema'}</span>
          </button>
        </form>


      </div>
    </div>
  );
}

export default App;
