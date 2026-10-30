import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3, Building2, TrendingUp, TrendingDown, Users, UserX, RefreshCw, ArrowUpRight, ArrowDownRight,
  Minus, ShieldCheck, FileSignature, GitCompare, MapPin, Layers, Briefcase, Send, Activity,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar,
  PieChart, Pie, Cell, LineChart, Line, ComposedChart, RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import { Sidebar } from './Sidebar';
import { LoadingSpinner } from './LoadingSkeleton';
import type { CurrentUser } from '../types/auth';
import { API } from '../api';
import './Dashboard.css';
import './Analytics.css';

interface SectorPoint { completed: number; inProgress: number; pending: number; total: number; percent: number }
interface TimelinePoint {
  period: string; iso: string; active: number; entries: number; exits: number; net: number; employees: number;
  regimes: Record<string, number>; sectors: Record<string, SectorPoint>;
}
interface NamedValue { name: string; value: number }
interface Workload { name: string; total: number; FISCAL: number; DP: number; CONTABIL: number; CUSHMAN: number; GERAL: number; isFormer?: boolean; }
interface AnalyticsData {
  generatedAt: string; referencePeriod: string; months: number;
  kpis: {
    active: number; activePrev: number; activeFirst: number; activeYearAgo: number; entriesPeriod: number; exitsPeriod: number;
    employees: number; employeesPrev: number; withoutResponsible: number; totalRegistered: number; inactiveTotal: number;
    activeTeamMembers?: number; formerTeamMembers?: number;
  };
  timeline: TimelinePoint[];
  distribution: { regimes: NamedValue[]; companyTypes: NamedValue[]; cities: NamedValue[]; groups: NamedValue[]; delivery: NamedValue[]; sectors: NamedValue[] };
  workload: Workload[];
  certificates: { with: number; without: number; expired: number; thisMonth: number; next90: number; valid: number; invalidDate: number; types: NamedValue[]; expirations: { period: string; value: number }[] };
  proxies: { with: number; without: number; expired: number; next30: number; valid: number };
  installments: { status: string; count: number; amount: number }[];
}
interface SectorProgress { type: string; total: number; completed: number; inProgress: number; percent: number; totalFields?: number; completedFields?: number }

const REGIME_LABEL: Record<string, string> = {
  MEI: 'MEI', SIMPLES_NACIONAL: 'Simples Nacional', LUCRO_PRESUMIDO: 'Lucro Presumido', LUCRO_REAL_TRIMESTRAL: 'Real Trimestral',
  LUCRO_REAL_ESTIMATIVA: 'Real Estimativa', LUCRO_REAL_ANUAL: 'Real Anual', IMUNE_IRPJ: 'Imune IRPJ', CONDOMINIOS: 'Condomínios',
  DOMESTICA: 'Doméstica', ASSOCIACOES: 'Associações', PESSOA_FISICA: 'Pessoa Física',
};
const REGIME_COLOR: Record<string, string> = {
  MEI: '#38bdf8', SIMPLES_NACIONAL: '#10b981', LUCRO_PRESUMIDO: '#8b5cf6', LUCRO_REAL_TRIMESTRAL: '#f59e0b',
  LUCRO_REAL_ESTIMATIVA: '#f97316', LUCRO_REAL_ANUAL: '#ef4444', IMUNE_IRPJ: '#14b8a6', CONDOMINIOS: '#d90f81',
  DOMESTICA: '#eab308', ASSOCIACOES: '#6366f1', PESSOA_FISICA: '#94a3b8',
};
const SECTOR_META: Record<string, { label: string; color: string }> = {
  FISCAL: { label: 'Fiscal', color: '#10b981' }, DP: { label: 'DP', color: '#3b82f6' }, CONTABIL: { label: 'Contábil', color: '#8b5cf6' },
  CUSHMAN: { label: 'Cushman', color: '#ef4444' }, PARCELAMENTO: { label: 'Parcelamento', color: '#f59e0b' }, GERAL: { label: 'Geral', color: '#94a3b8' },
};
const PALETTE = ['#d90f81', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#eab308', '#6366f1', '#f97316', '#94a3b8'];
const nf = new Intl.NumberFormat('pt-BR');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const TOOLTIP_STYLE = {
  contentStyle: { background: 'rgba(15,15,18,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.5)', color: '#fff' },
  labelStyle: { color: '#fff', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: '#e5e5e5' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
};
const AXIS = { stroke: 'rgba(255,255,255,0.35)', fontSize: 12, tickLine: false, axisLine: false } as const;

function Delta({ current, previous, suffix = '' }: { current: number; previous: number; suffix?: string }) {
  const diff = current - previous;
  const pct = previous ? (diff / previous) * 100 : 0;
  const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`an-delta ${cls}`}>
      <Icon size={14} />
      {diff > 0 ? '+' : ''}{nf.format(diff)}{suffix}
      {previous ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''}
    </span>
  );
}

