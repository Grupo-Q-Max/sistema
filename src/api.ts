const origin = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

/** Origem da API. Em produção fica vazia para usar o mesmo host do Webmin. */
export const API = origin;
export const API_URL = `${origin}/api`;
