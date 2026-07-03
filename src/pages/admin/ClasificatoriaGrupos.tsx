import { useEffect, useState } from 'react'
import { Table, Loader2, ChevronDown, Zap, History, Users } from 'lucide-react'
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
import canchaImage from '../../assets/cancha.png' // Importar la cancha

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
  created_at: string
}

interface Gol {
  id: string
  partido_id: string
  equipo_id: string
  minuto: number
  pos_x?: number | null
  pos_y?: number | null
}

interface EstadisticaEquipo {
  equipo: Equipo
  pj: number
  pg: number
  pe: number
  pp: number
  gf: number
  gc: number
  dg: number
  pts: number
}

interface PowerupInfo {
  powerupId: string
  nombre: string
  cantidad: number
}

interface EquipoPowerups {
  equipoId: string
  equipoNombre: string
  escudo_url: string | null
  powerups: PowerupInfo[]
  mostUsedPowerupId: string | null
}

interface MatchDetail {
  partido: Partido
  powerups: { [equipoId: string]: PowerupInfo[] }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

export default function ClasificatoriaGrupos() {
  const { torneoSeleccionado } = useTorneo()
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [powerupsUsage, setPowerupsUsage] = useState<EquipoPowerups[]>([])
  const [loadingPowerups, setLoadingPowerups] = useState(true)
  const [selectedTeamId, setSelectedTeamId] = useState<string>('all')
  const [teamMatches, setTeamMatches] = useState<MatchDetail[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // ─── Partido seleccionado para el mapa de goles ───
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [matchGoals, setMatchGoals] = useState<Gol[]>([])
  const [loadingMatchGoals, setLoadingMatchGoals] = useState(false)

  const torneo = torneoSeleccionado

  useEffect(() => {
    if (!torneo) { setLoading(false); setLoadingPowerups(false); return }
    const fetchData = async () => {
      setLoading(true); setLoadingPowerups(true); setError(null)
      let fetchedEquipos: Equipo[] = []
      try {
        const { data: eqTorneo, error: errorEqTorneo } = await supabase
          .from('equipos_torneo').select('equipo_id').eq('torneo_id', torneo.id)
        if (errorEqTorneo) throw errorEqTorneo
        if (eqTorneo && eqTorneo.length > 0) {
          const ids = eqTorneo.map(e => e.equipo_id)
          const { data: eqs, error: errorEqs } = await supabase
            .from('equipos').select('id, nombre, escudo_url, color_hex').in('id', ids)
          if (errorEqs) throw errorEqs
          if (eqs) fetchedEquipos = eqs as Equipo[]
        }
        setEquipos(fetchedEquipos)
        const { data: partidosData, error: errorPartidos } = await supabase
          .from('partidos').select('id, equipo_local_id, equipo_visitante_id, goles_local, goles_visitante')
          .eq('torneo_id', torneo.id).eq('fase', 'grupos')
          .not('goles_local', 'is', null).not('goles_visitante', 'is', null)
        if (errorPartidos) throw errorPartidos
        if (partidosData) setPartidos(partidosData as Partido[])
        if (fetchedEquipos.length > 0) {
          const { data: allPartidos, error: errorAllPartidos } = await supabase
            .from('partidos').select('id').eq('torneo_id', torneo.id).eq('fase', 'grupos')
          if (errorAllPartidos) throw errorAllPartidos
          if (allPartidos && allPartidos.length > 0) {
            const partidoIds = allPartidos.map(p => p.id)
            const { data: usadosData, error: errorUsados } = await supabase
              .from('powerups_usados').select('equipo_id, powerup_id, cantidad').in('partido_id', partidoIds)
            if (errorUsados) throw errorUsados
            const { data: catalogoData, error: errorCatalogo } = await supabase
              .from('powerups_catalogo').select('id, nombre')
            if (errorCatalogo) throw errorCatalogo
            if (usadosData && catalogoData) {
              const equipoMap = new Map<string, Map<string, number>>()
              usadosData.forEach(u => {
                if (!equipoMap.has(u.equipo_id)) equipoMap.set(u.equipo_id, new Map())
                const puMap = equipoMap.get(u.equipo_id)!
                puMap.set(u.powerup_id, (puMap.get(u.powerup_id) || 0) + u.cantidad)
              })
              const equiposConPowerups: EquipoPowerups[] = fetchedEquipos.map(eq => {
                const puMap = equipoMap.get(eq.id) || new Map()
                const powerupsInfo: PowerupInfo[] = []
                let mostUsedId: string | null = null; let maxCantidad = 0
                puMap.forEach((cantidad, powerupId) => {
                  const cat = catalogoData.find(c => c.id === powerupId)
                  if (cat) {
                    powerupsInfo.push({ powerupId, nombre: cat.nombre, cantidad })
                    if (cantidad > maxCantidad) { maxCantidad = cantidad; mostUsedId = powerupId }
                  }
                })
                powerupsInfo.sort((a, b) => b.cantidad - a.cantidad)
                return { equipoId: eq.id, equipoNombre: eq.nombre, escudo_url: eq.escudo_url, powerups: powerupsInfo, mostUsedPowerupId: mostUsedId }
              })
              setPowerupsUsage(equiposConPowerups)
            } else { setPowerupsUsage([]) }
          } else { setPowerupsUsage([]) }
        } else { setPowerupsUsage([]) }
      } catch (err: any) {
        console.error('Error cargando clasificación:', err)
        setError(err.message || 'Error desconocido al cargar los datos.')
      } finally { setLoading(false); setLoadingPowerups(false) }
    }
    fetchData()
  }, [torneo?.id])

  useEffect(() => {
    if (!torneo || !selectedTeamId) { setTeamMatches([]); return }
    const fetchTeamMatches = async () => {
      setLoadingMatches(true)
      try {
        let matches: any[] = []
        if (selectedTeamId === 'all') {
          const { data, error } = await supabase.from('partidos').select('*')
            .eq('torneo_id', torneo.id).eq('fase', 'grupos')
            .not('goles_local', 'is', null).not('goles_visitante', 'is', null)
            // ── CAMBIO: más reciente primero ──
            .order('created_at', { ascending: false })
          if (error) throw error
          matches = data || []
        } else {
          const { data, error } = await supabase.from('partidos').select('*')
            .eq('torneo_id', torneo.id).eq('fase', 'grupos')
            .or(`equipo_local_id.eq.${selectedTeamId},equipo_visitante_id.eq.${selectedTeamId}`)
            .not('goles_local', 'is', null).not('goles_visitante', 'is', null)
            // ── CAMBIO: más reciente primero ──
            .order('created_at', { ascending: false })
          if (error) throw error
          matches = data || []
        }
        if (matches.length === 0) { setTeamMatches([]); setLoadingMatches(false); return }
        const matchIds = matches.map(m => m.id)
        const { data: puData, error: errPu } = await supabase
          .from('powerups_usados').select('partido_id, equipo_id, powerup_id, cantidad').in('partido_id', matchIds)
        if (errPu) throw errPu
        const { data: catalogoData } = await supabase.from('powerups_catalogo').select('id, nombre')
        const powerupsByMatch: { [matchId: string]: { [equipoId: string]: PowerupInfo[] } } = {}
        puData?.forEach(pu => {
          if (!powerupsByMatch[pu.partido_id]) powerupsByMatch[pu.partido_id] = {}
          if (!powerupsByMatch[pu.partido_id][pu.equipo_id]) powerupsByMatch[pu.partido_id][pu.equipo_id] = []
          const cat = catalogoData?.find(c => c.id === pu.powerup_id)
          if (cat) {
            const exist = powerupsByMatch[pu.partido_id][pu.equipo_id].find(x => x.powerupId === pu.powerup_id)
            if (exist) exist.cantidad += pu.cantidad
            else powerupsByMatch[pu.partido_id][pu.equipo_id].push({ powerupId: pu.powerup_id, nombre: cat.nombre, cantidad: pu.cantidad })
          }
        })
        setTeamMatches(matches.map(m => ({ partido: m as Partido, powerups: powerupsByMatch[m.id] || {} })))
      } catch (err: any) {
        console.error('Error fetching team matches:', err)
      } finally { setLoadingMatches(false) }
    }
    fetchTeamMatches()
  }, [torneo, selectedTeamId])

  // Cargar goles para el mapa cuando se selecciona un partido
  useEffect(() => {
    if (!selectedMatchId) {
      setMatchGoals([])
      return
    }
    const fetchGoals = async () => {
      setLoadingMatchGoals(true)
      const { data, error } = await supabase
        .from('goles')
        .select('id, partido_id, equipo_id, minuto, pos_x, pos_y')
        .eq('partido_id', selectedMatchId)
        .order('minuto', { ascending: true })
      if (!error && data) {
        setMatchGoals(data as Gol[])
      }
      setLoadingMatchGoals(false)
    }
    fetchGoals()
  }, [selectedMatchId])

  const calcularEstadisticas = (): EstadisticaEquipo[] => {
    const statsMap = new Map<string, EstadisticaEquipo>()
    equipos.forEach(eq => { statsMap.set(eq.id, { equipo: eq, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 }) })
    partidos.forEach(p => {
      const local = statsMap.get(p.equipo_local_id)
      const visitante = statsMap.get(p.equipo_visitante_id)
      if (!local || !visitante || p.goles_local === null || p.goles_visitante === null) return
      local.pj++; visitante.pj++
      local.gf += p.goles_local; local.gc += p.goles_visitante
      visitante.gf += p.goles_visitante; visitante.gc += p.goles_local
      if (p.goles_local > p.goles_visitante) { local.pg++; local.pts += 3; visitante.pp++ }
      else if (p.goles_local < p.goles_visitante) { visitante.pg++; visitante.pts += 3; local.pp++ }
      else { local.pe++; visitante.pe++; local.pts += 1; visitante.pts += 1 }
    })
    statsMap.forEach(stat => { stat.dg = stat.gf - stat.gc })
    return Array.from(statsMap.values()).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      if (b.dg !== a.dg) return b.dg - a.dg
      if (b.gf !== a.gf) return b.gf - a.gf
      return a.equipo.nombre.localeCompare(b.equipo.nombre)
    })
  }

