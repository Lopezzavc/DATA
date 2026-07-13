import { useEffect, useState } from 'react'
import { Users, Plus, Loader2, Pencil, X, Save, Trash2, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'

import bTeam from '../../assets/escudos/b-team.png'
import flagrantFowl from '../../assets/escudos/flagrant-fowl.png'
import troublesBruin from '../../assets/escudos/troubles-bruin.png'
import badCattitude from '../../assets/escudos/bad-cattitude.png'
import piggyInPink from '../../assets/escudos/piggy-in-pink.png'
import milkBuds from '../../assets/escudos/milk-buds.png'
import tWrecks from '../../assets/escudos/t-wrecks.png'
import snowBallers from '../../assets/escudos/snow-ballers.png'

const ESCUDOS = [
  { label: 'B-Team',         src: bTeam },
  { label: 'Flagrant Fowl',  src: flagrantFowl },
  { label: 'Troubles Bruin', src: troublesBruin },
  { label: 'Bad Cattitude',  src: badCattitude },
  { label: 'Piggy in Pink',  src: piggyInPink },
  { label: 'Milk Buds',      src: milkBuds },
  { label: 'T-Wrecks',       src: tWrecks },
  { label: 'Snow Ballers',   src: snowBallers },
]

interface Equipo {
  id: string
  nombre: string
  dt: string
  escudo_url: string | null
  campeonatos: number
  created_at: string
  color_hex?: string | null
}

interface ModalState {
  equipo: Equipo | null
  nombre: string
  dt: string
  escudo_url: string | null
  campeonatos: number
  color_hex: string
  created_at: string // formato datetime-local: YYYY-MM-DDTHH:mm
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
const MODAL: React.CSSProperties = {
  background: 'var(--color-bgdark)', border: '1px solid var(--color-border)',
  borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '440px',
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

// Convierte fecha ISO a formato compatible con input datetime-local
const toDatetimeLocal = (isoString?: string | null): string => {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16) // 'YYYY-MM-DDTHH:mm'
}

const modalVacio = (): ModalState => ({
  equipo: null,
  nombre: '',
  dt: '',
  escudo_url: null,
  campeonatos: 0,
  color_hex: '#00C88C',
  created_at: toDatetimeLocal(new Date().toISOString()), // por defecto ahora
})

export default function Equipos() {
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [eliminando, setEliminando] = useState<Equipo | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [escudoAbierto, setEscudoAbierto] = useState(false)

  const fetchEquipos = async () => {
    const { data } = await supabase.from('equipos').select('*').order('created_at', { ascending: true })
    if (data) setEquipos(data as Equipo[])
    setLoading(false)
  }

  useEffect(() => { fetchEquipos() }, [])

  const abrirCrear = () => { setEscudoAbierto(false); setModal(modalVacio()) }
  const abrirEditar = (equipo: Equipo) => {
    setEscudoAbierto(false)
    setModal({
      equipo,
      nombre: equipo.nombre,
      dt: equipo.dt,
      escudo_url: equipo.escudo_url,
      campeonatos: equipo.campeonatos,
      color_hex: equipo.color_hex || '#00C88C',
      created_at: toDatetimeLocal(equipo.created_at),
    })
  }

  const guardar = async () => {
    if (!modal || !modal.nombre.trim() || !modal.dt.trim()) return
    setGuardando(true)
    const payload: Record<string, any> = {
      nombre: modal.nombre.trim(),
      dt: modal.dt.trim(),
      escudo_url: modal.escudo_url,
      campeonatos: modal.campeonatos,
      color_hex: modal.color_hex,
    }
    // Si hay una fecha definida, la enviamos (convertida a ISO)
    if (modal.created_at) {
      payload.created_at = new Date(modal.created_at).toISOString()
    }
    if (modal.equipo) {
      await supabase.from('equipos').update(payload).eq('id', modal.equipo.id)
    } else {
      await supabase.from('equipos').insert(payload)
    }
    await fetchEquipos()
    setGuardando(false)
    setModal(null)
  }

  const eliminarEquipo = async () => {
    if (!eliminando) return
    setConfirmando(true)
    await supabase.from('equipos').delete().eq('id', eliminando.id)
    await fetchEquipos()
    setConfirmando(false)
    setEliminando(null)
  }

  const escudoSeleccionado = (url: string | null) => ESCUDOS.find(e => e.src === url) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Users size={24} color="var(--color-accent)" />
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-textWH)' }}>Equipos</h1>
        </div>
        <button
          onClick={abrirCrear}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px', borderRadius: '11px',
            background: 'var(--color-border)', color: 'var(--color-textWH)',
            fontWeight: '600', fontSize: '14px', border: '1px solid transparent', cursor: 'pointer',
          }}
        >
          <Plus size={16} /> Nuevo equipo
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Cargando...</div>
      ) : equipos.length === 0 ? (
        <div style={{
          padding: '40px', borderRadius: '16px', border: '2px dashed var(--color-border)',
          textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px',
        }}>
          No hay equipos aún. Crea el primero.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {equipos.map(equipo => (
            <div key={equipo.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 14px', borderRadius: '12px',
              background: 'var(--color-background)',
              border: '2px solid var(--color-border)', transition: 'all 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {equipo.escudo_url
                  ? <img src={equipo.escudo_url} alt={equipo.nombre} style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                  : <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Users size={18} color="rgba(255,255,255,0.2)" />
                    </div>
                }
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--color-textWH)', margin: 0 }}>
                    {equipo.nombre}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--color-accent)', marginTop: '2px', marginBottom: 0 }}>
                    DT: {equipo.dt}
                    {equipo.campeonatos > 0 && (
                      <span style={{ marginLeft: '10px', color: 'rgba(255,200,0,0.7)' }}>
                        🏆 {equipo.campeonatos}
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', marginBottom: 0 }}>
                    Creado: {new Date(equipo.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Color picker circular */}
                <label style={{ position: 'relative', width: '24px', height: '24px', cursor: 'pointer' }}>
                  <input
                    type="color"
                    value={equipo.color_hex || '#00C88C'}
                    onChange={async (e) => {
                      const newColor = e.target.value
                      await supabase.from('equipos').update({ color_hex: newColor }).eq('id', equipo.id)
                      setEquipos(prev =>
                        prev.map(eq => eq.id === equipo.id ? { ...eq, color_hex: newColor } : eq)
                      )
                    }}
                    style={{
                      position: 'absolute',
                      opacity: 0,
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                    }}
                  />
                  <div style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    background: equipo.color_hex || '#00C88C',
                    border: '2px solid var(--color-border)',
                    boxShadow: 'inset 0 0 2px rgba(0,0,0,0.2)',
                  }} />
                </label>

                <button onClick={() => setEliminando(equipo)} title="Eliminar equipo" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '34px', height: '34px', borderRadius: '8px',
                  background: 'rgba(220,50,50,0.2)', border: '1px solid rgba(220,50,50,0.7)',
                  color: 'var(--color-error)', cursor: 'pointer',
                }}>
                  <Trash2 size={15} />
                </button>
                <button onClick={() => abrirEditar(equipo)} title="Editar equipo" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '34px', height: '34px', borderRadius: '8px',
                  background: 'var(--color-border)', border: '1px solid transparent',
                  color: 'rgba(255,255,255,1)', cursor: 'pointer',
                }}>
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
              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>Eliminar equipo</span>
            </div>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              ¿Estás seguro de que deseas eliminar{' '}
              <strong style={{ color: 'var(--color-textWH)' }}>{eliminando.nombre}</strong>?
              Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setEliminando(null)} style={{
                flex: 1, padding: '11px', borderRadius: '10px',
                background: 'transparent', border: '1px solid var(--color-border)',
                color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={eliminarEquipo} disabled={confirmando} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '11px', borderRadius: '10px',
                background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)',
                color: 'var(--color-error)', fontSize: '14px', fontWeight: '700',
                cursor: confirmando ? 'not-allowed' : 'pointer', opacity: confirmando ? 0.7 : 1,
              }}>
                {confirmando ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear / editar */}
      {modal && (
        <div style={OVERLAY} onClick={() => setModal(null)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={18} color="var(--color-accent)" />
                <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-textWH)' }}>
                  {modal.equipo ? 'Editar equipo' : 'Nuevo equipo'}
                </span>
              </div>
              <button onClick={() => setModal(null)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '30px', height: '30px', borderRadius: '8px',
                background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
              }}>
                <X size={16} />
              </button>
            </div>

            {/* Escudo */}
            <div>
              <p style={LABEL}>Escudo</p>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setEscudoAbierto(!escudoAbierto)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid var(--color-border)', background: 'var(--color-background)',
                  color: 'var(--color-textWH)', fontSize: '14px', cursor: 'pointer', boxSizing: 'border-box',
                }}>
                  {modal.escudo_url
                    ? <img src={modal.escudo_url} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                    : <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={14} color="rgba(255,255,255,0.3)" />
                      </div>
                  }
                  <span style={{ flex: 1, textAlign: 'left', color: modal.escudo_url ? 'var(--color-textWH)' : 'rgba(255,255,255,0.3)' }}>
                    {escudoSeleccionado(modal.escudo_url)?.label ?? 'Seleccionar escudo'}
                  </span>
                  <ChevronDown size={16} color="rgba(255,255,255,0.4)" style={{ transform: escudoAbierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {escudoAbierto && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 10,
                    background: 'var(--color-bgdark)', border: '1px solid var(--color-border)',
                    borderRadius: '12px', padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px',
                  }}>
                    {ESCUDOS.map(e => (
                      <button key={e.label} onClick={() => { setModal(m => m ? { ...m, escudo_url: e.src } : m); setEscudoAbierto(false) }} title={e.label} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                        padding: '8px 4px', borderRadius: '8px', cursor: 'pointer',
                        background: modal.escudo_url === e.src ? 'rgba(0,200,140,0.1)' : 'transparent',
                        border: `1px solid ${modal.escudo_url === e.src ? 'rgba(0,200,140,0.3)' : 'transparent'}`,
                        transition: 'all 0.15s',
                      }}>
                        <img src={e.src} alt={e.label} style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: '1.2' }}>{e.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Nombre */}
            <div>
              <p style={LABEL}>Nombre del equipo</p>
              <input style={INPUT} type="text" placeholder="Ej: Fimosis" value={modal.nombre}
                onChange={e => setModal(m => m ? { ...m, nombre: e.target.value } : m)} />
            </div>

            {/* DT */}
            <div>
              <p style={LABEL}>Director técnico</p>
              <input style={INPUT} type="text" placeholder="Nombre del DT" value={modal.dt}
                onChange={e => setModal(m => m ? { ...m, dt: e.target.value } : m)} />
            </div>

            {/* Campeonatos */}
            <div>
              <p style={LABEL}>Campeonatos</p>
              <input style={INPUT} type="number" min={0} value={modal.campeonatos}
                onChange={e => setModal(m => m ? { ...m, campeonatos: parseInt(e.target.value) || 0 } : m)} />
            </div>

            {/* Fecha de creación */}
            <div>
              <p style={LABEL}>Fecha de creación</p>
              <input
                style={INPUT}
                type="datetime-local"
                value={modal.created_at}
                onChange={e => setModal(m => m ? { ...m, created_at: e.target.value } : m)}
              />
            </div>

            {/* Color representativo */}
            <div>
              <p style={LABEL}>Color representativo</p>
              <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '36px', cursor: 'pointer' }}>
                <input
                  type="color"
                  value={modal.color_hex}
                  onChange={e => setModal(m => m ? { ...m, color_hex: e.target.value } : m)}
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    width: '100%',
                    height: '100%',
                    cursor: 'pointer',
                  }}
                />
                <div style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: modal.color_hex,
                  border: '2px solid var(--color-border)',
                  boxShadow: 'inset 0 0 3px rgba(0,0,0,0.3)',
                }} />
              </label>
            </div>

            {/* Guardar */}
            <button onClick={guardar} disabled={guardando || !modal.nombre.trim() || !modal.dt.trim()} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '12px', borderRadius: '11px',
              background: 'var(--color-accent)', color: 'var(--color-bgdark)',
              fontWeight: '700', fontSize: '14px', border: 'none',
              cursor: (guardando || !modal.nombre.trim() || !modal.dt.trim()) ? 'not-allowed' : 'pointer',
              opacity: (guardando || !modal.nombre.trim() || !modal.dt.trim()) ? 0.5 : 1,
            }}>
              {guardando ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              {modal.equipo ? 'Guardar cambios' : 'Crear equipo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}