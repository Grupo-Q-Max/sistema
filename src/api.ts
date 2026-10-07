const origin = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  ?? (import.meta.env.DEV ? 'http://localhost:3001' : '/sistema');

/** Origem da API. Em produção utiliza /sistema para o proxy reverso. */
export const API = origin;
export const API_URL = `${origin}/api`;