  const tabla = calcularEstadisticas()
  const sortedPowerupsUsage = [...powerupsUsage].sort((a, b) => {
    const totalA = a.powerups.reduce((sum, p) => sum + p.cantidad, 0)
    const totalB = b.powerups.reduce((sum, p) => sum + p.cantidad, 0)
    return totalB - totalA
  })

  const formatearDuracion = (segundos: number) => {
    const mins = Math.floor(segundos / 60)
    const secs = segundos % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (!torneo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', minHeight: '50vh' }}>
        <h1 style={{ textAlign: 'center', fontSize: '28px', fontWeight: '800', color: 'var(--color-textWH)', marginBottom: '24px', letterSpacing: '5px' }}>
          CLASIFICATORIA
        </h1>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Selecciona un torneo en el menú lateral.</div>
      </div>
    )
  }

  const customStyles = `
    /* ── Entrada general ── */
    .fade-in {
      animation: fadeIn 0.4s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Spin loader ── */
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ════════════════════════════════
       TABLA DE CLASIFICACIÓN
    ════════════════════════════════ */
    .table-row {
      transition: background 0.18s ease, box-shadow 0.18s ease;
      cursor: default;
    }
    .table-row:hover {
      background: rgba(255, 255, 255, 0.055) !important;
      box-shadow:
        inset 3px 0 0 rgba(255,255,255,0.18),
        inset -3px 0 0 rgba(255,255,255,0.18);
    }
    .table-row:hover .pts-cell {
      background: rgba(0, 200, 140, 0.18);
      border-radius: 6px;
      padding: 2px 6px;
    }
    .pts-cell {
      transition: background 0.18s ease, padding 0.18s ease, border-radius 0.18s ease;
    }
    .table-row:hover .escudo {
      transform: scale(1.1);
    }
    .escudo {
      transition: transform 0.2s ease;
    }

    /* ════════════════════════════════
       POWER-UPS ROWS
    ════════════════════════════════ */
    .powerup-row {
      transition: background 0.18s ease;
      cursor: default;
    }
    .powerup-row:hover {
      background: rgba(255, 255, 255, 0.04) !important;
    }
    .pu-badge {
      transition: transform 0.18s ease, box-shadow 0.18s ease;
      cursor: default;
      transform-origin: center center;
      position: relative;
    }
    .pu-badge:hover {
      transform: scale(1.15);
      z-index: 5;
    }
    .pu-badge-gold:hover {
      box-shadow: 0 3px 10px rgba(255, 183, 0, 0.35);
    }
    .pu-badge-green:hover {
      box-shadow: 0 3px 10px rgba(0, 200, 140, 0.3);
    }

    /* ════════════════════════════════
       MATCH CARDS
    ════════════════════════════════ */
    .match-card {
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
                  box-shadow 0.22s ease,
                  border-color 0.22s ease;
      cursor: pointer;
    }
    .match-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 28px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,200,140,0.3);
      border-color: rgba(0,200,140,0.45) !important;
    }
    .match-card:hover .score-display {
      color: var(--color-accent);
      transition: color 0.2s;
    }
    .score-display {
      transition: color 0.2s;
    }
    .side-bar {
      transition: width 0.22s ease;
    }
    .match-card:hover .side-bar {
      width: 14px !important;
    }

    /* ════════════════════════════════
       DROPDOWN
    ════════════════════════════════ */
    .dropdown-btn {
      transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    }
    .dropdown-btn:hover {
      background: rgba(0,200,140,0.07) !important;
      border-color: rgba(0,200,140,0.5) !important;
      box-shadow: 0 0 0 3px rgba(0,200,140,0.1);
    }
    .dropdown-btn:active { transform: scale(0.99); }

    .dropdown-item {
      transition: background 0.15s ease, color 0.15s ease, padding-left 0.15s ease;
      border-left: 3px solid transparent;
      box-sizing: border-box;
    }
    .dropdown-item:hover {
      background: rgba(0,200,140,0.08) !important;
      color: var(--color-accent) !important;
      padding-left: 20px !important;
      border-left-color: var(--color-accent);
    }

    .dropdown-menu {
      animation: dropIn 0.18s cubic-bezier(0.22, 1, 0.36, 1) both;
      transform-origin: top center;
    }
    @keyframes dropIn {
      from { opacity: 0; transform: scaleY(0.9) translateY(-6px); }
      to   { opacity: 1; transform: scaleY(1) translateY(0); }
    }

    /* ════════════════════════════════
       ÍCONOS DE SECCIÓN
    ════════════════════════════════ */
    .section-icon {
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .section-icon:hover {
      transform: scale(1.2) rotate(10deg);
    }

    /* ════════════════════════════════
       STAGGER ENTRADA DE ITEMS
    ════════════════════════════════ */
    .stagger-item {
      animation: staggerFade 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes staggerFade {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ════════════════════════════════
       MAPA DE GOLES — subcontenedor
    ════════════════════════════════ */
    .goal-map-inner {
      transition: box-shadow 0.25s ease, border-color 0.25s ease;
    }
    .goal-map-inner:hover {
      box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,200,140,0.2);
    }

    /* Puntos de gol: pop al hacer hover */
    .goal-dot {
      transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
                  box-shadow 0.18s ease;
    }
    .goal-dot:hover {
      transform: translate(-50%, -50%) scale(1.35) !important;
      z-index: 10 !important;
    }

    /* Header del mapa */
    .map-header {
      transition: background 0.2s ease;
    }

    /* Leyenda de equipo: fade-in sutil */
    .team-legend-chip {
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    .team-legend-chip:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
  `

