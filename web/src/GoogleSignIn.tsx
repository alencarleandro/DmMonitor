import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Role, User } from './api'

type GoogleIdentity = {
  initialize: (options: { client_id: string; nonce: string; auto_select: boolean; callback: (response: { credential: string }) => void }) => void
  renderButton: (element: HTMLElement, options: { type: string; theme: string; size: string; text: string; shape: string; locale: string; width: number }) => void
}
declare global { interface Window { google?: { accounts: { id: GoogleIdentity } } } }

let loadingGoogle: Promise<GoogleIdentity> | undefined
function loadGoogle(): Promise<GoogleIdentity> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id)
  if (loadingGoogle) return loadingGoogle
  loadingGoogle = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script')
    const fail = () => { window.clearTimeout(timeout); script.remove(); reject(new Error('Não foi possível carregar o Google. Confira sua conexão e tente novamente.')) }
    const timeout = window.setTimeout(fail, 15000)
    script.src = 'https://accounts.google.com/gsi/client?hl=pt-BR'
    script.async = true
    script.onerror = fail
    script.onload = () => {
      window.clearTimeout(timeout)
      if (window.google?.accounts.id) resolve(window.google.accounts.id)
      else fail()
    }
    document.head.appendChild(script)
  }).catch(error => { loadingGoogle = undefined; throw error })
  return loadingGoogle
}

export function GoogleSignIn({ clientId, role, onLogin }: { clientId: string; role: Role; onLogin: (user: User) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const selectedRole = useRef(role)
  const finish = useRef(onLogin)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('Carregando login Google…')
  const [error, setError] = useState('')
  useEffect(() => { selectedRole.current = role; finish.current = onLogin }, [role, onLogin])
  useEffect(() => {
    let active = true
    let submitting = false
    const element = container.current!
    setError(''); setStatus('Carregando login Google…')
    loadGoogle().then(async google => {
      if (!active) return
      const { nonce } = await api<{ nonce: string }>('/auth/google/challenge', { method: 'POST' })
      if (!active) return
      google.initialize({
        client_id: clientId, nonce, auto_select: false,
        callback: async ({ credential }) => {
          if (!active || submitting) return
          submitting = true
          setStatus('Entrando na sua conta…'); element.replaceChildren()
          try {
            const user = await api<User>('/auth/google', { method: 'POST', body: JSON.stringify({ credential, role: selectedRole.current }) })
            if (active) finish.current(user)
          } catch (e) { if (active) { setStatus(''); setError((e as Error).message) } }
        },
      })
      google.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', locale: 'pt-BR', width: Math.min(element.clientWidth || 320, 400) })
      setStatus('')
    }).catch(e => { if (active) { setStatus(''); setError((e as Error).message) } })
    return () => { active = false; element.replaceChildren() }
  }, [clientId, attempt])
  return <div className="google-sign-in">
    <div ref={container} className="google-sign-in-button" />
    {status && <p className="setup-note" role="status">{status}</p>}
    {error && <div className="google-sign-in-error" role="alert"><p>{error}</p><button className="demo-button" onClick={() => setAttempt(a => a + 1)}>Tentar novamente</button></div>}
  </div>
}
