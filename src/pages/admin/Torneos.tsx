import { useEffect, useRef, useState } from 'react'
import { Trophy, Plus, Loader2, Pencil, X, Save, Trash2, Check, GripVertical } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTorneo } from '../../context/TorneoContext'

interface Torneo {
  id: string
  numero: number
  nombre: string | null
  edicion: string | null
  activo: boolean
  estado: 'en_curso' | 'terminado' | 'lost_media'
  created_at: string
  orden: number | null
}

const ESTADO_LABELS: Record<Torneo['estado'], string> = {
  en_curso: 'En curso',
  terminado: 'Terminado',
  lost_media: 'Lost media',
}

const ESTADO_COLORS: Record<Torneo['estado'], { bg: string; border: string; text: string }> = {
  en_curso: { bg: 'rgba(0,200,140,0.12)', border: 'rgba(0,200,140,0.3)', text: 'var(--color-accent)' },
  terminado: { bg: 'rgba(120,120,120,0.15)', border: 'rgba(180,180,180,0.3)', text: 'rgba(255,255,255,0.7)' },
  lost_media: { bg: 'rgba(220,50,50,0.12)', border: 'rgba(220,50,50,0.35)', text: 'var(--color-error)' },
}

interface Equipo {
  id: string
  nombre: string
  dt: string
  escudo_url: string | null
}

interface ModalState {
  torneo: Torneo
  numero: number
  nombre: string
  edicion: string
  created_at: string   // datetime-local format
  activo: boolean
  estado: Torneo['estado']
  orden: number | null
  equiposSeleccionados: string[]
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const MODAL: React.CSSProperties = {
  background: 'var(--color-bgdark)',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '28px',
  width: '100%',
  maxWidth: '440px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  maxHeight: '90vh',
  overflowY: 'auto',
}

const LABEL: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: '600',
  color: 'rgba(255,255,255,0.5)',
  marginBottom: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1px solid var(--color-border)',
  background: 'var(--color-background)',
  color: 'var(--color-textWH)',
  fontSize: '14px',
  boxSizing: 'border-box',
}

// Ordena por el campo `orden` (si existe) y usa `numero` desc como fallback/desempate
function ordenarTorneos(lista: Torneo[]): Torneo[] {
  return [...lista].sort((a, b) => {
    const oa = a.orden
    const ob = b.orden
    if (oa != null && ob != null) return oa - ob
    if (oa != null) return -1
    if (ob != null) return 1
    return b.numero - a.numero
  })
}

// Convierte fecha ISO a formato compatible con input datetime-local
const toDatetimeLocal = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 16)
}

