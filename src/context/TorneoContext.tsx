import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Torneo {
  id: string
  numero: number
  nombre: string | null
  activo: boolean
  estado: 'en_curso' | 'finalizado'
  created_at: string
}

interface TorneoContextType {
  torneos: Torneo[]
  torneoSeleccionado: Torneo | null
  setTorneoSeleccionado: (torneo: Torneo) => void
  refreshTorneos: () => Promise<void>
  loading: boolean
}

const TorneoContext = createContext<TorneoContextType | null>(null)

export function TorneoProvider({ children }: { children: React.ReactNode }) {
  const [torneos, setTorneos] = useState<Torneo[]>([])
  const [torneoSeleccionado, setTorneoSeleccionado] = useState<Torneo | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTorneos = async () => {
    const { data } = await supabase
      .from('torneos')
      .select('*')
      .order('numero', { ascending: false })
    if (data) {
      setTorneos(data)
      if (!torneoSeleccionado) {
        const activo = data.find(t => t.activo) ?? data[0]
        if (activo) setTorneoSeleccionado(activo)
      }
    }
    setLoading(false)
  }

  useEffect(() => { fetchTorneos() }, [])

  return (
    <TorneoContext.Provider value={{ torneos, torneoSeleccionado, setTorneoSeleccionado, refreshTorneos: fetchTorneos, loading }}>
      {children}
    </TorneoContext.Provider>
  )
}

export function useTorneo() {
  const ctx = useContext(TorneoContext)
  if (!ctx) throw new Error('useTorneo debe usarse dentro de TorneoProvider')
  return ctx
}