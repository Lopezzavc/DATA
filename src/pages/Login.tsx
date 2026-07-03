import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.png'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Credenciales incorrectas')
      setLoading(false)
    } else {
      navigate('/admin')
    }
  }

  const inputStyle = {
    background: 'var(--color-bgdark)',
    border: '2px solid var(--color-border)',
    borderRadius: '11px',
    padding: '12px 16px',
    color: 'var(--color-textWH)',
    fontSize: '14px',
    width: '100%',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--color-background)',
        border: '2px solid var(--color-border)',
        borderRadius: '16px',
        padding: '5px 5px',
        paddingTop: '35px',
        width: '100%',
        maxWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '32px',
      }}>
        <img src={logo} alt="DATA" style={{ height: '40px', objectFit: 'contain' }} />

        <form onSubmit={handleLogin} style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
        }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
          />

          <div style={{ position: 'relative', width: '100%' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{ ...inputStyle, paddingRight: '48px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                color: 'rgba(0,200,140,1)',
                fontSize: '13px',
                fontWeight: '700',
                padding: '4px 6px',
                borderRadius: '6px',
              }}
            >
              {showPassword ? 'OCULTAR' : 'VER'}
            </button>
          </div>

          {error && (
            <p style={{ color: 'var(--color-error)', fontSize: '13px', textAlign: 'center' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'var(--color-border)',
              color: 'var(--color-textWH)',
              fontWeight: '700',
              fontSize: '14px',
              padding: '12px',
              borderRadius: '11px',
              width: '100%',
              marginTop: '8px',
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}