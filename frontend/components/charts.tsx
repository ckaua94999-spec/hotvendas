'use client'
import { ReactNode, useId, useMemo, useState } from 'react'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { bucketLabel, bucketTitle, formatInt, formatPercent, Granularity } from '../lib/format'
import { Icon } from './icons'
import { Panel } from './kit'
import { AnimatedNumber, useMounted } from './motion'

export type SeriesDef = { key: string; label: string; color: string; kind: 'area' | 'line' | 'bar' }
export type TableView = { head: string[]; rows: (string | number)[][] }

const TICK = { fill: 'var(--muted)', fontSize: 12 }

/* ------------------------------------------------------------------ moldura */

export function Legend({ series }: { series: SeriesDef[] }) {
  return (
    <ul className="legend">
      {series.map((item) => (
        <li key={item.key}>
          <span className={item.kind === 'line' ? 'legend-line' : 'legend-box'} style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/** Cartão de gráfico: legenda quando há mais de uma série e a mesma informação em tabela, a um clique. */
export function ChartCard({ title, subtitle, series, table, children, index = 0, className = '', aside }: {
  title: string
  subtitle?: ReactNode
  series?: SeriesDef[]
  table?: TableView
  children: ReactNode
  index?: number
  className?: string
  aside?: ReactNode
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const showTable = view === 'table' && table
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      index={index}
      className={className}
      actions={table && (
        <button type="button" className="icon-btn" aria-pressed={view === 'table'} title={view === 'table' ? 'Ver gráfico' : 'Ver em tabela'} aria-label={view === 'table' ? 'Ver gráfico' : 'Ver em tabela'} onClick={() => setView(view === 'table' ? 'chart' : 'table')}>
          <Icon name={view === 'table' ? 'chart' : 'table'} size={17} />
        </button>
      )}
    >
      {aside}
      {series && series.length > 1 && <div className="mb-4"><Legend series={series} /></div>}
      {showTable ? (
        <div key="table" className="anim-fade max-h-[320px] overflow-auto rounded-xl border border-line">
          <table className="tbl">
            <thead><tr>{table.head.map((cell, column) => <th key={cell} className={column ? 'num' : ''}>{cell}</th>)}</tr></thead>
            <tbody>{table.rows.map((row, line) => <tr key={line}>{row.map((cell, column) => <td key={column} className={column ? 'num' : ''}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div key="chart" className="anim-fade">{children}</div>
      )}
    </Panel>
  )
}

export function EmptyChart({ height = 260, text = 'Sem movimento no período' }: { height?: number; text?: string }) {
  return (
    <div className="relative grid place-items-center overflow-hidden rounded-xl" style={{ height }}>
      <div className="absolute inset-0 flex flex-col justify-between py-3" aria-hidden="true">
        {[0, 1, 2, 3].map((line) => <span key={line} className="block h-px w-full bg-[var(--grid)]" />)}
      </div>
      <div className="relative text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[var(--neutral-soft)] text-muted"><Icon name="chart" size={20} /></span>
        <p className="mt-3 text-[14px] font-semibold">{text}</p>
        <p className="mt-0.5 text-[13px] text-muted">Os números entram aqui assim que acontecerem.</p>
      </div>
    </div>
  )
}

function Tip({ active, payload, series, format, titleKey = 'title' }: { active?: boolean; payload?: any[]; series: SeriesDef[]; format: (value: number) => string; titleKey?: string }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Record<string, any>
  return (
    <div className="chart-tip">
      <p className="chart-tip-title">{row[titleKey]}</p>
      {series.map((item) => (
        <div key={item.key} className="chart-tip-row">
          <span className="chart-tip-key" style={{ background: item.color }} />
          <span className="chart-tip-value">{row[item.key] == null ? '—' : format(Number(row[item.key]))}</span>
          <span className="chart-tip-name">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------- série no tempo */

export type TimePoint = { start: string; future: boolean; [key: string]: string | number | boolean }

/** Linhas e área ao longo do período. Intervalo que ainda não começou fica sem linha, não em zero. */
export function TimeChart({ points, granularity, series, format, axisFormat = format, axisWidth = 44, height = 280 }: {
  points: TimePoint[]
  granularity: Granularity
  series: SeriesDef[]
  format: (value: number) => string
  axisFormat?: (value: number) => string
  axisWidth?: number
  height?: number
}) {
  const id = useId().replace(/:/g, '')
  const rows = useMemo(() => points.map((point) => {
    const row: Record<string, string | number | null> = { label: bucketLabel(point.start, granularity), title: bucketTitle(point.start, granularity) }
    for (const item of series) row[item.key] = point.future ? null : Number(point[item.key]) || 0
    return row
  }), [points, granularity, series])
  const hasData = rows.some((row) => series.some((item) => Number(row[item.key]) > 0))
  if (!hasData) return <EmptyChart height={height} />

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <defs>
            {series.filter((item) => item.kind === 'area').map((item) => (
              <linearGradient key={item.key} id={`fill-${id}-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: item.color, stopOpacity: 0.3 }} />
                <stop offset="100%" style={{ stopColor: item.color, stopOpacity: 0 }} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tick={TICK} tickMargin={10} minTickGap={20} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} tick={TICK} tickFormatter={axisFormat} width={axisWidth} allowDecimals={false} />
          <Tooltip content={(props: any) => <Tip {...props} series={series} format={format} />} cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }} animationDuration={140} />
          {series.map((item) => item.kind === 'area' ? (
            <Area key={item.key} type="monotone" dataKey={item.key} stroke={item.color} strokeWidth={2} fill={`url(#fill-${id}-${item.key})`} dot={false} activeDot={{ r: 4.5, fill: item.color, stroke: 'var(--surface)', strokeWidth: 2 }} animationDuration={1100} animationEasing="ease-out" />
          ) : (
            <Line key={item.key} type="monotone" dataKey={item.key} stroke={item.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={{ r: 4.5, fill: item.color, stroke: 'var(--surface)', strokeWidth: 2 }} animationDuration={1100} animationEasing="ease-out" />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------- barras agrupadas */

function shorten(text: string, size = 12) {
  return text.length > size ? `${text.slice(0, size - 1)}…` : text
}

export function GroupBars({ rows, series, format = formatInt }: { rows: ({ label: string } & Record<string, string | number>)[]; series: SeriesDef[]; format?: (value: number) => string }) {
  const hasData = rows.some((row) => series.some((item) => Number(row[item.key]) > 0))
  // Barras deitadas: o nome da origem cabe inteiro ao lado, e a altura acompanha a quantidade de linhas.
  const height = Math.max(220, rows.length * (series.length * 11 + 16) + 34)
  if (!hasData) return <EmptyChart height={height} />
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--grid)" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={TICK} allowDecimals={false} tickFormatter={format} />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tick={TICK} width={124} tickFormatter={(value: string) => shorten(String(value), 17)} />
          <Tooltip content={(props: any) => <Tip {...props} series={series} format={format} titleKey="label" />} cursor={{ fill: 'var(--neutral-soft)' }} animationDuration={140} />
          {series.map((item) => <Bar key={item.key} dataKey={item.key} fill={item.color} radius={[0, 4, 4, 0]} maxBarSize={9} animationDuration={900} animationEasing="ease-out" />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------- barras em ranking */

export type RankRow = { key: string; label: string; value: number }

/** Uma barra por item, a maior primeiro, todas da mesma cor: o comprimento já diz o valor. */
export function RankedBars({ rows, format, color = 'var(--series-paid)', labelWidth = 132 }: { rows: RankRow[]; format: (value: number) => string; color?: string; labelWidth?: number }) {
  const mounted = useMounted()
  const max = Math.max(0, ...rows.map((row) => row.value))
  return (
    <ul className="grid gap-3.5">
      {rows.map((row, index) => (
        <li key={row.key} className="bar-row grid items-center gap-3" style={{ gridTemplateColumns: `minmax(0, ${labelWidth}px) minmax(0, 1fr) auto` }}>
          <span className="truncate text-[13px] text-ink-2" title={row.label}>{row.label}</span>
          <span className="block border-l border-[var(--axis)] py-0.5">
            <span className="bar block" style={{ width: mounted && max > 0 ? `${Math.max((row.value / max) * 100, row.value > 0 ? 1.5 : 0)}%` : '0%', background: color, transitionDelay: `${index * 60}ms` }} />
          </span>
          <span className="tnum text-[13px] font-semibold">{format(row.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------- funil */

export type FunnelRow = { label: string; users: number; percentOfStart: number; percentOfPrevious: number; dropped: number; dropPercent: number }

const FUNNEL_COLORS = ['var(--funnel-1)', 'var(--funnel-2)', 'var(--funnel-3)', 'var(--funnel-4)', 'var(--funnel-5)', 'var(--funnel-6)']

/**
 * Funil em barras que partem da mesma linha: a ordem das etapas vai na cor
 * (um matiz só, do mais claro ao mais forte) e o tamanho na largura.
 */
export function FunnelChart({ rows, compact = false }: { rows: FunnelRow[]; compact?: boolean }) {
  const mounted = useMounted()
  const max = Math.max(0, ...rows.map((row) => row.users))
  const width = (row: FunnelRow) => (max > 0 ? (row.users / max) * 100 : 0)
  const color = (index: number) => FUNNEL_COLORS[Math.min(index, FUNNEL_COLORS.length - 1)]

  if (compact) {
    return (
      <ol className="flex h-full min-h-[300px] flex-col justify-between gap-3">
        {rows.map((row, index) => (
          <li key={row.label} className="bar-row">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-ink-2">{row.label}</span>
              <span className="tnum flex-none"><span className="font-semibold">{formatInt(row.users)}</span><span className="ml-2 inline-block w-12 text-right text-muted">{formatPercent(row.percentOfStart)}</span></span>
            </div>
            <div className="mt-1.5 border-l border-[var(--axis)]">
              <div className="bar" style={{ height: 8, width: mounted ? `${Math.max(width(row), row.users > 0 ? 1.5 : 0)}%` : '0%', background: color(index), transitionDelay: `${index * 70}ms` }} />
            </div>
          </li>
        ))}
      </ol>
    )
  }

  if (max === 0) return <EmptyChart height={300} text="Ninguém passou pelo funil no período" />

  return (
    <ol className="grid">
      {rows.map((row, index) => {
        const previous = rows[index - 1]
        return (
          <li key={row.label}>
            {previous && (
              <div className="grid grid-cols-1 items-center gap-x-6 md:grid-cols-[minmax(0,230px)_minmax(0,1fr)]">
                <p className="flex items-center gap-1.5 py-3 text-[12.5px] text-muted">
                  <Icon name="arrow-down" size={13} />
                  {row.dropped < 0 ? (
                    // Mais gente aqui do que na etapa anterior: passaram por ela antes do período filtrado.
                    <span><span className="font-semibold text-ink-2">{formatInt(-row.dropped)}</span> a mais que na etapa anterior, vindos de antes do período</span>
                  ) : (
                    <span><span className="font-semibold text-ink-2">{formatPercent(row.percentOfPrevious)}</span> avançaram, <span className="font-semibold text-ink-2">{formatInt(row.dropped)}</span> não ({formatPercent(row.dropPercent)})</span>
                  )}
                </p>
                <div className="mr-16 hidden h-10 self-stretch border-l border-[var(--axis)] md:block">
                  <div
                    className="h-full"
                    style={{
                      background: `linear-gradient(180deg, color-mix(in srgb, ${color(index - 1)} 30%, transparent), color-mix(in srgb, ${color(index)} 16%, transparent))`,
                      clipPath: mounted ? `polygon(0 0, ${width(previous)}% 0, ${width(row)}% 100%, 0 100%)` : 'polygon(0 0, 0 0, 0 100%, 0 100%)',
                      transition: 'clip-path 0.95s cubic-bezier(0.2, 0.8, 0.2, 1)',
                      transitionDelay: `${index * 90}ms`,
                    }}
                  />
                </div>
              </div>
            )}
            <div className="bar-row grid grid-cols-1 items-center gap-x-6 gap-y-2 md:grid-cols-[minmax(0,230px)_minmax(0,1fr)]">
              <div className="flex items-baseline justify-between gap-3 md:block">
                <p className="text-[13.5px] text-ink-2">{row.label}</p>
                <p className="text-[24px] font-semibold leading-tight tracking-[-0.02em]"><AnimatedNumber value={row.users} format={formatInt} /></p>
              </div>
              <div className="relative mr-16 border-l border-[var(--axis)]">
                <div className="bar" style={{ height: 24, width: mounted ? `${Math.max(width(row), row.users > 0 ? 1 : 0)}%` : '0%', background: color(index), transitionDelay: `${index * 90}ms` }} />
                <span className="tnum absolute top-1/2 -translate-y-1/2 pl-2.5 text-[12.5px] font-semibold text-ink-2" style={{ left: mounted ? `${width(row)}%` : '0%', transition: 'left 0.95s cubic-bezier(0.2, 0.8, 0.2, 1)', transitionDelay: `${index * 90}ms` }}>
                  {formatPercent(row.percentOfStart)}
                </span>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ---------------------------------------------------------------- tendência */

/** Linha pequena de tendência para um cartão de número. O ponto final marca o intervalo atual. */
export function Sparkline({ values, color = 'var(--accent)', height = 34 }: { values: number[]; color?: string; height?: number }) {
  const id = useId().replace(/:/g, '')
  if (values.length < 2) return null
  const max = Math.max(0, ...values)
  const x = (index: number) => (index / (values.length - 1)) * 100
  const y = (value: number) => (max > 0 ? height - 4 - (value / max) * (height - 8) : height - 4)
  const line = values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(' ')
  const last = y(values[values.length - 1])
  return (
    <div className="relative mr-1" style={{ height }} aria-hidden="true">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} className="anim-wipe block overflow-visible">
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.22 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={`${line} L100 ${height} L0 ${height} Z`} fill={`url(#spark-${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute h-2 w-2 rounded-full" style={{ left: '100%', top: last, transform: 'translate(-50%, -50%)', background: color, boxShadow: '0 0 0 2px var(--surface)' }} />
    </div>
  )
}
