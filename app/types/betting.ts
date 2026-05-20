export type Grade = 'safe' | 'reasonable' | 'risky'

export type RecentRow = {
  id: string
  goalsFor: string
  goalsAgainst: string
  cornersFor: string
  cornersAgainst: string
  cardsFor: string
  cardsAgainst: string
}

export type MatchData = {
  local: string
  visitante: string
  oddLocal: string
  oddDraw: string
  oddVisit: string
}

export type Pick = {
  id: string
  label: string
  probability: number
  odd: number
  edge: number
  confidence: number
  grade: Grade
}