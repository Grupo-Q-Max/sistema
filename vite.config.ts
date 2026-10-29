import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base '/' garante que os bundles JS e CSS sejam sempre carregados da raiz /assets/...
// evitando qualquer falha de carregamento ou tela preta em sub-rotas.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
