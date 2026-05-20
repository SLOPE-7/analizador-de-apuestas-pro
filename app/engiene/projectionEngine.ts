import { average, toNumber } from '@/lib/math'
import { RecentRow } from '@/types/betting'

export function buildProjection(
  local: RecentRow[],
  visitante: RecentRow[]
) {
  const localGoals = average(
    local.map(r => toNumber(r.goalsFor))
  )

  const visitGoals = average(
    visitante.map(r => toNumber(r.goalsFor))
  )

  const localCorners = average(
    local.map(r => toNumber(r.cornersFor))
  )

  const visitCorners = average(
    visitante.map(r => toNumber(r.cornersFor))
  )

  return {
    expectedGoals: localGoals + visitGoals,
    expectedCorners: localCorners + visitCorners,
    localGoals,
    visitGoals
  }
}