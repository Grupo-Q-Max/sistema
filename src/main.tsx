import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './ui-theme.css'

// Blindagem contra extensões de tradução do navegador (Google Translate) que modificam o DOM
// e causam o erro: NotFoundError: Failed to execute 'insertBefore' on 'Node'
if (typeof window !== 'undefined') {
  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
    if (child && child.parentNode !== this) {
      console.warn('Proteção de DOM: child não é filho direto deste nó. Usando appendChild.', node, child, this);
      return this.appendChild(node) as T;
    }
    return originalInsertBefore.call(this, node, child) as T;
  };

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child && child.parentNode !== this) {
      console.warn('Proteção de DOM: child não é filho direto deste nó. Ignorando removeChild.', child, this);
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  // Interceptor global de fetch: anexa automaticamente o Authorization Bearer
  // com o token da sessão ativa armazenado no localStorage
  const originalFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    try {
      const rawUser = localStorage.getItem('fechamento_user');
      if (rawUser) {
        const user = JSON.parse(rawUser);
        if (user?.sessionToken) {
          const reqHeaders = new Headers(init?.headers || {});
          if (!reqHeaders.has('Authorization')) {
            reqHeaders.set('Authorization', `Bearer ${user.sessionToken}`);
          }
          init = { ...init, headers: reqHeaders };
        }
      }
    } catch {
      // Ignora falhas de parse de localStorage
    }
    return originalFetch.call(this, input, init);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
