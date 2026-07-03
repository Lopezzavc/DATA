import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Loader2, Save, Edit3, X, Play, Pause, Square, RotateCcw, Zap, Trophy
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
  equipo_local_id: string
  equipo_visitante_id: string
  goles_local: number | null
  goles_visitante: number | null
  fecha: string | null
  estado: string
  duracion_segundos: number
  ronda: string
  grupo_eliminatorio: number | null
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

export default function Eliminatorias() {
  const { torneoSeleccionado } = useTorneo()
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [partidosEliminatorios, setPartidosEliminatorios] = useState<Partido[]>([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [editando, setEditando] = useState<Editando | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmModal, setConfirmModal] = useState(false)

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

  const [showFieldModal, setShowFieldModal] = useState(false)
  const [pendingGoal, setPendingGoal] = useState<{ equipoId: string } | null>(null)
  const [markerPos, setMarkerPos] = useState({ x: 50, y: 50 })
  const [dragging, setDragging] = useState(false)
  const fieldRef = useRef<HTMLDivElement>(null)

  const torneo = torneoSeleccionado

  // ─── Carga inicial de datos ───
  const fetchData = async () => {
    if (!torneo) return
    setLoading(true)

    // Equipos del torneo
    const { data: eqTorneo } = await supabase
      .from('equipos_torneo').select('equipo_id').eq('torneo_id', torneo.id)
    if (eqTorneo && eqTorneo.length > 0) {
      const ids = eqTorneo.map(e => e.equipo_id)
      const { data: eqs } = await supabase
        .from('equipos').select('id, nombre, escudo_url, color_hex').in('id', ids)
      if (eqs) setEquipos(eqs)
    }

    // Partidos eliminatorios ya existentes
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

  // ─── Lógica para obtener los 4 primeros de la fase de grupos ───
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

  // ─── Generar partidos eliminatorios (semifinales) ───
  const generarPartidos = async () => {
    if (!torneo || equipos.length < 4) return
    setGenerando(true)

    try {
      const top4 = await obtenerTop4()
      if (top4.length < 4) {
        alert('No se pudieron determinar los 4 primeros equipos. Asegúrate de que existan partidos de grupo jugados.')
        setGenerando(false)
        return
      }

      // Eliminar partidos anteriores de eliminatorias
      await supabase.from('partidos').delete().eq('torneo_id', torneo.id).eq('fase', 'eliminatorias')

      const llave1 = { local: top4[0].id, visitante: top4[2].id } // 1º vs 3º
      const llave2 = { local: top4[1].id, visitante: top4[3].id } // 2º vs 4º

      const insertarPartido = async (
        localId: string,
        visitanteId: string,
        grupo: number
      ) => {
        const { error } = await supabase.from('partidos').insert({
          torneo_id: torneo.id,
          fase: 'eliminatorias',
          ronda: 'semifinal',          // ✅ valor que sí respeta el CHECK
          grupo_eliminatorio: grupo,
          equipo_local_id: localId,
          equipo_visitante_id: visitanteId,
          estado: 'pendiente',
          duracion_segundos: 0,
        })
        if (error) throw error
      }

      // Llave 1
      await insertarPartido(llave1.local, llave1.visitante, 1) // ida
      await insertarPartido(llave1.visitante, llave1.local, 1) // vuelta

      // Llave 2
      await insertarPartido(llave2.local, llave2.visitante, 2) // ida
      await insertarPartido(llave2.visitante, llave2.local, 2) // vuelta

      setConfirmModal(false)
      await fetchData()
    } catch (error: any) {
      console.error('Error al generar eliminatorias:', error)
      alert(`Error al generar: ${error?.message || 'Error desconocido'}`)
    } finally {
      setGenerando(false)
    }
  }

  // ─── Generar final ───
  const generarFinal = async () => {
    if (!torneo) return

    // Calcular ganador de una llave
    const calcularGanadorLlave = (partidosLlave: Partido[]): string | null => {
      if (partidosLlave.length !== 2) return null
      // Identificamos ida y vuelta: el partido cuyo local coincide con el "primer equipo" de la llave es la ida
      const primerEquipo = partidosLlave[0].equipo_local_id   // asumimos que el primer partido insertado es la ida
      const ida = partidosLlave.find(p => p.equipo_local_id === primerEquipo)!
      const vuelta = partidosLlave.find(p => p.equipo_local_id !== primerEquipo)!
      if (!ida || !vuelta ||
          ida.goles_local == null || ida.goles_visitante == null ||
          vuelta.goles_local == null || vuelta.goles_visitante == null) return null

      const equipoA = ida.equipo_local_id       // equipo que juega como local en la ida
      const equipoB = ida.equipo_visitante_id
      const golesA = (ida.goles_local) + (vuelta.goles_visitante)
      const golesB = (ida.goles_visitante) + (vuelta.goles_local)

      if (golesA > golesB) return equipoA
      if (golesB > golesA) return equipoB
      // empate global → goles de visitante
      const golesVisitanteA = vuelta.goles_visitante
      const golesVisitanteB = ida.goles_visitante
      if (golesVisitanteA > golesVisitanteB) return equipoA
      if (golesVisitanteB > golesVisitanteA) return equipoB
      return null // empate absoluto (caso raro)
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

  // ─── Funciones de edición, reinicio, etc. ───
  const abrirEditar = (partido: Partido) => {
    const fecha = partido.fecha ? new Date(partido.fecha).toISOString().slice(0, 10) : ''
    setEditando({
      partidoId: partido.id,
      goles_local: partido.goles_local != null ? String(partido.goles_local) : '',
      goles_visitante: partido.goles_visitante != null ? String(partido.goles_visitante) : '',
      fecha,
    })
  }

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
      }).eq('id', partido.id)
      if (error) throw error
      setReiniciarModal(null)
      await fetchData()
    } catch (error: any) {
      console.error('Error al reiniciar:', error)
      alert(`Error al reiniciar: ${error?.message || 'Error desconocido'}`)
    }
  }

  // ─── Panel en vivo (completo, igual que PartidosGrupo) ───
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

  const iniciarPartido = () => { setJugando(true); actualizarEstadoVivo('jugando', 0); setSegundos(0); iniciarTimer(0) }
  const pausarPartido = () => { setJugando(false); pausarTimer(); actualizarEstadoVivo('pausado', segundos) }
  const reanudarPartido = () => { setJugando(true); actualizarEstadoVivo('jugando', segundos); iniciarTimer(segundos) }
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

  // Agrupar partidos por llave
  const llave1 = partidosEliminatorios.filter(p => p.grupo_eliminatorio === 1)
  const llave2 = partidosEliminatorios.filter(p => p.grupo_eliminatorio === 2)
  const final = partidosEliminatorios.find(p => p.ronda === 'final')

  // Función para calcular el global de una llave (ya adaptada a que todos los partidos tienen ronda 'semifinal')
  const getGlobal = (partidosLlave: Partido[]): { local: number; visitante: number } | null => {
    if (partidosLlave.length !== 2) return null
    // La ida es el partido cuyo local es el primer equipo (el cabeza de serie que empezó como local)
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

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Cargando...</div>
      ) : !hayPartidos ? (
        <div style={{
          padding: '40px', borderRadius: '16px',
          border: '2px dashed var(--color-border)',
          textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px',
        }}>
          No hay partidos eliminatorios. Pulsa "Generar partidos eliminatorios" para crearlos.
        </div>
      ) : (
        <>
          {/* Bracket visual */}
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

            {/* Líneas y espacio central */}
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

          {/* Final */}
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
              Se borrarán todos los partidos eliminatorios actuales (incluida la final) y se crearán nuevas semifinales. ¿Continuar?
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

      {editando && (() => {
        const partido = partidosEliminatorios.find(p => p.id === editando.partidoId)
        const local = partido ? equipoById(partido.equipo_local_id) : null
        const visitante = partido ? equipoById(partido.equipo_visitante_id) : null
        return (
          <div style={OVERLAY} onClick={() => setEditando(null)}>
            <div style={MODAL} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>Editar partido</span>
                <button onClick={() => setEditando(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {local?.escudo_url ? <img src={local.escudo_url} style={{ width: 40, height: 40, objectFit: 'contain' }} /> : <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--color-border)' }} />}
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-textWH)' }}>{local?.nombre}</span>
                </div>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>vs</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-textWH)' }}>{visitante?.nombre}</span>
                  {visitante?.escudo_url ? <img src={visitante.escudo_url} style={{ width: 40, height: 40, objectFit: 'contain' }} /> : <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--color-border)' }} />}
                </div>
              </div>
              <div>
                <p style={LABEL}>Resultado</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input style={{ ...INPUT, textAlign: 'center', fontWeight: '700', fontSize: '20px' }} type="number" min={0} placeholder="—" value={editando.goles_local} onChange={e => setEditando(ed => ed ? { ...ed, goles_local: e.target.value } : ed)} />
                  <span style={{ fontSize: '18px', color: 'rgba(255,255,255,0.3)', fontWeight: '700' }}>:</span>
                  <input style={{ ...INPUT, textAlign: 'center', fontWeight: '700', fontSize: '20px' }} type="number" min={0} placeholder="—" value={editando.goles_visitante} onChange={e => setEditando(ed => ed ? { ...ed, goles_visitante: e.target.value } : ed)} />
                </div>
              </div>
              <div>
                <p style={LABEL}>Fecha</p>
                <input style={INPUT} type="date" value={editando.fecha} onChange={e => setEditando(ed => ed ? { ...ed, fecha: e.target.value } : ed)} />
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

      {/* ─── Panel en vivo ─── */}
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

      {/* Modal power‑up */}
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

      {/* Modal campo de gol */}
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