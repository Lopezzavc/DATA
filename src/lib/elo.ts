// src/lib/elo.ts
//
// ─── Lógica pura del sistema de clasificación ELO ───
// Este módulo NO conoce Supabase ni React. Solo recibe una lista de partidos
// ya ordenados/normalizados y devuelve el resultado del cálculo. Esto permite
// reutilizar el mismo algoritmo para:
//   - Reconstruir el historial completo (todas las ediciones)
//   - Procesar únicamente partidos nuevos (si se guarda estado persistido)
//   - Generar simulaciones futuras
//
// El cálculo es 100% determinista: mismos partidos + mismo orden => mismo resultado.

export const ELO_INICIAL = 1500

// ─── Valores de K según la importancia deportiva de la fase ───
export const K_GRUPOS = 20
export const K_SEMIFINAL = 30
export const K_FINAL = 40

export interface PartidoParaElo {
  id: string
  equipo_local_id: string
  equipo_visitante_id: string
  goles_local: number | null
  goles_visitante: number | null
  fase?: string | null
  ronda?: string | null
  inicio_timestamp?: string | null
  confirmado: boolean
}

export interface EloEntry {
  partidoId: string
  equipoLocalId: string
  equipoVisitanteId: string

  eloLocalAntes: number
  eloVisitanteAntes: number

  probabilidadEsperadaLocal: number
  probabilidadEsperadaVisitante: number

  resultadoRealLocal: number // 1 victoria, 0.5 empate, 0 derrota
  resultadoRealVisitante: number

  k: number

  puntosLocal: number // positivo o negativo, ganados/perdidos por el local
  puntosVisitante: number

  eloLocalDespues: number
  eloVisitanteDespues: number
}

export interface ResultadoCalculoElo {
  // ELO actual (más reciente) de cada equipo, al final de recorrer todos los partidos
  eloActualPorEquipo: Record<string, number>
  // Historial completo, uno por partido procesado, en el mismo orden cronológico
  historial: EloEntry[]
  // Acceso directo O(1) al registro ELO de un partido por su id
  historialPorPartidoId: Record<string, EloEntry>
}

/**
 * Determina el valor de K según la fase/ronda del partido.
 *   - Final          -> K_FINAL
 *   - Semifinal       -> K_SEMIFINAL (cualquier partido de fase "eliminatorias" que no sea la final)
 *   - Fase de grupos  -> K_GRUPOS
 */
export function kParaPartido(partido: Pick<PartidoParaElo, 'fase' | 'ronda'>): number {
  if (partido.ronda === 'final') return K_FINAL
  if (partido.fase === 'eliminatorias') return K_SEMIFINAL
  return K_GRUPOS
}

/**
 * Probabilidad esperada de victoria del equipo A frente al equipo B,
 * según la fórmula clásica del modelo Elo (la misma que usa FIFA).
 */
export function probabilidadEsperada(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400))
}

/**
 * Ordena los partidos de forma determinista y exclusivamente por `inicio_timestamp`.
 * Partidos sin inicio_timestamp se consideran inválidos para el cálculo ELO y se excluyen
 * (no hay forma determinista de ubicarlos cronológicamente).
 */
export function ordenarPartidosParaElo(partidos: PartidoParaElo[]): PartidoParaElo[] {
  return partidos
    .filter(p => p.confirmado && p.goles_local != null && p.goles_visitante != null && p.inicio_timestamp)
    .slice()
    .sort((a, b) => new Date(a.inicio_timestamp!).getTime() - new Date(b.inicio_timestamp!).getTime())
}

/**
 * Recorre TODOS los partidos en orden cronológico y calcula el ELO acumulado
 * de cada equipo, partido a partido, junto con el historial detallado de cada
 * actualización (para poder auditar y para poder mostrar ELO antes/después en
 * cada card del historial de partidos).
 *
 * Determinista: siempre parte de ELO_INICIAL = 1500 para cada equipo la primera
 * vez que aparece, y no depende de nada externo (fecha de ejecución, orden de
 * llegada de la query, etc.) más que del propio orden cronológico de los partidos.
 */
export function calcularEloHistorico(partidosCrudos: PartidoParaElo[]): ResultadoCalculoElo {
  const partidosOrdenados = ordenarPartidosParaElo(partidosCrudos)

  const eloActualPorEquipo: Record<string, number> = {}
  const historial: EloEntry[] = []
  const historialPorPartidoId: Record<string, EloEntry> = {}

  const obtenerEloActual = (equipoId: string): number => {
    if (!(equipoId in eloActualPorEquipo)) {
      eloActualPorEquipo[equipoId] = ELO_INICIAL
    }
    return eloActualPorEquipo[equipoId]
  }

  for (const partido of partidosOrdenados) {
    const eloLocalAntes = obtenerEloActual(partido.equipo_local_id)
    const eloVisitanteAntes = obtenerEloActual(partido.equipo_visitante_id)

    const probabilidadEsperadaLocal = probabilidadEsperada(eloLocalAntes, eloVisitanteAntes)
    const probabilidadEsperadaVisitante = 1 - probabilidadEsperadaLocal

    const golesLocal = partido.goles_local as number
    const golesVisitante = partido.goles_visitante as number

    let resultadoRealLocal: number
    let resultadoRealVisitante: number
    if (golesLocal > golesVisitante) {
      resultadoRealLocal = 1
      resultadoRealVisitante = 0
    } else if (golesLocal < golesVisitante) {
      resultadoRealLocal = 0
      resultadoRealVisitante = 1
    } else {
      resultadoRealLocal = 0.5
      resultadoRealVisitante = 0.5
    }

    const k = kParaPartido(partido)

    const puntosLocal = k * (resultadoRealLocal - probabilidadEsperadaLocal)
    const puntosVisitante = k * (resultadoRealVisitante - probabilidadEsperadaVisitante)

    const eloLocalDespues = eloLocalAntes + puntosLocal
    const eloVisitanteDespues = eloVisitanteAntes + puntosVisitante

    eloActualPorEquipo[partido.equipo_local_id] = eloLocalDespues
    eloActualPorEquipo[partido.equipo_visitante_id] = eloVisitanteDespues

    const entry: EloEntry = {
      partidoId: partido.id,
      equipoLocalId: partido.equipo_local_id,
      equipoVisitanteId: partido.equipo_visitante_id,
      eloLocalAntes,
      eloVisitanteAntes,
      probabilidadEsperadaLocal,
      probabilidadEsperadaVisitante,
      resultadoRealLocal,
      resultadoRealVisitante,
      k,
      puntosLocal,
      puntosVisitante,
      eloLocalDespues,
      eloVisitanteDespues,
    }

    historial.push(entry)
    historialPorPartidoId[partido.id] = entry
  }

  return { eloActualPorEquipo, historial, historialPorPartidoId }
}