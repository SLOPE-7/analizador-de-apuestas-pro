import { calculateEdge } from '@/lib/probability'

export function analyzeValue(
  probability: number,
  odd: number
) {
  const edge = calculateEdge(probability, odd)

  return {
    edge,
    hasValue: edge >= 5,
    tier:
      edge >= 10
        ? 'ELITE'
        : edge >= 5
        ? 'GOOD'
        : 'BAD'
  }
}