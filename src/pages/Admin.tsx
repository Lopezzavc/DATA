import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Admin() {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  return (
    <div>
      <h1>Panel Administrador</h1>
      <button onClick={handleLogout}>Cerrar sesión</button>
    </div>
  )
}