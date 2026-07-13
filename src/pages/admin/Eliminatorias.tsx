import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Loader2, Save, Edit3, X, Play, Pause, Square, RotateCcw, Zap, Trophy, Settings,
  Calendar, ChevronDown
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTorneo } from '../../context/TorneoContext'
import beachBall from '../../assets/powerups/beach-ball.png'
import moveBall from '../../assets/powerups/move-ball.png'
import swapGoals from '../../assets/powerups/swap-goals.png'
import bigBumpers from '../../assets/powerups/big-bumpers.png'
import boost from '../../assets/powerups/boost.png'
import stickyGoo from '../../assets/powerups/sticky-goo.png'
import ramp from '../../assets/powerups/ramp.png'
import block from '../../assets/powerups/block.png'
import bigHead from '../../assets/powerups/big-head.png'
import ghosted from '../../assets/powerups/ghosted.png'
import movePlayer from '../../assets/powerups/move-player.png'
import canchaImage from '../../assets/cancha.png'

// ─── Interfaces ───
interface Equipo {
  id: string
  nombre: string
  escudo_url: string | null
  color_hex?: string | null
}

interface Partido {
  id: string
  torneo_id: string
  equipo_local_id: string
  equipo_visitante_id: string
  goles_local: number | null
  goles_visitante: number | null
  fecha: string | null
  estado: string
  duracion_segundos: number
  ronda: string
  grupo_eliminatorio: number | null
  fase: string
  numero_llave: number | null
  inicio_timestamp: string | null
  created_at: string
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

interface Editando {
  partidoId: string
  goles_local: string
  goles_visitante: string
  fecha: string
  usarFechaTorneo: boolean
  estado: string
  duracion_segundos: number
  fase: string
  numero_llave: string
  ronda: string
  grupo_eliminatorio: string
  inicio_timestamp: string
  created_at: string
  confirmado: boolean
  equipo_local_id: string
  equipo_visitante_id: string
}

interface CatalogoPowerup {
  id: string
  nombre: string
}

interface PowerupUsado {
  id: string
  partido_id: string
  equipo_id: string
  powerup_id: string
  cantidad: number
}

interface ManualLlave {
  local: string
  visitante: string
}

// ─── Helpers ───
function darkenHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const nr = Math.max(0, Math.min(255, Math.floor(r * factor)))
  const ng = Math.max(0, Math.min(255, Math.floor(g * factor)))
  const nb = Math.max(0, Math.min(255, Math.floor(b * factor)))
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

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

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
const MODAL: React.CSSProperties = {
  background: 'var(--color-bgdark)', border: '1px solid var(--color-border)',
  borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '600px',
  display: 'flex', flexDirection: 'column', gap: '20px',
  maxHeight: '90vh', overflowY: 'auto',
}
const LABEL: React.CSSProperties = {
  fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.5)',
  marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
}
const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: '10px',
  border: '1px solid var(--color-border)', background: 'var(--color-background)',
  color: 'var(--color-textWH)', fontSize: '14px', boxSizing: 'border-box',
}
const SELECT_STYLE: React.CSSProperties = {
  ...INPUT,
  appearance: 'none',
  cursor: 'pointer',
}

