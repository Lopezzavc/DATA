// src/pages/Estadisticas.tsx
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BarChart3, ChevronDown, Trophy, Globe, Loader2, History, Zap, TrendingUp, TrendingDown, Minus, LineChart as LineChartIcon, Check, X as XIcon, Calendar } from 'lucide-react'
import { supabase } from '../lib/supabase'
import canchaImage from '../assets/cancha.png'
import { calcularEloHistorico, type PartidoParaElo, type EloEntry } from '../lib/elo'

// ─── Imágenes de power‑ups (mismas que en Public.tsx) ───
import beachBall from '../assets/powerups/beach-ball.png'
import moveBall from '../assets/powerups/move-ball.png'
import swapGoals from '../assets/powerups/swap-goals.png'
import bigBumpers from '../assets/powerups/big-bumpers.png'
import boost from '../assets/powerups/boost.png'
import stickyGoo from '../assets/powerups/sticky-goo.png'
import ramp from '../assets/powerups/ramp.png'
import block from '../assets/powerups/block.png'
import bigHead from '../assets/powerups/big-head.png'
import ghosted from '../assets/powerups/ghosted.png'
import movePlayer from '../assets/powerups/move-player.png'

// ─── Interfaces ───
interface Equipo {
  id: string
  nombre: string
  escudo_url: string | null
  color_hex?: string | null
  dt?: string | null
}

interface Torneo {
  id: string
  numero: number
  nombre: string | null
  edicion: string | null
  estado: 'en_curso' | 'terminado' | 'lost_media'
  activo: boolean | null
  orden: number | null
}

interface PowerupFavorito {
  powerupId: string
  nombre: string
  cantidad: number
}

interface EquipoStatsGlobal {
  equipo: Equipo
  pj: number
  pg: number
  pe: number
  pp: number
  gf: number
  gc: number
  powerupsUsados: number
  powerupFavorito: PowerupFavorito | null
  elo: number | null
}

interface Partido {
  id: string
  equipo_local_id: string
  equipo_visitante_id: string
  goles_local: number | null
  goles_visitante: number | null
  estado: string
  duracion_segundos: number
  fecha: string | null
  ronda?: string
  grupo_eliminatorio?: number | null
  created_at?: string
  jornada_id?: string | null
  torneo_id?: string
  fase?: string
  inicio_timestamp?: string | null
  confirmado: boolean
}

interface Gol {
  id: string
  partido_id: string
  equipo_id: string
  minuto: number
  pos_x?: number | null
  pos_y?: number | null
}

interface PowerupInfo {
  powerupId: string
  nombre: string
  cantidad: number
}

interface MatchDetail {
  partido: Partido
  powerups: { [equipoId: string]: PowerupInfo[] }
}

// ─── Progresión de goles por intervalos de minutos (igual que en Public.tsx) ───
const INTERVALOS_GOLES: { desde: number; hasta: number; label: string }[] = [
  { desde: 0, hasta: 400, label: '(0:00 - 6:40)'},
  { desde: 400, hasta: 800, label: '(6:40 - 13:20)'},
  { desde: 800, hasta: 1200, label: '(13:20 - 20:00)'},
  { desde: 1200, hasta: 1600, label: '(20:00 - 26:40)'},
  { desde: 1600, hasta: 2000, label: '(26:40 - 33:20)'},
  { desde: 2000, hasta: Infinity, label: '(33:20 - 40:00+)'},
]
const INTERVALO_COLORES = ['#FF2D6B', '#FFA135', '#F4E018', '#2FE07A', '#2FB6E0', '#B5266E']

interface ProgresionGoles {
  conteos: number[]
}

function calcularProgresionGoles(golesDelEquipo: { minuto: number }[]): ProgresionGoles {
  const conteos = new Array(INTERVALOS_GOLES.length).fill(0)
  golesDelEquipo.forEach(g => {
    const segundos = g.minuto
    const idx = INTERVALOS_GOLES.findIndex(iv => segundos >= iv.desde && segundos < iv.hasta)
    if (idx >= 0) conteos[idx]++
  })
  return { conteos }
}

// ─── Constantes ───
const POWERUP_IMAGES: Record<string, string> = {
  'Beach Ball': beachBall,
  'Move Ball': moveBall,
  'Swap Goals': swapGoals,
  'Big Bumpers': bigBumpers,
  'Boost': boost,
  'Sticky Goo': stickyGoo,
  'Ramp': ramp,
  'Block': block,
  'Big Head': bigHead,
  'Ghosted': ghosted,
  'Move Player': movePlayer,
}

const ESTADO_LABELS: Record<Torneo['estado'], string> = {
  en_curso: 'En curso',
  terminado: 'Terminado',
  lost_media: 'Lost media',
}

const ESTADO_COLORS: Record<Torneo['estado'], string> = {
  en_curso: '#FFC800',
  terminado: '#00C88C',
  lost_media: '#FF4D4D',
}

// ─── Paleta de respaldo para equipos sin color_hex definido, usada en la
// gráfica de progresión de ELO para que cada curva sea siempre distinguible. ───
const PALETA_ELO_FALLBACK = [
  '#00C88C', '#FF4D4D', '#FFC800', '#3B82F6', '#A855F7',
  '#F97316', '#14B8A6', '#EC4899', '#84CC16', '#EAB308',
  '#6366F1', '#F43F5E', '#22D3EE', '#D946EF', '#65A30D',
]

function darkenHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const nr = Math.max(0, Math.min(255, Math.floor(r * factor)))
  const ng = Math.max(0, Math.min(255, Math.floor(g * factor)))
  const nb = Math.max(0, Math.min(255, Math.floor(b * factor)))
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

function formatearDuracion(segundos: number) {
  const mins = Math.floor(segundos / 60)
  const secs = segundos % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// Interpola un color según un porcentaje (0-100): rojo -> naranja -> amarillo -> verde -> azul.
function colorPorPorcentaje(pct: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [255, 77, 77]],
    [25, [255, 150, 60]],
    [50, [255, 220, 70]],
    [75, [110, 220, 120]],
    [100, [80, 160, 255]],
  ]
  const clamped = Math.max(0, Math.min(100, pct))
  let lower = stops[0]
  let upper = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i][0] && clamped <= stops[i + 1][0]) {
      lower = stops[i]
      upper = stops[i + 1]
      break
    }
  }
  const range = upper[0] - lower[0]
  const t = range === 0 ? 0 : (clamped - lower[0]) / range
  const r = Math.round(lower[1][0] + (upper[1][0] - lower[1][0]) * t)
  const g = Math.round(lower[1][1] + (upper[1][1] - lower[1][1]) * t)
  const b = Math.round(lower[1][2] + (upper[1][2] - lower[1][2]) * t)
  return `rgb(${r}, ${g}, ${b})`
}

function h2hKey(equipoAId: string, equipoBId: string) {
  return [equipoAId, equipoBId].sort().join('__')
}

