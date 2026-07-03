// src/pages/Public.tsx
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ChevronDown, Trophy, Loader2, Zap, History, Calendar
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

  // ─── Título dinámico de la página (pestaña del navegador) ───
  useEffect(() => {
    const nombre = torneoActivo?.nombre || (torneoActivo ? `Torneo ${torneoActivo.numero}` : '')
    document.title = `Copa DISCORD${nombre ? ` - ${nombre}` : ''}`
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
          .from('equipos').select('id, nombre, escudo_url, color_hex').in('id', ids)
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

        if (equiposList.length > 0) {
          const equipoPowerMap: Record<string, Record<string, number>> = {}
          equiposList.forEach(eq => { equipoPowerMap[eq.id] = {} })
          puUsados?.forEach(pu => {
            if (equipoPowerMap[pu.equipo_id]) {
              equipoPowerMap[pu.equipo_id][pu.powerup_id] = (equipoPowerMap[pu.equipo_id][pu.powerup_id] || 0) + pu.cantidad
            }
          })
          const usage: EquipoPowerups[] = equiposList.map(eq => {
            const powers = equipoPowerMap[eq.id]
            const info: PowerupInfo[] = []
            let total = 0
            Object.entries(powers).forEach(([powerupId, cantidad]) => {
              const cat = catalogo?.find(c => c.id === powerupId)
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
        }
      } else {
        setGoles([])
        setTeamMatches([])
        setPowerupsUsage([])
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

  const tabla = useMemo(() => {
    const statsMap = new Map<string, { pj: number; pg: number; pe: number; pp: number; gf: number; gc: number; pts: number }>()
    equipos.forEach(eq => statsMap.set(eq.id, { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 }))
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
    return Array.from(statsMap.entries()).map(([id, stat]) => ({
      id, ...stat,
      dg: stat.gf - stat.gc,
      equipo: equipos.find(e => e.id === id)!,
    })).sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf)
  }, [equipos, partidosGrupos])

  const equipoById = (id: string) => equipos.find(e => e.id === id)

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
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .dropdown-item { transition: background 0.15s, padding-left 0.15s; }
        .dropdown-item:hover { background: rgba(0,200,140,0.08); padding-left: 16px; }
        .match-card { transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s, border-color 0.22s; cursor: pointer; position: relative; border-radius: 12px; overflow: hidden; }
        .match-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,200,140,0.3); border-color: rgba(0,200,140,0.45) !important; }
        .side-bar { transition: width 0.22s ease; }
        .match-card:hover .side-bar { width: 14px !important; }
        .score-display { transition: color 0.2s; }
        .match-card:hover .score-display { color: var(--color-accent); }
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
            min-width: 560px;
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
        }
      `}</style>

      <div className="public-page" style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Header */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '36px', fontWeight: '800', margin: 0 }}>
            Copa DISCORD{torneoActivo ? ` - ${torneoActivo.nombre || `Torneo ${torneoActivo.numero}`}` : ''}
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
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 18px', borderRadius: '12px',
                background: 'var(--color-bgdark)', border: '2px solid var(--color-border)',
                color: 'var(--color-textWH)', fontSize: '15px', fontWeight: '600',
                cursor: 'pointer', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                <Trophy size={18} color="var(--color-accent)" />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {torneoActivo?.nombre || `Torneo ${torneoActivo?.numero}`}
                </span>
                {torneoActivo?.activo && (
                  <span style={{ padding: '2px 8px', borderRadius: '20px', background: 'rgba(0,200,140,0.15)', border: '1px solid rgba(0,200,140,0.3)', color: 'var(--color-accent)', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                    EN JUEGO
                  </span>
                )}
              </div>
              <ChevronDown size={18} color="rgba(255,255,255,0.5)" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            {dropdownOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--color-bgdark)', border: '2px solid var(--color-border)', borderRadius: '12px', maxHeight: '300px', overflowY: 'auto', zIndex: 50, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                {torneos.map(t => (
                  <button
                    key={t.id}
                    className="dropdown-item"
                    onClick={() => { setTorneoActivo(t); setDropdownOpen(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', background: t.id === torneoActivo?.id ? 'rgba(0,200,140,0.08)' : 'transparent', border: 'none', color: 'var(--color-textWH)', fontSize: '14px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <Trophy size={15} color={t.id === torneoActivo?.id ? 'var(--color-accent)' : 'rgba(255,255,255,0.4)'} />
                    <span style={{ flex: 1 }}>{t.nombre || `Torneo ${t.numero}`}</span>
                    {t.activo && (
                      <span style={{ padding: '2px 8px', borderRadius: '20px', background: 'rgba(0,200,140,0.15)', border: '1px solid rgba(0,200,140,0.3)', color: 'var(--color-accent)', fontSize: '10px', fontWeight: '700' }}>
                        EN JUEGO
                      </span>
                    )}
                  </button>
                ))}
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
            {/* SECCIÓN 0: Jornadas */}
            {jornadas.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Calendar size={22} color="var(--color-accent)" />
                  <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Jornadas</h2>
                </div>
                {/* Wrapper con scroll horizontal en mobile */}
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
                      gridTemplateColumns: '40px 1fr 40px 40px 50px 40px 40px 40px 40px 40px 50px',
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
                              gridTemplateColumns: '40px 1fr 40px 40px 50px 40px 40px 40px 40px 40px 50px',
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

                      return (
                        <div
                          key={detail.partido.id}
                          className="match-card"
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedMatchId(null)
                            } else {
                              setExpandedMatchId(detail.partido.id)
                            }
                          }}
                          style={{
                            border: `2px solid ${isExpanded ? 'var(--color-accent)' : 'var(--color-border)'}`,
                            background: isExpanded ? 'rgba(0,200,140,0.06)' : 'var(--color-background)',
                          }}
                        >
                          <div className="side-bar" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '10px', backgroundColor: empate ? 'gray' : (localGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }} />
                          <div className="side-bar" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '10px', backgroundColor: empate ? 'gray' : (visitanteGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }} />
                          <div className="match-card-inner" style={{ margin: '0 30px' }}>
                            <div style={{ padding: '16px 0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
                                  <div className="match-pu-badges" style={{ display: 'flex', gap: 4 }}>
                                    {(detail.powerups[detail.partido.equipo_local_id] || []).slice(0, 3).map(pu => (
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

                                <div className="score-display match-score" style={{ fontSize: 24, fontWeight: 800, color: isExpanded ? 'var(--color-accent)' : 'var(--color-textWH)', whiteSpace: 'nowrap' }}>
                                  {golesLocal} : {golesVisitante}
                                </div>

                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
                                  <span className="match-team-name" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{visitante?.nombre}</span>
                                  {visitante?.escudo_url
                                    ? <img src={visitante.escudo_url} className="escudo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                                    : <div className="escudo" style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--color-border)' }} />
                                  }
                                  <div className="match-pu-badges" style={{ display: 'flex', gap: 4 }}>
                                    {(detail.powerups[detail.partido.equipo_visitante_id] || []).slice(0, 3).map(pu => (
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

                            <div className={`map-container ${isExpanded ? 'expanded' : ''}`}>
                              <div style={{
                                borderTop: '1px solid var(--color-border)',
                                padding: '10px 0 20px',
                              }}>
                                {loadingMatchGoals && isExpanded ? (
                                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                                    <Loader2 size={24} className="spin" />
                                  </div>
                                ) : (
                                  <>
                                    {expandedMatchGoals.filter(g => g.pos_x != null && g.pos_y != null).length > 0 ? (
                                      <div className="gol-map-container" style={{
                                        position: 'relative',
                                        width: '60%',
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