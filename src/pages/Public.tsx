// src/pages/Public.tsx
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ChevronDown, Trophy, Loader2, Zap, History, Calendar, Radio, Check, X as XIcon, User
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTorneoActivo, type Torneo } from '../hooks/useTorneoActivo'
import canchaImage from '../assets/cancha.png'
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
}

interface Jornada {
  id: string
  numero: number
  partidos: Partido[]
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

interface EquipoPowerups {
  equipo: Equipo
  powerups: PowerupInfo[]
  total: number
}

interface MatchDetail {
  partido: Partido
  powerups: { [equipoId: string]: PowerupInfo[] }
}

// ─── Racha y forma reciente de un equipo (feature 1) ───
interface RachaYForma {
  rachaMaxima: number // mayor racha histórica sin perder (victorias + empates consecutivos)
  ultimos5: ('V' | 'E' | 'D')[] // más reciente al final
}

// ─── Progresión de goles por intervalos de minutos (feature 4) ───
// Intervalos en minutos: (1,15) (16,30) (31,45) (46,60) (61,75) (75>)
const INTERVALOS_GOLES: { desde: number; hasta: number; label: string }[] = [
  { desde: 0, hasta: 400, label: '0:00-6:40' },
  { desde: 400, hasta: 800, label: '6:40-13:20' },
  { desde: 800, hasta: 1200, label: '13:20-20:00' },
  { desde: 1200, hasta: 1600, label: '20:00-26:40' },
  { desde: 1600, hasta: 2000, label: '26:40-33:20' },
  { desde: 2000, hasta: Infinity, label: '33:20-40:00+' },
]
const INTERVALO_COLORES = ['#FF2D6B', '#FFA135', '#F4E018', '#2FE07A', '#2FB6E0', '#B5266E']

interface ProgresionGoles {
  conteos: number[] // uno por cada INTERVALOS_GOLES
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

// ─── Constantes de reglas del juego (usadas para límites de partido y probabilidades) ───
// Fase de grupos y eliminatorias (no-final): máximo 3 goles, 36 minutos (2160s)
// Final: máximo 5 goles, 55 minutos (3300s)
const REGLAS_PARTIDO = {
  grupos: { golesMax: 3, duracionMax: 36 * 60 },
  eliminatorias: { golesMax: 3, duracionMax: 36 * 60 },
  final: { golesMax: 5, duracionMax: 55 * 60 },
}

function obtenerReglasPartido(partido: Partido) {
  if (partido.ronda === 'final') return REGLAS_PARTIDO.final
  if (partido.fase === 'eliminatorias') return REGLAS_PARTIDO.eliminatorias
  return REGLAS_PARTIDO.grupos
}

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
// Pensado para contrastar sobre fondos oscuros.
function colorPorPorcentaje(pct: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [255, 77, 77]],     // rojo
    [25, [255, 150, 60]],   // naranja
    [50, [255, 220, 70]],   // amarillo
    [75, [110, 220, 120]],  // verde
    [100, [80, 160, 255]],  // azul
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

// Genera una clave única y estable para un par de equipos, sin importar el orden
function h2hKey(equipoAId: string, equipoBId: string) {
  return [equipoAId, equipoBId].sort().join('__')
}

// ─── Cálculo de racha máxima (sin derrota: victorias + empates cuentan) y forma
// de los últimos 5 partidos, a partir del historial completo de un equipo (orden
// cronológico ascendente esperado). ───
function calcularRachaYForma(partidosOrdenadosAsc: { golesA: number | null; golesB: number | null }[]): RachaYForma {
  let rachaMaxima = 0
  let rachaActual = 0
  const resultados: ('V' | 'E' | 'D')[] = []

  partidosOrdenadosAsc.forEach(p => {
    if (p.golesA == null || p.golesB == null) return
    let resultado: 'V' | 'E' | 'D'
    if (p.golesA > p.golesB) resultado = 'V'
    else if (p.golesA < p.golesB) resultado = 'D'
    else resultado = 'E'

    resultados.push(resultado)

    if (resultado === 'D') {
      rachaActual = 0
    } else {
      rachaActual++
      if (rachaActual > rachaMaxima) rachaMaxima = rachaActual
    }
  })

  const ultimos5 = resultados.slice(-5)
  return { rachaMaxima, ultimos5 }
}

// ─── Cálculo de progresión de goles por intervalos de minutos, a partir de la
// lista completa de goles históricos anotados por un equipo. ───
function calcularProgresionGoles(golesDelEquipo: { minuto: number }[]): ProgresionGoles {
  const conteos = new Array(INTERVALOS_GOLES.length).fill(0)
  golesDelEquipo.forEach(g => {
    const segundos = g.minuto // ya viene en segundos desde la tabla `goles`
    const idx = INTERVALOS_GOLES.findIndex(iv => segundos >= iv.desde && segundos < iv.hasta)
    if (idx >= 0) conteos[idx]++
  })
  return { conteos }
}

// ─── Cálculo de probabilidades de victoria/empate/derrota para el partido en vivo ───
// Nuevo enfoque (más determinista con marcador + tiempo):
//  1) Un "prior" inicial de fuerza de cada equipo basado ÚNICAMENTE en su récord
//     histórico general (% de partidos ganados contra cualquier rival). Este prior
//     solo determina el punto de partida (minuto 0, marcador 0-0).
//  2) A medida que el partido avanza (más tiempo transcurrido) y/o aparece una
//     diferencia de goles, el peso se traslada agresivamente hacia el marcador
//     real y el tiempo restante, de forma que cerca del final del partido con
//     ventaja en el marcador la probabilidad del equipo que va ganando se acerque
//     al 98-99%.
function calcularProbabilidades(params: {
  partido: Partido
  golesLocal: number
  golesVisitante: number
  segundos: number
  recordLocal: { victorias: number; empates: number; derrotas: number } | null
  recordVisitante: { victorias: number; empates: number; derrotas: number } | null
}): { local: number; empate: number; visitante: number } {
  const { partido, golesLocal, golesVisitante, segundos, recordLocal, recordVisitante } = params
  const { golesMax, duracionMax } = obtenerReglasPartido(partido)

  // ─── 1) Prior inicial por récord general de cada equipo (independiente entre
  // sí: la "fuerza" de cada equipo se calcula contra CUALQUIER rival). Suavizado
  // Laplace para evitar 0/0 con pocas muestras. ───
  const probsRecord = (record: { victorias: number; empates: number; derrotas: number } | null) => {
    const v = (record?.victorias ?? 0) + 0.5
    const e = (record?.empates ?? 0) + 0.5
    const d = (record?.derrotas ?? 0) + 0.5
    const total = v + e + d
    return { pv: v / total, pe: e / total, pd: d / total }
  }
  const recLocal = probsRecord(recordLocal)
  const recVisitante = probsRecord(recordVisitante)

  const fuerzaLocal = recLocal.pv * (1 - recVisitante.pv)
  const fuerzaVisitante = recVisitante.pv * (1 - recLocal.pv)
  const fuerzaEmpate = (recLocal.pe + recVisitante.pe) / 2
  const sumaFuerza = fuerzaLocal + fuerzaVisitante + fuerzaEmpate
  const priorLocal = sumaFuerza > 0 ? fuerzaLocal / sumaFuerza : 0.4
  const priorEmpate = sumaFuerza > 0 ? fuerzaEmpate / sumaFuerza : 0.2
  const priorVisitante = sumaFuerza > 0 ? fuerzaVisitante / sumaFuerza : 0.4

  // ─── 2) Si el partido ya terminó por marcador (llegó al máximo de goles) ───
  if (golesLocal >= golesMax && golesLocal > golesVisitante) {
    return { local: 100, empate: 0, visitante: 0 }
  }
  if (golesVisitante >= golesMax && golesVisitante > golesLocal) {
    return { local: 0, empate: 0, visitante: 100 }
  }

  // ─── 3) Ajuste en vivo según diferencia de goles y tiempo restante ───
  const diferencia = golesLocal - golesVisitante
  const tiempoRestanteFrac = Math.max(0, Math.min(1, 1 - segundos / duracionMax))
  const tiempoTranscurridoFrac = 1 - tiempoRestanteFrac

  // El peso del marcador/tiempo en vivo crece agresivamente con el tiempo
  // transcurrido y con la magnitud de la diferencia de goles respecto al máximo
  // posible. Se usa una curva cuadrática sobre el tiempo transcurrido para que
  // el prior domine al inicio del partido, pero pierda peso rápido después.
  const pesoPorTiempo = Math.pow(tiempoTranscurridoFrac, 1.6)
  const magnitudDiferencia = Math.min(1, Math.abs(diferencia) / golesMax)
  // Con diferencia de goles, aunque sea muy temprano, ya debe pesar bastante el marcador
  const pesoBasePorGoles = magnitudDiferencia > 0 ? 0.35 + 0.35 * magnitudDiferencia : 0
  const pesoMarcador = Math.max(pesoPorTiempo, pesoBasePorGoles, diferencia !== 0 ? 0.15 : 0)

  let liveLocal: number
  let liveEmpate: number
  let liveVisitante: number

  if (diferencia === 0) {
    // Empatando: el empate gana peso cuanto menos tiempo queda (partido puede
    // terminar en empate si el reglamento lo permite, o simplemente refleja
    // incertidumbre alta)
    liveEmpate = 0.2 + 0.55 * tiempoTranscurridoFrac
    const restante = 1 - liveEmpate
    liveLocal = restante / 2
    liveVisitante = restante / 2
  } else {
    const favoritoLocal = diferencia > 0
    // Combinamos magnitud de la diferencia de goles con el tiempo transcurrido:
    // con ventaja de 1 gol a falta de poco tiempo, la probabilidad ya debe ser
    // muy alta (ej. 2-0 al minuto 35 de 36 -> ~98-99%).
    const factorGoles = magnitudDiferencia // 0 a 1 (1 = diferencia máxima posible)
    const probFavorito = 0.5
      + 0.30 * factorGoles
      + 0.45 * tiempoTranscurridoFrac * (0.5 + 0.5 * factorGoles)
    const probFavoritoClamp = Math.min(0.99, probFavorito)
    liveEmpate = Math.max(0.005, (1 - probFavoritoClamp) * (0.4 * tiempoRestanteFrac + 0.05))
    const restante = 1 - probFavoritoClamp - liveEmpate
    if (favoritoLocal) {
      liveLocal = probFavoritoClamp
      liveVisitante = Math.max(0.005, restante)
    } else {
      liveVisitante = probFavoritoClamp
      liveLocal = Math.max(0.005, restante)
    }
  }

  // ─── 4) Combinamos el prior (récord general) con el ajuste en vivo, dando
  // cada vez más peso al marcador/tiempo en vivo a medida que el partido
  // avanza o aparece diferencia de goles. ───
  const combinado = {
    local: priorLocal * (1 - pesoMarcador) + liveLocal * pesoMarcador,
    empate: priorEmpate * (1 - pesoMarcador) + liveEmpate * pesoMarcador,
    visitante: priorVisitante * (1 - pesoMarcador) + liveVisitante * pesoMarcador,
  }

  const sumaTotal = combinado.local + combinado.empate + combinado.visitante
  const local = Math.round((combinado.local / sumaTotal) * 100)
  const empate = Math.round((combinado.empate / sumaTotal) * 100)
  let visitante = 100 - local - empate
  if (visitante < 0) visitante = 0

  return { local, empate, visitante }
}

// ─── Componente principal ───
export default function Public() {
  const { torneos, torneoActivo, setTorneoActivo } = useTorneoActivo()
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [partidosGrupos, setPartidosGrupos] = useState<Partido[]>([])
  const [partidosEliminatorios, setPartidosEliminatorios] = useState<Partido[]>([])
  const [, setGoles] = useState<Gol[]>([])
  const [powerupsUsage, setPowerupsUsage] = useState<EquipoPowerups[]>([])
  const [loading, setLoading] = useState(true)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null)
  const [expandedMatchGoals, setExpandedMatchGoals] = useState<Gol[]>([])
  const [loadingMatchGoals, setLoadingMatchGoals] = useState(false)
  const [teamMatches, setTeamMatches] = useState<MatchDetail[]>([])
  const [realtimeUpdating, setRealtimeUpdating] = useState(false)

