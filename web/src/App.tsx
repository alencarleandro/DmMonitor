import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, ArrowRight, CalendarDays, CheckCheck, ChevronDown, Clock3, Copy, Droplet, HeartHandshake, LayoutDashboard, Link2, LogOut, Plus, QrCode, RefreshCw, Share2, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import QRCode from 'qrcode'
import { api, localDate, localDateTime, sampleMeasurements, today } from './api'
import type { Measurement, Patient, User } from './api'
import { GoogleSignIn } from './GoogleSignIn'

type Session = { user: User; demo: boolean }
type Toast = { text: string; error?: boolean }
type GoogleConfig = { googleEnabled: boolean; googleClientId: string; googleMode: 'identity' | 'redirect' | 'disabled' }
const dayLabel = (value: string) => new Date(`${value}T12:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
const firstName = (user: User) => user.name.split(' ')[0]
const shiftDate = (value: string, days: number) => { const date = new Date(`${value}T12:00`); date.setDate(date.getDate() + days); return localDate(date) }

function Logo() { return <div className="brand"><span className="brand-icon"><Droplet size={23} strokeWidth={1.8} /></span><span>DM<span className="brand-light"> Monitor</span><small>SEU DIÁRIO DE GLICEMIA</small></span></div> }
function GoogleIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h5.4a4.6 4.6 0 0 1-2 3v2.8h3.3c1.9-1.8 2.9-4.4 2.9-7.9Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6a6 6 0 0 1-9-3.2H3v2.8A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.8a6 6 0 0 1 0-3.6V7.4H3a10 10 0 0 0 0 9.2l3.4-2.8Z"/><path fill="#EA4335" d="M12 6a5.5 5.5 0 0 1 3.9 1.5L18.8 4A9.8 9.8 0 0 0 3 7.4l3.4 2.8A6 6 0 0 1 12 6Z"/></svg> }

export default function App() {
  const shareToken = new URLSearchParams(location.search).get('share')
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig>({ googleEnabled: false, googleClientId: '', googleMode: 'disabled' })
  const [toast, setToast] = useState<Toast | null>(null)
  useEffect(() => {
    if (shareToken) { setLoading(false); return }
    Promise.all([api<User>('/me').then(user => setSession({ user, demo: false })).catch(() => {}), api<GoogleConfig>('/config').then(setGoogleConfig).catch(() => {})]).finally(() => setLoading(false))
    const expired = () => setSession(null)
    window.addEventListener('session-expired', expired)
    if (new URLSearchParams(location.search).has('auth_error')) {
      setToast({ text: 'Não foi possível entrar com o Google. Tente novamente.', error: true })
      history.replaceState(null, '', import.meta.env.BASE_URL)
    }
    return () => window.removeEventListener('session-expired', expired)
  }, [])
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(null), 5500); return () => clearTimeout(timeout) }, [toast])
  const demo = () => setSession({ demo: true, user: { id: 'demo-user', name: 'Marina Oliveira', email: 'marina@example.com', role: 'user' } })
  async function logout() {
    try { if (!session?.demo) await api('/logout', { method: 'POST' }); setSession(null) } catch (e) { setToast({ text: (e as Error).message, error: true }) }
  }
  if (shareToken) return <SharedDiary token={shareToken} />
  return <>{loading ? <div className="boot"><Logo /><span>Preparando seu diário…</span></div> : session ? <Workspace key={`${session.user.id}-${session.user.role}`} session={session} notify={setToast} logout={logout} /> : <Login googleConfig={googleConfig} onLogin={user => setSession({ user, demo: false })} onDemo={demo} />}
    {toast && <div className={`toast ${toast.error ? 'toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <X size={18} /> : <CheckCheck size={18} />}<span>{toast.text}</span><button className="icon-button" aria-label="Fechar aviso" onClick={() => setToast(null)}><X size={16} /></button></div>}
  </>
}

function Login({ googleConfig, onLogin, onDemo }: { googleConfig: GoogleConfig; onLogin: (user: User) => void; onDemo: () => void }) {
  return <main className="login-page"><section className="login-story"><Logo /><div className="story-main"><div className="eyebrow"><span /> UM CUIDADO, TODOS OS DIAS</div><h1>Seu dia a dia.<br />Seu cuidado.<br /><em>Mais perto.</em></h1><p>Um lugar simples para registrar sua glicemia e compartilhar cada passo com quem cuida de você.</p><div className="story-note"><HeartHandshake size={24} /><span>Para você e sua rede de cuidado.</span></div></div><span className="story-footer">Um registro de cada vez.</span></section><section className="login-form-section"><div className="login-form"><span className="small-kicker">BEM-VINDO AO DM MONITOR</span><h2>Vamos cuidar do seu dia?</h2><p>Entre para acessar seu diário de glicemia.</p>
    {googleConfig.googleMode === 'identity' ? <GoogleSignIn clientId={googleConfig.googleClientId} role="user" onLogin={onLogin} /> : googleConfig.googleEnabled ? <a className="button google-button login-primary" href={`${import.meta.env.BASE_URL}auth/google?role=user`}><GoogleIcon />Continuar com o Google<ArrowRight size={17} /></a> : <><button className="button google-button login-primary" disabled><GoogleIcon />Continuar com o Google</button><p className="setup-note">O login ficará disponível após a configuração do Google no servidor.</p></>}
    <p className="account-hint">Sua conta dá acesso ao seu diário e ao compartilhamento por QR Code.</p><div className="login-divider"><span>conheça primeiro</span></div><button className="demo-button" onClick={onDemo}>Explorar demonstração <ArrowRight size={17} /></button><p className="demo-hint">Dados fictícios. Nenhuma informação é salva.</p><div className="privacy-note"><ShieldCheck size={18} /><span>Quem receber seu link terá acesso somente para visualização.</span></div></div><span className="login-bottom">Feito para simplificar sua rotina.</span></section></main>
}

type ChartMode = 'day' | 'period'

function GlucoseChart({ measurements, from, to, loading }: { measurements: Measurement[]; from: string; to: string; loading: boolean }) {
  const rows = [...measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  if (loading) return <div className="chart-state" role="status"><span className="spinner" />Carregando curva glicêmica…</div>
  if (!rows.length) return <div className="chart-state"><span className="empty-droplet"><Activity size={25} /></span><strong>Sem pontos para desenhar</strong><span>As medições do intervalo aparecerão aqui.</span></div>
  const width = 1000, height = 270, left = 58, right = 22, top = 22, bottom = 38
  const yMin = 0
  const yMax = 600
  const start = new Date(`${from}T00:00`).getTime()
  const end = new Date(`${shiftDate(to, 1)}T00:00`).getTime()
  const points = rows.map(row => ({
    x: left + ((new Date(row.measuredAt).getTime() - start) / Math.max(1, end - start)) * (width - left - right),
    y: top + ((yMax - Math.min(yMax, Math.max(yMin, row.value))) / (yMax - yMin)) * (height - top - bottom),
    row,
  }))
  const path = points.reduce((result, point, index) => {
    if (!index) return `M ${point.x} ${point.y}`
    const previous = points[index - 1]
    const middle = (previous.x + point.x) / 2
    return `${result} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`
  }, '')
  const isDay = from === to
  const startLabel = new Date(`${from}T12:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  const endLabel = new Date(`${to}T12:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  return <div className="chart-wrap"><svg className="glucose-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Curva glicêmica com ${rows.length} medições`}>
    {[0, 1, 2, 3, 4].map(step => { const y = top + step * (height - top - bottom) / 4; const value = yMax - step * 150; return <g key={step}><line x1={left} y1={y} x2={width - right} y2={y} className="chart-grid-line" /><text x={left - 12} y={y + 4} textAnchor="end" className="chart-axis-label">{value}</text></g> })}
    {isDay && Array.from({ length: 25 }, (_, hour) => { const x = left + hour * (width - left - right) / 24; return <g key={`hour-${hour}`}><line x1={x} y1={top} x2={x} y2={height - bottom} stroke="#eef1eb" strokeWidth="1" /><text x={x} y={height - 8} textAnchor={hour === 0 ? 'start' : hour === 24 ? 'end' : 'middle'} className="chart-axis-label">{hour}h</text></g> })}
    <path d={path} className="chart-line" />
    {points.map(point => { const showing = hoveredId === point.row.id; const popupWidth = 164; const popupX = Math.min(width - right - popupWidth, Math.max(left, point.x + 12)); const popupY = Math.max(top, point.y - 62); const dateTime = new Date(point.row.measuredAt); return <g key={point.row.id} onMouseEnter={() => setHoveredId(point.row.id)} onMouseLeave={() => setHoveredId(null)} onFocus={() => setHoveredId(point.row.id)} onBlur={() => setHoveredId(null)}><circle cx={point.x} cy={point.y} r="5" className="chart-point" tabIndex={0} aria-label={`${point.row.value} mg/dL em ${dateTime.toLocaleString('pt-BR')}`} style={{ fill: '#6e9160', stroke: '#fff', strokeWidth: 2, cursor: 'help' }} />{showing && <g pointerEvents="none"><rect x={popupX} y={popupY} width={popupWidth} height="52" rx="7" fill="#203f31" /><text x={popupX + 11} y={popupY + 20} fill="#ffffff" fontSize="11" fontWeight="600">{point.row.value} mg/dL</text><text x={popupX + 11} y={popupY + 38} fill="#dce8d4" fontSize="10">{dateTime.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</text></g>}</g> })}
    {!isDay && <><text x={left} y={height - 8} className="chart-axis-label">{startLabel}</text><text x={width - right} y={height - 8} textAnchor="end" className="chart-axis-label">{endLabel}</text></>}
  </svg></div>
}

function SharedDiary({ token }: { token: string }) {
  const [chartMode, setChartMode] = useState<ChartMode>('period')
  const [date, setDate] = useState(today())
  const [periodStart, setPeriodStart] = useState(() => shiftDate(today(), -29))
  const [periodEnd, setPeriodEnd] = useState(today())
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [ownerName, setOwnerName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({})
  const from = chartMode === 'day' ? date : periodStart
  const to = chartMode === 'day' ? date : periodEnd
  useEffect(() => {
    if (token === 'demo-public-view') { setOwnerName('Marina Oliveira'); setMeasurements(sampleMeasurements()); setLoading(false); return }
    const controller = new AbortController()
    const params = new URLSearchParams({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
    if (chartMode === 'day') params.set('date', date)
    else { params.set('from', periodStart); params.set('to', periodEnd) }
    setLoading(true); setError('')
    api<{ ownerName: string; measurements: Measurement[] }>(`/shared/${encodeURIComponent(token)}/measurements?${params}`, { signal: controller.signal }).then(result => { setOwnerName(result.ownerName); setMeasurements(result.measurements) }).catch(e => { if (e.name !== 'AbortError') setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, chartMode, date, periodStart, periodEnd])
  const groups = measurements.reduce<Array<{ date: string; rows: Measurement[] }>>((result, measurement) => { const key = localDate(new Date(measurement.measuredAt)); const group = result.find(item => item.date === key); if (group) group.rows.push(measurement); else result.push({ date: key, rows: [measurement] }); return result }, [])
  if (error) return <main className="shared-error"><Logo /><div className="empty-card"><Link2 size={34} /><h2>Este link não está disponível.</h2><p>{error}</p></div></main>
  return <main className="public-diary"><header className="public-heading"><Logo /><div><span className="read-only"><ShieldCheck size={14} />Somente visualização</span><h1>{ownerName ? `Diário de ${ownerName.split(' ')[0]}` : 'Diário compartilhado'}</h1><p>Curva glicêmica e histórico de medições.</p></div></header><section className="card curve-card"><div className="curve-heading"><div><span className="feature-icon curve-icon"><Activity size={21} /></span><div><h2>Curva glicêmica</h2><p>{chartMode === 'day' ? dayLabel(date) : `${dayLabel(periodStart)} — ${dayLabel(periodEnd)}`}</p></div></div><div className="view-switch"><button className={chartMode === 'day' ? 'active' : ''} onClick={() => setChartMode('day')}>Dia</button><button className={chartMode === 'period' ? 'active' : ''} onClick={() => setChartMode('period')}>Período</button></div></div><div className="chart-filters">{chartMode === 'day' ? <label><span>Dia</span><span className="date-picker"><CalendarDays size={15} /><input aria-label="Selecionar dia" type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} /></span></label> : <><label><span>De</span><span className="date-picker"><CalendarDays size={15} /><input aria-label="Início do período" type="date" value={periodStart} max={periodEnd} onChange={e => setPeriodStart(e.target.value)} /></span></label><label><span>Até</span><span className="date-picker"><CalendarDays size={15} /><input aria-label="Fim do período" type="date" value={periodEnd} min={periodStart} max={today()} onChange={e => setPeriodEnd(e.target.value)} /></span></label></>}</div><GlucoseChart measurements={measurements} from={from} to={to} loading={loading} /></section><section className="card measurements-card"><div className="card-heading"><div><h2>Histórico de medições</h2><p>Dias com registros e suas respectivas medições.</p></div><span className="count-badge">{measurements.length}</span></div>{loading ? <div className="table-state"><span className="spinner" />Carregando medições…</div> : !groups.length ? <div className="table-state"><Droplet size={28} /><p>Nenhuma medição neste intervalo.</p></div> : <div className="day-groups">{groups.map((group, index) => { const expanded = openDays[group.date] ?? index === 0; return <section className={`day-group ${expanded ? 'expanded' : ''}`} key={group.date}><button className="day-item" aria-expanded={expanded} onClick={() => setOpenDays(days => ({ ...days, [group.date]: !expanded }))}><span className="day-item-icon"><CalendarDays size={18} /></span><span><strong>{dayLabel(group.date)}</strong><small>{group.rows.length} {group.rows.length === 1 ? 'medição' : 'medições'}</small></span><ChevronDown size={18} /></button>{expanded && <div className="day-subitems"><div className="subitem-head public-columns"><span>Horário</span><span>Glicemia</span></div>{group.rows.map(measurement => <div className="measurement-subitem public-columns" key={measurement.id}><span className="time-cell"><Clock3 size={14} />{new Date(measurement.measuredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><span><strong className="glucose-value">{measurement.value}</strong><small className="table-unit">mg/dL</small></span></div>)}</div>}</section> })}</div>}<div className="table-footer"><span><ShieldCheck size={14} />Acesso público somente para visualização</span></div></section></main>
}

function Workspace({ session, notify, logout }: { session: Session; notify: (toast: Toast) => void; logout: () => void }) {
  const { user, demo } = session
  const companion = user.role === 'companion'
  const [page, setPage] = useState<'measurements' | 'sharing'>('measurements')
  const [date, setDate] = useState(today())
  const [chartMode, setChartMode] = useState<ChartMode>('day')
  const [periodStart, setPeriodStart] = useState(() => shiftDate(today(), -29))
  const [periodEnd, setPeriodEnd] = useState(today())
  const [firstMeasurementDate, setFirstMeasurementDate] = useState('')
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({})
  const [patients, setPatients] = useState<Patient[]>(demo && companion ? [{ id: 'demo-patient', name: 'Marina Oliveira', email: 'marina@example.com' }] : [])
  const [patientId, setPatientId] = useState(demo && companion ? 'demo-patient' : '')
  const [patientLoading, setPatientLoading] = useState(companion && !demo)
  const [patientError, setPatientError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [demoRows, setDemoRows] = useState(sampleMeasurements)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [measurementDialog, setMeasurementDialog] = useState(false)
  const rangeFrom = chartMode === 'day' ? date : periodStart
  const rangeTo = chartMode === 'day' ? date : periodEnd
  useEffect(() => {
    if (demo) { const rows = demoRows.map(row => localDate(new Date(row.measuredAt))).sort(); setFirstMeasurementDate(rows[0] || ''); return }
    api<{ date: string }>(`/measurements/first-date?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`).then(result => setFirstMeasurementDate(result.date)).catch(() => setFirstMeasurementDate(''))
  }, [demo, demoRows, refresh])
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
    if (demo) { setMeasurements(demoRows.filter(m => { const measuredDate = localDate(new Date(m.measuredAt)); return measuredDate >= rangeFrom && measuredDate <= rangeTo }).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))); setLoading(false); return }
    if (companion && !patientId) { setLoading(false); return }
    const params = new URLSearchParams({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
    if (chartMode === 'day') params.set('date', date)
    else { params.set('from', periodStart); params.set('to', periodEnd) }
    if (companion) params.set('patientId', patientId)
    api<Measurement[]>(`/measurements?${params}`, { signal: controller.signal }).then(setMeasurements).catch(e => { if (e.name !== 'AbortError') setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [date, periodStart, periodEnd, chartMode, rangeFrom, rangeTo, companion, patientId, demo, demoRows, refresh])
  async function remove(id: string) {
    setDeleting(true)
    try { if (demo) setDemoRows(rows => rows.filter(m => m.id !== id)); else await api(`/measurements/${id}`, { method: 'DELETE' }); setRefresh(r => r + 1); setDeleteId(null); notify({ text: 'Medição excluída.' }) } catch (e) { notify({ text: (e as Error).message, error: true }) } finally { setDeleting(false) }
  }
  const patient = patients.find(p => p.id === patientId)
  const groupedDays = measurements.reduce<Array<{ date: string; rows: Measurement[] }>>((groups, measurement) => {
    const measurementDate = localDate(new Date(measurement.measuredAt))
    const group = groups.find(item => item.date === measurementDate)
    if (group) group.rows.push(measurement)
    else groups.push({ date: measurementDate, rows: [measurement] })
    return groups
  }, [])
  const measurementToDelete = measurements.find(measurement => measurement.id === deleteId)
  return <div className="app-shell"><aside className="sidebar"><Logo /><div className="nav-caption">SEU ESPAÇO</div><nav aria-label="Menu principal"><button className={page === 'measurements' ? 'active' : ''} onClick={() => setPage('measurements')}><LayoutDashboard size={19} />{companion ? 'Acompanhamento' : 'Minhas medições'}{page === 'measurements' && <span className="nav-active-dot" />}</button><button className={page === 'sharing' ? 'active' : ''} onClick={() => setPage('sharing')}><Users size={19} />{companion ? 'Meus vínculos' : 'Compartilhamento'}{page === 'sharing' && <span className="nav-active-dot" />}</button></nav><div className="sidebar-bottom"><div className="care-note"><span className="care-note-icon"><HeartHandshake size={23} /></span><strong>Cuidar é estar perto.</strong><p>{companion ? 'Sua presença faz parte dessa rotina.' : 'Compartilhe seu diário com quem cuida de você.'}</p><button onClick={() => setPage('sharing')}>{companion ? 'Conectar um diário' : 'Convidar acompanhante'}<ArrowRight size={15} /></button></div><button className="sidebar-logout" title="Sair" onClick={logout}><LogOut size={17} />Sair</button><div className="sidebar-footer"><span className="status-dot" />Seu cuidado, no seu tempo.</div></div></aside><div className="main-shell"><header className="topbar"><span className="breadcrumb">Meu espaço <span>/</span> <strong>{page === 'measurements' ? companion ? 'Acompanhamento' : 'Medições' : companion ? 'Vínculos' : 'Compartilhamento'}</strong></span><div className="account"><div className="account-copy"><strong>{user.name}</strong><span>{companion ? 'Acompanhante' : 'Meu diário'}</span></div><span className="avatar">{user.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span><button className="icon-button logout mobile-logout" title="Sair" aria-label="Sair da conta" onClick={logout}><LogOut size={18} /></button></div></header>
    {demo && <div className="demo-banner"><span><span className="status-dot" />Demonstração · Dados fictícios, mantidos apenas nesta visita.</span><button onClick={logout}>Voltar ao login <ArrowRight size={14} /></button></div>}
    <main className="workspace"><div className="watch-actions"><button className="watch-action primary" onClick={() => setMeasurementDialog(true)}><Droplet size={24} /><span>Lançar<small>medição</small></span></button><button className={`watch-action ${page === 'sharing' ? 'active' : ''}`} onClick={() => setPage(page === 'sharing' ? 'measurements' : 'sharing')}><QrCode size={24} /><span>{page === 'sharing' ? 'Voltar' : 'Mostrar'}<small>{page === 'sharing' ? 'ao diário' : 'QR Code'}</small></span></button></div><div className="page-heading"><div className="heading-copy"><div className="eyebrow">{page === 'sharing' ? 'CUIDADO COMPARTILHADO' : 'UM REGISTRO DE CADA VEZ'}</div><h1>{page === 'sharing' ? companion ? 'Sua rede de cuidado' : 'Compartilhe seu diário' : companion ? 'Cuidar também é acompanhar.' : <>Olá, {firstName(user)}<span className="greeting-dot">.</span></>}</h1><p>{page === 'sharing' ? 'Mostre o QR Code ou envie o link para compartilhar uma visualização somente leitura.' : companion ? 'Acompanhe os registros de quem compartilhou o diário com você.' : 'Cada medição conta. Vamos acompanhar seu dia?'}</p></div>{page === 'measurements' && !companion && <button className="button primary heading-cta" onClick={() => setMeasurementDialog(true)}><Plus size={18} />Lançar medição</button>}</div>
    {page === 'sharing' ? <Sharing session={session} notify={notify} /> : <>
      {companion && <div className="patient-selector"><span className="patient-icon"><Users size={20} /></span><div><label htmlFor="patient">Diário acompanhado</label>{patients.length ? <select id="patient" value={patientId} onChange={e => setPatientId(e.target.value)}>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : <strong>{patientLoading ? 'Carregando diários…' : 'Nenhum diário conectado'}</strong>}</div><span className="read-only"><ShieldCheck size={14} />Somente leitura</span></div>}
      {patientError && <div className="inline-error" role="alert">{patientError}<button onClick={() => setRefresh(r => r + 1)}>Tentar novamente</button></div>}
      {companion && !patientLoading && !patientError && !patients.length ? <div className="empty-card"><HeartHandshake size={38} /><h2>O cuidado começa com uma conexão.</h2><p>Peça ao titular que autorize seu e-mail ({user.email}) ou compartilhe um código de convite.</p><button className="button primary" onClick={() => setPage('sharing')}><Link2 size={17} />Conectar um diário</button></div> : <>
      <section className="card curve-card"><div className="curve-heading"><div><span className="feature-icon curve-icon"><Activity size={21} /></span><div><h2>Curva glicêmica</h2><p>{chartMode === 'day' ? dayLabel(date) : `${dayLabel(periodStart)} — ${dayLabel(periodEnd)}`}</p></div></div><div className="curve-actions"><div className="view-switch" aria-label="Modo do gráfico"><button className={chartMode === 'day' ? 'active' : ''} onClick={() => setChartMode('day')}>Dia</button><button className={chartMode === 'period' ? 'active' : ''} onClick={() => setChartMode('period')}>Período</button></div><button className="icon-button" aria-label="Atualizar medições" title="Atualizar medições" disabled={loading} onClick={() => setRefresh(r => r + 1)}><RefreshCw size={15} /></button></div></div>
        <div className="chart-filters">{chartMode === 'day' ? <label><span>Dia</span><span className="date-picker"><CalendarDays size={15} /><input aria-label="Selecionar dia" type="date" value={date} min={firstMeasurementDate || undefined} max={today()} onChange={e => { if (e.target.value) setDate(e.target.value) }} /></span></label> : <><label><span>De</span><span className="date-picker"><CalendarDays size={15} /><input aria-label="Início do período" type="date" value={periodStart} min={firstMeasurementDate || undefined} max={periodEnd} onChange={e => { if (e.target.value) setPeriodStart(e.target.value) }} /></span></label><label><span>Até</span><span className="date-picker"><CalendarDays size={15} /><input aria-label="Fim do período" type="date" value={periodEnd} min={periodStart} max={today()} onChange={e => { if (e.target.value) setPeriodEnd(e.target.value) }} /></span></label></>}</div>
        <GlucoseChart measurements={measurements} from={rangeFrom} to={rangeTo} loading={loading} />
      </section>
      <div className={`diary-grid ${companion ? 'companion-grid' : ''}`}><section className="card measurements-card"><div className="card-heading"><div><h2>{companion ? `Medições de ${patient?.name.split(' ')[0] || 'seu acompanhado'}` : 'Histórico de medições'}</h2><p>Dias com registros e suas respectivas medições.</p></div><span className="count-badge">{measurements.length}</span></div>
        {loading ? <div className="table-state" role="status"><span className="spinner" />Carregando medições…</div> : error ? <div className="table-state" role="alert"><p>{error}</p><button className="button secondary" onClick={() => setRefresh(r => r + 1)}>Tentar novamente</button></div> : !measurements.length ? <div className="table-state"><span className="empty-droplet"><Droplet size={26} /></span><h3>Nenhuma medição neste intervalo.</h3><p>{companion ? 'Ainda não há medições registradas neste período.' : 'Registre uma medição ou escolha outro intervalo.'}</p>{!companion && <button className="text-button" onClick={() => setMeasurementDialog(true)}>Lançar primeira medição <ArrowRight size={15} /></button>}</div> : <div className="day-groups">{groupedDays.map((group, index) => { const expanded = openDays[group.date] ?? index === 0; return <section className={`day-group ${expanded ? 'expanded' : ''}`} key={group.date}><button className="day-item" aria-expanded={expanded} onClick={() => setOpenDays(days => ({ ...days, [group.date]: !expanded }))}><span className="day-item-icon"><CalendarDays size={18} /></span><span><strong>{dayLabel(group.date)}</strong><small>{group.rows.length} {group.rows.length === 1 ? 'medição' : 'medições'}</small></span><ChevronDown size={18} /></button>{expanded && <div className="day-subitems"><div className="subitem-head"><span>Horário</span><span>Glicemia</span><span><span className="sr-only">Ações</span></span></div>{group.rows.map(m => <div className="measurement-subitem" key={m.id}><span className="time-cell"><Clock3 size={14} />{new Date(m.measuredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><span><strong className="glucose-value">{m.value}</strong><small className="table-unit">mg/dL</small></span>{!companion && <span className="actions-cell">{deleteId === m.id ? <span className="delete-confirm"><button disabled={deleting} onClick={() => remove(m.id)}>Excluir?</button><button aria-label="Cancelar exclusão" disabled={deleting} onClick={() => setDeleteId(null)}><X size={14} /></button></span> : <button className="icon-button delete-button" aria-label={`Excluir medição de ${m.value} mg/dL`} onClick={() => setDeleteId(m.id)}><Trash2 size={15} /></button>}</span>}</div>)}</div>}</section>})}</div>}
        <div className="table-footer"><span><ShieldCheck size={14} />{demo ? 'Exemplo de diário · dados fictícios' : companion ? 'Acesso autorizado pelo titular' : 'Seu diário, compartilhado só com quem você autoriza'}</span></div></section>
      </div>
      <div className="under-note"><span className="under-note-icon"><HeartHandshake size={19} /></span><p><strong>Pequenos registros, um cuidado mais próximo.</strong> {companion ? 'Os registros ajudam a acompanhar a rotina ao longo do tempo.' : 'Compartilhe seu diário e mantenha sua rede de cuidado por perto.'}</p>{!companion && <button onClick={() => setPage('sharing')}>Gerenciar acessos <ArrowRight size={15} /></button>}</div>
      </>}
    </>}
    <footer className="workspace-footer"><span>DM Monitor <span>·</span> Feito para acompanhar você.</span><span>Registro pessoal de glicemia</span></footer></main>{measurementDialog && <MeasurementDialog demo={demo} onClose={() => setMeasurementDialog(false)} notify={notify} onSave={m => { if (demo) setDemoRows(rows => [m, ...rows]); setDate(localDate(new Date(m.measuredAt))); setRefresh(r => r + 1); setMeasurementDialog(false) }} />}{measurementToDelete && <DeleteMeasurementDialog measurement={measurementToDelete} deleting={deleting} onCancel={() => setDeleteId(null)} onConfirm={() => remove(measurementToDelete.id)} />}</div></div>
}

function DeleteMeasurementDialog({ measurement, deleting, onCancel, onConfirm }: { measurement: Measurement; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !deleting) onCancel() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [deleting, onCancel])
  const measuredAt = new Date(measurement.measuredAt)
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !deleting) onCancel() }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description"><button className="icon-button dialog-close" aria-label="Fechar" disabled={deleting} onClick={onCancel}><X size={18} /></button><span className="danger-icon"><Trash2 size={22} /></span><h2 id="delete-title">Excluir esta medição?</h2><p id="delete-description">Essa ação removerá permanentemente o registro do seu diário.</p><div className="delete-summary"><span><small>Glicemia</small><strong>{measurement.value} <small>mg/dL</small></strong></span><span><small>Data e hora</small><strong>{measuredAt.toLocaleDateString('pt-BR')} · {measuredAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></span></div><div className="confirm-actions"><button className="button secondary" disabled={deleting} onClick={onCancel}>Cancelar</button><button className="button danger-button" disabled={deleting} onClick={onConfirm}>{deleting ? <span className="spinner" /> : <Trash2 size={16} />}{deleting ? 'Excluindo…' : 'Excluir medição'}</button></div></section></div>
}

function MeasurementDialog({ demo, onClose, onSave, notify }: { demo: boolean; onClose: () => void; onSave: (measurement: Measurement) => void; notify: (toast: Toast) => void }) {
  const [value, setValue] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [measuredAt, setMeasuredAt] = useState(localDateTime)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose, saving])
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('')
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1500) { setError('Informe um valor inteiro entre 1 e 1500 mg/dL.'); return }
    setSaving(true)
    try {
      const selectedTime = advanced ? new Date(measuredAt).toISOString() : new Date().toISOString()
      const body: { value: number; measuredAt?: string } = { value: Number(value) }
      if (advanced) body.measuredAt = selectedTime
      const measurement = demo ? { ...body, id: crypto.randomUUID(), measuredAt: selectedTime, context: 'other', notes: '' } : await api<Measurement>('/measurements', { method: 'POST', body: JSON.stringify(body) })
      onSave(measurement); notify({ text: demo ? 'Medição adicionada à demonstração. Não será salva.' : 'Medição salva no seu diário.' })
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}><section className="measurement-dialog" role="dialog" aria-modal="true" aria-labelledby="measurement-title"><button className="icon-button dialog-close" aria-label="Fechar" disabled={saving} onClick={onClose}><X size={18} /></button><span className="entry-icon"><Droplet size={22} /></span><h2 id="measurement-title">Lançar medição</h2><p>Digite o valor exibido no seu medidor.</p><form onSubmit={submit}><label htmlFor="glucose">Glicemia</label><div className="glucose-input"><input autoFocus id="glucose" inputMode="numeric" type="number" placeholder="Ex.: 110" min="1" max="1500" step="1" required value={value} onChange={e => setValue(e.target.value)} /><span>mg/dL</span></div><button className={`advanced-toggle ${advanced ? 'open' : ''}`} type="button" aria-expanded={advanced} onClick={() => setAdvanced(open => !open)}><span><strong>Avançado</strong><small>Alterar data e hora</small></span><ChevronDown size={17} /></button>{advanced && <div className="advanced-fields"><label htmlFor="measured-at">Data e hora da medição</label><input id="measured-at" type="datetime-local" required value={measuredAt} max={localDateTime()} onChange={e => setMeasuredAt(e.target.value)} /></div>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary save-button" disabled={saving}>{saving ? <span className="spinner" /> : <Plus size={17} />}{saving ? 'Salvando…' : 'Salvar medição'}</button></form><span className="form-footnote"><Clock3 size={12} />{advanced ? 'A medição será registrada na data escolhida' : 'O horário atual será registrado automaticamente'}</span></section></div>
}

function Sharing({ session, notify }: { session: Session; notify: (toast: Toast) => void }) {
  const [token, setToken] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const shareUrl = token ? `https://arsenal.dev.br/dm-monitor/?share=${encodeURIComponent(token)}` : ''
  useEffect(() => {
    let active = true
    const load = async () => {
      try { const result = session.demo ? { token: 'demo-public-view' } : await api<{ token: string }>('/share-link'); if (active) setToken(result.token) }
      catch (e) { if (active) setError((e as Error).message) }
      finally { if (active) setBusy(false) }
    }
    load()
    return () => { active = false }
  }, [session.demo])
  useEffect(() => { if (!shareUrl) return; QRCode.toDataURL(shareUrl, { width: 320, margin: 1, color: { dark: '#203f31', light: '#ffffff' } }).then(setQrCode).catch(() => setError('Não foi possível gerar o QR Code.')) }, [shareUrl])
  async function copyLink() { try { await navigator.clipboard.writeText(shareUrl); notify({ text: 'Link de compartilhamento copiado.' }) } catch { notify({ text: 'Não foi possível copiar o link.', error: true }) } }
  async function sendLink() { if (navigator.share) { try { await navigator.share({ title: `Diário de ${session.user.name}`, text: 'Acompanhe minhas medições de glicemia.', url: shareUrl }) } catch { /* sharing cancelled */ } } else await copyLink() }
  async function rotate() { setBusy(true); setError(''); try { const result = session.demo ? { token: 'demo-public-view' } : await api<{ token: string }>('/share-link', { method: 'POST' }); setToken(result.token); notify({ text: 'Novo link criado. O anterior deixou de funcionar.' }) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <div className="sharing-content"><section className="card qr-share-card"><span className="feature-icon"><QrCode size={24} /></span><h2>Compartilhe seu diário</h2><p>Quem abrir este link verá somente seu gráfico e seu histórico de medições. Não é necessário fazer login.</p>{error ? <div className="inline-error" role="alert">{error}</div> : busy || !qrCode ? <div className="qr-loading"><span className="spinner" />Preparando QR Code…</div> : <><div className="qr-frame"><img src={qrCode} alt="QR Code do link de visualização do diário" /></div><div className="share-actions"><button className="button primary" onClick={sendLink}><Share2 size={17} />Enviar</button><button className="button secondary" onClick={copyLink}><Copy size={17} />Copiar link de compartilhamento</button></div><button className="rotate-link" disabled={busy} onClick={rotate}>Gerar um novo link e invalidar o anterior</button></>}<div className="permission-note"><ShieldCheck size={18} /><span>O acesso é somente leitura. Compartilhe o QR Code apenas com pessoas de confiança.</span></div></section></div>
}
