import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Public from './pages/Public'
import AdminLayout from './components/AdminLayout'
import ProtectedRoute from './components/ProtectedRoute'
import Torneos from './pages/admin/Torneos'
import Equipos from './pages/admin/Equipos'
import Partidos from './pages/admin/Partidos'
import Estadisticas from './pages/admin/Estadisticas'
import PartidosGrupo from './pages/admin/PartidosGrupo'
import ClasificatoriaGrupos from './pages/admin/ClasificatoriaGrupos'
import Eliminatorias from './pages/admin/Eliminatorias'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Public />} />
      <Route path="/admin/login" element={<Login />} />
      <Route
        path="/admin"
        element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}
      >
        <Route index element={<Navigate to="/admin/torneos" replace />} />
        <Route path="torneos" element={<Torneos />} />
        <Route path="equipos" element={<Equipos />} />
        <Route path="partidos" element={<Partidos />} />
        <Route path="estadisticas" element={<Estadisticas />} />
        <Route path="partidos-grupo" element={<PartidosGrupo />} />
        <Route path="/admin/clasificatoria-grupos" element={<ClasificatoriaGrupos />} />
        <Route path="eliminatorias" element={<Eliminatorias />} />

      </Route>
    </Routes>
  )
}

export default App