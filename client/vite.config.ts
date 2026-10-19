import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(root, '../shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: { allow: [path.resolve(root, '..')] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
})
