export function impliedProbability(odd: number) {
  if (!odd || odd <= 1) return 0
  return 100 / odd
}

export function calculateEdge(model: number, odd: number) {
  return model - impliedProbability(odd)
}

export function kellyStake(probability: number, odd: number, bankroll: number) {
  const p = probability / 100
  const q = 1 - p
  const b = odd - 1

  const kelly = (b * p - q) / b

  return Math.max(0, bankroll * kelly * 0.5)
}