export default function Torneos() {
  const [torneos, setTorneos] = useState<Torneo[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [loading, setLoading] = useState(true)
  const [creando, setCreando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [eliminando, setEliminando] = useState<Torneo | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [estadoDropdownId, setEstadoDropdownId] = useState<string | null>(null)
  const { setTorneoSeleccionado, refreshTorneos } = useTorneo()

  // --- Drag and drop state ---
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const guardandoOrdenRef = useRef(false)

  const fetchTorneos = async () => {
    const { data } = await supabase
      .from('torneos')
      .select('*')
      .order('numero', { ascending: false })
    if (data) setTorneos(ordenarTorneos(data as Torneo[]))
    setLoading(false)
  }

  const fetchEquipos = async () => {
    const { data } = await supabase
      .from('equipos')
      .select('id, nombre, dt, escudo_url')
      .order('nombre', { ascending: true })
    if (data) setEquipos(data)
  }

  useEffect(() => {
    fetchTorneos()
    fetchEquipos()
  }, [])

  const crearTorneo = async () => {
    setCreando(true)
    const siguiente = torneos.length > 0 ? Math.max(...torneos.map(t => t.numero)) + 1 : 1
    const { data } = await supabase
      .from('torneos')
      .insert({ numero: siguiente, activo: false, estado: 'en_curso', edicion: null })
      .select()
      .single()
    if (data) {
      await fetchTorneos()
      await refreshTorneos()
      setTorneoSeleccionado(data as Torneo)
      await abrirModal(data as Torneo)
    }
    setCreando(false)
  }

  const abrirModal = async (torneo: Torneo) => {
    const { data } = await supabase
      .from('equipos_torneo')
      .select('equipo_id')
      .eq('torneo_id', torneo.id)
    const vinculados = data ? data.map(r => r.equipo_id) : []

    setModal({
      torneo,
      numero: torneo.numero,
      nombre: torneo.nombre ?? '',
      edicion: torneo.edicion ?? '',
      created_at: toDatetimeLocal(torneo.created_at),
      activo: torneo.activo ?? false,
      estado: torneo.estado,
      orden: torneo.orden ?? null,
      equiposSeleccionados: vinculados,
    })
  }

  const toggleEquipo = (id: string) => {
    setModal(m => {
      if (!m) return m
      const sel = m.equiposSeleccionados
      return {
        ...m,
        equiposSeleccionados: sel.includes(id)
          ? sel.filter(e => e !== id)
          : [...sel, id],
      }
    })
  }

  const guardar = async () => {
    if (!modal) return
    setGuardando(true)

    const payload: Record<string, any> = {
      numero: modal.numero,
      nombre: modal.nombre.trim() || null,
      edicion: modal.edicion.trim() || null,
      estado: modal.estado,
      activo: modal.activo,
      orden: modal.orden,
    }

    if (modal.created_at) {
      payload.created_at = new Date(modal.created_at).toISOString()
    }

    const { data } = await supabase
      .from('torneos')
      .update(payload)
      .eq('id', modal.torneo.id)
      .select()
      .single()

    await supabase.from('equipos_torneo').delete().eq('torneo_id', modal.torneo.id)
    if (modal.equiposSeleccionados.length > 0) {
      await supabase.from('equipos_torneo').insert(
        modal.equiposSeleccionados.map(equipo_id => ({
          torneo_id: modal.torneo.id,
          equipo_id,
        }))
      )
    }

    if (data) {
      await fetchTorneos()
      await refreshTorneos()
    }
    setGuardando(false)
    setModal(null)
  }

  const eliminarTorneo = async () => {
    if (!eliminando) return
    setConfirmando(true)
    await supabase.from('equipos_torneo').delete().eq('torneo_id', eliminando.id)
    await supabase.from('torneos').delete().eq('id', eliminando.id)
    await fetchTorneos()
    await refreshTorneos()
    setConfirmando(false)
    setEliminando(null)
  }

  const cambiarEstado = async (torneo: Torneo, nuevoEstado: Torneo['estado']) => {
    setTorneos(prev => prev.map(t => t.id === torneo.id ? { ...t, estado: nuevoEstado } : t))
    await supabase.from('torneos').update({ estado: nuevoEstado }).eq('id', torneo.id)
    await refreshTorneos()
  }

  // --- Persistencia del nuevo orden en Supabase ---
  const persistirOrden = async (lista: Torneo[]) => {
    if (guardandoOrdenRef.current) return
    guardandoOrdenRef.current = true
    try {
      await Promise.all(
        lista.map((t, index) =>
          supabase.from('torneos').update({ orden: index }).eq('id', t.id)
        )
      )
      await refreshTorneos()
    } finally {
      guardandoOrdenRef.current = false
    }
  }

  // --- Handlers de drag and drop ---
  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.setData('text/plain', id)
    } catch {
      // no-op
    }
  }

  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id !== dragOverId) setDragOverId(id)

    if (!draggingId || draggingId === id) return

    setTorneos(prev => {
      const fromIndex = prev.findIndex(t => t.id === draggingId)
      const toIndex = prev.findIndex(t => t.id === id)
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return prev
      const actualizado = [...prev]
      const [movido] = actualizado.splice(fromIndex, 1)
      actualizado.splice(toIndex, 0, movido)
      return actualizado
    })
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverId(null)
    persistirOrden(torneos)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Trophy size={24} color="var(--color-accent)" />
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-textWH)' }}>
            Torneos
          </h1>
        </div>
        <button
          onClick={crearTorneo}
          disabled={creando}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px', borderRadius: '11px',
            background: 'var(--color-border)', color: 'var(--color-textWH)',
            fontWeight: '600', fontSize: '14px',
            opacity: creando ? 0.7 : 1, transition: 'opacity 0.2s',
            border: '1px solid transparent',
            cursor: creando ? 'not-allowed' : 'pointer',
          }}
        >
          {creando ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
          Nuevo torneo
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Cargando...</div>
      ) : torneos.length === 0 ? (
        <div style={{
          padding: '40px', borderRadius: '16px',
          border: '2px dashed var(--color-border)',
          textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px',
        }}>
          No hay torneos aún. Crea el primero.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {torneos.length > 1 && (
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '0 0 4px 4px' }}>
              Arrastra usando el ícono <GripVertical size={11} style={{ verticalAlign: 'middle' }} /> para reordenar los torneos.
            </p>
          )}
          {torneos.map(torneo => {
            const isDragging = draggingId === torneo.id
            const isDragOver = dragOverId === torneo.id && draggingId !== torneo.id
            return (
              <div
                key={torneo.id}
                draggable
                onDragStart={handleDragStart(torneo.id)}
                onDragOver={handleDragOver(torneo.id)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 14px', borderRadius: '12px',
                  background: 'var(--color-background)',
                  border: `2px solid ${isDragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  transition: 'border-color 0.15s, opacity 0.15s, transform 0.15s',
                  opacity: isDragging ? 0.5 : 1,
                  cursor: 'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    title="Arrastrar para reordenar"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '20px', height: '40px',
                      color: 'rgba(255,255,255,0.3)',
                      cursor: 'grab',
                      touchAction: 'none',
                    }}
                  >
                    <GripVertical size={16} />
                  </div>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '8px',
                    background: 'var(--color-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Trophy size={18} strokeWidth={2} color="var(--color-accent)" />
                  </div>
                  <div>
                    <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--color-textWH)', margin: 0 }}>
                      {[torneo.edicion, torneo.nombre].filter(Boolean).join(' ') || `Torneo ${torneo.numero}`}
                      {torneo.activo && (
                        <span style={{
                          marginLeft: '8px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: 'rgba(0,200,140,0.15)',
                          fontSize: '11px',
                          fontWeight: '700',
                          color: 'var(--color-accent)',
                        }}>
                          ACTIVO
                        </span>
                      )}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--color-accent)', marginTop: '2px', marginBottom: 0 }}>
                      {new Date(torneo.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setEstadoDropdownId(estadoDropdownId === torneo.id ? null : torneo.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '7px 12px', borderRadius: '20px',
                        background: ESTADO_COLORS[torneo.estado].bg,
                        border: `1px solid ${ESTADO_COLORS[torneo.estado].border}`,
                        color: ESTADO_COLORS[torneo.estado].text,
                        fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ESTADO_LABELS[torneo.estado]}
                    </button>
                    {estadoDropdownId === torneo.id && (
                      <>
                        <div
                          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                          onClick={() => setEstadoDropdownId(null)}
                        />
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                          background: 'var(--color-bgdark)', border: '1px solid var(--color-border)',
                          borderRadius: '10px', overflow: 'hidden', zIndex: 50,
                          minWidth: '150px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                        }}>
                          {(Object.keys(ESTADO_LABELS) as Torneo['estado'][]).map(estado => (
                            <button
                              key={estado}
                              onClick={() => { cambiarEstado(torneo, estado); setEstadoDropdownId(null) }}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '10px 14px',
                                background: estado === torneo.estado ? 'rgba(255,255,255,0.06)' : 'transparent',
                                border: 'none', color: ESTADO_COLORS[estado].text,
                                fontSize: '13px', fontWeight: '600', cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              <span style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: ESTADO_COLORS[estado].text, flexShrink: 0,
                              }} />
                              {ESTADO_LABELS[estado]}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setEliminando(torneo)}
                    title="Eliminar torneo"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '34px', height: '34px', borderRadius: '8px',
                      background: 'rgba(220,50,50,0.2)',
                      border: '1px solid rgba(220,50,50,0.7)',
                      color: 'var(--color-error)', cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    onClick={() => abrirModal(torneo)}
                    title="Editar torneo"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '34px', height: '34px', borderRadius: '8px',
                      background: 'var(--color-border)', border: '1px solid transparent',
                      color: 'rgba(255,255,255,1)', cursor: 'pointer',
                    }}
                  >
                    <Pencil size={15} strokeWidth={3} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal confirmar eliminar */}
      {eliminando && (
        <div style={OVERLAY} onClick={() => setEliminando(null)}>
          <div style={{ ...MODAL, maxWidth: '360px', gap: '16px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Trash2 size={18} color="var(--color-error)" />
              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>
                Eliminar torneo
              </span>
            </div>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              ¿Estás seguro de que deseas eliminar{' '}
              <strong style={{ color: 'var(--color-textWH)' }}>
                {[eliminando.edicion, eliminando.nombre].filter(Boolean).join(' ') || `Torneo ${eliminando.numero}`}
              </strong>? Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setEliminando(null)}
                style={{
                  flex: 1, padding: '11px', borderRadius: '10px',
                  background: 'transparent', border: '1px solid var(--color-border)',
                  color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={eliminarTorneo}
                disabled={confirmando}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '11px', borderRadius: '10px',
                  background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)',
                  color: 'var(--color-error)', fontSize: '14px', fontWeight: '700',
                  cursor: confirmando ? 'not-allowed' : 'pointer',
                  opacity: confirmando ? 0.7 : 1, transition: 'opacity 0.2s',
                }}
              >
                {confirmando ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal edición */}
      {modal && (
        <div style={OVERLAY} onClick={() => setModal(null)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px',
                  background: 'rgba(0,200,140,0.12)',
                  border: '1px solid rgba(0,200,140,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trophy size={14} color="var(--color-accent)" />
                </div>
                <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>
                  Torneo {modal.torneo.numero}
                </span>
              </div>
              <button
                onClick={() => setModal(null)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '30px', height: '30px', borderRadius: '8px',
                  background: 'transparent', border: 'none',
                  color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Número */}
            <div>
              <p style={LABEL}>Número</p>
              <input
                style={INPUT}
                type="number"
                value={modal.numero}
                onChange={e => setModal(m => m ? { ...m, numero: parseInt(e.target.value) || 0 } : m)}
              />
            </div>

            {/* Edición */}
            <div>
              <p style={LABEL}>Edición</p>
              <input
                style={INPUT}
                type="text"
                placeholder="Ej: 1ra Edición"
                value={modal.edicion}
                onChange={e => setModal(m => m ? { ...m, edicion: e.target.value } : m)}
              />
            </div>

            {/* Nombre */}
            <div>
              <p style={LABEL}>Nombre</p>
              <input
                style={INPUT}
                type="text"
                placeholder={`Torneo ${modal.numero}`}
                value={modal.nombre}
                onChange={e => setModal(m => m ? { ...m, nombre: e.target.value } : m)}
              />
            </div>

            {/* Fecha y hora de creación */}
            <div>
              <p style={LABEL}>Fecha de creación</p>
              <input
                style={INPUT}
                type="datetime-local"
                value={modal.created_at}
                onChange={e => setModal(m => m ? { ...m, created_at: e.target.value } : m)}
              />
            </div>

            {/* Estado */}
            <div>
              <p style={LABEL}>Estado</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(Object.keys(ESTADO_LABELS) as Torneo['estado'][]).map(est => (
                  <button
                    key={est}
                    onClick={() => setModal(m => m ? { ...m, estado: est } : m)}
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      borderRadius: '10px',
                      background: modal.estado === est ? ESTADO_COLORS[est].bg : 'transparent',
                      border: `1px solid ${modal.estado === est ? ESTADO_COLORS[est].border : 'var(--color-border)'}`,
                      color: modal.estado === est ? ESTADO_COLORS[est].text : 'rgba(255,255,255,0.5)',
                      fontWeight: '600',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {ESTADO_LABELS[est]}
                  </button>
                ))}
              </div>
            </div>

            {/* Activo */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={modal.activo}
                  onChange={e => setModal(m => m ? { ...m, activo: e.target.checked } : m)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
                />
                <span style={{ ...LABEL, marginBottom: 0 }}>Torneo activo</span>
              </label>
            </div>

            {/* Orden */}
            <div>
              <p style={LABEL}>Orden (posición en lista)</p>
              <input
                style={INPUT}
                type="number"
                value={modal.orden ?? ''}
                onChange={e => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value)
                  setModal(m => m ? { ...m, orden: isNaN(val as number) ? null : val } : m)
                }}
              />
            </div>

            <div>
              <p style={LABEL}>
                Equipos participantes{' '}
                <span style={{ color: 'var(--color-accent)', fontWeight: '700' }}>
                  {modal.equiposSeleccionados.length}/6
                </span>
              </p>
              {equipos.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                  No hay equipos creados aún.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {equipos.map(eq => {
                    const sel = modal.equiposSeleccionados.includes(eq.id)
                    return (
                      <button
                        key={eq.id}
                        onClick={() => toggleEquipo(eq.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 12px', borderRadius: '10px',
                          background: sel ? 'rgba(0,200,140,0.12)' : 'var(--color-background)',
                          border: `1px solid ${sel ? 'rgba(0,200,140,0.3)' : 'var(--color-border)'}`,
                          cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                        }}
                      >
                        {eq.escudo_url ? (
                          <img src={eq.escudo_url} alt={eq.nombre} style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                        ) : (
                          <div style={{
                            width: '28px', height: '28px', borderRadius: '6px',
                            background: 'var(--color-border)',
                          }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--color-textWH)' }}>
                            {eq.nombre}
                          </p>
                          <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                            {eq.dt}
                          </p>
                        </div>
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                          background: sel ? 'var(--color-accent)' : 'transparent',
                          border: `1.5px solid ${sel ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}>
                          {sel && <Check size={12} color="#000" strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <button
              onClick={guardar}
              disabled={guardando}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', borderRadius: '11px',
                background: 'var(--color-accent)', color: 'var(--color-bgdark)',
                fontWeight: '700', fontSize: '14px', border: 'none',
                cursor: guardando ? 'not-allowed' : 'pointer',
                opacity: guardando ? 0.7 : 1, transition: 'opacity 0.2s',
              }}
            >
              {guardando ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Guardar cambios
            </button>
          </div>
        </div>
      )}
    </div>
  )
}