  return (
    <>
      <style>{customStyles}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} className="fade-in">

        <h1 style={{
          textAlign: 'center', fontSize: '30px', fontWeight: '800',
          color: 'var(--color-textWH)', margin: '0 0 16px 0',
          letterSpacing: '0px', textTransform: 'uppercase',
        }}>
          CLASIFICATORIA
        </h1>

        {error && (
          <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', color: 'var(--color-error)', fontSize: '13px' }}>
            Error al cargar: {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Loader2 size={16} className="spin" /> Cargando...
          </div>
        ) : (
          <>
            {/* ── Tablas superiores ── */}
            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>

              {/* Columna izquierda: Clasificación */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <Table size={24} color="var(--color-accent)" className="section-icon" />
                  <h2 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-textWH)', margin: 0 }}>
                    Clasificación de grupos
                  </h2>
                </div>

                {equipos.length === 0 ? (
                  <div style={{ padding: '40px', borderRadius: '16px', border: '2px dashed var(--color-border)', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
                    No hay equipos registrados en este torneo.
                  </div>
                ) : tabla.length === 0 ? (
                  <div style={{ padding: '40px', borderRadius: '16px', border: '2px dashed var(--color-border)', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
                    Aún no hay partidos jugados con resultado. Registra resultados en "Partidos de grupo" para ver la clasificación.
                  </div>
                ) : (
                  <div style={{ borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--color-border)', background: 'var(--color-background)' }}>
                    {/* Header */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 1fr 40px 40px 50px 40px 40px 40px 40px 40px 50px',
                      padding: '12px 16px',
                      background: 'rgba(0, 93, 67, 1)',
                      borderBottom: '1px solid var(--color-border)',
                      color: 'rgba(255,255,255,0.6)', fontSize: '12px',
                      fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      <span style={{ textAlign: 'center' }}>#</span>
                      <span>Equipo</span>
                      <span style={{ textAlign: 'center' }}>PJ</span>
                      <span style={{ textAlign: 'center' }}>PG</span>
                      <span style={{ textAlign: 'center' }}>%V</span>
                      <span style={{ textAlign: 'center' }}>PE</span>
                      <span style={{ textAlign: 'center' }}>PP</span>
                      <span style={{ textAlign: 'center' }}>GF</span>
                      <span style={{ textAlign: 'center' }}>GC</span>
                      <span style={{ textAlign: 'center' }}>DG</span>
                      <span style={{ textAlign: 'center', fontWeight: '700', color: 'var(--color-accent)' }}>PTS</span>
                    </div>

                    {tabla.map((stat, index) => {
                      const porcentajeVictoria = stat.pj > 0 ? Math.round((stat.pg / stat.pj) * 100) : null
                      return (
                        <div
                          key={stat.equipo.id}
                          className="table-row stagger-item"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '40px 1fr 40px 40px 50px 40px 40px 40px 40px 40px 50px',
                            padding: '12px 16px',
                            borderBottom: index < tabla.length - 1 ? '1px solid var(--color-border)' : 'none',
                            color: 'var(--color-textWH)', fontSize: '14px',
                            alignItems: 'center',
                            background: index >= 4 ? 'var(--color-bgdark)' : 'transparent',
                            animationDelay: `${index * 0.045}s`,
                          }}
                        >
                          <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>{index + 1}</span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {stat.equipo.escudo_url
                              ? <img src={stat.equipo.escudo_url} alt="" className="escudo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                              : <div className="escudo" style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--color-border)' }} />
                            }
                            <span style={{ fontWeight: '600' }}>{stat.equipo.nombre}</span>
                          </div>

                          <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>{stat.pj}</span>
                          <span style={{ textAlign: 'center' }}>{stat.pg}</span>
                          <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>
                            {porcentajeVictoria !== null ? `${porcentajeVictoria}%` : '—'}
                          </span>
                          <span style={{ textAlign: 'center' }}>{stat.pe}</span>
                          <span style={{ textAlign: 'center' }}>{stat.pp}</span>
                          <span style={{ textAlign: 'center' }}>{stat.gf}</span>
                          <span style={{ textAlign: 'center' }}>{stat.gc}</span>
                          <span style={{
                            textAlign: 'center', fontWeight: 600,
                            color: stat.dg > 0 ? 'var(--color-accent)' : stat.dg < 0 ? 'var(--color-error)' : 'inherit',
                          }}>
                            {stat.dg > 0 ? `+${stat.dg}` : stat.dg}
                          </span>
                          <span
                            className="pts-cell"
                            style={{
                              textAlign: 'center', fontWeight: 800,
                              color: 'var(--color-accent)', fontSize: 16,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {stat.pts}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Columna derecha: Power Ups */}
              <div style={{ width: '700px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <Zap size={24} color="var(--color-accent)" className="section-icon" />
                  <h2 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-textWH)', margin: 0 }}>
                    Power Ups
                  </h2>
                </div>
                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--color-border)', background: 'var(--color-background)' }}>
                  <div style={{
                    padding: '11.4px 16px', background: 'rgba(0, 93, 67, 1)',
                    borderBottom: '1px solid var(--color-border)',
                    color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <Table size={14} color="var(--color-accent)" /> Uso de Power‑ups
                  </div>

                  {loadingPowerups ? (
                    <div style={{ padding: 20, color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center' }}>
                      <Loader2 size={16} className="spin" /> Cargando...
                    </div>
                  ) : sortedPowerupsUsage.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
                      No se han usado power‑ups aún.
                    </div>
                  ) : (
                    sortedPowerupsUsage.map((equipoPu, idx) => {
                      const totalPowerups = equipoPu.powerups.reduce((sum, p) => sum + p.cantidad, 0)
                      return (
                        <div
                          key={equipoPu.equipoId}
                          className="powerup-row stagger-item"
                          style={{
                            display: 'flex', alignItems: 'center', padding: '14px 16px',
                            borderBottom: idx < sortedPowerupsUsage.length - 1 ? '1px solid var(--color-border)' : 'none',
                            color: 'var(--color-textWH)', fontSize: 14,
                            animationDelay: `${idx * 0.04}s`,
                          }}
                        >
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            {equipoPu.escudo_url
                              ? <img src={equipoPu.escudo_url} alt="" className="escudo" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                              : <div className="escudo" style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--color-border)' }} />
                            }
                            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {equipoPu.equipoNombre}
                              <span style={{ marginLeft: 4, color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 400 }}>({totalPowerups})</span>
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            {equipoPu.powerups.length === 0 ? (
                              <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
                            ) : (
                              equipoPu.powerups.map(pu => {
                                const isMostUsed = pu.powerupId === equipoPu.mostUsedPowerupId
                                const imgSrc = POWERUP_IMAGES[pu.nombre] || ''
                                return (
                                  <div
                                    key={pu.powerupId}
                                    title={pu.nombre}
                                    className={`pu-badge ${isMostUsed ? 'pu-badge-gold' : 'pu-badge-green'}`}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 3,
                                      background: isMostUsed ? 'rgba(184, 134, 11, 0.15)' : 'transparent',
                                      borderRadius: 6, padding: '2px 5px',
                                      border: isMostUsed ? '1px solid #ffb700' : '1px solid var(--color-accent)',
                                    }}
                                  >
                                    <img src={imgSrc} alt={pu.nombre} style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: isMostUsed ? '#ffb700' : 'rgba(255,255,255,0.8)' }}>
                                      {pu.cantidad}
                                    </span>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* ── Historial de partidos ── */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginTop: '20px' }}>

              {/* ── Columna izquierda: título + filtro + lista ── */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <History size={24} color="var(--color-accent)" className="section-icon" />
                <h2 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-textWH)', margin: 0 }}>
                  Historial de partidos
                </h2>
                {/* Filtro inline junto al título */}
                <div style={{ position: 'relative', width: 260, marginLeft: '8px' }}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="dropdown-btn"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', borderRadius: 10,
                      background: 'var(--color-background)', border: '2px solid var(--color-border)',
                      color: 'var(--color-textWH)', fontSize: 14, cursor: 'pointer', fontWeight: '700',
                      justifyContent: 'space-between',
                    }}
                  >
                    {selectedTeamId === 'all' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Users size={20} color="rgba(255,255,255,0.6)" />
                        Todos los equipos
                      </span>
                    ) : selectedTeamId && equipos.find(e => e.id === selectedTeamId) ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {equipos.find(e => e.id === selectedTeamId)!.escudo_url
                          ? <img src={equipos.find(e => e.id === selectedTeamId)!.escudo_url!} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                          : <div style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--color-border)' }} />
                        }
                        {equipos.find(e => e.id === selectedTeamId)!.nombre}
                      </span>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Seleccionar equipo</span>
                    )}
                    <ChevronDown
                      size={16}
                      color="rgba(255,255,255,0.4)"
                      style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                    />
                  </button>

                  {dropdownOpen && (
                    <div
                      className="dropdown-menu"
                      style={{
                        position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20,
                        background: 'var(--color-bgdark)', border: '2px solid var(--color-border)',
                        borderRadius: 10, maxHeight: 260, overflowY: 'auto',
                      }}
                    >
                      <button
                        onClick={() => { setSelectedTeamId('all'); setDropdownOpen(false) }}
                        className="dropdown-item"
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'transparent', border: 'none', color: 'var(--color-textWH)', fontSize: 14, cursor: 'pointer' }}
                      >
                        <Users size={20} color="rgba(255,255,255,0.6)" />
                        Todos los equipos
                      </button>
                      {equipos.map(eq => (
                        <button
                          key={eq.id}
                          onClick={() => { setSelectedTeamId(eq.id); setDropdownOpen(false) }}
                          className="dropdown-item"
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'transparent', border: 'none', color: 'var(--color-textWH)', fontSize: 14, cursor: 'pointer' }}
                        >
                          {eq.escudo_url
                            ? <img src={eq.escudo_url} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                            : <div style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--color-border)' }} />
                          }
                          {eq.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Lista de partidos */}
              <div>
                  {loadingMatches ? (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Loader2 size={16} className="spin" /> Cargando partidos...
                    </div>
                  ) : teamMatches.length === 0 ? (
                    <div style={{ padding: '20px', borderRadius: 12, border: '2px dashed var(--color-border)', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
                      {selectedTeamId === 'all'
                        ? 'No hay partidos jugados con resultado en la fase de grupos.'
                        : 'Este equipo aún no ha jugado partidos con resultado en la fase de grupos.'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {teamMatches.map((detail, cardIndex) => {
                        const local = equipos.find(e => e.id === detail.partido.equipo_local_id)
                        const visitante = equipos.find(e => e.id === detail.partido.equipo_visitante_id)
                        const dur = formatearDuracion(detail.partido.duracion_segundos || 0)
                        const estado = detail.partido.estado === 'finalizado' ? 'Finalizado' : 'Jugado'
                        const golesLocal = detail.partido.goles_local ?? 0
                        const golesVisitante = detail.partido.goles_visitante ?? 0
                        const localGano = golesLocal > golesVisitante
                        const visitanteGano = golesVisitante > golesLocal
                        const empate = golesLocal === golesVisitante

                        const isSelected = selectedMatchId === detail.partido.id

                        return (
                          <div
                            key={detail.partido.id}
                            className="match-card stagger-item"
                            onClick={() => {
                              setSelectedMatchId(detail.partido.id)
                            }}
                            style={{
                              position: 'relative', borderRadius: 12,
                              border: `2px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                              background: isSelected ? 'rgba(0,200,140,0.06)' : 'var(--color-background)',
                              overflow: 'hidden',
                              animationDelay: `${cardIndex * 0.04}s`,
                              cursor: 'pointer',
                            }}
                          >
                            <div className="side-bar" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '10px', backgroundColor: empate ? 'gray' : (localGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }} />
                            <div className="side-bar" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '10px', backgroundColor: empate ? 'gray' : (visitanteGano ? 'rgb(0, 200, 140)' : 'rgb(255, 77, 77)') }} />

                            <div style={{ padding: '16px', margin: '0 30px' }}>
                              {/* Marcador */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--color-textWH)' }}>{local?.nombre}</span>
                                  {local?.escudo_url
                                    ? <img src={local.escudo_url} className="escudo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                                    : <div className="escudo" style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--color-border)' }} />
                                  }
                                </div>
                                <div className="score-display" style={{ fontSize: 24, fontWeight: 800, color: isSelected ? 'var(--color-accent)' : 'var(--color-textWH)' }}>
                                  {golesLocal} : {golesVisitante}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                  {visitante?.escudo_url
                                    ? <img src={visitante.escudo_url} className="escudo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                                    : <div className="escudo" style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--color-border)' }} />
                                  }
                                  <span style={{ fontWeight: 600, color: 'var(--color-textWH)' }}>{visitante?.nombre}</span>
                                </div>
                              </div>

                              {/* Duración y estado */}
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 30, color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 8 }}>
                                <span>⏱ {dur}</span>
                                <span>{estado}</span>
                              </div>

                              {/* Power-ups */}
                              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12 }}>
                                {[
                                  { equipo: local, id: detail.partido.equipo_local_id },
                                  { equipo: visitante, id: detail.partido.equipo_visitante_id },
                                ].map(({ equipo, id }) => (
                                  <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{equipo?.nombre} power‑ups</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {(detail.powerups[id] || []).length === 0 ? (
                                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>—</span>
                                      ) : (
                                        chunkArray(detail.powerups[id] || [], 3).map((chunk, rowIndex) => (
                                          <div key={rowIndex} style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                                            {chunk.map(pu => (
                                              <div key={pu.powerupId} title={pu.nombre} className="pu-badge pu-badge-green" style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,200,140,0.1)', borderRadius: 6, padding: '2px 6px', border: '1px solid var(--color-accent)' }}>
                                                <img src={POWERUP_IMAGES[pu.nombre] || ''} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                                                <span style={{ fontSize: 12, color: 'var(--color-accent)' }}>{pu.cantidad}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Columna derecha: Mapa de goles — sticky ─── */}
              <div style={{ width: '700px', flexShrink: 0, position: 'sticky', top: '20px' }}>

                  {/* ── Título del panel ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px', marginTop: '9px' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="section-icon">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="12" cy="12" r="3"/>
                      <line x1="12" y1="3" x2="12" y2="9"/>
                      <line x1="12" y1="15" x2="12" y2="21"/>
                    </svg>
                    <h2 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-textWH)', margin: 0 }}>
                      Mapa de goles
                    </h2>
                  </div>

                  {!selectedMatchId ? (
                    <div className="goal-map-inner" style={{
                      background: 'var(--color-background)', border: '2px solid var(--color-border)',
                      borderRadius: 12, padding: 40,
                      textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 14,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                    }}>
                      {/* Placeholder ilustrativo */}
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="12" cy="12" r="3"/>
                        <line x1="12" y1="3" x2="12" y2="9"/>
                        <line x1="12" y1="15" x2="12" y2="21"/>
                      </svg>
                      <p style={{ margin: 0 }}>
                        Ningún partido seleccionado
                      </p>
                    </div>
                  ) : loadingMatchGoals ? (
                    <div className="goal-map-inner" style={{
                      background: 'var(--color-background)', border: '2px solid var(--color-border)',
                      borderRadius: 12, padding: 30,
                      color: 'rgba(255,255,255,0.4)', fontSize: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      <Loader2 size={16} className="spin" /> Cargando goles...
                    </div>
                  ) : (() => {
                    const selectedMatch = teamMatches.find(m => m.partido.id === selectedMatchId)?.partido
                    const localEquipo = equipos.find(e => e.id === selectedMatch?.equipo_local_id)
                    const visitanteEquipo = equipos.find(e => e.id === selectedMatch?.equipo_visitante_id)
                    const localColor = localEquipo?.color_hex || '#00C88C'
                    const visitanteColor = visitanteEquipo?.color_hex || '#FF4D4D'

                    const counters: Record<string, number> = {}
                    const goalsWithNumbers = matchGoals.map(goal => {
                      counters[goal.equipo_id] = (counters[goal.equipo_id] || 0) + 1
                      return { ...goal, goalNumber: counters[goal.equipo_id] }
                    })

                    const golesLocal = selectedMatch?.goles_local ?? 0
                    const golesVisitante = selectedMatch?.goles_visitante ?? 0

                    return (
                      <div className="goal-map-inner" style={{
                        background: 'var(--color-background)',
                        border: '2px solid var(--color-border)',
                        borderRadius: 12, overflow: 'hidden',
                      }}>
                        {/* Header del partido seleccionado */}
                        <div
                          className="map-header"
                          style={{
                            padding: '10px 16px',
                            background: 'rgba(0, 93, 67, 0.7)',
                            borderBottom: '1px solid var(--color-border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          }}
                        >
                          {/* Equipo local */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="team-legend-chip" style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              background: `${localColor}22`, borderRadius: 8,
                              padding: '5px 10px', border: `1px solid ${localColor}55`,
                            }}>
                              {localEquipo?.escudo_url
                                ? <img src={localEquipo.escudo_url} style={{ width: 22, height: 22, objectFit: 'contain' }} />
                                : <div style={{ width: 22, height: 22, borderRadius: 4, background: localColor, opacity: 0.7 }} />
                              }
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-textWH)' }}>
                                {localEquipo?.nombre}
                              </span>
                            </div>
                            <span style={{ fontSize: 20, fontWeight: 800, color: '#ffffff' }}>
                              {golesLocal}
                            </span>
                          </div>

                          {/* Separador central */}
                          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: 2 }}>VS</span>

                          {/* Equipo visitante */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 20, fontWeight: 800, color: '#ffffff' }}>
                              {golesVisitante}
                            </span>
                            <div className="team-legend-chip" style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              background: `${visitanteColor}22`, borderRadius: 8,
                              padding: '5px 10px', border: `1px solid ${visitanteColor}55`,
                            }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-textWH)' }}>
                                {visitanteEquipo?.nombre}
                              </span>
                              {visitanteEquipo?.escudo_url
                                ? <img src={visitanteEquipo.escudo_url} style={{ width: 22, height: 22, objectFit: 'contain' }} />
                                : <div style={{ width: 22, height: 22, borderRadius: 4, background: visitanteColor, opacity: 0.7 }} />
                              }
                            </div>
                          </div>
                        </div>

                        {/* Imagen de la cancha */}
                        <div style={{ padding: '12px' }}>
                          <div style={{
                            position: 'relative',
                            width: '100%',
                            aspectRatio: '16/9',
                            isolation: 'isolate',
                          }}>
                            <img
                              src={canchaImage}
                              alt=""
                              style={{
                                position: 'absolute', inset: 0,
                                width: '100%', height: '100%',
                                objectFit: 'cover', objectPosition: 'center',
                                zIndex: 1,
                              }}
                            />
                            <div style={{
                              position: 'absolute', inset: 0,
                              background: `linear-gradient(to right,
                                ${localColor} 0%, ${localColor} 6.58%,
                                transparent 6.58%, transparent 93.39%,
                                ${visitanteColor} 93.39%, ${visitanteColor} 100%)`,
                              mixBlendMode: 'multiply',
                              WebkitMaskImage: `url(${canchaImage})`,
                              maskImage: `url(${canchaImage})`,
                              WebkitMaskSize: 'cover',
                              maskSize: 'cover',
                              WebkitMaskPosition: 'center',
                              maskPosition: 'center',
                              pointerEvents: 'none',
                              zIndex: 2,
                            }} />

                            {/* Puntos de gol */}
                            {goalsWithNumbers.map(goal => {
                              const team = equipos.find(e => e.id === goal.equipo_id)
                              const color = team?.color_hex || '#FF0000'
                              const darker = darkenHex(color, 0.6)
                              if (goal.pos_x == null || goal.pos_y == null) return null
                              return (
                                <div
                                  key={goal.id}
                                  className="goal-dot"
                                  style={{
                                    position: 'absolute',
                                    left: `${goal.pos_x}%`,
                                    top: `${goal.pos_y}%`,
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    backgroundColor: darker,
                                    border: `3px solid ${color}`,
                                    transform: 'translate(-50%, -50%)',
                                    boxShadow: `0 0 12px ${color}`,
                                    zIndex: 5,
                                    cursor: 'default',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    lineHeight: 1,
                                  }}
                                  title={`${team?.nombre ?? 'Equipo'} - Gol ${goal.goalNumber} (${goal.minuto} seg)`}
                                >
                                  {goal.goalNumber}
                                </div>
                              )
                            })}

                            {goalsWithNumbers.length === 0 && (
                              <div style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.5)',
                                fontSize: 14, fontWeight: 600,
                              }}>
                                No hay goles registrados con ubicación
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Pie: cantidad de goles con posición */}
                        <div style={{
                          padding: '8px 16px 12px',
                          display: 'flex', justifyContent: 'center',
                          color: 'rgba(255,255,255,0.3)', fontSize: 12,
                          borderTop: '1px solid var(--color-border)',
                          gap: 6,
                        }}>
                          <span>
                            {goalsWithNumbers.filter(g => g.pos_x != null).length} de {matchGoals.length} gol{matchGoals.length !== 1 ? 'es' : ''} con ubicación registrada
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}