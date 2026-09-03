import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDownLeft, ArrowRight, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, Clock3, Copy, Droplet, HeartHandshake, LayoutDashboard, Link2, LogOut, Mail, Plus, RefreshCw, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import { api, contexts, localDate, localDateTime, sampleMeasurements, today } from './api'
import type { Grant, Measurement, Patient, Role, User } from './api'
import { GoogleSignIn } from './GoogleSignIn'

type Session = { user: User; demo: boolean }
type Toast = { text: string; error?: boolean }
type GoogleConfig = { googleEnabled: boolean; googleClientId: string; googleMode: 'identity' | 'redirect' | 'disabled' }
const dayLabel = (value: string) => new Date(`${value}T12:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
const firstName = (user: User) => user.name.split(' ')[0]

function Logo() { return <div className="brand"><span className="brand-icon"><Droplet size={23} strokeWidth={1.8} /></span><span>DM<span className="brand-light"> Monitor</span><small>SEU DIÁRIO DE GLICEMIA</small></span></div> }
function GoogleIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h5.4a4.6 4.6 0 0 1-2 3v2.8h3.3c1.9-1.8 2.9-4.4 2.9-7.9Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6a6 6 0 0 1-9-3.2H3v2.8A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.8a6 6 0 0 1 0-3.6V7.4H3a10 10 0 0 0 0 9.2l3.4-2.8Z"/><path fill="#EA4335" d="M12 6a5.5 5.5 0 0 1 3.9 1.5L18.8 4A9.8 9.8 0 0 0 3 7.4l3.4 2.8A6 6 0 0 1 12 6Z"/></svg> }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig>({ googleEnabled: false, googleClientId: '', googleMode: 'disabled' })
  const [toast, setToast] = useState<Toast | null>(null)
  useEffect(() => {
    Promise.all([api<User>('/me').then(user => setSession({ user, demo: false })).catch(() => {}), api<GoogleConfig>('/config').then(setGoogleConfig).catch(() => {})]).finally(() => setLoading(false))
    const expired = () => setSession(null)
    window.addEventListener('session-expired', expired)
    if (new URLSearchParams(location.search).has('auth_error')) {
      setToast({ text: 'Não foi possível entrar com o Google. Tente novamente.', error: true })
      history.replaceState(null, '', '/')
    }
    return () => window.removeEventListener('session-expired', expired)
  }, [])
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(null), 5500); return () => clearTimeout(timeout) }, [toast])
  const demo = (role: Role) => setSession({ demo: true, user: { id: 'demo-user', name: role === 'user' ? 'Marina Oliveira' : 'Rafael Costa', email: role === 'user' ? 'marina@example.com' : 'rafael@example.com', role } })
  async function logout() {
    try { if (!session?.demo) await api('/logout', { method: 'POST' }); setSession(null) } catch (e) { setToast({ text: (e as Error).message, error: true }) }
  }
  return <>{loading ? <div className="boot"><Logo /><span>Preparando seu diário…</span></div> : session ? <Workspace key={`${session.user.id}-${session.user.role}`} session={session} notify={setToast} logout={logout} /> : <Login googleConfig={googleConfig} onLogin={user => setSession({ user, demo: false })} onDemo={demo} />}
    {toast && <div className={`toast ${toast.error ? 'toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <X size={18} /> : <CheckCheck size={18} />}<span>{toast.text}</span><button className="icon-button" aria-label="Fechar aviso" onClick={() => setToast(null)}><X size={16} /></button></div>}
  </>
}

function Login({ googleConfig, onLogin, onDemo }: { googleConfig: GoogleConfig; onLogin: (user: User) => void; onDemo: (role: Role) => void }) {
  const [role, setRole] = useState<Role>('user')
  return <main className="login-page"><section className="login-story"><Logo /><div className="story-main"><div className="eyebrow"><span /> UM CUIDADO, TODOS OS DIAS</div><h1>Seu dia a dia.<br />Seu cuidado.<br /><em>Mais perto.</em></h1><p>Um lugar simples para registrar sua glicemia e compartilhar cada passo com quem cuida de você.</p><div className="story-note"><HeartHandshake size={24} /><span>Para você e sua rede de cuidado.</span></div></div><span className="story-footer">Um registro de cada vez.</span></section><section className="login-form-section"><div className="login-form"><span className="small-kicker">BEM-VINDO AO DM MONITOR</span><h2>Vamos cuidar do seu dia?</h2><p>Escolha como você quer começar.</p><div className="role-options"><button className={`role-option ${role === 'user' ? 'selected' : ''}`} onClick={() => setRole('user')} aria-pressed={role === 'user'}><span className="role-icon"><Droplet size={23} /></span><strong>Quero registrar</strong><span>Meu diário de glicemia</span><span className="radio-dot">{role === 'user' && <Check size={12} />}</span></button><button className={`role-option ${role === 'companion' ? 'selected' : ''}`} onClick={() => setRole('companion')} aria-pressed={role === 'companion'}><span className="role-icon"><Users size={23} /></span><strong>Quero acompanhar</strong><span>O cuidado de outra pessoa</span><span className="radio-dot">{role === 'companion' && <Check size={12} />}</span></button></div>
    {googleConfig.googleMode === 'identity' ? <GoogleSignIn clientId={googleConfig.googleClientId} role={role} onLogin={onLogin} /> : googleConfig.googleEnabled ? <a className="button google-button" href={`/auth/google?role=${role}`}><GoogleIcon />Continuar com o Google<ArrowRight size={17} /></a> : <><button className="button google-button" disabled><GoogleIcon />Continuar com o Google</button><p className="setup-note">O login ficará disponível após a configuração do Google no servidor.</p></>}
    <p className="account-hint">No primeiro acesso, sua conta será criada com o perfil escolhido.</p><div className="login-divider"><span>conheça primeiro</span></div><button className="demo-button" onClick={() => onDemo(role)}>Explorar demonstração <ArrowRight size={17} /></button><p className="demo-hint">Dados fictícios. Nenhuma informação é salva.</p><div className="privacy-note"><ShieldCheck size={18} /><span>Você decide quem pode acompanhar suas medições.</span></div></div><span className="login-bottom">Feito para simplificar sua rotina.</span></section></main>
}

function Workspace({ session, notify, logout }: { session: Session; notify: (toast: Toast) => void; logout: () => void }) {
  const { user, demo } = session
  const companion = user.role === 'companion'
  const [page, setPage] = useState<'measurements' | 'sharing'>('measurements')
  const [date, setDate] = useState(today())
  const [patients, setPatients] = useState<Patient[]>(demo && companion ? [{ id: 'demo-patient', name: 'Marina Oliveira', email: 'marina@example.com' }] : [])
  const [patientId, setPatientId] = useState(demo && companion ? 'demo-patient' : '')
  const [patientLoading, setPatientLoading] = useState(companion && !demo)
  const [patientError, setPatientError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [demoRows, setDemoRows] = useState(sampleMeasurements)
  const [demoGrants, setDemoGrants] = useState<Grant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const formRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!companion || demo) return
    const controller = new AbortController()
    setPatientLoading(true); setPatientError('')
    api<Patient[]>('/patients', { signal: controller.signal }).then(result => {
      setPatients(result); setPatientId(id => result.some(p => p.id === id) ? id : result[0]?.id || '')
    }).catch(e => { if (e.name !== 'AbortError') setPatientError(e.message) }).finally(() => { if (!controller.signal.aborted) setPatientLoading(false) })
    return () => controller.abort()
  }, [companion, demo, refresh])
  useEffect(() => {
    const controller = new AbortController()
    setMeasurements([]); setError(''); setLoading(true)
    if (demo) { setMeasurements(demoRows.filter(m => localDate(new Date(m.measuredAt)) === date).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))); setLoading(false); return }
    if (companion && !patientId) { setLoading(false); return }
    const params = new URLSearchParams({ date, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
    if (companion) params.set('patientId', patientId)
    api<Measurement[]>(`/measurements?${params}`, { signal: controller.signal }).then(setMeasurements).catch(e => { if (e.name !== 'AbortError') setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [date, companion, patientId, demo, demoRows, refresh])
  async function remove(id: string) {
    setDeleting(true)
    try { if (demo) setDemoRows(rows => rows.filter(m => m.id !== id)); else await api(`/measurements/${id}`, { method: 'DELETE' }); setRefresh(r => r + 1); setDeleteId(null); notify({ text: 'Medição excluída.' }) } catch (e) { notify({ text: (e as Error).message, error: true }) } finally { setDeleting(false) }
  }
  function moveDate(amount: number) { const next = new Date(`${date}T12:00`); next.setDate(next.getDate() + amount); setDate(localDate(next)) }
  const average = measurements.length ? Math.round(measurements.reduce((a, m) => a + m.value, 0) / measurements.length) : null
  const patient = patients.find(p => p.id === patientId)
  return <div className="app-shell"><aside className="sidebar"><Logo /><div className="nav-caption">SEU ESPAÇO</div><nav aria-label="Menu principal"><button className={page === 'measurements' ? 'active' : ''} onClick={() => setPage('measurements')}><LayoutDashboard size={19} />{companion ? 'Acompanhamento' : 'Minhas medições'}{page === 'measurements' && <span className="nav-active-dot" />}</button><button className={page === 'sharing' ? 'active' : ''} onClick={() => setPage('sharing')}><Users size={19} />{companion ? 'Meus vínculos' : 'Compartilhamento'}{page === 'sharing' && <span className="nav-active-dot" />}</button></nav><div className="sidebar-bottom"><div className="care-note"><span className="care-note-icon"><HeartHandshake size={23} /></span><strong>Cuidar é estar perto.</strong><p>{companion ? 'Sua presença faz parte dessa rotina.' : 'Compartilhe seu diário com quem cuida de você.'}</p><button onClick={() => setPage('sharing')}>{companion ? 'Conectar um diário' : 'Convidar acompanhante'}<ArrowRight size={15} /></button></div><div className="sidebar-footer"><span className="status-dot" />Seu cuidado, no seu tempo.</div></div></aside><div className="main-shell"><header className="topbar"><span className="breadcrumb">Meu espaço <span>/</span> <strong>{page === 'measurements' ? companion ? 'Acompanhamento' : 'Medições' : companion ? 'Vínculos' : 'Compartilhamento'}</strong></span><div className="account"><div className="account-copy"><strong>{user.name}</strong><span>{companion ? 'Acompanhante' : 'Meu diário'}</span></div><span className="avatar">{user.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span><button className="icon-button logout" title="Sair" aria-label="Sair da conta" onClick={logout}><LogOut size={18} /></button></div></header>
    {demo && <div className="demo-banner"><span><span className="status-dot" />Demonstração · Dados fictícios, mantidos apenas nesta visita.</span><button onClick={logout}>Voltar ao login <ArrowRight size={14} /></button></div>}
    <main className="workspace"><div className="page-heading"><div className="heading-copy"><div className="eyebrow">{page === 'sharing' ? 'CUIDADO COMPARTILHADO' : 'UM REGISTRO DE CADA VEZ'}</div><h1>{page === 'sharing' ? companion ? 'Sua rede de cuidado' : 'Quem cuida com você' : companion ? 'Cuidar também é acompanhar.' : <>Olá, {firstName(user)}<span className="greeting-dot">.</span></>}</h1><p>{page === 'sharing' ? companion ? 'Conecte-se a um diário e acompanhe as medições com autorização.' : 'Você escolhe quem pode acompanhar seu diário de glicemia.' : companion ? 'Acompanhe os registros de quem compartilhou o diário com você.' : 'Cada medição conta. Vamos acompanhar seu dia?'}</p></div>{page === 'measurements' && !companion && <button className="button primary heading-cta" onClick={() => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); formRef.current?.focus({ preventScroll: true }) }}><Plus size={18} />Lançar medição</button>}</div>
    {page === 'sharing' ? <Sharing session={session} patients={patients} demoGrants={demoGrants} onDemoGrants={setDemoGrants} notify={notify} onRedeem={() => { setRefresh(r => r + 1); setPage('measurements') }} /> : <>
      {companion && <div className="patient-selector"><span className="patient-icon"><Users size={20} /></span><div><label htmlFor="patient">Diário acompanhado</label>{patients.length ? <select id="patient" value={patientId} onChange={e => setPatientId(e.target.value)}>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : <strong>{patientLoading ? 'Carregando diários…' : 'Nenhum diário conectado'}</strong>}</div><span className="read-only"><ShieldCheck size={14} />Somente leitura</span></div>}
      {patientError && <div className="inline-error" role="alert">{patientError}<button onClick={() => setRefresh(r => r + 1)}>Tentar novamente</button></div>}
      {companion && !patientLoading && !patientError && !patients.length ? <div className="empty-card"><HeartHandshake size={38} /><h2>O cuidado começa com uma conexão.</h2><p>Peça ao titular que autorize seu e-mail ({user.email}) ou compartilhe um código de convite.</p><button className="button primary" onClick={() => setPage('sharing')}><Link2 size={17} />Conectar um diário</button></div> : <>
      <div className="period-row"><div className="period-title"><span className="calendar-icon"><CalendarDays size={19} /></span><strong>{date === today() ? 'Visão de hoje' : 'Visão do dia'}</strong><span className="period-date">{dayLabel(date)}</span></div><div className="date-controls"><button className="icon-button" aria-label="Atualizar medições" title="Atualizar medições" disabled={loading} onClick={() => setRefresh(r => r + 1)}><RefreshCw size={15} /></button><button className="icon-button" aria-label="Dia anterior" onClick={() => moveDate(-1)}><ChevronLeft size={17} /></button><label className="date-picker"><CalendarDays size={15} /><input aria-label="Selecionar dia" type="date" value={date} max={today()} onChange={e => { if (e.target.value) setDate(e.target.value) }} /></label><button className="icon-button" aria-label="Próximo dia" disabled={date >= today()} onClick={() => moveDate(1)}><ChevronRight size={17} /></button>{date !== today() && <button className="today-button" onClick={() => setDate(today())}>Hoje</button>}</div></div>
      <div className="stats-grid"><div className="stat-card"><span className="stat-icon mint"><Droplet size={20} /></span><div><span className="stat-label">Última medição</span><div className="stat-value">{loading ? '…' : measurements[0]?.value ?? '—'}<small>mg/dL</small></div><span className="stat-foot">{measurements[0] ? `Às ${new Date(measurements[0].measuredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${contexts[measurements[0].context]}` : 'Nenhum registro neste dia'}</span></div></div><div className="stat-card"><span className="stat-icon beige"><ArrowDownLeft size={20} /></span><div><span className="stat-label">Média do dia</span><div className="stat-value">{loading ? '…' : average ?? '—'}<small>mg/dL</small></div><span className="stat-foot">Média dos registros deste dia</span></div></div><div className="stat-card"><span className="stat-icon lilac"><CheckCheck size={20} /></span><div><span className="stat-label">Medições registradas</span><div className="stat-value">{loading ? '…' : String(measurements.length).padStart(2, '0')}<small>{measurements.length === 1 ? 'registro' : 'registros'}</small></div><span className="stat-foot">{date === today() ? 'Seu acompanhamento de hoje' : 'Seu acompanhamento neste dia'}</span></div></div></div>
      <div className={`diary-grid ${companion ? 'companion-grid' : ''}`}><section className="card measurements-card"><div className="card-heading"><div><h2>{companion ? `Medições de ${patient?.name.split(' ')[0] || 'seu acompanhado'}` : 'Seu diário de medições'}</h2><p>{date === today() ? 'Os registros do seu dia, em um só lugar.' : `Registros de ${dayLabel(date)}.`}</p></div><span className="count-badge">{measurements.length}</span></div>
        {loading ? <div className="table-state" role="status"><span className="spinner" />Carregando medições…</div> : error ? <div className="table-state" role="alert"><p>{error}</p><button className="button secondary" onClick={() => setRefresh(r => r + 1)}>Tentar novamente</button></div> : !measurements.length ? <div className="table-state"><span className="empty-droplet"><Droplet size={26} /></span><h3>Um novo dia, um novo registro.</h3><p>{companion ? 'Ainda não há medições registradas neste dia.' : 'Suas medições aparecerão aqui assim que você registrar.'}</p>{!companion && <button className="text-button" onClick={() => formRef.current?.focus()}>Lançar primeira medição <ArrowRight size={15} /></button>}</div> : <div className="table-scroll"><table><thead><tr><th>HORÁRIO</th><th>GLICEMIA</th><th>MOMENTO</th><th>OBSERVAÇÃO</th>{!companion && <th><span className="sr-only">Ações</span></th>}</tr></thead><tbody>{measurements.map(m => <tr key={m.id}><td><span className="time-cell"><Clock3 size={14} />{new Date(m.measuredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></td><td><span className="glucose-value">{m.value}</span><span className="table-unit">mg/dL</span></td><td><span className={`context-badge context-${m.context}`}>{contexts[m.context]}</span></td><td className="notes-cell">{m.notes || <span className="muted">Sem observação</span>}</td>{!companion && <td>{deleteId === m.id ? <span className="delete-confirm"><button disabled={deleting} onClick={() => remove(m.id)}>Excluir?</button><button aria-label="Cancelar exclusão" disabled={deleting} onClick={() => setDeleteId(null)}><X size={14} /></button></span> : <button className="icon-button delete-button" aria-label={`Excluir medição de ${m.value} mg/dL`} onClick={() => setDeleteId(m.id)}><Trash2 size={15} /></button>}</td>}</tr>)}</tbody></table></div>}
        <div className="table-footer"><span><ShieldCheck size={14} />{demo ? 'Exemplo de diário · dados fictícios' : companion ? 'Acesso autorizado pelo titular' : 'Seu diário, compartilhado só com quem você autoriza'}</span></div></section>
      {!companion && <MeasurementForm inputRef={formRef} demo={demo} notify={notify} onSave={m => { if (demo) setDemoRows(rows => [m, ...rows]); setDate(localDate(new Date(m.measuredAt))); setRefresh(r => r + 1) }} />}</div>
      <div className="under-note"><span className="under-note-icon"><HeartHandshake size={19} /></span><p><strong>Pequenos registros, um cuidado mais próximo.</strong> {companion ? 'Os registros ajudam a acompanhar a rotina ao longo do tempo.' : 'Compartilhe seu diário e mantenha sua rede de cuidado por perto.'}</p>{!companion && <button onClick={() => setPage('sharing')}>Gerenciar acessos <ArrowRight size={15} /></button>}</div>
      </>}
    </>}
    <footer className="workspace-footer"><span>DM Monitor <span>·</span> Feito para acompanhar você.</span><span>Registro pessoal de glicemia</span></footer></main></div></div>
}

function MeasurementForm({ inputRef, demo, onSave, notify }: { inputRef: React.RefObject<HTMLInputElement | null>; demo: boolean; onSave: (measurement: Measurement) => void; notify: (toast: Toast) => void }) {
  const [value, setValue] = useState('')
  const [measuredAt, setMeasuredAt] = useState(localDateTime)
  const [context, setContext] = useState('fasting')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('')
    const timestamp = new Date(measuredAt)
    if (!Number.isFinite(timestamp.getTime()) || timestamp > new Date()) { setError('Escolha uma data e um horário que não estejam no futuro.'); return }
    setSaving(true)
    try {
      const body = { value: Number(value), measuredAt: timestamp.toISOString(), context, notes: notes.trim() }
      const measurement = demo ? { ...body, id: crypto.randomUUID() } : await api<Measurement>('/measurements', { method: 'POST', body: JSON.stringify(body) })
      onSave(measurement); setValue(''); setNotes(''); setMeasuredAt(localDateTime()); notify({ text: demo ? 'Medição adicionada à demonstração. Não será salva.' : 'Medição salva no seu diário.' })
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  return <section className="card entry-card"><div className="entry-heading"><span className="entry-icon"><Plus size={21} /></span><div><h2>Lançar medição</h2><p>Como está sua glicemia?</p></div></div><form onSubmit={submit}><label htmlFor="glucose">Glicemia</label><div className="glucose-input"><input ref={inputRef} id="glucose" inputMode="numeric" type="number" placeholder="Ex.: 110" min="1" max="1500" step="1" required value={value} onChange={e => setValue(e.target.value)} /><span>mg/dL</span></div><label htmlFor="measured-at">Data e horário</label><input id="measured-at" type="datetime-local" required min="2000-01-01T00:00" max={localDateTime()} value={measuredAt} onChange={e => setMeasuredAt(e.target.value)} /><label htmlFor="context">Momento da medição</label><select id="context" value={context} onChange={e => setContext(e.target.value)}>{Object.entries(contexts).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label htmlFor="notes">Observação <span>opcional</span></label><textarea id="notes" rows={2} maxLength={1000} placeholder="Algo que queira lembrar…" value={notes} onChange={e => setNotes(e.target.value)} />{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary save-button" disabled={saving}>{saving ? <span className="spinner" /> : <Plus size={17} />}{saving ? 'Salvando…' : 'Salvar medição'}</button><span className="form-footnote"><ShieldCheck size={12} />{demo ? 'Registro temporário de demonstração' : 'Salvo com segurança no seu diário'}</span></form></section>
}

function Sharing({ session, patients, demoGrants, onDemoGrants, notify, onRedeem }: { session: Session; patients: Patient[]; demoGrants: Grant[]; onDemoGrants: (grants: Grant[]) => void; notify: (toast: Toast) => void; onRedeem: () => void }) {
  const { user, demo } = session
  const [grants, setGrants] = useState<Grant[]>(demo ? demoGrants : [])
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(!demo && user.role === 'user')
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  useEffect(() => { if (demo) onDemoGrants(grants) }, [demo, grants, onDemoGrants])
  useEffect(() => {
    if (demo || user.role !== 'user') return
    const controller = new AbortController(); setLoading(true); setError('')
    api<Grant[]>('/access', { signal: controller.signal }).then(setGrants).catch(e => { if (e.name !== 'AbortError') setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [demo, user.role, refresh])
  async function addEmail(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    const normalized = email.trim().toLowerCase()
    if (normalized === user.email || grants.some(g => g.email === normalized)) { setError('Informe outro e-mail que ainda não tenha acesso.'); setBusy(false); return }
    try {
      const grant = demo ? { id: crypto.randomUUID(), email: normalized, createdAt: new Date().toISOString() } : await api<Grant>('/access', { method: 'POST', body: JSON.stringify({ email: normalized }) })
      setGrants(g => [grant, ...g]); setEmail(''); notify({ text: demo ? 'Acesso simulado na demonstração.' : 'E-mail autorizado. A pessoa já pode entrar como acompanhante.' })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function revoke(id: string) {
    setBusy(true); setError('')
    try { if (!demo) await api(`/access/${id}`, { method: 'DELETE' }); setGrants(g => g.filter(item => item.id !== id)); setRevokeId(null); notify({ text: 'Acesso revogado.' }) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function generate() {
    setBusy(true); setError('')
    try { setInvite(demo ? { code: 'DEMO-CUIDADO', expiresAt: new Date(Date.now() + 86400000 * 7).toISOString() } : await api('/invites', { method: 'POST' })) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function redeem(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      if (demo) { setError('Na demonstração, o diário de Marina já está conectado. Use uma conta Google para conectar um diário real.'); return }
      await api('/invites/redeem', { method: 'POST', body: JSON.stringify({ code: code.trim() }) }); notify({ text: 'Diário conectado. Você já pode acompanhar as medições.' }); onRedeem()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="sharing-content">{error && <div className="inline-error" role="alert">{error}<button onClick={() => setRefresh(r => r + 1)}>Atualizar</button></div>}{user.role === 'companion' ? <div className="sharing-grid"><section className="card sharing-card"><span className="feature-icon"><Link2 size={23} /></span><h2>Conectar um diário</h2><p>Recebeu um código? Cole abaixo para vincular o diário à sua conta Google.</p><form onSubmit={redeem}><label htmlFor="redeem-code">Código de convite</label><input id="redeem-code" required maxLength={80} value={code} onChange={e => setCode(e.target.value)} placeholder="Cole o código compartilhado" /><button className="button primary" disabled={busy}><Link2 size={16} />{busy ? 'Conectando…' : 'Conectar diário'}</button></form></section><section className="card sharing-card"><span className="feature-icon"><Users size={23} /></span><h2>Diários conectados</h2><p>Você pode visualizar os registros destas pessoas.</p>{patients.length ? patients.map(p => <div className="grant-row" key={p.id}><span className="avatar">{p.name[0]}</span><div><strong>{p.name}</strong><span>{p.email}</span></div><ShieldCheck size={18} /></div>) : <div className="sharing-empty">Nenhum diário conectado ainda.</div>}<div className="info-note">Seu e-mail de acesso: <strong>{user.email}</strong>. O titular também pode autorizá-lo diretamente.</div></section></div> : <div className="sharing-grid"><section className="card sharing-card"><span className="feature-icon"><Mail size={23} /></span><h2>Autorizar por e-mail</h2><p>Libere o acesso para um familiar, cuidador ou profissional que acompanha você.</p><form onSubmit={addEmail}><label htmlFor="invite-email">E-mail da conta Google</label><input id="invite-email" type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@gmail.com" /><button className="button primary" disabled={busy || loading}><Plus size={16} />{busy ? 'Aguarde…' : 'Autorizar acompanhante'}</button></form><div className="info-note">Depois de autorizado, o acompanhante entra com esse e-mail no perfil “Quero acompanhar”.</div><div className="section-divider" /><h3>E-mails autorizados <span className="count-badge">{grants.length}</span></h3>{loading ? <p role="status">Carregando acessos…</p> : grants.length ? grants.map(g => <div className="grant-row" key={g.id}><span className="grant-avatar"><Mail size={17} /></span><div><strong>{g.email}</strong><span>Acesso de leitura</span></div>{revokeId === g.id ? <span className="delete-confirm"><button disabled={busy} onClick={() => revoke(g.id)}>Revogar?</button><button aria-label="Cancelar revogação" onClick={() => setRevokeId(null)}><X size={15} /></button></span> : <button className="icon-button" disabled={busy} aria-label={`Revogar acesso de ${g.email}`} onClick={() => setRevokeId(g.id)}><Trash2 size={16} /></button>}</div>) : <div className="sharing-empty">Seu diário ainda não tem acompanhantes.</div>}</section><section className="card sharing-card invite-card"><span className="feature-icon"><Link2 size={23} /></span><h2>Compartilhar por código</h2><p>Gere um convite e compartilhe com quem você quer por perto. A pessoa deverá entrar com o Google para usá-lo.</p><div className="invite-preview"><span>CÓDIGO DE CONVITE</span><strong className={invite ? 'generated-code' : ''}>{invite ? invite.code : '•••• — ••••'}</strong>{invite ? <button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(invite.code); notify({ text: 'Código copiado.' }) } catch { notify({ text: 'Não foi possível copiar. Selecione o código e copie manualmente.', error: true }) } }}><Copy size={15} />Copiar código</button> : <span className="invite-placeholder">Seu convite aparecerá aqui.</span>}</div><button className="button primary" disabled={busy} onClick={generate}><Link2 size={16} />{busy ? 'Aguarde…' : invite ? 'Gerar novo código' : 'Gerar código de convite'}</button><div className="info-note"><ShieldCheck size={18} /><span>Válido por 7 dias e para uma pessoa. Gerar outro invalida o anterior.{invite && <> Expira em {new Date(invite.expiresAt).toLocaleDateString('pt-BR')}.</>}</span></div><div className="permission-note"><Check size={16} /><span>Acompanhantes podem apenas visualizar suas medições. Você pode revogar o acesso a qualquer momento.</span></div></section></div>}</div>
}
