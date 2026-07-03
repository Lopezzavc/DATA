// src/hooks/useTorneoActivo.ts
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Torneo {
  id: string
  numero: number
  nombre: string | null
  activo: boolean
  estado: 'en_curso' | 'finalizado'
  created_at: string
}

export function useTorneoActivo() {
  const [torneos, setTorneos] = useState<Torneo[]>([])
  const [torneoActivo, setTorneoActivo] = useState<Torneo | null>(null)

  useEffect(() => {
    const fetchTorneos = async () => {
      const { data } = await supabase
        .from('torneos')
        .select('*')
        .order('numero', { ascending: false })
      if (data) {
        setTorneos(data)
        const activo = data.find(t => t.activo) ?? data[0]
        if (activo) setTorneoActivo(activo)
      }
    }
    fetchTorneos()
  }, [])

  return { torneos, torneoActivo, setTorneoActivo }
}