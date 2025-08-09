// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/WAVUploader/',
  server: {
    proxy: {
      '/wavuser': {
        target: 'https://dawavinternaluser-btgsaphegvahbug9.eastus-01.azurewebsites.net',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/wavuser/, '')
      },
      '/patient': {
        target: 'https://dawavorderpatient-hqe2apddbje9gte0.eastus-01.azurewebsites.net',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/patient/, '')
      },
      '/admin': {
        target: 'https://dawavadmin-djb0f9atf8e6cwgx.eastus-01.azurewebsites.net',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/admin/, '')
      }
    }
  }
})
