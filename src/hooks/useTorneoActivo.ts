// src/hooks/useTorneoActivo.ts
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Torneo {
  id: string
  numero: number
  nombre: string | null
  edicion: string | null
  activo: boolean
  estado: 'en_curso' | 'terminado' | 'lost_media'
  created_at: string
  orden: number | null
}

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
        const ordenados = ordenarTorneos(data)
        setTorneos(ordenados)
        const activo = ordenados.find(t => t.activo) ?? ordenados[0]
        if (activo) setTorneoActivo(activo)
      }
    }
    fetchTorneos()
  }, [])

  return { torneos, torneoActivo, setTorneoActivo }
}