// Funciones de formateo / parseo de fechas (mismas que en PartidosGrupo)
const formatDateForInput = (isoString: string | null, withTime: boolean): string => {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (!withTime) return datePart
  return `${datePart} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const parseDateFromInput = (value: string, withTime: boolean): string | null => {
  if (!value.trim()) return null
  const normalized = withTime ? value.replace(' ', 'T') : value
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function Eliminatorias() {
  const { torneoSeleccionado } = useTorneo()
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [partidosEliminatorios, setPartidosEliminatorios] = useState<Partido[]>([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [editando, setEditando] = useState<Editando | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmModal, setConfirmModal] = useState(false)
  const [mostrarAvanzado, setMostrarAvanzado] = useState(true)

  // ─── Estados del panel en vivo ───
  const [partidoEnVivo, setPartidoEnVivo] = useState<Partido | null>(null)
  const [golesLocalVivo, setGolesLocalVivo] = useState(0)
  const [golesVisitanteVivo, setGolesVisitanteVivo] = useState(0)
  const [estadoVivo, setEstadoVivo] = useState('pendiente')
  const [segundos, setSegundos] = useState(0)
  const [, setJugando] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [golesPartido, setGolesPartido] = useState<Gol[]>([])

  const [reiniciarModal, setReiniciarModal] = useState<Partido | null>(null)

  const [powerupsCatalogo, setPowerupsCatalogo] = useState<CatalogoPowerup[]>([])
  const [powerupsUsados, setPowerupsUsados] = useState<PowerupUsado[]>([])
  const [modalPowerup, setModalPowerup] = useState<{ equipoId: string; equipoNombre: string } | null>(null)

  // ─── Power-ups en el modal de editar partido ───
  const [powerupsEditando, setPowerupsEditando] = useState<PowerupUsado[]>([])
  const [modalPowerupEditar, setModalPowerupEditar] = useState<{ equipoId: string; equipoNombre: string } | null>(null)

  const [showFieldModal, setShowFieldModal] = useState(false)
  const [pendingGoal, setPendingGoal] = useState<{ equipoId: string } | null>(null)
  const [markerPos, setMarkerPos] = useState({ x: 50, y: 50 })
  const [dragging, setDragging] = useState(false)
  const fieldRef = useRef<HTMLDivElement>(null)

  // ─── Modal manual de enfrentamientos ───
  const [manualModal, setManualModal] = useState(false)
  const [manualLlave1, setManualLlave1] = useState<ManualLlave>({ local: '', visitante: '' })
  const [manualLlave2, setManualLlave2] = useState<ManualLlave>({ local: '', visitante: '' })
  const [guardandoManual, setGuardandoManual] = useState(false)

  const torneo = torneoSeleccionado

  // ─── Carga inicial de datos ───
  const fetchData = async () => {
    if (!torneo) return
    setLoading(true)

    const { data: eqTorneo } = await supabase
      .from('equipos_torneo').select('equipo_id').eq('torneo_id', torneo.id)
    if (eqTorneo && eqTorneo.length > 0) {
      const ids = eqTorneo.map(e => e.equipo_id)
      const { data: eqs } = await supabase
        .from('equipos').select('id, nombre, escudo_url, color_hex').in('id', ids)
      if (eqs) setEquipos(eqs)
    }

    const { data: partidos } = await supabase
      .from('partidos')
      .select('*')
      .eq('torneo_id', torneo.id)
      .eq('fase', 'eliminatorias')
      .order('ronda', { ascending: true })
    setPartidosEliminatorios(partidos || [])

    setLoading(false)
  }

  useEffect(() => {
    const fetchPowerups = async () => {
      const { data } = await supabase.from('powerups_catalogo').select('id, nombre')
      if (data) setPowerupsCatalogo(data as CatalogoPowerup[])
    }
    fetchPowerups()
  }, [])

  useEffect(() => { fetchData() }, [torneo?.id])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // ─── Sincroniza la fecha del partido con la fecha del torneo cuando el checkbox está activo ───
  useEffect(() => {
    if (editando?.usarFechaTorneo && torneo?.created_at) {
      const fechaTorneo = formatDateForInput(torneo.created_at, false)
      setEditando(ed => (ed && ed.fecha !== fechaTorneo ? { ...ed, fecha: fechaTorneo } : ed))
    }
  }, [editando?.usarFechaTorneo, torneo?.created_at])

  // ─── Lógica para obtener los 4 primeros de la fase de grupos, en orden 1º,2º,3º,4º ───
  const obtenerTop4 = async (): Promise<Equipo[]> => {
    const { data: partidosGrupos } = await supabase
      .from('partidos')
      .select('equipo_local_id, equipo_visitante_id, goles_local, goles_visitante')
      .eq('torneo_id', torneo!.id)
      .eq('fase', 'grupos')
      .not('goles_local', 'is', null)
      .not('goles_visitante', 'is', null)

    const statsMap = new Map<string, { pj: number; pg: number; pe: number; pp: number; gf: number; gc: number; pts: number }>()
    equipos.forEach(eq => statsMap.set(eq.id, { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 }))

    partidosGrupos?.forEach(p => {
      const local = statsMap.get(p.equipo_local_id)
      const visitante = statsMap.get(p.equipo_visitante_id)
      if (!local || !visitante) return
      local.pj++; visitante.pj++
      local.gf += p.goles_local!; local.gc += p.goles_visitante!
      visitante.gf += p.goles_visitante!; visitante.gc += p.goles_local!
      if (p.goles_local! > p.goles_visitante!) { local.pg++; local.pts += 3; visitante.pp++ }
      else if (p.goles_local! < p.goles_visitante!) { visitante.pg++; visitante.pts += 3; local.pp++ }
      else { local.pe++; visitante.pe++; local.pts += 1; visitante.pts += 1 }
    })

    const clasificados = Array.from(statsMap.entries())
      .map(([id, stat]) => ({ id, ...stat, dg: stat.gf - stat.gc }))
      .sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts
        if (b.dg !== a.dg) return b.dg - a.dg
        if (b.gf !== a.gf) return b.gf - a.gf
        return 0
      })
      .slice(0, 4)

    return clasificados.map(c => equipos.find(e => e.id === c.id)!).filter(Boolean)
  }

  // ─── Inserta las 4 partidos (ida y vuelta) de las 2 semifinales ───
  const insertarLlaves = async (llave1: ManualLlave, llave2: ManualLlave) => {
    if (!torneo) return

    await supabase.from('partidos').delete().eq('torneo_id', torneo.id).eq('fase', 'eliminatorias')

    const insertarPartido = async (localId: string, visitanteId: string, grupo: number) => {
      const { error } = await supabase.from('partidos').insert({
        torneo_id: torneo.id,
        fase: 'eliminatorias',
        ronda: 'semifinal',
        grupo_eliminatorio: grupo,
        equipo_local_id: localId,
        equipo_visitante_id: visitanteId,
        estado: 'pendiente',
        duracion_segundos: 0,
      })
      if (error) throw error
    }

    await insertarPartido(llave1.local, llave1.visitante, 1)
    await insertarPartido(llave1.visitante, llave1.local, 1)

    await insertarPartido(llave2.local, llave2.visitante, 2)
    await insertarPartido(llave2.visitante, llave2.local, 2)
  }

  // ─── Generar partidos eliminatorios automáticamente ───
  const generarPartidos = async () => {
    if (!torneo || equipos.length < 4) return
    setGenerando(true)

    try {
      const top4 = await obtenerTop4()
      if (top4.length < 4) {
        alert('No se pudieron determinar los 4 primeros equipos.')
        setGenerando(false)
        return
      }
      const llave1: ManualLlave = { local: top4[0].id, visitante: top4[2].id }
      const llave2: ManualLlave = { local: top4[1].id, visitante: top4[3].id }

      await insertarLlaves(llave1, llave2)
      setConfirmModal(false)
      await fetchData()
    } catch (error: any) {
      console.error('Error al generar eliminatorias:', error)
      alert(`Error al generar: ${error?.message || 'Error desconocido'}`)
    } finally {
      setGenerando(false)
    }
  }

  // ─── Modal manual: abrir con equipos precargados si existen top4, o vacíos ───
  const abrirModalManual = async () => {
    setGuardandoManual(false)
    const llave1Actual = partidosEliminatorios.find(p => p.grupo_eliminatorio === 1)
    const llave2Actual = partidosEliminatorios.find(p => p.grupo_eliminatorio === 2)

    if (llave1Actual && llave2Actual) {
      setManualLlave1({ local: llave1Actual.equipo_local_id, visitante: llave1Actual.equipo_visitante_id })
      setManualLlave2({ local: llave2Actual.equipo_local_id, visitante: llave2Actual.equipo_visitante_id })
    } else {
      try {
        const top4 = await obtenerTop4()
        if (top4.length >= 4) {
          setManualLlave1({ local: top4[0].id, visitante: top4[2].id })
          setManualLlave2({ local: top4[1].id, visitante: top4[3].id })
        } else {
          setManualLlave1({ local: '', visitante: '' })
          setManualLlave2({ local: '', visitante: '' })
        }
      } catch {
        setManualLlave1({ local: '', visitante: '' })
        setManualLlave2({ local: '', visitante: '' })
      }
    }
    setManualModal(true)
  }

  const guardarLlavesManual = async () => {
    if (!torneo) return

    const seleccionados = [manualLlave1.local, manualLlave1.visitante, manualLlave2.local, manualLlave2.visitante]
    if (seleccionados.some(s => !s)) {
      alert('Completa los 4 equipos de las semifinales.')
      return
    }
    const setSeleccionados = new Set(seleccionados)
    if (setSeleccionados.size !== 4) {
      alert('No puedes repetir el mismo equipo en más de un cruce.')
      return
    }

    setGuardandoManual(true)
    try {
      await insertarLlaves(manualLlave1, manualLlave2)
      setManualModal(false)
      await fetchData()
    } catch (error: any) {
      console.error('Error al guardar enfrentamientos manuales:', error)
      alert(`Error al guardar: ${error?.message || 'Error desconocido'}`)
    } finally {
      setGuardandoManual(false)
    }
  }

  // ─── Generar final ───
  const generarFinal = async () => {
    if (!torneo) return

    const calcularGanadorLlave = (partidosLlave: Partido[]): string | null => {
      if (partidosLlave.length !== 2) return null
      const primerEquipo = partidosLlave[0].equipo_local_id
      const ida = partidosLlave.find(p => p.equipo_local_id === primerEquipo)!
      const vuelta = partidosLlave.find(p => p.equipo_local_id !== primerEquipo)!
      if (!ida || !vuelta ||
          ida.goles_local == null || ida.goles_visitante == null ||
          vuelta.goles_local == null || vuelta.goles_visitante == null) return null

      const equipoA = ida.equipo_local_id
      const equipoB = ida.equipo_visitante_id
      const golesA = (ida.goles_local) + (vuelta.goles_visitante)
      const golesB = (ida.goles_visitante) + (vuelta.goles_local)

      if (golesA > golesB) return equipoA
      if (golesB > golesA) return equipoB
      const golesVisitanteA = vuelta.goles_visitante
      const golesVisitanteB = ida.goles_visitante
      if (golesVisitanteA > golesVisitanteB) return equipoA
      if (golesVisitanteB > golesVisitanteA) return equipoB
      return null
    }

    try {
      const llave1 = partidosEliminatorios.filter(p => p.grupo_eliminatorio === 1)
      const llave2 = partidosEliminatorios.filter(p => p.grupo_eliminatorio === 2)

      const ganadorLlave1 = calcularGanadorLlave(llave1)
      const ganadorLlave2 = calcularGanadorLlave(llave2)

      if (!ganadorLlave1 || !ganadorLlave2) {
        alert('Asegúrate de que ambas llaves estén completas y con un ganador definido.')
        return
      }

      const finalExistente = partidosEliminatorios.find(p => p.ronda === 'final')
      if (finalExistente) {
        alert('Ya existe una final. Elimínala antes de generar una nueva.')
        return
      }

      const { error } = await supabase.from('partidos').insert({
        torneo_id: torneo.id,
        fase: 'eliminatorias',
        ronda: 'final',
        grupo_eliminatorio: null,
        equipo_local_id: ganadorLlave1,
        equipo_visitante_id: ganadorLlave2,
        estado: 'pendiente',
        duracion_segundos: 0,
      })
      if (error) throw error

      await fetchData()
    } catch (error: any) {
      console.error('Error al generar final:', error)
      alert(`Error al generar final: ${error?.message || 'Error desconocido'}`)
    }
  }

  // ─── Editar partido (EXTENDIDO) ───
  const abrirEditar = async (partido: Partido) => {
    setEditando({
      partidoId: partido.id,
      goles_local: partido.goles_local != null ? String(partido.goles_local) : '',
      goles_visitante: partido.goles_visitante != null ? String(partido.goles_visitante) : '',
      fecha: formatDateForInput(partido.fecha, false),
      usarFechaTorneo: false,
      estado: partido.estado ?? 'pendiente',
      duracion_segundos: partido.duracion_segundos ?? 0,
      fase: partido.fase,
      numero_llave: partido.numero_llave != null ? String(partido.numero_llave) : '',
      ronda: partido.ronda ?? '',
      grupo_eliminatorio: partido.grupo_eliminatorio != null ? String(partido.grupo_eliminatorio) : '',
      inicio_timestamp: formatDateForInput(partido.inicio_timestamp, true),
      created_at: formatDateForInput(partido.created_at, true),
      confirmado: partido.confirmado ?? false,
      equipo_local_id: partido.equipo_local_id,
      equipo_visitante_id: partido.equipo_visitante_id,
    })

    const { data: powerupsData } = await supabase
      .from('powerups_usados')
      .select('*')
      .eq('partido_id', partido.id)
    setPowerupsEditando((powerupsData as PowerupUsado[]) || [])
    setMostrarAvanzado(true);
  }

  const guardarPartido = async () => {
    if (!editando) return
    setGuardando(true)

    const payload: Record<string, unknown> = {
      goles_local: editando.goles_local !== '' ? parseInt(editando.goles_local) : null,
      goles_visitante: editando.goles_visitante !== '' ? parseInt(editando.goles_visitante) : null,
      fecha: parseDateFromInput(editando.fecha, false),
      estado: editando.estado,
      duracion_segundos: editando.duracion_segundos,
      fase: editando.fase,
      numero_llave: editando.numero_llave !== '' ? parseInt(editando.numero_llave) : null,
      ronda: editando.ronda || null,
      grupo_eliminatorio: editando.grupo_eliminatorio !== '' ? parseInt(editando.grupo_eliminatorio) : null,
      inicio_timestamp: parseDateFromInput(editando.inicio_timestamp, true),
      created_at: parseDateFromInput(editando.created_at, true),
      confirmado: editando.confirmado,
      equipo_local_id: editando.equipo_local_id,
      equipo_visitante_id: editando.equipo_visitante_id,
    }

    if (!editando.created_at) delete payload.created_at

    await supabase.from('partidos').update(payload).eq('id', editando.partidoId)
    await fetchData()
    setGuardando(false)
    setEditando(null)
    setMostrarAvanzado(false)
  }

  // --- Power-ups dentro del modal de editar partido (sin cambios) ---
  const usarPowerupEditando = async (equipoId: string, powerupId: string) => {
    if (!editando) return
    const existente = powerupsEditando.find(
      pu => pu.equipo_id === equipoId && pu.powerup_id === powerupId
    )
    if (existente) {
      const nuevaCantidad = existente.cantidad + 1
      await supabase
        .from('powerups_usados')
        .update({ cantidad: nuevaCantidad })
        .eq('id', existente.id)
      setPowerupsEditando(prev =>
        prev.map(pu => (pu.id === existente.id ? { ...pu, cantidad: nuevaCantidad } : pu))
      )
    } else {
      const { data } = await supabase
        .from('powerups_usados')
        .insert({
          partido_id: editando.partidoId,
          equipo_id: equipoId,
          powerup_id: powerupId,
          cantidad: 1,
        })
        .select()
        .single()
      if (data) setPowerupsEditando(prev => [...prev, data as PowerupUsado])
    }
  }

  const restarPowerupEditando = async (registro: PowerupUsado) => {
    if (registro.cantidad > 1) {
      const nuevaCantidad = registro.cantidad - 1
      await supabase
        .from('powerups_usados')
        .update({ cantidad: nuevaCantidad })
        .eq('id', registro.id)
      setPowerupsEditando(prev =>
        prev.map(pu => (pu.id === registro.id ? { ...pu, cantidad: nuevaCantidad } : pu))
      )
    } else {
      await supabase.from('powerups_usados').delete().eq('id', registro.id)
      setPowerupsEditando(prev => prev.filter(pu => pu.id !== registro.id))
    }
  }

  const eliminarPowerupEditando = async (registro: PowerupUsado) => {
    await supabase.from('powerups_usados').delete().eq('id', registro.id)
    setPowerupsEditando(prev => prev.filter(pu => pu.id !== registro.id))
  }

  const confirmarReiniciar = (partido: Partido) => setReiniciarModal(partido)

  const ejecutarReinicio = async () => {
    if (!reiniciarModal) return
    const partido = reiniciarModal
    try {
      await supabase.from('goles').delete().eq('partido_id', partido.id)
      await supabase.from('powerups_usados').delete().eq('partido_id', partido.id)
      setPowerupsUsados([])
      const { error } = await supabase.from('partidos').update({
        goles_local: null,
        goles_visitante: null,
        estado: 'pendiente',
        duracion_segundos: 0,
        inicio_timestamp: null,   // ← AÑADIR ESTA LÍNEA
      }).eq('id', partido.id)
      if (error) throw error
      setReiniciarModal(null)
      await fetchData()
    } catch (error: any) {
      console.error('Error al reiniciar:', error)
      alert(`Error al reiniciar: ${error?.message || 'Error desconocido'}`)
    }
  }

  // ─── Panel en vivo (sin cambios relevantes) ───
  const abrirEnVivo = async (partido: Partido) => {
    setPartidoEnVivo(partido)
    setGolesLocalVivo(partido.goles_local ?? 0)
    setGolesVisitanteVivo(partido.goles_visitante ?? 0)
    setEstadoVivo(partido.estado ?? 'pendiente')
    const dur = partido.duracion_segundos ?? 0
    setSegundos(dur)
    if (timerRef.current) clearInterval(timerRef.current)
    if (partido.estado === 'jugando') {
      setJugando(true)
      iniciarTimer(dur)
    } else setJugando(false)

    const { data: golesData } = await supabase
      .from('goles').select('*').eq('partido_id', partido.id).order('minuto', { ascending: true })
    setGolesPartido(golesData || [])

    const { data: powerupsData } = await supabase
      .from('powerups_usados').select('*').eq('partido_id', partido.id)
    if (powerupsData) setPowerupsUsados(powerupsData as PowerupUsado[])
  }

  const cerrarEnVivo = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPartidoEnVivo(null)
    setJugando(false)
  }

  const iniciarTimer = (desde = 0) => {
    if (timerRef.current) clearInterval(timerRef.current)
    let inicio = Date.now() - desde * 1000
    timerRef.current = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 200)
  }
  const pausarTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  const actualizarEstadoVivo = async (nuevoEstado: string, segundosActuales: number) => {
    if (!partidoEnVivo) return
    setEstadoVivo(nuevoEstado)
    await supabase.from('partidos').update({ estado: nuevoEstado, duracion_segundos: segundosActuales }).eq('id', partidoEnVivo.id)
    setPartidosEliminatorios(prev => prev.map(p => p.id === partidoEnVivo.id ? { ...p, estado: nuevoEstado, duracion_segundos: segundosActuales } : p))
  }

  const iniciarPartido = async () => {
    if (!partidoEnVivo) return
    setJugando(true)

    const ahora = new Date().toISOString()
    await supabase.from('partidos').update({ inicio_timestamp: ahora }).eq('id', partidoEnVivo.id)

    actualizarEstadoVivo('jugando', 0)
    setSegundos(0)
    iniciarTimer(0)
  }
  const pausarPartido = () => { setJugando(false); pausarTimer(); actualizarEstadoVivo('pausado', segundos) }
  const reanudarPartido = () => {
    if (!partidoEnVivo) return
    setJugando(true)

    const nuevoInicio = new Date(Date.now() - segundos * 1000).toISOString()
    supabase.from('partidos').update({ inicio_timestamp: nuevoInicio }).eq('id', partidoEnVivo.id)

    actualizarEstadoVivo('jugando', segundos)
    iniciarTimer(segundos)
  }
  const terminarPartido = async () => { setJugando(false); pausarTimer(); await actualizarEstadoVivo('finalizado', segundos); cerrarEnVivo() }

  const actualizarGoles = async (local: number, visitante: number) => {
    if (!partidoEnVivo) return
    setGolesLocalVivo(local); setGolesVisitanteVivo(visitante)
    await supabase.from('partidos').update({ goles_local: local, goles_visitante: visitante }).eq('id', partidoEnVivo.id)
    setPartidosEliminatorios(prev => prev.map(p => p.id === partidoEnVivo.id ? { ...p, goles_local: local, goles_visitante: visitante } : p))
  }

  const registrarGolConPosicion = async (equipoId: string, posX: number, posY: number) => {
    if (!partidoEnVivo || estadoVivo !== 'jugando') return
    const { data: nuevoGol, error } = await supabase.from('goles').insert({
      partido_id: partidoEnVivo.id, equipo_id: equipoId, minuto: segundos, pos_x: posX, pos_y: posY
    }).select().single()
    if (error) console.error(error)
    else if (nuevoGol) setGolesPartido(prev => [...prev, nuevoGol as Gol])
  }

  const confirmarGolConPosicion = async () => {
    if (!pendingGoal) return
    const { equipoId } = pendingGoal
    const esLocal = partidoEnVivo?.equipo_local_id === equipoId
    if (esLocal) await actualizarGoles(golesLocalVivo + 1, golesVisitanteVivo)
    else await actualizarGoles(golesLocalVivo, golesVisitanteVivo + 1)
    await registrarGolConPosicion(equipoId, markerPos.x, markerPos.y)
    setShowFieldModal(false)
    setPendingGoal(null)
  }

  const abrirModalCampo = (equipoId: string) => {
    if (!partidoEnVivo || estadoVivo !== 'jugando') return
    setPendingGoal({ equipoId })
    setMarkerPos({ x: 50, y: 50 })
    setShowFieldModal(true)
  }

  const handleFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!fieldRef.current) return
    const rect = fieldRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setMarkerPos({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) })
  }

  const handleMarkerMouseDown = (e: React.MouseEvent) => { e.stopPropagation(); setDragging(true) }
  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging || !fieldRef.current) return
    const rect = fieldRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setMarkerPos({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) })
  }
  const handleMouseUp = () => setDragging(false)

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging])

  const eliminarUltimoGol = async (equipoId: string) => {
    if (!partidoEnVivo) return
    const { data: goles } = await supabase.from('goles').select('id').eq('partido_id', partidoEnVivo.id).eq('equipo_id', equipoId).order('minuto', { ascending: false }).limit(1)
    if (goles && goles.length > 0) {
      await supabase.from('goles').delete().eq('id', goles[0].id)
      setGolesPartido(prev => prev.filter(g => g.id !== goles[0].id))
    }
  }

  const usarPowerup = async (equipoId: string, powerupId: string) => {
    if (!partidoEnVivo || estadoVivo !== 'jugando') return
    const existente = powerupsUsados.find(pu => pu.equipo_id === equipoId && pu.powerup_id === powerupId)
    if (existente) {
      await supabase.from('powerups_usados').update({ cantidad: existente.cantidad + 1 }).eq('id', existente.id)
      setPowerupsUsados(prev => prev.map(pu => pu.id === existente.id ? { ...pu, cantidad: existente.cantidad + 1 } : pu))
    } else {
      const { data, error } = await supabase.from('powerups_usados').insert({
        partido_id: partidoEnVivo.id, equipo_id: equipoId, powerup_id: powerupId, cantidad: 1
      }).select().single()
      if (error) console.error(error)
      else if (data) setPowerupsUsados(prev => [...prev, data as PowerupUsado])
    }
  }

  const sumarGolLocal = () => abrirModalCampo(partidoEnVivo!.equipo_local_id)
  const restarGolLocal = async () => {
    if (golesLocalVivo > 0) {
      await actualizarGoles(golesLocalVivo - 1, golesVisitanteVivo)
      await eliminarUltimoGol(partidoEnVivo!.equipo_local_id)
    }
  }
  const sumarGolVisitante = () => abrirModalCampo(partidoEnVivo!.equipo_visitante_id)
  const restarGolVisitante = async () => {
    if (golesVisitanteVivo > 0) {
      await actualizarGoles(golesLocalVivo, golesVisitanteVivo - 1)
      await eliminarUltimoGol(partidoEnVivo!.equipo_visitante_id)
    }
  }

  const formatearTiempo = (totalSegundos: number) => {
    const mins = Math.floor(totalSegundos / 60)
    const secs = totalSegundos % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const equipoById = useCallback((id: string) => equipos.find(e => e.id === id), [equipos])

  // ─── Renderizado ───
  if (!torneo) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px', padding: '40px', textAlign: 'center' }}>
        Selecciona un torneo en el menú lateral.
      </div>
    )
  }

  const hayPartidos = partidosEliminatorios.length > 0

  const llave1 = partidosEliminatorios.filter(p => p.grupo_eliminatorio === 1)
  const llave2 = partidosEliminatorios.filter(p => p.grupo_eliminatorio === 2)
  const final = partidosEliminatorios.find(p => p.ronda === 'final')

  const getGlobal = (partidosLlave: Partido[]): { local: number; visitante: number } | null => {
    if (partidosLlave.length !== 2) return null
    const primerEquipo = partidosLlave[0].equipo_local_id
    const ida = partidosLlave.find(p => p.equipo_local_id === primerEquipo)!
    const vuelta = partidosLlave.find(p => p.equipo_local_id !== primerEquipo)!
    if (!ida || !vuelta ||
        ida.goles_local == null || ida.goles_visitante == null ||
        vuelta.goles_local == null || vuelta.goles_visitante == null) return null

    const golesLocal = (ida.goles_local) + (vuelta.goles_visitante)
    const golesVisitante = (ida.goles_visitante) + (vuelta.goles_local)
    return { local: golesLocal, visitante: golesVisitante }
  }

  const global1 = llave1.length === 2 ? getGlobal(llave1) : null
  const global2 = llave2.length === 2 ? getGlobal(llave2) : null

  const seleccionadosManual = new Set([
    manualLlave1.local, manualLlave1.visitante, manualLlave2.local, manualLlave2.visitante,
  ].filter(Boolean))

  const opcionesEquipo = (valorActual: string) =>
    equipos.filter(eq => eq.id === valorActual || !seleccionadosManual.has(eq.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Trophy size={24} color="var(--color-accent)" />
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-textWH)' }}>
            Eliminatorias
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={abrirModalManual}
            disabled={generando || equipos.length < 4}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '11px',
              background: 'var(--color-border)', color: 'var(--color-textWH)',
              fontWeight: '600', fontSize: '14px',
              border: '1px solid transparent',
              cursor: (generando || equipos.length < 4) ? 'not-allowed' : 'pointer',
              opacity: (generando || equipos.length < 4) ? 0.7 : 1,
            }}
          >
            <Settings size={16} />
            Manual
          </button>
          <button
            onClick={() => hayPartidos ? setConfirmModal(true) : generarPartidos()}
            disabled={generando || equipos.length < 4}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '11px',
              background: 'var(--color-border)', color: 'var(--color-textWH)',
              fontWeight: '600', fontSize: '14px',
              border: '1px solid transparent',
              cursor: (generando || equipos.length < 4) ? 'not-allowed' : 'pointer',
              opacity: (generando || equipos.length < 4) ? 0.7 : 1,
            }}
          >
            {generando ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            {hayPartidos ? 'Regenerar' : 'Generar partidos eliminatorios'}
          </button>
          {hayPartidos && !final && (
            <button
              onClick={generarFinal}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 18px', borderRadius: '11px',
                background: 'var(--color-accent)', color: 'var(--color-bgdark)',
                fontWeight: '700', fontSize: '14px', border: 'none', cursor: 'pointer',
              }}
            >
              <Trophy size={16} /> Generar final
            </button>
          )}
        </div>
      </div>

      {equipos.length < 4 && (
        <div style={{
          padding: '16px 20px', borderRadius: '12px',
          background: 'rgba(255,200,0,0.07)', border: '1px solid rgba(255,200,0,0.2)',
          color: 'rgba(255,200,0,0.8)', fontSize: '13px',
        }}>
          Necesitas al menos 4 equipos en el torneo para generar las eliminatorias.
        </div>
      )}

      <div style={{
        padding: '12px 20px', borderRadius: '12px',
        background: 'rgba(0,200,140,0.06)', border: '1px solid rgba(0,200,140,0.2)',
        color: 'rgba(255,255,255,0.6)', fontSize: '13px',
      }}>
        Las semifinales siempre se emparejan como <strong style={{ color: 'var(--color-accent)' }}>1º vs 3º</strong> (Semifinal 1) y{' '}
        <strong style={{ color: 'var(--color-accent)' }}>2º vs 4º</strong> (Semifinal 2) de la tabla de grupos. Puedes usar "Manual" para elegir tú mismo qué equipos ocupan cada cruce.
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Cargando...</div>
      ) : !hayPartidos ? (
        <div style={{
          padding: '40px', borderRadius: '16px',
          border: '2px dashed var(--color-border)',
          textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px',
        }}>
          No hay partidos eliminatorios. Pulsa "Generar partidos eliminatorios" o "Manual" para crearlos.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap', marginTop: '10px' }}>
            {/* Llave 1 */}
            <div style={{
              flex: 1, minWidth: '350px', background: 'var(--color-background)',
              border: '2px solid var(--color-border)', borderRadius: '12px',
              padding: '16px',
            }}>
              <h3 style={{ color: 'var(--color-textWH)', margin: '0 0 12px 0', fontWeight: 600 }}>
                Semifinal 1
              </h3>
              {llave1.map(partido => (
                <PartidoCard
                  key={partido.id}
                  partido={partido}
                  equipos={equipos}
                  onLive={abrirEnVivo}
                  onEdit={abrirEditar}
                  onReset={confirmarReiniciar}
                />
              ))}
              {global1 && (
                <div style={{
                  marginTop: '10px', padding: '8px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.05)', textAlign: 'center',
                  color: 'rgba(255,255,255,0.8)', fontWeight: 600,
                }}>
                  Global: {global1.local} - {global1.visitante}
                </div>
              )}
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              width: '80px',
            }}>
              <div style={{ width: '2px', height: '40px', background: 'var(--color-border)' }} />
              <div style={{ width: '40px', height: '2px', background: 'var(--color-border)' }} />
              <div style={{ width: '2px', height: '40px', background: 'var(--color-border)' }} />
            </div>

            {/* Llave 2 */}
            <div style={{
              flex: 1, minWidth: '350px', background: 'var(--color-background)',
              border: '2px solid var(--color-border)', borderRadius: '12px',
              padding: '16px',
            }}>
              <h3 style={{ color: 'var(--color-textWH)', margin: '0 0 12px 0', fontWeight: 600 }}>
                Semifinal 2
              </h3>
              {llave2.map(partido => (
                <PartidoCard
                  key={partido.id}
                  partido={partido}
                  equipos={equipos}
                  onLive={abrirEnVivo}
                  onEdit={abrirEditar}
                  onReset={confirmarReiniciar}
                />
              ))}
              {global2 && (
                <div style={{
                  marginTop: '10px', padding: '8px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.05)', textAlign: 'center',
                  color: 'rgba(255,255,255,0.8)', fontWeight: 600,
                }}>
                  Global: {global2.local} - {global2.visitante}
                </div>
              )}
            </div>
          </div>

          {final && (
            <div style={{
              display: 'flex', justifyContent: 'center', marginTop: '20px',
              width: '100%',
            }}>
              <div style={{
                background: 'rgba(0,200,140,0.1)', border: '2px solid var(--color-accent)',
                borderRadius: '12px', padding: '16px', width: '400px', maxWidth: '90%',
              }}>
                <h3 style={{
                  color: 'var(--color-accent)', margin: '0 0 12px 0', fontWeight: 700,
                  textAlign: 'center',
                }}>
                  🏆 Final
                </h3>
                <PartidoCard
                  partido={final}
                  equipos={equipos}
                  onLive={abrirEnVivo}
                  onEdit={abrirEditar}
                  onReset={confirmarReiniciar}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Modales ─── */}
      {confirmModal && (
        <div style={OVERLAY} onClick={() => setConfirmModal(false)}>
          <div style={{ ...MODAL, maxWidth: '360px', gap: '16px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Trophy size={18} color="var(--color-accent)" />
              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>
                Regenerar eliminatorias
              </span>
            </div>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              Se borrarán todos los partidos eliminatorios actuales (incluida la final) y se crearán nuevas semifinales (1º vs 3º y 2º vs 4º). ¿Continuar?
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setConfirmModal(false)} style={{
                flex: 1, padding: '11px', borderRadius: '10px', background: 'transparent',
                border: '1px solid var(--color-border)', color: 'rgba(255,255,255,0.5)',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={generarPartidos} disabled={generando} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '11px', borderRadius: '10px',
                background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)',
                color: 'var(--color-error)', fontSize: '14px', fontWeight: '700',
                cursor: generando ? 'not-allowed' : 'pointer', opacity: generando ? 0.7 : 1,
              }}>
                {generando ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
                Regenerar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal manual de enfrentamientos (sin cambios) */}
      {manualModal && (
        <div style={OVERLAY} onClick={() => setManualModal(false)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>
                Enfrentamientos manuales
              </span>
              <button onClick={() => setManualModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              Elige manualmente qué equipo ocupa cada posición del cruce. Esto reemplazará las eliminatorias actuales (incluida la final, si existe) y se generarán ida y vuelta para cada semifinal.
            </p>

            <div>
              <p style={LABEL}>Semifinal 1 (posición 1 vs posición 3)</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <select
                  value={manualLlave1.local}
                  onChange={e => setManualLlave1(l => ({ ...l, local: e.target.value }))}
                  style={SELECT_STYLE}
                >
                  <option value="">Equipo (posición 1)</option>
                  {opcionesEquipo(manualLlave1.local).map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.nombre}</option>
                  ))}
                </select>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: '600' }}>vs</span>
                <select
                  value={manualLlave1.visitante}
                  onChange={e => setManualLlave1(l => ({ ...l, visitante: e.target.value }))}
                  style={SELECT_STYLE}
                >
                  <option value="">Equipo (posición 3)</option>
                  {opcionesEquipo(manualLlave1.visitante).map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p style={LABEL}>Semifinal 2 (posición 2 vs posición 4)</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <select
                  value={manualLlave2.local}
                  onChange={e => setManualLlave2(l => ({ ...l, local: e.target.value }))}
                  style={SELECT_STYLE}
                >
                  <option value="">Equipo (posición 2)</option>
                  {opcionesEquipo(manualLlave2.local).map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.nombre}</option>
                  ))}
                </select>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: '600' }}>vs</span>
                <select
                  value={manualLlave2.visitante}
                  onChange={e => setManualLlave2(l => ({ ...l, visitante: e.target.value }))}
                  style={SELECT_STYLE}
                >
                  <option value="">Equipo (posición 4)</option>
                  {opcionesEquipo(manualLlave2.visitante).map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={guardarLlavesManual}
              disabled={guardandoManual}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', borderRadius: '11px',
                background: 'var(--color-accent)', color: 'var(--color-bgdark)',
                fontWeight: '700', fontSize: '14px', border: 'none',
                cursor: guardandoManual ? 'not-allowed' : 'pointer',
                opacity: guardandoManual ? 0.7 : 1,
              }}
            >
              {guardandoManual ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Guardar enfrentamientos
            </button>
          </div>
        </div>
      )}

      {/* ─── Modal Editar Partido (COMPLETO) ─── */}
      {editando && (() => {
        const partido = partidosEliminatorios.find(p => p.id === editando.partidoId)
        const local = partido ? equipoById(partido.equipo_local_id) : null
        const visitante = partido ? equipoById(partido.equipo_visitante_id) : null
        return (
          <div style={OVERLAY} onClick={() => { setEditando(null); setPowerupsEditando([]); setMostrarAvanzado(false) }}>
            <div style={MODAL} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>
                  Editar partido
                </span>
                <button onClick={() => { setEditando(null); setPowerupsEditando([]); setMostrarAvanzado(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
                  <X size={16} />
                </button>
              </div>

              {/* Equipos */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <select
                  value={editando.equipo_local_id}
                  onChange={e => setEditando(ed => ed ? { ...ed, equipo_local_id: e.target.value } : ed)}
                  style={{ ...SELECT_STYLE, flex: 1 }}
                >
                  {equipos.map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.nombre}</option>
                  ))}
                </select>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>vs</span>
                <select
                  value={editando.equipo_visitante_id}
                  onChange={e => setEditando(ed => ed ? { ...ed, equipo_visitante_id: e.target.value } : ed)}
                  style={{ ...SELECT_STYLE, flex: 1 }}
                >
                  {equipos.map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Resultado */}
              <div>
                <p style={LABEL}>Resultado</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    style={{ ...INPUT, textAlign: 'center', fontWeight: '700', fontSize: '20px' }}
                    type="number" min={0} placeholder="—"
                    value={editando.goles_local}
                    onChange={e => setEditando(ed => ed ? { ...ed, goles_local: e.target.value } : ed)}
                  />
                  <span style={{ fontSize: '18px', color: 'rgba(255,255,255,0.3)', fontWeight: '700' }}>:</span>
                  <input
                    style={{ ...INPUT, textAlign: 'center', fontWeight: '700', fontSize: '20px' }}
                    type="number" min={0} placeholder="—"
                    value={editando.goles_visitante}
                    onChange={e => setEditando(ed => ed ? { ...ed, goles_visitante: e.target.value } : ed)}
                  />
                </div>
              </div>

              {/* Fecha con texto + calendario */}
              <div>
                <p style={LABEL}>Fecha</p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editando.usarFechaTorneo}
                    onChange={e => {
                      const marcado = e.target.checked
                      setEditando(ed => {
                        if (!ed) return ed
                        if (marcado && torneo?.created_at) {
                          return { ...ed, usarFechaTorneo: true, fecha: formatDateForInput(torneo.created_at, false) }
                        }
                        return { ...ed, usarFechaTorneo: marcado }
                      })
                    }}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--color-accent)' }}
                  />
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>Usar fecha del torneo</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    style={{ ...INPUT, opacity: editando.usarFechaTorneo ? 0.6 : 1, flex: 1 }}
                    type="text"
                    placeholder="YYYY-MM-DD"
                    disabled={editando.usarFechaTorneo}
                    value={editando.fecha}
                    onChange={e => setEditando(ed => ed ? { ...ed, fecha: e.target.value } : ed)}
                  />
                  <button
                    type="button"
                    disabled={editando.usarFechaTorneo}
                    onClick={() => (document.getElementById('hidden-elim-fecha') as HTMLInputElement)?.showPicker()}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '40px', height: '40px', borderRadius: '10px',
                      background: 'var(--color-border)', border: '1px solid var(--color-border)',
                      color: 'var(--color-textWH)', cursor: editando.usarFechaTorneo ? 'not-allowed' : 'pointer',
                      opacity: editando.usarFechaTorneo ? 0.6 : 1,
                    }}
                  >
                    <Calendar size={18} />
                  </button>
                </div>
                <input
                  id="hidden-elim-fecha"
                  type="date"
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                  onChange={e => {
                    if (!e.target.value) return
                    setEditando(ed => ed ? { ...ed, fecha: e.target.value } : ed)
                  }}
                />
              </div>

              {/* Estado y duración */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <p style={LABEL}>Estado</p>
                  <select
                    value={editando.estado}
                    onChange={e => setEditando(ed => ed ? { ...ed, estado: e.target.value } : ed)}
                    style={SELECT_STYLE}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="jugando">Jugando</option>
                    <option value="pausado">Pausado</option>
                    <option value="finalizado">Finalizado</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={LABEL}>Duración (seg)</p>
                  <input
                    style={INPUT}
                    type="number" min={0}
                    value={editando.duracion_segundos}
                    onChange={e => setEditando(ed => ed ? { ...ed, duracion_segundos: parseInt(e.target.value) || 0 } : ed)}
                  />
                </div>
              </div>

              {/* Confirmado */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editando.confirmado}
                    onChange={e => setEditando(ed => ed ? { ...ed, confirmado: e.target.checked } : ed)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
                  />
                  <span style={{ ...LABEL, marginBottom: 0 }}>Confirmado</span>
                </label>
              </div>

              {/* Power-ups (sin cambios) */}
              <div>
                <p style={LABEL}>Power-ups</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Local */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-textWH)' }}>
                        {local?.nombre ?? '—'}
                      </span>
                      <button
                        onClick={() => setModalPowerupEditar({ equipoId: partido!.equipo_local_id, equipoNombre: local?.nombre ?? '' })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '6px 10px', borderRadius: '8px',
                          background: 'rgba(255,200,0,0.15)', border: '1px solid rgba(255,200,0,0.4)',
                          color: '#FFC800', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                        }}
                      >
                        <Zap size={13} />
                        Agregar
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {powerupsEditando.filter(pu => pu.equipo_id === partido!.equipo_local_id).length === 0 && (
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Sin power-ups</span>
                      )}
                      {powerupsEditando
                        .filter(pu => pu.equipo_id === partido!.equipo_local_id)
                        .map(pu => {
                          const cat = powerupsCatalogo.find(c => c.id === pu.powerup_id)
                          if (!cat) return null
                          return (
                            <div key={pu.id} style={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              padding: '6px 8px', borderRadius: '8px',
                              background: 'var(--color-background)', border: '1px solid var(--color-border)',
                            }}>
                              <img src={POWERUP_IMAGES[cat.nombre] ?? ''} alt={cat.nombre} style={{ width: 18, height: 18, objectFit: 'contain' }} />
                              <span style={{ fontSize: '12px', color: 'var(--color-textWH)', fontWeight: 600 }}>{cat.nombre} x{pu.cantidad}</span>
                              <button onClick={() => restarPowerupEditando(pu)} title="Quitar uno" style={{
                                width: '20px', height: '20px', borderRadius: '5px',
                                background: 'rgba(255,200,0,0.15)', border: 'none',
                                color: '#FFC800', fontSize: '13px', fontWeight: '700',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>−</button>
                              <button onClick={() => eliminarPowerupEditando(pu)} title="Eliminar power-up" style={{
                                width: '20px', height: '20px', borderRadius: '5px',
                                background: 'rgba(220,50,50,0.15)', border: 'none',
                                color: 'var(--color-error)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}><X size={12} /></button>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                  {/* Visitante */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-textWH)' }}>
                        {visitante?.nombre ?? '—'}
                      </span>
                      <button
                        onClick={() => setModalPowerupEditar({ equipoId: partido!.equipo_visitante_id, equipoNombre: visitante?.nombre ?? '' })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '6px 10px', borderRadius: '8px',
                          background: 'rgba(255,200,0,0.15)', border: '1px solid rgba(255,200,0,0.4)',
                          color: '#FFC800', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                        }}
                      >
                        <Zap size={13} />
                        Agregar
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {powerupsEditando.filter(pu => pu.equipo_id === partido!.equipo_visitante_id).length === 0 && (
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Sin power-ups</span>
                      )}
                      {powerupsEditando
                        .filter(pu => pu.equipo_id === partido!.equipo_visitante_id)
                        .map(pu => {
                          const cat = powerupsCatalogo.find(c => c.id === pu.powerup_id)
                          if (!cat) return null
                          return (
                            <div key={pu.id} style={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              padding: '6px 8px', borderRadius: '8px',
                              background: 'var(--color-background)', border: '1px solid var(--color-border)',
                            }}>
                              <img src={POWERUP_IMAGES[cat.nombre] ?? ''} alt={cat.nombre} style={{ width: 18, height: 18, objectFit: 'contain' }} />
                              <span style={{ fontSize: '12px', color: 'var(--color-textWH)', fontWeight: 600 }}>{cat.nombre} x{pu.cantidad}</span>
                              <button onClick={() => restarPowerupEditando(pu)} title="Quitar uno" style={{
                                width: '20px', height: '20px', borderRadius: '5px',
                                background: 'rgba(255,200,0,0.15)', border: 'none',
                                color: '#FFC800', fontSize: '13px', fontWeight: '700',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>−</button>
                              <button onClick={() => eliminarPowerupEditando(pu)} title="Eliminar power-up" style={{
                                width: '20px', height: '20px', borderRadius: '5px',
                                background: 'rgba(220,50,50,0.15)', border: 'none',
                                color: 'var(--color-error)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}><X size={12} /></button>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección Avanzada */}
              <div>
                <button
                  onClick={() => setMostrarAvanzado(!mostrarAvanzado)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
                    fontWeight: '600', fontSize: '13px', cursor: 'pointer', padding: 0,
                  }}
                >
                  <ChevronDown
                    size={14}
                    style={{
                      transform: mostrarAvanzado ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                    }}
                  />
                  Avanzado
                </button>
                {mostrarAvanzado && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
                    {/* Fase */}
                    <div>
                      <p style={LABEL}>Fase</p>
                      <input
                        style={INPUT}
                        type="text"
                        value={editando.fase}
                        onChange={e => setEditando(ed => ed ? { ...ed, fase: e.target.value } : ed)}
                      />
                    </div>

                    {/* Numero llave, Ronda, Grupo eliminatorio */}
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <p style={LABEL}>Nº Llave</p>
                        <input
                          style={INPUT}
                          type="number"
                          value={editando.numero_llave}
                          onChange={e => setEditando(ed => ed ? { ...ed, numero_llave: e.target.value } : ed)}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={LABEL}>Ronda</p>
                        <input
                          style={INPUT}
                          type="text"
                          value={editando.ronda}
                          onChange={e => setEditando(ed => ed ? { ...ed, ronda: e.target.value } : ed)}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={LABEL}>Grupo Elim.</p>
                        <input
                          style={INPUT}
                          type="number"
                          value={editando.grupo_eliminatorio}
                          onChange={e => setEditando(ed => ed ? { ...ed, grupo_eliminatorio: e.target.value } : ed)}
                        />
                      </div>
                    </div>

                    {/* inicio_timestamp */}
                    <div>
                      <p style={LABEL}>Inicio (timestamp)</p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          style={{ ...INPUT, flex: 1 }}
                          type="text"
                          placeholder="YYYY-MM-DD HH:mm:ss"
                          value={editando.inicio_timestamp}
                          onChange={e => setEditando(ed => ed ? { ...ed, inicio_timestamp: e.target.value } : ed)}
                        />
                        <button
                          type="button"
                          onClick={() => (document.getElementById('hidden-elim-inicio') as HTMLInputElement)?.showPicker()}
                          style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: 'var(--color-border)', border: '1px solid var(--color-border)',
                            color: 'var(--color-textWH)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Calendar size={18} />
                        </button>
                      </div>
                      <input
                        id="hidden-elim-inicio"
                        type="datetime-local"
                        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                        onChange={e => {
                          if (!e.target.value) return
                          const formatted = e.target.value.replace('T', ' ') + ':00'
                          setEditando(ed => ed ? { ...ed, inicio_timestamp: formatted } : ed)
                        }}
                      />
                    </div>

                    {/* created_at */}
                    <div>
                      <p style={LABEL}>Creado (timestamp)</p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          style={{ ...INPUT, flex: 1 }}
                          type="text"
                          placeholder="YYYY-MM-DD HH:mm:ss"
                          value={editando.created_at}
                          onChange={e => setEditando(ed => ed ? { ...ed, created_at: e.target.value } : ed)}
                        />
                        <button
                          type="button"
                          onClick={() => (document.getElementById('hidden-elim-created') as HTMLInputElement)?.showPicker()}
                          style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: 'var(--color-border)', border: '1px solid var(--color-border)',
                            color: 'var(--color-textWH)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Calendar size={18} />
                        </button>
                      </div>
                      <input
                        id="hidden-elim-created"
                        type="datetime-local"
                        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                        onChange={e => {
                          if (!e.target.value) return
                          const formatted = e.target.value.replace('T', ' ') + ':00'
                          setEditando(ed => ed ? { ...ed, created_at: formatted } : ed)
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <button onClick={guardarPartido} disabled={guardando} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', borderRadius: '11px', background: 'var(--color-accent)',
                color: 'var(--color-bgdark)', fontWeight: '700', fontSize: '14px', border: 'none',
                cursor: guardando ? 'not-allowed' : 'pointer', opacity: guardando ? 0.7 : 1,
              }}>
                {guardando ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Guardar
              </button>
            </div>
          </div>
        )
      })()}

      {/* Modal seleccionar power-up a agregar (sin cambios) */}
      {modalPowerupEditar && (
        <div style={{ ...OVERLAY, zIndex: 1100 }} onClick={() => setModalPowerupEditar(null)}>
          <div style={{ ...MODAL, maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-textWH)' }}>
                Power-ups para {modalPowerupEditar.equipoNombre}
              </span>
              <button
                onClick={() => setModalPowerupEditar(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
              {powerupsCatalogo.map(pu => (
                <button
                  key={pu.id}
                  onClick={() => {
                    usarPowerupEditando(modalPowerupEditar.equipoId, pu.id)
                    setModalPowerupEditar(null)
                  }}
                  style={{
                    display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: '8px 10px', borderRadius: 8, background: 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <img
                    src={POWERUP_IMAGES[pu.nombre] ?? ''}
                    alt={pu.nombre}
                    style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 14, color: 'var(--color-textWH)', fontWeight: 600 }}>
                    {pu.nombre}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {reiniciarModal && (
        <div style={OVERLAY} onClick={() => setReiniciarModal(null)}>
          <div style={{ ...MODAL, maxWidth: '360px', gap: '16px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <RotateCcw size={18} color="var(--color-error)" />
              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>Reiniciar partido</span>
            </div>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Se borrarán todos los goles y datos en vivo del partido. ¿Continuar?</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setReiniciarModal(null)} style={{ flex: 1, padding: '11px', borderRadius: '10px', background: 'transparent', border: '1px solid var(--color-border)', color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={ejecutarReinicio} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px', borderRadius: '10px', background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)', color: 'var(--color-error)', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                <RotateCcw size={15} /> Reiniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Panel en vivo (sin cambios) ─── */}
      {partidoEnVivo && (() => {
        const local = equipoById(partidoEnVivo.equipo_local_id)
        const visitante = equipoById(partidoEnVivo.equipo_visitante_id)
        const finalizado = estadoVivo === 'finalizado'
        const golesLocalList = golesPartido.filter(g => g.equipo_id === partidoEnVivo.equipo_local_id).map(g => formatearTiempo(g.minuto))
        const golesVisitanteList = golesPartido.filter(g => g.equipo_id === partidoEnVivo.equipo_visitante_id).map(g => formatearTiempo(g.minuto))
        return (
          <div style={OVERLAY}>
            <div onClick={e => e.stopPropagation()} style={{ ...MODAL, maxWidth: '700px', gap: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', fontSize: '18px', color: 'var(--color-textWH)' }}>En vivo</span>
                <button onClick={cerrarEnVivo} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}><X size={20} /></button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {estadoVivo === 'pendiente' && <button onClick={iniciarPartido} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '11px', background: 'rgba(0,200,140,0.15)', border: '1px solid rgba(0,200,140,0.4)', color: 'var(--color-accent)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}><Play size={16} /> Iniciar</button>}
                  {estadoVivo === 'jugando' && <>
                    <button onClick={pausarPartido} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,200,0,0.15)', border: '1px solid rgba(255,200,0,0.4)', color: '#FFC800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pause size={18} /></button>
                    <button onClick={terminarPartido} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)', color: 'var(--color-error)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Square size={18} /></button>
                  </>}
                  {estadoVivo === 'pausado' && <>
                    <button onClick={reanudarPartido} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '11px', background: 'rgba(0,200,140,0.15)', border: '1px solid rgba(0,200,140,0.4)', color: 'var(--color-accent)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}><Play size={16} /> Reanudar</button>
                    <button onClick={terminarPartido} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)', color: 'var(--color-error)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Square size={18} /></button>
                  </>}
                  {finalizado && <span style={{ color: 'var(--color-accent)', fontWeight: '600' }}>Partido finalizado</span>}
                </div>
                <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: '25px', fontWeight: '700', color: 'var(--color-textWH)', fontFamily: 'monospace', letterSpacing: '2px', pointerEvents: 'none' }}>{formatearTiempo(segundos)}</div>
                <div style={{ visibility: 'hidden' }}>00:00</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '0px' }}>
                {/* Local */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flex: 1 }}>
                  {local?.escudo_url ? <img src={local.escudo_url} style={{ width: 100, height: 100, objectFit: 'contain' }} /> : <div style={{ width: 100, height: 100, borderRadius: 12, background: 'var(--color-border)' }} />}
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-textWH)', textAlign: 'center' }}>{local?.nombre ?? '—'}</span>
                  {!finalizado && <div style={{ display: 'flex', gap: 8, marginTop: 5, marginBottom: 5 }}>
                    <button onClick={restarGolLocal} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(220,50,50,0.2)', border: '1px solid rgba(220,50,50,0.4)', color: 'var(--color-error)', fontSize: 20, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <button onClick={sumarGolLocal} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,200,140,0.2)', border: '1px solid rgba(0,200,140,0.4)', color: 'var(--color-accent)', fontSize: 20, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    <button onClick={() => setModalPowerup({ equipoId: partidoEnVivo.equipo_local_id, equipoNombre: local?.nombre ?? '' })} title="Usar power-up" style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,200,0,0.2)', border: '1px solid rgba(255,200,0,0.4)', color: '#FFC800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={18} /></button>
                  </div>}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    {golesLocalList.map((t, i) => <span key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>⚽ {t}</span>)}
                  </div>
                  {powerupsUsados.filter(pu => pu.equipo_id === partidoEnVivo.equipo_local_id).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                      {powerupsUsados.filter(pu => pu.equipo_id === partidoEnVivo.equipo_local_id).map(pu => {
                        const cat = powerupsCatalogo.find(c => c.id === pu.powerup_id)
                        if (!cat) return null
                        return (
                          <div key={pu.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <img src={POWERUP_IMAGES[cat.nombre] ?? ''} alt={cat.nombre} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                            <span style={{ fontSize: 12, color: '#FFC800', fontWeight: 700 }}>x{pu.cantidad}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 15 }}>
                  <span style={{ fontSize: 56, fontWeight: 800, color: 'var(--color-textWH)', minWidth: 60, textAlign: 'center' }}>{golesLocalVivo}</span>
                  <span style={{ fontSize: 40, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>:</span>
                  <span style={{ fontSize: 56, fontWeight: 800, color: 'var(--color-textWH)', minWidth: 60, textAlign: 'center' }}>{golesVisitanteVivo}</span>
                </div>
                {/* Visitante */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 1 }}>
                  {visitante?.escudo_url ? <img src={visitante.escudo_url} style={{ width: 100, height: 100, objectFit: 'contain' }} /> : <div style={{ width: 100, height: 100, borderRadius: 12, background: 'var(--color-border)' }} />}
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-textWH)' }}>{visitante?.nombre ?? '—'}</span>
                  {!finalizado && <div style={{ display: 'flex', gap: 8, marginTop: 5, marginBottom: 5 }}>
                    <button onClick={restarGolVisitante} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(220,50,50,0.2)', border: '1px solid rgba(220,50,50,0.4)', color: 'var(--color-error)', fontSize: 20, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <button onClick={sumarGolVisitante} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,200,140,0.2)', border: '1px solid rgba(0,200,140,0.4)', color: 'var(--color-accent)', fontSize: 20, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    <button onClick={() => setModalPowerup({ equipoId: partidoEnVivo.equipo_visitante_id, equipoNombre: visitante?.nombre ?? '' })} title="Usar power-up" style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,200,0,0.2)', border: '1px solid rgba(255,200,0,0.4)', color: '#FFC800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={18} /></button>
                  </div>}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    {golesVisitanteList.map((t, i) => <span key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>⚽ {t}</span>)}
                  </div>
                  {powerupsUsados.filter(pu => pu.equipo_id === partidoEnVivo.equipo_visitante_id).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                      {powerupsUsados.filter(pu => pu.equipo_id === partidoEnVivo.equipo_visitante_id).map(pu => {
                        const cat = powerupsCatalogo.find(c => c.id === pu.powerup_id)
                        if (!cat) return null
                        return (
                          <div key={pu.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <img src={POWERUP_IMAGES[cat.nombre] ?? ''} alt={cat.nombre} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                            <span style={{ fontSize: 12, color: '#FFC800', fontWeight: 700 }}>x{pu.cantidad}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal power‑up (sin cambios) */}
      {modalPowerup && (
        <div style={OVERLAY} onClick={() => setModalPowerup(null)}>
          <div style={{ ...MODAL, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-textWH)' }}>Power-ups para {modalPowerup.equipoNombre}</span>
              <button onClick={() => setModalPowerup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {powerupsCatalogo.map(pu => (
                <button key={pu.id} onClick={() => { usarPowerup(modalPowerup.equipoId, pu.id); setModalPowerup(null) }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <img src={POWERUP_IMAGES[pu.nombre] ?? ''} style={{ width: 32, height: 32, objectFit: 'contain' }} />
                  <span style={{ fontSize: 14, color: 'var(--color-textWH)', fontWeight: 600 }}>{pu.nombre}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal campo de gol (sin cambios) */}
      {showFieldModal && pendingGoal && (() => {
        const teamColor = equipos.find(e => e.id === pendingGoal.equipoId)?.color_hex || '#FF0000'
        const darker = darkenHex(teamColor, 0.7)
        return (
          <div style={OVERLAY} onClick={() => setShowFieldModal(false)}>
            <div style={{ ...MODAL, maxWidth: 1200, padding: 16, gap: 12 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowFieldModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}><X size={16} /></button>
              </div>
              <div ref={fieldRef} onClick={handleFieldClick} style={{ position: 'relative', width: '100%', aspectRatio: '16/9', backgroundImage: `url(${canchaImage})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 12, overflow: 'hidden', cursor: 'crosshair', border: '0px solid var(--color-border)' }}>
                <div onMouseDown={handleMarkerMouseDown} style={{ position: 'absolute', left: `${markerPos.x}%`, top: `${markerPos.y}%`, width: 48, height: 48, borderRadius: '50%', backgroundColor: darker, border: `5px solid ${teamColor}`, transform: 'translate(-50%, -50%)', cursor: 'grab', boxShadow: `0 0 20px ${teamColor}`, zIndex: 10 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={confirmarGolConPosicion} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 11, background: 'var(--color-accent)', border: 'none', color: 'var(--color-bgdark)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  <Save size={16} /> Confirmar gol
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Componente auxiliar PartidoCard ───
function PartidoCard({
  partido,
  equipos,
  onLive,
  onEdit,
  onReset,
}: {
  partido: Partido
  equipos: Equipo[]
  onLive: (p: Partido) => void
  onEdit: (p: Partido) => void
  onReset: (p: Partido) => void
}) {
  const local = equipos.find(e => e.id === partido.equipo_local_id)
  const visitante = equipos.find(e => e.id === partido.equipo_visitante_id)
  const jugado = partido.goles_local != null && partido.goles_visitante != null
  const enVivo = partido.estado === 'jugando' || partido.estado === 'pausado'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '10px 12px', borderRadius: '10px',
      border: `1px solid ${enVivo ? 'rgba(255,200,0,0.5)' : 'var(--color-border)'}`,
      background: enVivo ? 'rgba(255,200,0,0.08)' : 'transparent',
      marginBottom: '6px',
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-textWH)', textAlign: 'right' }}>{local?.nombre ?? '—'}</span>
        {local?.escudo_url ? <img src={local.escudo_url} style={{ width: 24, height: 24, objectFit: 'contain' }} /> : <div style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--color-border)' }} />}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '4px',
        padding: '4px 10px', borderRadius: '8px',
        background: enVivo ? 'rgba(255,200,0,0.12)' : (jugado ? 'rgba(0,200,140,0.12)' : 'var(--color-background)'),
        border: `1px solid ${enVivo ? 'rgba(255,200,0,0.3)' : (jugado ? 'rgba(0,200,140,0.3)' : 'var(--color-border)')}`,
        minWidth: '60px', justifyContent: 'center',
        position: 'relative',
      }}>
        {enVivo && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#FFC800', boxShadow: '0 0 6px #FFC800' }} />}
        <span style={{ fontSize: 16, fontWeight: 800, color: (jugado || enVivo) ? (enVivo ? 'rgba(255,200,0,0.9)' : (partido.goles_local! > partido.goles_visitante! ? 'var(--color-accent)' : 'var(--color-error)')) : 'rgba(255,255,255,0.2)' }}>{jugado || enVivo ? (partido.goles_local ?? 0) : '—'}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>:</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: (jugado || enVivo) ? (enVivo ? 'rgba(255,200,0,0.9)' : (partido.goles_visitante! > partido.goles_local! ? 'var(--color-accent)' : 'var(--color-error)')) : 'rgba(255,255,255,0.2)' }}>{jugado || enVivo ? (partido.goles_visitante ?? 0) : '—'}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
        {visitante?.escudo_url ? <img src={visitante.escudo_url} style={{ width: 24, height: 24, objectFit: 'contain' }} /> : <div style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--color-border)' }} />}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-textWH)' }}>{visitante?.nombre ?? '—'}</span>
      </div>
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <button onClick={() => onLive(partido)} title="Panel en vivo" style={{ width: 30, height: 30, borderRadius: 6, background: enVivo ? 'rgba(255,200,0,0.2)' : 'var(--color-border)', border: enVivo ? '1px solid rgba(255,200,0,0.5)' : '1px solid transparent', color: enVivo ? '#FFC800' : 'rgba(255,255,255,1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={13} strokeWidth={3} /></button>
        <button onClick={() => onEdit(partido)} title="Editar partido" style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--color-border)', border: '1px solid transparent', color: 'rgba(255,255,255,1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit3 size={13} strokeWidth={3} /></button>
        <button onClick={() => onReset(partido)} title="Reiniciar partido" style={{ width: 30, height: 30, borderRadius: 6, background: 'rgba(220,50,50,0.2)', border: '1px solid rgba(220,50,50,0.7)', color: 'var(--color-error)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RotateCcw size={13} strokeWidth={3} /></button>
      </div>
    </div>
  )
}