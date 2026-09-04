import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const route = (env.ARSENAL_ROUTE || '').replace(/\/$/, '')
  const target = env.DMMONITOR_API_URL || 'http://127.0.0.1:8087'
  const proxy = Object.fromEntries(['/api', '/auth', '/healthz'].map(endpoint => [
    route + endpoint,
    { target, rewrite: (requestPath: string) => route ? requestPath.slice(route.length) || '/' : requestPath },
  ]))

  return { plugins: [react()], server: { port: 5175, strictPort: true, proxy } }
})
