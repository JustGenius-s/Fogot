import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'path'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...(command === 'build' ? [viteSingleFile()] : []),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/api/minimax': {
        target: 'https://api.minimaxi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/minimax/, ''),
      },
      '/api/ofox': {
        target: 'https://api.ofox.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ofox/, ''),
      },
    },
  },
  build: {
    target: 'safari15',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
}))
