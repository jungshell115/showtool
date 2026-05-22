import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'samsung >= 4', 'not IE 11'],
    }),
  ],
  base: mode === 'production' ? '/player/' : '/',
  server: {
    port: 3001,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      }
    }
  }
}))
