import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'path'

const HOP_BY_HOP = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
])

const SKIP_REQ_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
])

/**
 * Dev-only CORS proxy: forwards `/__cors?target=<absolute-url>` from Node so
 * provider endpoints (chat, model listing, image/audio APIs) can be reached
 * without tripping browser CORS. Paired with `src/lib/dev-proxy.ts`.
 */
function devCorsProxy(): Plugin {
  return {
    name: 'dev-cors-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__cors', async (req, res) => {
        try {
          const original = (req as { originalUrl?: string }).originalUrl ?? req.url ?? ''
          const target = new URL(original, 'http://localhost').searchParams.get('target')
          if (!target) {
            res.statusCode = 400
            res.end('dev-cors-proxy: missing target')
            return
          }

          const headers: Record<string, string> = {}
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value !== 'string') continue
            if (SKIP_REQ_HEADERS.has(key.toLowerCase())) continue
            headers[key] = value
          }

          const method = req.method ?? 'GET'
          let body: Buffer | undefined
          if (method !== 'GET' && method !== 'HEAD') {
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(chunk as Buffer)
            if (chunks.length) body = Buffer.concat(chunks)
          }

          const upstream = await fetch(target, {
            method,
            headers,
            body: body as unknown as BodyInit,
          })

          res.statusCode = upstream.status
          upstream.headers.forEach((value, key) => {
            if (!HOP_BY_HOP.has(key.toLowerCase())) res.setHeader(key, value)
          })

          if (!upstream.body) {
            res.end()
            return
          }

          const reader = upstream.body.getReader()
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              res.write(Buffer.from(value))
            }
          } finally {
            res.end()
          }
        } catch (err) {
          res.statusCode = 502
          res.end(`dev-cors-proxy: ${err instanceof Error ? err.message : String(err)}`)
        }
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    devCorsProxy(),
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
  },
  build: {
    target: 'safari15',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
}))