function Panel({ title, subtitle, icon: Icon, children, className = '', actions }: { title: string; subtitle?: string; icon: any; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`an-panel ${className}`}>
      <header className="an-panel__head">
        <div className="an-panel__title">
          <span className="an-panel__icon"><Icon size={18} /></span>
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        </div>
        {actions}
      </header>
      <div className="an-panel__body">{children}</div>
    </section>
  );
}

function Donut({ data, colors, centerLabel, centerValue }: { data: NamedValue[]; colors: string[]; centerLabel: string; centerValue: string | number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="an-donut">
      <div className="an-donut__chart">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none" isAnimationActive>
              {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [`${nf.format(v)} (${total ? ((v / total) * 100).toFixed(1) : 0}%)`, '']} />
          </PieChart>
        </ResponsiveContainer>
        <div className="an-donut__center"><strong>{centerValue}</strong><span>{centerLabel}</span></div>
      </div>
      <ul className="an-legend">
        {data.map((d, i) => (
          <li key={d.name}>
            <span className="an-legend__dot" style={{ background: colors[i % colors.length] }} />
            <span className="an-legend__name">{d.name}</span>
            <strong>{nf.format(d.value)}</strong>
            <small>{total ? ((d.value / total) * 100).toFixed(1) : 0}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HBar({ data, color, height }: { data: NamedValue[]; color: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height || Math.max(200, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis type="number" {...AXIS} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...AXIS} width={130} tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [nf.format(v), 'Empresas']} />
        <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} barSize={18} label={{ position: 'right', fill: 'rgba(255,255,255,0.75)', fontSize: 12 }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface AnalyticsProps { currentView: string; onNavigate: (view: string) => void; currentUser?: CurrentUser | null; onLogout?: () => void }

export function Analytics({ currentView, onNavigate, currentUser, onLogout }: AnalyticsProps) {
  const [months, setMonths] = useState(12);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [progress, setProgress] = useState<SectorProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [regimeView, setRegimeView] = useState<'donut' | 'stack'>('donut');

  const load = async (m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/analytics?months=${m}&userId=${currentUser?.id || ''}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar');
      setData(json);
      const last = json.timeline[json.timeline.length - 1];
      const prev = json.timeline[json.timeline.length - 2] || last;
      setCompareA(prev.period);
      setCompareB(last.period);
      const [mm, yy] = String(json.referencePeriod).split('/');
      fetch(`${API}/api/dashboard?year=${yy}&month=${Number(mm)}&userId=${currentUser?.id || ''}`)
        .then(r => r.json()).then(d => setProgress(Array.isArray(d.progress) ? d.progress : [])).catch(() => setProgress([]));
    } catch (e: any) {
      setError(e.message || 'Servidor offline ou inacessível');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(months); }, [months]);

  const regimeKeys = useMemo(() => (data?.distribution.regimes || []).map(r => r.name), [data]);
  const regimeStack = useMemo(() => (data?.timeline || []).map(t => ({ period: t.period, ...t.regimes })), [data]);
  const sectorLines = useMemo(() => (data?.timeline || []).map(t => ({
    period: t.period, ...Object.fromEntries(Object.entries(t.sectors).map(([k, v]) => [k, v.total ? v.percent : null])),
  })), [data]);
  const workloadTop = useMemo(() => (data?.workload || []).slice(0, 12), [data]);
  const radial = useMemo(() => progress.map(p => {
    const pct = p.totalFields ? Math.round(((p.completedFields || 0) / p.totalFields) * 100) : p.percent;
    return { name: SECTOR_META[p.type]?.label || p.type, value: pct, fill: SECTOR_META[p.type]?.color || '#94a3b8', raw: p };
  }), [progress]);

  const pointA = data?.timeline.find(t => t.period === compareA);
  const pointB = data?.timeline.find(t => t.period === compareB);
  const compareRegimes = useMemo(() => {
    if (!pointA || !pointB) return [];
    const keys = new Set([...Object.keys(pointA.regimes), ...Object.keys(pointB.regimes)]);
    return [...keys].map(k => ({ name: REGIME_LABEL[k] || k, A: pointA.regimes[k] || 0, B: pointB.regimes[k] || 0 })).sort((a, b) => b.B - a.B);
  }, [pointA, pointB]);

  const k = data?.kpis;
  const growthPct = k && k.activeFirst ? ((k.active - k.activeFirst) / k.activeFirst) * 100 : 0;
  const churnPct = k && k.activeFirst ? (k.exitsPeriod / k.activeFirst) * 100 : 0;

  return (
    <div className="crm-dashboard">
      <Sidebar currentView={currentView} onNavigate={onNavigate} currentUser={currentUser} onLogout={onLogout} />
      <main className="crm-main an-page">
        <header className="an-hero">
          <div>
            <h1><BarChart3 size={26} /> Gráficos &amp; Comparações</h1>
            <p>Evolução da carteira, distribuição de empresas e andamento dos setores{data && <> · competência de referência <strong>{data.referencePeriod}</strong></>}</p>
          </div>
          <div className="an-hero__actions">
            <div className="an-segment" role="group" aria-label="Período analisado">
              {[6, 12, 24].map(m => (
                <button key={m} id={`analytics-period-${m}`} type="button" className={months === m ? 'active' : ''} onClick={() => setMonths(m)}>{m} meses</button>
              ))}
            </div>
            <button id="analytics-refresh" type="button" className="an-icon-btn" onClick={() => void load(months)} title="Atualizar dados" disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </header>

        {error && <div className="an-error">{error}</div>}
        {loading && !data ? <LoadingSpinner text="Montando os gráficos..." /> : data && k && (
          <div className="an-content">
            {/* KPIs */}
            <div className="an-kpis">
              <article className="an-kpi accent">
                <span className="an-kpi__icon"><Building2 size={20} /></span>
                <span className="an-kpi__label">Empresas ativas</span>
                <strong className="an-kpi__value">{nf.format(k.active)}</strong>
                <Delta current={k.active} previous={k.activePrev} />
                <small>vs. mês anterior</small>
              </article>
              <article className="an-kpi">
                <span className="an-kpi__icon violet"><Activity size={20} /></span>
                <span className="an-kpi__label">Crescimento ({months}m)</span>
                <strong className="an-kpi__value">{growthPct > 0 ? '+' : ''}{growthPct.toFixed(1)}%</strong>
                <Delta current={k.active} previous={k.activeFirst} />
                <small>desde {data.timeline[0].period}</small>
              </article>
              <article className="an-kpi">
                <span className="an-kpi__icon green"><TrendingUp size={20} /></span>
                <span className="an-kpi__label">Entradas</span>
                <strong className="an-kpi__value">{nf.format(k.entriesPeriod)}</strong>
                <span className="an-delta flat">média {(k.entriesPeriod / months).toFixed(1)}/mês</span>
                <small>últimos {months} meses</small>
              </article>
              <article className="an-kpi">
                <span className="an-kpi__icon red"><TrendingDown size={20} /></span>
                <span className="an-kpi__label">Saídas</span>
                <strong className="an-kpi__value">{nf.format(k.exitsPeriod)}</strong>
                <span className="an-delta flat">churn {churnPct.toFixed(1)}%</span>
                <small>saldo {k.entriesPeriod - k.exitsPeriod >= 0 ? '+' : ''}{nf.format(k.entriesPeriod - k.exitsPeriod)}</small>
              </article>
              <article className="an-kpi">
                <span className="an-kpi__icon blue"><Users size={20} /></span>
                <span className="an-kpi__label">Funcionários (DP)</span>
                <strong className="an-kpi__value">{nf.format(k.employees)}</strong>
                <Delta current={k.employees} previous={k.employeesPrev} />
                <small>vs. mês anterior</small>
              </article>
              <article className="an-kpi">
                <span className="an-kpi__icon amber"><UserX size={20} /></span>
                <span className="an-kpi__label">Sem responsável</span>
                <strong className="an-kpi__value">{nf.format(k.withoutResponsible)}</strong>
                <span className="an-delta flat">{k.active ? ((k.withoutResponsible / k.active) * 100).toFixed(1) : 0}% da carteira</span>
                <small>{nf.format(k.totalRegistered)} cadastradas no total</small>
              </article>
            </div>

            {/* Evolução */}
            <div className="an-grid two-one">
              <Panel title="Evolução da carteira" subtitle="Empresas ativas por competência" icon={TrendingUp}>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={data.timeline} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="anActive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d90f81" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#d90f81" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="period" {...AXIS} />
                    <YAxis {...AXIS} allowDecimals={false} domain={['dataMin - 5', 'dataMax + 5']} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [nf.format(v), 'Ativas']} />
                    <Area type="monotone" dataKey="active" stroke="#d90f81" strokeWidth={3} fill="url(#anActive)" dot={{ r: 3, fill: '#d90f81' }} activeDot={{ r: 6 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </Panel>
              <Panel title="Andamento atual" subtitle={`Campos concluídos · ${data.referencePeriod}`} icon={Activity}>
                {radial.length === 0 ? <div className="an-empty">Carregando andamento...</div> : (
                  <>
                    <ResponsiveContainer width="100%" height={230}>
                      <RadialBarChart innerRadius="28%" outerRadius="100%" data={radial} startAngle={90} endAngle={-270} barSize={12}>
                        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                        <RadialBar dataKey="value" background={{ fill: 'rgba(255,255,255,0.05)' }} cornerRadius={8} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [`${v}%`, 'Concluído']} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <ul className="an-progress-list">
                      {radial.map(r => (
                        <li key={r.name}>
                          <span className="an-legend__dot" style={{ background: r.fill }} />
                          <span>{r.name}</span>
                          <small>{r.raw.completed}/{r.raw.total} empresas</small>
                          <strong>{r.value}%</strong>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Panel>
            </div>

            <div className="an-grid two">
              <Panel title="Entradas x Saídas" subtitle="Movimentação mensal e saldo líquido" icon={GitCompare}>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={data.timeline} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="period" {...AXIS} />
                    <YAxis {...AXIS} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#ccc' }} />
                    <Bar dataKey="entries" name="Entradas" fill="#10b981" radius={[6, 6, 0, 0]} barSize={14} />
                    <Bar dataKey="exits" name="Saídas" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={14} />
                    <Line type="monotone" dataKey="net" name="Saldo" stroke="#f5f5f5" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Panel>
              <Panel title="Fechamentos concluídos por setor" subtitle="% de empresas com status concluído em cada mês" icon={Layers}>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={sectorLines} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="period" {...AXIS} />
                    <YAxis {...AXIS} domain={[0, 100]} unit="%" />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [`${v}%`, SECTOR_META[n]?.label || n]} />
                    <Legend formatter={(v: any) => SECTOR_META[v]?.label || v} wrapperStyle={{ fontSize: 12 }} />
                    {['FISCAL', 'DP', 'CUSHMAN', 'PARCELAMENTO'].map(s => (
                      <Line key={s} type="monotone" dataKey={s} stroke={SECTOR_META[s].color} strokeWidth={2.5} dot={false} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </Panel>
            </div>

            {/* Regimes */}
            <Panel
              title="Regimes tributários"
              subtitle={regimeView === 'donut' ? `Distribuição atual · ${nf.format(k.active)} empresas` : 'Composição da carteira ao longo do tempo'}
              icon={Building2}
              actions={
                <div className="an-segment small">
                  <button type="button" id="analytics-regime-donut" className={regimeView === 'donut' ? 'active' : ''} onClick={() => setRegimeView('donut')}>Atual</button>
                  <button type="button" id="analytics-regime-stack" className={regimeView === 'stack' ? 'active' : ''} onClick={() => setRegimeView('stack')}>Histórico</button>
                </div>
              }
            >
              {regimeView === 'donut' ? (
                <Donut
                  data={data.distribution.regimes.map(r => ({ name: REGIME_LABEL[r.name] || r.name, value: r.value }))}
                  colors={data.distribution.regimes.map(r => REGIME_COLOR[r.name] || '#94a3b8')}
                  centerLabel="empresas" centerValue={nf.format(k.active)}
                />
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={regimeStack} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="period" {...AXIS} />
                    <YAxis {...AXIS} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [nf.format(v), REGIME_LABEL[n] || n]} />
                    <Legend formatter={(v: any) => REGIME_LABEL[v] || v} wrapperStyle={{ fontSize: 12 }} />
                    {regimeKeys.map((key, i) => (
                      <Bar key={key} dataKey={key} stackId="r" fill={REGIME_COLOR[key] || PALETTE[i % PALETTE.length]} radius={i === regimeKeys.length - 1 ? [6, 6, 0, 0] : 0} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            {/* Comparação */}
            <Panel
              title="Comparar competências"
              subtitle="Escolha dois meses e veja as diferenças lado a lado"
              icon={GitCompare}
              className="an-compare"
              actions={
                <div className="an-compare__pickers">
                  <select id="analytics-compare-a" value={compareA} onChange={e => setCompareA(e.target.value)}>
                    {data.timeline.map(t => <option key={t.period} value={t.period}>{t.period}</option>)}
                  </select>
                  <span>vs</span>
                  <select id="analytics-compare-b" value={compareB} onChange={e => setCompareB(e.target.value)}>
                    {data.timeline.map(t => <option key={t.period} value={t.period}>{t.period}</option>)}
                  </select>
                </div>
              }
            >
              {pointA && pointB && (
                <div className="an-compare__body">
                  <table className="an-compare__table">
                    <thead><tr><th>Indicador</th><th>{pointA.period}</th><th>{pointB.period}</th><th>Variação</th></tr></thead>
                    <tbody>
                      {[
                        ['Empresas ativas', pointA.active, pointB.active],
                        ['Entradas no mês', pointA.entries, pointB.entries],
                        ['Saídas no mês', pointA.exits, pointB.exits],
                        ['Funcionários (DP)', pointA.employees, pointB.employees],
                        ...['FISCAL', 'DP', 'CUSHMAN', 'PARCELAMENTO'].map(s => [`${SECTOR_META[s].label} concluído (%)`, pointA.sectors[s]?.percent || 0, pointB.sectors[s]?.percent || 0, '%']),
                      ].map(([labelText, a, b, suffix]) => (
                        <tr key={labelText as string}>
                          <td>{labelText}</td>
                          <td>{nf.format(a as number)}{suffix || ''}</td>
                          <td>{nf.format(b as number)}{suffix || ''}</td>
                          <td><Delta current={b as number} previous={a as number} suffix={(suffix as string) ? ' p.p.' : ''} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="an-compare__chart">
                    <ResponsiveContainer width="100%" height={Math.max(260, compareRegimes.length * 30)}>
                      <BarChart data={compareRegimes} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                        <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis type="number" {...AXIS} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" {...AXIS} width={120} tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                        <Tooltip {...TOOLTIP_STYLE} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="A" name={pointA.period} fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={10} />
                        <Bar dataKey="B" name={pointB.period} fill="#d90f81" radius={[0, 4, 4, 0]} barSize={10} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </Panel>

            {/* Equipe */}
            <div className="an-grid two-one">
              <Panel
                title="Carga por responsável"
                subtitle={k.formerTeamMembers ? `Empresas vinculadas por setor · ${k.activeTeamMembers || 0} ativos · ${k.formerTeamMembers} ex-colaborador(es)` : "Empresas vinculadas por setor (top 12)"}
                icon={Briefcase}
              >
                {workloadTop.length === 0 ? <div className="an-empty">Nenhum responsável vinculado.</div> : (
                  <ResponsiveContainer width="100%" height={Math.max(260, workloadTop.length * 32)}>
                    <BarChart data={workloadTop} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                      <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" {...AXIS} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" {...AXIS} width={140} tick={{ fill: 'rgba(255,255,255,0.75)', fontSize: 12 }} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [nf.format(v), SECTOR_META[n]?.label || n]} />
                      <Legend formatter={(v: any) => SECTOR_META[v]?.label || v} wrapperStyle={{ fontSize: 12 }} />
                      {['FISCAL', 'DP', 'CONTABIL', 'CUSHMAN', 'GERAL'].map((s, i, arr) => (
                        <Bar key={s} dataKey={s} stackId="w" fill={SECTOR_META[s].color} barSize={16} radius={i === arr.length - 1 ? [0, 6, 6, 0] : 0} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {/* Tabela de Detalhamento da Carga da Equipe */}
                {workloadTop.length > 0 && (
                  <div className="workload-summary-table-wrap" style={{ marginTop: '16px', overflowX: 'auto', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                    <table className="workload-summary-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', textAlign: 'left' }}>
                          <th style={{ padding: '8px 6px' }}>Colaborador</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center' }}>Fiscal</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center' }}>DP</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center' }}>Contábil</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center' }}>Cushman</th>
                          <th style={{ padding: '8px 6px', textAlign: 'right' }}>Total Carteira</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workloadTop.map((w, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '8px 6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'linear-gradient(135deg, #d90f81, #8b5cf6)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700 }}>
                                {w.name[0]?.toUpperCase() || 'U'}
                              </span>
                              <strong style={{ color: '#f1f5f9' }}>{w.name}</strong>
                              {w.isFormer && <span style={{ fontSize: '10px', color: '#f87171', background: 'rgba(239,68,68,0.15)', padding: '1px 5px', borderRadius: '4px' }}>Inativo</span>}
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'center', color: '#34d399' }}>{w.FISCAL || '—'}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'center', color: '#60a5fa' }}>{w.DP || '—'}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'center', color: '#a78bfa' }}>{w.CONTABIL || '—'}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'center', color: '#f87171' }}>{w.CUSHMAN || '—'}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)' }}>
                                {w.total} empresas
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
              <Panel title="Setores contratados" subtitle="Empresas ativas com cada setor" icon={Layers}>
                <HBar data={data.distribution.sectors.map(s => ({ name: SECTOR_META[s.name]?.label || s.name, value: s.value }))} color="#8b5cf6" height={240} />
                <div className="an-mini-stats">
                  {data.distribution.sectors.map(s => (
                    <div key={s.name}>
                      <span style={{ color: SECTOR_META[s.name]?.color }}>{SECTOR_META[s.name]?.label}</span>
                      <strong>{k.active ? ((s.value / k.active) * 100).toFixed(0) : 0}%</strong>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {/* Certificados e procurações */}
            <div className="an-grid three">
              <Panel title="Certificados digitais" subtitle="Situação na carteira ativa" icon={ShieldCheck}>
                <Donut
                  data={[
                    { name: 'Válidos', value: data.certificates.valid },
                    { name: 'Vencem em até 3 meses', value: data.certificates.next90 },
                    { name: 'Vencem este mês', value: data.certificates.thisMonth },
                    { name: 'Vencidos', value: data.certificates.expired },
                    { name: 'Sem data', value: data.certificates.invalidDate },
                    { name: 'Sem certificado', value: data.certificates.without },
                  ].filter(d => d.value > 0)}
                  colors={['#10b981', '#f59e0b', '#f97316', '#ef4444', '#64748b', '#334155'].filter((_, i) => [data.certificates.valid, data.certificates.next90, data.certificates.thisMonth, data.certificates.expired, data.certificates.invalidDate, data.certificates.without][i] > 0)}
                  centerLabel="com certificado" centerValue={nf.format(data.certificates.with)}
                />
              </Panel>
              <Panel title="Vencimentos de certificados" subtitle="Próximos 12 meses" icon={ShieldCheck}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.certificates.expirations} margin={{ top: 16, right: 8, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="anCert" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#d90f81" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="period" {...AXIS} fontSize={11} />
                    <YAxis {...AXIS} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [nf.format(v), 'Certificados vencendo']} />
                    <Bar dataKey="value" fill="url(#anCert)" radius={[6, 6, 0, 0]} barSize={18} label={{ position: 'top', fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
              <Panel title="Procurações (Target)" subtitle="Situação na carteira ativa" icon={FileSignature}>
                <Donut
                  data={[
                    { name: 'Válidas', value: data.proxies.valid },
                    { name: 'Vencem em 30 dias', value: data.proxies.next30 },
                    { name: 'Vencidas', value: data.proxies.expired },
                    { name: 'Sem procuração', value: data.proxies.without },
                  ].filter(d => d.value > 0)}
                  colors={['#10b981', '#f59e0b', '#ef4444', '#334155'].filter((_, i) => [data.proxies.valid, data.proxies.next30, data.proxies.expired, data.proxies.without][i] > 0)}
                  centerLabel="com procuração" centerValue={nf.format(data.proxies.with)}
                />
              </Panel>
            </div>

            {/* Distribuições */}
            <div className="an-grid two">
              <Panel title="Municípios" subtitle="Top 10 cidades da carteira" icon={MapPin}>
                <HBar data={data.distribution.cities} color="#3b82f6" />
              </Panel>
              <Panel title="Tipo de empresa" subtitle="Classificação de atividade" icon={Briefcase}>
                <HBar data={data.distribution.companyTypes} color="#10b981" />
              </Panel>
              <Panel title="Grupos econômicos" subtitle="Top 10 grupos por quantidade de empresas" icon={Building2}>
                {data.distribution.groups.length === 0 ? <div className="an-empty">Nenhum grupo econômico informado.</div> : <HBar data={data.distribution.groups} color="#d90f81" />}
              </Panel>
              <Panel title="Forma de entrega" subtitle="Como os documentos são enviados" icon={Send}>
                <Donut data={data.distribution.delivery} colors={PALETTE} centerLabel="empresas" centerValue={nf.format(k.active)} />
              </Panel>
            </div>

            <div className="an-grid two">
              <Panel title="Funcionários ao longo do tempo" subtitle="Soma informada nos fechamentos de DP" icon={Users}>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={data.timeline} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="anEmp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="period" {...AXIS} />
                    <YAxis {...AXIS} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [nf.format(v), 'Funcionários']} />
                    <Area type="monotone" dataKey="employees" stroke="#3b82f6" strokeWidth={3} fill="url(#anEmp)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Panel>
              <Panel title="Parcelamentos" subtitle="Planos cadastrados por status" icon={FileSignature}>
                {data.installments.length === 0 ? <div className="an-empty">Nenhum parcelamento cadastrado.</div> : (
                  <div className="an-installments">
                    {data.installments.map((p, i) => (
                      <div key={p.status} className="an-installment" style={{ borderColor: PALETTE[i % PALETTE.length] }}>
                        <span>{p.status}</span>
                        <strong>{nf.format(p.count)}</strong>
                        <small>{money.format(p.amount)}</small>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <p className="an-footnote">Atualizado em {new Date(data.generatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (horário de Brasília)</p>
          </div>
        )}
      </main>
    </div>
  );
}
