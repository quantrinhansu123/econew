import { readFileSync, existsSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

function resolveDevApiPort(mode: string) {
  const clientDir = fileURLToPath(new URL('.', import.meta.url))
  const env = loadEnv(mode, clientDir, '')
  const fromClient = Number(env.VITE_DEV_API_PORT)
  if (Number.isFinite(fromClient) && fromClient > 0) return fromClient

  const serverEnvPath = fileURLToPath(new URL('../server/.env', import.meta.url))
  if (existsSync(serverEnvPath)) {
    const match = readFileSync(serverEnvPath, 'utf8').match(/^PORT=(\d+)/m)
    if (match) return Number(match[1])
  }

  return 3001
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const API_PORT = resolveDevApiPort(mode)
  const API_TARGET = `http://127.0.0.1:${API_PORT}`

  console.log(`[vite] API proxy → ${API_TARGET}`)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 6060,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              const response = res as {
                writeHead?: (code: number, headers: Record<string, string>) => void
                end?: (body: string) => void
                headersSent?: boolean
              }
              if (response.headersSent || !response.writeHead) return
              response.writeHead(502, { 'Content-Type': 'application/json' })
              response.end(
                JSON.stringify({
                  message: `Không kết nối được backend NestJS (${API_TARGET}). Chạy: cd server && npm run dev`,
                }),
              )
            })
          },
        },
      },
    },
    preview: {
      port: 6060,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
