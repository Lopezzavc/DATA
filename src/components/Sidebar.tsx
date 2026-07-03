import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Users, Trophy, LogOut, ChevronDown, Calendar, Table } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTorneo } from '../context/TorneoContext'
import logo from '../assets/logo.png'
import { GitBranch } from 'lucide-react'

export default function Sidebar() {
  const navigate = useNavigate()
  const { torneos, torneoSeleccionado, setTorneoSeleccionado } = useTorneo()
  const [desplegableAbierto, setDesplegableAbierto] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  const navStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 14px',
    borderRadius: '11px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '600',
    color: isActive ? 'var(--color-accent)' : 'rgba(255,255,255,0.6)',
    background: isActive ? 'rgba(0,200,140,0.1)' : 'transparent',
    border: isActive ? '1px solid rgba(0,200,140,0.2)' : '1px solid transparent',
    transition: 'all 0.2s',
  })

  const textoMostrado = (t: any) => t.edicion || `Torneo ${t.numero}`

  return (
    <div style={{
      width: '220px',
      minHeight: '100vh',
      background: 'var(--color-bgdark)',
      borderRight: '2px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '32px 16px',
      gap: '4px',
      position: 'fixed',
      top: 0,
      left: 0,
    }}>
      <img src={logo} alt="DATA" style={{ height: '36px', objectFit: 'contain', marginBottom: '32px' }} />

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        <NavLink to="/admin/equipos" style={({ isActive }) => navStyle(isActive)}>
          <Users size={18} />
          Equipos
        </NavLink>

        <NavLink to="/admin/torneos" style={({ isActive }) => navStyle(isActive)}>
          <Trophy size={18} />
          Torneos
        </NavLink>

        {/* Desplegable torneos */}
        {torneos.length > 0 && (
          <div style={{
            marginTop: '8px',
            background: 'var(--color-background)',
            border: '2px solid var(--color-border)',
            borderRadius: '12px',
            overflow: 'hidden',
            transition: 'all 0.2s',
          }}>
            {/* Trigger */}
            <button
              onClick={() => setDesplegableAbierto(!desplegableAbierto)}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px',
                background: 'transparent', border: 'none',
                cursor: 'pointer', transition: 'background 0.2s',
                color: torneoSeleccionado ? 'var(--color-textWH)' : 'rgba(255,255,255,0.6)',
              }}
            >
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                background: torneoSeleccionado ? 'rgba(0,200,140,0.12)' : 'var(--color-border)',
                border: `1px solid ${torneoSeleccionado ? 'rgba(0,200,140,0.3)' : 'transparent'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Trophy size={14} color={torneoSeleccionado ? 'var(--color-accent)' : 'rgba(255,255,255,0.3)'} />
              </div>
              <span style={{
                flex: 1, textAlign: 'left',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontSize: '13px', fontWeight: '600',
              }}>
                {torneoSeleccionado ? textoMostrado(torneoSeleccionado) : 'Seleccionar torneo'}
              </span>
              <ChevronDown
                size={14}
                color="rgba(255,255,255,0.4)"
                style={{
                  transform: desplegableAbierto ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s',
                  flexShrink: 0,
                }}
              />
            </button>

            {/* Lista */}
            {desplegableAbierto && (
              <div style={{
                borderTop: '1px solid var(--color-border)',
                display: 'flex', flexDirection: 'column', gap: '2px',
                padding: '6px',
              }}>
                {torneos.map(t => {
                  const sel = torneoSeleccionado?.id === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTorneoSeleccionado(t)
                        setDesplegableAbierto(false)
                      }}
                      style={{
                        width: '100%',
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: sel ? 'rgba(0,200,140,0.12)' : 'transparent',
                        border: sel ? '1px solid rgba(0,200,140,0.3)' : '1px solid transparent',
                        cursor: 'pointer', transition: 'all 0.15s',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0,
                        background: sel ? 'rgba(0,200,140,0.18)' : 'var(--color-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Trophy size={12} color={sel ? 'var(--color-accent)' : 'rgba(255,255,255,0.3)'} />
                      </div>
                      <span style={{
                        flex: 1,
                        fontSize: '12px', fontWeight: sel ? '600' : '400',
                        color: sel ? 'var(--color-textWH)' : 'rgba(255,255,255,0.6)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {textoMostrado(t)}
                      </span>
                      {sel && (
                        <div style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: 'var(--color-accent)', flexShrink: 0,
                        }} />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Links contextuales al torneo seleccionado */}
        {torneoSeleccionado && (
          <div style={{
            marginTop: '4px',
            display: 'flex', flexDirection: 'column', gap: '2px',
            paddingLeft: '8px',
            borderLeft: '2px solid rgba(0,200,140,0.4)',
          }}>
            <NavLink to="/admin/partidos-grupo" style={({ isActive }) => navStyle(isActive)}>
              <Calendar size={16} />
              Partidos grupo
            </NavLink>
            <NavLink to="/admin/clasificatoria-grupos" style={({ isActive }) => navStyle(isActive)}>
              <Table size={16} />
              Clasif. grupos
            </NavLink>
            <NavLink to="/admin/eliminatorias" style={({ isActive }) => navStyle(isActive)}>
              <GitBranch size={16} />
              Eliminatorias
            </NavLink>
          </div>
        )}
      </nav>

      <button
        onClick={handleLogout}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 14px', borderRadius: '11px',
          background: 'transparent', border: '1px solid transparent',
          color: 'rgba(255,255,255,0.4)', fontSize: '14px', fontWeight: '600',
          transition: 'all 0.2s', width: '100%', cursor: 'pointer',
        }}
        onMouseEnter={e => {
          const b = e.currentTarget
          b.style.color = 'var(--color-error)'
          b.style.background = 'rgba(255,77,77,0.1)'
          b.style.border = '1px solid rgba(255,77,77,0.2)'
        }}
        onMouseLeave={e => {
          const b = e.currentTarget
          b.style.color = 'rgba(255,255,255,0.4)'
          b.style.background = 'transparent'
          b.style.border = '1px solid transparent'
        }}
      >
        <LogOut size={18} />
        Cerrar sesión
      </button>
    </div>
  )
}