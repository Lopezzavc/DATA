import { useEffect, useState, useRef, useCallback } from 'react'
import { Calendar, Shuffle, Loader2, Save, Edit3, X, Settings, Play, Pause, Square, RotateCcw, Zap } from 'lucide-react'
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
import canchaImage from '../../assets/cancha.png' // Ajusta la ruta según tu proyecto

interface Equipo {
  id: string
  nombre: string
  escudo_url: string | null
  color_hex?: string | null
}

interface Partido {
  id: string
  jornada_id: string
  equipo_local_id: string
  equipo_visitante_id: string
  goles_local: number | null
  goles_visitante: number | null
  fecha: string | null
  estado: string
  duracion_segundos: number
}

interface Gol {
  id: string
  partido_id: string
  equipo_id: string
  minuto: number
  pos_x?: number | null
  pos_y?: number | null
}

interface Jornada {
  id: string
  numero: number
  partidos: Partido[]
}

interface Editando {
  partidoId: string
  goles_local: string
  goles_visitante: string
  fecha: string
  usarFechaTorneo: boolean
}

interface MatchManual {
  local: string
  visitante: string
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

/**
 * Genera un fixture round-robin (todos contra todos, una vuelta) dinámico.
 * Funciona con cualquier cantidad de equipos (par o impar).
 * Si es impar, se agrega un "bye" (equipo fantasma) que hace que en cada
 * jornada un equipo distinto descanse; esos enfrentamientos con el bye
 * se descartan del resultado final.
 *
 * Con N equipos:
 *  - Par: N-1 jornadas, N/2 partidos cada una.
 *  - Impar: N jornadas, (N-1)/2 partidos cada una (un equipo descansa por jornada).
 */
function generarFixture(idsOriginales: string[]): { local: string; visitante: string }[][] {
  const BYE = '__BYE__'
  let equipos = [...idsOriginales]

  const esImpar = equipos.length % 2 !== 0
  if (esImpar) equipos.push(BYE)

  const n = equipos.length
  const totalJornadas = n - 1
  const jornadas: { local: string; visitante: string }[][] = []

  for (let r = 0; r < totalJornadas; r++) {
    const ronda: { local: string; visitante: string }[] = []
    for (let i = 0; i < n / 2; i++) {
      const local = equipos[i]
      const visitante = equipos[n - 1 - i]
      if (local !== BYE && visitante !== BYE) {
        ronda.push({ local, visitante })
      }
    }
    jornadas.push(ronda)
    // Rotación estándar de round-robin (se fija el primer equipo)
    equipos.splice(1, 0, equipos.pop()!)
  }

  return jornadas
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Oscurece un color hexadecimal multiplicando cada canal por un factor (0-1) */
function darkenHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const nr = Math.max(0, Math.min(255, Math.floor(r * factor)))
  const ng = Math.max(0, Math.min(255, Math.floor(g * factor)))
  const nb = Math.max(0, Math.min(255, Math.floor(b * factor)))
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

/**
 * Calcula la cantidad de jornadas y partidos por jornada según el número
 * de equipos, siguiendo la misma lógica de generarFixture (round-robin a una vuelta).
 */
function calcularDimensionesFixture(cantidadEquipos: number): { jornadas: number; partidosPorJornada: number } {
  if (cantidadEquipos < 2) return { jornadas: 0, partidosPorJornada: 0 }
  const esImpar = cantidadEquipos % 2 !== 0
  const n = esImpar ? cantidadEquipos + 1 : cantidadEquipos
  const jornadas = n - 1
  const partidosPorJornada = esImpar ? (cantidadEquipos - 1) / 2 : cantidadEquipos / 2
  return { jornadas, partidosPorJornada }
}

function crearManualJornadasVacias(cantidadEquipos: number): MatchManual[][] {
  const { jornadas, partidosPorJornada } = calcularDimensionesFixture(cantidadEquipos)
  return Array.from({ length: jornadas }, () =>
    Array.from({ length: partidosPorJornada }, () => ({ local: '', visitante: '' }))
  )
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

export default function PartidosGrupo() {
  const { torneoSeleccionado } = useTorneo()
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [editando, setEditando] = useState<Editando | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmModal, setConfirmModal] = useState(false)
  const [manualModal, setManualModal] = useState(false)
  const [manualJornadas, setManualJornadas] = useState<MatchManual[][]>([])
  const [jornadaManualActiva, setJornadaManualActiva] = useState(0)

  // Estado del modal de partido en vivo
  const [partidoEnVivo, setPartidoEnVivo] = useState<Partido | null>(null)
  const [golesLocalVivo, setGolesLocalVivo] = useState(0)
  const [golesVisitanteVivo, setGolesVisitanteVivo] = useState(0)
  const [estadoVivo, setEstadoVivo] = useState('pendiente')
  const [segundos, setSegundos] = useState(0)
  const [, setJugando] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Goles registrados en el partido en vivo
  const [golesPartido, setGolesPartido] = useState<Gol[]>([])

  // Confirmación para reiniciar partido
  const [reiniciarModal, setReiniciarModal] = useState<Partido | null>(null)

  const [powerupsCatalogo, setPowerupsCatalogo] = useState<CatalogoPowerup[]>([])
  const [powerupsUsados, setPowerupsUsados] = useState<PowerupUsado[]>([])
  const [modalPowerup, setModalPowerup] = useState<{ equipoId: string; equipoNombre: string } | null>(null)

  // ─── Power-ups en el modal de editar partido ───
  const [powerupsEditando, setPowerupsEditando] = useState<PowerupUsado[]>([])
  const [modalPowerupEditar, setModalPowerupEditar] = useState<{ equipoId: string; equipoNombre: string } | null>(null)

  // ─── Modal de posición de gol ───
  const [showFieldModal, setShowFieldModal] = useState(false)
  const [pendingGoal, setPendingGoal] = useState<{ equipoId: string } | null>(null)
  const [markerPos, setMarkerPos] = useState({ x: 50, y: 50 }) // porcentajes 0-100
  const [dragging, setDragging] = useState(false)
  const fieldRef = useRef<HTMLDivElement>(null)

  const torneo = torneoSeleccionado

  const fetchData = async () => {
    if (!torneo) return
    setLoading(true)

    const [{ data: eqTorneo }, { data: jornadasData }, { data: partidosData }] = await Promise.all([
      supabase.from('equipos_torneo').select('equipo_id').eq('torneo_id', torneo.id),
      supabase.from('jornadas').select('*').eq('torneo_id', torneo.id).order('numero'),
      supabase.from('partidos')
        .select('*')
        .eq('torneo_id', torneo.id)
        .eq('fase', 'grupos')
        .order('equipo_local_id', { ascending: true }),
    ])

    if (eqTorneo && eqTorneo.length > 0) {
      const ids = eqTorneo.map(e => e.equipo_id)
      const { data: eqs } = await supabase
        .from('equipos')
        .select('id, nombre, escudo_url, color_hex')
        .in('id', ids)
      if (eqs) setEquipos(eqs)
    }

    if (jornadasData && partidosData) {
      const j: Jornada[] = jornadasData.map(jornada => ({
        id: jornada.id,
        numero: jornada.numero,
        partidos: partidosData.filter(p => p.jornada_id === jornada.id),
      }))
      setJornadas(j)
    }

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

  const generarPartidos = async (mezclar = false) => {
    if (!torneo || equipos.length < 2) return
    setGenerando(true)

    const { data: jornadasExist } = await supabase.from('jornadas').select('id').eq('torneo_id', torneo.id)
    if (jornadasExist && jornadasExist.length > 0) {
      await supabase.from('partidos').delete().eq('torneo_id', torneo.id).eq('fase', 'grupos')
      await supabase.from('jornadas').delete().eq('torneo_id', torneo.id)
    }

    const idsBase = equipos.map(e => e.id)
    const ids = mezclar ? shuffle(idsBase) : idsBase
    const fixture = generarFixture(ids)

    for (let i = 0; i < fixture.length; i++) {
      const { data: jornada } = await supabase
        .from('jornadas')
        .insert({ torneo_id: torneo.id, numero: i + 1 })
        .select()
        .single()

      if (jornada && fixture[i].length > 0) {
        await supabase.from('partidos').insert(
          fixture[i].map(p => ({
            torneo_id: torneo.id,
            jornada_id: jornada.id,
            fase: 'grupos',
            equipo_local_id: p.local,
            equipo_visitante_id: p.visitante,
          }))
        )
      }
    }

    setConfirmModal(false)
    await fetchData()
    setGenerando(false)
  }

  const guardarFixtureManual = async () => {
    if (!torneo || equipos.length < 2) return

    for (let j = 0; j < manualJornadas.length; j++) {
      const equiposUsados = new Set<string>()
      for (const m of manualJornadas[j]) {
        if (!m.local || !m.visitante) {
          alert(`Completa todos los enfrentamientos de la jornada ${j + 1}`)
          return
        }
        if (m.local === m.visitante) {
          alert(`Un equipo no puede jugar contra sí mismo en la jornada ${j + 1}`)
          return
        }
        if (equiposUsados.has(m.local) || equiposUsados.has(m.visitante)) {
          alert(`Hay equipos repetidos en la jornada ${j + 1}`)
          return
        }
        equiposUsados.add(m.local)
        equiposUsados.add(m.visitante)
      }
      // En torneos con número impar de equipos, un equipo descansa cada jornada,
      // por lo que el set de equipos usados será uno menos que el total.
      if (equiposUsados.size !== equipos.length && equiposUsados.size !== equipos.length - 1) {
        alert(`La jornada ${j + 1} no contiene una combinación válida de equipos`)
        return
      }
    }

    setGenerando(true)

    const { data: jornadasExist } = await supabase.from('jornadas').select('id').eq('torneo_id', torneo.id)
    if (jornadasExist && jornadasExist.length > 0) {
      await supabase.from('partidos').delete().eq('torneo_id', torneo.id).eq('fase', 'grupos')
      await supabase.from('jornadas').delete().eq('torneo_id', torneo.id)
    }

    for (let i = 0; i < manualJornadas.length; i++) {
      const { data: jornada } = await supabase
        .from('jornadas')
        .insert({ torneo_id: torneo.id, numero: i + 1 })
        .select()
        .single()

      if (jornada) {
        await supabase.from('partidos').insert(
          manualJornadas[i].map(m => ({
            torneo_id: torneo.id,
            jornada_id: jornada.id,
            fase: 'grupos',
            equipo_local_id: m.local,
            equipo_visitante_id: m.visitante,
          }))
        )
      }
    }

    setManualModal(false)
    await fetchData()
    setGenerando(false)
  }

  const abrirEditar = async (partido: Partido) => {
    const fecha = partido.fecha
      ? new Date(partido.fecha).toISOString().slice(0, 10)
      : ''
    setEditando({
      partidoId: partido.id,
      goles_local: partido.goles_local != null ? String(partido.goles_local) : '',
      goles_visitante: partido.goles_visitante != null ? String(partido.goles_visitante) : '',
      fecha,
      usarFechaTorneo: false,   // ← AGREGAR ESTA LÍNEA
    })

    const { data: powerupsData } = await supabase
      .from('powerups_usados')
      .select('*')
      .eq('partido_id', partido.id)
    setPowerupsEditando((powerupsData as PowerupUsado[]) || [])
  }

  useEffect(() => {
    if (editando?.usarFechaTorneo && torneo?.created_at) {
      const fechaTorneo = new Date(torneo.created_at).toISOString().slice(0, 10)
      setEditando(ed => (ed && ed.fecha !== fechaTorneo ? { ...ed, fecha: fechaTorneo } : ed))
    }
  }, [editando?.usarFechaTorneo, torneo?.created_at])

  const guardarPartido = async () => {
    if (!editando) return
    setGuardando(true)
    const payload: Record<string, unknown> = {}
    payload.goles_local = editando.goles_local !== '' ? parseInt(editando.goles_local) : null
    payload.goles_visitante = editando.goles_visitante !== '' ? parseInt(editando.goles_visitante) : null
    payload.fecha = editando.fecha ? new Date(editando.fecha + 'T12:00:00').toISOString() : null
    await supabase.from('partidos').update(payload).eq('id', editando.partidoId)
    await fetchData()
    setGuardando(false)
    setEditando(null)
    setPowerupsEditando([])
  }

  // --- Power-ups dentro del modal de editar partido ---
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

  // --- Reiniciar partido ---
  const confirmarReiniciar = (partido: Partido) => {
    setReiniciarModal(partido)
  }

  const ejecutarReinicio = async () => {
    if (!reiniciarModal) return
    const partido = reiniciarModal
  
    const { error: errorGoles } = await supabase
      .from('goles')
      .delete()
      .eq('partido_id', partido.id)
  
    if (errorGoles) {
      console.error('Error eliminando goles:', errorGoles)
      alert('Error eliminando goles: ' + errorGoles.message)
      return
    }
  
    const { error: errorPowerups } = await supabase
      .from('powerups_usados')
      .delete()
      .eq('partido_id', partido.id)
  
    if (errorPowerups) {
      console.error('Error eliminando powerups:', errorPowerups)
      alert('Error eliminando powerups: ' + errorPowerups.message)
      return
    }
    setPowerupsUsados([])
  
    const { data: dataUpdate, error: errorUpdate } = await supabase
      .from('partidos')
      .update({
        goles_local: null,
        goles_visitante: null,
        estado: 'pendiente',
        duracion_segundos: 0,
      })
      .eq('id', partido.id)
      .select()
    
    if (errorUpdate) {
      console.error('Error reiniciando partido:', errorUpdate)
      alert('Error actualizando partido: ' + errorUpdate.message)
      return
    }
  
    if (!dataUpdate || dataUpdate.length === 0) {
      alert('No se pudo reiniciar el partido: sin permisos para actualizar (revisa RLS).')
      return
    }
  
    setJornadas(prev =>
      prev.map(j => ({
        ...j,
        partidos: j.partidos.map(p =>
          p.id === partido.id
            ? { ...p, goles_local: null, goles_visitante: null, estado: 'pendiente', duracion_segundos: 0, jugandose: false }
            : p
        ),
      }))
    )
  
    setReiniciarModal(null)
  }

  // --- Lógica partido en vivo ---
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
    } else {
      setJugando(false)
    }

    const { data: golesData } = await supabase
      .from('goles')
      .select('id, partido_id, equipo_id, minuto, pos_x, pos_y')
      .eq('partido_id', partido.id)
      .order('minuto', { ascending: true })
    setGolesPartido(golesData || [])

    const { data: powerupsData } = await supabase
      .from('powerups_usados')
      .select('*')
      .eq('partido_id', partido.id)
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
    timerRef.current = setInterval(() => {
      setSegundos(Math.floor((Date.now() - inicio) / 1000))
    }, 200)
  }

  const pausarTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const actualizarEstadoVivo = async (nuevoEstado: string, segundosActuales: number) => {
    if (!partidoEnVivo) return
    setEstadoVivo(nuevoEstado)
    const updates: Record<string, unknown> = {
      estado: nuevoEstado,
      duracion_segundos: segundosActuales,
    }
    const { error } = await supabase
      .from('partidos')
      .update(updates)
      .eq('id', partidoEnVivo.id)
  
    if (error) {
      console.error('Error al actualizar estado del partido:', error)
      alert('No se pudo guardar el estado del partido. Revisa los permisos o la estructura de la tabla.')
      return
    }
  
    // Actualizar estado local sin jugandose
    setJornadas(prev =>
      prev.map(j => ({
        ...j,
        partidos: j.partidos.map(p =>
          p.id === partidoEnVivo.id
            ? { ...p, estado: nuevoEstado, duracion_segundos: segundosActuales }
            : p
        ),
      }))
    )
  }

  const iniciarPartido = () => {
    if (!partidoEnVivo) return
    setJugando(true)
    actualizarEstadoVivo('jugando', 0)
    setSegundos(0)
    iniciarTimer(0)
  }

  const pausarPartido = () => {
    if (!partidoEnVivo) return
    setJugando(false)
    pausarTimer()
    actualizarEstadoVivo('pausado', segundos)
  }

  const reanudarPartido = () => {
    if (!partidoEnVivo) return
    setJugando(true)
    actualizarEstadoVivo('jugando', segundos)
    iniciarTimer(segundos)
  }

  const terminarPartido = async () => {
    if (!partidoEnVivo) return
    setJugando(false)
    pausarTimer()
    const tiempoFinal = segundos
    await actualizarEstadoVivo('finalizado', tiempoFinal)
    cerrarEnVivo()
  }

  const actualizarGoles = async (local: number, visitante: number) => {
    if (!partidoEnVivo) return
    setGolesLocalVivo(local)
    setGolesVisitanteVivo(visitante)
    await supabase.from('partidos').update({
      goles_local: local,
      goles_visitante: visitante,
    }).eq('id', partidoEnVivo.id)
    setJornadas(prev =>
      prev.map(j => ({
        ...j,
        partidos: j.partidos.map(p =>
          p.id === partidoEnVivo.id
            ? { ...p, goles_local: local, goles_visitante: visitante }
            : p
        ),
      }))
    )
  }

  // Registrar gol con coordenadas
  const registrarGolConPosicion = async (equipoId: string, posX: number, posY: number) => {
    if (!partidoEnVivo || estadoVivo !== 'jugando') return
    const segundo = segundos
    const { data: nuevoGol, error } = await supabase
      .from('goles')
      .insert({
        partido_id: partidoEnVivo.id,
        equipo_id: equipoId,
        minuto: segundo,
        pos_x: posX,
        pos_y: posY,
      })
      .select('id, partido_id, equipo_id, minuto, pos_x, pos_y')
      .single()

    if (!error && nuevoGol) {
      setGolesPartido(prev => [...prev, nuevoGol as Gol])
    } else {
      console.error('Error al insertar gol:', error)
    }
  }

  const confirmarGolConPosicion = async () => {
    if (!pendingGoal) return
    const { equipoId } = pendingGoal
    const esLocal = partidoEnVivo?.equipo_local_id === equipoId
    const esVisitante = partidoEnVivo?.equipo_visitante_id === equipoId
    if (esLocal) {
      const nuevoLocal = golesLocalVivo + 1
      await actualizarGoles(nuevoLocal, golesVisitanteVivo)
    } else if (esVisitante) {
      const nuevoVisitante = golesVisitanteVivo + 1
      await actualizarGoles(golesLocalVivo, nuevoVisitante)
    }
    await registrarGolConPosicion(equipoId, markerPos.x, markerPos.y)
    setShowFieldModal(false)
    setPendingGoal(null)
  }

  // Abrir modal de campo para un gol pendiente
  const abrirModalCampo = (equipoId: string) => {
    if (!partidoEnVivo || estadoVivo !== 'jugando') return
    setPendingGoal({ equipoId })
    setMarkerPos({ x: 50, y: 50 }) // centro por defecto
    setShowFieldModal(true)
  }

  // Manejo del clic en el campo
  const handleFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!fieldRef.current) return
    const rect = fieldRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setMarkerPos({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) })
  }

  // Arrastre del marcador
  const handleMarkerMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDragging(true)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging || !fieldRef.current) return
    const rect = fieldRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setMarkerPos({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) })
  }

  const handleMouseUp = () => {
    setDragging(false)
  }

  // Efecto para escuchar eventos globales de mouse
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
    const { data: goles } = await supabase
      .from('goles')
      .select('id, minuto')
      .eq('partido_id', partidoEnVivo.id)
      .eq('equipo_id', equipoId)
      .order('minuto', { ascending: false })
      .limit(1)

    if (goles && goles.length > 0) {
      const gol = goles[0]
      await supabase.from('goles').delete().eq('id', gol.id)
      setGolesPartido(prev => prev.filter(g => g.id !== gol.id))
    }
  }

  const usarPowerup = async (equipoId: string, powerupId: string) => {
    if (!partidoEnVivo || estadoVivo !== 'jugando') return
    const existente = powerupsUsados.find(
      pu => pu.equipo_id === equipoId && pu.powerup_id === powerupId
    )
    if (existente) {
      const nuevaCantidad = existente.cantidad + 1
      await supabase
        .from('powerups_usados')
        .update({ cantidad: nuevaCantidad })
        .eq('id', existente.id)
      setPowerupsUsados(prev =>
        prev.map(pu => (pu.id === existente.id ? { ...pu, cantidad: nuevaCantidad } : pu))
      )
    } else {
      const { data } = await supabase
        .from('powerups_usados')
        .insert({
          partido_id: partidoEnVivo.id,
          equipo_id: equipoId,
          powerup_id: powerupId,
          cantidad: 1,
        })
        .select()
        .single()
      if (data) setPowerupsUsados(prev => [...prev, data as PowerupUsado])
    }
  }

  // Los botones "+" ahora abren el modal de campo
  const sumarGolLocal = () => {
    if (!partidoEnVivo) return
    abrirModalCampo(partidoEnVivo.equipo_local_id)
  }

  const restarGolLocal = async () => {
    if (!partidoEnVivo || estadoVivo !== 'jugando') return
    if (golesLocalVivo > 0) {
      const nuevoLocal = golesLocalVivo - 1
      await actualizarGoles(nuevoLocal, golesVisitanteVivo)
      await eliminarUltimoGol(partidoEnVivo.equipo_local_id)
    }
  }

  const sumarGolVisitante = () => {
    if (!partidoEnVivo) return
    abrirModalCampo(partidoEnVivo.equipo_visitante_id)
  }

  const restarGolVisitante = async () => {
    if (!partidoEnVivo || estadoVivo !== 'jugando') return
    if (golesVisitanteVivo > 0) {
      const nuevoVisitante = golesVisitanteVivo - 1
      await actualizarGoles(golesLocalVivo, nuevoVisitante)
      await eliminarUltimoGol(partidoEnVivo.equipo_visitante_id)
    }
  }

  const formatearTiempo = (totalSegundos: number) => {
    const mins = Math.floor(totalSegundos / 60)
    const secs = totalSegundos % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const equipoById = useCallback((id: string) => equipos.find(e => e.id === id), [equipos])
  const tienePartidos = jornadas.length > 0

  if (!torneo) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px', padding: '40px', textAlign: 'center' }}>
        Selecciona un torneo en el menú lateral.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calendar size={24} color="var(--color-accent)" />
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-textWH)' }}>
            Partidos de grupo
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              setManualJornadas(crearManualJornadasVacias(equipos.length))
              setJornadaManualActiva(0)
              setManualModal(true)
            }}
            disabled={generando || equipos.length < 2}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '11px',
              background: 'var(--color-border)', color: 'var(--color-textWH)',
              fontWeight: '600', fontSize: '14px',
              border: '1px solid transparent',
              cursor: (generando || equipos.length < 2) ? 'not-allowed' : 'pointer',
              opacity: (generando || equipos.length < 2) ? 0.7 : 1,
            }}
          >
            <Settings size={16} />
            Manual
          </button>
          <button
            onClick={() => tienePartidos ? setConfirmModal(true) : generarPartidos(true)}
            disabled={generando || equipos.length < 2}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '11px',
              background: 'var(--color-border)', color: 'var(--color-textWH)',
              fontWeight: '600', fontSize: '14px',
              border: '1px solid transparent',
              cursor: (generando || equipos.length < 2) ? 'not-allowed' : 'pointer',
              opacity: (generando || equipos.length < 2) ? 0.7 : 1,
            }}
          >
            {generando ? <Loader2 size={16} className="spin" /> : <Shuffle size={16} />}
            {tienePartidos ? 'Remezclar' : 'Generar fixture'}
          </button>
        </div>
      </div>

      {equipos.length < 2 && (
        <div style={{
          padding: '16px 20px', borderRadius: '12px',
          background: 'rgba(255,200,0,0.07)', border: '1px solid rgba(255,200,0,0.2)',
          color: 'rgba(255,200,0,0.8)', fontSize: '13px',
        }}>
          Este torneo necesita al menos 2 equipos para generar el fixture.
        </div>
      )}

      {equipos.length >= 2 && (() => {
        const { jornadas: totalJornadas, partidosPorJornada } = calcularDimensionesFixture(equipos.length)
        return (
          <div style={{
            padding: '12px 20px', borderRadius: '12px',
            background: 'rgba(0,200,140,0.06)', border: '1px solid rgba(0,200,140,0.2)',
            color: 'rgba(255,255,255,0.6)', fontSize: '13px',
          }}>
            Con <strong style={{ color: 'var(--color-textWH)' }}>{equipos.length}</strong> equipos se generarán{' '}
            <strong style={{ color: 'var(--color-accent)' }}>{totalJornadas}</strong> jornadas de{' '}
            <strong style={{ color: 'var(--color-accent)' }}>{partidosPorJornada}</strong> partido{partidosPorJornada !== 1 ? 's' : ''} cada una
            {equipos.length % 2 !== 0 && ' (un equipo descansa por jornada, al ser número impar)'}.
          </div>
        )
      })()}

      {/* Lista de jornadas */}
      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Cargando...</div>
      ) : !tienePartidos ? (
        <div style={{
          padding: '40px', borderRadius: '16px',
          border: '2px dashed var(--color-border)',
          textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px',
        }}>
          No hay partidos generados. Usa "Generar fixture" o "Manual" para crear las jornadas.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '10px',
        }}>
          {jornadas.map(jornada => {
            const jugados = jornada.partidos.filter(p => p.goles_local != null).length
            return (
              <div key={jornada.id} style={{
                borderRadius: '12px', overflow: 'hidden',
                border: '2px solid var(--color-border)',
                background: 'var(--color-background)',
                transition: 'border-color 0.2s',
              }}>
                <div style={{
                  padding: '14px 20px',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'rgba(0, 93, 67, 1)',
                }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '8px',
                    background: 'var(--color-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Calendar size={18} color="var(--color-accent)" />
                  </div>
                  <div>
                    <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--color-textWH)', margin: 0 }}>
                      Jornada {jornada.numero}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--color-accent)', marginTop: '2px', marginBottom: 0 }}>
                      {jugados}/{jornada.partidos.length} jugados
                    </p>
                  </div>
                </div>

                <div style={{ background: 'var(--color-background)' }}>
                  {jornada.partidos.map((partido, idx) => {
                    const local = equipoById(partido.equipo_local_id)
                    const visitante = equipoById(partido.equipo_visitante_id)
                    const jugado = partido.goles_local != null && partido.goles_visitante != null
                    const enVivo = partido.estado === 'jugando' || partido.estado === 'pausado'

                    return (
                      <div
                        key={partido.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '14px 20px',
                          borderBottom: idx < jornada.partidos.length - 1 ? '1px solid var(--color-border)' : 'none',
                        }}
                      >
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-textWH)', textAlign: 'right' }}>
                            {local?.nombre ?? '—'}
                          </span>
                          {local?.escudo_url
                            ? <img src={local.escudo_url} alt="" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
                            : <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--color-border)' }} />
                          }
                        </div>

                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '6px 14px', borderRadius: '10px',
                          background: enVivo ? 'rgba(255,200,0,0.12)' : (jugado ? 'rgba(0,200,140,0.12)' : 'var(--color-background)'),
                          border: `1px solid ${enVivo ? 'rgba(255,200,0,0.3)' : (jugado ? 'rgba(0,200,140,0.3)' : 'var(--color-border)')}`,
                          minWidth: '70px', justifyContent: 'center',
                          position: 'relative',
                        }}>
                          {enVivo && (
                            <span style={{
                              position: 'absolute', top: '-4px', right: '-4px',
                              width: '8px', height: '8px', borderRadius: '50%',
                              background: '#FFC800', boxShadow: '0 0 6px #FFC800',
                            }} />
                          )}
                          <span style={{ fontSize: '18px', fontWeight: '800', color: (jugado || enVivo) ? (enVivo ? 'rgba(255,200,0,0.9)' : (partido.goles_local! > partido.goles_visitante! ? 'var(--color-accent)' : 'var(--color-error)')) : 'rgba(255,255,255,0.2)', minWidth: '18px', textAlign: 'center' }}>
                            {jugado || enVivo ? (partido.goles_local ?? 0) : '—'}
                          </span>
                          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)', fontWeight: '600' }}>:</span>
                          <span style={{ fontSize: '18px', fontWeight: '800', color: (jugado || enVivo) ? (enVivo ? 'rgba(255,200,0,0.9)' : (partido.goles_visitante! > partido.goles_local! ? 'var(--color-accent)' : 'var(--color-error)')) : 'rgba(255,255,255,0.2)', minWidth: '18px', textAlign: 'center' }}>
                            {jugado || enVivo ? (partido.goles_visitante ?? 0) : '—'}
                          </span>
                        </div>

                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {visitante?.escudo_url
                            ? <img src={visitante.escudo_url} alt="" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
                            : <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--color-border)' }} />
                          }
                          <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-textWH)' }}>
                            {visitante?.nombre ?? '—'}
                          </span>
                        </div>

                        {/* Botones de acción (tres) */}
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          <button
                            onClick={() => abrirEnVivo(partido)}
                            title="Panel en vivo"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: '34px', height: '34px', borderRadius: '8px',
                              background: enVivo ? 'rgba(255,200,0,0.2)' : 'var(--color-border)',
                              border: enVivo ? '1px solid rgba(255,200,0,0.5)' : '1px solid transparent',
                              color: enVivo ? '#FFC800' : 'rgba(255,255,255,1)',
                              cursor: 'pointer',
                            }}
                          >
                            <Play size={15} strokeWidth={3} />
                          </button>
                          <button
                            onClick={() => abrirEditar(partido)}
                            title="Editar partido"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: '34px', height: '34px', borderRadius: '8px',
                              background: 'var(--color-border)', border: '1px solid transparent',
                              color: 'rgba(255,255,255,1)', cursor: 'pointer',
                            }}
                          >
                            <Edit3 size={15} strokeWidth={3} />
                          </button>
                          <button
                            onClick={() => confirmarReiniciar(partido)}
                            title="Reiniciar partido"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: '34px', height: '34px', borderRadius: '8px',
                              background: 'rgba(220,50,50,0.2)',
                              border: '1px solid rgba(220,50,50,0.7)',
                              color: 'var(--color-error)',
                              cursor: 'pointer',
                            }}
                          >
                            <RotateCcw size={15} strokeWidth={3} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal confirmar remezcla */}
      {confirmModal && (
        <div style={OVERLAY} onClick={() => setConfirmModal(false)}>
          <div style={{ ...MODAL, maxWidth: '360px', gap: '16px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shuffle size={18} color="var(--color-accent)" />
              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>
                Remezclar fixture
              </span>
            </div>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              Esto borrará todas las jornadas y resultados actuales y generará un fixture nuevo. ¿Continuar?
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setConfirmModal(false)}
                style={{
                  flex: 1, padding: '11px', borderRadius: '10px',
                  background: 'transparent', border: '1px solid var(--color-border)',
                  color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => generarPartidos(true)}
                disabled={generando}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '11px', borderRadius: '10px',
                  background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)',
                  color: 'var(--color-error)', fontSize: '14px', fontWeight: '700',
                  cursor: generando ? 'not-allowed' : 'pointer',
                  opacity: generando ? 0.7 : 1,
                }}
              >
                {generando ? <Loader2 size={15} className="spin" /> : <Shuffle size={15} />}
                Remezclar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar partido */}
      {editando && (() => {
        const partido = jornadas.flatMap(j => j.partidos).find(p => p.id === editando.partidoId)
        const local = partido ? equipoById(partido.equipo_local_id) : null
        const visitante = partido ? equipoById(partido.equipo_visitante_id) : null
        return (
          <div style={OVERLAY} onClick={() => { setEditando(null); setPowerupsEditando([]) }}>
            <div style={MODAL} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>
                  Editar partido
                </span>
                <button onClick={() => { setEditando(null); setPowerupsEditando([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {local?.escudo_url
                    ? <img src={local.escudo_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                    : <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--color-border)' }} />
                  }
                  <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-textWH)' }}>{local?.nombre}</span>
                </div>
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)', fontWeight: '600' }}>vs</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-textWH)' }}>{visitante?.nombre}</span>
                  {visitante?.escudo_url
                    ? <img src={visitante.escudo_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                    : <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--color-border)' }} />
                  }
                </div>
              </div>

              <div>
                <p style={LABEL}>Resultado</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    style={{ ...INPUT, textAlign: 'center', fontWeight: '700', fontSize: '20px' }}
                    type="number"
                    min={0}
                    placeholder="—"
                    value={editando.goles_local}
                    onChange={e => setEditando(ed => ed ? { ...ed, goles_local: e.target.value } : ed)}
                  />
                  <span style={{ fontSize: '18px', color: 'rgba(255,255,255,0.3)', fontWeight: '700', flexShrink: 0 }}>:</span>
                  <input
                    style={{ ...INPUT, textAlign: 'center', fontWeight: '700', fontSize: '20px' }}
                    type="number"
                    min={0}
                    placeholder="—"
                    value={editando.goles_visitante}
                    onChange={e => setEditando(ed => ed ? { ...ed, goles_visitante: e.target.value } : ed)}
                  />
                </div>
              </div>

              <div>
                <p style={LABEL}>Fecha</p>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '8px', cursor: 'pointer', userSelect: 'none',
                }}>
                  <input
                    type="checkbox"
                    checked={editando.usarFechaTorneo}
                    onChange={e => {
                      const marcado = e.target.checked
                      setEditando(ed => {
                        if (!ed) return ed
                        if (marcado && torneo?.created_at) {
                          return {
                            ...ed,
                            usarFechaTorneo: true,
                            fecha: new Date(torneo.created_at).toISOString().slice(0, 10),
                          }
                        }
                        return { ...ed, usarFechaTorneo: marcado }
                      })
                    }}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-accent)' }}
                  />
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                    Usar fecha del torneo
                  </span>
                </label>
                <input
                  style={{ ...INPUT, opacity: editando.usarFechaTorneo ? 0.6 : 1 }}
                  type="date"
                  disabled={editando.usarFechaTorneo}
                  value={editando.fecha}
                  onChange={e => setEditando(ed => ed ? { ...ed, fecha: e.target.value } : ed)}
                />
              </div>

              {/* Power-ups del partido */}
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
                              <button
                                onClick={() => restarPowerupEditando(pu)}
                                title="Quitar uno"
                                style={{
                                  width: '20px', height: '20px', borderRadius: '5px',
                                  background: 'rgba(255,200,0,0.15)', border: 'none',
                                  color: '#FFC800', fontSize: '13px', fontWeight: '700',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                −
                              </button>
                              <button
                                onClick={() => eliminarPowerupEditando(pu)}
                                title="Eliminar power-up"
                                style={{
                                  width: '20px', height: '20px', borderRadius: '5px',
                                  background: 'rgba(220,50,50,0.15)', border: 'none',
                                  color: 'var(--color-error)', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                <X size={12} />
                              </button>
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
                              <button
                                onClick={() => restarPowerupEditando(pu)}
                                title="Quitar uno"
                                style={{
                                  width: '20px', height: '20px', borderRadius: '5px',
                                  background: 'rgba(255,200,0,0.15)', border: 'none',
                                  color: '#FFC800', fontSize: '13px', fontWeight: '700',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                −
                              </button>
                              <button
                                onClick={() => eliminarPowerupEditando(pu)}
                                title="Eliminar power-up"
                                style={{
                                  width: '20px', height: '20px', borderRadius: '5px',
                                  background: 'rgba(220,50,50,0.15)', border: 'none',
                                  color: 'var(--color-error)', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={guardarPartido}
                disabled={guardando}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px', borderRadius: '11px',
                  background: 'var(--color-accent)', color: 'var(--color-bgdark)',
                  fontWeight: '700', fontSize: '14px', border: 'none',
                  cursor: guardando ? 'not-allowed' : 'pointer',
                  opacity: guardando ? 0.7 : 1,
                }}
              >
                {guardando ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                Guardar
              </button>
            </div>
          </div>
        )
      })()}

      {/* Modal seleccionar power-up a agregar (dentro de editar partido) */}
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
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              marginTop: '8px',
            }}>
              {powerupsCatalogo.map(pu => (
                <button
                  key={pu.id}
                  onClick={() => {
                    usarPowerupEditando(modalPowerupEditar.equipoId, pu.id)
                    setModalPowerupEditar(null)
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
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

      {/* Modal partido en vivo */}
      {partidoEnVivo && (() => {
        const local = equipoById(partidoEnVivo.equipo_local_id)
        const visitante = equipoById(partidoEnVivo.equipo_visitante_id)
        const finalizado = estadoVivo === 'finalizado'
        const golesLocalList = golesPartido
          .filter(g => g.equipo_id === partidoEnVivo.equipo_local_id)
          .map(g => formatearTiempo(g.minuto))
        const golesVisitanteList = golesPartido
          .filter(g => g.equipo_id === partidoEnVivo.equipo_visitante_id)
          .map(g => formatearTiempo(g.minuto))

        return (
          <div style={OVERLAY}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                ...MODAL,
                maxWidth: '700px',
                gap: '24px',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: '700', fontSize: '18px', color: 'var(--color-textWH)' }}>
                  En vivo
                </span>
                <button
                  onClick={cerrarEnVivo}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Barra de control */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {estadoVivo === 'pendiente' && (
                    <button
                      onClick={iniciarPartido}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 20px', borderRadius: '11px',
                        background: 'rgba(0,200,140,0.15)',
                        border: '1px solid rgba(0,200,140,0.4)',
                        color: 'var(--color-accent)',
                        fontWeight: '600', fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      <Play size={16} />
                      Iniciar
                    </button>
                  )}
                  {estadoVivo === 'jugando' && (
                    <>
                      <button
                        onClick={pausarPartido}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background: 'rgba(255,200,0,0.15)',
                          border: '1px solid rgba(255,200,0,0.4)',
                          color: '#FFC800',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Pause size={18} />
                      </button>
                      <button
                        onClick={terminarPartido}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background: 'rgba(220,50,50,0.15)',
                          border: '1px solid rgba(220,50,50,0.4)',
                          color: 'var(--color-error)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Square size={18} />
                      </button>
                    </>
                  )}
                  {estadoVivo === 'pausado' && (
                    <>
                      <button
                        onClick={reanudarPartido}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '10px 20px', borderRadius: '11px',
                          background: 'rgba(0,200,140,0.15)',
                          border: '1px solid rgba(0,200,140,0.4)',
                          color: 'var(--color-accent)',
                          fontWeight: '600', fontSize: '14px',
                          cursor: 'pointer',
                        }}
                      >
                        <Play size={16} />
                        Reanudar
                      </button>
                      <button
                        onClick={terminarPartido}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background: 'rgba(220,50,50,0.15)',
                          border: '1px solid rgba(220,50,50,0.4)',
                          color: 'var(--color-error)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Square size={18} />
                      </button>
                    </>
                  )}
                  {finalizado && (
                    <span style={{ color: 'var(--color-accent)', fontWeight: '600' }}>
                      Partido finalizado
                    </span>
                  )}
                </div>
                <div style={{
                  position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                  fontSize: '25px', fontWeight: '700', color: 'var(--color-textWH)',
                  fontFamily: 'monospace', letterSpacing: '2px',
                  pointerEvents: 'none',
                }}>
                  {formatearTiempo(segundos)}
                </div>
                {/* Spacer derecho para equilibrar */}
                <div style={{ visibility: 'hidden', fontSize: '0px', fontFamily: 'monospace' }}>00:00</div>
              </div>

              {/* Marcador con equipos */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '0px' }}>
                {/* Local */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flex: 1 }}>
                  {local?.escudo_url
                    ? <img src={local.escudo_url} alt="" style={{ width: '100px', height: '100px', objectFit: 'contain' }} />
                    : <div style={{ width: '100px', height: '100px', borderRadius: '12px', background: 'var(--color-border)' }} />
                  }
                  <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-textWH)', textAlign: 'center' }}>
                    {local?.nombre ?? '—'}
                  </span>
                  {!finalizado && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '5px', marginBottom: '5px'}}>
                      <button
                        onClick={restarGolLocal}
                        style={{
                          width: '40px', height: '40px', borderRadius: '10px',
                          background: 'rgba(220,50,50,0.2)', border: '1px solid rgba(220,50,50,0.4)',
                          color: 'var(--color-error)', fontSize: '20px', fontWeight: '700',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        −
                      </button>
                      <button
                        onClick={sumarGolLocal}
                        style={{
                          width: '40px', height: '40px', borderRadius: '10px',
                          background: 'rgba(0,200,140,0.2)', border: '1px solid rgba(0,200,140,0.4)',
                          color: 'var(--color-accent)', fontSize: '20px', fontWeight: '700',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        +
                      </button>
                      <button
                        onClick={() => setModalPowerup({ equipoId: partidoEnVivo.equipo_local_id, equipoNombre: local?.nombre ?? '' })}
                        title="Usar power-up"
                        style={{
                          width: '40px', height: '40px', borderRadius: '10px',
                          background: 'rgba(255,200,0,0.2)', border: '1px solid rgba(255,200,0,0.4)',
                          color: '#FFC800', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Zap size={18} />
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px'}}>
                    {golesLocalList.map((t, i) => (
                      <span key={i} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                        ⚽ {t}
                      </span>
                    ))}
                  </div>
                  {/* Power-ups usados por el local */}
                  {powerupsUsados.filter(pu => pu.equipo_id === partidoEnVivo.equipo_local_id).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                      {powerupsUsados
                        .filter(pu => pu.equipo_id === partidoEnVivo.equipo_local_id)
                        .map(pu => {
                          const cat = powerupsCatalogo.find(c => c.id === pu.powerup_id)
                          if (!cat) return null
                          return (
                            <div key={pu.id} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '3px' }}>
                              <img src={POWERUP_IMAGES[cat.nombre] ?? ''} alt={cat.nombre} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                              <span style={{ fontSize: '12px', color: '#FFC800', fontWeight: 700 }}>x{pu.cantidad}</span>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>

                {/* Números del marcador */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingTop: '15px' }}>
                  <span style={{
                    fontSize: '56px', fontWeight: '800', color: 'var(--color-textWH)',
                    minWidth: '60px', textAlign: 'center',
                  }}>
                    {golesLocalVivo}
                  </span>
                  <span style={{ fontSize: '40px', color: 'rgba(255,255,255,0.3)', fontWeight: '600' }}>:</span>
                  <span style={{
                    fontSize: '56px', fontWeight: '800', color: 'var(--color-textWH)',
                    minWidth: '60px', textAlign: 'center',
                  }}>
                    {golesVisitanteVivo}
                  </span>
                </div>

                {/* Visitante */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flex: 1 }}>
                  {visitante?.escudo_url
                    ? <img src={visitante.escudo_url} alt="" style={{ width: '100px', height: '100px', objectFit: 'contain' }} />
                    : <div style={{ width: '100px', height: '100px', borderRadius: '12px', background: 'var(--color-border)' }} />
                  }
                  <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-textWH)', textAlign: 'center' }}>
                    {visitante?.nombre ?? '—'}
                  </span>
                  {!finalizado && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '5px', marginBottom: '5px'}}>
                      <button
                        onClick={restarGolVisitante}
                        style={{
                          width: '40px', height: '40px', borderRadius: '10px',
                          background: 'rgba(220,50,50,0.2)', border: '1px solid rgba(220,50,50,0.4)',
                          color: 'var(--color-error)', fontSize: '20px', fontWeight: '700',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        −
                      </button>
                      <button
                        onClick={sumarGolVisitante}
                        style={{
                          width: '40px', height: '40px', borderRadius: '10px',
                          background: 'rgba(0,200,140,0.2)', border: '1px solid rgba(0,200,140,0.4)',
                          color: 'var(--color-accent)', fontSize: '20px', fontWeight: '700',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        +
                      </button>
                      <button
                        onClick={() => setModalPowerup({ equipoId: partidoEnVivo.equipo_visitante_id, equipoNombre: visitante?.nombre ?? '' })}
                        title="Usar power-up"
                        style={{
                          width: '40px', height: '40px', borderRadius: '10px',
                          background: 'rgba(255,200,0,0.2)', border: '1px solid rgba(255,200,0,0.4)',
                          color: '#FFC800', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Zap size={18} />
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px'}}>
                    {golesVisitanteList.map((t, i) => (
                      <span key={i} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                        ⚽ {t}
                      </span>
                    ))}
                  </div>
                  {/* Power-ups usados por el visitante */}
                  {powerupsUsados.filter(pu => pu.equipo_id === partidoEnVivo.equipo_visitante_id).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                      {powerupsUsados
                        .filter(pu => pu.equipo_id === partidoEnVivo.equipo_visitante_id)
                        .map(pu => {
                          const cat = powerupsCatalogo.find(c => c.id === pu.powerup_id)
                          if (!cat) return null
                          return (
                            <div key={pu.id} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '3px' }}>
                              <img src={POWERUP_IMAGES[cat.nombre] ?? ''} alt={cat.nombre} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                              <span style={{ fontSize: '12px', color: '#FFC800', fontWeight: 700 }}>x{pu.cantidad}</span>
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

      {/* Modal selección de power-up */}
      {modalPowerup && (
        <div style={OVERLAY} onClick={() => setModalPowerup(null)}>
          <div style={{ ...MODAL, maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-textWH)' }}>
                Power-ups para {modalPowerup.equipoNombre}
              </span>
              <button
                onClick={() => setModalPowerup(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              marginTop: '8px',
            }}>
              {powerupsCatalogo.map(pu => (
                <button
                  key={pu.id}
                  onClick={() => {
                    usarPowerup(modalPowerup.equipoId, pu.id)
                    setModalPowerup(null)
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
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

      {/* ─── Modal de posición de gol en el campo ─── */}
      {showFieldModal && pendingGoal && (() => {
        const teamColorHex = equipos.find(e => e.id === pendingGoal.equipoId)?.color_hex || '#FF0000'
        const darker = darkenHex(teamColorHex, 0.7)

        return (
          <div style={OVERLAY} onClick={() => setShowFieldModal(false)}>
            <div
              style={{
                ...MODAL,
                maxWidth: '1200px',
                padding: '16px',
                gap: '12px',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => setShowFieldModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
                >
                  <X size={16} />
                </button>
              </div>
              <div
                ref={fieldRef}
                onClick={handleFieldClick}
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16/9',
                  backgroundImage: `url(${canchaImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'crosshair',
                  border: '0px solid var(--color-border)',
                }}
              >
                {/* Marcador */}
                <div
                  onMouseDown={handleMarkerMouseDown}
                  style={{
                    position: 'absolute',
                    left: `${markerPos.x}%`,
                    top: `${markerPos.y}%`,
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: darker,
                    border: `5px solid ${teamColorHex}`,
                    transform: 'translate(-50%, -50%)',
                    cursor: 'grab',
                    boxShadow: `0 0 20px ${teamColorHex}`,
                    zIndex: 10,
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={confirmarGolConPosicion}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    borderRadius: '11px',
                    background: 'var(--color-accent)',
                    border: 'none',
                    color: 'var(--color-bgdark)',
                    fontWeight: '700',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  <Save size={16} />
                  Confirmar gol
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal confirmar reinicio */}
      {reiniciarModal && (
        <div style={OVERLAY} onClick={() => setReiniciarModal(null)}>
          <div style={{ ...MODAL, maxWidth: '360px', gap: '16px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <RotateCcw size={18} color="var(--color-error)" />
              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>
                Reiniciar partido
              </span>
            </div>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              Esto borrará todos los goles y datos en vivo del partido. ¿Continuar?
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setReiniciarModal(null)}
                style={{
                  flex: 1, padding: '11px', borderRadius: '10px',
                  background: 'transparent', border: '1px solid var(--color-border)',
                  color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarReinicio}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '11px', borderRadius: '10px',
                  background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)',
                  color: 'var(--color-error)', fontSize: '14px', fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={15} />
                Reiniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal fixture manual */}
      {manualModal && (
        <div style={OVERLAY} onClick={() => setManualModal(false)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>
                Fixture manual
              </span>
              <button onClick={() => setManualModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', flexWrap: 'wrap' }}>
              {manualJornadas.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setJornadaManualActiva(idx)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: jornadaManualActiva === idx ? 'var(--color-accent)' : 'var(--color-border)',
                    background: jornadaManualActiva === idx ? 'rgba(0,200,140,0.1)' : 'transparent',
                    color: jornadaManualActiva === idx ? 'var(--color-accent)' : 'rgba(255,255,255,0.6)',
                    fontWeight: '600',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Jornada {idx + 1}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {manualJornadas[jornadaManualActiva]?.map((match, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <select
                    value={match.local}
                    onChange={e => {
                      const nuevo = [...manualJornadas]
                      nuevo[jornadaManualActiva][idx] = { ...match, local: e.target.value }
                      setManualJornadas(nuevo)
                    }}
                    style={SELECT_STYLE}
                  >
                    <option value="">Local</option>
                    {equipos.map(eq => (
                      <option key={eq.id} value={eq.id}>{eq.nombre}</option>
                    ))}
                  </select>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: '600' }}>vs</span>
                  <select
                    value={match.visitante}
                    onChange={e => {
                      const nuevo = [...manualJornadas]
                      nuevo[jornadaManualActiva][idx] = { ...match, visitante: e.target.value }
                      setManualJornadas(nuevo)
                    }}
                    style={SELECT_STYLE}
                  >
                    <option value="">Visitante</option>
                    {equipos.map(eq => (
                      <option key={eq.id} value={eq.id}>{eq.nombre}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <button
              onClick={guardarFixtureManual}
              disabled={generando}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', borderRadius: '11px',
                background: 'var(--color-accent)', color: 'var(--color-bgdark)',
                fontWeight: '700', fontSize: '14px', border: 'none',
                cursor: generando ? 'not-allowed' : 'pointer',
                opacity: generando ? 0.7 : 1,
              }}
            >
              {generando ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Guardar fixture
            </button>
          </div>
        </div>
      )}
    </div>
  )
}