  // ─── Récord general de cada equipo (victorias/empates/derrotas contra CUALQUIER
  // rival, en cualquier torneo, fase de grupos + eliminatorias). Se usa como estimador
  // inicial de fuerza de cada equipo. Se cachea por equipo_id. ───
  const [recordGeneralCache, setRecordGeneralCache] = useState<Record<string, { victorias: number; empates: number; derrotas: number }>>({})
  const [recordGeneralCargado, setRecordGeneralCargado] = useState<Record<string, boolean>>({})

  // ─── Racha máxima histórica sin perder + forma de los últimos 5 partidos,
  // por equipo (feature 1). Se cachea por equipo_id. ───
  const [rachaFormaCache, setRachaFormaCache] = useState<Record<string, RachaYForma>>({})
  const [rachaFormaCargado, setRachaFormaCargado] = useState<Record<string, boolean>>({})

  // ─── Progresión histórica de goles por intervalos de minutos, por equipo
  // (feature 4). Se cachea por equipo_id. ───
  const [progresionGolesCache, setProgresionGolesCache] = useState<Record<string, ProgresionGoles>>({})
  const [progresionGolesCargado, setProgresionGolesCargado] = useState<Record<string, boolean>>({})

  const [h2hExpandido, setH2hExpandido] = useState<Record<string, boolean>>({})
  const [h2hCache, setH2hCache] = useState<Record<string, Partido[]>>({})
  const [loadingH2h, setLoadingH2h] = useState(false)
  const [, setH2hCargado] = useState<Record<string, boolean>>({})

  // ─── Ganadores por torneo (equipo campeón, calculado desde el partido de ronda "final") ───
  const [ganadoresTorneo, setGanadoresTorneo] = useState<Record<string, Equipo | null>>({})

  // ─── Mapa de torneos (id -> datos básicos) para resolver la edición de cada
  // partido del historial head-to-head, sin importar de qué torneo provenga. ───
  const [torneosMap, setTorneosMap] = useState<Record<string, { edicion: string | null; nombre: string | null; numero: number }>>({})

  // ─── Partido(s) en vivo (jugando/pausado) del torneo activo, para la card destacada ───
  const [partidosEnVivo, setPartidosEnVivo] = useState<Partido[]>([])
  const [golesEnVivoPorPartido, setGolesEnVivoPorPartido] = useState<Record<string, Gol[]>>({})
  const [powerupsEnVivoPorPartido, setPowerupsEnVivoPorPartido] = useState<Record<string, { [equipoId: string]: PowerupInfo[] }>>({})
  // Reloj en vivo (tick local, sincronizado con duracion_segundos + estado del partido)
  const [tickEnVivo, setTickEnVivo] = useState(0)

  useEffect(() => {
    if (!torneos || torneos.length === 0) return
    const map: Record<string, { edicion: string | null; nombre: string | null; numero: number }> = {}
    torneos.forEach(t => {
      map[t.id] = { edicion: t.edicion ?? null, nombre: t.nombre ?? null, numero: t.numero }
    })
    setTorneosMap(map)
  }, [torneos])

  // Devuelve la etiqueta de edición para un torneo dado (fallback a "Torneo N" si no tiene edición)
  const edicionLabel = useCallback((torneoId?: string | null) => {
    if (!torneoId) return null
    const t = torneosMap[torneoId]
    if (!t) return null
    return t.edicion || `Torneo ${t.numero}`
  }, [torneosMap])

  // Devuelve la letra + color que representa la fase/ronda de un partido:
  // "G" grupos (gris), "E" eliminatoria (rojo), "F" final (amarillo)
  const faseInfo = useCallback((partido: Partido): { letra: string; color: string } | null => {
    if (partido.ronda === 'final') return { letra: 'F', color: '#FFC800' }
    if (partido.fase === 'eliminatorias') return { letra: 'E', color: '#FF4D4D' }
    if (partido.fase === 'grupos') return { letra: 'G', color: 'rgba(255,255,255,0.5)' }
    return null
  }, [])

  // ─── Título dinámico de la página (pestaña del navegador) ───
  useEffect(() => {
    const etiqueta = torneoActivo?.edicion || (torneoActivo ? `Torneo ${torneoActivo.numero}` : '')
    document.title = `Copa DISCORD${etiqueta ? ` - ${etiqueta}` : ''}`
  }, [torneoActivo])

