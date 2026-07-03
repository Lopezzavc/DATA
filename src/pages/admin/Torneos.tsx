import { useEffect, useState } from 'react'
import { Trophy, Plus, Loader2, Pencil, X, Save, Trash2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTorneo } from '../../context/TorneoContext'

interface Torneo {
  id: string
  numero: number
  nombre: string | null
  edicion: string | null
  activo: boolean
  estado: 'en_curso' | 'finalizado'
  created_at: string
}

interface Equipo {
  id: string
  nombre: string
  dt: string
  escudo_url: string | null
}

interface ModalState {
  torneo: Torneo
  nombre: string
  edicion: string
  fecha: string
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

export default function Torneos() {
  const [torneos, setTorneos] = useState<Torneo[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [loading, setLoading] = useState(true)
  const [creando, setCreando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [eliminando, setEliminando] = useState<Torneo | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const { setTorneoSeleccionado, refreshTorneos } = useTorneo()

  const fetchTorneos = async () => {
    const { data } = await supabase
      .from('torneos')
      .select('*')
      .order('numero', { ascending: false })
    if (data) setTorneos(data as Torneo[])
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
    const fecha = torneo.created_at
      ? new Date(torneo.created_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
    setModal({
      torneo,
      nombre: torneo.nombre ?? '',
      edicion: torneo.edicion ?? '',
      fecha,
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
    const fechaISO = new Date(modal.fecha + 'T12:00:00').toISOString()

    const { data } = await supabase
      .from('torneos')
      .update({
        nombre: modal.nombre || null,
        edicion: modal.edicion || null,
        created_at: fechaISO,
      })
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
          {torneos.map(torneo => (
            <div
              key={torneo.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 14px', borderRadius: '12px',
                background: 'var(--color-background)',
                border: '2px solid var(--color-border)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '8px',
                  background: 'var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trophy size={18} strokeWidth={2} color="var(--color-accent)" />
                </div>
                <div>
                  <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--color-textWH)', margin: 0 }}>
                    {torneo.edicion || torneo.nombre || `Torneo ${torneo.numero}`}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--color-accent)', marginTop: '2px', marginBottom: 0 }}>
                    {new Date(torneo.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          ))}
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
                {eliminando.edicion || eliminando.nombre || `Torneo ${eliminando.numero}`}
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

            <div>
              <p style={LABEL}>Nombre</p>
              <input
                style={INPUT}
                type="text"
                placeholder={`Torneo ${modal.torneo.numero}`}
                value={modal.nombre}
                onChange={e => setModal(m => m ? { ...m, nombre: e.target.value } : m)}
              />
            </div>

            <div>
              <p style={LABEL}>Fecha</p>
              <input
                style={INPUT}
                type="date"
                value={modal.fecha}
                onChange={e => setModal(m => m ? { ...m, fecha: e.target.value } : m)}
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