// ─── Genera un heatmap en un canvas offscreen a partir de puntos (%) y lo
// devuelve como dataURL PNG. Usa acumulación radial en escala de grises
// (canal alfa, compositing 'lighter') y luego aplica un colormap tipo
// "calor" (azul → verde → amarillo → rojo) en un segundo pase, para lograr
// un blend real de densidad en vez de simple superposición de opacidad. ───
function generarHeatmapDataUrl(
  puntos: { pos_x: number; pos_y: number }[],
  width: number,
  height: number,
  radio: number = 60,
  intensidad: number = 0.35
): string | null {
  if (puntos.length === 0 || width === 0 || height === 0) return null

  const accCanvas = document.createElement('canvas')
  accCanvas.width = width
  accCanvas.height = height
  const accCtx = accCanvas.getContext('2d')
  if (!accCtx) return null

  accCtx.globalCompositeOperation = 'lighter'

  puntos.forEach(p => {
    const cx = (p.pos_x / 100) * width
    const cy = (p.pos_y / 100) * height
    const grad = accCtx.createRadialGradient(cx, cy, 0, cx, cy, radio)
    grad.addColorStop(0, `rgba(255,255,255,${intensidad})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    accCtx.fillStyle = grad
    accCtx.beginPath()
    accCtx.arc(cx, cy, radio, 0, Math.PI * 2)
    accCtx.fill()
  })

  const imgData = accCtx.getImageData(0, 0, width, height)
  const data = imgData.data

  const colorStops: [number, [number, number, number]][] = [
    [0.0, [0, 0, 0]],
    [0.15, [80, 160, 255]],
    [0.4, [80, 220, 160]],
    [0.65, [255, 220, 70]],
    [1, [255, 60, 60]],
  ]

  const colorPorIntensidad = (t: number): [number, number, number] => {
    const clamped = Math.max(0, Math.min(1, t))
    let lower = colorStops[0]
    let upper = colorStops[colorStops.length - 1]
    for (let i = 0; i < colorStops.length - 1; i++) {
      if (clamped >= colorStops[i][0] && clamped <= colorStops[i + 1][0]) {
        lower = colorStops[i]
        upper = colorStops[i + 1]
        break
      }
    }
    const range = upper[0] - lower[0]
    const localT = range === 0 ? 0 : (clamped - lower[0]) / range
    return [
      Math.round(lower[1][0] + (upper[1][0] - lower[1][0]) * localT),
      Math.round(lower[1][1] + (upper[1][1] - lower[1][1]) * localT),
      Math.round(lower[1][2] + (upper[1][2] - lower[1][2]) * localT),
    ]
  }

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255
    if (alpha < 0.02) {
      data[i + 3] = 0
      continue
    }
    const [r, g, b] = colorPorIntensidad(alpha)
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = Math.min(255, Math.round(alpha * 255 * 1.4))
  }

  accCtx.putImageData(imgData, 0, 0)
  return accCanvas.toDataURL('image/png')
}

// ─── Gráfica de progresión de ELO ───
function GraficaProgresionElo({
  historial,
  equipos,
  equiposMap,
}: {
  historial: EloEntry[]
  equipos: Equipo[]
  equiposMap: Record<string, Equipo>
}) {
  const [ocultos, setOcultos] = useState<Record<string, boolean>>({})
  const [modoSuavizado, setModoSuavizado] = useState(true)
  const FIDELIDAD_SUAVIZADO = 95

  const colorEquipo = useCallback((equipoId: string, idxFallback: number) => {
    const eq = equiposMap[equipoId]
    return eq?.color_hex || PALETA_ELO_FALLBACK[idxFallback % PALETA_ELO_FALLBACK.length]
  }, [equiposMap])

  const { series, totalEventos, eloMin, eloMax } = useMemo(() => {
    const seriesMap = new Map<string, { x: number; y: number; partidoId: string }[]>()
    equipos.forEach(eq => seriesMap.set(eq.id, []))

    historial.forEach((entry, idx) => {
      const x = idx + 1
      if (seriesMap.has(entry.equipoLocalId)) {
        const arr = seriesMap.get(entry.equipoLocalId)!
        if (arr.length === 0) {
          arr.push({ x: 0, y: entry.eloLocalAntes, partidoId: entry.partidoId })
        }
        arr.push({ x, y: entry.eloLocalDespues, partidoId: entry.partidoId })
      }
      if (seriesMap.has(entry.equipoVisitanteId)) {
        const arr = seriesMap.get(entry.equipoVisitanteId)!
        if (arr.length === 0) {
          arr.push({ x: 0, y: entry.eloVisitanteAntes, partidoId: entry.partidoId })
        }
        arr.push({ x, y: entry.eloVisitanteDespues, partidoId: entry.partidoId })
      }
    })

    let min = Infinity
    let max = -Infinity
    seriesMap.forEach(arr => {
      arr.forEach(p => {
        if (p.y < min) min = p.y
        if (p.y > max) max = p.y
      })
    })
    if (!isFinite(min) || !isFinite(max)) { min = 1400; max = 1600 }
    if (min === max) { min -= 50; max += 50 }

    return {
      series: seriesMap,
      totalEventos: historial.length,
      eloMin: min,
      eloMax: max,
    }
  }, [historial, equipos])

  const toggleEquipo = (id: string) => {
    setOcultos(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (historial.length === 0) {
    return (
      <div style={{ padding: '40px', borderRadius: '12px', border: '2px dashed var(--color-border)', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
        No hay suficientes partidos para calcular la progresión de ELO.
      </div>
    )
  }

  const W = 620 * 1.4
  const H = 230 * 1.4
  const PAD_L = 35
  const PAD_R = 6
  const PAD_T = 8
  const PAD_B = 5
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const xScale = (x: number) => PAD_L + (totalEventos > 0 ? (x / totalEventos) * innerW : 0)
  const yScale = (y: number) => PAD_T + innerH - ((y - eloMin) / (eloMax - eloMin)) * innerH

  const pathExacto = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return ''
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x).toFixed(2)} ${yScale(p.y).toFixed(2)}`).join(' ')
  }

  const pathSuavizado = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return ''
    if (pts.length === 1) {
      const p = pts[0]
      return `M ${xScale(p.x).toFixed(2)} ${yScale(p.y).toFixed(2)}`
    }

    const xMin = pts[0].x
    const xMax = pts[pts.length - 1].x
    const rango = Math.max(1, xMax - xMin)

    const f = Math.max(0, Math.min(100, FIDELIDAD_SUAVIZADO)) / 100
    const PROP_MIN = 0.015
    const PROP_MAX = 0.35
    const proporcion = PROP_MAX - (PROP_MAX - PROP_MIN) * f
    const BANDWIDTH = Math.max(0.4, rango * proporcion)

    const NUM_MUESTRAS = 60
    const muestras: { x: number; y: number }[] = []

    for (let i = 0; i <= NUM_MUESTRAS; i++) {
      const x = xMin + (i / NUM_MUESTRAS) * rango
      let sumaPesos = 0
      let sumaPesoY = 0
      for (const p of pts) {
        const d = (p.x - x) / BANDWIDTH
        const peso = Math.exp(-0.5 * d * d)
        sumaPesos += peso
        sumaPesoY += peso * p.y
      }
      const y = sumaPesos > 0 ? sumaPesoY / sumaPesos : p_fallback(pts, x)
      muestras.push({ x, y })
    }

    const sx = muestras.map(p => xScale(p.x))
    const sy = muestras.map(p => yScale(p.y))
    const n = muestras.length
    const T = 0.5

    let d = `M ${sx[0].toFixed(2)} ${sy[0].toFixed(2)}`
    for (let i = 0; i < n - 1; i++) {
      const p0x = i > 0 ? sx[i - 1] : sx[i]
      const p0y = i > 0 ? sy[i - 1] : sy[i]
      const p1x = sx[i]
      const p1y = sy[i]
      const p2x = sx[i + 1]
      const p2y = sy[i + 1]
      const p3x = i < n - 2 ? sx[i + 2] : sx[i + 1]
      const p3y = i < n - 2 ? sy[i + 2] : sy[i + 1]

      const cp1x = p1x + (p2x - p0x) * (T / 3)
      const cp1y = p1y + (p2y - p0y) * (T / 3)
      const cp2x = p2x - (p3x - p1x) * (T / 3)
      const cp2y = p2y - (p3y - p1y) * (T / 3)

      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2x.toFixed(2)} ${p2y.toFixed(2)}`
    }
    return d
  }

  function p_fallback(pts: { x: number; y: number }[], x: number): number {
    let closest = pts[0]
    let minDist = Infinity
    for (const p of pts) {
      const dist = Math.abs(p.x - x)
      if (dist < minDist) { minDist = dist; closest = p }
    }
    return closest.y
  }

  const pathFor = (pts: { x: number; y: number }[]) => modoSuavizado ? pathSuavizado(pts) : pathExacto(pts)

  const areaPathFor = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return ''
    const linePath = pathFor(pts)
    const firstX = xScale(pts[0].x).toFixed(2)
    const lastX = xScale(pts[pts.length - 1].x).toFixed(2)
    const baseY = (H - PAD_B).toFixed(2)
    return `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`
  }

  const numGridLines = 5
  const gridValues = Array.from({ length: numGridLines + 1 }, (_, i) => {
    return eloMin + (i / numGridLines) * (eloMax - eloMin)
  })

  const equiposConDatos = equipos.filter(eq => (series.get(eq.id)?.length ?? 0) > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap', rowGap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Modo de curva
        </span>
        <div style={{
          display: 'flex', borderRadius: '20px', border: '1px solid var(--color-border)',
          background: 'rgba(255,255,255,0.03)', padding: '3px', gap: '2px',
        }}>
          <button
            onClick={() => setModoSuavizado(false)}
            style={{
              padding: '5px 12px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700,
              background: !modoSuavizado ? 'var(--color-accent)' : 'transparent',
              color: !modoSuavizado ? '#00291f' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.15s',
            }}
          >
            Exacto
          </button>
          <button
            onClick={() => setModoSuavizado(true)}
            style={{
              padding: '5px 12px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700,
              background: modoSuavizado ? 'var(--color-accent)' : 'transparent',
              color: modoSuavizado ? '#00291f' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.15s',
            }}
          >
            Suavizado
          </button>
        </div>
      </div>

      <div style={{ width: '100%', flex: 1, minHeight: 0, paddingLeft: '4px' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            {equiposConDatos.map((eq, idx) => {
              const color = colorEquipo(eq.id, idx)
              return (
                <linearGradient key={eq.id} id={`elo-area-gradient-${eq.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.07} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              )
            })}
          </defs>

          {gridValues.map((val, i) => {
            const y = yScale(val)
            return (
              <g key={i}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize={11} fill="rgba(255,255,255,0.4)">
                  {Math.round(val)}
                </text>
              </g>
            )
          })}

          <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />

          {equiposConDatos.map((eq, _idx) => {
            if (ocultos[eq.id]) return null
            const pts = series.get(eq.id) || []
            if (pts.length === 0) return null
            return (
              <path
                key={`area-${eq.id}`}
                d={areaPathFor(pts)}
                fill={`url(#elo-area-gradient-${eq.id})`}
                stroke="none"
              />
            )
          })}

          {equiposConDatos.map((eq, idx) => {
            if (ocultos[eq.id]) return null
            const pts = series.get(eq.id) || []
            if (pts.length === 0) return null
            const color = colorEquipo(eq.id, idx)
            return (
              <g key={eq.id}>
                <path d={pathFor(pts)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
                {!modoSuavizado && pts.map((p, i) => (
                  <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={2.5} fill={color} />
                ))}
              </g>
            )
          })}
        </svg>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
        {equiposConDatos.map((eq, idx) => {
          const color = colorEquipo(eq.id, idx)
          const oculto = !!ocultos[eq.id]
          return (
            <button
              key={eq.id}
              onClick={() => toggleEquipo(eq.id)}
              title={eq.nombre}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '5px 9px', borderRadius: '20px',
                background: oculto ? 'rgba(255,255,255,0.03)' : `${color}1A`,
                border: `1px solid ${oculto ? 'var(--color-border)' : `${color}66`}`,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <span style={{
                width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0,
                background: oculto ? 'rgba(255,255,255,0.25)' : color,
              }} />
              {eq.escudo_url && (
                <img src={eq.escudo_url} style={{ width: 14, height: 14, objectFit: 'contain', opacity: oculto ? 0.4 : 1 }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Gráfica de progresión de ELO para UN SOLO equipo. Reutiliza la misma
// lógica de trazado (suavizado/exacto) que GraficaProgresionElo, pero
// construye una única serie a partir del historial completo, filtrando solo
// las entradas donde el equipo seleccionado participó (como local o
// visitante). No incluye leyenda con toggle, ya que solo hay un equipo. ───
function GraficaProgresionEloEquipo({
  historial,
  equipoId,
  color,
}: {
  historial: EloEntry[]
  equipoId: string
  color: string
}) {
  const [modoSuavizado, setModoSuavizado] = useState(true)
  const FIDELIDAD_SUAVIZADO = 95

  const { serie, totalEventos, eloMin, eloMax } = useMemo(() => {
    const pts: { x: number; y: number }[] = []
    let x = 0
    historial.forEach(entry => {
      const esLocal = entry.equipoLocalId === equipoId
      const esVisitante = entry.equipoVisitanteId === equipoId
      if (!esLocal && !esVisitante) return
      x++
      if (pts.length === 0) {
        pts.push({ x: 0, y: esLocal ? entry.eloLocalAntes : entry.eloVisitanteAntes })
      }
      pts.push({ x, y: esLocal ? entry.eloLocalDespues : entry.eloVisitanteDespues })
    })

    let min = Infinity
    let max = -Infinity
    pts.forEach(p => {
      if (p.y < min) min = p.y
      if (p.y > max) max = p.y
    })
    if (!isFinite(min) || !isFinite(max)) { min = 1400; max = 1600 }
    if (min === max) { min -= 50; max += 50 }

    return { serie: pts, totalEventos: x, eloMin: min, eloMax: max }
  }, [historial, equipoId])

  if (serie.length === 0) {
    return (
      <div style={{ padding: '40px', borderRadius: '12px', border: '2px dashed var(--color-border)', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
        No hay suficientes partidos para calcular la progresión de ELO de este equipo.
      </div>
    )
  }

  const W = 2000
  const H = 140
  const PAD_L = 5
  const PAD_R = 10
  const PAD_T = 10
  const PAD_B = 6
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const xScale = (x: number) => PAD_L + (totalEventos > 0 ? (x / totalEventos) * innerW : 0)
  const yScale = (y: number) => PAD_T + innerH - ((y - eloMin) / (eloMax - eloMin)) * innerH

  const pathExacto = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return ''
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x).toFixed(2)} ${yScale(p.y).toFixed(2)}`).join(' ')
  }

  const pathSuavizado = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return ''
    if (pts.length === 1) {
      const p = pts[0]
      return `M ${xScale(p.x).toFixed(2)} ${yScale(p.y).toFixed(2)}`
    }

    const xMin = pts[0].x
    const xMax = pts[pts.length - 1].x
    const rango = Math.max(1, xMax - xMin)

    const f = Math.max(0, Math.min(100, FIDELIDAD_SUAVIZADO)) / 100
    const PROP_MIN = 0.015
    const PROP_MAX = 0.35
    const proporcion = PROP_MAX - (PROP_MAX - PROP_MIN) * f
    const BANDWIDTH = Math.max(0.4, rango * proporcion)

    const NUM_MUESTRAS = 80
    const muestras: { x: number; y: number }[] = []

    for (let i = 0; i <= NUM_MUESTRAS; i++) {
      const x = xMin + (i / NUM_MUESTRAS) * rango
      let sumaPesos = 0
      let sumaPesoY = 0
      for (const p of pts) {
        const d = (p.x - x) / BANDWIDTH
        const peso = Math.exp(-0.5 * d * d)
        sumaPesos += peso
        sumaPesoY += peso * p.y
      }
      const y = sumaPesos > 0 ? sumaPesoY / sumaPesos : pts.reduce((closest, p) =>
        Math.abs(p.x - x) < Math.abs(closest.x - x) ? p : closest
      ).y
      muestras.push({ x, y })
    }

    const sx = muestras.map(p => xScale(p.x))
    const sy = muestras.map(p => yScale(p.y))
    const n = muestras.length
    const T = 0.5

    let d = `M ${sx[0].toFixed(2)} ${sy[0].toFixed(2)}`
    for (let i = 0; i < n - 1; i++) {
      const p0x = i > 0 ? sx[i - 1] : sx[i]
      const p0y = i > 0 ? sy[i - 1] : sy[i]
      const p1x = sx[i]
      const p1y = sy[i]
      const p2x = sx[i + 1]
      const p2y = sy[i + 1]
      const p3x = i < n - 2 ? sx[i + 2] : sx[i + 1]
      const p3y = i < n - 2 ? sy[i + 2] : sy[i + 1]

      const cp1x = p1x + (p2x - p0x) * (T / 3)
      const cp1y = p1y + (p2y - p0y) * (T / 3)
      const cp2x = p2x - (p3x - p1x) * (T / 3)
      const cp2y = p2y - (p3y - p1y) * (T / 3)

      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2x.toFixed(2)} ${p2y.toFixed(2)}`
    }
    return d
  }

  const pathFor = modoSuavizado ? pathSuavizado(serie) : pathExacto(serie)

  const areaPathFor = () => {
    if (serie.length === 0) return ''
    const firstX = xScale(serie[0].x).toFixed(2)
    const lastX = xScale(serie[serie.length - 1].x).toFixed(2)
    const baseY = (H - PAD_B).toFixed(2)
    return `${pathFor} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`
  }

  const numGridLines = 5
  const gridValues = Array.from({ length: numGridLines + 1 }, (_, i) => {
    return eloMin + (i / numGridLines) * (eloMax - eloMin)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Modo de curva
        </span>
        <div style={{
          display: 'flex', borderRadius: '20px', border: '1px solid var(--color-border)',
          background: 'rgba(255,255,255,0.03)', padding: '3px', gap: '2px',
        }}>
          <button
            onClick={() => setModoSuavizado(false)}
            style={{
              padding: '5px 12px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700,
              background: !modoSuavizado ? 'var(--color-accent)' : 'transparent',
              color: !modoSuavizado ? '#00291f' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.15s',
            }}
          >
            Exacto
          </button>
          <button
            onClick={() => setModoSuavizado(true)}
            style={{
              padding: '5px 12px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700,
              background: modoSuavizado ? 'var(--color-accent)' : 'transparent',
              color: modoSuavizado ? '#00291f' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.15s',
            }}
          >
            Suavizado
          </button>
        </div>
      </div>

      <div style={{ width: '100%', height: '90px' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            <linearGradient id="elo-area-gradient-equipo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.12} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {gridValues.map((val, i) => {
            const y = yScale(val)
            return (
              <g key={i}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize={12} fill="rgba(255,255,255,0.4)">
                  {Math.round(val)}
                </text>
              </g>
            )
          })}

          <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />

          <path d={areaPathFor()} fill="url(#elo-area-gradient-equipo)" stroke="none" />

          <path d={pathFor} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
          {!modoSuavizado && serie.map((p, i) => (
            <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={3.5} fill={color} />
          ))}
        </svg>
      </div>
    </div>
  )
}

// ─── Mapa de goles de un equipo específico. Los goles anotados de visitante
// se invierten en espejo (100 - x, 100 - y) para que siempre se representen
// desde la perspectiva de ataque del equipo seleccionado. Cada punto es más
// pequeño que en el historial de partidos y no lleva número.
//
// La imagen de la cancha se muestra COMPLETA dentro del contenedor (sin
// recortes) usando un ajuste tipo "contain" calculado manualmente, alineada
// a la izquierda. Como el contenedor puede tener una proporción distinta a
// la de la imagen original, el rectángulo real que ocupa la imagen dentro
// del contenedor puede no coincidir con el 100% de su ancho/alto; por eso
// se mide el tamaño natural de la imagen y el tamaño del contenedor con
// ResizeObserver, se calcula el rectángulo "contain" resultante, y tanto los
// puntos de gol como la franja de color del equipo (con su máscara) se
// posicionan y dimensionan sobre ESE rectángulo exacto, nunca sobre el
// contenedor completo. ───
function MapaGolesEquipo({ goles, colorEquipo }: { goles: { pos_x: number; pos_y: number }[]; colorEquipo: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [imgNaturalSize, setImgNaturalSize] = useState({ width: 0, height: 0 })
  const [heatmapUrl, setHeatmapUrl] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setContainerSize({ width, height })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.src = canchaImage
  }, [])

  const imgRect = useMemo(() => {
    const { width: cw, height: ch } = containerSize
    const { width: iw, height: ih } = imgNaturalSize
    if (!cw || !ch || !iw || !ih) {
      return { left: 0, top: 0, width: cw, height: ch }
    }
    const containerRatio = cw / ch
    const imgRatio = iw / ih
    let width: number
    let height: number
    if (imgRatio > containerRatio) {
      width = cw
      height = cw / imgRatio
    } else {
      height = ch
      width = ch * imgRatio
    }
    return {
      left: 0,
      top: (ch - height) / 2,
      width,
      height,
    }
  }, [containerSize, imgNaturalSize])

  // ─── Genera el heatmap cada vez que cambian los goles o el tamaño real
  // del rectángulo de la cancha, usando resolución nativa de ese rectángulo
  // para que el blur se vea nítido a cualquier escala de pantalla. ───
  useEffect(() => {
    if (imgRect.width === 0 || imgRect.height === 0 || goles.length === 0) {
      setHeatmapUrl(null)
      return
    }
    const radio = imgRect.width * 0.25
    const url = generarHeatmapDataUrl(goles, Math.round(imgRect.width), Math.round(imgRect.height), radio, 0.25)
    setHeatmapUrl(url)
  }, [goles, imgRect.width, imgRect.height])

  if (goles.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', padding: '30px' }}>
        No hay goles con ubicación registrada para este equipo.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        flex: 1,
        minHeight: 0,
        borderRadius: '10px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${imgRect.left}px`,
          top: `${imgRect.top}px`,
          width: `${imgRect.width}px`,
          height: `${imgRect.height}px`,
        }}
      >
        <img
          src={canchaImage}
          alt=""
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'fill',
            zIndex: 1,
          }}
        />
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
          background: `linear-gradient(to right,
            ${colorEquipo} 0%, ${colorEquipo} 6.58%,
            transparent 6.58%, transparent 100%)`,
          mixBlendMode: 'multiply',
          WebkitMaskImage: `url(${canchaImage})`,
          maskImage: `url(${canchaImage})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }} />
        {/* ─── Mapa de calor: capa intermedia entre la cancha y los puntos de
            gol, recortada con la misma silueta de la cancha usada arriba. ─── */}
        {heatmapUrl && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
            WebkitMaskImage: `url(${canchaImage})`,
            maskImage: `url(${canchaImage})`,
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
          }}>
            <img
              src={heatmapUrl}
              alt=""
              style={{
                width: '100%', height: '100%',
                objectFit: 'fill',
                mixBlendMode: 'screen',
                opacity: 0.85,
              }}
            />
          </div>
        )}
        {goles.map((gol, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${gol.pos_x}%`,
            top: `${gol.pos_y}%`,
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            backgroundColor: darkenHex(colorEquipo, 0.6),
            border: `2px solid ${colorEquipo}`,
            transform: 'translate(-50%, -50%)',
            boxShadow: `0 0 8px ${colorEquipo}`,
            zIndex: 5,
          }} />
        ))}
      </div>
    </div>
  )
}