  const cargarDatos = useCallback(async (torneo: Torneo, isRealtimeUpdate = false) => {
    if (!isRealtimeUpdate) {
      setLoading(true)
    } else {
      setRealtimeUpdating(true)
    }

    try {
      const { data: et } = await supabase
        .from('equipos_torneo').select('equipo_id').eq('torneo_id', torneo.id)
      let equiposList: Equipo[] = []
      if (et && et.length > 0) {
        const ids = et.map(e => e.equipo_id)
        const { data: eqs } = await supabase
          .from('equipos').select('id, nombre, escudo_url, color_hex, dt').in('id', ids)
        if (eqs) equiposList = eqs as Equipo[]
      }
      setEquipos(equiposList)

      const { data: partidosGruposData } = await supabase
        .from('partidos').select('*')
        .eq('torneo_id', torneo.id).eq('fase', 'grupos')
        .not('goles_local', 'is', null).not('goles_visitante', 'is', null)
        .order('created_at', { ascending: false })
      setPartidosGrupos(partidosGruposData || [])

      // ─── Jornadas ───
      const { data: jornadasData } = await supabase
        .from('jornadas').select('*')
        .eq('torneo_id', torneo.id)
        .order('numero', { ascending: true })

      const { data: partidosJornadasData } = await supabase
        .from('partidos').select('*')
        .eq('torneo_id', torneo.id).eq('fase', 'grupos')
        .order('equipo_local_id', { ascending: true })

      if (jornadasData && partidosJornadasData) {
        const j: Jornada[] = jornadasData.map(jor => ({
          id: jor.id,
          numero: jor.numero,
          partidos: partidosJornadasData.filter(p => p.jornada_id === jor.id),
        }))
        setJornadas(j)
      } else {
        setJornadas([])
      }

      const { data: eliminatoriosData } = await supabase
        .from('partidos').select('*')
        .eq('torneo_id', torneo.id).eq('fase', 'eliminatorias')
        .order('ronda', { ascending: true })
      setPartidosEliminatorios(eliminatoriosData || [])

      const eliminatoriosJugados = (eliminatoriosData || []).filter(
        p => p.goles_local != null && p.goles_visitante != null
      )

      const todosPartidos = [...(partidosGruposData || []), ...eliminatoriosJugados]
      const partidosIds = todosPartidos.map(p => p.id)

      // ─── Power-ups: se calculan sobre TODOS los partidos de fase de grupos
      // (jugados o no) para que el total coincida siempre con ClasificatoriaGrupos.tsx,
      // que toma como base todos los partidos de la fase de grupos del torneo. ───
      const { data: partidosGrupoTodos } = await supabase
        .from('partidos').select('id').eq('torneo_id', torneo.id).eq('fase', 'grupos')
      const partidosGrupoIds = (partidosGrupoTodos || []).map(p => p.id)

      if (partidosIds.length > 0) {
        const { data: golesData } = await supabase
          .from('goles').select('*').in('partido_id', partidosIds).order('minuto', { ascending: true })
        setGoles(golesData || [])

        const { data: puUsados } = await supabase
          .from('powerups_usados').select('partido_id, equipo_id, powerup_id, cantidad')
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
          const da = a.partido.created_at ? new Date(a.partido.created_at).getTime() : 0
          const db = b.partido.created_at ? new Date(b.partido.created_at).getTime() : 0
          return db - da
        })
        setTeamMatches(matchesConPowerups)
      } else {
        setGoles([])
        setTeamMatches([])
      }

      // ─── Uso de power-ups por equipo (independiente de si hay partidos jugados,
      // igual que en ClasificatoriaGrupos.tsx: se basa en TODOS los partidos de
      // fase de grupos del torneo, no solo los ya finalizados). ───
      if (equiposList.length > 0) {
        if (partidosGrupoIds.length > 0) {
          const { data: puUsadosGrupo } = await supabase
            .from('powerups_usados').select('equipo_id, powerup_id, cantidad')
            .in('partido_id', partidosGrupoIds)
          const { data: catalogoGrupo } = await supabase.from('powerups_catalogo').select('id, nombre')

          const equipoPowerMap: Record<string, Record<string, number>> = {}
          equiposList.forEach(eq => { equipoPowerMap[eq.id] = {} })
          puUsadosGrupo?.forEach(pu => {
            if (equipoPowerMap[pu.equipo_id]) {
              equipoPowerMap[pu.equipo_id][pu.powerup_id] = (equipoPowerMap[pu.equipo_id][pu.powerup_id] || 0) + pu.cantidad
            }
          })
          const usage: EquipoPowerups[] = equiposList.map(eq => {
            const powers = equipoPowerMap[eq.id]
            const info: PowerupInfo[] = []
            let total = 0
            Object.entries(powers).forEach(([powerupId, cantidad]) => {
              const cat = catalogoGrupo?.find(c => c.id === powerupId)
              if (cat) {
                info.push({ powerupId, nombre: cat.nombre, cantidad })
                total += cantidad
              }
            })
            info.sort((a, b) => b.cantidad - a.cantidad)
            return { equipo: eq, powerups: info, total }
          })
          usage.sort((a, b) => b.total - a.total)
          setPowerupsUsage(usage)
        } else {
          setPowerupsUsage(equiposList.map(eq => ({ equipo: eq, powerups: [], total: 0 })))
        }
      } else {
        setPowerupsUsage([])
      }

      // ─── Partido(s) EN VIVO (jugando o pausado) del torneo, para la card destacada ───
      const { data: enVivoData } = await supabase
        .from('partidos').select('*')
        .eq('torneo_id', torneo.id)
        .in('estado', ['jugando', 'pausado'])
      setPartidosEnVivo(enVivoData || [])

      if (enVivoData && enVivoData.length > 0) {
        const idsEnVivo = enVivoData.map(p => p.id)

        const { data: golesEnVivoData } = await supabase
          .from('goles').select('*').in('partido_id', idsEnVivo).order('minuto', { ascending: true })
        const golesPorPartido: Record<string, Gol[]> = {}
        golesEnVivoData?.forEach(g => {
          if (!golesPorPartido[g.partido_id]) golesPorPartido[g.partido_id] = []
          golesPorPartido[g.partido_id].push(g)
        })
        setGolesEnVivoPorPartido(golesPorPartido)

        const { data: puEnVivoData } = await supabase
          .from('powerups_usados').select('partido_id, equipo_id, powerup_id, cantidad')
          .in('partido_id', idsEnVivo)
        const { data: catalogoEnVivo } = await supabase.from('powerups_catalogo').select('id, nombre')
        const powerupsPorPartido: Record<string, { [equipoId: string]: PowerupInfo[] }> = {}
        puEnVivoData?.forEach(pu => {
          if (!powerupsPorPartido[pu.partido_id]) powerupsPorPartido[pu.partido_id] = {}
          if (!powerupsPorPartido[pu.partido_id][pu.equipo_id]) powerupsPorPartido[pu.partido_id][pu.equipo_id] = []
          const cat = catalogoEnVivo?.find(c => c.id === pu.powerup_id)
          if (cat) {
            const exist = powerupsPorPartido[pu.partido_id][pu.equipo_id].find(x => x.powerupId === pu.powerup_id)
            if (exist) exist.cantidad += pu.cantidad
            else powerupsPorPartido[pu.partido_id][pu.equipo_id].push({ powerupId: pu.powerup_id, nombre: cat.nombre, cantidad: pu.cantidad })
          }
        })
        setPowerupsEnVivoPorPartido(powerupsPorPartido)
      } else {
        setGolesEnVivoPorPartido({})
        setPowerupsEnVivoPorPartido({})
      }
    } catch (error) {
      console.error('Error cargando datos públicos:', error)
    } finally {
      setLoading(false)
      setRealtimeUpdating(false)
    }
  }, [])

  useEffect(() => {
    if (torneoActivo) cargarDatos(torneoActivo)
  }, [torneoActivo, cargarDatos])

  // ─── Cargar el equipo ganador (campeón) de CADA torneo, para mostrarlo
  // junto al nombre en el botón del dropdown y en la lista desplegable.
  // El ganador se determina a partir del partido de ronda === 'final'. ───
  useEffect(() => {
    if (!torneos || torneos.length === 0) return

    let cancelado = false

    const cargarGanadores = async () => {
      try {
        const torneoIds = torneos.map(t => t.id)

        const { data: finales } = await supabase
          .from('partidos')
          .select('torneo_id, equipo_local_id, equipo_visitante_id, goles_local, goles_visitante')
          .in('torneo_id', torneoIds)
          .eq('fase', 'eliminatorias')
          .eq('ronda', 'final')

        if (!finales || finales.length === 0) {
          if (!cancelado) setGanadoresTorneo({})
          return
        }

        const ganadorIdPorTorneo: Record<string, string | null> = {}
        finales.forEach(f => {
          if (f.goles_local == null || f.goles_visitante == null) return
          if (f.goles_local === f.goles_visitante) return
          ganadorIdPorTorneo[f.torneo_id] = f.goles_local > f.goles_visitante
            ? f.equipo_local_id
            : f.equipo_visitante_id
        })

        const equipoIdsGanadores = Array.from(new Set(Object.values(ganadorIdPorTorneo).filter(Boolean))) as string[]
        if (equipoIdsGanadores.length === 0) {
          if (!cancelado) setGanadoresTorneo({})
          return
        }

        const { data: equiposGanadores } = await supabase
          .from('equipos')
          .select('id, nombre, escudo_url, color_hex, dt')
          .in('id', equipoIdsGanadores)

        const mapaEquipos: Record<string, Equipo> = {}
        equiposGanadores?.forEach(eq => { mapaEquipos[eq.id] = eq as Equipo })

        const resultado: Record<string, Equipo | null> = {}
        Object.entries(ganadorIdPorTorneo).forEach(([torneoId, equipoId]) => {
          resultado[torneoId] = equipoId ? (mapaEquipos[equipoId] ?? null) : null
        })

        if (!cancelado) setGanadoresTorneo(resultado)
      } catch (error) {
        console.error('Error cargando ganadores de torneos:', error)
      }
    }

    cargarGanadores()

    return () => { cancelado = true }
  }, [torneos])

  // ─── Suscripción a cambios en tiempo real ───
  useEffect(() => {
    if (!torneoActivo) return

    const canal = supabase
      .channel(`public-updates-${torneoActivo.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partidos', filter: `torneo_id=eq.${torneoActivo.id}` },
        (payload) => {
          console.log('Cambio en partidos:', payload)
          cargarDatos(torneoActivo, true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goles' },
        (payload) => {
          console.log('Cambio en goles:', payload)
          cargarDatos(torneoActivo, true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'powerups_usados' },
        (payload) => {
          console.log('Cambio en powerups_usados:', payload)
          cargarDatos(torneoActivo, true)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [torneoActivo, cargarDatos])

  // Cargar goles del partido expandido
  useEffect(() => {
    if (!expandedMatchId) {
      setExpandedMatchGoals([])
      return
    }
    setLoadingMatchGoals(true)
    const fetchGoals = async () => {
      const { data } = await supabase
        .from('goles').select('*').eq('partido_id', expandedMatchId)
        .order('minuto', { ascending: true })
      setExpandedMatchGoals(data || [])
      setLoadingMatchGoals(false)
    }
    fetchGoals()
  }, [expandedMatchId])

  // ─── Cargar historial head-to-head entre los dos equipos del partido expandido.
  // Se busca en TODOS los torneos (incluido el activo) y en ambas fases
  // (grupos + eliminatorias), sin importar quién fue local o visitante. ───
  useEffect(() => {
    if (!expandedMatchId) return
    const detalle = teamMatches.find(m => m.partido.id === expandedMatchId)
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
          const numA = torneosMap[a.torneo_id!]?.numero ?? 0
          const numB = torneosMap[b.torneo_id!]?.numero ?? 0
          if (numA !== numB) return numB - numA

          const ordenFase = (p: Partido) => {
            if (p.ronda === 'final') return 2
            if (p.fase === 'eliminatorias') return 1
            return 0
          }
          const faseA = ordenFase(a)
          const faseB = ordenFase(b)
          if (faseA !== faseB) return faseB - faseA

          const da = a.fecha ? new Date(a.fecha).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0)
          const db = b.fecha ? new Date(b.fecha).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0)
          return db - da
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
  }, [expandedMatchId, teamMatches, h2hCache])

  // ─── Para TODOS los partidos en vivo: cargar récord general, racha máxima +
  // forma reciente, y progresión de goles por intervalos de minutos, para cada
  // uno de los dos equipos involucrados. Se excluye siempre el propio partido
  // en vivo (.neq('id', partido.id)) para no contaminar las estadísticas con
  // su propio resultado parcial mientras está en curso. ───
  useEffect(() => {
    if (partidosEnVivo.length === 0) return
    let cancelado = false

    const cargarStatsEnVivo = async () => {
      for (const partido of partidosEnVivo) {
        for (const equipoId of [partido.equipo_local_id, partido.equipo_visitante_id]) {
          // ─── Récord general (para el prior de probabilidades) ───
          if (!recordGeneralCache[equipoId]) {
            try {
              const { data: comoLocalGen } = await supabase
                .from('partidos')
                .select('goles_local, goles_visitante, equipo_local_id, equipo_visitante_id, id, created_at, fecha')
                .eq('equipo_local_id', equipoId)
                .not('goles_local', 'is', null)
                .not('goles_visitante', 'is', null)
                .neq('id', partido.id)

              const { data: comoVisitanteGen } = await supabase
                .from('partidos')
                .select('goles_local, goles_visitante, equipo_local_id, equipo_visitante_id, id, created_at, fecha')
                .eq('equipo_visitante_id', equipoId)
                .not('goles_local', 'is', null)
                .not('goles_visitante', 'is', null)
                .neq('id', partido.id)

              let victorias = 0, empates = 0, derrotas = 0
              ;(comoLocalGen || []).forEach(p => {
                if (p.id === partido.id) return
                if ((p.goles_local ?? 0) > (p.goles_visitante ?? 0)) victorias++
                else if ((p.goles_local ?? 0) < (p.goles_visitante ?? 0)) derrotas++
                else empates++
              })
              ;(comoVisitanteGen || []).forEach(p => {
                if (p.id === partido.id) return
                if ((p.goles_visitante ?? 0) > (p.goles_local ?? 0)) victorias++
                else if ((p.goles_visitante ?? 0) < (p.goles_local ?? 0)) derrotas++
                else empates++
              })

              if (!cancelado) {
                setRecordGeneralCache(prev => (prev[equipoId] ? prev : { ...prev, [equipoId]: { victorias, empates, derrotas } }))
                setRecordGeneralCargado(prev => (prev[equipoId] ? prev : { ...prev, [equipoId]: true }))
              }

              // ─── Racha máxima sin perder + forma últimos 5 (a partir de los
              // mismos partidos, ordenados cronológicamente ascendente) ───
              const todosOrdenCron = [
                ...(comoLocalGen || []).map(p => ({ ...p, golesA: p.goles_local, golesB: p.goles_visitante })),
                ...(comoVisitanteGen || []).map(p => ({ ...p, golesA: p.goles_visitante, golesB: p.goles_local })),
              ].filter(p => p.id !== partido.id)
              todosOrdenCron.sort((a, b) => {
                const da = a.fecha ? new Date(a.fecha).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0)
                const db = b.fecha ? new Date(b.fecha).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0)
                return da - db
              })
              const rachaForma = calcularRachaYForma(todosOrdenCron.map(p => ({ golesA: p.golesA, golesB: p.golesB })))
              if (!cancelado) {
                setRachaFormaCache(prev => (prev[equipoId] ? prev : { ...prev, [equipoId]: rachaForma }))
                setRachaFormaCargado(prev => (prev[equipoId] ? prev : { ...prev, [equipoId]: true }))
              }
            } catch (error) {
              console.error('Error cargando récord/racha general del equipo:', error)
            }
          }

          // ─── Progresión de goles por intervalos de minutos ───
          if (!progresionGolesCache[equipoId]) {
            try {
              const { data: partidosDelEquipoLocal } = await supabase
                .from('partidos').select('id')
                .eq('equipo_local_id', equipoId)
                .not('goles_local', 'is', null)
                .neq('id', partido.id)
              const { data: partidosDelEquipoVisitante } = await supabase
                .from('partidos').select('id')
                .eq('equipo_visitante_id', equipoId)
                .not('goles_local', 'is', null)
                .neq('id', partido.id)

              const idsPartidosEquipo = Array.from(new Set([
                ...(partidosDelEquipoLocal || []).map(p => p.id),
                ...(partidosDelEquipoVisitante || []).map(p => p.id),
              ]))

              let golesEquipo: { minuto: number }[] = []
              if (idsPartidosEquipo.length > 0) {
                const { data: golesData } = await supabase
                  .from('goles').select('minuto')
                  .eq('equipo_id', equipoId)
                  .in('partido_id', idsPartidosEquipo)
                golesEquipo = golesData || []
              }

              const progresion = calcularProgresionGoles(golesEquipo)
              if (!cancelado) {
                setProgresionGolesCache(prev => (prev[equipoId] ? prev : { ...prev, [equipoId]: progresion }))
                setProgresionGolesCargado(prev => (prev[equipoId] ? prev : { ...prev, [equipoId]: true }))
              }
            } catch (error) {
              console.error('Error cargando progresión de goles del equipo:', error)
            }
          }
        }
      }
    }

    cargarStatsEnVivo()

    return () => { cancelado = true }
  }, [partidosEnVivo, recordGeneralCache, progresionGolesCache])

  // ─── Reloj en vivo: recalcula cada segundo mientras haya partidos "jugando",
  // para que el tiempo transcurrido y las probabilidades se actualicen solas
  // sin depender únicamente de eventos realtime de Supabase. ───
  useEffect(() => {
    const hayJugando = partidosEnVivo.some(p => p.estado === 'jugando')
    if (!hayJugando) return
    const interval = setInterval(() => setTickEnVivo(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [partidosEnVivo])

  // Calcula los segundos transcurridos "en vivo" de un partido: si está jugando,
  // se estima en base a duracion_segundos + tiempo real transcurrido desde la
  // última carga (aproximado por el tick local); si está pausado, se usa el valor guardado.
  const segundosEnVivo = useCallback((partido: Partido) => {
    void tickEnVivo // fuerza recálculo cada segundo mientras esté "jugando"
    if (partido.estado === 'jugando' && partido.inicio_timestamp) {
      const inicio = new Date(partido.inicio_timestamp).getTime()
      return Math.max(0, Math.floor((Date.now() - inicio) / 1000))
    }
    // pausado o cualquier otro estado: usar el valor congelado guardado
    return partido.duracion_segundos || 0
  }, [tickEnVivo])

  // ─── Tabla de clasificación ───
  // IMPORTANTE: el criterio de orden debe ser IDÉNTICO al de ClasificatoriaGrupos.tsx
  // (PTS -> DG -> GF -> menos power-ups usados -> nombre alfabético) para que el
  // orden mostrado en la página pública coincida siempre con el panel de administración.
  const tabla = useMemo(() => {
    const statsMap = new Map<string, { pj: number; pg: number; pe: number; pp: number; gf: number; gc: number; pts: number; powerupsUsados: number }>()
    equipos.forEach(eq => statsMap.set(eq.id, { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0, powerupsUsados: 0 }))
    partidosGrupos.forEach(p => {
      const local = statsMap.get(p.equipo_local_id)
      const visitante = statsMap.get(p.equipo_visitante_id)
      if (!local || !visitante || p.goles_local == null || p.goles_visitante == null) return
      local.pj++; visitante.pj++
      local.gf += p.goles_local; local.gc += p.goles_visitante
      visitante.gf += p.goles_visitante; visitante.gc += p.goles_local
      if (p.goles_local > p.goles_visitante) { local.pg++; local.pts += 3; visitante.pp++ }
      else if (p.goles_local < p.goles_visitante) { visitante.pg++; visitante.pts += 3; local.pp++ }
      else { local.pe++; visitante.pe++; local.pts += 1; visitante.pts += 1 }
    })

    powerupsUsage.forEach(ep => {
      const stat = statsMap.get(ep.equipo.id)
      if (stat) stat.powerupsUsados = ep.total
    })

    return Array.from(statsMap.entries()).map(([id, stat]) => ({
      id, ...stat,
      dg: stat.gf - stat.gc,
      equipo: equipos.find(e => e.id === id)!,
    })).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      if (b.dg !== a.dg) return b.dg - a.dg
      if (b.gf !== a.gf) return b.gf - a.gf
      if (a.powerupsUsados !== b.powerupsUsados) return a.powerupsUsados - b.powerupsUsados
      return (a.equipo?.nombre ?? '').localeCompare(b.equipo?.nombre ?? '')
    })
  }, [equipos, partidosGrupos, powerupsUsage])

  const equipoById = (id: string) => equipos.find(e => e.id === id)

  const ESCALA_PAGINA = 100

  if (!torneoActivo && torneos.length === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, rgba(0,78,58,1) 0%, rgba(0,47,36,1) 100%)', backgroundAttachment: 'fixed' }}>
        <Loader2 size={24} className="spin" />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, rgba(0,78,58,1) 0%, rgba(0,47,36,1) 100%)',
      backgroundAttachment: 'fixed',
      color: 'var(--color-textWH)',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '40px 32px'
    }}>
      <style>{`
        .page-scale-wrapper {
          transform: scale(${ESCALA_PAGINA / 100});
          transform-origin: top center;
        }
      `}</style>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .dropdown-item { transition: background 0.15s, padding-left 0.15s; }
        .dropdown-item:hover { background: rgba(0,200,140,0.08); padding-left: 16px; }
        .match-card { transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s, border-color 0.22s; cursor: pointer; position: relative; border-radius: 12px; overflow: hidden; }
        .match-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,200,140,0.3); border-color: rgba(0,200,140,0.45) !important; }
        .side-bar { transition: width 0.22s ease; }
        .match-card:hover .side-bar { width: 14px !important; }
        .pu-badge { transition: transform 0.18s; }
        .pu-badge:hover { transform: scale(1.15); z-index: 5; }
        .escudo { transition: transform 0.2s ease; }
        .match-card:hover .escudo { transform: scale(1.1); }
        .dropdown-btn { transition: background 0.18s, border-color 0.18s, box-shadow 0.18s; }
        .dropdown-btn:hover { background: rgba(0,200,140,0.07) !important; border-color: rgba(0,200,140,0.5) !important; }

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

        /* ── Card de partido en vivo destacado ── */
        .live-match-card {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          border: 2px solid rgba(255,200,0,0.5);
          background: linear-gradient(180deg, rgba(255,200,0,0.07) 0%, var(--color-background) 100%);
          box-shadow: 0 0 0 1px rgba(255,200,0,0.15), 0 10px 30px rgba(0,0,0,0.35);
        }
        .live-pulse-dot {
          animation: livePulse 1.4s ease-in-out infinite;
        }
        @keyframes livePulse {
          0% { box-shadow: 0 0 0 0 rgba(255,200,0,0.6); }
          70% { box-shadow: 0 0 0 8px rgba(255,200,0,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,200,0,0); }
        }
        .prob-bar-segment {
          transition: width 0.5s ease;
        }
        .forma-dot {
          display: flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
        }
        .racha-progresion-row {
          transition: opacity 0.2s;
        }

        @media (max-width: 768px) {
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
        }

        /* ── Desktop: jornadas en grid ── */
        .jornada-row {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }
        @media (max-width: 1100px) and (min-width: 769px) {
          .jornada-row {
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          }
        }

        /* ── Mobile: jornadas con scroll horizontal ── */
        @media (max-width: 768px) {
          .jornada-scroll-wrapper {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding-bottom: 8px;
            margin: 0 -16px;
            padding-left: 16px;
            padding-right: 16px;
          }
          .jornada-scroll-wrapper::-webkit-scrollbar { display: none; }
          .jornada-row {
            display: flex !important;
            flex-direction: row !important;
            gap: 10px;
            width: max-content;
          }
          .jornada-card-mobile {
            width: 200px !important;
            flex-shrink: 0;
          }

          /* ── Mobile: página ── */
          .public-page {
            padding: 20px 0px !important;
          }

          /* ── Mobile: header ── */
          .page-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .page-header h1 {
            font-size: 22px !important;
          }
          .torneo-dropdown-wrapper {
            width: 100% !important;
          }

          /* ── Mobile: sección 1 (tabla + bracket) → columna ── */
          .section-tabla-bracket {
            flex-direction: column !important;
          }

          /* ── Mobile: tabla → scroll horizontal ── */
          .tabla-scroll-wrapper {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }
          .tabla-scroll-wrapper::-webkit-scrollbar { display: none; }
          .tabla-inner {
            min-width: 620px;
          }

          /* ── Mobile: sección 2 (historial + powerups) → columna ── */
          .section-historial-powerups {
            flex-direction: column !important;
          }
          .historial-col {
            flex: unset !important;
            width: 100% !important;
          }
          .powerups-col {
            flex: unset !important;
            width: 100% !important;
          }

          /* ── Mobile: match card ── */
          .match-card-inner {
            margin: 0 18px !important;
          }
          .match-team-name {
            font-size: 12px !important;
          }
          .match-score {
            font-size: 20px !important;
          }
          /* Ocultar power-ups en la card del partido en mobile para ahorrar espacio */
          .match-pu-badges {
            display: none !important;
          }

          /* ── Mobile: mapa de goles ── */
          .gol-map-container {
            width: 100% !important;
          }

          /* ── Mobile: card en vivo ── */
          .live-match-teams {
            flex-direction: row !important;
            gap: 10px !important;
          }
          .live-match-escudo {
            width: 48px !important;
            height: 48px !important;
          }
          .live-match-score-num {
            font-size: 34px !important;
          }
          .live-match-team-name {
            font-size: 13px !important;
          }
          .live-prob-row {
            flex-direction: column !important;
            gap: 6px !important;
          }
          .live-extra-grid {
            grid-template-columns: 1fr !important;
          }
          .progresion-goles-bar-label {
            font-size: 16px !important;
          }
        }
      `}</style>

      <div className="page-scale-wrapper" style={{ maxWidth: `${1400 * (100 / ESCALA_PAGINA)}px`, margin: '0 auto' }}>
      <div className="public-page" style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Header */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '36px', fontWeight: '800', margin: 0 }}>
            Copa DISCORD{torneoActivo ? ` - ${[torneoActivo.nombre, torneoActivo.edicion].filter(Boolean).join(' ') || `Torneo ${torneoActivo.numero}`}` : ''}
            {realtimeUpdating && (
              <span style={{ fontSize: '14px', marginLeft: '12px', color: 'var(--color-accent)', fontWeight: '400' }}>
                <Loader2 size={14} className="spin" style={{ marginRight: '4px' }} />
                actualizando...
              </span>
            )}
          </h1>
          <div className="torneo-dropdown-wrapper" style={{ position: 'relative', width: '320px' }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="dropdown-btn"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 18px', borderRadius: '12px',
                background: 'var(--color-background)', border: '2px solid var(--color-border)',
                color: 'var(--color-textWH)', fontSize: '15px', fontWeight: '600',
                cursor: 'pointer', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                <Trophy size={18} color="var(--color-accent)" />
                {torneoActivo && (
                  <span style={{
                    width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0,
                    background: ESTADO_COLORS[torneoActivo.estado],
                    boxShadow: `0 0 6px ${ESTADO_COLORS[torneoActivo.estado]}`,
                  }} />
                )}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {torneoActivo?.nombre || `Torneo ${torneoActivo?.numero}`}
                </span>
                {torneoActivo && ganadoresTorneo[torneoActivo.id] && (
                  ganadoresTorneo[torneoActivo.id]!.escudo_url ? (
                    <img
                      src={ganadoresTorneo[torneoActivo.id]!.escudo_url!}
                      alt={ganadoresTorneo[torneoActivo.id]!.nombre}
                      title={`Campeón: ${ganadoresTorneo[torneoActivo.id]!.nombre}`}
                      style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      title={`Campeón: ${ganadoresTorneo[torneoActivo.id]!.nombre}`}
                      style={{ width: '20px', height: '20px', borderRadius: '5px', background: 'var(--color-border)', flexShrink: 0 }}
                    />
                  )
                )}
                {torneoActivo && (
                  <span style={{
                    padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap',
                    background: `${ESTADO_COLORS[torneoActivo.estado]}26`,
                    border: `1px solid ${ESTADO_COLORS[torneoActivo.estado]}4D`,
                    color: ESTADO_COLORS[torneoActivo.estado], fontSize: '11px', fontWeight: '700',
                  }}>
                    {ESTADO_LABELS[torneoActivo.estado]}
                  </span>
                )}
                {torneoActivo?.activo && (
                  <span style={{ padding: '2px 8px', borderRadius: '20px', background: 'rgba(0,200,140,0.15)', border: '1px solid rgba(0,200,140,0.3)', color: 'var(--color-accent)', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                    EN JUEGO
                  </span>
                )}
              </div>
              <ChevronDown size={18} color="rgba(255,255,255,0.5)" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            {dropdownOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--color-background)', border: '2px solid var(--color-border)', borderRadius: '12px', maxHeight: '300px', overflowY: 'auto', zIndex: 50, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                {torneos.map(t => {
                  const ganador = ganadoresTorneo[t.id]
                  return (
                    <button
                      key={t.id}
                      className="dropdown-item"
                      onClick={() => { setTorneoActivo(t); setDropdownOpen(false) }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', background: t.id === torneoActivo?.id ? 'rgba(0,200,140,0.08)' : 'transparent', border: 'none', color: 'var(--color-textWH)', fontSize: '14px', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <Trophy size={15} color={t.id === torneoActivo?.id ? 'var(--color-accent)' : 'rgba(255,255,255,0.4)'} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nombre || `Torneo ${t.numero}`}</span>
                      {ganador && (
                        ganador.escudo_url ? (
                          <img
                            src={ganador.escudo_url}
                            alt={ganador.nombre}
                            title={`Campeón: ${ganador.nombre}`}
                            style={{ width: '18px', height: '18px', objectFit: 'contain', flexShrink: 0 }}
                          />
                        ) : (
                          <div
                            title={`Campeón: ${ganador.nombre}`}
                            style={{ width: '18px', height: '18px', borderRadius: '5px', background: 'var(--color-border)', flexShrink: 0 }}
                          />
                        )
                      )}
                      <span style={{
                        padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap',
                        background: `${ESTADO_COLORS[t.estado]}26`,
                        border: `1px solid ${ESTADO_COLORS[t.estado]}4D`,
                        color: ESTADO_COLORS[t.estado], fontSize: '10px', fontWeight: '700',
                      }}>
                        {ESTADO_LABELS[t.estado]}
                      </span>
                      {t.activo && (
                        <span style={{ padding: '2px 8px', borderRadius: '20px', background: 'rgba(0,200,140,0.15)', border: '1px solid rgba(0,200,140,0.3)', color: 'var(--color-accent)', fontSize: '10px', fontWeight: '700' }}>
                          EN JUEGO
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Contenido principal */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <Loader2 size={32} className="spin" color="var(--color-accent)" />
          </div>
        ) : (
          <>
            {/* SECCIÓN EN VIVO: card destacada de partido(s) en curso */}
            {partidosEnVivo.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {partidosEnVivo.map(partido => {
                  const local = equipoById(partido.equipo_local_id)
                  const visitante = equipoById(partido.equipo_visitante_id)
                  const reglas = obtenerReglasPartido(partido)
                  const segundosActuales = segundosEnVivo(partido)
                  const recordsListos = !!recordGeneralCargado[partido.equipo_local_id] && !!recordGeneralCargado[partido.equipo_visitante_id]

                  // Derivamos el marcador SIEMPRE desde los goles reales (tabla `goles`),
                  // no desde partido.goles_local/goles_visitante, para evitar que el
                  // marcador y las probabilidades queden desincronizados si el campo
                  // agregado en `partidos` tarda en propagarse vía realtime.
                  const golesPartidoActual = golesEnVivoPorPartido[partido.id] || []
                  const golesLocal = golesPartidoActual.filter(g => g.equipo_id === partido.equipo_local_id).length
                  const golesVisitante = golesPartidoActual.filter(g => g.equipo_id === partido.equipo_visitante_id).length

                  const probs = calcularProbabilidades({
                    partido,
                    golesLocal,
                    golesVisitante,
                    segundos: segundosActuales,
                    recordLocal: recordGeneralCache[partido.equipo_local_id] || null,
                    recordVisitante: recordGeneralCache[partido.equipo_visitante_id] || null,
                  })

                  const golesLocalList = golesPartidoActual
                    .filter(g => g.equipo_id === partido.equipo_local_id)
                    .map(g => formatearDuracion(g.minuto))
                  const golesVisitanteList = golesPartidoActual
                    .filter(g => g.equipo_id === partido.equipo_visitante_id)
                    .map(g => formatearDuracion(g.minuto))

                  const powerupsPartidoActual = powerupsEnVivoPorPartido[partido.id] || {}
                  const colorLocal = local?.color_hex || '#00C88C'
                  const colorVisitante = visitante?.color_hex || '#FF4D4D'
                  const colorEmpate = '#9CA3AF'

                  const pausado = partido.estado === 'pausado'

                  // ─── Feature 1: racha máxima + forma reciente ───
                  const rachaLocal = rachaFormaCache[partido.equipo_local_id]
                  const rachaVisitante = rachaFormaCache[partido.equipo_visitante_id]
                  const rachaListas = !!rachaFormaCargado[partido.equipo_local_id] && !!rachaFormaCargado[partido.equipo_visitante_id]

                  // ─── Feature 4: progresión de goles por intervalos ───
                  const progresionLocal = progresionGolesCache[partido.equipo_local_id]
                  const progresionVisitante = progresionGolesCache[partido.equipo_visitante_id]
                  const progresionLista = !!progresionGolesCargado[partido.equipo_local_id] && !!progresionGolesCargado[partido.equipo_visitante_id]

                  const FormaDot = ({ resultado }: { resultado: 'V' | 'E' | 'D' }) => {
                    const cfg = {
                      V: { bg: 'rgba(0,200,140,0.16)', border: 'rgba(0,200,140,0.55)', color: 'rgb(0,200,140)' },
                      D: { bg: 'rgba(255,77,77,0.16)', border: 'rgba(255,77,77,0.55)', color: 'rgb(255,77,77)' },
                      E: { bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.28)', color: 'rgba(255,255,255,0.65)' },
                    }[resultado]
                    return (
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: cfg.bg, border: `1.5px solid ${cfg.border}`,
                      }}>
                        {resultado === 'V' && <Check size={12} color={cfg.color} strokeWidth={3} />}
                        {resultado === 'D' && <XIcon size={12} color={cfg.color} strokeWidth={3} />}
                        {resultado === 'E' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />}
                      </span>
                    )
                  }

                  const RachaFormaBloque = ({ equipo, racha, alinear }: { equipo: Equipo | undefined; racha: RachaYForma | undefined; alinear: 'flex-start' | 'flex-end' }) => (
                    <div style={{
                      flex: 1, display: 'flex', flexDirection: 'column', gap: 10,
                      alignItems: alinear,
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: alinear === 'flex-end' ? 'row-reverse' : 'row' }}>
                        {equipo?.escudo_url
                          ? <img src={equipo.escudo_url} style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                          : <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--color-border)', flexShrink: 0 }} />
                        }
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {equipo?.nombre ?? ''}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 5, flexDirection: alinear === 'flex-end' ? 'row-reverse' : 'row' }}>
                        {racha && racha.ultimos5.length > 0 ? (
                          racha.ultimos5.map((r, i) => <FormaDot key={i} resultado={r} />)
                        ) : (
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Sin historial</span>
                        )}
                      </div>

                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        paddingTop: 10, marginTop: 2,
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        width: '100%',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Trophy size={12} color="#FFC800" />
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                            Racha invicta máx.
                          </span>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 800, color: '#FFC800',
                          background: 'rgba(255,200,0,0.14)', borderRadius: 6,
                          padding: '2px 8px', lineHeight: 1.3,
                        }}>
                          {racha ? racha.rachaMaxima : '–'}
                        </span>
                      </div>
                    </div>
                  )

                  return (
                    <div key={partido.id} className="live-match-card">
                      {/* Encabezado: indicador EN VIVO + fase + tiempo restante */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 20px', borderBottom: '1px solid rgba(255,200,0,0.25)',
                        background: 'rgba(255,200,0,0.06)', flexWrap: 'wrap', gap: '8px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="live-pulse-dot" style={{
                            width: '10px', height: '10px', borderRadius: '50%',
                            background: '#FFC800', flexShrink: 0,
                          }} />
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: '#FFC800', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            <Radio size={14} />
                            {pausado ? 'En pausa' : 'En vivo'}
                          </span>
                          {faseInfo(partido) && (
                            <span style={{
                              fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '20px',
                              color: faseInfo(partido)!.color,
                              border: `1px solid ${faseInfo(partido)!.color}66`,
                              background: `${faseInfo(partido)!.color}1A`,
                            }}>
                              {partido.ronda === 'final' ? 'FINAL' : (partido.fase === 'eliminatorias' ? 'ELIMINATORIA' : 'GRUPOS')}
                            </span>
                          )}
                        </div>
                        {/* Feature 5: timer con "/ límite" al lado */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '15px', color: 'var(--color-textWH)', fontWeight: 700, letterSpacing: '1px' }}>
                            {formatearDuracion(segundosActuales)}
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}> / {formatearDuracion(reglas.duracionMax)}</span>
                          </span>
                        </div>
                      </div>

                      {/* Marcador principal */}
                      <div style={{ padding: '24px 28px 18px' }}>
                        <div className="live-match-teams" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '28px' }}>
                          {/* Local */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            {local?.escudo_url
                              ? <img src={local.escudo_url} className="live-match-escudo" style={{ width: 84, height: 84, objectFit: 'contain' }} />
                              : <div className="live-match-escudo" style={{ width: 84, height: 84, borderRadius: 12, background: 'var(--color-border)' }} />
                            }
                            <span className="live-match-team-name" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-textWH)', textAlign: 'center' }}>
                              {local?.nombre ?? '—'}
                            </span>
                            {/* Feature 3: DT */}
                            {local?.dt && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                                <User size={11} /> {local.dt}
                              </span>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 16 }}>
                              {golesLocalList.map((t, i) => (
                                <span key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>⚽ {t}</span>
                              ))}
                            </div>
                            {(powerupsPartidoActual[partido.equipo_local_id] || []).length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                                {(powerupsPartidoActual[partido.equipo_local_id] || []).map(pu => (
                                  <div key={pu.powerupId} className="pu-badge" style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,200,140,0.1)', borderRadius: 6, padding: '2px 6px', border: '1px solid var(--color-accent)' }}>
                                    <img src={POWERUP_IMAGES[pu.nombre] || ''} style={{ width: 14, height: 14, objectFit: 'contain' }} />
                                    <span style={{ fontSize: 11, color: 'var(--color-accent)' }}>{pu.cantidad}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Marcador central */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                            <span className="live-match-score-num" style={{ fontSize: 52, fontWeight: 800, color: 'var(--color-textWH)', minWidth: 56, textAlign: 'center' }}>
                              {golesLocal}
                            </span>
                            <span style={{ fontSize: 30, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>:</span>
                            <span className="live-match-score-num" style={{ fontSize: 52, fontWeight: 800, color: 'var(--color-textWH)', minWidth: 56, textAlign: 'center' }}>
                              {golesVisitante}
                            </span>
                          </div>

                          {/* Visitante */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            {visitante?.escudo_url
                              ? <img src={visitante.escudo_url} className="live-match-escudo" style={{ width: 84, height: 84, objectFit: 'contain' }} />
                              : <div className="live-match-escudo" style={{ width: 84, height: 84, borderRadius: 12, background: 'var(--color-border)' }} />
                            }
                            <span className="live-match-team-name" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-textWH)', textAlign: 'center' }}>
                              {visitante?.nombre ?? '—'}
                            </span>
                            {/* Feature 3: DT */}
                            {visitante?.dt && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                                <User size={11} /> {visitante.dt}
                              </span>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 16 }}>
                              {golesVisitanteList.map((t, i) => (
                                <span key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>⚽ {t}</span>
                              ))}
                            </div>
                            {(powerupsPartidoActual[partido.equipo_visitante_id] || []).length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                                {(powerupsPartidoActual[partido.equipo_visitante_id] || []).map(pu => (
                                  <div key={pu.powerupId} className="pu-badge" style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,200,140,0.1)', borderRadius: 6, padding: '2px 6px', border: '1px solid var(--color-accent)' }}>
                                    <img src={POWERUP_IMAGES[pu.nombre] || ''} style={{ width: 14, height: 14, objectFit: 'contain' }} />
                                    <span style={{ fontSize: 11, color: 'var(--color-accent)' }}>{pu.cantidad}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Probabilidad de victoria (feature 2: labels debajo de cada %, feature 6: nuevo algoritmo) */}
                      <div style={{ padding: '4px 28px 22px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, textAlign: 'center' }}>
                          Probabilidad de resultado
                        </div>
                        {recordsListos ? (
                          <>
                            <div style={{
                              display: 'flex', width: '100%', height: 14, borderRadius: 8, overflow: 'hidden',
                              border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.04)',
                            }}>
                              <div className="prob-bar-segment" style={{ width: `${probs.local}%`, background: colorLocal }} />
                              <div className="prob-bar-segment" style={{ width: `${probs.empate}%`, background: colorEmpate }} />
                              <div className="prob-bar-segment" style={{ width: `${probs.visitante}%`, background: colorVisitante }} />
                            </div>
                            <div className="live-prob-row" style={{ display: 'flex', width: '100%', marginTop: 4 }}>
                              <div style={{ width: `${probs.local}%`, textAlign: 'center' }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: colorLocal }}>{probs.local}%</span>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {local?.nombre ?? 'Local'}
                                </div>
                              </div>
                              <div style={{ width: `${probs.empate}%`, textAlign: 'center' }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: colorEmpate }}>{probs.empate}%</span>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginTop: 2 }}>
                                  Empate
                                </div>
                              </div>
                              <div style={{ width: `${probs.visitante}%`, textAlign: 'center' }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: colorVisitante }}>{probs.visitante}%</span>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {visitante?.nombre ?? 'Visitante'}
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '14px', color: 'rgba(255,255,255,0.4)', fontSize: 12,
                          }}>
                            <Loader2 size={14} className="spin" />
                            Calculando probabilidades...
                          </div>
                        )}
                      </div>

                      {/* Feature 1: racha máxima invicta + forma últimos 5 partidos */}
                      <div style={{ padding: '0 28px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ paddingTop: 16, display: 'flex', gap: 12 }}>
                          {rachaListas ? (
                            <>
                              <RachaFormaBloque equipo={local} racha={rachaLocal} alinear="flex-start" />
                              <RachaFormaBloque equipo={visitante} racha={rachaVisitante} alinear="flex-end" />
                            </>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '0 auto', padding: '14px' }}>
                              <Loader2 size={14} className="spin" />
                              Cargando racha y forma...
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Feature 4: progresión de goles por intervalos de minutos */}
                      <div style={{ padding: '0 28px 26px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ paddingTop: 16, fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14, textAlign: 'center' }}>
                          Progresión de goles por intervalos de minutos
                        </div>
                        {progresionLista && progresionLocal && progresionVisitante ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            {[
                              { equipo: local, progresion: progresionLocal },
                              { equipo: visitante, progresion: progresionVisitante },
                            ].map(({ equipo, progresion }, rowIdx) => {
                              const totalGoles = progresion.conteos.reduce((a, b) => a + b, 0)
                              const ANCHO_MIN_PCT = 2
                              const anchoDisponible = 100 - ANCHO_MIN_PCT * INTERVALOS_GOLES.length
                              const anchosPct = progresion.conteos.map(c =>
                                totalGoles > 0
                                  ? ANCHO_MIN_PCT + (c / totalGoles) * anchoDisponible
                                  : 100 / INTERVALOS_GOLES.length
                              )
                              return (
                                <div key={rowIdx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  {equipo?.escudo_url
                                    ? <img src={equipo.escudo_url} style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0 }} />
                                    : <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--color-border)', flexShrink: 0 }} />
                                  }
                                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      {INTERVALOS_GOLES.map((iv, i) => {
                                        const conteo = progresion.conteos[i]
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
                                            <span className="progresion-goles-bar-label" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-textWH)' }}>{conteo}</span>
                                            <div style={{ width: '100%', height: 6, borderRadius: 4, background: INTERVALO_COLORES[i] }} />
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                            {/* Leyenda de intervalos */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', paddingTop: 4 }}>
                              {INTERVALOS_GOLES.map((iv, i) => (
                                <span key={iv.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: INTERVALO_COLORES[i], display: 'inline-block' }} />
                                  {iv.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '10px' }}>
                            <Loader2 size={14} className="spin" />
                            Cargando progresión de goles...
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* SECCIÓN 0: Jornadas */}
            {jornadas.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Calendar size={22} color="var(--color-accent)" />
                  <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Jornadas</h2>
                </div>
                <div className="jornada-scroll-wrapper">
                  <div className="jornada-row">
                    {jornadas.map(jornada => {
                      const jugados = jornada.partidos.filter(p => p.goles_local != null).length
                      return (
                        <div key={jornada.id} className="jornada-card-mobile" style={{
                          borderRadius: '12px', overflow: 'hidden',
                          border: '2px solid var(--color-border)',
                          background: 'var(--color-background)',
                          display: 'flex',
                          flexDirection: 'column',
                        }}>
                          <div style={{
                            padding: '10px 14px',
                            display: 'flex', alignItems: 'center', gap: '10px',
                            borderBottom: '1px solid var(--color-border)',
                            background: 'rgba(0, 93, 67, 1)',
                          }}>
                            <div style={{
                              width: '30px', height: '30px', borderRadius: '7px',
                              background: 'var(--color-border)', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Calendar size={14} color="var(--color-accent)" />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontWeight: '700', fontSize: '13px', color: 'var(--color-textWH)', margin: 0, whiteSpace: 'nowrap' }}>
                                Jornada {jornada.numero}
                              </p>
                              <p style={{ fontSize: '11px', color: 'var(--color-accent)', marginTop: '2px', marginBottom: 0 }}>
                                {jugados}/{jornada.partidos.length} jugados
                              </p>
                            </div>
                          </div>

                          <div style={{ background: 'var(--color-background)', flex: 1 }}>
                            {jornada.partidos.map((partido, idx) => {
                              const local = equipoById(partido.equipo_local_id)
                              const visitante = equipoById(partido.equipo_visitante_id)
                              const jugado = partido.goles_local != null && partido.goles_visitante != null
                              const enVivo = partido.estado === 'jugando' || partido.estado === 'pausado'

                              return (
                                <div
                                  key={partido.id}
                                  style={{
                                    display: 'flex', flexDirection: 'column', gap: '6px',
                                    padding: '10px 12px',
                                    borderBottom: idx < jornada.partidos.length - 1 ? '1px solid var(--color-border)' : 'none',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', minWidth: 0 }}>
                                      <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-textWH)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {local?.nombre ?? '—'}
                                      </span>
                                      {local?.escudo_url
                                        ? <img src={local.escudo_url} alt="" style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 }} />
                                        : <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'var(--color-border)', flexShrink: 0 }} />
                                      }
                                    </div>

                                    <div style={{
                                      display: 'flex', alignItems: 'center', gap: '4px',
                                      padding: '3px 8px', borderRadius: '8px',
                                      background: enVivo ? 'rgba(255,200,0,0.12)' : (jugado ? 'rgba(0,200,140,0.12)' : 'var(--color-background)'),
                                      border: `1px solid ${enVivo ? 'rgba(255,200,0,0.3)' : (jugado ? 'rgba(0,200,140,0.3)' : 'var(--color-border)')}`,
                                      minWidth: '44px', justifyContent: 'center',
                                      position: 'relative', flexShrink: 0,
                                    }}>
                                      {enVivo && (
                                        <span style={{
                                          position: 'absolute', top: '-3px', right: '-3px',
                                          width: '6px', height: '6px', borderRadius: '50%',
                                          background: '#FFC800', boxShadow: '0 0 6px #FFC800',
                                        }} />
                                      )}
                                      <span style={{ fontSize: '12px', fontWeight: '800', color: (jugado || enVivo) ? (enVivo ? 'rgba(255,200,0,0.9)' : (partido.goles_local! > partido.goles_visitante! ? 'var(--color-accent)' : 'var(--color-error)')) : 'rgba(255,255,255,0.2)', minWidth: '12px', textAlign: 'center' }}>
                                        {jugado || enVivo ? (partido.goles_local ?? 0) : '—'}
                                      </span>
                                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontWeight: '600' }}>:</span>
                                      <span style={{ fontSize: '12px', fontWeight: '800', color: (jugado || enVivo) ? (enVivo ? 'rgba(255,200,0,0.9)' : (partido.goles_visitante! > partido.goles_local! ? 'var(--color-accent)' : 'var(--color-error)')) : 'rgba(255,255,255,0.2)', minWidth: '12px', textAlign: 'center' }}>
                                        {jugado || enVivo ? (partido.goles_visitante ?? 0) : '—'}
                                      </span>
                                    </div>

                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                      {visitante?.escudo_url
                                        ? <img src={visitante.escudo_url} alt="" style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 }} />
                                        : <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'var(--color-border)', flexShrink: 0 }} />
                                      }
                                      <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-textWH)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {visitante?.nombre ?? '—'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN 1: 50% tabla + 50% bracket */}
            <div className="section-tabla-bracket" style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
              {/* Tabla de clasificación */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Trophy size={22} color="var(--color-accent)" />
                  <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Clasificación de grupos</h2>
                </div>
                {tabla.length === 0 ? (
                  <div style={{ padding: '40px', borderRadius: '12px', border: '2px dashed var(--color-border)', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                    Aún no hay partidos jugados.
                  </div>
                ) : (
                  <div className="tabla-scroll-wrapper" style={{ borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--color-border)', background: 'var(--color-background)', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div className="tabla-inner" style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 1fr 40px 40px 50px 40px 40px 40px 40px 40px 40px 50px',
                      padding: '12px 16px', background: 'rgba(0, 93, 67, 1)',
                      borderBottom: '1px solid var(--color-border)', fontSize: '12px',
                      fontWeight: '600', color: 'rgba(255,255,255,0.6)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      <span style={{ textAlign: 'center' }}>#</span>
                      <span>Equipo</span>
                      <span style={{ textAlign: 'center' }}>PJ</span>
                      <span style={{ textAlign: 'center' }}>PG</span>
                      <span style={{ textAlign: 'center' }}>PE</span>
                      <span style={{ textAlign: 'center' }}>%V</span>
                      <span style={{ textAlign: 'center' }}>PP</span>
                      <span style={{ textAlign: 'center' }}>GF</span>
                      <span style={{ textAlign: 'center' }}>GC</span>
                      <span style={{ textAlign: 'center' }}>DG</span>
                      <span style={{ textAlign: 'center' }} title="Power-ups usados (desempate: menos usados clasifica mejor)">PU</span>
                      <span style={{ textAlign: 'center', fontWeight: '700', color: 'var(--color-accent)' }}>PTS</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      {tabla.map((stat, index) => {
                        const porcentajeVictoria = stat.pj > 0 ? Math.round((stat.pg / stat.pj) * 100) : null
                        const eliminado = index >= 4
                        return (
                          <div
                            key={stat.id}
                            className="tabla-inner"
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '40px 1fr 40px 40px 50px 40px 40px 40px 40px 40px 40px 50px',
                              padding: '12px 16px',
                              borderBottom: index < tabla.length - 1 ? '1px solid var(--color-border)' : 'none',
                              color: 'var(--color-textWH)', fontSize: '14px',
                              alignItems: 'center',
                              background: eliminado ? 'var(--color-bgdark)' : 'var(--color-background)',
                            }}
                          >
                            <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>{index + 1}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {stat.equipo?.escudo_url ? (
                                <img
                                  src={stat.equipo.escudo_url}
                                  className="escudo"
                                  style={{ width: 28, height: 28, objectFit: 'contain' }}
                                />
                              ) : (
                                <div className="escudo" style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--color-border)' }} />
                              )}
                              <span style={{ fontWeight: '600' }}>{stat.equipo?.nombre}</span>
                            </div>
                            <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>{stat.pj}</span>
                            <span style={{ textAlign: 'center' }}>{stat.pg}</span>
                            <span style={{ textAlign: 'center' }}>{stat.pe}</span>
                            <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>
                              {porcentajeVictoria !== null ? `${porcentajeVictoria}%` : '—'}
                            </span>
                            <span style={{ textAlign: 'center' }}>{stat.pp}</span>
                            <span style={{ textAlign: 'center' }}>{stat.gf}</span>
                            <span style={{ textAlign: 'center' }}>{stat.gc}</span>
                            <span style={{
                              textAlign: 'center', fontWeight: 600,
                              color: stat.dg > 0 ? 'var(--color-accent)' : stat.dg < 0 ? 'var(--color-error)' : 'inherit',
                            }}>
                              {stat.dg > 0 ? `+${stat.dg}` : stat.dg}
                            </span>
                            <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>
                              {stat.powerupsUsados}
                            </span>
                            <span style={{
                              textAlign: 'center', fontWeight: 800,
                              color: 'var(--color-accent)', fontSize: 16,
                            }}>
                              {stat.pts}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Bracket eliminatorias */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Trophy size={22} color="var(--color-accent)" />
                  <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Eliminatorias</h2>
                </div>
                <div style={{ flex: 1 }}>
                  <BracketTorneo
                    llave1={partidosEliminatorios.filter(p => p.grupo_eliminatorio === 1)}
                    llave2={partidosEliminatorios.filter(p => p.grupo_eliminatorio === 2)}
                    final={partidosEliminatorios.find(p => p.ronda === 'final')}
                    equipos={equipos}
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 2: Historial + Power-ups */}
            <div className="section-historial-powerups" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div className="historial-col" style={{ flex: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', height: '24px' }}>
                  <History size={22} color="var(--color-accent)" />
                  <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, lineHeight: '24px', whiteSpace: 'nowrap' }}>
                    Historial de partidos
                  </h2>
                </div>
                {teamMatches.length === 0 ? (
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
                      const h2hPartidos = [...h2hTodos].sort((a, b) => {
                        if (a.id === detail.partido.id) return -1
                        if (b.id === detail.partido.id) return 1
                        return 0
                      })

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
                            background: isExpanded ? 'var(--color-background)' : 'var(--color-background)',
                          }}
                        >
                          <div className="side-bar" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '10px', backgroundColor: empate ? 'gray' : (localGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }} />
                          <div className="side-bar" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '10px', backgroundColor: empate ? 'gray' : (visitanteGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }} />
                          <div className="match-card-inner" style={{ margin: '0 30px' }}>
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
                            </div>

                            <div className={`map-container ${isExpanded ? 'expanded' : ''} ${h2hExpandido[detail.partido.id] ? 'h2h-open' : ''}`}>
                              <div className="expanded-split" style={{
                                borderTop: '1px solid var(--color-border)',
                              }}>
                                {/* Columna 60%: contenido original (mapa de goles) */}
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
                                                  <span title={hpFase.letra === 'G' ? 'Fase de grupos' : hpFase.letra === 'E' ? 'Eliminatoria' : 'Final'} style={{
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

              {/* Power‑ups por equipo */}
              <div className="powerups-col" style={{ flex: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', height: '24px' }}>
                  <Zap size={22} color="var(--color-accent)" />
                  <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, lineHeight: '24px', whiteSpace: 'nowrap' }}>
                    Power-ups por equipo
                  </h2>
                </div>
                <div style={{ background: 'var(--color-background)', border: '2px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
                  {powerupsUsage.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
                      No se han usado power‑ups aún.
                    </div>
                  ) : (
                    powerupsUsage.map((ep, idx) => (
                      <div key={ep.equipo.id} style={{
                        display: 'flex', alignItems: 'center', padding: '14px 16px',
                        borderBottom: idx < powerupsUsage.length - 1 ? '1px solid var(--color-border)' : 'none',
                        gap: '12px',
                      }}>
                        {ep.equipo.escudo_url
                          ? <img src={ep.equipo.escudo_url} style={{ width: 32, height: 32, objectFit: 'contain' }} />
                          : <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--color-border)' }} />
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{ep.equipo.nombre}</div>
                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                            {ep.powerups.map(pu => (
                              <div key={pu.powerupId} className="pu-badge" style={{
                                display: 'flex', alignItems: 'center', gap: '3px',
                                background: 'rgba(0,200,140,0.1)', borderRadius: '6px',
                                padding: '2px 6px', border: '1px solid rgba(0,200,140,0.3)',
                              }}>
                                <img src={POWERUP_IMAGES[pu.nombre] ?? ''} style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 600 }}>{pu.cantidad}</span>
                              </div>
                            ))}
                            {ep.powerups.length === 0 && (
                              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>—</span>
                            )}
                          </div>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--color-accent)' }}>{ep.total}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  )
}

// ─── Componente BracketTorneo ───
interface GlobalResult {
  local: number
  visitante: number
}

function BracketTorneo({ llave1, llave2, final, equipos }: { llave1: Partido[]; llave2: Partido[]; final: Partido | undefined; equipos: Equipo[] }) {
  const getGlobal = (partidosLlave: Partido[]): GlobalResult | null => {
    if (partidosLlave.length !== 2) return null
    const primerEquipo = partidosLlave[0].equipo_local_id
    const ida = partidosLlave.find(p => p.equipo_local_id === primerEquipo)!
    const vuelta = partidosLlave.find(p => p.equipo_local_id !== primerEquipo)!
    if (!ida || !vuelta || ida.goles_local == null || ida.goles_visitante == null || vuelta.goles_local == null || vuelta.goles_visitante == null) return null
    return {
      local: (ida.goles_local) + (vuelta.goles_visitante),
      visitante: (ida.goles_visitante) + (vuelta.goles_local),
    }
  }

  const global1 = getGlobal(llave1)
  const global2 = getGlobal(llave2)

  const equipoById = (id: string) => equipos.find(e => e.id === id)

  const localRefId = (partidosLlave: Partido[]) => partidosLlave[0]?.equipo_local_id
  const visitanteRefId = (partidosLlave: Partido[]) => partidosLlave[0]?.equipo_visitante_id

  const ganadorLlave = (partidosLlave: Partido[], global: GlobalResult | null): string | null => {
    if (!global) return null
    const lId = localRefId(partidosLlave)
    const vId = visitanteRefId(partidosLlave)
    if (global.local === global.visitante) return null
    return global.local > global.visitante ? lId : vId
  }

  const ganador1 = ganadorLlave(llave1, global1)
  const ganador2 = ganadorLlave(llave2, global2)

  const EquipoFila = ({
    id, marcadorIda, marcadorVuelta, esGanador, posicion, fullWhite,
  }: {
    id: string | undefined
    marcadorIda: number | null
    marcadorVuelta: number | null
    esGanador: boolean
    posicion: 'top' | 'bottom'
    fullWhite: boolean
  }) => {
    const eq = id ? equipoById(id) : undefined
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px',
        background: esGanador ? 'rgba(0,200,140,0.08)' : 'transparent',
        borderTopLeftRadius: posicion === 'top' ? '10px' : 0,
        borderTopRightRadius: posicion === 'top' ? '10px' : 0,
        borderBottomLeftRadius: posicion === 'bottom' ? '10px' : 0,
        borderBottomRightRadius: posicion === 'bottom' ? '10px' : 0,
      }}>
        {eq?.escudo_url ? (
          <img src={eq.escudo_url} className="escudo" style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0, opacity: esGanador || fullWhite ? 1 : 0.55 }} />
        ) : (
          <div className="escudo" style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--color-border)', flexShrink: 0 }} />
        )}
        <span style={{
          flex: 1, fontSize: '13px', fontWeight: esGanador ? 700 : 600,
          color: esGanador ? 'var(--color-textWH)' : 'rgba(255,255,255,0.6)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {eq?.nombre ?? '—'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{
            minWidth: '18px', textAlign: 'center', fontSize: '12px', fontWeight: 700,
            color: fullWhite ? 'var(--color-textWH)' : 'rgba(255,255,255,0.45)',
          }}>
            {marcadorIda ?? '–'}
          </span>
          <span style={{
            minWidth: '18px', textAlign: 'center', fontSize: '12px', fontWeight: 700,
            color: fullWhite ? 'var(--color-textWH)' : 'rgba(255,255,255,0.45)',
          }}>
            {marcadorVuelta ?? '–'}
          </span>
        </div>
      </div>
    )
  }

  const LlaveCard = ({ partidosLlave, global, label, ganadorId, alinear }: {
    partidosLlave: Partido[]
    global: GlobalResult | null
    label: string
    ganadorId: string | null
    alinear: 'flex-start' | 'flex-end'
  }) => {
    const lId = localRefId(partidosLlave)
    const vId = visitanteRefId(partidosLlave)
    const ida = partidosLlave[0]
    const vuelta = partidosLlave[1]

    const idaLocalGoles = ida?.equipo_local_id === lId ? (ida?.goles_local ?? null) : (ida?.goles_visitante ?? null)
    const vueltaLocalGoles = vuelta ? (vuelta.equipo_local_id === lId ? vuelta.goles_local : vuelta.goles_visitante) : null
    const idaVisitanteGoles = ida?.equipo_local_id === vId ? (ida?.goles_local ?? null) : (ida?.goles_visitante ?? null)
    const vueltaVisitanteGoles = vuelta ? (vuelta.equipo_local_id === vId ? vuelta.goles_local : vuelta.goles_visitante) : null

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: alinear, gap: '6px', width: '100%' }}>
        <span style={{
          fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase', letterSpacing: '0.07em', padding: '0 4px',
        }}>
          {label}
        </span>
        {partidosLlave.length === 0 ? (
          <div style={{
            width: '100%', padding: '20px', borderRadius: '12px',
            border: '2px dashed var(--color-border)', textAlign: 'center',
            color: 'rgba(255,255,255,0.3)', fontSize: '12px',
          }}>
            Pendiente...
          </div>
        ) : (
          <div style={{
            width: '100%',
            background: 'var(--color-background)',
            border: `2px solid ${ganadorId ? 'rgba(0,200,140,0.35)' : 'var(--color-border)'}`,
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            <EquipoFila
              id={lId}
              marcadorIda={idaLocalGoles}
              marcadorVuelta={vueltaLocalGoles}
              esGanador={ganadorId === lId}
              posicion="top"
              fullWhite={!ganadorId || ganadorId === lId}
            />
            <div style={{ height: '1px', background: 'var(--color-border)' }} />
            <EquipoFila
              id={vId}
              marcadorIda={idaVisitanteGoles}
              marcadorVuelta={vueltaVisitanteGoles}
              esGanador={ganadorId === vId}
              posicion="bottom"
              fullWhite={!ganadorId || ganadorId === vId}
            />
          </div>
        )}
        {global && (
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 600, padding: '0 4px' }}>
            Global {global.local} - {global.visitante}
          </span>
        )}
      </div>
    )
  }

  const ConectorBracket = () => (
    <div style={{ flex: '0 0 30px', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <svg width="30" height="100%" viewBox="0 0 30 100" preserveAspectRatio="none" style={{ width: '30px', height: '100%' }}>
        <path d="M 0 22 L 15 22 L 15 50" fill="none" stroke="var(--color-border)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d="M 0 78 L 15 78 L 15 50" fill="none" stroke="var(--color-border)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d="M 15 50 L 30 50" fill="none" stroke="var(--color-border)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )

  const finalLocal = final ? equipoById(final.equipo_local_id) : undefined
  const finalVisitante = final ? equipoById(final.equipo_visitante_id) : undefined
  const finalJugada = final && final.goles_local != null && final.goles_visitante != null
  const finalGanadorId = finalJugada
    ? (final!.goles_local! > final!.goles_visitante! ? final!.equipo_local_id : (final!.goles_visitante! > final!.goles_local! ? final!.equipo_visitante_id : null))
    : null

  return (
    <div style={{
      background: 'var(--color-background)',
      border: '2px solid var(--color-border)',
      borderRadius: '12px',
      padding: '24px 16px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: '24px',
      height: '100%',
      minHeight: '280px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
        {/* Columna semifinales */}
        <div style={{ flex: '0 0 38%', display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <LlaveCard partidosLlave={llave1} global={global1} label="Semifinal 1" ganadorId={ganador1} alinear="flex-end" />
          <LlaveCard partidosLlave={llave2} global={global2} label="Semifinal 2" ganadorId={ganador2} alinear="flex-end" />
        </div>

        <ConectorBracket />

        {/* Columna final */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Trophy size={15} color="#FFD700" />
            <span style={{
              fontSize: '11px', fontWeight: '700', color: '#FFD700',
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              Final
            </span>
          </div>

          {!final ? (
            <div style={{
              width: '100%', padding: '20px', borderRadius: '12px',
              border: '2px dashed var(--color-border)', textAlign: 'center',
              color: 'rgba(255,255,255,0.3)', fontSize: '12px',
            }}>
              Pendiente...
            </div>
          ) : (
            <div style={{
              width: '100%',
              background: 'linear-gradient(180deg, rgba(255,215,0,0.12) 0%, rgba(255,215,0,0.04) 100%)',
              border: '2px solid #FFD700',
              borderRadius: '14px',
              padding: '14px',
              boxShadow: '0 0 0 1px rgba(255,215,0,0.3), 0 8px 24px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                {finalLocal?.escudo_url
                  ? <img src={finalLocal.escudo_url} className="escudo" style={{ width: 44, height: 44, objectFit: 'contain', opacity: finalGanadorId && finalGanadorId !== final.equipo_local_id ? 0.5 : 1 }} />
                  : <div className="escudo" style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--color-border)' }} />
                }
                <span style={{
                  fontSize: '13px', fontWeight: finalGanadorId === final.equipo_local_id ? 800 : 600,
                  color: finalGanadorId && finalGanadorId !== final.equipo_local_id ? 'rgba(255,255,255,0.5)' : 'var(--color-textWH)',
                  textAlign: 'center',
                }}>
                  {finalLocal?.nombre ?? '—'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-textWH)' }}>
                  {final.goles_local ?? '–'}
                </span>
                <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>:</span>
                <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-textWH)' }}>
                  {final.goles_visitante ?? '–'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                {finalVisitante?.escudo_url
                  ? <img src={finalVisitante.escudo_url} className="escudo" style={{ width: 44, height: 44, objectFit: 'contain', opacity: finalGanadorId && finalGanadorId !== final.equipo_visitante_id ? 0.5 : 1 }} />
                  : <div className="escudo" style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--color-border)' }} />
                }
                <span style={{
                  fontSize: '13px', fontWeight: finalGanadorId === final.equipo_visitante_id ? 800 : 600,
                  color: finalGanadorId && finalGanadorId !== final.equipo_visitante_id ? 'rgba(255,255,255,0.5)' : 'var(--color-textWH)',
                  textAlign: 'center',
                }}>
                  {finalVisitante?.nombre ?? '—'}
                </span>
              </div>

              {finalGanadorId && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  marginTop: '2px', padding: '5px 10px', borderRadius: '20px',
                  background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.3)',
                }}>
                  <Trophy size={12} color="#FFD700" />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#FFD700' }}>
                    {equipoById(finalGanadorId)?.nombre ?? '—'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}