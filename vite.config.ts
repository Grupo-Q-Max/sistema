import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Usa caminhos relativos ('./') para funcionar perfeitamente na raiz do Azure ou em subdiretórios
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