// ─── Progresión de goles por intervalos de minutos, para el equipo
// seleccionado. Mantiene EXACTAMENTE el mismo formato que la versión
// original (barras horizontales lado a lado, cada una con ancho
// proporcional a su cantidad de goles, y el conjunto de barras ocupando
// siempre el 100% del ancho disponible), solo que ahora vive en el espacio
// que queda libre a la derecha del mapa de goles, por lo que ese "100% del
// ancho disponible" es más angosto que el ancho completo de la página. Es
// un contenedor propio cuya altura se ajusta a su contenido (no se estira). ───
function ProgresionGolesLateral({
  conteos,
  escudoUrl,
}: {
  conteos: number[]
  escudoUrl?: string | null
}) {
  const totalGoles = conteos.reduce((a, b) => a + b, 0)
  const ANCHO_MIN_PCT = 2
  const anchoDisponible = 100 - ANCHO_MIN_PCT * INTERVALOS_GOLES.length
  const anchosPct = conteos.map(c =>
    totalGoles > 0
      ? ANCHO_MIN_PCT + (c / totalGoles) * anchoDisponible
      : 100 / INTERVALOS_GOLES.length
  )

  return (
    <div style={{
      flexShrink: 0,
      width: '100%',
      borderRadius: '12px',
      border: '2px solid var(--color-border)',
      background: 'var(--color-background)',
      padding: '16px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <BarChart3 size={16} color="var(--color-accent)" />
        <h3 style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: 'var(--color-textWH)' }}>
          Progresión de goles por intervalos de minutos
        </h3>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {escudoUrl
          ? <img src={escudoUrl} style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} />
          : <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--color-border)', flexShrink: 0 }} />
        }
        <div style={{ flex: 1, display: 'flex', gap: 4 }}>
          {INTERVALOS_GOLES.map((iv, i) => {
            const conteo = conteos[i]
            return (
              <div
                key={iv.label}
                style={{
                  width: `${anchosPct[i]}%`,
                  transition: 'width 0.4s ease',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  minWidth: 0,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-textWH)' }}>{conteo}</span>
                <div style={{ width: '100%', height: 7, borderRadius: 4, background: INTERVALO_COLORES[i] }} />
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {INTERVALOS_GOLES.map((iv, i) => (
          <span key={iv.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: INTERVALO_COLORES[i], display: 'inline-block' }} />
            {iv.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Power-ups usados por el equipo seleccionado: todos los power-ups en
// una sola línea horizontal, ordenados de forma descendente por cantidad
// (el más usado a la izquierda). Si no caben todos en el ancho disponible,
// un difuminado al final del contenedor sugiere que hay más sin necesidad
// de scroll visible. Es un contenedor propio, independiente del de la
// progresión de goles, cuya altura se ajusta a su propio contenido. ───
function PowerupsUsadosLateral({
  powerups,
}: {
  powerups: { powerupId: string; nombre: string; cantidad: number }[]
}) {
  return (
    <div style={{
      flexShrink: 0,
      width: '100%',
      borderRadius: '12px',
      border: '2px solid var(--color-border)',
      background: 'var(--color-background)',
      padding: '16px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Zap size={14} color="var(--color-accent)" />
        <h3 style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: 'var(--color-textWH)' }}>
          Power-ups usados
        </h3>
      </div>
      {powerups.length === 0 ? (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Sin power-ups registrados.</span>
      ) : (
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 6, overflow: 'hidden' }}>
            {powerups.map(pu => (
              <div key={pu.powerupId} style={{
                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                background: 'rgba(0,200,140,0.1)', borderRadius: 6,
                padding: '3px 7px', border: '1px solid rgba(0,200,140,0.3)',
              }}>
                <img src={POWERUP_IMAGES[pu.nombre] ?? ''} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>{pu.cantidad}</span>
              </div>
            ))}
          </div>
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: '32px',
            background: 'linear-gradient(to right, transparent, var(--color-background))',
            pointerEvents: 'none',
          }} />
        </div>
      )}
    </div>
  )
}

// ─── Últimos 5 partidos del equipo seleccionado, en formato compacto lateral
// EN LÍNEA: todas las mini-tarjetas de partido una al lado de la otra en
// una sola fila horizontal, en vez de apiladas como lista. Mismo criterio
// visual que la versión original: círculo de resultado (verde/rojo/gris con
// check, X o guion), escudo del rival y marcador. Si no caben todas en el
// ancho disponible, un difuminado al final del contenedor (mismo patrón que
// power-ups usados) sugiere que hay más sin necesidad de scroll visible.
//
// Este contenedor se extiende para ocupar todo el espacio vertical restante
// de la columna lateral (a diferencia de los otros dos, que se ajustan a su
// contenido), y cada card de partido se estira para ocupar tanto el ancho
// como el alto disponibles, mostrando la mayor cantidad de información
// posible: resultado, escudo + nombre del rival, marcador y fecha. ───
function UltimosCincoPartidosLateral({
  partidos,
  equipoId,
  equipoById,
  eloHistorialPorPartidoId,
}: {
  partidos: Partido[]
  equipoId: string
  equipoById: (id: string) => Equipo | undefined
  eloHistorialPorPartidoId: Record<string, EloEntry>
}) {
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      width: '100%',
      borderRadius: '12px',
      border: '2px solid var(--color-border)',
      background: 'var(--color-background)',
      padding: '16px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Calendar size={14} color="var(--color-accent)" />
        <h3 style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: 'var(--color-textWH)' }}>
          Últimos 5 partidos
        </h3>
      </div>
      {partidos.length === 0 ? (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Sin partidos en el filtro seleccionado.</span>
      ) : (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 8, height: '100%' }}>
            {partidos.map(p => {
              const esLocal = p.equipo_local_id === equipoId
              const gRef = esLocal ? p.goles_local : p.goles_visitante
              const gOtro = esLocal ? p.goles_visitante : p.goles_local
              const gano = (gRef ?? 0) > (gOtro ?? 0)
              const perdio = (gRef ?? 0) < (gOtro ?? 0)
              const rival = equipoById(esLocal ? p.equipo_visitante_id : p.equipo_local_id)

              const color = gano ? '#00C88C' : (perdio ? '#FF4D4D' : '#9CA3AF')
              const bg = gano ? 'rgba(0,200,140,0.12)' : (perdio ? 'rgba(255,77,77,0.12)' : 'rgba(156,163,175,0.12)')

              const eloEntry = eloHistorialPorPartidoId[p.id]
              const eloDespues = eloEntry
                ? (esLocal ? eloEntry.eloLocalDespues : eloEntry.eloVisitanteDespues)
                : null
              const eloAntes = eloEntry
                ? (esLocal ? eloEntry.eloLocalAntes : eloEntry.eloVisitanteAntes)
                : null
              const eloDelta = eloDespues != null && eloAntes != null
                ? Math.round(eloDespues) - Math.round(eloAntes)
                : null
              const eloColor = gano ? '#00C88C' : (perdio ? '#FF4D4D' : '#9CA3AF')
              const EloIcon = eloDelta != null ? (eloDelta > 0 ? TrendingUp : (eloDelta < 0 ? TrendingDown : Minus)) : Minus

              const colorRGB = gano ? '0,200,140' : (perdio ? '255,77,77' : '156,163,175')

              return (
                <div key={p.id} style={{
                  flex: '1 1 0%', minWidth: 0,
                  display: 'flex', flexDirection: 'column', gap: 6,
                  padding: '8px', borderRadius: 8,
                  border: `1px solid rgba(${colorRGB},0.5)`,
                  background: `linear-gradient(180deg, rgba(${colorRGB},0.10) 0%, var(--color-background) 100%)`,
                  boxShadow: `0 0 0 1px rgba(${colorRGB},0.12), 0 4px 14px rgba(0,0,0,0.25)`,
                }}>
                  {/* Fila superior: resultado a la izquierda, escudo rival a la derecha */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: bg, border: `2px solid ${color}`,
                    }}>
                      {gano ? <Check size={12} color={color} strokeWidth={3} /> : perdio ? <XIcon size={12} color={color} strokeWidth={3} /> : <Minus size={12} color={color} strokeWidth={3} />}
                    </div>
                    {rival?.escudo_url
                      ? <img src={rival.escudo_url} style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} />
                      : <div style={{ width: 26, height: 26, borderRadius: 5, background: 'var(--color-border)', flexShrink: 0 }} />
                    }
                  </div>

                  <span style={{
                    fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.6)',
                    textAlign: 'center', maxWidth: '100%',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {rival?.nombre ?? '—'}
                  </span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-textWH)', whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {gRef ?? '–'} : {gOtro ?? '–'}
                  </span>
                  {p.inicio_timestamp && (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', textAlign: 'center' }}>
                      {new Date(p.inicio_timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                  {eloDespues != null && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                      <EloIcon size={10} color={eloColor} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: eloColor }}>
                        {Math.round(eloDespues)}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Estadisticas() {
  const navigate = useNavigate()

  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [torneos, setTorneos] = useState<Torneo[]>([])
  const [loading, setLoading] = useState(true)

  // null = "Global" en ambos dropdowns
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<Equipo | null>(null)
  const [torneoSeleccionado, setTorneoSeleccionado] = useState<Torneo | null>(null)

  const [dropdownEquipoOpen, setDropdownEquipoOpen] = useState(false)
  const [dropdownTorneoOpen, setDropdownTorneoOpen] = useState(false)

  // ─── Estadísticas globales (equipo = Global) ───
  const [statsGlobales, setStatsGlobales] = useState<EquipoStatsGlobal[]>([])
  const [loadingStatsGlobales, setLoadingStatsGlobales] = useState(false)

  // ─── Historial de partidos GLOBAL (todos los torneos, sin filtrar) ───
  const [teamMatches, setTeamMatches] = useState<MatchDetail[]>([])
  const [loadingTeamMatches, setLoadingTeamMatches] = useState(false)
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null)
  const [expandedMatchGoals, setExpandedMatchGoals] = useState<Gol[]>([])
  const [loadingMatchGoals, setLoadingMatchGoals] = useState(false)
  const [h2hExpandido, setH2hExpandido] = useState<Record<string, boolean>>({})
  const [h2hCache, setH2hCache] = useState<Record<string, Partido[]>>({})
  const [loadingH2h, setLoadingH2h] = useState(false)
  const [, setH2hCargado] = useState<Record<string, boolean>>({})
  const [torneosMap, setTorneosMap] = useState<Record<string, { edicion: string | null; nombre: string | null; numero: number }>>({})
  // Mapa completo de equipos (para poder resolver equipos aunque no estén en `equipos` filtrados de un torneo específico)
  const [equiposMap, setEquiposMap] = useState<Record<string, Equipo>>({})

  // ─── Sistema de clasificación ELO persistente e histórico ───
  // Se calcula UNA sola vez a partir de TODOS los partidos confirmados de
  // TODAS las ediciones, ordenados cronológicamente por inicio_timestamp.
  // No depende de la vista/filtro actual: siempre es el historial completo.
  const [partidosParaElo, setPartidosParaElo] = useState<PartidoParaElo[]>([])
  const [loadingElo, setLoadingElo] = useState(false)

  const resultadoElo = useMemo(() => calcularEloHistorico(partidosParaElo), [partidosParaElo])
  const eloHistorialPorPartidoId: Record<string, EloEntry> = resultadoElo.historialPorPartidoId
  const eloActualPorEquipo: Record<string, number> = resultadoElo.eloActualPorEquipo

  // ─── Estadísticas de UN equipo específico (vista equipo + Global/Torneo) ───
  const [statsEquipo, setStatsEquipo] = useState<{ pj: number; pg: number; pe: number; pp: number; gf: number; gc: number; powerupsUsados: number } | null>(null)
  const [loadingStatsEquipo, setLoadingStatsEquipo] = useState(false)
  const [partidosEquipo, setPartidosEquipo] = useState<Partido[]>([])
  const [golesEquipoRaw, setGolesEquipoRaw] = useState<Gol[]>([])
  const [powerupsDesgloseEquipo, setPowerupsDesgloseEquipo] = useState<{ powerupId: string; nombre: string; cantidad: number }[]>([])

  const [powerupsPorPartidoEquipo, setPowerupsPorPartidoEquipo] = useState<Record<string, { [equipoId: string]: PowerupInfo[] }>>({})

  const equipoById = useCallback((id: string) => equiposMap[id], [equiposMap])

  const edicionLabel = useCallback((torneoId?: string | null) => {
    if (!torneoId) return null
    const t = torneosMap[torneoId]
    if (!t) return null
    return t.edicion || `Torneo ${t.numero}`
  }, [torneosMap])

  const faseInfo = useCallback((partido: Partido): { letra: string; nombre: string; color: string } | null => {
    if (partido.ronda === 'final') return { letra: 'F', nombre: 'Final', color: '#FFC800' }
    if (partido.fase === 'eliminatorias') return { letra: 'E', nombre: 'Eliminatorias', color: '#FF4D4D' }
    if (partido.fase === 'grupos') return { letra: 'G', nombre: 'Grupos', color: 'rgba(255,255,255,0.5)' }
    return null
  }, [])

  // ─── Combina las estadísticas globales (PJ/PG/PE/PP/GF/GC/PU) con el ELO
  // actual de cada equipo (que viene del cálculo histórico independiente) y
  // determina el ORDEN FINAL de la tabla: el ELO es el criterio principal. ───
  const statsGlobalesConElo = useMemo(() => {
    return statsGlobales
      .map(s => ({
        ...s,
        elo: eloActualPorEquipo[s.equipo.id] ?? null,
      }))
      .sort((a, b) => {
        const eloA = a.elo ?? -Infinity
        const eloB = b.elo ?? -Infinity
        if (eloB !== eloA) return eloB - eloA
        if (b.pg !== a.pg) return b.pg - a.pg
        return (a.equipo?.nombre ?? '').localeCompare(b.equipo?.nombre ?? '')
      })
  }, [statsGlobales, eloActualPorEquipo])

  // ─── Carga inicial: todos los equipos (sin filtrar por torneo) y todos los torneos ───
  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      try {
        const { data: equiposData } = await supabase
          .from('equipos')
          .select('id, nombre, escudo_url, color_hex, dt')
          .order('nombre', { ascending: true })
        setEquipos(equiposData || [])

        const map: Record<string, Equipo> = {}
        ;(equiposData || []).forEach(eq => { map[eq.id] = eq as Equipo })
        setEquiposMap(map)

        const { data: torneosData } = await supabase
          .from('torneos')
          .select('id, numero, nombre, edicion, estado, activo, orden')
          .order('orden', { ascending: true })
        setTorneos((torneosData || []) as Torneo[])

        const tMap: Record<string, { edicion: string | null; nombre: string | null; numero: number }> = {}
        ;(torneosData || []).forEach(t => {
          tMap[t.id] = { edicion: t.edicion ?? null, nombre: t.nombre ?? null, numero: t.numero }
        })
        setTorneosMap(tMap)
      } catch (error) {
        console.error('Error cargando datos de estadísticas:', error)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [])

  // ─── Carga de TODOS los partidos confirmados de TODAS las ediciones, para
  // alimentar el cálculo del ELO histórico. Es independiente del filtro/vista
  // actual (Global o equipo específico): el ELO siempre se calcula sobre el
  // historial completo, ya que un equipo conserva su ELO acumulado entre
  // ediciones y no puede recalcularse con información aislada. ───
  useEffect(() => {
    const cargarPartidosParaElo = async () => {
      setLoadingElo(true)
      try {
        let desde = 0
        const tamanoPagina = 1000
        let todos: PartidoParaElo[] = []
        while (true) {
          const { data: pagina } = await supabase
            .from('partidos')
            .select('id, equipo_local_id, equipo_visitante_id, goles_local, goles_visitante, fase, ronda, inicio_timestamp, confirmado')
            .eq('confirmado', true)
            .order('id', { ascending: true })
            .range(desde, desde + tamanoPagina - 1)
          if (!pagina || pagina.length === 0) break
          todos = todos.concat(pagina as PartidoParaElo[])
          if (pagina.length < tamanoPagina) break
          desde += tamanoPagina
        }
        setPartidosParaElo(todos)
      } catch (error) {
        console.error('Error cargando partidos para el cálculo de ELO:', error)
      } finally {
        setLoadingElo(false)
      }
    }
    cargarPartidosParaElo()
  }, [])

  // ─── Si el equipo es "Global" (null), forzamos el torneo también a "Global" ───
  useEffect(() => {
    if (!equipoSeleccionado) {
      setTorneoSeleccionado(null)
    }
  }, [equipoSeleccionado])

  // ─── Carga de estadísticas GLOBALES (todos los equipos): historial completo ───
  useEffect(() => {
    if (equipoSeleccionado || equipos.length === 0) return

    let cancelado = false

    const cargarStatsGlobales = async () => {
      setLoadingStatsGlobales(true)
      try {
        // ─── Historial: todos los partidos con marcador ───
        const { data: partidosData } = await supabase
          .from('partidos')
          .select('equipo_local_id, equipo_visitante_id, goles_local, goles_visitante')
          .not('goles_local', 'is', null)
          .not('goles_visitante', 'is', null)

        const statsMap = new Map<string, { pj: number; pg: number; pe: number; pp: number; gf: number; gc: number }>()
        equipos.forEach(eq => statsMap.set(eq.id, { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 }))

        partidosData?.forEach(p => {
          const local = statsMap.get(p.equipo_local_id)
          const visitante = statsMap.get(p.equipo_visitante_id)
          if (!local || !visitante || p.goles_local == null || p.goles_visitante == null) return
          local.pj++; visitante.pj++
          local.gf += p.goles_local; local.gc += p.goles_visitante
          visitante.gf += p.goles_visitante; visitante.gc += p.goles_local
          if (p.goles_local > p.goles_visitante) { local.pg++; visitante.pp++ }
          else if (p.goles_local < p.goles_visitante) { visitante.pg++; local.pp++ }
          else { local.pe++; visitante.pe++ }
        })

        // ─── Power‑ups usados ───
        const { data: partidosValidosData } = await supabase
          .from('partidos')
          .select('id')

        const idsPartidosValidos = new Set((partidosValidosData || []).map(p => p.id))

        let puUsadosData: { equipo_id: string; powerup_id: string; cantidad: number; partido_id: string }[] = []
        {
          let desde = 0
          const tamanoPagina = 1000
          while (true) {
            const { data: pagina } = await supabase
              .from('powerups_usados')
              .select('equipo_id, powerup_id, cantidad, partido_id')
              .order('id', { ascending: true })
              .range(desde, desde + tamanoPagina - 1)
            if (!pagina || pagina.length === 0) break
            puUsadosData = puUsadosData.concat(pagina)
            if (pagina.length < tamanoPagina) break
            desde += tamanoPagina
          }
        }

        puUsadosData = puUsadosData.filter(pu => idsPartidosValidos.has(pu.partido_id))

        const powerupsPorEquipo: Record<string, Record<string, number>> = {}
        equipos.forEach(eq => { powerupsPorEquipo[eq.id] = {} })
        puUsadosData.forEach(pu => {
          if (powerupsPorEquipo[pu.equipo_id]) {
            powerupsPorEquipo[pu.equipo_id][pu.powerup_id] = (powerupsPorEquipo[pu.equipo_id][pu.powerup_id] || 0) + pu.cantidad
          }
        })

        const totalPowerupsPorEquipo: Record<string, number> = {}
        const favoritoPorEquipo: Record<string, PowerupFavorito | null> = {}

        equipos.forEach(eq => {
          const dict = powerupsPorEquipo[eq.id] || {}
          const total = Object.values(dict).reduce((a, b) => a + b, 0)
          totalPowerupsPorEquipo[eq.id] = total
        })

        const { data: catalogoData } = await supabase
          .from('powerups_catalogo')
          .select('id, nombre')
        const catalogoMap: Record<string, string> = {}
        catalogoData?.forEach(c => { catalogoMap[c.id] = c.nombre })

        equipos.forEach(eq => {
          const dict = powerupsPorEquipo[eq.id] || {}
          let maxCant = 0
          let favoritoId = ''
          Object.entries(dict).forEach(([powerupId, cantidad]) => {
            if (cantidad > maxCant) {
              maxCant = cantidad
              favoritoId = powerupId
            }
          })
          const nombre = catalogoMap[favoritoId] || ''
          favoritoPorEquipo[eq.id] = maxCant > 0 ? { powerupId: favoritoId, nombre, cantidad: maxCant } : null
        })

        const stats: EquipoStatsGlobal[] = equipos.map(eq => {
          const s = statsMap.get(eq.id)!
          return {
            equipo: eq,
            pj: s.pj, pg: s.pg, pe: s.pe, pp: s.pp, gf: s.gf, gc: s.gc,
            powerupsUsados: totalPowerupsPorEquipo[eq.id] || 0,
            powerupFavorito: favoritoPorEquipo[eq.id],
            // El ELO se completa/ordena en `statsGlobalesConElo` (useMemo aparte),
            // ya que depende del cálculo histórico independiente de partidosParaElo.
            elo: null,
          }
        })

        if (!cancelado) {
          setStatsGlobales(stats)
        }
      } catch (error) {
        console.error('Error cargando estadísticas globales:', error)
      } finally {
        if (!cancelado) setLoadingStatsGlobales(false)
      }
    }

    cargarStatsGlobales()

    return () => { cancelado = true }
  }, [equipoSeleccionado, equipos])

  // ─── Carga del HISTORIAL DE PARTIDOS GLOBAL: todos los partidos jugados,
  // de todos los torneos, sin discriminar por torneo. Misma lógica que
  // teamMatches en Public.tsx (incluye power-ups por partido). ───
  useEffect(() => {
    if (equipoSeleccionado) return // solo en vista Global

    let cancelado = false

    const cargarHistorialGlobal = async () => {
      setLoadingTeamMatches(true)
      try {
        const { data: partidosJugados } = await supabase
          .from('partidos')
          .select('*')
          .eq('confirmado', true)

        const todosPartidos = (partidosJugados || []) as Partido[]
        const partidosIds = todosPartidos.map(p => p.id)

        if (partidosIds.length === 0) {
          if (!cancelado) setTeamMatches([])
          return
        }

        const { data: puUsados } = await supabase
          .from('powerups_usados')
          .select('partido_id, equipo_id, powerup_id, cantidad')
          .in('partido_id', partidosIds)
        const { data: catalogo } = await supabase.from('powerups_catalogo').select('id, nombre')

        const powerupsByMatch: Record<string, Record<string, PowerupInfo[]>> = {}
        puUsados?.forEach(pu => {
          if (!powerupsByMatch[pu.partido_id]) powerupsByMatch[pu.partido_id] = {}
          if (!powerupsByMatch[pu.partido_id][pu.equipo_id]) powerupsByMatch[pu.partido_id][pu.equipo_id] = []
          const cat = catalogo?.find(c => c.id === pu.powerup_id)
          if (cat) {
            const exist = powerupsByMatch[pu.partido_id][pu.equipo_id].find(x => x.powerupId === pu.powerup_id)
            if (exist) exist.cantidad += pu.cantidad
            else powerupsByMatch[pu.partido_id][pu.equipo_id].push({ powerupId: pu.powerup_id, nombre: cat.nombre, cantidad: pu.cantidad })
          }
        })

        const matchesConPowerups: MatchDetail[] = todosPartidos.map(p => ({
          partido: p,
          powerups: powerupsByMatch[p.id] || {},
        }))
        matchesConPowerups.sort((a, b) => {
          const ta = a.partido.inicio_timestamp
            ? new Date(a.partido.inicio_timestamp).getTime()
            : (a.partido.created_at ? new Date(a.partido.created_at).getTime() : 0)
          const tb = b.partido.inicio_timestamp
            ? new Date(b.partido.inicio_timestamp).getTime()
            : (b.partido.created_at ? new Date(b.partido.created_at).getTime() : 0)
          return tb - ta
        })

        if (!cancelado) setTeamMatches(matchesConPowerups)
      } catch (error) {
        console.error('Error cargando historial global de partidos:', error)
      } finally {
        if (!cancelado) setLoadingTeamMatches(false)
      }
    }

    cargarHistorialGlobal()

    return () => { cancelado = true }
  }, [equipoSeleccionado])

  // ─── Carga de estadísticas de UN EQUIPO ESPECÍFICO, filtradas por torneo
  // seleccionado (o Global = todas las ediciones). Trae: PJ/PG/PE/PP/GF/GC/PU,
  // todos los partidos jugados por el equipo (para calcular últimos 5 e
  // historial), y todos los goles anotados por el equipo con posición, para
  // dibujar el mapa de goles (en espejo cuando jugó de visitante). ───
  useEffect(() => {
    if (!equipoSeleccionado) return

    let cancelado = false

    const cargarStatsEquipo = async () => {
      setLoadingStatsEquipo(true)
      try {
        let queryLocal = supabase
          .from('partidos')
          .select('*')
          .eq('equipo_local_id', equipoSeleccionado.id)
          .not('goles_local', 'is', null)
          .not('goles_visitante', 'is', null)
        let queryVisitante = supabase
          .from('partidos')
          .select('*')
          .eq('equipo_visitante_id', equipoSeleccionado.id)
          .not('goles_local', 'is', null)
          .not('goles_visitante', 'is', null)

        if (torneoSeleccionado) {
          queryLocal = queryLocal.eq('torneo_id', torneoSeleccionado.id)
          queryVisitante = queryVisitante.eq('torneo_id', torneoSeleccionado.id)
        }

        const [{ data: comoLocal }, { data: comoVisitante }] = await Promise.all([queryLocal, queryVisitante])

        const todosPartidos = [...(comoLocal || []), ...(comoVisitante || [])] as Partido[]
        todosPartidos.sort((a, b) => {
          const ta = a.inicio_timestamp ? new Date(a.inicio_timestamp).getTime() : 0
          const tb = b.inicio_timestamp ? new Date(b.inicio_timestamp).getTime() : 0
          return tb - ta
        })

        let pj = 0, pg = 0, pe = 0, pp = 0, gf = 0, gc = 0
        todosPartidos.forEach(p => {
          const esLocal = p.equipo_local_id === equipoSeleccionado.id
          const gRef = esLocal ? p.goles_local : p.goles_visitante
          const gOtro = esLocal ? p.goles_visitante : p.goles_local
          pj++
          gf += gRef ?? 0
          gc += gOtro ?? 0
          if ((gRef ?? 0) > (gOtro ?? 0)) pg++
          else if ((gRef ?? 0) < (gOtro ?? 0)) pp++
          else pe++
        })

        // ─── Power-ups usados por el equipo, filtrados a los mismos partidos.
        // Se trae también el powerup_id para poder desglosar por tipo
        // (nombre + cantidad), no solo el total. ───
        const partidosIds = todosPartidos.map(p => p.id)
        let powerupsUsados = 0
        let desglosePowerups: { powerupId: string; nombre: string; cantidad: number }[] = []
        if (partidosIds.length > 0) {
          const { data: puData } = await supabase
            .from('powerups_usados')
            .select('cantidad, partido_id, powerup_id')
            .eq('equipo_id', equipoSeleccionado.id)
            .in('partido_id', partidosIds)
          powerupsUsados = (puData || []).reduce((acc, pu) => acc + (pu.cantidad || 0), 0)

          const cantidadPorPowerup: Record<string, number> = {}
          ;(puData || []).forEach(pu => {
            cantidadPorPowerup[pu.powerup_id] = (cantidadPorPowerup[pu.powerup_id] || 0) + (pu.cantidad || 0)
          })

          if (Object.keys(cantidadPorPowerup).length > 0) {
            const { data: catalogoData } = await supabase
              .from('powerups_catalogo')
              .select('id, nombre')
              .in('id', Object.keys(cantidadPorPowerup))
            const nombrePorId: Record<string, string> = {}
            ;(catalogoData || []).forEach(c => { nombrePorId[c.id] = c.nombre })

            desglosePowerups = Object.entries(cantidadPorPowerup)
              .map(([powerupId, cantidad]) => ({
                powerupId,
                nombre: nombrePorId[powerupId] || '',
                cantidad,
              }))
              .sort((a, b) => b.cantidad - a.cantidad)
          }
        }

        // ─── Powerups por partido (para las badges del historial del equipo,
        // igual que en el historial global). Distinto de `desglosePowerups`,
        // que es un agregado total por tipo de powerup. ───
        let powerupsPorPartido: Record<string, { [equipoId: string]: PowerupInfo[] }> = {}
        if (partidosIds.length > 0) {
          const { data: puTodosPartido } = await supabase
            .from('powerups_usados')
            .select('partido_id, equipo_id, powerup_id, cantidad')
            .in('partido_id', partidosIds)
          const { data: catalogoTodo } = await supabase.from('powerups_catalogo').select('id, nombre')

          puTodosPartido?.forEach(pu => {
            if (!powerupsPorPartido[pu.partido_id]) powerupsPorPartido[pu.partido_id] = {}
            if (!powerupsPorPartido[pu.partido_id][pu.equipo_id]) powerupsPorPartido[pu.partido_id][pu.equipo_id] = []
            const cat = catalogoTodo?.find(c => c.id === pu.powerup_id)
            if (cat) {
              const exist = powerupsPorPartido[pu.partido_id][pu.equipo_id].find(x => x.powerupId === pu.powerup_id)
              if (exist) exist.cantidad += pu.cantidad
              else powerupsPorPartido[pu.partido_id][pu.equipo_id].push({ powerupId: pu.powerup_id, nombre: cat.nombre, cantidad: pu.cantidad })
            }
          })
        }

        // ─── Goles anotados por el equipo (con posición) en esos partidos,
        // para el mapa de goles. ───
        let golesRaw: Gol[] = []
        if (partidosIds.length > 0) {
          const { data: golesData } = await supabase
            .from('goles')
            .select('*')
            .eq('equipo_id', equipoSeleccionado.id)
            .in('partido_id', partidosIds)
          golesRaw = (golesData || []) as Gol[]
        }
        
        if (!cancelado) {
          setStatsEquipo({ pj, pg, pe, pp, gf, gc, powerupsUsados })
          setPowerupsDesgloseEquipo(desglosePowerups)
          setPartidosEquipo(todosPartidos)
          setGolesEquipoRaw(golesRaw)
          setPowerupsPorPartidoEquipo(powerupsPorPartido)
        }
      } catch (error) {
        console.error('Error cargando estadísticas del equipo:', error)
      } finally {
        if (!cancelado) setLoadingStatsEquipo(false)
      }
    }

    cargarStatsEquipo()

    return () => { cancelado = true }
  }, [equipoSeleccionado, torneoSeleccionado])

  // ─── Carga de los goles del partido expandido (con posición, para el mapa
  // de goles del historial de partidos, tanto en la vista Global como en la
  // vista de un equipo específico). ───
  useEffect(() => {
    if (!expandedMatchId) {
      setExpandedMatchGoals([])
      return
    }
    setLoadingMatchGoals(true)
    const fetchGoals = async () => {
      const { data } = await supabase
        .from('goles')
        .select('*')
        .eq('partido_id', expandedMatchId)
        .order('minuto', { ascending: true })
      setExpandedMatchGoals(data || [])
      setLoadingMatchGoals(false)
    }
    fetchGoals()
  }, [expandedMatchId])

  // ─── Mapa: id de partido -> si el equipo seleccionado jugó de local, para
  // saber si hay que invertir en espejo las coordenadas de cada gol. ───
  const partidoEsLocalMap = useMemo(() => {
    const map: Record<string, boolean> = {}
    partidosEquipo.forEach(p => {
      map[p.id] = p.equipo_local_id === equipoSeleccionado?.id
    })
    return map
  }, [partidosEquipo, equipoSeleccionado])

  // ─── Goles del equipo seleccionado, normalizados a la perspectiva de
  // ataque del equipo: si jugó de visitante, se invierten ambas coordenadas
  // en espejo (100 - x, 100 - y). ───
  const golesEquipoNormalizados = useMemo(() => {
    return golesEquipoRaw
      .filter(g => g.pos_x != null && g.pos_y != null)
      .map(g => {
        const esLocal = partidoEsLocalMap[g.partido_id]
        const x = esLocal ? g.pos_x! : 100 - g.pos_x!
        const y = esLocal ? g.pos_y! : 100 - g.pos_y!
        return { pos_x: x, pos_y: y }
      })
  }, [golesEquipoRaw, partidoEsLocalMap])

  // ─── Progresión de goles por intervalos de minutos, para el equipo
  // seleccionado (usa el minuto real, independiente de local/visitante). ───
  const progresionGolesEquipo = useMemo(() => {
    return calcularProgresionGoles(golesEquipoRaw.map(g => ({ minuto: g.minuto })))
  }, [golesEquipoRaw])

  // ─── Últimos 5 partidos jugados por el equipo (ya vienen ordenados desc
  // por inicio_timestamp desde la carga). ───
  const ultimosCincoPartidos = useMemo(() => partidosEquipo.slice(0, 5), [partidosEquipo])

  // ─── Historial de partidos del equipo seleccionado, en el mismo formato
  // MatchDetail que usa el historial global, para reutilizar exactamente el
  // mismo bloque de renderizado (incluye mapa de goles y h2h al expandir). ───
  const teamMatchesEquipo: MatchDetail[] = useMemo(() => {
    return partidosEquipo.map(p => ({
      partido: p,
      powerups: powerupsPorPartidoEquipo[p.id] || {},
    }))
  }, [partidosEquipo, powerupsPorPartidoEquipo])

  // ─── Carga del historial head-to-head entre los dos equipos del partido
  // expandido. ... ───
  useEffect(() => {
    if (!expandedMatchId) return
    const detalle = [...teamMatches, ...teamMatchesEquipo].find(m => m.partido.id === expandedMatchId)
    if (!detalle) return

    const { equipo_local_id, equipo_visitante_id } = detalle.partido
    const key = h2hKey(equipo_local_id, equipo_visitante_id)

    if (h2hCache[key]) return

    let cancelado = false
    setLoadingH2h(true)

    const cargarH2h = async () => {
      try {
        const { data: comoLocal } = await supabase
          .from('partidos')
          .select('*')
          .eq('equipo_local_id', equipo_local_id)
          .eq('equipo_visitante_id', equipo_visitante_id)
          .not('goles_local', 'is', null)
          .not('goles_visitante', 'is', null)

        const { data: comoVisitante } = await supabase
          .from('partidos')
          .select('*')
          .eq('equipo_local_id', equipo_visitante_id)
          .eq('equipo_visitante_id', equipo_local_id)
          .not('goles_local', 'is', null)
          .not('goles_visitante', 'is', null)

        const todos = [...(comoLocal || []), ...(comoVisitante || [])] as Partido[]
        todos.sort((a, b) => {
          const ta = a.inicio_timestamp ? new Date(a.inicio_timestamp).getTime() : 0
          const tb = b.inicio_timestamp ? new Date(b.inicio_timestamp).getTime() : 0
          return tb - ta
        })

        if (!cancelado) {
          setH2hCache(prev => ({ ...prev, [key]: todos }))
          setH2hCargado(prev => ({ ...prev, [key]: true }))
        }
      } catch (error) {
        console.error('Error cargando historial head-to-head:', error)
      } finally {
        if (!cancelado) setLoadingH2h(false)
      }
    }

    cargarH2h()

    return () => { cancelado = true }
  }, [expandedMatchId, teamMatches, teamMatchesEquipo, h2hCache])

  const torneoLabel = (t: Torneo) => t.nombre || `Torneo ${t.numero}`

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, rgba(0,78,58,1) 0%, rgba(0,47,36,1) 100%)',
      backgroundAttachment: 'fixed',
      color: 'var(--color-textWH)',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '40px 32px',
    }}>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @keyframes shine {
          0%, 10% { background-position: -200px 0, 0 0; }
          20% { background-position: 0px 0, 0 0; }
          80% { background-position: 400px 0, 0 0; }
          100% { background-position: 600px 0, 0 0; }
        }
        .elo-shine {
          display: inline-block;
          background-repeat: no-repeat;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation-name: shine;
          animation-duration: 3.5s;
          animation-iteration-count: infinite;
          animation-timing-function: linear;
        }
        .elo-shine-oro {
          background-image: linear-gradient(-40deg, transparent 0%, transparent 40%, #fff 50%, transparent 60%, transparent 100%), linear-gradient(#FFD700, #FFD700);
          background-size: 80px 100%, 100% 100%;
        }
        .elo-shine-plata {
          background-image: linear-gradient(-40deg, transparent 0%, transparent 40%, #fff 50%, transparent 60%, transparent 100%), linear-gradient(#C0C0C0, #C0C0C0);
          background-size: 80px 100%, 100% 100%;
        }
        .elo-shine-bronce {
          background-image: linear-gradient(-40deg, transparent 0%, transparent 40%, #fff 50%, transparent 60%, transparent 100%), linear-gradient(#CD7F32, #CD7F32);
          background-size: 80px 100%, 100% 100%;
        }
        .dropdown-item { transition: background 0.15s, padding-left 0.15s; }
        .dropdown-item:hover { background: rgba(0,200,140,0.08); padding-left: 16px; }
        .dropdown-btn { transition: background 0.18s, border-color 0.18s, box-shadow 0.18s; }
        .dropdown-btn:hover { background: rgba(0,200,140,0.07) !important; border-color: rgba(0,200,140,0.5) !important; }
        .escudo { transition: transform 0.2s ease; }
        .pu-badge { transition: transform 0.18s; }
        .pu-badge:hover { transform: scale(1.15); z-index: 5; }

        .match-card { transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s, border-color 0.22s; cursor: pointer; position: relative; border-radius: 12px; overflow: hidden; }
        .match-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,200,140,0.3); border-color: rgba(0,200,140,0.45) !important; }
        .side-bar { transition: width 0.22s ease; }
        .match-card:hover .side-bar { width: 14px !important; }
        .match-card:hover .escudo { transform: scale(1.1); }

        .map-container {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.45s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .map-container.expanded {
          max-height: 700px;
        }
        .map-container.expanded.h2h-open {
          max-height: 2000px;
        }

        .expanded-split {
          display: flex;
          align-items: stretch;
          gap: 0;
        }
        .expanded-split-main {
          flex: 0 0 60%;
          max-width: 60%;
        }
        .expanded-split-h2h {
          flex: 0 0 40%;
          max-width: 40%;
          border-left: 1px solid var(--color-border);
        }
        .h2h-scroll {
          max-height: 340px;
          overflow: hidden;
          position: relative;
        }
        .h2h-scroll.h2h-full {
          max-height: none;
        }
        .h2h-fade {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 70px;
          background: linear-gradient(to bottom, transparent 0%, var(--color-background) 90%);
          pointer-events: none;
        }
        .h2h-ver-todos-btn {
          width: 100%;
          margin-top: 8px;
          padding: 8px 12px;
          border-radius: 8px;
          background: rgba(0,200,140,0.1);
          border: 1px solid rgba(0,200,140,0.3);
          color: var(--color-accent);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s;
        }
        .h2h-ver-todos-btn:hover {
          background: rgba(0,200,140,0.18);
        }

        /* ── Sección: Historial global por equipo (60%) + Progresión de ELO (40%) ──
           La columna del historial define el alto real por su propio contenido
           (altura natural). La columna de la gráfica de ELO se posiciona en
           absoluto dentro de un wrapper relativo del mismo alto que el
           historial, de modo que sea la gráfica la que se adapte al alto de
           la tabla, y NUNCA al revés. ── */
        .section-historial-elo {
          display: flex;
          gap: 12px;
          align-items: stretch;
        }
        .historial-global-col {
          flex: 5 0 0%;   /* equivalente a 60% del espacio restante */
          display: flex;
          flex-direction: column;
        }

        .progresion-elo-col {
          flex: 5 0 0%;   /* 40% del espacio restante */
          position: relative;
        }
        .progresion-elo-col-inner {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
        }

        /* ── Vista de equipo: sección 5/95 (tabla vertical de stats + mapa de goles) ──
           La columna de stats define el alto real por su propio contenido
           (altura natural). La columna del mapa se posiciona en absoluto
           dentro de un wrapper relativo del mismo alto que la de stats, de
           modo que sea el mapa el que se adapte a ese alto, y NUNCA al revés. ── */
        .section-equipo-resumen {
          display: flex;
          gap: 12px;
          align-items: stretch;
        }
        .equipo-stats-col {
          flex: 0 0 5%;
          max-width: 5%;
          display: flex;
          flex-direction: column;
        }
        .equipo-mapa-col {
          flex: 1;
          position: relative;
          min-width: 0;
        }
        .equipo-mapa-col-inner {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
        }
        .equipo-stat-row {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 10px 6px;
          gap: 2px;
        }
        .ultimos-partidos-dot {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .stats-page {
            padding: 20px 16px !important;
          }
          .stats-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .stats-header h1 {
            font-size: 22px !important;
          }
          .stats-selectors {
            width: 100% !important;
            flex-direction: column !important;
          }
          .stats-dropdown-wrapper {
            width: 100% !important;
          }
          .stats-tabla-scroll-wrapper {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }
          .stats-tabla-inner {
            min-width: 760px !important;
          }
          .expanded-split {
            flex-direction: column !important;
          }
          .expanded-split-main, .expanded-split-h2h {
            flex: unset !important;
            max-width: 100% !important;
          }
          .expanded-split-h2h {
            border-left: none !important;
            border-top: 1px solid var(--color-border);
          }
          .match-card-inner {
            margin: 0 18px !important;
          }
          .match-team-name {
            font-size: 12px !important;
          }
          .match-score {
            font-size: 20px !important;
          }
          .match-pu-badges {
            display: none !important;
          }
          .gol-map-container {
            width: 100% !important;
          }
          .section-historial-elo {
            flex-direction: column !important;
          }
          .historial-global-col, .progresion-elo-col {
            flex: unset !important;
            max-width: 100% !important;
          }
          .progresion-elo-col {
            position: static !important;
            min-height: 420px;
          }
          .progresion-elo-col-inner {
            position: static !important;
          }
          .section-equipo-resumen {
            flex-direction: column !important;
          }
          .equipo-stats-col {
            flex: unset !important;
            max-width: 100% !important;
            flex-direction: row !important;
            flex-wrap: wrap !important;
          }
          .equipo-stats-col .equipo-stat-row {
            flex: 1 1 33%;
          }
          .equipo-mapa-col {
            position: static !important;
            min-height: 260px;
          }
          .equipo-mapa-col-inner {
            position: static !important;
          }
          .equipo-mapa-progresion-row {
            flex-direction: column !important;
          }
        }
      `}</style>

      <div className="stats-page" style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Header */}
        <div className="stats-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => navigate('/')}
              className="dropdown-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '12px 16px', borderRadius: '12px',
                background: 'var(--color-background)', border: '2px solid var(--color-border)',
                color: 'var(--color-textWH)', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <h1 style={{ fontSize: '32px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <BarChart3 size={30} color="var(--color-accent)" />
              Estadísticas {equipoSeleccionado ? equipoSeleccionado.nombre : 'Global'}
            </h1>
          </div>

          {/* Selectores */}
          <div className="stats-selectors" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Dropdown de equipo */}
            <div className="stats-dropdown-wrapper" style={{ position: 'relative', width: '260px' }}>
              <button
                onClick={() => { setDropdownEquipoOpen(!dropdownEquipoOpen); setDropdownTorneoOpen(false) }}
                className="dropdown-btn"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 18px', borderRadius: '12px',
                  background: 'var(--color-background)', border: '2px solid var(--color-border)',
                  color: 'var(--color-textWH)', fontSize: '15px', fontWeight: 600,
                  cursor: 'pointer', justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                  {equipoSeleccionado?.escudo_url ? (
                    <img src={equipoSeleccionado.escudo_url} style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                  ) : equipoSeleccionado ? (
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--color-border)', flexShrink: 0 }} />
                  ) : (
                    <Globe size={18} color="var(--color-accent)" />
                  )}
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {equipoSeleccionado ? equipoSeleccionado.nombre : 'Global'}
                  </span>
                </div>
                <ChevronDown size={18} color="rgba(255,255,255,0.5)" style={{ transform: dropdownEquipoOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              {dropdownEquipoOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--color-background)', border: '2px solid var(--color-border)', borderRadius: '12px', maxHeight: '320px', overflowY: 'auto', zIndex: 50, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                  <button
                    className="dropdown-item"
                    onClick={() => { setEquipoSeleccionado(null); setDropdownEquipoOpen(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', background: !equipoSeleccionado ? 'rgba(0,200,140,0.08)' : 'transparent', border: 'none', color: 'var(--color-textWH)', fontSize: '14px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <Globe size={15} color={!equipoSeleccionado ? 'var(--color-accent)' : 'rgba(255,255,255,0.4)'} />
                    <span style={{ flex: 1 }}>Global</span>
                  </button>
                  {equipos.map(eq => (
                    <button
                      key={eq.id}
                      className="dropdown-item"
                      onClick={() => { setEquipoSeleccionado(eq); setDropdownEquipoOpen(false) }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', background: equipoSeleccionado?.id === eq.id ? 'rgba(0,200,140,0.08)' : 'transparent', border: 'none', color: 'var(--color-textWH)', fontSize: '14px', cursor: 'pointer', textAlign: 'left' }}
                    >
                      {eq.escudo_url ? (
                        <img src={eq.escudo_url} style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--color-border)', flexShrink: 0 }} />
                      )}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eq.nombre}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dropdown de torneo — deshabilitado si el equipo es "Global" */}
            <div className="stats-dropdown-wrapper" style={{ position: 'relative', width: '260px' }}>
              <button
                onClick={() => {
                  if (!equipoSeleccionado) return
                  setDropdownTorneoOpen(!dropdownTorneoOpen)
                  setDropdownEquipoOpen(false)
                }}
                className="dropdown-btn"
                disabled={!equipoSeleccionado}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 18px', borderRadius: '12px',
                  background: 'var(--color-background)',
                  border: '2px solid var(--color-border)',
                  color: equipoSeleccionado ? 'var(--color-textWH)' : 'rgba(255,255,255,0.3)',
                  fontSize: '15px', fontWeight: 600,
                  cursor: equipoSeleccionado ? 'pointer' : 'not-allowed',
                  justifyContent: 'space-between',
                  opacity: equipoSeleccionado ? 1 : 0.5,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                  {torneoSeleccionado ? (
                    <Trophy size={18} color="var(--color-accent)" />
                  ) : (
                    <Globe size={18} color={equipoSeleccionado ? 'var(--color-accent)' : 'rgba(255,255,255,0.3)'} />
                  )}
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {torneoSeleccionado ? torneoLabel(torneoSeleccionado) : 'Global'}
                  </span>
                  {torneoSeleccionado && (
                    <span style={{
                      padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap',
                      background: `${ESTADO_COLORS[torneoSeleccionado.estado]}26`,
                      border: `1px solid ${ESTADO_COLORS[torneoSeleccionado.estado]}4D`,
                      color: ESTADO_COLORS[torneoSeleccionado.estado], fontSize: '10px', fontWeight: 700,
                    }}>
                      {ESTADO_LABELS[torneoSeleccionado.estado]}
                    </span>
                  )}
                </div>
                <ChevronDown size={18} color="rgba(255,255,255,0.5)" style={{ transform: dropdownTorneoOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              {dropdownTorneoOpen && equipoSeleccionado && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--color-background)', border: '2px solid var(--color-border)', borderRadius: '12px', maxHeight: '320px', overflowY: 'auto', zIndex: 50, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                  <button
                    className="dropdown-item"
                    onClick={() => { setTorneoSeleccionado(null); setDropdownTorneoOpen(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', background: !torneoSeleccionado ? 'rgba(0,200,140,0.08)' : 'transparent', border: 'none', color: 'var(--color-textWH)', fontSize: '14px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <Globe size={15} color={!torneoSeleccionado ? 'var(--color-accent)' : 'rgba(255,255,255,0.4)'} />
                    <span style={{ flex: 1 }}>Global</span>
                  </button>
                  {torneos.map(t => (
                    <button
                      key={t.id}
                      className="dropdown-item"
                      onClick={() => { setTorneoSeleccionado(t); setDropdownTorneoOpen(false) }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', background: torneoSeleccionado?.id === t.id ? 'rgba(0,200,140,0.08)' : 'transparent', border: 'none', color: 'var(--color-textWH)', fontSize: '14px', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <Trophy size={15} color={torneoSeleccionado?.id === t.id ? 'var(--color-accent)' : 'rgba(255,255,255,0.4)'} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{torneoLabel(t)}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap',
                        background: `${ESTADO_COLORS[t.estado]}26`,
                        border: `1px solid ${ESTADO_COLORS[t.estado]}4D`,
                        color: ESTADO_COLORS[t.estado], fontSize: '10px', fontWeight: 700,
                      }}>
                        {ESTADO_LABELS[t.estado]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contenido */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <Loader2 size={32} className="spin" color="var(--color-accent)" />
          </div>
        ) : !equipoSeleccionado ? (
          /* ─── Vista GLOBAL: tabla de historial ─── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
            {/* ─── Historial global por equipo (60%) + Progresión de ELO (40%) ─── */}
            <div className="section-historial-elo">
              {/* Columna 60%: Historial global por equipo */}
              <div className="historial-global-col">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <Trophy size={22} color="var(--color-accent)" />
                  <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Historial global por equipo</h2>
                  {loadingElo && (
                    <span style={{
                      padding: '3px 10px', borderRadius: '20px',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
                      color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      <Loader2 size={12} className="spin" />
                      Calculando ELO histórico...
                    </span>
                  )}
                </div>
                {loadingStatsGlobales ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <Loader2 size={24} className="spin" color="var(--color-accent)" />
                  </div>
                ) : statsGlobalesConElo.length === 0 ? (
                  <div style={{ padding: '40px', borderRadius: '12px', border: '2px dashed var(--color-border)', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                    No hay equipos registrados.
                  </div>
                ) : (
                  <div className="stats-tabla-scroll-wrapper" style={{ borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--color-border)', background: 'var(--color-background)', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div className="stats-tabla-inner" style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 70px 1fr 40px 40px 40px 40px 44px 44px 44px 40px 60px',
                      padding: '12px 16px', background: 'rgba(0, 93, 67, 1)',
                      borderBottom: '1px solid var(--color-border)', fontSize: '12px',
                      fontWeight: 600, color: 'rgba(255,255,255,0.6)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      <span style={{ textAlign: 'center' }}>#</span>
                      <span style={{ textAlign: 'center' }} title="Puntuación ELO actual">ELO</span>
                      <span>Equipo</span>
                      <span style={{ textAlign: 'center' }}>PJ</span>
                      <span style={{ textAlign: 'center' }}>PG</span>
                      <span style={{ textAlign: 'center' }}>PE</span>
                      <span style={{ textAlign: 'center' }}>PP</span>
                      <span style={{ textAlign: 'center' }}>%V</span>
                      <span style={{ textAlign: 'center' }}>GF</span>
                      <span style={{ textAlign: 'center' }}>GC</span>
                      <span style={{ textAlign: 'center' }} title="Power-ups usados">PU</span>
                      <span style={{ textAlign: 'center' }}>PUF</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      {statsGlobalesConElo.map((stat, index) => {
                        const porcentajeVictoria = stat.pj > 0 ? Math.round((stat.pg / stat.pj) * 100) : null
                        const colorPorcentaje = porcentajeVictoria !== null
                          ? (porcentajeVictoria > 50 ? 'var(--color-accent)' : porcentajeVictoria < 50 ? 'var(--color-error)' : 'var(--color-textWH)')
                          : 'var(--color-textWH)'

                        const colorPG = stat.pg > stat.pp ? 'var(--color-accent)' : 'var(--color-textWH)'
                        const colorPP = stat.pp > stat.pg ? 'var(--color-error)' : 'var(--color-textWH)'

                        return (
                          <div
                            key={stat.equipo.id}
                            className="stats-tabla-inner"
                            role="button"
                            onClick={() => setEquipoSeleccionado(stat.equipo)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '32px 70px 1fr 40px 40px 40px 40px 44px 44px 44px 40px 60px',
                              padding: '12px 16px',
                              borderBottom: index < statsGlobalesConElo.length - 1 ? '1px solid var(--color-border)' : 'none',
                              color: 'var(--color-textWH)', fontSize: '14px',
                              alignItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>{index + 1}</span>
                            <span
                              className={
                                index === 0 ? 'elo-shine elo-shine-oro'
                                : index === 1 ? 'elo-shine elo-shine-plata'
                                : index === 2 ? 'elo-shine elo-shine-bronce'
                                : undefined
                              }
                              style={{
                                textAlign: 'center', fontWeight: 800, fontSize: '15px',
                                color: index > 2 ? 'var(--color-textWH)' : undefined,
                              }}
                            >
                              {stat.elo !== null ? Math.round(stat.elo) : '—'}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                              {stat.equipo.escudo_url ? (
                                <img src={stat.equipo.escudo_url} className="escudo" style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} />
                              ) : (
                                <div className="escudo" style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--color-border)', flexShrink: 0 }} />
                              )}
                              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.equipo.nombre}</span>
                            </div>
                            <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>{stat.pj}</span>
                            <span style={{ textAlign: 'center', fontWeight: 700, color: colorPG }}>{stat.pg}</span>
                            <span style={{ textAlign: 'center' }}>{stat.pe}</span>
                            <span style={{ textAlign: 'center', fontWeight: 700, color: colorPP }}>{stat.pp}</span>
                            <span style={{ textAlign: 'center', fontWeight: 600, color: colorPorcentaje }}>
                              {porcentajeVictoria !== null ? `${porcentajeVictoria}%` : '—'}
                            </span>
                            <span style={{ textAlign: 'center' }}>{stat.gf}</span>
                            <span style={{ textAlign: 'center' }}>{stat.gc}</span>
                            <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>{stat.powerupsUsados}</span>
                            <span style={{ textAlign: 'center' }}>
                              {stat.powerupFavorito ? (
                                <div className="pu-badge" style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                                  background: 'rgba(0,200,140,0.1)', borderRadius: '6px',
                                  padding: '2px 6px', border: '1px solid rgba(0,200,140,0.3)',
                                  justifyContent: 'center',
                                }}>
                                  <img
                                    src={POWERUP_IMAGES[stat.powerupFavorito.nombre] ?? ''}
                                    style={{ width: 18, height: 18, objectFit: 'contain' }}
                                  />
                                  <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 600 }}>
                                    {stat.powerupFavorito.cantidad}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Columna 40%: Progresión de ELO — el contenedor exterior queda con
                  `position: relative` y la misma altura que la columna del
                  historial (gracias a `align-items: stretch` del padre); el
                  contenido real vive en un hijo `position: absolute; inset: 0`
                  para que sea la gráfica la que se ajuste a ese alto y no al
                  revés. */}
              <div className="progresion-elo-col">
                <div className="progresion-elo-col-inner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <LineChartIcon size={22} color="var(--color-accent)" />
                    <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Progresión de ELO</h2>
                    {loadingElo && (
                      <span style={{
                        padding: '3px 10px', borderRadius: '20px',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
                        color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '6px',
                      }}>
                        <Loader2 size={12} className="spin" />
                        Calculando...
                      </span>
                    )}
                  </div>
                  {/* Contenedor de la gráfica: sin `justifyContent: center` para que
                      el contenido (SVG con flex:1) pueda estirarse al alto real de
                      esta columna, que ahora queda fijado por el `.progresion-elo-col-inner`
                      posicionado en absoluto sobre el alto que define el historial. */}
                  <div style={{
                    flex: 1, borderRadius: '12px', border: '2px solid var(--color-border)',
                    background: 'var(--color-background)', padding: '10px',
                    display: 'flex', flexDirection: 'column',
                    minHeight: 0,
                  }}>
                    {loadingElo && resultadoElo.historial.length === 0 ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                        <Loader2 size={24} className="spin" color="var(--color-accent)" />
                      </div>
                    ) : (
                      <GraficaProgresionElo
                        historial={resultadoElo.historial}
                        equipos={equipos}
                        equiposMap={equiposMap}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Historial de partidos (GLOBAL: todos los torneos, sin discriminar) ─── */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <History size={22} color="var(--color-accent)" />
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Historial de partidos</h2>
                {!loadingTeamMatches && (
                  <span style={{
                    padding: '3px 10px', borderRadius: '20px',
                    background: 'rgba(0,200,140,0.1)', border: '1px solid rgba(0,200,140,0.3)',
                    color: 'var(--color-accent)', fontSize: '12px', fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <Zap size={12} />
                    {teamMatches.length} partidos jugados
                  </span>
                )}
                {loadingElo && (
                  <span style={{
                    padding: '3px 10px', borderRadius: '20px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
                    color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <Loader2 size={12} className="spin" />
                    Calculando ELO histórico...
                  </span>
                )}
              </div>

              {loadingTeamMatches ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                  <Loader2 size={24} className="spin" color="var(--color-accent)" />
                </div>
              ) : teamMatches.length === 0 ? (
                <div style={{ padding: '40px', borderRadius: '12px', border: '2px dashed var(--color-border)', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                  No hay partidos jugados aún.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {teamMatches.map(detail => {
                    const local = equipoById(detail.partido.equipo_local_id)
                    const visitante = equipoById(detail.partido.equipo_visitante_id)
                    const golesLocal = detail.partido.goles_local ?? 0
                    const golesVisitante = detail.partido.goles_visitante ?? 0
                    const localGano = golesLocal > golesVisitante
                    const visitanteGano = golesVisitante > golesLocal
                    const empate = golesLocal === golesVisitante
                    const isExpanded = expandedMatchId === detail.partido.id

                    const key = h2hKey(detail.partido.equipo_local_id, detail.partido.equipo_visitante_id)
                    const h2hTodos = h2hCache[key] || []
                    // ─── El orden ya viene fijado (único criterio: inicio_timestamp desc) desde
                    // la carga del h2h. El partido actual de la card se resalta donde le
                    // corresponda cronológicamente, sin forzarlo al inicio de la lista. ───
                    const h2hPartidos = h2hTodos

                    return (
                      <div
                        key={detail.partido.id}
                        className="match-card"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedMatchId(null)
                            setH2hExpandido(prev => ({ ...prev, [detail.partido.id]: false }))
                          } else {
                            setExpandedMatchId(detail.partido.id)
                          }
                        }}
                        style={{
                          border: `2px solid ${isExpanded ? 'var(--color-accent)' : 'var(--color-border)'}`,
                          background: 'var(--color-background)',
                        }}
                      >
                        <div className="side-bar" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '10px', backgroundColor: empate ? 'gray' : (localGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }} />
                        <div className="side-bar" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '10px', backgroundColor: empate ? 'gray' : (visitanteGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }} />
                        {detail.partido.confirmado && (
                          <div style={{
                            position: 'absolute',
                            bottom: 6,
                            right: 16,
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: '#00C88C',
                            boxShadow: '0 0 4px #00C88C',
                            zIndex: 10,
                            pointerEvents: 'none',
                          }} />
                        )}
                        <div className="match-card-inner" style={{ margin: '0 30px' }}>
                          {/* Fecha y hora + edición del torneo (para diferenciarlos, dado que es vista global) */}
                          {(detail.partido.inicio_timestamp || edicionLabel(detail.partido.torneo_id)) && (
                            <div style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                              textAlign: 'center',
                              paddingTop: '10px',
                              fontSize: '10px',
                              color: 'rgba(255,255,255,0.3)',
                              fontWeight: 500,
                            }}>
                              {detail.partido.inicio_timestamp && (
                                <span>
                                  {new Date(detail.partido.inicio_timestamp).toLocaleString('es-CO', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              )}
                              {edicionLabel(detail.partido.torneo_id) && (
                                <span style={{
                                  padding: '1px 8px', borderRadius: '10px',
                                  background: faseInfo(detail.partido) ? `${faseInfo(detail.partido)!.color}1A` : 'rgba(255,255,255,0.06)',
                                  border: `1px solid ${faseInfo(detail.partido) ? `${faseInfo(detail.partido)!.color}66` : 'var(--color-border)'}`,
                                  color: faseInfo(detail.partido) ? faseInfo(detail.partido)!.color : 'rgba(255,255,255,0.45)',
                                  fontWeight: 700,
                                }}>
                                  {edicionLabel(detail.partido.torneo_id)}
                                  {faseInfo(detail.partido) && ` · ${faseInfo(detail.partido)!.nombre}`}
                                </span>
                              )}
                            </div>
                          )}
                          <div style={{ padding: '16px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
                                <div className="match-pu-badges" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {(detail.powerups[detail.partido.equipo_local_id] || []).map(pu => (
                                    <div key={pu.powerupId} className="pu-badge" style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,200,140,0.1)', borderRadius: 6, padding: '2px 6px', border: '1px solid var(--color-accent)' }}>
                                      <img src={POWERUP_IMAGES[pu.nombre] || ''} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                                      <span style={{ fontSize: 12, color: 'var(--color-accent)' }}>{pu.cantidad}</span>
                                    </div>
                                  ))}
                                </div>
                                {local?.escudo_url
                                  ? <img src={local.escudo_url} className="escudo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                                  : <div className="escudo" style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--color-border)' }} />
                                }
                                <span className="match-team-name" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{local?.nombre}</span>
                              </div>

                              <div className="score-display match-score" style={{ fontSize: 24, fontWeight: 800, whiteSpace: 'nowrap' }}>
                                <span style={{ color: empate ? 'var(--color-textWH)' : (localGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }}>
                                  {golesLocal}
                                </span>
                                <span style={{ color: 'var(--color-textWH)' }}> : </span>
                                <span style={{ color: empate ? 'var(--color-textWH)' : (visitanteGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }}>
                                  {golesVisitante}
                                </span>
                              </div>

                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
                                <span className="match-team-name" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{visitante?.nombre}</span>
                                {visitante?.escudo_url
                                  ? <img src={visitante.escudo_url} className="escudo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                                  : <div className="escudo" style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--color-border)' }} />
                                }
                                <div className="match-pu-badges" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {(detail.powerups[detail.partido.equipo_visitante_id] || []).map(pu => (
                                    <div key={pu.powerupId} className="pu-badge" style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,200,140,0.1)', borderRadius: 6, padding: '2px 6px', border: '1px solid var(--color-accent)' }}>
                                      <img src={POWERUP_IMAGES[pu.nombre] || ''} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                                      <span style={{ fontSize: 12, color: 'var(--color-accent)' }}>{pu.cantidad}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                                ⏱ {formatearDuracion(detail.partido.duracion_segundos || 0)}
                              </span>
                            </div>

                            {/* ─── ELO inicial y final del partido (ambos equipos) ─── */}
                            {(() => {
                              const eloEntry = eloHistorialPorPartidoId[detail.partido.id]
                              if (!eloEntry) return null

                              const deltaLocal = Math.round(eloEntry.eloLocalDespues) - Math.round(eloEntry.eloLocalAntes)
                              const deltaVisitante = Math.round(eloEntry.eloVisitanteDespues) - Math.round(eloEntry.eloVisitanteAntes)

                              const TrendIcon = (delta: number) => delta > 0 ? TrendingUp : (delta < 0 ? TrendingDown : Minus)
                              const trendColor = (delta: number) => delta > 0 ? 'var(--color-accent)' : (delta < 0 ? 'var(--color-error)' : 'rgba(255,255,255,0.4)')

                              const EloBloque = ({ delta, antes, despues, alinear }: { delta: number; antes: number; despues: number; alinear: 'flex-end' | 'flex-start' }) => {
                                const Icon = TrendIcon(delta)
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: alinear }}>
                                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                                      {Math.round(antes)}
                                    </span>
                                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>→</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-textWH)' }}>
                                      {Math.round(despues)}
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: trendColor(delta) }}>
                                      <Icon size={12} />
                                      <span style={{ fontSize: 11, fontWeight: 700 }}>
                                        {delta > 0 ? `+${delta}` : delta}
                                      </span>
                                    </span>
                                  </div>
                                )
                              }

                              return (
                                <div style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
                                  marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--color-border)',
                                  flexWrap: 'wrap',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Trophy size={11} color="rgba(255,255,255,0.3)" />
                                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                      ELO
                                    </span>
                                  </div>
                                  <EloBloque delta={deltaLocal} antes={eloEntry.eloLocalAntes} despues={eloEntry.eloLocalDespues} alinear="flex-end" />
                                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>|</span>
                                  <EloBloque delta={deltaVisitante} antes={eloEntry.eloVisitanteAntes} despues={eloEntry.eloVisitanteDespues} alinear="flex-start" />
                                </div>
                              )
                            })()}
                          </div>

                          <div className={`map-container ${isExpanded ? 'expanded' : ''} ${h2hExpandido[detail.partido.id] ? 'h2h-open' : ''}`}>
                            <div className="expanded-split" style={{
                              borderTop: '1px solid var(--color-border)',
                            }}>
                              {/* Columna 60%: mapa de goles */}
                              <div className="expanded-split-main" style={{ padding: '10px 0 20px' }}>
                                {loadingMatchGoals && isExpanded ? (
                                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                                    <Loader2 size={24} className="spin" />
                                  </div>
                                ) : (
                                  <>
                                    {expandedMatchGoals.filter(g => g.pos_x != null && g.pos_y != null).length > 0 ? (
                                      <div className="gol-map-container" style={{
                                        position: 'relative',
                                        width: '96%',
                                        margin: '0 auto',
                                        aspectRatio: '16/9',
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                        border: '0px solid var(--color-border)',
                                      }}>
                                        <img src={canchaImage} alt="" style={{
                                          position: 'absolute', inset: 0,
                                          width: '100%', height: '100%',
                                          objectFit: 'cover', objectPosition: 'center',
                                          zIndex: 1,
                                        }} />
                                        <div style={{
                                          position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
                                          background: `linear-gradient(to right,
                                            ${local?.color_hex || '#00C88C'} 0%, ${local?.color_hex || '#00C88C'} 6.58%,
                                            transparent 6.58%, transparent 93.39%,
                                            ${visitante?.color_hex || '#FF4D4D'} 93.39%, ${visitante?.color_hex || '#FF4D4D'} 100%)`,
                                          mixBlendMode: 'multiply',
                                          WebkitMaskImage: `url(${canchaImage})`,
                                          maskImage: `url(${canchaImage})`,
                                          WebkitMaskSize: 'cover',
                                          maskSize: 'cover',
                                          WebkitMaskPosition: 'center',
                                          maskPosition: 'center',
                                        }} />
                                        {expandedMatchGoals.filter(g => g.pos_x != null && g.pos_y != null).map(gol => {
                                          const color = equipoById(gol.equipo_id)?.color_hex || '#FF0000'
                                          return (
                                            <div key={gol.id} style={{
                                              position: 'absolute',
                                              left: `${gol.pos_x}%`,
                                              top: `${gol.pos_y}%`,
                                              width: '24px',
                                              height: '24px',
                                              borderRadius: '50%',
                                              backgroundColor: darkenHex(color, 0.6),
                                              border: `3px solid ${color}`,
                                              transform: 'translate(-50%, -50%)',
                                              boxShadow: `0 0 10px ${color}`,
                                              zIndex: 5,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              color: '#fff',
                                              fontSize: '10px',
                                              fontWeight: 'bold',
                                            }}>
                                              {expandedMatchGoals.filter(g => g.equipo_id === gol.equipo_id && g.pos_x != null).indexOf(gol) + 1}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    ) : (
                                      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', padding: '16px' }}>
                                        No hay goles con ubicación registrada
                                      </div>
                                    )}
                                  </>
                                )}

                                {!loadingMatchGoals && expandedMatchGoals.length > 0 && (
                                  <div style={{
                                    display: 'flex', gap: 16,
                                    width: '96%', margin: '14px auto 0',
                                    padding: '14px 16px',
                                    borderRadius: 10,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--color-border)',
                                  }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                        {local?.escudo_url
                                          ? <img src={local.escudo_url} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                                          : <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--color-border)' }} />
                                        }
                                        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                          {local?.nombre ?? 'Local'}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {expandedMatchGoals.filter(g => g.equipo_id === detail.partido.equipo_local_id).length === 0 ? (
                                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sin goles</span>
                                        ) : (
                                          expandedMatchGoals
                                            .filter(g => g.equipo_id === detail.partido.equipo_local_id)
                                            .map((g, idx) => (
                                              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{
                                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                  width: 18, height: 18, borderRadius: '50%',
                                                  background: 'rgba(0,200,140,0.15)',
                                                  border: '1px solid rgba(0,200,140,0.4)',
                                                  fontSize: 10, fontWeight: 800, color: 'var(--color-accent)',
                                                  flexShrink: 0,
                                                }}>
                                                  {idx + 1}
                                                </span>
                                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-textWH)' }}>
                                                  ⚽ {formatearDuracion(g.minuto)}
                                                </span>
                                              </div>
                                            ))
                                        )}
                                      </div>
                                    </div>
                                    <div style={{ width: 1, background: 'var(--color-border)' }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, justifyContent: 'flex-end' }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                          {visitante?.nombre ?? 'Visitante'}
                                        </span>
                                        {visitante?.escudo_url
                                          ? <img src={visitante.escudo_url} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                                          : <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--color-border)' }} />
                                        }
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
                                        {expandedMatchGoals.filter(g => g.equipo_id === detail.partido.equipo_visitante_id).length === 0 ? (
                                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sin goles</span>
                                        ) : (
                                          expandedMatchGoals
                                            .filter(g => g.equipo_id === detail.partido.equipo_visitante_id)
                                            .map((g, idx) => (
                                              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row-reverse' }}>
                                                <span style={{
                                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                  width: 18, height: 18, borderRadius: '50%',
                                                  background: 'rgba(0,200,140,0.15)',
                                                  border: '1px solid rgba(0,200,140,0.4)',
                                                  fontSize: 10, fontWeight: 800, color: 'var(--color-accent)',
                                                  flexShrink: 0,
                                                }}>
                                                  {idx + 1}
                                                </span>
                                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-textWH)' }}>
                                                  ⚽ {formatearDuracion(g.minuto)}
                                                </span>
                                              </div>
                                            ))
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Columna 40%: historial head-to-head entre estos dos equipos */}
                              <div className="expanded-split-h2h" style={{ padding: '10px 16px 20px' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                                  Historial entre ambos
                                </div>
                                {loadingH2h && !h2hCache[key] ? (
                                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                                    <Loader2 size={20} className="spin" />
                                  </div>
                                ) : h2hTodos.length === 0 ? (
                                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px', padding: '16px' }}>
                                    No hay más enfrentamientos registrados entre estos equipos.
                                  </div>
                                ) : (
                                  <>
                                    {(() => {
                                      let vLocal = 0, empates = 0, vVisitante = 0
                                      h2hTodos.forEach(hp => {
                                        const esMismoOrden = hp.equipo_local_id === detail.partido.equipo_local_id
                                        const gRef = esMismoOrden ? hp.goles_local : hp.goles_visitante
                                        const gOtro = esMismoOrden ? hp.goles_visitante : hp.goles_local
                                        if ((gRef ?? 0) > (gOtro ?? 0)) vLocal++
                                        else if ((gOtro ?? 0) > (gRef ?? 0)) vVisitante++
                                        else empates++
                                      })
                                      const colorLocal = local?.color_hex || 'var(--color-accent)'
                                      const colorVisitante = visitante?.color_hex || 'var(--color-error)'
                                      const totalEnfrentamientos = vLocal + empates + vVisitante
                                      const pctLocal = totalEnfrentamientos > 0 ? Math.round((vLocal / totalEnfrentamientos) * 100) : null
                                      const pctEmpates = totalEnfrentamientos > 0 ? Math.round((empates / totalEnfrentamientos) * 100) : null
                                      const pctVisitante = totalEnfrentamientos > 0 ? Math.round((vVisitante / totalEnfrentamientos) * 100) : null
                                      return (
                                        <div style={{
                                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                          padding: '10px 10px', borderRadius: 8, marginBottom: 10,
                                          background: 'rgba(255,255,255,0.04)',
                                          border: '1px solid var(--color-border)',
                                        }}>
                                          <div style={{ textAlign: 'center', flex: 1 }}>
                                            <div style={{ fontSize: 26, fontWeight: 800, color: colorLocal, lineHeight: 1 }}>{vLocal}</div>
                                            {pctLocal !== null && (
                                              <div style={{ fontSize: 11, fontWeight: 700, color: colorPorPorcentaje(pctLocal), marginTop: 3 }}>{pctLocal}%</div>
                                            )}
                                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{local?.nombre ?? 'Local'}</div>
                                          </div>
                                          <div style={{ textAlign: 'center', flex: 1 }}>
                                            <div style={{ fontSize: 26, fontWeight: 800, color: 'rgba(255,255,255,0.6)', lineHeight: 1 }}>{empates}</div>
                                            {pctEmpates !== null && (
                                              <div style={{ fontSize: 11, fontWeight: 700, color: colorPorPorcentaje(pctEmpates), marginTop: 3 }}>{pctEmpates}%</div>
                                            )}
                                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>Empates</div>
                                          </div>
                                          <div style={{ textAlign: 'center', flex: 1 }}>
                                            <div style={{ fontSize: 26, fontWeight: 800, color: colorVisitante, lineHeight: 1 }}>{vVisitante}</div>
                                            {pctVisitante !== null && (
                                              <div style={{ fontSize: 11, fontWeight: 700, color: colorPorPorcentaje(pctVisitante), marginTop: 3 }}>{pctVisitante}%</div>
                                            )}
                                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{visitante?.nombre ?? 'Visitante'}</div>
                                          </div>
                                        </div>
                                      )
                                    })()}

                                    {h2hPartidos.length === 0 ? (
                                      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px', padding: '16px' }}>
                                        No hay más enfrentamientos registrados entre estos equipos.
                                      </div>
                                    ) : (
                                      <>
                                      <div className={`h2h-scroll ${h2hExpandido[detail.partido.id] ? 'h2h-full' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {h2hPartidos.map(hp => {
                                          const esMismoOrden = hp.equipo_local_id === detail.partido.equipo_local_id
                                          const gLocalRef = esMismoOrden ? hp.goles_local : hp.goles_visitante
                                          const gVisitanteRef = esMismoOrden ? hp.goles_visitante : hp.goles_local
                                          const refGano = (gLocalRef ?? 0) > (gVisitanteRef ?? 0)
                                          const otroGano = (gVisitanteRef ?? 0) > (gLocalRef ?? 0)
                                          const hpEdicion = edicionLabel(hp.torneo_id)
                                          const hpFase = faseInfo(hp)
                                          const esPartidoActual = hp.id === detail.partido.id

                                          return (
                                            <div key={hp.id} style={{
                                              display: 'flex', alignItems: 'center', gap: 8,
                                              padding: '6px 10px', borderRadius: 8,
                                              background: esPartidoActual ? 'rgba(0,200,140,0.16)' : 'rgba(255,255,255,0.03)',
                                              border: esPartidoActual ? '1px solid rgba(0,200,140,0.7)' : '1px solid var(--color-border)',
                                              boxShadow: esPartidoActual ? '0 0 8px rgba(0,200,140,0.35)' : 'none',
                                              fontSize: 12,
                                            }}>
                                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
                                                <span style={{
                                                  fontWeight: refGano ? 700 : 500,
                                                  color: refGano ? 'var(--color-textWH)' : 'rgba(255,255,255,0.55)',
                                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                  {local?.nombre ?? '—'}
                                                </span>
                                                {local?.escudo_url
                                                  ? <img src={local.escudo_url} style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                                                  : <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--color-border)', flexShrink: 0 }} />
                                                }
                                              </div>

                                              <span style={{ fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                                                <span style={{
                                                  color: refGano ? 'var(--color-accent)' : (otroGano ? 'var(--color-error)' : 'rgba(255,255,255,0.6)'),
                                                }}>
                                                  {gLocalRef ?? '–'}
                                                </span>
                                                <span style={{ color: 'var(--color-textWH)' }}> : </span>
                                                <span style={{
                                                  color: otroGano ? 'var(--color-accent)' : (refGano ? 'var(--color-error)' : 'rgba(255,255,255,0.6)'),
                                                }}>
                                                  {gVisitanteRef ?? '–'}
                                                </span>
                                              </span>

                                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                                {visitante?.escudo_url
                                                  ? <img src={visitante.escudo_url} style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                                                  : <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--color-border)', flexShrink: 0 }} />
                                                }
                                                <span style={{
                                                  fontWeight: otroGano ? 700 : 500,
                                                  color: otroGano ? 'var(--color-textWH)' : 'rgba(255,255,255,0.55)',
                                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                  {visitante?.nombre ?? '—'}
                                                </span>
                                              </div>

                                              {hpEdicion && (
                                                <span style={{
                                                  flexShrink: 0,
                                                  fontSize: 10,
                                                  fontWeight: 600,
                                                  color: 'rgba(255,255,255,0.4)',
                                                  whiteSpace: 'nowrap',
                                                  marginLeft: 2,
                                                  paddingLeft: 8,
                                                  borderLeft: '1px solid var(--color-border)',
                                                }}>
                                                  {hpEdicion}
                                                </span>
                                              )}

                                              {hpFase && (
                                                <span title={hpFase.nombre} style={{
                                                  flexShrink: 0,
                                                  fontSize: 11,
                                                  fontWeight: 800,
                                                  color: hpFase.color,
                                                  whiteSpace: 'nowrap',
                                                }}>
                                                  {hpFase.letra}
                                                </span>
                                              )}

                                            </div>
                                          )
                                        })}
                                        {!h2hExpandido[detail.partido.id] && h2hPartidos.length >= 8 && (
                                          <div className="h2h-fade" />
                                        )}
                                      </div>
                                      {!h2hExpandido[detail.partido.id] && h2hPartidos.length >= 8 && (
                                        <button
                                          className="h2h-ver-todos-btn"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setH2hExpandido(prev => ({ ...prev, [detail.partido.id]: true }))
                                          }}
                                        >
                                          Ver todos ({h2hPartidos.length})
                                        </button>
                                      )}
                                      </>
                                    )}

                                    <div style={{
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
                                      gap: '10px', marginTop: 10, paddingTop: 8,
                                      borderTop: '1px solid var(--color-border)',
                                    }}>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                                        <span style={{ fontWeight: 800, color: 'rgba(255,255,255,0.5)' }}>G</span>
                                        Grupos
                                      </span>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                                        <span style={{ fontWeight: 800, color: '#FF4D4D' }}>E</span>
                                        Eliminatoria
                                      </span>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                                        <span style={{ fontWeight: 800, color: '#FFC800' }}>F</span>
                                        Final
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ─── Vista con equipo específico: 10/90 (stats verticales + mapa de
             goles), progresión de goles por intervalos, y últimos 5 partidos. ─── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '-8px', flexWrap: 'wrap' }}>
              {equipoSeleccionado.escudo_url ? (
                <img src={equipoSeleccionado.escudo_url} style={{ width: 34, height: 34, objectFit: 'contain' }} />
              ) : (
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--color-border)' }} />
              )}
              <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>{equipoSeleccionado.nombre}</h2>
              <span style={{
                padding: '3px 10px', borderRadius: '20px',
                background: 'rgba(0,200,140,0.1)', border: '1px solid rgba(0,200,140,0.3)',
                color: 'var(--color-accent)', fontSize: '12px', fontWeight: 700,
              }}>
                {torneoSeleccionado ? torneoLabel(torneoSeleccionado) : 'Global (todas las ediciones)'}
              </span>
              {loadingElo && (
                <span style={{
                  padding: '3px 10px', borderRadius: '20px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
                  color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <Loader2 size={12} className="spin" />
                  Calculando ELO...
                </span>
              )}
            </div>

            {/* ─── Sección 10/90: tabla vertical de stats + mapa de goles ─── */}
            <div className="section-equipo-resumen">
              {/* Columna 10%: tabla vertical de stats */}
              <div className="equipo-stats-col">
                <div style={{
                  borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--color-border)',
                  background: 'var(--color-background)', display: 'flex', flexDirection: 'column',
                  flex: 1,
                }}>
                  {loadingStatsEquipo || !statsEquipo ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '30px 6px', flex: 1 }}>
                      <Loader2 size={20} className="spin" color="var(--color-accent)" />
                    </div>
                  ) : (
                    <>
                      <div className="equipo-stat-row" style={{ background: 'rgba(0, 93, 67, 1)', borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>ELO</span>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-accent)' }}>
                          {eloActualPorEquipo[equipoSeleccionado.id] !== undefined ? Math.round(eloActualPorEquipo[equipoSeleccionado.id]) : '—'}
                        </span>
                      </div>
                      <div className="equipo-stat-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>PJ</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-textWH)' }}>{statsEquipo.pj}</span>
                      </div>
                      <div className="equipo-stat-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>PG</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-accent)' }}>{statsEquipo.pg}</span>
                      </div>
                      <div className="equipo-stat-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>PE</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-textWH)' }}>{statsEquipo.pe}</span>
                      </div>
                      <div className="equipo-stat-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>PP</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-error)' }}>{statsEquipo.pp}</span>
                      </div>
                      <div className="equipo-stat-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>GF</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-textWH)' }}>{statsEquipo.gf}</span>
                      </div>
                      <div className="equipo-stat-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>GC</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-textWH)' }}>{statsEquipo.gc}</span>
                      </div>
                      <div className="equipo-stat-row">
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>PU</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-textWH)' }}>{statsEquipo.powerupsUsados}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Columna 95%: mapa de goles del equipo + progresión de goles
                  por intervalos en el espacio que queda libre a la derecha
                  de la cancha. El contenedor exterior queda con
                  `position: relative` y la misma altura que la columna de
                  stats (gracias a `align-items: stretch` del padre); el
                  contenido real vive en un hijo `position: absolute; inset: 0`
                  para que ambos (mapa y progresión) se ajusten a ese alto y
                  no al revés. El mapa fija su propio ancho según su
                  `aspect-ratio` real (sin recortes, alineado a la
                  izquierda), y la progresión de goles ocupa como hermano
                  flex el espacio restante. */}
              <div className="equipo-mapa-col">
                <div className="equipo-mapa-col-inner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <BarChart3 size={18} color="var(--color-accent)" />
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Mapa de goles</h3>
                  </div>
                  <div className="equipo-mapa-progresion-row" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', gap: '12px' }}>
                    {loadingStatsEquipo ? (
                      <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: '12px' }}>
                        <Loader2 size={24} className="spin" color="var(--color-accent)" />
                      </div>
                    ) : (
                      <>
                        <MapaGolesEquipo
                          goles={golesEquipoNormalizados}
                          colorEquipo={equipoSeleccionado.color_hex || '#00C88C'}
                        />
                        <div style={{
                          flex: 1, minWidth: 0, height: '100%',
                          display: 'flex', flexDirection: 'column', gap: '12px',
                          overflowY: 'auto',
                        }}>
                          <ProgresionGolesLateral
                            conteos={progresionGolesEquipo.conteos}
                            escudoUrl={equipoSeleccionado.escudo_url}
                          />
                          <PowerupsUsadosLateral
                            powerups={powerupsDesgloseEquipo}
                          />
                          <UltimosCincoPartidosLateral
                            partidos={ultimosCincoPartidos}
                            equipoId={equipoSeleccionado.id}
                            equipoById={equipoById}
                            eloHistorialPorPartidoId={eloHistorialPorPartidoId}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Progresión de ELO del equipo seleccionado, a ancho completo.
                Reutiliza el historial ya calculado globalmente (resultadoElo),
                filtrando solo las entradas donde el equipo seleccionado
                participó. No tiene toggle de equipos (solo hay uno), pero sí
                mantiene el selector Exacto/Suavizado. ─── */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <LineChartIcon size={22} color="var(--color-accent)" />
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Progresión de ELO</h2>
                {loadingElo && (
                  <span style={{
                    padding: '3px 10px', borderRadius: '20px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
                    color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <Loader2 size={12} className="spin" />
                    Calculando...
                  </span>
                )}
              </div>
              <div style={{
                borderRadius: '12px', border: '2px solid var(--color-border)',
                background: 'var(--color-background)', padding: '16px',
              }}>
                {loadingElo && resultadoElo.historial.length === 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <Loader2 size={24} className="spin" color="var(--color-accent)" />
                  </div>
                ) : (
                  <GraficaProgresionEloEquipo
                    historial={resultadoElo.historial}
                    equipoId={equipoSeleccionado.id}
                    color={equipoSeleccionado.color_hex || '#00C88C'}
                  />
                )}
              </div>
              {/* ─── Historial de partidos del equipo seleccionado, mismo formato
                que el historial global (mapa de goles + head-to-head al
                expandir), pero filtrado únicamente a los partidos donde
                jugó este equipo. ─── */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', marginTop: '24px', flexWrap: 'wrap' }}>
                  <History size={22} color="var(--color-accent)" />
                  <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Historial de partidos</h2>
                  {!loadingStatsEquipo && (
                    <span style={{
                      padding: '3px 10px', borderRadius: '20px',
                      background: 'rgba(0,200,140,0.1)', border: '1px solid rgba(0,200,140,0.3)',
                      color: 'var(--color-accent)', fontSize: '12px', fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      <Zap size={12} />
                      {teamMatchesEquipo.length} partidos jugados
                    </span>
                  )}
                </div>

                {loadingStatsEquipo ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <Loader2 size={24} className="spin" color="var(--color-accent)" />
                  </div>
                ) : teamMatchesEquipo.length === 0 ? (
                  <div style={{ padding: '40px', borderRadius: '12px', border: '2px dashed var(--color-border)', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                    No hay partidos jugados aún.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {teamMatchesEquipo.map(detail => {
                      const local = equipoById(detail.partido.equipo_local_id)
                      const visitante = equipoById(detail.partido.equipo_visitante_id)
                      const golesLocal = detail.partido.goles_local ?? 0
                      const golesVisitante = detail.partido.goles_visitante ?? 0
                      const localGano = golesLocal > golesVisitante
                      const visitanteGano = golesVisitante > golesLocal
                      const empate = golesLocal === golesVisitante
                      const isExpanded = expandedMatchId === detail.partido.id

                      const key = h2hKey(detail.partido.equipo_local_id, detail.partido.equipo_visitante_id)
                      const h2hTodos = h2hCache[key] || []
                      // ─── El orden ya viene fijado (único criterio: inicio_timestamp desc) desde
                      // la carga del h2h. El partido actual de la card se resalta donde le
                      // corresponda cronológicamente, sin forzarlo al inicio de la lista. ───
                      const h2hPartidos = h2hTodos

                      return (
                        <div
                          key={detail.partido.id}
                          className="match-card"
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedMatchId(null)
                              setH2hExpandido(prev => ({ ...prev, [detail.partido.id]: false }))
                            } else {
                              setExpandedMatchId(detail.partido.id)
                            }
                          }}
                          style={{
                            border: `2px solid ${isExpanded ? 'var(--color-accent)' : 'var(--color-border)'}`,
                            background: 'var(--color-background)',
                          }}
                        >
                          <div className="side-bar" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '10px', backgroundColor: empate ? 'gray' : (localGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }} />
                          <div className="side-bar" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '10px', backgroundColor: empate ? 'gray' : (visitanteGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }} />
                          {detail.partido.confirmado && (
                            <div style={{
                              position: 'absolute',
                              bottom: 6,
                              right: 16,
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: '#00C88C',
                              boxShadow: '0 0 4px #00C88C',
                              zIndex: 10,
                              pointerEvents: 'none',
                            }} />
                          )}
                          <div className="match-card-inner" style={{ margin: '0 30px' }}>
                            {/* Fecha y hora + edición del torneo (para diferenciarlos, dado que es vista global) */}
                            {(detail.partido.inicio_timestamp || edicionLabel(detail.partido.torneo_id)) && (
                              <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                textAlign: 'center',
                                paddingTop: '10px',
                                fontSize: '10px',
                                color: 'rgba(255,255,255,0.3)',
                                fontWeight: 500,
                              }}>
                                {detail.partido.inicio_timestamp && (
                                  <span>
                                    {new Date(detail.partido.inicio_timestamp).toLocaleString('es-CO', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                )}
                                {edicionLabel(detail.partido.torneo_id) && (
                                  <span style={{
                                    padding: '1px 8px', borderRadius: '10px',
                                    background: faseInfo(detail.partido) ? `${faseInfo(detail.partido)!.color}1A` : 'rgba(255,255,255,0.06)',
                                    border: `1px solid ${faseInfo(detail.partido) ? `${faseInfo(detail.partido)!.color}66` : 'var(--color-border)'}`,
                                    color: faseInfo(detail.partido) ? faseInfo(detail.partido)!.color : 'rgba(255,255,255,0.45)',
                                    fontWeight: 700,
                                  }}>
                                    {edicionLabel(detail.partido.torneo_id)}
                                    {faseInfo(detail.partido) && ` · ${faseInfo(detail.partido)!.nombre}`}
                                  </span>
                                )}
                              </div>
                            )}
                            <div style={{ padding: '16px 0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
                                  <div className="match-pu-badges" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {(detail.powerups[detail.partido.equipo_local_id] || []).map(pu => (
                                      <div key={pu.powerupId} className="pu-badge" style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,200,140,0.1)', borderRadius: 6, padding: '2px 6px', border: '1px solid var(--color-accent)' }}>
                                        <img src={POWERUP_IMAGES[pu.nombre] || ''} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                                        <span style={{ fontSize: 12, color: 'var(--color-accent)' }}>{pu.cantidad}</span>
                                      </div>
                                    ))}
                                  </div>
                                  {local?.escudo_url
                                    ? <img src={local.escudo_url} className="escudo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                                    : <div className="escudo" style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--color-border)' }} />
                                  }
                                  <span className="match-team-name" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{local?.nombre}</span>
                                </div>

                                <div className="score-display match-score" style={{ fontSize: 24, fontWeight: 800, whiteSpace: 'nowrap' }}>
                                  <span style={{ color: empate ? 'var(--color-textWH)' : (localGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }}>
                                    {golesLocal}
                                  </span>
                                  <span style={{ color: 'var(--color-textWH)' }}> : </span>
                                  <span style={{ color: empate ? 'var(--color-textWH)' : (visitanteGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }}>
                                    {golesVisitante}
                                  </span>
                                </div>

                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
                                  <span className="match-team-name" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{visitante?.nombre}</span>
                                  {visitante?.escudo_url
                                    ? <img src={visitante.escudo_url} className="escudo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                                    : <div className="escudo" style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--color-border)' }} />
                                  }
                                  <div className="match-pu-badges" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {(detail.powerups[detail.partido.equipo_visitante_id] || []).map(pu => (
                                      <div key={pu.powerupId} className="pu-badge" style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,200,140,0.1)', borderRadius: 6, padding: '2px 6px', border: '1px solid var(--color-accent)' }}>
                                        <img src={POWERUP_IMAGES[pu.nombre] || ''} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                                        <span style={{ fontSize: 12, color: 'var(--color-accent)' }}>{pu.cantidad}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                                  ⏱ {formatearDuracion(detail.partido.duracion_segundos || 0)}
                                </span>
                              </div>

                              {/* ─── ELO inicial y final del partido (ambos equipos) ─── */}
                              {(() => {
                                const eloEntry = eloHistorialPorPartidoId[detail.partido.id]
                                if (!eloEntry) return null

                                const deltaLocal = Math.round(eloEntry.eloLocalDespues) - Math.round(eloEntry.eloLocalAntes)
                                const deltaVisitante = Math.round(eloEntry.eloVisitanteDespues) - Math.round(eloEntry.eloVisitanteAntes)

                                const TrendIcon = (delta: number) => delta > 0 ? TrendingUp : (delta < 0 ? TrendingDown : Minus)
                                const trendColor = (delta: number) => delta > 0 ? 'var(--color-accent)' : (delta < 0 ? 'var(--color-error)' : 'rgba(255,255,255,0.4)')

                                const EloBloque = ({ delta, antes, despues, alinear }: { delta: number; antes: number; despues: number; alinear: 'flex-end' | 'flex-start' }) => {
                                  const Icon = TrendIcon(delta)
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: alinear }}>
                                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                                        {Math.round(antes)}
                                      </span>
                                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>→</span>
                                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-textWH)' }}>
                                        {Math.round(despues)}
                                      </span>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: trendColor(delta) }}>
                                        <Icon size={12} />
                                        <span style={{ fontSize: 11, fontWeight: 700 }}>
                                          {delta > 0 ? `+${delta}` : delta}
                                        </span>
                                      </span>
                                    </div>
                                  )
                                }

                                return (
                                  <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
                                    marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--color-border)',
                                    flexWrap: 'wrap',
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <Trophy size={11} color="rgba(255,255,255,0.3)" />
                                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        ELO
                                      </span>
                                    </div>
                                    <EloBloque delta={deltaLocal} antes={eloEntry.eloLocalAntes} despues={eloEntry.eloLocalDespues} alinear="flex-end" />
                                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>|</span>
                                    <EloBloque delta={deltaVisitante} antes={eloEntry.eloVisitanteAntes} despues={eloEntry.eloVisitanteDespues} alinear="flex-start" />
                                  </div>
                                )
                              })()}
                            </div>

                            <div className={`map-container ${isExpanded ? 'expanded' : ''} ${h2hExpandido[detail.partido.id] ? 'h2h-open' : ''}`}>
                              <div className="expanded-split" style={{
                                borderTop: '1px solid var(--color-border)',
                              }}>
                                {/* Columna 60%: mapa de goles */}
                                <div className="expanded-split-main" style={{ padding: '10px 0 20px' }}>
                                  {loadingMatchGoals && isExpanded ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                                      <Loader2 size={24} className="spin" />
                                    </div>
                                  ) : (
                                    <>
                                      {expandedMatchGoals.filter(g => g.pos_x != null && g.pos_y != null).length > 0 ? (
                                        <div className="gol-map-container" style={{
                                          position: 'relative',
                                          width: '96%',
                                          margin: '0 auto',
                                          aspectRatio: '16/9',
                                          borderRadius: '8px',
                                          overflow: 'hidden',
                                          border: '0px solid var(--color-border)',
                                        }}>
                                          <img src={canchaImage} alt="" style={{
                                            position: 'absolute', inset: 0,
                                            width: '100%', height: '100%',
                                            objectFit: 'cover', objectPosition: 'center',
                                            zIndex: 1,
                                          }} />
                                          <div style={{
                                            position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
                                            background: `linear-gradient(to right,
                                              ${local?.color_hex || '#00C88C'} 0%, ${local?.color_hex || '#00C88C'} 6.58%,
                                              transparent 6.58%, transparent 93.39%,
                                              ${visitante?.color_hex || '#FF4D4D'} 93.39%, ${visitante?.color_hex || '#FF4D4D'} 100%)`,
                                            mixBlendMode: 'multiply',
                                            WebkitMaskImage: `url(${canchaImage})`,
                                            maskImage: `url(${canchaImage})`,
                                            WebkitMaskSize: 'cover',
                                            maskSize: 'cover',
                                            WebkitMaskPosition: 'center',
                                            maskPosition: 'center',
                                          }} />
                                          {expandedMatchGoals.filter(g => g.pos_x != null && g.pos_y != null).map(gol => {
                                            const color = equipoById(gol.equipo_id)?.color_hex || '#FF0000'
                                            return (
                                              <div key={gol.id} style={{
                                                position: 'absolute',
                                                left: `${gol.pos_x}%`,
                                                top: `${gol.pos_y}%`,
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                backgroundColor: darkenHex(color, 0.6),
                                                border: `3px solid ${color}`,
                                                transform: 'translate(-50%, -50%)',
                                                boxShadow: `0 0 10px ${color}`,
                                                zIndex: 5,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#fff',
                                                fontSize: '10px',
                                                fontWeight: 'bold',
                                              }}>
                                                {expandedMatchGoals.filter(g => g.equipo_id === gol.equipo_id && g.pos_x != null).indexOf(gol) + 1}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      ) : (
                                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', padding: '16px' }}>
                                          No hay goles con ubicación registrada
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {!loadingMatchGoals && expandedMatchGoals.length > 0 && (
                                    <div style={{
                                      display: 'flex', gap: 16,
                                      width: '96%', margin: '14px auto 0',
                                      padding: '14px 16px',
                                      borderRadius: 10,
                                      background: 'rgba(255,255,255,0.03)',
                                      border: '1px solid var(--color-border)',
                                    }}>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                          {local?.escudo_url
                                            ? <img src={local.escudo_url} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                                            : <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--color-border)' }} />
                                          }
                                          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            {local?.nombre ?? 'Local'}
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                          {expandedMatchGoals.filter(g => g.equipo_id === detail.partido.equipo_local_id).length === 0 ? (
                                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sin goles</span>
                                          ) : (
                                            expandedMatchGoals
                                              .filter(g => g.equipo_id === detail.partido.equipo_local_id)
                                              .map((g, idx) => (
                                                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                  <span style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    width: 18, height: 18, borderRadius: '50%',
                                                    background: 'rgba(0,200,140,0.15)',
                                                    border: '1px solid rgba(0,200,140,0.4)',
                                                    fontSize: 10, fontWeight: 800, color: 'var(--color-accent)',
                                                    flexShrink: 0,
                                                  }}>
                                                    {idx + 1}
                                                  </span>
                                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-textWH)' }}>
                                                    ⚽ {formatearDuracion(g.minuto)}
                                                  </span>
                                                </div>
                                              ))
                                          )}
                                        </div>
                                      </div>
                                      <div style={{ width: 1, background: 'var(--color-border)' }} />
                                      <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, justifyContent: 'flex-end' }}>
                                          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            {visitante?.nombre ?? 'Visitante'}
                                          </span>
                                          {visitante?.escudo_url
                                            ? <img src={visitante.escudo_url} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                                            : <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--color-border)' }} />
                                          }
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
                                          {expandedMatchGoals.filter(g => g.equipo_id === detail.partido.equipo_visitante_id).length === 0 ? (
                                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sin goles</span>
                                          ) : (
                                            expandedMatchGoals
                                              .filter(g => g.equipo_id === detail.partido.equipo_visitante_id)
                                              .map((g, idx) => (
                                                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row-reverse' }}>
                                                  <span style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    width: 18, height: 18, borderRadius: '50%',
                                                    background: 'rgba(0,200,140,0.15)',
                                                    border: '1px solid rgba(0,200,140,0.4)',
                                                    fontSize: 10, fontWeight: 800, color: 'var(--color-accent)',
                                                    flexShrink: 0,
                                                  }}>
                                                    {idx + 1}
                                                  </span>
                                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-textWH)' }}>
                                                    ⚽ {formatearDuracion(g.minuto)}
                                                  </span>
                                                </div>
                                              ))
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Columna 40%: historial head-to-head entre estos dos equipos */}
                                <div className="expanded-split-h2h" style={{ padding: '10px 16px 20px' }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                                    Historial entre ambos
                                  </div>
                                  {loadingH2h && !h2hCache[key] ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                                      <Loader2 size={20} className="spin" />
                                    </div>
                                  ) : h2hTodos.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px', padding: '16px' }}>
                                      No hay más enfrentamientos registrados entre estos equipos.
                                    </div>
                                  ) : (
                                    <>
                                      {(() => {
                                        let vLocal = 0, empates = 0, vVisitante = 0
                                        h2hTodos.forEach(hp => {
                                          const esMismoOrden = hp.equipo_local_id === detail.partido.equipo_local_id
                                          const gRef = esMismoOrden ? hp.goles_local : hp.goles_visitante
                                          const gOtro = esMismoOrden ? hp.goles_visitante : hp.goles_local
                                          if ((gRef ?? 0) > (gOtro ?? 0)) vLocal++
                                          else if ((gOtro ?? 0) > (gRef ?? 0)) vVisitante++
                                          else empates++
                                        })
                                        const colorLocal = local?.color_hex || 'var(--color-accent)'
                                        const colorVisitante = visitante?.color_hex || 'var(--color-error)'
                                        const totalEnfrentamientos = vLocal + empates + vVisitante
                                        const pctLocal = totalEnfrentamientos > 0 ? Math.round((vLocal / totalEnfrentamientos) * 100) : null
                                        const pctEmpates = totalEnfrentamientos > 0 ? Math.round((empates / totalEnfrentamientos) * 100) : null
                                        const pctVisitante = totalEnfrentamientos > 0 ? Math.round((vVisitante / totalEnfrentamientos) * 100) : null
                                        return (
                                          <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 10px', borderRadius: 8, marginBottom: 10,
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid var(--color-border)',
                                          }}>
                                            <div style={{ textAlign: 'center', flex: 1 }}>
                                              <div style={{ fontSize: 26, fontWeight: 800, color: colorLocal, lineHeight: 1 }}>{vLocal}</div>
                                              {pctLocal !== null && (
                                                <div style={{ fontSize: 11, fontWeight: 700, color: colorPorPorcentaje(pctLocal), marginTop: 3 }}>{pctLocal}%</div>
                                              )}
                                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{local?.nombre ?? 'Local'}</div>
                                            </div>
                                            <div style={{ textAlign: 'center', flex: 1 }}>
                                              <div style={{ fontSize: 26, fontWeight: 800, color: 'rgba(255,255,255,0.6)', lineHeight: 1 }}>{empates}</div>
                                              {pctEmpates !== null && (
                                                <div style={{ fontSize: 11, fontWeight: 700, color: colorPorPorcentaje(pctEmpates), marginTop: 3 }}>{pctEmpates}%</div>
                                              )}
                                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>Empates</div>
                                            </div>
                                            <div style={{ textAlign: 'center', flex: 1 }}>
                                              <div style={{ fontSize: 26, fontWeight: 800, color: colorVisitante, lineHeight: 1 }}>{vVisitante}</div>
                                              {pctVisitante !== null && (
                                                <div style={{ fontSize: 11, fontWeight: 700, color: colorPorPorcentaje(pctVisitante), marginTop: 3 }}>{pctVisitante}%</div>
                                              )}
                                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{visitante?.nombre ?? 'Visitante'}</div>
                                            </div>
                                          </div>
                                        )
                                      })()}

                                      {h2hPartidos.length === 0 ? (
                                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px', padding: '16px' }}>
                                          No hay más enfrentamientos registrados entre estos equipos.
                                        </div>
                                      ) : (
                                        <>
                                        <div className={`h2h-scroll ${h2hExpandido[detail.partido.id] ? 'h2h-full' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                          {h2hPartidos.map(hp => {
                                            const esMismoOrden = hp.equipo_local_id === detail.partido.equipo_local_id
                                            const gLocalRef = esMismoOrden ? hp.goles_local : hp.goles_visitante
                                            const gVisitanteRef = esMismoOrden ? hp.goles_visitante : hp.goles_local
                                            const refGano = (gLocalRef ?? 0) > (gVisitanteRef ?? 0)
                                            const otroGano = (gVisitanteRef ?? 0) > (gLocalRef ?? 0)
                                            const hpEdicion = edicionLabel(hp.torneo_id)
                                            const hpFase = faseInfo(hp)
                                            const esPartidoActual = hp.id === detail.partido.id

                                            return (
                                              <div key={hp.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '6px 10px', borderRadius: 8,
                                                background: esPartidoActual ? 'rgba(0,200,140,0.16)' : 'rgba(255,255,255,0.03)',
                                                border: esPartidoActual ? '1px solid rgba(0,200,140,0.7)' : '1px solid var(--color-border)',
                                                boxShadow: esPartidoActual ? '0 0 8px rgba(0,200,140,0.35)' : 'none',
                                                fontSize: 12,
                                              }}>
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
                                                  <span style={{
                                                    fontWeight: refGano ? 700 : 500,
                                                    color: refGano ? 'var(--color-textWH)' : 'rgba(255,255,255,0.55)',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                  }}>
                                                    {local?.nombre ?? '—'}
                                                  </span>
                                                  {local?.escudo_url
                                                    ? <img src={local.escudo_url} style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                                                    : <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--color-border)', flexShrink: 0 }} />
                                                  }
                                                </div>

                                                <span style={{ fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                                                  <span style={{
                                                    color: refGano ? 'var(--color-accent)' : (otroGano ? 'var(--color-error)' : 'rgba(255,255,255,0.6)'),
                                                  }}>
                                                    {gLocalRef ?? '–'}
                                                  </span>
                                                  <span style={{ color: 'var(--color-textWH)' }}> : </span>
                                                  <span style={{
                                                    color: otroGano ? 'var(--color-accent)' : (refGano ? 'var(--color-error)' : 'rgba(255,255,255,0.6)'),
                                                  }}>
                                                    {gVisitanteRef ?? '–'}
                                                  </span>
                                                </span>

                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                                  {visitante?.escudo_url
                                                    ? <img src={visitante.escudo_url} style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                                                    : <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--color-border)', flexShrink: 0 }} />
                                                  }
                                                  <span style={{
                                                    fontWeight: otroGano ? 700 : 500,
                                                    color: otroGano ? 'var(--color-textWH)' : 'rgba(255,255,255,0.55)',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                  }}>
                                                    {visitante?.nombre ?? '—'}
                                                  </span>
                                                </div>

                                                {hpEdicion && (
                                                  <span style={{
                                                    flexShrink: 0,
                                                    fontSize: 10,
                                                    fontWeight: 600,
                                                    color: 'rgba(255,255,255,0.4)',
                                                    whiteSpace: 'nowrap',
                                                    marginLeft: 2,
                                                    paddingLeft: 8,
                                                    borderLeft: '1px solid var(--color-border)',
                                                  }}>
                                                    {hpEdicion}
                                                  </span>
                                                )}

                                                {hpFase && (
                                                  <span title={hpFase.nombre} style={{
                                                    flexShrink: 0,
                                                    fontSize: 11,
                                                    fontWeight: 800,
                                                    color: hpFase.color,
                                                    whiteSpace: 'nowrap',
                                                  }}>
                                                    {hpFase.letra}
                                                  </span>
                                                )}

                                              </div>
                                            )
                                          })}
                                          {!h2hExpandido[detail.partido.id] && h2hPartidos.length >= 8 && (
                                            <div className="h2h-fade" />
                                          )}
                                        </div>
                                        {!h2hExpandido[detail.partido.id] && h2hPartidos.length >= 8 && (
                                          <button
                                            className="h2h-ver-todos-btn"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setH2hExpandido(prev => ({ ...prev, [detail.partido.id]: true }))
                                            }}
                                          >
                                            Ver todos ({h2hPartidos.length})
                                          </button>
                                        )}
                                        </>
                                      )}

                                      <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
                                        gap: '10px', marginTop: 10, paddingTop: 8,
                                        borderTop: '1px solid var(--color-border)',
                                      }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                                          <span style={{ fontWeight: 800, color: 'rgba(255,255,255,0.5)' }}>G</span>
                                          Grupos
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                                          <span style={{ fontWeight: 800, color: '#FF4D4D' }}>E</span>
                                          Eliminatoria
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                                          <span style={{ fontWeight: 800, color: '#FFC800' }}>F</span>
                                          Final
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}