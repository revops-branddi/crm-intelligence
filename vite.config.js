import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/pipedrive-v2': {
        target: 'https://api.pipedrive.com/api/v2',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pipedrive-v2/, '')
      },
      '/api/pipedrive': {
        target: 'https://api.pipedrive.com/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pipedrive/, '')
      },
      '/api/gemini': {
        target: 'https://crm-intelligence.vercel.app',
        changeOrigin: true
      }
    }
  }
})
