const getOrigin = () => {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }
  // Se estiver rodando dentro de um subdiretório /sistema (como no proxy legado)
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/sistema')) {
    return '/sistema';
  }
  return '';
};

/** Origem da API. Dinâmico: detecta automaticamente se está na raiz ou em /sistema. */
export const API = getOrigin();
export const API_URL = `${API}/api`;

/** Helper para injetar o token de sessão Bearer em requisições autenticadas. */
export function authHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  let token = '';
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('fechamento_user') : null;
    if (raw) {
      const u = JSON.parse(raw);
      token = u?.sessionToken || '';
    }
  } catch {}
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}
