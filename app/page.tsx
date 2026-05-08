"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type TeamSide = "local" | "visitante" | "h2h" | "ambos";
type IndicatorPeriod = "full" | "first" | "second" | "h2h";
type MatchResult = "" | "G" | "E" | "P";
type Grade = "safe" | "reasonable" | "risky";
type MatchProfileType = "abierto" | "cerrado" | "trampa" | "equilibrado";
type MarketGroup = "goals" | "corners" | "cards";
type BackgroundMode = "team" | "stadium" | "neon" | "dark";
type TrapLevel = "valor_real" | "linea_comoda" | "linea_estrecha" | "linea_sospechosa" | "trampa_probable" | "neutral";
type EliminationLeg = "none" | "first" | "second";
type EliminationSide = "none" | "local" | "visitante";
type RefereeStrictness = "none" | "low" | "medium" | "high";

type Indicator = {
  id: string;
  team: TeamSide;
  period: IndicatorPeriod;
  market: string;
  line: string;
  record: string;
  houseOdd: string;
};

type Match = {
  local: string;
  visitante: string;
  oddLocal: string;
  oddDraw: string;
  oddVisit: string;
  localColor1: string;
  localColor2: string;
  visitColor1: string;
  visitColor2: string;
  backgroundMode: BackgroundMode;
  backgroundImage: string;
};

type RecentRow = {
  id: string;
  goalsFor: string;
  goalsAgainst: string;
  cornersFor: string;
  cornersAgainst: string;
  cardsFor: string;
  cardsAgainst: string;
};

type HouseMarket = {
  goalsOverLine: string;
  goalsOverOdd: string;
  goalsUnderLine: string;
  goalsUnderOdd: string;
  cornersOverLine: string;
  cornersOverOdd: string;
  cornersUnderLine: string;
  cornersUnderOdd: string;
  cardsOverLine: string;
  cardsOverOdd: string;
  cardsUnderLine: string;
  cardsUnderOdd: string;
  dcLocalDrawOdd: string;
  dcDrawVisitOdd: string;
  dcLocalVisitOdd: string;
  handicapLocalLine: string;
  handicapLocalOdd: string;
  handicapVisitLine: string;
  handicapVisitOdd: string;
};

type BetStatus = "pending" | "won" | "lost" | "void";
type BetSource = "app" | "manual";

type BankBet = {
  id: string;
  date: string;
  matchName: string;
  pick: string;
  market: string;
  stake: string;
  odd: string;
  status: BetStatus;
  source: BetSource;
  notes: string;
};

type BankrollState = {
  initialBank: string;
  bets: BankBet[];
};

type EliminationContext = {
  enabled: boolean;
  leg: EliminationLeg;
  advantageTeam: EliminationSide;
  leadGoals: string;
  pressureTeam: EliminationSide;
};

type RefereeContext = {
  yellowAvg: string;
  redAvg: string;
  strictness: RefereeStrictness;
};

type DominanceContext = {
  goalsOverLine: string;
  goalsOverOdd: string;
  goalsUnderLine: string;
  goalsUnderOdd: string;
  localGoalsOverLine: string;
  localGoalsOverOdd: string;
  localGoalsUnderLine: string;
  localGoalsUnderOdd: string;
  visitGoalsOverLine: string;
  visitGoalsOverOdd: string;
  visitGoalsUnderLine: string;
  visitGoalsUnderOdd: string;
  cornersOverLine: string;
  cornersOverOdd: string;
  cornersUnderLine: string;
  cornersUnderOdd: string;
  localCornersOverLine: string;
  localCornersOverOdd: string;
  localCornersUnderLine: string;
  localCornersUnderOdd: string;
  visitCornersOverLine: string;
  visitCornersOverOdd: string;
  visitCornersUnderLine: string;
  visitCornersUnderOdd: string;
  cardsOverLine: string;
  cardsOverOdd: string;
  cardsUnderLine: string;
  cardsUnderOdd: string;
  localCardsOverLine: string;
  localCardsOverOdd: string;
  localCardsUnderLine: string;
  localCardsUnderOdd: string;
  visitCardsOverLine: string;
  visitCardsOverOdd: string;
  visitCardsUnderLine: string;
  visitCardsUnderOdd: string;
};

type DailyPick = {
  id: string;
  createdAt: string;
  matchName: string;
  label: string;
  line: string;
  marketValue: string;
  odd: number;
  score: number;
  tier: string;
  grade: Grade;
  source: "SofaScore" | "Casa";
  riskFlags: string[];
  uniqueKey: string;
};

type DayPlanGroup = {
  title: string;
  subtitle: string;
  picks: DailyPick[];
  tone: "safe" | "reasonable" | "risky" | "discard";
};

type ParlayPickForDay = {
  key: string;
  label: string;
  marketValue: string;
  line: string;
  score: number;
  odd: number;
  tier: string;
  grade: Grade;
  riskFlags: string[];
  source: "SofaScore" | "Casa";
};

type ResultPick = {
  key: string;
  label: string;
  marketValue: string;
  line: string;
  confidence: number;
  recentScore: number;
  blendedScore: number;
  count: number;
  grade: Grade;
  tier: string;
  avgOdd: number;
  implied: number;
  value: number;
  riskFlags: string[];
  sources: Indicator[];
};

type HousePick = {
  key: string;
  label: string;
  marketValue: string;
  line: string;
  odd: number;
  implied: number;
  modelScore: number;
  value: number;
  grade: Grade;
  tier: string;
  riskFlags: string[];
  trapLevel?: TrapLevel;
  trapLabel?: string;
  margin?: number;
};


type HouseFieldMap =
  | { lineField: keyof HouseMarket; oddField: keyof HouseMarket }
  | { oddField: keyof HouseMarket };

type ExportShape = {
  version: number;
  exportedAt: string;
  match: Match;
  indicators: Indicator[];
  localRecent: RecentRow[];
  visitRecent: RecentRow[];
  houseMarkets: HouseMarket;
  eliminationContext?: EliminationContext;
  refereeContext?: RefereeContext;
  dominanceContext?: DominanceContext;
};

const STORAGE_KEY = "analizador_pro_h2h_casa_v4";
const BANKROLL_STORAGE_KEY = "bankroll_tracker_h2h_v1";
const DAILY_PICKS_STORAGE_KEY = "apuestas_del_dia_h2h_v1";

const MARKET_OPTIONS = [
  // Rachas rápidas: no piden línea ni cuota. Solo registro X/Total.
  { label: "Victorias", value: "victorias", line: "", kind: "streak" },
  { label: "Sin victorias", value: "sin_victorias", line: "", kind: "streak" },
  { label: "Derrotas", value: "derrotas", line: "", kind: "streak" },
  { label: "Sin derrotas", value: "sin_derrotas", line: "", kind: "streak" },
  { label: "Ninguna portería a cero", value: "no_clean", line: "Sí", kind: "streak" },
  { label: "Sin goles recibidos", value: "clean_sheet", line: "", kind: "streak" },
  { label: "El primero en marcar", value: "first_score", line: "", kind: "streak" },
  { label: "El primero en encajar", value: "first_concede", line: "", kind: "streak" },
  { label: "Primer tiempo perdedor", value: "first_half_loser", line: "1T", kind: "streak" },

  // Mercados apostables: mantienen línea, registro X/Total y cuota de casa.
  { label: "Menos de 2.5 goles", value: "under_2_5", line: "2.5", kind: "bet" },
  { label: "Más de 2.5 goles", value: "over_2_5", line: "2.5", kind: "bet" },
  { label: "Más de 4.5 tarjetas", value: "over_4_5_cards", line: "4.5", kind: "bet" },
  { label: "Menos de 4.5 tarjetas", value: "under_4_5_cards", line: "4.5", kind: "bet" },
  { label: "Más de 10.5 corners", value: "over_10_5_corners", line: "10.5", kind: "bet" },
  { label: "Menos de 10.5 corners", value: "under_10_5_corners", line: "10.5", kind: "bet" },
  { label: "Ambos equipos marcarán", value: "btts", line: "Sí", kind: "bet" },
  { label: "Ganador del primer tiempo", value: "first_half_winner", line: "1T", kind: "bet" },
];



const STREAK_MARKETS = new Set(["victorias", "sin_victorias", "derrotas", "sin_derrotas", "no_clean", "clean_sheet", "first_score", "first_concede", "first_half_loser"]);
const NO_ODD_MARKETS = new Set(["victorias", "sin_victorias", "derrotas", "sin_derrotas", "no_clean", "clean_sheet", "first_score", "first_concede", "first_half_loser"]);
const RECORD_NUMBER_OPTIONS = Array.from({ length: 16 }, (_, index) => String(index));

function isStreakIndicatorMarket(marketValue: string) {
  return STREAK_MARKETS.has(getMarketValue(marketValue));
}

function shouldShowIndicatorOdd(marketValue: string) {
  return Boolean(getMarketValue(marketValue)) && !NO_ODD_MARKETS.has(getMarketValue(marketValue));
}

function shouldShowIndicatorLine(marketValue: string) {
  return Boolean(getMarketValue(marketValue)) && !STREAK_MARKETS.has(getMarketValue(marketValue));
}

function splitRecordValue(record: string) {
  const clean = String(record || "").trim().replace(/\s+/g, "");
  const [hits, total] = clean.split("/");
  return { hits: hits || "", total: total || "" };
}

function joinRecordValue(hits: string, total: string) {
  if (hits === "" && total === "") return "";
  return `${hits || "0"}/${total || "0"}`;
}

const TEAM_OPTIONS: { label: string; value: TeamSide }[] = [
  { label: "🏠 Local", value: "local" },
  { label: "✈️ Visitante", value: "visitante" },
  { label: "🤝 H2H", value: "h2h" },
  { label: "🔥 Ambos", value: "ambos" },
];

const PERIOD_OPTIONS: { label: string; value: IndicatorPeriod }[] = [
  { label: "⏱️ Tiempo completo", value: "full" },
  { label: "1️⃣ 1er tiempo", value: "first" },
  { label: "2️⃣ 2do tiempo", value: "second" },
  { label: "🤝 H2H", value: "h2h" },
];

const NUMBER_OPTIONS = (max: number) => Array.from({ length: max + 1 }, (_, index) => String(index));
const LEAD_GOAL_OPTIONS = ["0", "1", "2", "3", "4", "5", "6"];
const INDICATOR_BULK_OPTIONS = Array.from({ length: 20 }, (_, index) => String(index + 1));
const AVG_YELLOW_OPTIONS = Array.from({ length: 181 }, (_, index) => (index * 0.05).toFixed(2));
const AVG_RED_OPTIONS = Array.from({ length: 61 }, (_, index) => (index * 0.05).toFixed(2));
const REFEREE_STRICTNESS_OPTIONS: { label: string; value: RefereeStrictness }[] = [
  { label: "Sin dato", value: "none" },
  { label: "Bajo", value: "low" },
  { label: "Medio", value: "medium" },
  { label: "Alto", value: "high" },
];
const GOAL_LINES = ["0.5", "1.5", "2.5", "3.5", "4.5", "5.5"];
const CORNER_OVER_LINES = ["4.5", "5.5", "6.5", "7.5", "8.5", "9.5", "10.5"];
const CORNER_UNDER_LINES = ["16.5", "15.5", "14.5", "13.5", "12.5", "11.5", "10.5", "9.5", "8.5", "7.5", "6.5", "5.5"];
const CARD_LINES = ["1.5", "2.5", "3.5", "4.5", "5.5", "6.5"];
const TEAM_GOAL_LINES = ["0.5", "1.5", "2.5", "3.5"];
const TEAM_CORNER_LINES = ["1.5", "2.5", "3.5", "4.5", "5.5", "6.5", "7.5"];
const TEAM_CARD_LINES = ["0.5", "1.5", "2.5", "3.5", "4.5", "5.5"];
const HANDICAP_LINES = ["+0.5", "+1.5", "+2.5", "+3.5", "-0.5", "-1.5", "-2.5", "-3.5"];
const TEAM_COLOR_PRESETS = [
  { label: "Man City", local1: "#6CABDD", local2: "#ffffff", visit1: "#6CABDD", visit2: "#ffffff" },
  { label: "Barcelona", local1: "#A50044", local2: "#004D98", visit1: "#A50044", visit2: "#004D98" },
  { label: "Real Madrid", local1: "#ffffff", local2: "#facc15", visit1: "#ffffff", visit2: "#facc15" },
  { label: "PSG", local1: "#004170", local2: "#DA291C", visit1: "#004170", visit2: "#DA291C" },
  { label: "Bayern", local1: "#DC052D", local2: "#0066B2", visit1: "#DC052D", visit2: "#0066B2" },
  { label: "Flamengo", local1: "#D50000", local2: "#111111", visit1: "#D50000", visit2: "#111111" },
];

const BACKGROUND_PRESETS = [
  { label: "Estadio nocturno", value: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1800&q=80" },
  { label: "Luces estadio", value: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1800&q=80" },
  { label: "Césped", value: "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?auto=format&fit=crop&w=1800&q=80" },
];


function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyRecentRow(): RecentRow {
  return {
    id: makeId(),
    goalsFor: "",
    goalsAgainst: "",
    cornersFor: "",
    cornersAgainst: "",
    cardsFor: "",
    cardsAgainst: "",
  };
}

function createRecentRows() {
  return Array.from({ length: 3 }, () => emptyRecentRow());
}

function emptyHouseMarkets(): HouseMarket {
  return {
    goalsOverLine: "1.5",
    goalsOverOdd: "",
    goalsUnderLine: "4.5",
    goalsUnderOdd: "",
    cornersOverLine: "8.5",
    cornersOverOdd: "",
    cornersUnderLine: "10.5",
    cornersUnderOdd: "",
    cardsOverLine: "2.5",
    cardsOverOdd: "",
    cardsUnderLine: "4.5",
    cardsUnderOdd: "",
    dcLocalDrawOdd: "",
    dcDrawVisitOdd: "",
    dcLocalVisitOdd: "",
    handicapLocalLine: "+1.5",
    handicapLocalOdd: "",
    handicapVisitLine: "+1.5",
    handicapVisitOdd: "",
  };
}

function emptyEliminationContext(): EliminationContext {
  return {
    enabled: false,
    leg: "none",
    advantageTeam: "none",
    leadGoals: "0",
    pressureTeam: "none",
  };
}

function emptyRefereeContext(): RefereeContext {
  return {
    yellowAvg: "",
    redAvg: "",
    strictness: "none",
  };
}

function emptyDominanceContext(): DominanceContext {
  return {
    goalsOverLine: "1.5",
    goalsOverOdd: "",
    goalsUnderLine: "4.5",
    goalsUnderOdd: "",
    localGoalsOverLine: "0.5",
    localGoalsOverOdd: "",
    localGoalsUnderLine: "2.5",
    localGoalsUnderOdd: "",
    visitGoalsOverLine: "0.5",
    visitGoalsOverOdd: "",
    visitGoalsUnderLine: "2.5",
    visitGoalsUnderOdd: "",
    cornersOverLine: "6.5",
    cornersOverOdd: "",
    cornersUnderLine: "11.5",
    cornersUnderOdd: "",
    localCornersOverLine: "2.5",
    localCornersOverOdd: "",
    localCornersUnderLine: "6.5",
    localCornersUnderOdd: "",
    visitCornersOverLine: "2.5",
    visitCornersOverOdd: "",
    visitCornersUnderLine: "6.5",
    visitCornersUnderOdd: "",
    cardsOverLine: "2.5",
    cardsOverOdd: "",
    cardsUnderLine: "5.5",
    cardsUnderOdd: "",
    localCardsOverLine: "0.5",
    localCardsOverOdd: "",
    localCardsUnderLine: "3.5",
    localCardsUnderOdd: "",
    visitCardsOverLine: "0.5",
    visitCardsOverOdd: "",
    visitCardsUnderLine: "3.5",
    visitCardsUnderOdd: "",
  };
}

type DominancePick = {
  key: string;
  label: string;
  score: number;
  odd: number;
  grade: Grade;
  reason: string;
  risk: string;
};

function getDependencyLabel(localValue: number, visitValue: number) {
  const total = localValue + visitValue;
  if (total <= 0) return { label: "Sin datos", tone: "neutral", share: 0 };
  const share = Math.max(localValue, visitValue) / total;
  if (share >= 0.76) return { label: "🔴 Mercado dependiente de un solo equipo", tone: "danger", share };
  if (share >= 0.64) return { label: "🟡 Dominancia marcada", tone: "warning", share };
  return { label: "🟢 Mercado equilibrado", tone: "safe", share };
}

function sideExpectedValues(projection: ReturnType<typeof buildProjection>, adjustedCardsExpected: number) {
  const localGoals = average([projection.local.goalsForAvg, projection.visit.goalsAgainstAvg].filter((n) => n > 0));
  const visitGoals = average([projection.visit.goalsForAvg, projection.local.goalsAgainstAvg].filter((n) => n > 0));
  const rawCardsTotal = projection.localCardsExpected + projection.visitCardsExpected;
  const localCardShare = rawCardsTotal > 0 ? projection.localCardsExpected / rawCardsTotal : 0.5;
  const visitCardShare = 1 - localCardShare;
  return {
    localGoals,
    visitGoals,
    totalGoals: localGoals + visitGoals,
    localCorners: projection.localCornersExpected,
    visitCorners: projection.visitCornersExpected,
    totalCorners: projection.expectedCorners,
    localCards: adjustedCardsExpected * localCardShare,
    visitCards: adjustedCardsExpected * visitCardShare,
    totalCards: adjustedCardsExpected,
  };
}

function buildDominanceAnalysis(
  dominance: DominanceContext,
  projection: ReturnType<typeof buildProjection>,
  adjustedCardsExpected: number,
  match: Match,
  hasMinimumData: boolean
) {
  const values = sideExpectedValues(projection, adjustedCardsExpected);
  const goalsDependency = getDependencyLabel(values.localGoals, values.visitGoals);
  const cornersDependency = getDependencyLabel(values.localCorners, values.visitCorners);
  const cardsDependency = getDependencyLabel(values.localCards, values.visitCards);
  const picks: DominancePick[] = [];

  const addPick = (key: string, label: string, expected: number, line: string, direction: "over" | "under", oddRaw: string, scale: number, dependencyShare: number, reason: string) => {
    const odd = toNumber(oddRaw);
    const base = probabilityByLine(expected, toNumber(line), direction, scale);
    const dependencyPenalty = direction === "over" && dependencyShare >= 0.72 ? 13 : direction === "over" && dependencyShare >= 0.64 ? 7 : 0;
    const score = clamp(base - dependencyPenalty, 0, 100);
    const flags: string[] = [];
    if (dependencyPenalty >= 10) flags.push("Depende demasiado de un solo equipo.");
    if (Math.abs(expected - toNumber(line)) <= (scale <= 2.2 ? 0.35 : scale <= 3.6 ? 0.8 : 1.4)) flags.push("Línea estrecha: no combinar fuerte.");
    if (odd > 1 && score - impliedProb(odd) < 0) flags.push("La cuota no acompaña del todo.");
    const grade = getGrade(score, flags);
    if (score >= 58) picks.push({ key, label, score, odd, grade, reason, risk: flags.length ? flags.join(" ") : "Lectura limpia." });
  };

  if (hasMinimumData) {
    addPick("dom_goals_over", `Más de ${dominance.goalsOverLine} goles`, values.totalGoals, dominance.goalsOverLine, "over", dominance.goalsOverOdd, 2.1, goalsDependency.share, "Total de goles sostenido por ambos ataques/defensas recientes.");
    addPick("dom_goals_under", `Menos de ${dominance.goalsUnderLine} goles`, values.totalGoals, dominance.goalsUnderLine, "under", dominance.goalsUnderOdd, 2.1, goalsDependency.share, "Under validado contra producción esperada total.");
    addPick("dom_local_goals_over", `${match.local || "Local"} más de ${dominance.localGoalsOverLine} goles`, values.localGoals, dominance.localGoalsOverLine, "over", dominance.localGoalsOverOdd, 1.5, 0.5, "Producción ofensiva local vs goles concedidos del visitante.");
    addPick("dom_visit_goals_over", `${match.visitante || "Visitante"} más de ${dominance.visitGoalsOverLine} goles`, values.visitGoals, dominance.visitGoalsOverLine, "over", dominance.visitGoalsOverOdd, 1.5, 0.5, "Producción ofensiva visitante vs goles concedidos del local.");
    addPick("dom_local_goals_under", `${match.local || "Local"} menos de ${dominance.localGoalsUnderLine} goles`, values.localGoals, dominance.localGoalsUnderLine, "under", dominance.localGoalsUnderOdd, 1.5, 0.5, "Techo goleador del local.");
    addPick("dom_visit_goals_under", `${match.visitante || "Visitante"} menos de ${dominance.visitGoalsUnderLine} goles`, values.visitGoals, dominance.visitGoalsUnderLine, "under", dominance.visitGoalsUnderOdd, 1.5, 0.5, "Techo goleador del visitante.");

    addPick("dom_corners_over", `Más de ${dominance.cornersOverLine} corners`, values.totalCorners, dominance.cornersOverLine, "over", dominance.cornersOverOdd, 5.2, cornersDependency.share, "Total de corners comparando generación propia y corners concedidos.");
    addPick("dom_corners_under", `Menos de ${dominance.cornersUnderLine} corners`, values.totalCorners, dominance.cornersUnderLine, "under", dominance.cornersUnderOdd, 5.2, cornersDependency.share, "Under de corners validado por total esperado.");
    addPick("dom_local_corners_over", `${match.local || "Local"} más de ${dominance.localCornersOverLine} corners`, values.localCorners, dominance.localCornersOverLine, "over", dominance.localCornersOverOdd, 3.2, 0.5, "Corners esperados del local.");
    addPick("dom_visit_corners_over", `${match.visitante || "Visitante"} más de ${dominance.visitCornersOverLine} corners`, values.visitCorners, dominance.visitCornersOverLine, "over", dominance.visitCornersOverOdd, 3.2, 0.5, "Corners esperados del visitante.");
    addPick("dom_local_corners_under", `${match.local || "Local"} menos de ${dominance.localCornersUnderLine} corners`, values.localCorners, dominance.localCornersUnderLine, "under", dominance.localCornersUnderOdd, 3.2, 0.5, "Techo de corners del local.");
    addPick("dom_visit_corners_under", `${match.visitante || "Visitante"} menos de ${dominance.visitCornersUnderLine} corners`, values.visitCorners, dominance.visitCornersUnderLine, "under", dominance.visitCornersUnderOdd, 3.2, 0.5, "Techo de corners del visitante.");

    addPick("dom_cards_over", `Más de ${dominance.cardsOverLine} tarjetas`, values.totalCards, dominance.cardsOverLine, "over", dominance.cardsOverOdd, 3.4, cardsDependency.share, "Tarjetas totales incluyendo árbitro y registros.");
    addPick("dom_cards_under", `Menos de ${dominance.cardsUnderLine} tarjetas`, values.totalCards, dominance.cardsUnderLine, "under", dominance.cardsUnderOdd, 3.4, cardsDependency.share, "Under tarjetas contra promedio ajustado por árbitro.");
    addPick("dom_local_cards_over", `${match.local || "Local"} más de ${dominance.localCardsOverLine} tarjetas`, values.localCards, dominance.localCardsOverLine, "over", dominance.localCardsOverOdd, 2.2, 0.5, "Tarjetas esperadas del local.");
    addPick("dom_visit_cards_over", `${match.visitante || "Visitante"} más de ${dominance.visitCardsOverLine} tarjetas`, values.visitCards, dominance.visitCardsOverLine, "over", dominance.visitCardsOverOdd, 2.2, 0.5, "Tarjetas esperadas del visitante.");
    addPick("dom_local_cards_under", `${match.local || "Local"} menos de ${dominance.localCardsUnderLine} tarjetas`, values.localCards, dominance.localCardsUnderLine, "under", dominance.localCardsUnderOdd, 2.2, 0.5, "Techo de tarjetas del local.");
    addPick("dom_visit_cards_under", `${match.visitante || "Visitante"} menos de ${dominance.visitCardsUnderLine} tarjetas`, values.visitCards, dominance.visitCardsUnderLine, "under", dominance.visitCardsUnderOdd, 2.2, 0.5, "Techo de tarjetas del visitante.");
  }

  const dominators: string[] = [];
  if (values.localCorners - values.visitCorners >= 2) dominators.push(`${match.local || "Local"} domina corners (${values.localCorners.toFixed(1)} vs ${values.visitCorners.toFixed(1)}).`);
  if (values.visitCorners - values.localCorners >= 2) dominators.push(`${match.visitante || "Visitante"} domina corners (${values.visitCorners.toFixed(1)} vs ${values.localCorners.toFixed(1)}).`);
  if (values.localGoals - values.visitGoals >= 0.7) dominators.push(`${match.local || "Local"} domina gol esperado (${values.localGoals.toFixed(1)} vs ${values.visitGoals.toFixed(1)}).`);
  if (values.visitGoals - values.localGoals >= 0.7) dominators.push(`${match.visitante || "Visitante"} domina gol esperado (${values.visitGoals.toFixed(1)} vs ${values.localGoals.toFixed(1)}).`);
  if (values.localCards - values.visitCards >= 0.8) dominators.push(`${match.local || "Local"} carga más riesgo de tarjetas (${values.localCards.toFixed(1)} vs ${values.visitCards.toFixed(1)}).`);
  if (values.visitCards - values.localCards >= 0.8) dominators.push(`${match.visitante || "Visitante"} carga más riesgo de tarjetas (${values.visitCards.toFixed(1)} vs ${values.localCards.toFixed(1)}).`);

  return {
    values,
    dependencies: { goals: goalsDependency, corners: cornersDependency, cards: cardsDependency },
    dominators,
    picks: picks.sort((a, b) => b.score - a.score).slice(0, 10),
  };
}

function getRefereeCardAdjustment(referee: RefereeContext) {
  const yellow = toNumber(referee.yellowAvg);
  const red = toNumber(referee.redAvg);
  let score = 0;
  let expectedBoost = 0;
  const notes: string[] = [];

  if (yellow >= 5.2) {
    score += 10;
    expectedBoost += 0.8;
    notes.push("Árbitro tarjetero: sube over tarjetas y baja under corto.");
  } else if (yellow >= 4.4) {
    score += 6;
    expectedBoost += 0.45;
    notes.push("Árbitro medio/alto en amarillas: tarjetas con apoyo extra.");
  } else if (yellow > 0 && yellow <= 3.2) {
    score -= 8;
    expectedBoost -= 0.45;
    notes.push("Árbitro permisivo: cuidado con over de tarjetas.");
  }

  if (red >= 0.30) {
    score += 4;
    expectedBoost += 0.35;
    notes.push("Promedio de rojas alto: sube el riesgo disciplinario del partido.");
  } else if (red > 0 && red <= 0.10) {
    expectedBoost -= 0.1;
  }

  if (referee.strictness === "high") {
    score += 6;
    expectedBoost += 0.4;
    notes.push("Rigor alto seleccionado: el motor eleva tarjetas.");
  } else if (referee.strictness === "low") {
    score -= 6;
    expectedBoost -= 0.35;
    notes.push("Rigor bajo seleccionado: el motor baja tarjetas.");
  }

  return {
    scoreAdjustment: clamp(score, -12, 16),
    expectedBoost: clamp(expectedBoost, -0.8, 1.4),
    notes,
  };
}

function getSideName(side: EliminationSide, match: Match) {
  if (side === "local") return match.local || "Local";
  if (side === "visitante") return match.visitante || "Visitante";
  return "Ninguno";
}

function isSecondLegWithLead(context: EliminationContext) {
  return Boolean(context.enabled && context.leg === "second" && context.advantageTeam !== "none" && toNumber(context.leadGoals) > 0);
}

function emptyBankroll(): BankrollState {
  return {
    initialBank: "",
    bets: [],
  };
}

function emptyBankBet(): Omit<BankBet, "id"> {
  return {
    date: new Date().toISOString().slice(0, 10),
    matchName: "",
    pick: "",
    market: "",
    stake: "",
    odd: "",
    status: "pending",
    source: "app",
    notes: "",
  };
}

function betProfit(bet: BankBet) {
  const stake = toNumber(bet.stake);
  const odd = toNumber(bet.odd);
  if (bet.status === "won") return odd > 1 ? stake * (odd - 1) : 0;
  if (bet.status === "lost") return -stake;
  return 0;
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function formatOdd(value: number) {
  if (!Number.isFinite(value) || value <= 1) return "Sin cuota";
  return value.toFixed(2);
}

function dailyFamily(marketValue: string) {
  if (marketValue.includes("corners")) return "corners";
  if (marketValue.includes("cards")) return "cards";
  if (["over_1_5", "over_2_5", "under_2_5", "under_4_5", "btts", "no_clean"].includes(marketValue)) return "goals";
  if (marketValue.includes("handicap") || marketValue.includes("plus") || marketValue.includes("minus")) return "handicap";
  if (["ganador", "empate", "local_o_empate", "visitante_o_empate", "local_o_visitante", "sin_derrotas", "sin_victorias", "derrotas", "victorias", "clean_sheet", "first_score", "first_concede", "first_half_winner", "first_half_loser"].includes(marketValue)) return "result";
  return marketValue || "other";
}

function hasDangerFlag(flags: string[]) {
  return flags.some((flag) => {
    const text = flag.toLowerCase();
    return text.includes("zona prohibida") || text.includes("trampa") || text.includes("bloqueado") || text.includes("sin value") || text.includes("contradicción") || text.includes("freno");
  });
}

function buildDailyPlan(picks: DailyPick[]): DayPlanGroup[] {
  const sorted = [...picks].sort((a, b) => b.score - a.score);
  const descartados = sorted.filter((pick) => hasDangerFlag(pick.riskFlags) || pick.grade === "risky" || pick.score < 62);
  const vivos = sorted.filter((pick) => !descartados.some((bad) => bad.id === pick.id));

  const simples = vivos.filter((pick) => {
    const family = dailyFamily(pick.marketValue);
    return pick.score >= 74 && (pick.odd >= 1.55 || family === "corners" || family === "cards" || pick.grade === "reasonable");
  }).slice(0, 5);

  const usedFamilies = new Set<string>();
  const usedMatches = new Set<string>();
  const conservador: DailyPick[] = [];
  for (const pick of vivos) {
    const family = dailyFamily(pick.marketValue);
    if (conservador.length >= 3) break;
    if (family === "cards") continue;
    if (family === "corners" && pick.score < 88) continue;
    if (pick.score < 82) continue;
    if (usedFamilies.has(family)) continue;
    if (usedMatches.has(pick.matchName)) continue;
    conservador.push(pick);
    usedFamilies.add(family);
    usedMatches.add(pick.matchName);
  }

  const riesgoso = vivos
    .filter((pick) => !conservador.some((item) => item.id === pick.id) && !simples.some((item) => item.id === pick.id))
    .filter((pick) => pick.score >= 68)
    .slice(0, 4);

  return [
    { title: "🟢 Simples recomendadas", subtitle: "Picks buenos para jugar solos o con stake controlado.", picks: simples, tone: "safe" },
    { title: "🧊 Parlay conservador", subtitle: "Máximo 2–3 selecciones, familias diferentes y sin zonas trampa.", picks: conservador, tone: "reasonable" },
    { title: "🔥 Parlay riesgoso", subtitle: "Solo si quieres cuota. No mezclar con el conservador.", picks: riesgoso, tone: "risky" },
    { title: "⛔ Descartar / no combinar", subtitle: "Picks con señales peligrosas, trampa o poco margen.", picks: descartados, tone: "discard" },
  ];
}

function combinedOdds(picks: Array<{ odd: number }>) {
  const valid = picks.map((pick) => pick.odd).filter((odd) => odd > 1);
  if (!valid.length) return 0;
  return valid.reduce((acc, odd) => acc * odd, 1);
}

function buildBankrollStats(bankroll: BankrollState) {
  const initialBank = toNumber(bankroll.initialBank);
  const settled = bankroll.bets.filter((bet) => bet.status === "won" || bet.status === "lost" || bet.status === "void");
  const decided = bankroll.bets.filter((bet) => bet.status === "won" || bet.status === "lost");
  const wins = bankroll.bets.filter((bet) => bet.status === "won").length;
  const losses = bankroll.bets.filter((bet) => bet.status === "lost").length;
  const pending = bankroll.bets.filter((bet) => bet.status === "pending");
  const totalStake = decided.reduce((sum, bet) => sum + toNumber(bet.stake), 0);
  const pendingStake = pending.reduce((sum, bet) => sum + toNumber(bet.stake), 0);
  const profit = bankroll.bets.reduce((sum, bet) => sum + betProfit(bet), 0);
  const roi = totalStake > 0 ? (profit / totalStake) * 100 : 0;
  const winrate = decided.length > 0 ? (wins / decided.length) * 100 : 0;
  const currentBank = initialBank + profit;

  const sourceStats = (["app", "manual"] as BetSource[]).map((source) => {
    const sourceBets = bankroll.bets.filter((bet) => bet.source === source && (bet.status === "won" || bet.status === "lost"));
    const sourceStake = sourceBets.reduce((sum, bet) => sum + toNumber(bet.stake), 0);
    const sourceProfit = sourceBets.reduce((sum, bet) => sum + betProfit(bet), 0);
    return {
      source,
      total: sourceBets.length,
      wins: sourceBets.filter((bet) => bet.status === "won").length,
      stake: sourceStake,
      profit: sourceProfit,
      roi: sourceStake > 0 ? (sourceProfit / sourceStake) * 100 : 0,
    };
  });

  const byMarket = Object.values(
    bankroll.bets.reduce<Record<string, { market: string; total: number; profit: number; stake: number }>>((acc, bet) => {
      const key = bet.market || "Sin mercado";
      if (!acc[key]) acc[key] = { market: key, total: 0, profit: 0, stake: 0 };
      if (bet.status === "won" || bet.status === "lost") {
        acc[key].total += 1;
        acc[key].profit += betProfit(bet);
        acc[key].stake += toNumber(bet.stake);
      }
      return acc;
    }, {})
  )
    .filter((item) => item.total > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  const equityPoints = bankroll.bets
    .filter((bet) => bet.status === "won" || bet.status === "lost" || bet.status === "void")
    .reduce<number[]>((points, bet) => {
      const last = points.length ? points[points.length - 1] : initialBank;
      points.push(last + betProfit(bet));
      return points;
    }, []);

  return {
    initialBank,
    currentBank,
    profit,
    roi,
    winrate,
    wins,
    losses,
    pending: pending.length,
    pendingStake,
    totalStake,
    settled: settled.length,
    decided: decided.length,
    sourceStats,
    byMarket,
    equityPoints: [initialBank, ...equityPoints],
  };
}

function toNumber(value: string) {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseRecord(record: string) {
  const clean = record.trim().replace(/\s+/g, "");
  const [a, b] = clean.split("/").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0 || a < 0) return 0;
  return clamp((a / b) * 100, 0, 100);
}

function impliedProb(odd: number) {
  if (!Number.isFinite(odd) || odd <= 1) return 0;
  return 100 / odd;
}

function getMarketLabel(value: string) {
  const found = MARKET_OPTIONS.find((m) => m.value === value || m.label === value);
  return found?.label || value || "Mercado";
}

function getMarketValue(value: string) {
  const found = MARKET_OPTIONS.find((m) => m.value === value || m.label === value);
  return found?.value || value;
}

function getTeamLabel(team: TeamSide, match: Match) {
  if (team === "local") return match.local || "Local";
  if (team === "visitante") return match.visitante || "Visitante";
  if (team === "h2h") return "H2H";
  return "Ambos";
}

function getPeriodLabel(period?: IndicatorPeriod) {
  if (period === "first") return "1er tiempo";
  if (period === "second") return "2do tiempo";
  if (period === "h2h") return "H2H";
  return "Tiempo completo";
}

function TeamBadge({ name, color1, color2 }: { name: string; color1: string; color2: string }) {
  const initials = (name || "FC")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "FC";

  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-white/30 text-xl font-black text-white shadow-xl shadow-black/40"
      style={{ background: `linear-gradient(135deg, ${color1 || "#38bdf8"} 0%, ${color1 || "#38bdf8"} 45%, ${color2 || "#ffffff"} 45%, ${color2 || "#ffffff"} 100%)` }}
      title={name || "Equipo"}
    >
      <span className="rounded-full bg-black/25 px-2 py-1 text-sm backdrop-blur">{initials}</span>
    </div>
  );
}

function getAutoResult(row: RecentRow): MatchResult {
  if (row.goalsFor === "" || row.goalsAgainst === "") return "";
  const gf = toNumber(row.goalsFor);
  const gc = toNumber(row.goalsAgainst);
  if (gf > gc) return "G";
  if (gf < gc) return "P";
  return "E";
}

function getGrade(score: number, flags: string[]): Grade {
  const seriousFlags = flags.filter((flag) => flag.includes("Contradicción") || flag.includes("bloquea") || flag.includes("Bloqueado") || flag.includes("sin value") || flag.includes("Freno"));
  if (score >= 84 && seriousFlags.length === 0) return "safe";
  if (score >= 68) return "reasonable";
  return "risky";
}

function getTierLabel(grade: Grade) {
  if (grade === "safe") return "🟢 Pick seguro";
  if (grade === "reasonable") return "🟡 Pick razonable";
  return "🔴 Pick riesgoso";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countValidRows(rows: RecentRow[]) {
  return rows.filter(
    (row) =>
      row.goalsFor !== "" ||
      row.goalsAgainst !== "" ||
      row.cornersFor !== "" ||
      row.cornersAgainst !== "" ||
      row.cardsFor !== "" ||
      row.cardsAgainst !== ""
  );
}

function buildRecentStats(rows: RecentRow[]) {
  const valid = countValidRows(rows);
  const goalsFor = valid.map((row) => toNumber(row.goalsFor));
  const goalsAgainst = valid.map((row) => toNumber(row.goalsAgainst));
  const totalGoals = valid.map((row) => toNumber(row.goalsFor) + toNumber(row.goalsAgainst));
  const cornersFor = valid.map((row) => toNumber(row.cornersFor));
  const cornersAgainst = valid.map((row) => toNumber(row.cornersAgainst));
  const totalCorners = valid.map((row) => toNumber(row.cornersFor) + toNumber(row.cornersAgainst));
  const cardsFor = valid.map((row) => toNumber(row.cardsFor));
  const cardsAgainst = valid.map((row) => toNumber(row.cardsAgainst));
  const totalCards = valid.map((row) => toNumber(row.cardsFor) + toNumber(row.cardsAgainst));

  const btts = valid.filter((row) => toNumber(row.goalsFor) > 0 && toNumber(row.goalsAgainst) > 0).length;
  const noClean = valid.filter((row) => toNumber(row.goalsAgainst) > 0).length;
  const noLose = valid.filter((row) => {
    const result = getAutoResult(row);
    return result === "G" || result === "E";
  }).length;
  const noWin = valid.filter((row) => {
    const result = getAutoResult(row);
    return result === "E" || result === "P";
  }).length;
  const wins = valid.filter((row) => getAutoResult(row) === "G").length;
  const draws = valid.filter((row) => getAutoResult(row) === "E").length;

  return {
    count: valid.length,
    goalsForAvg: average(goalsFor),
    goalsAgainstAvg: average(goalsAgainst),
    totalGoalsAvg: average(totalGoals),
    cornersForAvg: average(cornersFor),
    cornersAgainstAvg: average(cornersAgainst),
    totalCornersAvg: average(totalCorners),
    cardsForAvg: average(cardsFor),
    cardsAgainstAvg: average(cardsAgainst),
    totalCardsAvg: average(totalCards),
    bttsPct: valid.length ? (btts / valid.length) * 100 : 0,
    noCleanPct: valid.length ? (noClean / valid.length) * 100 : 0,
    noLosePct: valid.length ? (noLose / valid.length) * 100 : 0,
    noWinPct: valid.length ? (noWin / valid.length) * 100 : 0,
    winPct: valid.length ? (wins / valid.length) * 100 : 0,
    drawPct: valid.length ? (draws / valid.length) * 100 : 0,
  };
}


function resultBreakdown(rows: RecentRow[]) {
  const valid = countValidRows(rows);
  const wins = valid.filter((row) => getAutoResult(row) === "G").length;
  const draws = valid.filter((row) => getAutoResult(row) === "E").length;
  const losses = valid.filter((row) => getAutoResult(row) === "P").length;
  return { count: valid.length, wins, draws, losses };
}

function handicapPct(rows: RecentRow[], handicap: number) {
  const valid = countValidRows(rows).filter((row) => row.goalsFor !== "" && row.goalsAgainst !== "");
  if (!valid.length) return 0;
  const hits = valid.filter((row) => toNumber(row.goalsFor) + handicap > toNumber(row.goalsAgainst)).length;
  return (hits / valid.length) * 100;
}

function recordStrength(count: number) {
  if (count >= 6) return 1;
  if (count >= 4) return 0.93;
  if (count >= 2) return 0.82;
  return 0.72;
}

function buildProjection(localRows: RecentRow[], visitRows: RecentRow[]) {
  const local = buildRecentStats(localRows);
  const visit = buildRecentStats(visitRows);

  const localCornersExpected = average([local.cornersForAvg, visit.cornersAgainstAvg].filter((n) => n > 0));
  const visitCornersExpected = average([visit.cornersForAvg, local.cornersAgainstAvg].filter((n) => n > 0));
  const expectedCorners = localCornersExpected + visitCornersExpected;

  const localCardsExpected = average([local.cardsForAvg, visit.cardsAgainstAvg].filter((n) => n > 0));
  const visitCardsExpected = average([visit.cardsForAvg, local.cardsAgainstAvg].filter((n) => n > 0));
  const expectedCards = localCardsExpected + visitCardsExpected;

  const expectedGoals = average([local.totalGoalsAvg, visit.totalGoalsAvg].filter((n) => n > 0));

  return {
    local,
    visit,
    localCornersExpected,
    visitCornersExpected,
    expectedCorners,
    localCardsExpected,
    visitCardsExpected,
    expectedCards,
    expectedGoals,
  };
}

function getStrongSignalScore(indicators: Indicator[], markets: string[]) {
  const hits = indicators
    .filter((indicator) => markets.includes(getMarketValue(indicator.market)))
    .map((indicator) => parseRecord(indicator.record))
    .filter((score) => score > 0);
  return hits.length ? average(hits) : 0;
}

function buildMatchProfile(indicators: Indicator[], localRows: RecentRow[], visitRows: RecentRow[]) {
  const projection = buildProjection(localRows, visitRows);
  const local = projection.local;
  const visit = projection.visit;
  const avgGoals = projection.expectedGoals;
  const bttsRecent = average([local.bttsPct, visit.bttsPct].filter((n) => n >= 0));
  const noCleanRecent = average([local.noCleanPct, visit.noCleanPct].filter((n) => n >= 0));

  const bttsSignal = getStrongSignalScore(indicators, ["btts"]);
  const noCleanSignal = getStrongSignalScore(indicators, ["no_clean"]);
  const overSignal = getStrongSignalScore(indicators, ["over_1_5", "over_2_5"]);
  const underSignal = getStrongSignalScore(indicators, ["under_2_5", "under_4_5"]);
  const cornerUnderSignal = getStrongSignalScore(indicators, ["under_10_5_corners", "under_14_5_corners"]);
  const cardsSignal = getStrongSignalScore(indicators, ["over_2_5_cards", "over_4_5_cards", "under_4_5_cards", "under_6_5_cards"]);

  const attackingPressure = average([bttsRecent, noCleanRecent, bttsSignal, noCleanSignal, overSignal].filter((n) => n > 0));
  const lowGoalPressure = average([underSignal, avgGoals > 0 ? clamp(90 - avgGoals * 18, 0, 100) : 0].filter((n) => n > 0));
  const chaosScore = clamp(attackingPressure * 0.65 + Math.max(0, avgGoals - 2.2) * 14 + (noCleanSignal >= 75 ? 8 : 0), 0, 100);

  let type: MatchProfileType = "equilibrado";
  if (chaosScore >= 72 && attackingPressure >= 68) type = "abierto";
  else if (lowGoalPressure >= 72 && attackingPressure < 58 && avgGoals <= 2.35) type = "cerrado";
  else if (attackingPressure >= 65 && underSignal >= 65) type = "trampa";

  const blockUnderGoals = type === "abierto" || type === "trampa" || ((bttsSignal >= 70 || noCleanSignal >= 70 || bttsRecent >= 65 || noCleanRecent >= 70) && underSignal >= 60);
  const blockUnderCorners = projection.expectedCorners >= 10.8;
  const notes: string[] = [];

  if (type === "abierto") notes.push("Perfil abierto: BTTS/no portería a cero/goles recientes empujan contra unders agresivos.");
  if (type === "cerrado") notes.push("Perfil cerrado: under goles/corners puede tener más sentido, pero evita cuotas muy bajas.");
  if (type === "trampa") notes.push("Perfil trampa: SofaScore mezcla under con señales de gol. Evita parlay grande.");
  if (blockUnderGoals) notes.push("Bloqueo preventivo: Under 2.5 queda castigado por señales ofensivas.");
  if (blockUnderCorners) notes.push(`Freno de corners: los registros proyectan ${projection.expectedCorners.toFixed(1)} corners; cuidado con under 10.5.`);
  if (cornerUnderSignal >= 70 && !blockUnderCorners) notes.push("Corners under viene mostrando estabilidad, pero se confirma contra registros.");
  if (cardsSignal >= 70) notes.push("Tarjetas aparecen mucho: se priorizan menos para que no dominen siempre.");

  return {
    type,
    avgGoals,
    bttsRecent,
    noCleanRecent,
    attackingPressure,
    lowGoalPressure,
    chaosScore,
    blockUnderGoals,
    blockUnderCorners,
    expectedCorners: projection.expectedCorners,
    expectedCards: projection.expectedCards,
    notes,
  };
}

function isGoalMarket(marketValue: string) {
  return ["over_1_5", "over_2_5", "under_2_5", "under_4_5", "btts", "no_clean"].includes(marketValue);
}

function isUnderGoalMarket(marketValue: string) {
  return marketValue === "under_2_5" || marketValue === "under_4_5";
}

function isOverGoalMarket(marketValue: string) {
  return marketValue === "over_1_5" || marketValue === "over_2_5" || marketValue === "btts" || marketValue === "no_clean";
}

function isCardMarket(marketValue: string) {
  return marketValue.includes("cards");
}

function isCornerMarket(marketValue: string) {
  return marketValue.includes("corners");
}

function isUnderCornerMarket(marketValue: string) {
  return marketValue.includes("corners") && marketValue.includes("under");
}

function marketSortPenalty(marketValue: string, blendedScore: number, count: number) {
  if (!isCardMarket(marketValue)) return 0;
  if (blendedScore >= 90 && count >= 2) return 3;
  if (blendedScore >= 82 && count >= 2) return 7;
  if (blendedScore >= 75) return 10;
  return 16;
}

function probabilityByLine(expected: number, line: number, direction: "over" | "under", scale = 1.8) {
  if (!expected || !line) return 0;
  const diff = direction === "over" ? expected - line : line - expected;
  return clamp(50 + diff * (100 / (scale * 2)), 5, 95);
}

function scoreMarketFromRecent(marketValue: string, line: string, localRows: RecentRow[], visitRows: RecentRow[]) {
  const projection = buildProjection(localRows, visitRows);
  const local = projection.local;
  const visit = projection.visit;
  const totalCount = local.count + visit.count;

  if (totalCount === 0) return 0;

  const lineNumber = toNumber(line);

  if (marketValue === "over_2_5") return probabilityByLine(projection.expectedGoals, 2.5, "over", 2.1);
  if (marketValue === "over_1_5") return probabilityByLine(projection.expectedGoals, 1.5, "over", 2.1);
  if (marketValue === "under_2_5") return probabilityByLine(projection.expectedGoals, 2.5, "under", 2.1);
  if (marketValue === "under_4_5") return probabilityByLine(projection.expectedGoals, 4.5, "under", 2.1);
  if (marketValue === "btts") return average([local.bttsPct, visit.bttsPct].filter((n) => n >= 0));
  if (marketValue === "no_clean") return average([local.noCleanPct, visit.noCleanPct].filter((n) => n >= 0));
  if (marketValue.includes("corners")) {
    if (marketValue.includes("over")) return probabilityByLine(projection.expectedCorners, lineNumber, "over", 5.2);
    if (marketValue.includes("under")) return probabilityByLine(projection.expectedCorners, lineNumber, "under", 5.2);
  }
  if (isCardMarket(marketValue)) {
    if (marketValue.includes("over")) return clamp(probabilityByLine(projection.expectedCards, lineNumber, "over", 3.4), 0, 88);
    if (marketValue.includes("under")) return clamp(probabilityByLine(projection.expectedCards, lineNumber, "under", 3.4), 0, 88);
  }
  if (marketValue === "sin_derrotas") return Math.max(local.noLosePct, visit.noLosePct);
  if (marketValue === "sin_victorias") return Math.max(local.noWinPct, visit.noWinPct);
  if (marketValue === "derrotas") return Math.max(100 - local.noLosePct, 100 - visit.noLosePct);
  if (marketValue === "victorias") return Math.max(local.winPct, visit.winPct);
  if (marketValue === "clean_sheet") return Math.max(100 - local.noCleanPct, 100 - visit.noCleanPct);
  if (marketValue === "first_score" || marketValue === "first_concede" || marketValue === "first_half_loser") return 0;
  if (marketValue === "ganador") return Math.max(local.winPct, visit.winPct);
  if (marketValue === "first_half_winner") return clamp(Math.max(local.winPct, visit.winPct) * 0.9, 0, 100);
  if (marketValue === "wins_any_half") return clamp(Math.max(local.winPct, visit.winPct) * 0.95, 0, 100);
  if (marketValue === "empate") return average([local.drawPct, visit.drawPct].filter((n) => n >= 0));
  if (marketValue === "local_o_empate") return local.noLosePct;
  if (marketValue === "visitante_o_empate") return visit.noLosePct;
  if (marketValue === "local_o_visitante") return clamp(100 - average([local.drawPct, visit.drawPct].filter((n) => n >= 0)), 0, 100);
  if (marketValue === "local_plus_1_5") return average([handicapPct(localRows, 1.5), 100 - handicapPct(visitRows, -1.5)].filter((n) => n >= 0));
  if (marketValue === "local_plus_0_5") return local.noLosePct;
  if (marketValue === "local_minus_0_5") return local.winPct;
  if (marketValue === "local_minus_1_5") return handicapPct(localRows, -1.5);
  if (marketValue === "visit_plus_1_5") return average([handicapPct(visitRows, 1.5), 100 - handicapPct(localRows, -1.5)].filter((n) => n >= 0));
  if (marketValue === "visit_plus_0_5") return visit.noLosePct;
  if (marketValue === "visit_minus_0_5") return visit.winPct;
  if (marketValue === "visit_minus_1_5") return handicapPct(visitRows, -1.5);

  return 0;
}

function detectContradictions(picks: ResultPick[]) {
  const strong = new Set(picks.filter((pick) => pick.blendedScore >= 60).map((pick) => pick.key));
  const alerts: string[] = [];

  if (strong.has("btts_Sí") && strong.has("under_2_5_2.5")) {
    alerts.push("BTTS Sí + Menos de 2.5 goles: depende mucho del 1-1. Riesgo oculto.");
  }
  if ((strong.has("btts_Sí") || strong.has("no_clean_Sí")) && strong.has("under_2_5_2.5")) {
    alerts.push("Hay señales de gol por ambos lados, eso bloquea un Under 2.5 agresivo.");
  }
  if (strong.has("over_4_5_cards_4.5") && strong.has("under_4_5_cards_4.5")) {
    alerts.push("Tarjetas over y under en la misma línea: mercado contradictorio.");
  }
  if (strong.has("over_2_5_2.5") && strong.has("under_2_5_2.5")) {
    alerts.push("Más de 2.5 y Menos de 2.5 goles al mismo tiempo: evitar goles.");
  }
  if (strong.has("over_10_5_corners_10.5") && strong.has("under_10_5_corners_10.5")) {
    alerts.push("Over y Under 10.5 corners aparecen fuertes: revisar registros de corners a favor/en contra.");
  }
  if (strong.has("ganador_") && strong.has("empate_")) {
    alerts.push("Ganador y empate aparecen fuertes: evitar 1X2 directo.");
  }

  return alerts;
}

function safeReadStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("analizador_pro_h2h_licuadora_v2") || localStorage.getItem("analizador_pro_h2h_moderno_v1") || localStorage.getItem("simpleApp");
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ExportShape>;
  } catch {
    return null;
  }
}

function formatScore(score: number) {
  return `${score.toFixed(1)}%`;
}

function hasIndicatorSignal(indicators: Indicator[]) {
  return indicators.some((indicator) => Boolean(getMarketValue(indicator.market)) && parseRecord(indicator.record) > 0);
}

function hasHouseOdd(houseMarkets: HouseMarket) {
  return [
    houseMarkets.goalsOverOdd,
    houseMarkets.goalsUnderOdd,
    houseMarkets.cornersOverOdd,
    houseMarkets.cornersUnderOdd,
    houseMarkets.cardsOverOdd,
    houseMarkets.cardsUnderOdd,
    houseMarkets.dcLocalDrawOdd,
    houseMarkets.dcDrawVisitOdd,
    houseMarkets.dcLocalVisitOdd,
    houseMarkets.handicapLocalOdd,
    houseMarkets.handicapVisitOdd,
  ].some((odd) => toNumber(odd) > 1);
}

function marketValueFromGroup(group: MarketGroup, direction: "over" | "under", line: string) {
  const safeLine = line.replace(".", "_");
  if (group === "goals") return `${direction}_${safeLine}`;
  if (group === "corners") return `${direction}_${safeLine}_corners`;
  return `${direction}_${safeLine}_cards`;
}

function marketValueFromHandicap(side: "local" | "visit", line: string) {
  const n = toNumber(line);
  const safe = Math.abs(n).toString().replace(".", "_");
  const sign = n >= 0 ? "plus" : "minus";
  return side === "local" ? `local_${sign}_${safe}` : `visit_${sign}_${safe}`;
}

function labelFromHandicap(side: "local" | "visit", line: string, match: Match) {
  const team = side === "local" ? match.local || "Local" : match.visitante || "Visitante";
  return `${team} ${line} handicap`;
}

function scoreHandicapMarket(side: "local" | "visit", line: string, localRows: RecentRow[], visitRows: RecentRow[]) {
  const handicap = toNumber(line);
  if (side === "local") {
    return average([handicapPct(localRows, handicap), 100 - handicapPct(visitRows, -handicap)].filter((n) => n >= 0));
  }
  return average([handicapPct(visitRows, handicap), 100 - handicapPct(localRows, -handicap)].filter((n) => n >= 0));
}

function labelFromHouse(group: MarketGroup, direction: "over" | "under", line: string) {
  const label = group === "goals" ? "goles" : group === "corners" ? "corners" : "tarjetas";
  return `${direction === "over" ? "Más" : "Menos"} de ${line} ${label}`;
}

function scoreHouseMarket(group: MarketGroup, direction: "over" | "under", line: string, localRows: RecentRow[], visitRows: RecentRow[]) {
  const projection = buildProjection(localRows, visitRows);
  const lineNumber = toNumber(line);
  if (group === "goals") return probabilityByLine(projection.expectedGoals, lineNumber, direction, 2.1);
  if (group === "corners") return probabilityByLine(projection.expectedCorners, lineNumber, direction, 5.2);
  return clamp(probabilityByLine(projection.expectedCards, lineNumber, direction, 3.4), 0, 88);
}

function getLineTrapAssessment(
  group: MarketGroup,
  direction: "over" | "under",
  line: string,
  expected: number,
  odd: number,
  modelScore: number
) {
  const lineNumber = toNumber(line);
  const margin = direction === "over" ? expected - lineNumber : lineNumber - expected;
  const absMargin = Math.abs(expected - lineNumber);
  const flags: string[] = [];
  let adjustment = 0;
  let level: TrapLevel = "neutral";
  let label = "⚪ Línea neutra";

  if (!expected || !lineNumber) {
    return { level, label, margin: 0, adjustment, flags };
  }

  const tightLimit = group === "goals" ? 0.35 : group === "corners" ? 1.5 : 0.8;
  const comfortLimit = group === "goals" ? 0.9 : group === "corners" ? 2.4 : 1.4;

  if (absMargin <= tightLimit) {
  level = "linea_estrecha";
  label = "🚫 Zona prohibida";

  adjustment -= group === "corners" ? 35 : group === "cards" ? 22 : 25;

  flags.push(`🚫 ZONA PROHIBIDA: proyección ${expected.toFixed(1)} vs línea ${lineNumber.toFixed(1)}. NO jugar.`);
}

  if (group === "corners" && direction === "under" && lineNumber <= 11.5 && absMargin <= 2.0) {
    level = "trampa_probable";
    label = "🔴 Trampa probable";
    adjustment -= 18;
    flags.push("Under corners apretado: la casa suele poner esta línea al límite. Evitar como base de parlay.");
  }

  if (group === "corners" && direction === "over" && lineNumber <= 5.5 && expected < lineNumber + 2.0) {
    level = "linea_sospechosa";
    label = "🟠 Línea sospechosamente baja";
    adjustment -= 14;
    flags.push("Over corners muy bajo: puede parecer regalo, pero si la proyección no sobra, cuidado con trampa de ritmo.");
  }

  if (group === "goals" && direction === "over" && lineNumber <= 1.5 && expected < lineNumber + 0.65) {
    level = "linea_sospechosa";
    label = "🟠 Línea baja sospechosa";
    adjustment -= 10;
    flags.push("Over goles bajo: parece fácil, pero la proyección no da colchón suficiente.");
  }

  if (group === "cards" && direction === "over" && lineNumber <= 2.5 && expected < lineNumber + 1.2) {
    level = "linea_sospechosa";
    label = "🟠 Línea baja sospechosa";
    adjustment -= 10;
    flags.push("Over tarjetas bajo: sin árbitro/contexto puede ser value engañoso.");
  }

  if (margin >= comfortLimit && modelScore >= 64 && level === "neutral") {
    level = "linea_comoda";
    label = "🟢 Línea cómoda";
    adjustment += 4;
    flags.push(`Línea con colchón: proyección ${expected.toFixed(1)} vs línea ${lineNumber.toFixed(1)}.`);
  }

  if (margin >= comfortLimit + (group === "corners" ? 0.8 : 0.25) && odd > 1.35 && modelScore >= 66) {
    level = "valor_real";
    label = "💰 Valor real posible";
    adjustment += 5;
    flags.push("Valor real posible: la proyección supera la línea y la cuota no está completamente exprimida.");
  }

  return { level, label, margin, adjustment, flags };
}

function marketTrapInput(marketValue: string, line: string, projection: ReturnType<typeof buildProjection>) {
  const lineNumber = toNumber(line);
  if (!lineNumber) return null;

  if (marketValue.includes("corners")) {
    return {
      group: "corners" as MarketGroup,
      direction: marketValue.includes("over") ? "over" as const : "under" as const,
      expected: projection.expectedCorners,
    };
  }

  if (isCardMarket(marketValue)) {
    return {
      group: "cards" as MarketGroup,
      direction: marketValue.includes("over") ? "over" as const : "under" as const,
      expected: projection.expectedCards,
    };
  }

  if (marketValue === "over_1_5" || marketValue === "over_2_5") {
    return { group: "goals" as MarketGroup, direction: "over" as const, expected: projection.expectedGoals };
  }

  if (marketValue === "under_2_5" || marketValue === "under_4_5") {
    return { group: "goals" as MarketGroup, direction: "under" as const, expected: projection.expectedGoals };
  }

  return null;
}


export default function Page() {
  const importRef = useRef<HTMLInputElement | null>(null);
  const bankrollImportRef = useRef<HTMLInputElement | null>(null);
  const dailyPicksImportRef = useRef<HTMLInputElement | null>(null);

  const [match, setMatch] = useState<Match>({
    local: "",
    visitante: "",
    oddLocal: "",
    oddDraw: "",
    oddVisit: "",
    localColor1: "#38bdf8",
    localColor2: "#ffffff",
    visitColor1: "#ef4444",
    visitColor2: "#111827",
    backgroundMode: "team",
    backgroundImage: "",
  });

  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [localRecent, setLocalRecent] = useState<RecentRow[]>(createRecentRows());
  const [visitRecent, setVisitRecent] = useState<RecentRow[]>(createRecentRows());
  const [houseMarkets, setHouseMarkets] = useState<HouseMarket>(emptyHouseMarkets());
  const [eliminationContext, setEliminationContext] = useState<EliminationContext>(emptyEliminationContext());
  const [refereeContext, setRefereeContext] = useState<RefereeContext>(emptyRefereeContext());
  const [dominanceContext, setDominanceContext] = useState<DominanceContext>(emptyDominanceContext());
  const [indicatorBulkCount, setIndicatorBulkCount] = useState("1");
  const [bankroll, setBankroll] = useState<BankrollState>(emptyBankroll());
  const [bankBetDraft, setBankBetDraft] = useState<Omit<BankBet, "id">>(emptyBankBet());
  const [dailyPicks, setDailyPicks] = useState<DailyPick[]>([]);
  const [dailyPlanGenerated, setDailyPlanGenerated] = useState(false);

  const bankrollStats = useMemo(() => buildBankrollStats(bankroll), [bankroll]);
  const dailyPlan = useMemo(() => buildDailyPlan(dailyPicks), [dailyPicks]);

  const isPickInDaily = (pick: ParlayPickForDay) => {
    const matchName = `${match.local || "Local"} vs ${match.visitante || "Visitante"}`;
    const uniqueKey = `${matchName}__${pick.key}`;
    return dailyPicks.some((item) => item.uniqueKey === uniqueKey);
  };

  const addPickToDaily = (pick: ParlayPickForDay) => {
    const matchName = `${match.local || "Local"} vs ${match.visitante || "Visitante"}`;
    const uniqueKey = `${matchName}__${pick.key}`;
    if (dailyPicks.some((item) => item.uniqueKey === uniqueKey)) {
      alert("Ese pick ya está en apuestas del día.");
      return;
    }
    const nextPick: DailyPick = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      matchName,
      label: pick.label,
      line: pick.line || "",
      marketValue: pick.marketValue || "",
      odd: Number.isFinite(pick.odd) ? pick.odd : 0,
      score: pick.score || 0,
      tier: pick.tier || "",
      grade: pick.grade || "reasonable",
      source: pick.source,
      riskFlags: Array.isArray(pick.riskFlags) ? pick.riskFlags : [],
      uniqueKey,
    };
    setDailyPicks((prev) => [nextPick, ...prev]);
    setDailyPlanGenerated(false);
  };

  const removeDailyPick = (id: string) => {
    setDailyPicks((prev) => prev.filter((pick) => pick.id !== id));
    setDailyPlanGenerated(false);
  };

  const clearDailyPicks = () => {
    if (!confirm("¿Limpiar solo las apuestas del día?")) return;
    setDailyPicks([]);
    setDailyPlanGenerated(false);
    if (typeof window !== "undefined") localStorage.removeItem(DAILY_PICKS_STORAGE_KEY);
  };

  const exportDailyPicks = () => {
    const data = { version: 1, exportedAt: new Date().toISOString(), dailyPicks };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `apuestas_del_dia_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const importDailyPicks = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as ({ dailyPicks?: DailyPick[] } | DailyPick[]);
        const incoming = Array.isArray(data) ? data : Array.isArray(data.dailyPicks) ? data.dailyPicks : [];
        setDailyPicks(incoming.map((pick) => ({
          id: pick.id || makeId(),
          createdAt: pick.createdAt || new Date().toISOString(),
          matchName: pick.matchName || "Partido",
          label: pick.label || "Pick",
          line: pick.line || "",
          marketValue: pick.marketValue || "",
          odd: Number.isFinite(Number(pick.odd)) ? Number(pick.odd) : 0,
          score: Number.isFinite(Number(pick.score)) ? Number(pick.score) : 0,
          tier: pick.tier || "",
          grade: (pick.grade as Grade) || "reasonable",
          source: (pick.source as "SofaScore" | "Casa") || "Casa",
          riskFlags: Array.isArray(pick.riskFlags) ? pick.riskFlags : [],
          uniqueKey: pick.uniqueKey || `${pick.matchName || "Partido"}__${pick.label || "Pick"}_${pick.line || ""}`,
        })));
        setDailyPlanGenerated(false);
        alert("📨 Apuestas del día importadas");
      } catch {
        alert("❌ No pude importar ese archivo. Usa un JSON exportado por la app.");
      }
    };
    reader.readAsText(file);
  };

  const addBankBet = () => {
    if (!bankBetDraft.matchName.trim() || !bankBetDraft.pick.trim() || toNumber(bankBetDraft.stake) <= 0 || toNumber(bankBetDraft.odd) <= 1) {
      alert("Completa partido, pick, monto apostado y cuota mayor a 1.00");
      return;
    }
    const nextBet: BankBet = { ...bankBetDraft, id: makeId() };
    setBankroll((prev) => ({ ...prev, bets: [nextBet, ...prev.bets] }));
    setBankBetDraft(emptyBankBet());
  };

  const updateBankBetStatus = (id: string, status: BetStatus) => {
    setBankroll((prev) => ({
      ...prev,
      bets: prev.bets.map((bet) => (bet.id === id ? { ...bet, status } : bet)),
    }));
  };

  const deleteBankBet = (id: string) => {
    if (!confirm("¿Eliminar este registro del historial?")) return;
    setBankroll((prev) => ({ ...prev, bets: prev.bets.filter((bet) => bet.id !== id) }));
  };

  const resetBankroll = () => {
    if (!confirm("Esto borra SOLO el historial de bankroll. ¿Continuar?")) return;
    if (typeof window !== "undefined") localStorage.removeItem(BANKROLL_STORAGE_KEY);
    setBankroll(emptyBankroll());
    setBankBetDraft(emptyBankBet());
  };

  const exportBankroll = () => {
    const data = { version: 1, exportedAt: new Date().toISOString(), bankroll };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bankroll_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const importBankroll = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as ({ bankroll?: Partial<BankrollState> } & Partial<BankrollState>);
        const incoming: Partial<BankrollState> = data.bankroll || data;
        setBankroll({
          initialBank: typeof incoming.initialBank === "string" ? incoming.initialBank : "",
          bets: Array.isArray(incoming.bets)
            ? incoming.bets.map((bet) => ({
                id: bet.id || makeId(),
                date: bet.date || new Date().toISOString().slice(0, 10),
                matchName: bet.matchName || "",
                pick: bet.pick || "",
                market: bet.market || "",
                stake: bet.stake || "",
                odd: bet.odd || "",
                status: (bet.status as BetStatus) || "pending",
                source: (bet.source as BetSource) || "app",
                notes: bet.notes || "",
              }))
            : [],
        });
        alert("📨 Bankroll importado");
      } catch {
        alert("❌ No pude importar ese bankroll. Usa un JSON exportado por la app.");
      }
    };
    reader.readAsText(file);
  };

  const createEmptyIndicator = (): Indicator => ({ id: makeId(), team: "ambos", period: "full", market: "", line: "", record: "", houseOdd: "" });

  const addIndicator = () => {
    setIndicators((prev) => [...prev, createEmptyIndicator()]);
  };

  const addMultipleIndicators = () => {
    const count = clamp(Number(indicatorBulkCount) || 1, 1, 20);
    setIndicators((prev) => [...prev, ...Array.from({ length: count }, () => createEmptyIndicator())]);
  };

  const getHouseFieldsForIndicator = (marketInput: string, lineInput: string): HouseFieldMap | null => {
    const marketValue = getMarketValue(marketInput);
    const line = String(lineInput || "").trim();
    if (!marketValue) return null;

    if (marketValue === "local_o_empate") {
      return { oddField: "dcLocalDrawOdd" as const };
    }
    if (marketValue === "visitante_o_empate") {
      return { oddField: "dcDrawVisitOdd" as const };
    }
    if (marketValue === "local_o_visitante") {
      return { oddField: "dcLocalVisitOdd" as const };
    }

    if (marketValue.startsWith("local_plus_") || marketValue.startsWith("local_minus_")) {
      return { lineField: "handicapLocalLine" as const, oddField: "handicapLocalOdd" as const };
    }
    if (marketValue.startsWith("visit_plus_") || marketValue.startsWith("visit_minus_")) {
      return { lineField: "handicapVisitLine" as const, oddField: "handicapVisitOdd" as const };
    }

    if (!line) return null;

    if (marketValue.startsWith("over_") && !marketValue.includes("corners") && !marketValue.includes("cards")) {
      return { lineField: "goalsOverLine" as const, oddField: "goalsOverOdd" as const };
    }
    if (marketValue.startsWith("under_") && !marketValue.includes("corners") && !marketValue.includes("cards")) {
      return { lineField: "goalsUnderLine" as const, oddField: "goalsUnderOdd" as const };
    }
    if (marketValue.includes("corners") && marketValue.includes("over")) {
      return { lineField: "cornersOverLine" as const, oddField: "cornersOverOdd" as const };
    }
    if (marketValue.includes("corners") && marketValue.includes("under")) {
      return { lineField: "cornersUnderLine" as const, oddField: "cornersUnderOdd" as const };
    }
    if (marketValue.includes("cards") && marketValue.includes("over")) {
      return { lineField: "cardsOverLine" as const, oddField: "cardsOverOdd" as const };
    }
    if (marketValue.includes("cards") && marketValue.includes("under")) {
      return { lineField: "cardsUnderLine" as const, oddField: "cardsUnderOdd" as const };
    }
    return null;
  };

  const findHouseOddForIndicator = (marketInput: string, lineInput: string) => {
    const fields = getHouseFieldsForIndicator(marketInput, lineInput);
    const line = String(lineInput || "").trim();
    if (!fields) return "";
    if (!("lineField" in fields)) return String(houseMarkets[fields.oddField] || "");
    if (!line) return "";
    return line === String(houseMarkets[fields.lineField] || "").trim() ? String(houseMarkets[fields.oddField] || "") : "";
  };

  const updateIndicator = (id: string, field: keyof Indicator, value: string) => {
    setIndicators((prev) =>
      prev.map((indicator) => {
        if (indicator.id !== id) return indicator;

        const next: Indicator = { ...indicator, [field]: value };
        if (field === "market") {
          const selected = MARKET_OPTIONS.find((option) => option.value === value || option.label === value);
          next.market = selected?.value || value;
          next.line = selected?.line || "";
          if (isStreakIndicatorMarket(next.market)) next.houseOdd = "";
        }

        if (field === "market" || field === "line") {
          if (isStreakIndicatorMarket(next.market)) {
            next.line = "";
            next.houseOdd = "";
          } else {
            const autoOdd = findHouseOddForIndicator(next.market, next.line);
            if (autoOdd) next.houseOdd = autoOdd;
          }
        }

        return next;
      })
    );
  };

  const updateIndicatorMarket = (id: string, marketValue: string) => {
    const selected = MARKET_OPTIONS.find((option) => option.value === marketValue);
    setIndicators((prev) =>
      prev.map((indicator) => {
        if (indicator.id !== id) return indicator;
        const next: Indicator = {
          ...indicator,
          market: selected?.value || "",
          line: selected?.line || "",
          houseOdd: isStreakIndicatorMarket(selected?.value || "") ? "" : indicator.houseOdd,
        };
        if (isStreakIndicatorMarket(next.market)) {
          next.line = "";
          next.houseOdd = "";
        } else {
          const autoOdd = findHouseOddForIndicator(next.market, next.line);
          if (autoOdd) next.houseOdd = autoOdd;
        }
        return next;
      })
    );
  };

  const removeIndicator = (id: string) => {
    setIndicators((prev) => prev.filter((indicator) => indicator.id !== id));
  };

  const updateRecent = (side: "local" | "visitante", id: string, field: keyof RecentRow, value: string) => {
    const setter = side === "local" ? setLocalRecent : setVisitRecent;
    setter((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const addRecentRow = (side: "local" | "visitante") => {
    const setter = side === "local" ? setLocalRecent : setVisitRecent;
    setter((prev) => [...prev, emptyRecentRow()]);
  };

  const projection = useMemo(() => buildProjection(localRecent, visitRecent), [localRecent, visitRecent]);
  const refereeCardAdjustment = useMemo(() => getRefereeCardAdjustment(refereeContext), [refereeContext]);
  const adjustedCardsExpected = useMemo(() => clamp(projection.expectedCards + refereeCardAdjustment.expectedBoost, 0, 12), [projection.expectedCards, refereeCardAdjustment.expectedBoost]);
  const matchProfile = useMemo(() => buildMatchProfile(indicators, localRecent, visitRecent), [indicators, localRecent, visitRecent]);
  const totalRecentCount = useMemo(() => countValidRows(localRecent).length + countValidRows(visitRecent).length, [localRecent, visitRecent]);
  const hasMinimumData = useMemo(() => {
    const hasTeams = Boolean(match.local.trim()) && Boolean(match.visitante.trim());
    const hasSignals = hasIndicatorSignal(indicators) || totalRecentCount >= 2 || hasHouseOdd(houseMarkets);
    return hasTeams && hasSignals;
  }, [match.local, match.visitante, indicators, totalRecentCount, houseMarkets]);
  const dominanceAnalysis = useMemo(() => buildDominanceAnalysis(dominanceContext, projection, adjustedCardsExpected, match, hasMinimumData), [dominanceContext, projection, adjustedCardsExpected, match, hasMinimumData]);

  const housePicks = useMemo<HousePick[]>(() => {
    const candidates: Array<{ group: MarketGroup; direction: "over" | "under"; line: string; odd: string }> = [
      { group: "goals", direction: "over", line: houseMarkets.goalsOverLine, odd: houseMarkets.goalsOverOdd },
      { group: "goals", direction: "under", line: houseMarkets.goalsUnderLine, odd: houseMarkets.goalsUnderOdd },
      { group: "corners", direction: "over", line: houseMarkets.cornersOverLine, odd: houseMarkets.cornersOverOdd },
      { group: "corners", direction: "under", line: houseMarkets.cornersUnderLine, odd: houseMarkets.cornersUnderOdd },
      { group: "cards", direction: "over", line: houseMarkets.cardsOverLine, odd: houseMarkets.cardsOverOdd },
      { group: "cards", direction: "under", line: houseMarkets.cardsUnderLine, odd: houseMarkets.cardsUnderOdd },
    ];

    const local = projection.local;
    const visit = projection.visit;
    const totalRecords = (local.count || 0) + (visit.count || 0);

    if (!hasMinimumData || totalRecords < 2) {
      return [];
    }

    const marketLinePicks = candidates
      .filter((candidate) => candidate.line)
      .map((candidate) => {
        const odd = toNumber(candidate.odd);
        const implied = impliedProb(odd);
        let modelScore = scoreHouseMarket(candidate.group, candidate.direction, candidate.line, localRecent, visitRecent);
        const marketValue = marketValueFromGroup(candidate.group, candidate.direction, candidate.line);
        const riskFlags: string[] = [];

        if (isSecondLegWithLead(eliminationContext)) {
          const lead = toNumber(eliminationContext.leadGoals);
          if (candidate.group === "goals" && candidate.direction === "over" && toNumber(candidate.line) >= 2.5) {
            modelScore = clamp(modelScore - (lead >= 2 ? 18 : 12), 0, 100);
            riskFlags.push("Contexto de vuelta: hay ventaja global. El over agresivo baja porque el equipo con ventaja puede administrar.");
          }
          if (candidate.group === "goals" && candidate.direction === "under" && toNumber(candidate.line) >= 4.5) {
            modelScore = clamp(modelScore + 8, 0, 100);
            riskFlags.push("Contexto de vuelta: under amplio gana valor por gestión del resultado global.");
          }
          if (candidate.group === "cards" && candidate.direction === "over" && toNumber(candidate.line) <= 4.5) {
            modelScore = clamp(modelScore + 7, 0, 100);
            riskFlags.push("Contexto de eliminación: presión alta puede subir tarjetas.");
          }
          if (candidate.group === "cards" && candidate.direction === "under" && toNumber(candidate.line) <= 4.5) {
            modelScore = clamp(modelScore - 6, 0, 100);
            riskFlags.push("Contexto de eliminación: cuidado con under de tarjetas corto.");
          }
        }

        if (candidate.group === "cards") {
          const refBoost = refereeCardAdjustment.scoreAdjustment;
          if (refBoost !== 0) {
            modelScore = clamp(modelScore + (candidate.direction === "over" ? refBoost : -refBoost * 0.65), 0, 100);
            riskFlags.push(...refereeCardAdjustment.notes);
          }
        }

        if (candidate.group === "corners" && candidate.direction === "under" && toNumber(candidate.line) <= 10.5 && projection.expectedCorners >= 10.8) {
          modelScore = clamp(modelScore - 22, 0, 100);
          riskFlags.push(`Freno under corners: registros proyectan ${projection.expectedCorners.toFixed(1)} corners.`);
        }
        if (candidate.group === "corners" && candidate.direction === "over" && projection.expectedCorners >= toNumber(candidate.line) + 1) {
          modelScore = clamp(modelScore + 8, 0, 100);
        }
        if (candidate.group === "goals" && candidate.direction === "under" && matchProfile.blockUnderGoals) {
          modelScore = clamp(modelScore - 18, 0, 100);
          riskFlags.push("Bloqueado/castigado: perfil ofensivo contra under de goles.");
        }
        if (candidate.group === "cards") {
          modelScore = clamp(modelScore - 8, 0, 100);
          riskFlags.push("Tarjetas dependen de árbitro/contexto: bajar stake.");
        }

        const expectedForTrap = candidate.group === "goals" ? projection.expectedGoals : candidate.group === "corners" ? projection.expectedCorners : adjustedCardsExpected;
        const trap = getLineTrapAssessment(candidate.group, candidate.direction, candidate.line, expectedForTrap, odd, modelScore);
        modelScore = clamp(modelScore + trap.adjustment, 0, 100);
        riskFlags.push(...trap.flags);

        if (implied > 0 && modelScore - implied < 0) riskFlags.push("La cuota no acompaña: sin value claro.");

        const value = implied > 0 ? modelScore - implied : 0;
        const grade = getGrade(modelScore, riskFlags);
        return {
          key: `house_${candidate.group}_${candidate.direction}_${candidate.line}`,
          label: labelFromHouse(candidate.group, candidate.direction, candidate.line),
          marketValue,
          line: candidate.line,
          odd,
          implied,
          modelScore,
          value,
          grade,
          tier: getTierLabel(grade),
          riskFlags,
          trapLevel: trap.level,
          trapLabel: trap.label,
          margin: trap.margin,
        };
      });

    const strength = recordStrength(totalRecords);
    const selectedLocalHandicapLine = houseMarkets.handicapLocalLine || "+1.5";
    const selectedVisitHandicapLine = houseMarkets.handicapVisitLine || "+1.5";

    const resultCandidates: Array<{ label: string; marketValue: string; line: string; score: number; odd: number }> = [
      { label: `${match.local || "Local"} gana`, marketValue: "ganador", line: "1", score: clamp((local.winPct * 0.6 + visit.noWinPct * 0.4) * strength, 0, 100), odd: toNumber(match.oddLocal) },
      { label: `${match.visitante || "Visitante"} gana`, marketValue: "ganador", line: "2", score: clamp((visit.winPct * 0.6 + local.noWinPct * 0.4) * strength, 0, 100), odd: toNumber(match.oddVisit) },
      { label: "Empate", marketValue: "empate", line: "X", score: clamp(average([local.drawPct, visit.drawPct]) * strength, 0, 100), odd: toNumber(match.oddDraw) },
      { label: `${match.local || "Local"} o empate`, marketValue: "local_o_empate", line: "1X", score: clamp((local.noLosePct * 0.65 + visit.noWinPct * 0.35) * strength, 0, 100), odd: toNumber(houseMarkets.dcLocalDrawOdd) },
      { label: `Empate o ${match.visitante || "Visitante"}`, marketValue: "visitante_o_empate", line: "X2", score: clamp((visit.noLosePct * 0.65 + local.noWinPct * 0.35) * strength, 0, 100), odd: toNumber(houseMarkets.dcDrawVisitOdd) },
      { label: `${match.local || "Local"} o ${match.visitante || "Visitante"}`, marketValue: "local_o_visitante", line: "12", score: clamp((100 - average([local.drawPct, visit.drawPct])) * strength, 0, 100), odd: toNumber(houseMarkets.dcLocalVisitOdd) },
      { label: labelFromHandicap("local", selectedLocalHandicapLine, match), marketValue: marketValueFromHandicap("local", selectedLocalHandicapLine), line: selectedLocalHandicapLine, score: clamp(scoreHandicapMarket("local", selectedLocalHandicapLine, localRecent, visitRecent) * strength, 0, 100), odd: toNumber(houseMarkets.handicapLocalOdd) },
      { label: labelFromHandicap("visit", selectedVisitHandicapLine, match), marketValue: marketValueFromHandicap("visit", selectedVisitHandicapLine), line: selectedVisitHandicapLine, score: clamp(scoreHandicapMarket("visit", selectedVisitHandicapLine, localRecent, visitRecent) * strength, 0, 100), odd: toNumber(houseMarkets.handicapVisitOdd) },
    ];

    const resultPicks: HousePick[] = resultCandidates
      .filter((candidate) => candidate.score >= 56)
      .map((candidate) => {
        const implied = impliedProb(candidate.odd);
        const value = implied > 0 ? candidate.score - implied : 0;
        const riskFlags: string[] = [];
        if ((local.count || 0) + (visit.count || 0) < 6) riskFlags.push("Pocos registros: lectura secundaria.");
        if (isSecondLegWithLead(eliminationContext)) {
          if (candidate.marketValue === "ganador") riskFlags.push("Vuelta con ventaja global: ganador directo puede engañar, prioriza doble oportunidad/handicap.");
          if (candidate.marketValue === "local_o_empate" && eliminationContext.advantageTeam === "local") candidate.score = clamp(candidate.score + 6, 0, 100);
          if (candidate.marketValue === "visitante_o_empate" && eliminationContext.advantageTeam === "visitante") candidate.score = clamp(candidate.score + 6, 0, 100);
          if (candidate.marketValue.includes("plus")) candidate.score = clamp(candidate.score + 4, 0, 100);
        }
        if ((candidate.marketValue === "ganador" || candidate.marketValue.includes("minus")) && candidate.score < 72) riskFlags.push("Ganador/handicap negativo requiere margen: riesgo medio.");
        if (implied > 0 && value < 0) riskFlags.push("La cuota no acompaña: sin value claro.");
        const grade = getGrade(candidate.score, riskFlags);
        return { key: `registro_${candidate.marketValue}_${candidate.line}`, label: candidate.label, marketValue: candidate.marketValue, line: candidate.line, odd: candidate.odd, implied, modelScore: candidate.score, value, grade, tier: getTierLabel(grade), riskFlags };
      });

    return [...marketLinePicks, ...resultPicks].sort((a, b) => b.modelScore - a.modelScore);
  }, [houseMarkets, localRecent, visitRecent, matchProfile, projection, match, eliminationContext, refereeCardAdjustment, adjustedCardsExpected, hasMinimumData]);

  const antiCasaAlerts = useMemo(() => {
    // Anti-Casa solo debe aparecer cuando hay datos reales:
    // equipos + registros recientes + cuotas/líneas cargadas por el usuario.
    // Así evitamos que después de Limpiar aparezcan lecturas con líneas default y "Sin cuota".
    if (!hasMinimumData || totalRecentCount < 2 || !hasHouseOdd(houseMarkets)) return [];

    return housePicks
      .filter((pick) => pick.trapLevel && pick.trapLevel !== "neutral" && pick.odd > 1)
      .slice(0, 6);
  }, [housePicks, hasMinimumData, totalRecentCount, houseMarkets]);

  const results = useMemo<ResultPick[]>(() => {
    const grouped: Record<string, Indicator[]> = {};

    indicators.forEach((indicator) => {
      const marketValue = getMarketValue(indicator.market);
      const pct = parseRecord(indicator.record);
      if (!marketValue || pct <= 0) return;
      const key = `${indicator.period || "full"}_${marketValue}_${indicator.line || ""}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ ...indicator, market: marketValue });
    });

    return Object.entries(grouped)
      .map(([key, rows]) => {
        const confidences = rows.map((row) => parseRecord(row.record)).filter((n) => n > 0);
        const odds = rows.map((row) => toNumber(row.houseOdd)).filter((n) => n > 1);
        const confidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        const avgOdd = odds.length ? odds.reduce((a, b) => a + b, 0) / odds.length : 0;
        const implied = avgOdd > 1 ? impliedProb(avgOdd) : 0;
        const value = implied > 0 ? confidence - implied : 0;
        const marketValue = rows[0]?.market || "";
        const line = rows[0]?.line || "";
        const period = rows[0]?.period || "full";
        const recentScore = scoreMarketFromRecent(marketValue, line, localRecent, visitRecent);
        let blendedScore = recentScore > 0 ? confidence * 0.52 + recentScore * 0.48 : confidence;
        const riskFlags: string[] = [];

        if (period !== "full") {
          blendedScore = clamp(blendedScore - 4, 0, 100);
          riskFlags.push(`Periodo ${getPeriodLabel(period)}: úsalo como refuerzo para resultado/doble oportunidad/handicap.`);
        }

        if (isUnderGoalMarket(marketValue) && matchProfile.blockUnderGoals) {
          blendedScore = clamp(blendedScore - (marketValue === "under_2_5" ? 30 : 14), 0, 100);
          riskFlags.push("Bloqueado/castigado: hay BTTS, no clean sheet o perfil abierto contra el under de goles.");
        }

        if (isUnderCornerMarket(marketValue) && toNumber(line) <= 10.5 && projection.expectedCorners >= 10.8) {
          blendedScore = clamp(blendedScore - 28, 0, 100);
          riskFlags.push(`Freno under corners: registros proyectan ${projection.expectedCorners.toFixed(1)} corners.`);
        }

        if (isCornerMarket(marketValue) && marketValue.includes("over") && projection.expectedCorners >= toNumber(line) + 1) {
          blendedScore = clamp(blendedScore + 9, 0, 100);
        }

        const trapInput = marketTrapInput(marketValue, line, projection);
        if (trapInput) {
          const trap = getLineTrapAssessment(trapInput.group, trapInput.direction, line, trapInput.expected, avgOdd, blendedScore);
          blendedScore = clamp(blendedScore + trap.adjustment, 0, 100);
          riskFlags.push(...trap.flags);
        }

        if (isOverGoalMarket(marketValue) && matchProfile.type === "abierto") {
          blendedScore = clamp(blendedScore + 8, 0, 100);
        }

        if (isCardMarket(marketValue)) {
          const cardPenalty = rows.length >= 2 ? 6 : 12;
          const refBoost = refereeCardAdjustment.scoreAdjustment;
          blendedScore = clamp(blendedScore - cardPenalty + (marketValue.includes("over") ? refBoost : -refBoost * 0.65), 0, 100);
          riskFlags.push("Tarjetas bajan prioridad: mercado dependiente de árbitro/contexto.");
          if (refereeCardAdjustment.notes.length) riskFlags.push(...refereeCardAdjustment.notes);
        }

        if (rows.length === 1 && confidence >= 85) riskFlags.push("Solo 1 señal: confirmar antes de jugar fuerte.");
        if (recentScore > 0 && Math.abs(confidence - recentScore) >= 25) riskFlags.push("SofaScore y últimos registros no coinciden del todo.");
        if (confidence >= 80 && avgOdd >= 1.85) riskFlags.push("Cuota alta para una señal fuerte: revisar alineaciones/contexto.");
        if (implied > 0 && value < 0) riskFlags.push("La cuota no acompaña: posible pick sin value.");
        if (confidence >= 70 && confidence < 85 && avgOdd >= 2.1) riskFlags.push("Value agresivo: buena cuota, pero riesgo medio/alto.");
        if (isCardMarket(marketValue) && rows.length <= 1) riskFlags.push("Tarjetas con una sola señal: confirmar árbitro/contexto antes de confiar.");

        const grade = getGrade(blendedScore, riskFlags);

        return {
          key,
          label: getMarketLabel(marketValue),
          marketValue,
          line,
          confidence,
          recentScore,
          blendedScore,
          count: rows.length,
          grade,
          tier: getTierLabel(grade),
          avgOdd,
          implied,
          value,
          riskFlags,
          sources: rows,
        };
      })
      .sort((a, b) => {
        const aRank = a.blendedScore - marketSortPenalty(a.marketValue, a.blendedScore, a.count);
        const bRank = b.blendedScore - marketSortPenalty(b.marketValue, b.blendedScore, b.count);
        return bRank - aRank;
      });
  }, [indicators, localRecent, visitRecent, matchProfile, projection.expectedCorners, refereeCardAdjustment]);

  const contradictionAlerts = useMemo(() => detectContradictions(results), [results]);

  const analysis = useMemo(() => {
    if (!hasMinimumData) return null;

    const combinedTop = [
      ...results.map((pick) => ({ source: "SofaScore" as const, score: pick.blendedScore, label: pick.label, line: pick.line, grade: pick.grade, value: pick.value, implied: pick.implied, flags: pick.riskFlags })),
      ...housePicks.map((pick) => ({ source: "Casa" as const, score: pick.modelScore, label: pick.label, line: pick.line, grade: pick.grade, value: pick.value, implied: pick.implied, flags: pick.riskFlags })),
    ].sort((a, b) => b.score - a.score);

    if (!combinedTop.length) return null;

    const best = combinedTop[0];
    const hasHardContradiction = contradictionAlerts.length > 0;

    let decision = "⚠️ Evaluar";
    let detail = "Hay señales, pero falta confirmar cuota o contexto.";

    if (hasHardContradiction || matchProfile.type === "trampa") {
      decision = "⚠️ JUGAR CONSERVADOR";
      detail = "Hay contradicciones o perfil trampa. Evita parlay grande y busca línea más protegida.";
    }
    if (!hasHardContradiction && matchProfile.type !== "trampa" && best.grade === "safe" && (best.value >= 5 || best.implied === 0)) {
      decision = "🔥 JUGAR";
      detail = "La señal principal tiene buena fuerza y los registros no la contradicen.";
    }
    if (best.grade === "risky") {
      decision = "❌ NO JUGAR";
      detail = "No hay suficiente fuerza o hay demasiado riesgo oculto.";
    }

    return { best, decision, detail };
  }, [results, housePicks, contradictionAlerts, matchProfile, hasMinimumData]);

  const quickFillBankBet = () => {
    setBankBetDraft((prev) => ({
      ...prev,
      matchName: `${match.local || "Local"} vs ${match.visitante || "Visitante"}`,
      pick: analysis?.best ? `${analysis.best.label}${analysis.best.line ? ` · ${analysis.best.line}` : ""}` : prev.pick,
      market: analysis?.best?.label || prev.market,
      odd: analysis?.best?.implied ? (100 / analysis.best.implied).toFixed(2) : prev.odd,
      source: "app",
    }));
  };

  const parlaySuggestions = useMemo(() => {
    if (!hasMinimumData) {
      return { conservador: [], riesgoso: [] };
    }

    const familyOf = (market: string) => {
      if (isCardMarket(market)) return "cards";
      if (market.includes("corners")) return "corners";
      if (isGoalMarket(market)) return "goals";
      if (["ganador", "empate", "sin_derrotas", "sin_victorias", "derrotas", "victorias", "clean_sheet", "first_score", "first_concede", "first_half_winner", "first_half_loser", "wins_any_half", "local_o_empate", "visitante_o_empate", "local_o_visitante", "local_plus_1_5", "local_plus_0_5", "local_minus_0_5", "local_minus_1_5", "visit_plus_1_5", "visit_plus_0_5", "visit_minus_0_5", "visit_minus_1_5"].includes(market)) return "result";
      return market;
    };

    const combined = [
      ...results.map((pick) => ({ ...pick, score: pick.blendedScore, odd: pick.avgOdd, source: "SofaScore" as const })),
      ...housePicks.map((pick) => ({
        key: pick.key,
        label: pick.label,
        marketValue: pick.marketValue,
        line: pick.line,
        grade: pick.grade,
        tier: pick.tier,
        riskFlags: pick.riskFlags,
        score: pick.modelScore,
        odd: pick.odd,
        count: 1,
        source: "Casa" as const,
      })),
    ].sort((a, b) => b.score - a.score);

    const build = (mode: "conservador" | "riesgoso") => {
      const allowed: typeof combined = [];
      const usedFamilies = new Set<string>();

      for (const pick of combined) {
        if (pick.grade === "risky") continue;
        if (pick.riskFlags.some((flag) => flag.includes("sin value") || flag.includes("Bloqueado") || flag.includes("Freno") || flag.includes("Línea estrecha") || flag.includes("Under corners apretado") || flag.includes("sospechosa"))) continue;
        if (isCardMarket(pick.marketValue) && (pick.score < 76 || pick.count < 2)) continue;
        if (mode === "conservador" && (pick.marketValue === "btts" || pick.marketValue === "over_2_5" || pick.marketValue === "ganador")) continue;
        if (mode === "conservador" && isUnderGoalMarket(pick.marketValue) && matchProfile.blockUnderGoals) continue;
        if (mode === "conservador" && isUnderCornerMarket(pick.marketValue) && projection.expectedCorners >= 10.8) continue;
        if (mode === "riesgoso" && !(isGoalMarket(pick.marketValue) || pick.marketValue === "ganador" || pick.marketValue === "empate" || isCornerMarket(pick.marketValue))) continue;
        if (pick.riskFlags.some((flag) => flag.includes("ZONA PROHIBIDA"))) continue;

        const family = familyOf(pick.marketValue);
        if (usedFamilies.has(family)) continue;
        usedFamilies.add(family);
        allowed.push(pick);
        if (allowed.length >= 3) break;
      }
      return allowed;
    };

    return {
      conservador: build("conservador"),
      riesgoso: build("riesgoso"),
    };
  }, [results, housePicks, matchProfile, projection.expectedCorners, hasMinimumData]);


  const proMode = useMemo(() => {
    if (!hasMinimumData) return null;

    const rawPicks: ParlayPickForDay[] = [
      ...results.map((pick) => ({
        key: pick.key,
        label: pick.label,
        marketValue: pick.marketValue,
        line: pick.line,
        score: pick.blendedScore,
        odd: pick.avgOdd,
        tier: pick.tier,
        grade: pick.grade,
        riskFlags: pick.riskFlags,
        source: "SofaScore" as const,
      })),
      ...housePicks.map((pick) => ({
        key: pick.key,
        label: pick.label,
        marketValue: pick.marketValue,
        line: pick.line,
        score: pick.modelScore,
        odd: pick.odd,
        tier: pick.tier,
        grade: pick.grade,
        riskFlags: pick.riskFlags,
        source: "Casa" as const,
      })),
    ];

    const evaluated = rawPicks
      .map((pick) => {
        const family = dailyFamily(pick.marketValue);
        const danger = hasDangerFlag(pick.riskFlags);
        const isResultRisk = pick.marketValue === "ganador" || pick.marketValue.includes("minus") || pick.marketValue === "first_half_winner";
        const isAggressiveGoal = pick.marketValue === "btts" || pick.marketValue === "over_2_5" || pick.marketValue === "under_2_5";
        let realConfidence = pick.score;
        const reasons: string[] = [];

        if (danger) {
          realConfidence -= 24;
          reasons.push("Tiene alerta de trampa/value/freno: no forzar.");
        }
        if (matchProfile.type === "trampa") {
          realConfidence -= 14;
          reasons.push("Perfil trampa: bajar exposición.");
        }
        if (isSecondLegWithLead(eliminationContext)) {
          const lead = toNumber(eliminationContext.leadGoals);
          if (pick.marketValue === "over_2_5" || pick.marketValue === "btts") {
            realConfidence -= lead >= 2 ? 16 : 10;
            reasons.push("Vuelta con ventaja global: el equipo que va arriba puede enfriar el partido.");
          }
          if (pick.marketValue === "ganador" || pick.marketValue.includes("minus")) {
            realConfidence -= 10;
            reasons.push("Vuelta: evita ganador/handicap negativo si el global permite administrar.");
          }
          if (pick.marketValue.includes("plus") || pick.marketValue.includes("_o_empate")) {
            realConfidence += 4;
          }
        }
        if (matchProfile.type === "equilibrado" && isResultRisk) {
          realConfidence -= 10;
          reasons.push("Partido equilibrado: evitar ganador/handicap negativo como base.");
        }
        if (pick.marketValue === "ganador" && pick.score < 64) {
          realConfidence -= 18;
          reasons.push("Ganador directo bajo 64%: mejor doble oportunidad/handicap protegido.");
        }
        if (family === "corners" && pick.score < 88) {
          realConfidence -= 9;
          reasons.push("Corners requiere colchón alto; si está cerca de línea, no parlay fuerte.");
        }
        if (family === "cards" && pick.score < 82) {
          realConfidence -= 10;
          reasons.push("Tarjetas dependen de árbitro/contexto.");
        }
        if (pick.odd > 2.05) {
          realConfidence -= 8;
          reasons.push("Cuota alta: revisar por qué la casa paga tanto.");
        }
        if (pick.grade === "safe") realConfidence += 3;
        if (pick.grade === "risky") realConfidence -= 16;
        if (pick.riskFlags.some((flag) => flag.toLowerCase().includes("sin value"))) realConfidence -= 12;
        if (pick.riskFlags.some((flag) => flag.toLowerCase().includes("zona prohibida"))) realConfidence -= 35;

        realConfidence = clamp(realConfidence, 0, 99);

        const hardBlock =
          danger ||
          pick.grade === "risky" ||
          realConfidence < 62 ||
          (pick.marketValue === "ganador" && pick.score < 64) ||
          (family === "corners" && pick.riskFlags.some((flag) => flag.toLowerCase().includes("zona prohibida") || flag.toLowerCase().includes("trampa"))) ||
          (matchProfile.type === "trampa" && isResultRisk);

        const parlayAllowed =
          !hardBlock &&
          realConfidence >= 84 &&
          family !== "cards" &&
          pick.marketValue !== "ganador" &&
          !isAggressiveGoal &&
          !pick.marketValue.includes("minus");

        const simpleAllowed = !hardBlock && realConfidence >= 72;

        return { ...pick, family, realConfidence, reasons, hardBlock, parlayAllowed, simpleAllowed };
      })
      .sort((a, b) => b.realConfidence - a.realConfidence);

    const usedFamilies = new Set<string>();
    const proParlay = evaluated.filter((pick) => {
      if (!pick.parlayAllowed) return false;
      if (usedFamilies.has(pick.family)) return false;
      usedFamilies.add(pick.family);
      return true;
    }).slice(0, 2);

    const proSimples = evaluated
      .filter((pick) => pick.simpleAllowed && !proParlay.some((item) => item.key === pick.key))
      .slice(0, 4);

    const bloqueados = evaluated.filter((pick) => pick.hardBlock).slice(0, 5);
    const top = evaluated[0];

    let title = "⚠️ Esperar";
    let message = "No hay una ventaja suficientemente limpia. Mejor no forzar el partido.";
    let tone: "green" | "yellow" | "red" = "yellow";

    if (proParlay.length >= 2) {
      title = "🟢 Modo PRO activo";
      message = "Hay base para parlay corto. Máximo 2 selecciones y sin agregar mercados manuales.";
      tone = "green";
    } else if (proSimples.length >= 1) {
      title = "🟡 Mejor simple/controlado";
      message = "Hay lectura jugable, pero no suficientemente limpia para parlay fuerte.";
      tone = "yellow";
    }
    if (!top || (top.realConfidence < 62 && proSimples.length === 0)) {
      title = "🔴 No tocar";
      message = "La app no encuentra lectura rentable. El mejor movimiento es no apostar.";
      tone = "red";
    }

    return { title, message, tone, top, proParlay, proSimples, bloqueados };
  }, [results, housePicks, matchProfile, eliminationContext, hasMinimumData]);


  const finalReading = useMemo(() => {
    if (!hasMinimumData) return null;

    const localStats = projection.local;
    const visitStats = projection.visit;
    const oddLocalImp = impliedProb(toNumber(match.oddLocal));
    const oddDrawImp = impliedProb(toNumber(match.oddDraw));
    const oddVisitImp = impliedProb(toNumber(match.oddVisit));
    const totalImp = oddLocalImp + oddDrawImp + oddVisitImp;

    const marketLocal = totalImp > 0 ? (oddLocalImp / totalImp) * 100 : 0;
    const marketDraw = totalImp > 0 ? (oddDrawImp / totalImp) * 100 : 0;
    const marketVisit = totalImp > 0 ? (oddVisitImp / totalImp) * 100 : 0;

    const recentLocal = clamp(localStats.winPct * 0.55 + visitStats.noWinPct * 0.25 + localStats.noLosePct * 0.2, 0, 100);
    const recentVisit = clamp(visitStats.winPct * 0.55 + localStats.noWinPct * 0.25 + visitStats.noLosePct * 0.2, 0, 100);
    const recentDraw = clamp(average([localStats.drawPct, visitStats.drawPct]) || 24, 5, 55);

    const rawLocal = marketLocal ? marketLocal * 0.58 + recentLocal * 0.42 : recentLocal;
    const rawDraw = marketDraw ? marketDraw * 0.58 + recentDraw * 0.42 : recentDraw;
    const rawVisit = marketVisit ? marketVisit * 0.58 + recentVisit * 0.42 : recentVisit;
    const totalRaw = Math.max(rawLocal + rawDraw + rawVisit, 1);

    const pLocal = clamp((rawLocal / totalRaw) * 100, 1, 98);
    const pDraw = clamp((rawDraw / totalRaw) * 100, 1, 98);
    const pVisit = clamp((rawVisit / totalRaw) * 100, 1, 98);

    const winnerOptions = [
      { label: match.local || "Local", pct: pLocal, key: "1" },
      { label: "Empate", pct: pDraw, key: "X" },
      { label: match.visitante || "Visitante", pct: pVisit, key: "2" },
    ].sort((a, b) => b.pct - a.pct);

    const doubleChanceOptions = [
      { label: `${match.local || "Local"} o empate`, pct: clamp(pLocal + pDraw, 0, 99), key: "1X" },
      { label: `${match.visitante || "Visitante"} o empate`, pct: clamp(pVisit + pDraw, 0, 99), key: "X2" },
      { label: `${match.local || "Local"} o ${match.visitante || "Visitante"}`, pct: clamp(pLocal + pVisit, 0, 99), key: "12" },
    ].sort((a, b) => b.pct - a.pct);

    const lineReading = (group: MarketGroup, expected: number, overLine: string, underLine: string) => {
      const fallbackLine = group === "goals" ? "2.5" : group === "corners" ? "9.5" : "4.5";
      const over = overLine || fallbackLine;
      const under = underLine || fallbackLine;
      const scale = group === "goals" ? 2.1 : group === "corners" ? 5.2 : 3.4;
      const overPct = probabilityByLine(expected, toNumber(over), "over", scale);
      const underPct = probabilityByLine(expected, toNumber(under), "under", scale);
      const groupLabel = group === "goals" ? "goles" : group === "corners" ? "corners" : "tarjetas";
      const isOver = overPct >= underPct;
      return {
        label: `${isOver ? "Más" : "Menos"} de ${isOver ? over : under} ${groupLabel}`,
        pct: clamp(isOver ? overPct : underPct, 0, 99),
        expected,
        line: isOver ? over : under,
        direction: isOver ? "over" : "under",
      };
    };

    const adjustedGoalsExpected = isSecondLegWithLead(eliminationContext)
      ? clamp(projection.expectedGoals - (toNumber(eliminationContext.leadGoals) >= 2 ? 0.65 : 0.4), 0.2, 8)
      : projection.expectedGoals;
    const adjustedCornersExpected = isSecondLegWithLead(eliminationContext) && eliminationContext.pressureTeam !== "none"
      ? projection.expectedCorners + 0.35
      : projection.expectedCorners;
    const adjustedCardsExpected90 = isSecondLegWithLead(eliminationContext)
      ? adjustedCardsExpected + 0.65
      : adjustedCardsExpected;

    const goals = lineReading("goals", adjustedGoalsExpected, houseMarkets.goalsOverLine, houseMarkets.goalsUnderLine);
    const corners = lineReading("corners", adjustedCornersExpected, houseMarkets.cornersOverLine, houseMarkets.cornersUnderLine);
    const cards = lineReading("cards", adjustedCardsExpected90, houseMarkets.cardsOverLine, houseMarkets.cardsUnderLine);

    const warnings: string[] = [];
    const tightCorners = Math.min(
      Math.abs(projection.expectedCorners - toNumber(houseMarkets.cornersOverLine || "0")) || 99,
      Math.abs(projection.expectedCorners - toNumber(houseMarkets.cornersUnderLine || "0")) || 99
    );
    const tightGoals = Math.min(
      Math.abs(projection.expectedGoals - toNumber(houseMarkets.goalsOverLine || "0")) || 99,
      Math.abs(projection.expectedGoals - toNumber(houseMarkets.goalsUnderLine || "0")) || 99
    );
    const tightCards = Math.min(
      Math.abs(adjustedCardsExpected - toNumber(houseMarkets.cardsOverLine || "0")) || 99,
      Math.abs(adjustedCardsExpected - toNumber(houseMarkets.cardsUnderLine || "0")) || 99
    );

    if (tightCorners <= 1.5) warnings.push("Corners cerca de la línea: no lo uses como base fuerte de parlay.");
    if (tightGoals <= 0.35) warnings.push("Goles cerca de la línea: buscar línea más protegida.");
    if (tightCards <= 0.8) warnings.push("Tarjetas cerca de la línea: depende mucho del árbitro/contexto.");
    if (winnerOptions[0].pct < 48) warnings.push("1X2 parejo: mejor doble oportunidad o handicap positivo.");
    if (matchProfile.type === "trampa") warnings.push("Perfil trampa: evita combinar demasiados mercados del mismo partido.");
    if (isSecondLegWithLead(eliminationContext)) warnings.push(`Contexto de vuelta: ${getSideName(eliminationContext.advantageTeam, match)} llega con ventaja de ${eliminationContext.leadGoals}. Evita over agresivo y ganador directo; prioriza doble oportunidad/handicap/under amplio.`);
    if (refereeCardAdjustment.notes.length) warnings.push(refereeCardAdjustment.notes[0]);

    const message = warnings.length
      ? warnings.join(" ")
      : matchProfile.type === "abierto"
        ? "Lectura abierta: prioriza goles protegidos y evita unders agresivos."
        : matchProfile.type === "cerrado"
          ? "Lectura cerrada: prioriza líneas con colchón y doble oportunidad."
          : "Lectura equilibrada: mejor proteger con doble oportunidad/handicap y solo combinar líneas cómodas.";

    return {
      winner: winnerOptions[0],
      doubleChance: doubleChanceOptions[0],
      goals,
      corners,
      cards,
      message,
      profile: matchProfile.type,
    };
  }, [hasMinimumData, projection, match, houseMarkets, matchProfile, eliminationContext, adjustedCardsExpected, refereeCardAdjustment]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(BANKROLL_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as BankrollState;
      setBankroll({
        initialBank: saved.initialBank || "",
        bets: Array.isArray(saved.bets) ? saved.bets : [],
      });
    } catch {
      setBankroll(emptyBankroll());
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(BANKROLL_STORAGE_KEY, JSON.stringify(bankroll));
  }, [bankroll]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(DAILY_PICKS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as DailyPick[];
      setDailyPicks(Array.isArray(saved) ? saved : []);
    } catch {
      setDailyPicks([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(DAILY_PICKS_STORAGE_KEY, JSON.stringify(dailyPicks));
  }, [dailyPicks]);

  useEffect(() => {
    const saved = safeReadStorage();
    if (!saved) return;

    if (saved.match) {
      setMatch({
        local: saved.match.local || "",
        visitante: saved.match.visitante || "",
        oddLocal: saved.match.oddLocal || "",
        oddDraw: saved.match.oddDraw || "",
        oddVisit: saved.match.oddVisit || "",
        localColor1: saved.match.localColor1 || "#38bdf8",
        localColor2: saved.match.localColor2 || "#ffffff",
        visitColor1: saved.match.visitColor1 || "#ef4444",
        visitColor2: saved.match.visitColor2 || "#111827",
        backgroundMode: saved.match.backgroundMode || "team",
        backgroundImage: saved.match.backgroundImage || "",
      });
    }

    if (Array.isArray(saved.indicators)) {
      setIndicators(
        saved.indicators.map((item) => ({
          id: item.id || makeId(),
          team: (item.team as TeamSide) || "ambos",
          period: (item.period as IndicatorPeriod) || "full",
          market: getMarketValue(item.market || ""),
          line: item.line || "",
          record: item.record || "",
          houseOdd: item.houseOdd || "",
        }))
      );
    }

    const migrateRecent = (rows?: RecentRow[]) =>
      Array.isArray(rows)
        ? rows.map((row) => ({
            ...emptyRecentRow(),
            ...row,
            cornersFor: row.cornersFor || (row as unknown as { corners?: string }).corners || "",
            cardsFor: row.cardsFor || (row as unknown as { cards?: string }).cards || "",
            id: row.id || makeId(),
          }))
        : createRecentRows();

    setLocalRecent(migrateRecent(saved.localRecent));
    setVisitRecent(migrateRecent(saved.visitRecent));
    if (saved.houseMarkets) setHouseMarkets({ ...emptyHouseMarkets(), ...saved.houseMarkets });
    if (saved.eliminationContext) setEliminationContext({ ...emptyEliminationContext(), ...saved.eliminationContext });
    if (saved.refereeContext) setRefereeContext({ ...emptyRefereeContext(), ...saved.refereeContext });
    if (saved.dominanceContext) setDominanceContext({ ...emptyDominanceContext(), ...saved.dominanceContext });
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ match, indicators, localRecent, visitRecent, houseMarkets, eliminationContext, refereeContext, dominanceContext }));
  }, [match, indicators, localRecent, visitRecent, houseMarkets, eliminationContext, refereeContext, dominanceContext]);

  useEffect(() => {
    setIndicators((prev) =>
      prev.map((indicator) => {
        const autoOdd = findHouseOddForIndicator(indicator.market, indicator.line);
        if (!autoOdd || indicator.houseOdd) return indicator;
        return { ...indicator, houseOdd: autoOdd };
      })
    );
  }, [houseMarkets]);

  // Unifica Líneas reales de la casa con Dominador por etiqueta:
  // los mercados totales de goles/corners/tarjetas se llenan una sola vez y alimentan ambos motores.
  useEffect(() => {
    setDominanceContext((prev) => ({
      ...prev,
      goalsOverLine: houseMarkets.goalsOverLine,
      goalsOverOdd: houseMarkets.goalsOverOdd,
      goalsUnderLine: houseMarkets.goalsUnderLine,
      goalsUnderOdd: houseMarkets.goalsUnderOdd,
      cornersOverLine: houseMarkets.cornersOverLine,
      cornersOverOdd: houseMarkets.cornersOverOdd,
      cornersUnderLine: houseMarkets.cornersUnderLine,
      cornersUnderOdd: houseMarkets.cornersUnderOdd,
      cardsOverLine: houseMarkets.cardsOverLine,
      cardsOverOdd: houseMarkets.cardsOverOdd,
      cardsUnderLine: houseMarkets.cardsUnderLine,
      cardsUnderOdd: houseMarkets.cardsUnderOdd,
    }));
  }, [
    houseMarkets.goalsOverLine,
    houseMarkets.goalsOverOdd,
    houseMarkets.goalsUnderLine,
    houseMarkets.goalsUnderOdd,
    houseMarkets.cornersOverLine,
    houseMarkets.cornersOverOdd,
    houseMarkets.cornersUnderLine,
    houseMarkets.cornersUnderOdd,
    houseMarkets.cardsOverLine,
    houseMarkets.cardsOverOdd,
    houseMarkets.cardsUnderLine,
    houseMarkets.cardsUnderOdd,
  ]);

  useEffect(() => {
    setHouseMarkets((prev) => {
      let next = prev;

      indicators.forEach((indicator) => {
        const fields = getHouseFieldsForIndicator(indicator.market, indicator.line);
        const line = String(indicator.line || "").trim();
        const odd = String(indicator.houseOdd || "").trim();
        if (!fields || toNumber(odd) <= 1) return;
        if ("lineField" in fields) {
          if (!line) return;
          if (String(prev[fields.lineField] || "").trim() !== line) return;
        }
        if (String(prev[fields.oddField] || "").trim()) return;

        next = { ...next, [fields.oddField]: odd };
      });

      return next;
    });
  }, [indicators]);

  const clearAll = () => {
    if (!confirm("¿Seguro que quieres borrar todo el partido actual?")) return;
    if (typeof window !== "undefined") {
      // Borra cualquier guardado viejo/nuevo de esta app para que Limpiar sea total.
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("analizador_") || key === STORAGE_KEY || key === "simpleApp") {
          localStorage.removeItem(key);
        }
      });
    }
    setMatch({ local: "", visitante: "", oddLocal: "", oddDraw: "", oddVisit: "", localColor1: "#38bdf8", localColor2: "#ffffff", visitColor1: "#ef4444", visitColor2: "#111827", backgroundMode: "team", backgroundImage: "" });
    setIndicators([]);
    setLocalRecent(createRecentRows());
    setVisitRecent(createRecentRows());
    setHouseMarkets(emptyHouseMarkets());
    setEliminationContext(emptyEliminationContext());
    setRefereeContext(emptyRefereeContext());
    setDominanceContext(emptyDominanceContext());
  };

  const saveManual = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ match, indicators, localRecent, visitRecent, houseMarkets, eliminationContext, refereeContext, dominanceContext }));
    alert("✅ Partido guardado");
  };

  const exportMatch = () => {
    const fileName = `${match.local || "local"}_vs_${match.visitante || "visitante"}`
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .toLowerCase();
    const data: ExportShape = {
      version: 5,
      exportedAt: new Date().toISOString(),
      match,
      indicators,
      localRecent,
      visitRecent,
      houseMarkets,
      eliminationContext,
      refereeContext,
      dominanceContext,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const importMatch = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Partial<ExportShape>;
        if (!data.match || !Array.isArray(data.indicators)) throw new Error("Archivo inválido");

        setMatch({
          local: data.match.local || "",
          visitante: data.match.visitante || "",
          oddLocal: data.match.oddLocal || "",
          oddDraw: data.match.oddDraw || "",
          oddVisit: data.match.oddVisit || "",
          localColor1: data.match.localColor1 || "#38bdf8",
          localColor2: data.match.localColor2 || "#ffffff",
          visitColor1: data.match.visitColor1 || "#ef4444",
          visitColor2: data.match.visitColor2 || "#111827",
          backgroundMode: data.match.backgroundMode || "team",
          backgroundImage: data.match.backgroundImage || "",
        });

const importedIndicators: Indicator[] = Array.isArray(data.indicators)
  ? data.indicators.map((item: Partial<Indicator>) => ({
      id: item.id || makeId(),
      team: (item.team as TeamSide) || "ambos",
      period: (item.period as IndicatorPeriod) || "full",
      market: getMarketValue(item.market || ""),
      line: item.line || "",
      record: item.record || "",
      houseOdd: item.houseOdd || "",
    }))
  : [];

setIndicators(importedIndicators);
        setLocalRecent(Array.isArray(data.localRecent) ? data.localRecent.map((row) => ({ ...emptyRecentRow(), ...row, id: row.id || makeId() })) : createRecentRows());
        setVisitRecent(Array.isArray(data.visitRecent) ? data.visitRecent.map((row) => ({ ...emptyRecentRow(), ...row, id: row.id || makeId() })) : createRecentRows());
        setHouseMarkets({ ...emptyHouseMarkets(), ...(data.houseMarkets || {}) });
        setEliminationContext({ ...emptyEliminationContext(), ...(data.eliminationContext || {}) });
        setRefereeContext({ ...emptyRefereeContext(), ...(data.refereeContext || {}) });
        setDominanceContext({ ...emptyDominanceContext(), ...(data.dominanceContext || {}) });

        alert("📨 Partido importado");
      } catch {
        alert("❌ No pude importar ese archivo. Asegúrate de que sea un JSON exportado por la app.");
      }
    };
    reader.readAsText(file);
  };



  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none backdrop-blur placeholder:text-slate-300 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/30";
  const selectClass =
    "w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-3 text-white outline-none focus:border-sky-300";


  const renderDominancePair = (
    title: string,
    overLineField: keyof DominanceContext,
    overOddField: keyof DominanceContext,
    underLineField: keyof DominanceContext,
    underOddField: keyof DominanceContext,
    overLines: string[],
    underLines: string[]
  ) => (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <h3 className="mb-3 font-black">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs text-slate-400">Over</p>
          <select className={`${selectClass} mt-1`} value={String(dominanceContext[overLineField] || "")} onChange={(event) => setDominanceContext({ ...dominanceContext, [overLineField]: event.target.value })}>
            {overLines.map((line) => <option key={line} value={line}>+{line}</option>)}
          </select>
          <input className={`${inputClass} mt-2`} inputMode="decimal" placeholder="Cuota over" value={String(dominanceContext[overOddField] || "")} onChange={(event) => setDominanceContext({ ...dominanceContext, [overOddField]: event.target.value })} />
        </div>
        <div>
          <p className="text-xs text-slate-400">Under</p>
          <select className={`${selectClass} mt-1`} value={String(dominanceContext[underLineField] || "")} onChange={(event) => setDominanceContext({ ...dominanceContext, [underLineField]: event.target.value })}>
            {underLines.map((line) => <option key={line} value={line}>-{line}</option>)}
          </select>
          <input className={`${inputClass} mt-2`} inputMode="decimal" placeholder="Cuota under" value={String(dominanceContext[underOddField] || "")} onChange={(event) => setDominanceContext({ ...dominanceContext, [underOddField]: event.target.value })} />
        </div>
      </div>
    </div>
  );
  const SelectNumber = ({ value, max, onChange, placeholder }: { value: string; max: number; onChange: (value: string) => void; placeholder: string }) => (
    <select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {NUMBER_OPTIONS(max).map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );

  const LineSelect = ({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) => (
    <select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );

  const renderRecentBlock = (title: string, side: "local" | "visitante", rows: RecentRow[]) => (
    <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">{title}</h3>
          <p className="text-xs text-slate-300">Selects rápidos. Resultado G/E/P se calcula solo con GF y GC.</p>
        </div>
        <button
          onClick={() => addRecentRow(side)}
          className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/15"
        >
          + Partido
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => {
          const result = getAutoResult(row);
          return (
            <div key={row.id} className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 sm:grid-cols-7">
              <SelectNumber value={row.goalsFor} max={9} placeholder={`P${index + 1} GF`} onChange={(value) => updateRecent(side, row.id, "goalsFor", value)} />
              <SelectNumber value={row.goalsAgainst} max={9} placeholder="GC" onChange={(value) => updateRecent(side, row.id, "goalsAgainst", value)} />
              <SelectNumber value={row.cornersFor} max={20} placeholder="CF" onChange={(value) => updateRecent(side, row.id, "cornersFor", value)} />
              <SelectNumber value={row.cornersAgainst} max={20} placeholder="CC" onChange={(value) => updateRecent(side, row.id, "cornersAgainst", value)} />
              <SelectNumber value={row.cardsFor} max={10} placeholder="TF" onChange={(value) => updateRecent(side, row.id, "cardsFor", value)} />
              <SelectNumber value={row.cardsAgainst} max={10} placeholder="TC" onChange={(value) => updateRecent(side, row.id, "cardsAgainst", value)} />
              <div className="flex items-center justify-center rounded-xl border border-white/10 bg-slate-900/80 px-3 py-3 font-black text-white">
                {result || "—"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
        <span className="rounded-xl bg-white/5 px-3 py-2">GF/GC = goles a favor/en contra</span>
        <span className="rounded-xl bg-white/5 px-3 py-2">CF/CC = corners a favor/en contra</span>
        <span className="rounded-xl bg-white/5 px-3 py-2">TF/TC = tarjetas propias/rival</span>
      </div>
    
      {(() => {
        const stats = buildRecentStats(rows);
        const rb = resultBreakdown(rows);
        return stats.count > 0 ? (
          <div className="mt-4 rounded-2xl border border-sky-300/20 bg-sky-400/10 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="font-black text-sky-100">📌 Resumen de {stats.count} partidos</h4>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-100">{rb.wins}G · {rb.draws}E · {rb.losses}P</span>
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-xl bg-slate-950/45 p-3"><p className="text-slate-400">Goles prom.</p><b>{stats.goalsForAvg.toFixed(1)} GF / {stats.goalsAgainstAvg.toFixed(1)} GC</b></div>
              <div className="rounded-xl bg-slate-950/45 p-3"><p className="text-slate-400">Corners prom.</p><b>{stats.cornersForAvg.toFixed(1)} CF / {stats.cornersAgainstAvg.toFixed(1)} CC</b></div>
              <div className="rounded-xl bg-slate-950/45 p-3"><p className="text-slate-400">Tarjetas prom.</p><b>{stats.cardsForAvg.toFixed(1)} TF / {stats.cardsAgainstAvg.toFixed(1)} TC</b></div>
            </div>
          </div>
        ) : null;
      })()}
    </div>
  );

  const getHouseRangeStatus = (groupLabel: string, overLine: string, underLine: string) => {
    const over = toNumber(overLine);
    const under = toNumber(underLine);
    if (!over || !under) return null;
    const gap = Math.abs(under - over);
    const isCorners = groupLabel.toLowerCase().includes("corner");
    const isGoals = groupLabel.toLowerCase().includes("gol");
    const tight = isCorners ? gap <= 3 : isGoals ? gap <= 1 : gap <= 1;
    const comfy = isCorners ? gap >= 5 : isGoals ? gap >= 2 : gap >= 2;
    if (tight) return { tone: "tight", text: `⚠️ Línea justa: la casa está encerrando el mercado entre ${overLine} y ${underLine}. Mejor no usar fuerte en parlay.` };
    if (comfy) return { tone: "comfort", text: `🟢 Rango cómodo: hay más separación entre over/under (${overLine} ↔ ${underLine}).` };
    return { tone: "neutral", text: `🟡 Rango medio: revisar value y registros antes de combinar.` };
  };

  const updateHouse = (field: keyof HouseMarket, value: string) => {
    setHouseMarkets((prev) => ({ ...prev, [field]: value }));
  };

  const renderHouseMarket = (
    title: string,
    overLineField: keyof HouseMarket,
    overOddField: keyof HouseMarket,
    underLineField: keyof HouseMarket,
    underOddField: keyof HouseMarket,
    overOptions: string[],
    underOptions: string[]
  ) => (
    <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
      <h3 className="mb-3 text-lg font-black">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-100">Over casa</p>
          <div className="grid grid-cols-2 gap-2">
            <LineSelect value={String(houseMarkets[overLineField])} options={overOptions} onChange={(value) => updateHouse(overLineField, value)} />
            <input className={selectClass} inputMode="decimal" placeholder="Cuota" value={String(houseMarkets[overOddField])} onChange={(event) => updateHouse(overOddField, event.target.value)} />
          </div>
        </div>
        <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-rose-100">Under casa</p>
          <div className="grid grid-cols-2 gap-2">
            <LineSelect value={String(houseMarkets[underLineField])} options={underOptions} onChange={(value) => updateHouse(underLineField, value)} />
            <input className={selectClass} inputMode="decimal" placeholder="Cuota" value={String(houseMarkets[underOddField])} onChange={(event) => updateHouse(underOddField, event.target.value)} />
          </div>
        </div>
      </div>
      {(() => {
        const status = getHouseRangeStatus(title, String(houseMarkets[overLineField]), String(houseMarkets[underLineField]));
        return status ? (
          <div className={`mt-3 rounded-2xl border px-3 py-2 text-xs font-bold ${status.tone === "tight" ? "border-amber-300/30 bg-amber-400/10 text-amber-100" : status.tone === "comfort" ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : "border-sky-300/30 bg-sky-400/10 text-sky-100"}`}>
            {status.text}
          </div>
        ) : null;
      })()}
    </div>
  );


  const renderResultHouseMarket = () => (
    <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
      <h3 className="mb-3 text-lg font-black">🛡️ Resultado protegido</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-100">Local o empate 1X</p>
          <input className={selectClass} inputMode="decimal" placeholder="Cuota" value={houseMarkets.dcLocalDrawOdd} onChange={(event) => updateHouse("dcLocalDrawOdd", event.target.value)} />
        </div>
        <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-100">Empate o visitante X2</p>
          <input className={selectClass} inputMode="decimal" placeholder="Cuota" value={houseMarkets.dcDrawVisitOdd} onChange={(event) => updateHouse("dcDrawVisitOdd", event.target.value)} />
        </div>
        <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-100">Local o visitante 12</p>
          <input className={selectClass} inputMode="decimal" placeholder="Cuota" value={houseMarkets.dcLocalVisitOdd} onChange={(event) => updateHouse("dcLocalVisitOdd", event.target.value)} />
        </div>
      </div>
      <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">Estas cuotas alimentan picks de doble oportunidad y evitan depender solo de las cuotas 1X2.</p>
    </div>
  );

  const renderHandicapHouseMarket = () => (
    <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
      <h3 className="mb-3 text-lg font-black">🧱 Handicap casa</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-violet-300/20 bg-violet-400/10 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-100">Handicap local</p>
          <div className="grid grid-cols-2 gap-2">
            <LineSelect value={houseMarkets.handicapLocalLine} options={HANDICAP_LINES} onChange={(value) => updateHouse("handicapLocalLine", value)} />
            <input className={selectClass} inputMode="decimal" placeholder="Cuota" value={houseMarkets.handicapLocalOdd} onChange={(event) => updateHouse("handicapLocalOdd", event.target.value)} />
          </div>
        </div>
        <div className="rounded-2xl border border-violet-300/20 bg-violet-400/10 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-100">Handicap visitante</p>
          <div className="grid grid-cols-2 gap-2">
            <LineSelect value={houseMarkets.handicapVisitLine} options={HANDICAP_LINES} onChange={(value) => updateHouse("handicapVisitLine", value)} />
            <input className={selectClass} inputMode="decimal" placeholder="Cuota" value={houseMarkets.handicapVisitOdd} onChange={(event) => updateHouse("handicapVisitOdd", event.target.value)} />
          </div>
        </div>
      </div>
      <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">Puedes escoger desde +0.5 hasta +3.5 y desde -0.5 hasta -3.5. El motor toma esa línea y su cuota para value/probabilidad.</p>
    </div>
  );


  const teamBackground = `
    radial-gradient(circle at 15% 8%, ${match.localColor1}88, transparent 34%),
    radial-gradient(circle at 85% 10%, ${match.visitColor1}88, transparent 32%),
    radial-gradient(circle at 50% 95%, ${match.localColor2}30, transparent 28%),
    #070b12
  `;

  const neonBackground = `
    radial-gradient(circle at 20% 10%, ${match.localColor1}aa, transparent 28%),
    radial-gradient(circle at 80% 5%, ${match.visitColor1}aa, transparent 30%),
    radial-gradient(circle at 50% 70%, #a855f744, transparent 35%),
    #020617
  `;

  const baseBackground =
    match.backgroundMode === "dark"
      ? "#070b12"
      : match.backgroundMode === "neon"
        ? neonBackground
        : teamBackground;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b12] text-white">
      <div className="pointer-events-none fixed inset-0 z-0" style={{ background: baseBackground }} />
      {match.backgroundImage.trim() ? (
        <div
          className="pointer-events-none fixed inset-0 z-[1] bg-cover bg-center opacity-45"
          style={{ backgroundImage: `url(${match.backgroundImage.trim()})` }}
        />
      ) : null}
      {match.backgroundMode === "stadium" && !match.backgroundImage.trim() ? (
        <div
          className="pointer-events-none fixed inset-0 z-[1] bg-cover bg-center opacity-35"
          style={{ backgroundImage: `url(${BACKGROUND_PRESETS[0].value})` }}
        />
      ) : null}
      <div className="pointer-events-none fixed inset-0 z-[2] bg-[linear-gradient(to_bottom,rgba(2,6,23,.15),rgba(2,6,23,.88)),radial-gradient(circle_at_50%_0%,rgba(255,255,255,.12),transparent_30%)] backdrop-blur-[1px]" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 pb-24">
        <header className="mb-6">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">🔥ANALIZADOR RAPIDO H2H KAL🔥</h1>
          <p className="mt-1 text-sm text-slate-300">Rachas + registros reales + líneas de la casa + árbitro + detector anti-casa</p>
        </header>

        <section className="mb-5 overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-gradient-to-br from-emerald-400/15 via-slate-900/75 to-sky-500/15 p-1 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="rounded-[1.8rem] bg-slate-950/50 p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-200/80">Control real de dinero</p>
                <h2 className="mt-1 text-3xl font-black">💼 Bankroll tracker</h2>
                <p className="mt-1 text-sm text-slate-300">Este bloque NO se borra con Limpiar. Solo con Reset bankroll.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={exportBankroll} className="rounded-2xl bg-emerald-400 px-4 py-3 font-black text-emerald-950">🗃️ Exportar bank</button>
                <button onClick={() => bankrollImportRef.current?.click()} className="rounded-2xl bg-sky-400 px-4 py-3 font-black text-sky-950">📨 Importar bank</button>
                <button onClick={resetBankroll} className="rounded-2xl bg-rose-500 px-4 py-3 font-black text-white">🧨 Reset bankroll</button>
                <input ref={bankrollImportRef} type="file" accept="application/json" className="hidden" onChange={(event) => importBankroll(event.target.files?.[0] || null)} />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-5">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs text-slate-400">Bank inicial</p>
                <input className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xl font-black text-white outline-none" inputMode="decimal" placeholder="0.00" value={bankroll.initialBank} onChange={(event) => setBankroll((prev) => ({ ...prev, initialBank: event.target.value }))} />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs text-slate-400">Bank actual</p>
                <p className="mt-2 text-3xl font-black text-emerald-100">{formatMoney(bankrollStats.currentBank)}</p>
              </div>
              <div className={`rounded-2xl border border-white/10 bg-white/10 p-4 ${bankrollStats.profit >= 0 ? "text-emerald-100" : "text-rose-100"}`}>
                <p className="text-xs text-slate-400">Ganancia / pérdida</p>
                <p className="mt-2 text-3xl font-black">{bankrollStats.profit >= 0 ? "+" : ""}{formatMoney(bankrollStats.profit)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs text-slate-400">ROI</p>
                <p className="mt-2 text-3xl font-black text-sky-100">{bankrollStats.roi.toFixed(1)}%</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs text-slate-400">Acierto</p>
                <p className="mt-2 text-3xl font-black text-violet-100">{bankrollStats.winrate.toFixed(1)}%</p>
                <p className="text-xs text-slate-400">{bankrollStats.wins}G / {bankrollStats.losses}P · Pend: {bankrollStats.pending}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 lg:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xl font-black">📈 Curva del bank</h3>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">Stake total: {formatMoney(bankrollStats.totalStake)}</span>
                </div>
                <svg viewBox="0 0 600 180" className="h-48 w-full overflow-visible rounded-2xl bg-white/5 p-3">
                  <defs>
                    <linearGradient id="bankLine" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#38bdf8" />
                    </linearGradient>
                  </defs>
                  {(() => {
                    const points = bankrollStats.equityPoints.length >= 2 ? bankrollStats.equityPoints : [bankrollStats.initialBank || 0, bankrollStats.currentBank || 0];
                    const min = Math.min(...points, bankrollStats.initialBank || 0);
                    const max = Math.max(...points, bankrollStats.initialBank || 0, min + 1);
                    const coords = points.map((value, index) => {
                      const x = points.length === 1 ? 20 : 20 + (index * 560) / (points.length - 1);
                      const y = 150 - ((value - min) / Math.max(1, max - min)) * 120;
                      return `${x},${y}`;
                    }).join(" ");
                    return <polyline points={coords} fill="none" stroke="url(#bankLine)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />;
                  })()}
                  <line x1="20" y1="150" x2="580" y2="150" stroke="rgba(255,255,255,.15)" strokeWidth="2" />
                </svg>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                <h3 className="text-xl font-black">🧠 App vs Manual</h3>
                <div className="mt-4 space-y-4">
                  {bankrollStats.sourceStats.map((item) => (
                    <div key={item.source}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-bold">{item.source === "app" ? "🤖 Picks app" : "🧍 Picks manuales"}</span>
                        <span className={item.profit >= 0 ? "text-emerald-200" : "text-rose-200"}>{item.profit >= 0 ? "+" : ""}{formatMoney(item.profit)} · ROI {item.roi.toFixed(1)}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full ${item.profit >= 0 ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: `${clamp(Math.abs(item.roi), 4, 100)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{item.total} apuestas · {item.wins} ganadas</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-white/10 bg-slate-950/45 p-4">
              <h3 className="text-xl font-black">📜 Historial rápido</h3>
              <div className="mt-3 space-y-2">
                {bankroll.bets.length === 0 ? <p className="text-sm text-slate-300">Sin apuestas registradas todavía.</p> : null}
                {bankroll.bets.slice(0, 8).map((bet) => {
                  const profit = betProfit(bet);
                  return (
                    <div key={bet.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 lg:grid-cols-[1fr_auto]">
                      <div>
                        <p className="text-xs text-slate-400">{bet.date} · {bet.source === "app" ? "🤖 App" : "🧍 Manual"} · {bet.market || "Sin mercado"}</p>
                        <p className="font-black">{bet.matchName}</p>
                        <p className="text-sm text-slate-300">{bet.pick} · Stake {bet.stake} · Cuota {bet.odd}</p>
                        {bet.notes ? <p className="mt-1 text-xs text-slate-400">Nota: {bet.notes}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span className={`rounded-xl px-3 py-2 text-sm font-black ${bet.status === "won" ? "bg-emerald-400/20 text-emerald-100" : bet.status === "lost" ? "bg-rose-400/20 text-rose-100" : bet.status === "void" ? "bg-slate-400/20 text-slate-100" : "bg-amber-400/20 text-amber-100"}`}>{bet.status === "won" ? `+${formatMoney(profit)}` : bet.status === "lost" ? formatMoney(profit) : bet.status === "void" ? "Nula" : "Pendiente"}</span>
                        <button onClick={() => updateBankBetStatus(bet.id, "won")} className="rounded-lg bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-100">✅</button>
                        <button onClick={() => updateBankBetStatus(bet.id, "lost")} className="rounded-lg bg-rose-500/20 px-2 py-1 text-xs font-bold text-rose-100">❌</button>
                        <button onClick={() => updateBankBetStatus(bet.id, "void")} className="rounded-lg bg-slate-500/20 px-2 py-1 text-xs font-bold text-slate-100">↩️</button>
                        <button onClick={() => deleteBankBet(bet.id)} className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-white">🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-5 rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-4 flex flex-wrap gap-3">
            <button onClick={saveManual} className="rounded-2xl bg-emerald-500 px-4 py-3 font-bold text-emerald-950 shadow-lg shadow-emerald-500/20">💾 Guardar</button>
            <button onClick={clearAll} className="rounded-2xl bg-rose-500 px-4 py-3 font-bold text-white shadow-lg shadow-rose-500/20">🧹 Limpiar</button>
            <button onClick={() => importRef.current?.click()} className="rounded-2xl bg-sky-400 px-4 py-3 font-bold text-sky-950 shadow-lg shadow-sky-400/20">📨 Importar</button>
            <button onClick={exportMatch} className="rounded-2xl bg-violet-400 px-4 py-3 font-bold text-violet-950 shadow-lg shadow-violet-400/20">🗃️ Exportar</button>
            <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(event) => importMatch(event.target.files?.[0] || null)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input className={inputClass} placeholder="🛡️ Local" value={match.local} onChange={(event) => setMatch({ ...match, local: event.target.value })} />
            <input className={inputClass} placeholder="🚌 Visitante" value={match.visitante} onChange={(event) => setMatch({ ...match, visitante: event.target.value })} />
            <input className={inputClass} inputMode="decimal" placeholder="💰 Cuota Local🏡" value={match.oddLocal} onChange={(event) => setMatch({ ...match, oddLocal: event.target.value })} />
            <input className={inputClass} inputMode="decimal" placeholder="💰 Empate⚔️" value ={match.oddDraw} onChange={(event) => setMatch({ ...match, oddDraw: event.target.value })} />
            <input className={inputClass} inputMode="decimal" placeholder="💰 Cuota Visitante🛩️" value={match.oddVisit} onChange={(event) => setMatch({ ...match, oddVisit: event.target.value })} />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="mb-3 text-sm font-black text-slate-100">🎨 Colores visuales para banner/escudos</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="rounded-xl bg-white/5 p-3 text-xs text-slate-300">Color 1 local
                <input type="color" className="mt-2 h-10 w-full cursor-pointer rounded-lg bg-transparent" value={match.localColor1} onChange={(event) => setMatch({ ...match, localColor1: event.target.value })} />
              </label>
              <label className="rounded-xl bg-white/5 p-3 text-xs text-slate-300">Color 2 local
                <input type="color" className="mt-2 h-10 w-full cursor-pointer rounded-lg bg-transparent" value={match.localColor2} onChange={(event) => setMatch({ ...match, localColor2: event.target.value })} />
              </label>
              <label className="rounded-xl bg-white/5 p-3 text-xs text-slate-300">Color 1 visitante
                <input type="color" className="mt-2 h-10 w-full cursor-pointer rounded-lg bg-transparent" value={match.visitColor1} onChange={(event) => setMatch({ ...match, visitColor1: event.target.value })} />
              </label>
              <label className="rounded-xl bg-white/5 p-3 text-xs text-slate-300">Color 2 visitante
                <input type="color" className="mt-2 h-10 w-full cursor-pointer rounded-lg bg-transparent" value={match.visitColor2} onChange={(event) => setMatch({ ...match, visitColor2: event.target.value })} />
              </label>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 lg:col-span-1">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-300">Fondo visual</p>
                <select
                  className={selectClass}
                  value={match.backgroundMode}
                  onChange={(event) => setMatch({ ...match, backgroundMode: event.target.value as BackgroundMode })}
                >
                  <option value="team">Gradiente por equipos</option>
                  <option value="stadium">Estadio + colores</option>
                  <option value="neon">Neón deportivo</option>
                  <option value="dark">Oscuro limpio</option>
                </select>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 lg:col-span-2">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-300">Imagen de fondo opcional</p>
                <input
                  className={inputClass}
                  placeholder="Pega URL de imagen o usa un preset"
                  value={match.backgroundImage}
                  onChange={(event) => setMatch({ ...match, backgroundImage: event.target.value })}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {BACKGROUND_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setMatch({ ...match, backgroundMode: "stadium", backgroundImage: preset.value })}
                      className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-slate-100 hover:bg-white/15"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMatch({ ...match, backgroundImage: "" })}
                    className="rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1 text-xs font-bold text-rose-100 hover:bg-rose-400/20"
                  >
                    Quitar imagen
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-300">Presets rápidos de colores</p>
              <div className="flex flex-wrap gap-2">
                {TEAM_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setMatch({
                        ...match,
                        localColor1: preset.local1,
                        localColor2: preset.local2,
                        visitColor1: preset.visit1,
                        visitColor2: preset.visit2,
                        backgroundMode: "team",
                      })
                    }
                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white shadow-lg shadow-black/20"
                    style={{ background: `linear-gradient(135deg, ${preset.local1}, ${preset.visit1})` }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

    <section className="mb-5 rounded-3xl border border-amber-300/25 bg-gradient-to-br from-amber-400/10 via-slate-900/45 to-violet-500/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-200/80">Contexto especial</p>
              <h2 className="text-2xl font-black">🏆 Eliminatoria ida/vuelta</h2>
              <p className="text-xs text-slate-300">Todo es con selects. Si es partido de vuelta, el motor baja overs agresivos y protege doble oportunidad/handicap.</p>
            </div>
            {isSecondLegWithLead(eliminationContext) ? (
              <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm font-black text-amber-100">
                ⚠️ Ventaja global: {getSideName(eliminationContext.advantageTeam, match)} +{eliminationContext.leadGoals}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <label className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs font-bold text-slate-300">
              ¿Es eliminatoria?
              <select
                className={`${selectClass} mt-2`}
                value={eliminationContext.enabled ? "yes" : "no"}
                onChange={(event) => {
                  const enabled = event.target.value === "yes";
                  setEliminationContext(enabled ? { ...eliminationContext, enabled, leg: eliminationContext.leg === "none" ? "second" : eliminationContext.leg } : emptyEliminationContext());
                }}
              >
                <option value="no">No</option>
                <option value="yes">Sí</option>
              </select>
            </label>

            <label className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs font-bold text-slate-300">
              Partido
              <select
                className={`${selectClass} mt-2`}
                value={eliminationContext.leg}
                disabled={!eliminationContext.enabled}
                onChange={(event) => setEliminationContext({ ...eliminationContext, leg: event.target.value as EliminationLeg })}
              >
                <option value="none">Normal</option>
                <option value="first">Ida</option>
                <option value="second">Vuelta</option>
              </select>
            </label>

            <label className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs font-bold text-slate-300">
              Equipo con ventaja
              <select
                className={`${selectClass} mt-2`}
                value={eliminationContext.advantageTeam}
                disabled={!eliminationContext.enabled || eliminationContext.leg !== "second"}
                onChange={(event) => setEliminationContext({ ...eliminationContext, advantageTeam: event.target.value as EliminationSide })}
              >
                <option value="none">Ninguno / Empate global</option>
                <option value="local">{match.local || "Local"}</option>
                <option value="visitante">{match.visitante || "Visitante"}</option>
              </select>
            </label>

            <label className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs font-bold text-slate-300">
              Ventaja global
              <select
                className={`${selectClass} mt-2`}
                value={eliminationContext.leadGoals}
                disabled={!eliminationContext.enabled || eliminationContext.leg !== "second"}
                onChange={(event) => setEliminationContext({ ...eliminationContext, leadGoals: event.target.value })}
              >
                {LEAD_GOAL_OPTIONS.map((option) => <option key={option} value={option}>{option} gol{option === "1" ? "" : "es"}</option>)}
              </select>
            </label>

            <label className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs font-bold text-slate-300">
              Obligado a remontar
              <select
                className={`${selectClass} mt-2`}
                value={eliminationContext.pressureTeam}
                disabled={!eliminationContext.enabled || eliminationContext.leg !== "second"}
                onChange={(event) => setEliminationContext({ ...eliminationContext, pressureTeam: event.target.value as EliminationSide })}
              >
                <option value="none">Ninguno</option>
                <option value="local">{match.local || "Local"}</option>
                <option value="visitante">{match.visitante || "Visitante"}</option>
              </select>
            </label>
          </div>

          {eliminationContext.enabled ? (
            <div className="mt-4 rounded-2xl border border-amber-200/20 bg-slate-950/45 p-4 text-sm text-amber-50">
              {eliminationContext.leg === "second" ? (
                <p>
                  🧠 Modo vuelta activo: si hay ventaja global, la app castiga over 2.5/BTTS, baja ganador directo y favorece doble oportunidad, handicap positivo, under amplio y tarjetas por presión.
                </p>
              ) : (
                <p>🧠 Modo ida: el motor no castiga fuerte, pero marca el partido como contexto especial para no sobreexponer parlays grandes.</p>
              )}
            </div>
          ) : null}
        </section>

    <section className="mb-5 rounded-3xl border border-rose-300/25 bg-gradient-to-br from-rose-400/10 via-slate-900/45 to-orange-500/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-200/80">Factor disciplinario</p>
              <h2 className="text-2xl font-black">👨‍⚖️ Árbitro del partido</h2>
              <p className="text-xs text-slate-300">Opcional. Si lo llenas, el motor ajusta tarjetas sin romper la lectura principal.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm font-black text-rose-50">
              Tarjetas ajustadas: {adjustedCardsExpected ? adjustedCardsExpected.toFixed(1) : "—"}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs font-bold text-slate-300">
              Prom. amarillas
              <select className={`${selectClass} mt-2`} value={refereeContext.yellowAvg} onChange={(event) => setRefereeContext({ ...refereeContext, yellowAvg: event.target.value })}>
                <option value="">Sin dato</option>
                {AVG_YELLOW_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs font-bold text-slate-300">
              Prom. rojas
              <select className={`${selectClass} mt-2`} value={refereeContext.redAvg} onChange={(event) => setRefereeContext({ ...refereeContext, redAvg: event.target.value })}>
                <option value="">Sin dato</option>
                {AVG_RED_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs font-bold text-slate-300">
              Rigor manual
              <select className={`${selectClass} mt-2`} value={refereeContext.strictness} onChange={(event) => setRefereeContext({ ...refereeContext, strictness: event.target.value as RefereeStrictness })}>
                {REFEREE_STRICTNESS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          {refereeCardAdjustment.notes.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-rose-200/20 bg-slate-950/45 p-3 text-sm text-rose-50">
              {refereeCardAdjustment.notes.map((note) => <p key={note}>• {note}</p>)}
            </div>
          ) : null}
        </section>

    <section className="mb-5 rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-4">
            <h2 className="text-2xl font-bold">🧪 Últimos registros</h2>
            <p className="text-xs text-slate-300">Ahora los corners y tarjetas se llenan a favor/en contra. Eso frena unders engañosos.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {renderRecentBlock(`Registro Local🏡 · ${match.local || "Local"}`, "local", localRecent)}
            {renderRecentBlock(`Registro Visitante🛩️ · ${match.visitante || "Visitante"}`, "visitante", visitRecent)}
          </div>
        </section>

     <section className="mb-5 rounded-3xl border border-cyan-300/30 bg-cyan-400/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <h2 className="text-2xl font-bold">🧭 Detector de partido</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            <div className="rounded-2xl bg-slate-950/45 p-3"><p className="text-xs text-slate-400">Tipo</p><p className="text-lg font-black">{matchProfile.type === "abierto" ? "🔥 Abierto" : matchProfile.type === "cerrado" ? "🧊 Cerrado" : matchProfile.type === "trampa" ? "⚠️ Trampa" : "⚖️ Equilibrado"}</p></div>
            <div className="rounded-2xl bg-slate-950/45 p-3"><p className="text-xs text-slate-400">Prom. goles</p><p className="text-lg font-black">{matchProfile.avgGoals ? matchProfile.avgGoals.toFixed(2) : "—"}</p></div>
            <div className="rounded-2xl bg-slate-950/45 p-3"><p className="text-xs text-slate-400">Corners esperados</p><p className="text-lg font-black">{projection.expectedCorners ? projection.expectedCorners.toFixed(1) : "—"}</p></div>
            <div className="rounded-2xl bg-slate-950/45 p-3"><p className="text-xs text-slate-400">Tarjetas esperadas</p><p className="text-lg font-black">{adjustedCardsExpected ? adjustedCardsExpected.toFixed(1) : "—"}</p></div>
            <div className="rounded-2xl bg-slate-950/45 p-3"><p className="text-xs text-slate-400">Bloqueo under</p><p className="text-lg font-black">{matchProfile.blockUnderGoals || matchProfile.blockUnderCorners ? "Activo" : "No"}</p></div>
          </div>
          {matchProfile.notes.length > 0 ? (
            <div className="mt-3 rounded-2xl bg-slate-950/45 p-3 text-sm text-cyan-50">
              {matchProfile.notes.map((note) => <p key={note}>• {note}</p>)}
            </div>
          ) : null}
        </section>

    
    <section className="mb-5 rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">Indicadores SofaScore🧾</h2>
              <p className="text-xs text-slate-300">Carga 3 a 6 señales fuertes. Evita llenar mercados débiles.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/35 p-2">
              <select className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-3 text-white outline-none focus:border-sky-300" value={indicatorBulkCount} onChange={(event) => setIndicatorBulkCount(event.target.value)}>
                {INDICATOR_BULK_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <button onClick={addMultipleIndicators} className="rounded-2xl bg-gradient-to-r from-sky-300 to-blue-500 px-4 py-3 font-bold text-slate-950 shadow-lg shadow-sky-500/20">+ Agregar indicadores</button>
            </div>
          </div>

          <div className="space-y-3">
            {indicators.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-slate-300">
                Ejemplo: Ambos marcan 5/5, Más de 2.5 goles 8/10, Menos de 10.5 corners 6/7. Si ya llenaste Dominador + líneas reales, la cuota se carga sola al elegir el mismo mercado y línea.
              </div>
            ) : null}

            {indicators.map((indicator) => {
              const marketValue = getMarketValue(indicator.market);
              const showLine = shouldShowIndicatorLine(marketValue);
              const showOdd = shouldShowIndicatorOdd(marketValue);
              const recordParts = splitRecordValue(indicator.record);
              const cardTone = isStreakIndicatorMarket(marketValue) ? "border-emerald-300/20 bg-emerald-500/10" : "border-sky-300/20 bg-sky-500/10";

              return (
                <div key={indicator.id} className={`rounded-2xl border ${cardTone} p-3 shadow-lg`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-300">
                    <span className="rounded-full bg-white/10 px-3 py-1">{isStreakIndicatorMarket(marketValue) ? "📌 Racha rápida" : "💰 Mercado apostable"}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">{getPeriodLabel(indicator.period)}</span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-12">
                    <select value={indicator.team} onChange={(event) => updateIndicator(indicator.id, "team", event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-3 text-white outline-none focus:border-sky-300 sm:col-span-2">
                      {TEAM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <select value={indicator.period || "full"} onChange={(event) => updateIndicator(indicator.id, "period", event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-3 text-white outline-none focus:border-sky-300 sm:col-span-2">
                      {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <select
                      value={marketValue}
                      onChange={(event) => updateIndicatorMarket(indicator.id, event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-3 text-white outline-none focus:border-sky-300 sm:col-span-3"
                    >
                      <option value="">Seleccionar mercado</option>
                      <optgroup label="📌 Rachas sin línea/cuota">
                        {MARKET_OPTIONS.filter((option) => option.kind === "streak").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </optgroup>
                      <optgroup label="💰 Mercados con línea/cuota">
                        {MARKET_OPTIONS.filter((option) => option.kind === "bet").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </optgroup>
                    </select>

                    {showLine ? (
                      <input className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-3 text-white outline-none focus:border-sky-300 sm:col-span-1" placeholder="Línea" value={indicator.line} onChange={(event) => updateIndicator(indicator.id, "line", event.target.value)} />
                    ) : null}

                    <div className={`${showLine ? "sm:col-span-2" : "sm:col-span-3"} grid grid-cols-2 gap-2`}>
                      <select
                        value={recordParts.hits}
                        onChange={(event) => updateIndicator(indicator.id, "record", joinRecordValue(event.target.value, recordParts.total))}
                        className={selectClass}
                      >
                        <option value="">Veces</option>
                        {RECORD_NUMBER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <select
                        value={recordParts.total}
                        onChange={(event) => updateIndicator(indicator.id, "record", joinRecordValue(recordParts.hits, event.target.value))}
                        className={selectClass}
                      >
                        <option value="">De</option>
                        {RECORD_NUMBER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </div>

                    {showOdd ? (
                      <input className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-3 text-white outline-none focus:border-sky-300 sm:col-span-2" inputMode="decimal" placeholder="Cuota casa" value={indicator.houseOdd} onChange={(event) => updateIndicator(indicator.id, "houseOdd", event.target.value)} />
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-300">
                    <span>{getTeamLabel(indicator.team, match)} · {getPeriodLabel(indicator.period)} · {getMarketLabel(indicator.market)}{indicator.line ? ` · ${indicator.line}` : ""}{indicator.record ? ` · ${indicator.record}` : ""}</span>
                    <button onClick={() => removeIndicator(indicator.id)} className="rounded-xl bg-rose-500 px-4 py-2 font-bold text-white">✖</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-5 rounded-3xl border border-cyan-300/20 bg-cyan-400/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-200/80">Motor de presión real + casa</p>
              <h2 className="text-2xl font-black">🏷️ Dominador + líneas reales</h2>
              <p className="mt-1 text-xs text-slate-300">Llena aquí una sola vez las líneas de la casa. El motor cruza cuotas, registros, dominancia por equipo, árbitro y contexto.</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
              <b>Total esperado:</b> {dominanceAnalysis.values.totalGoals.toFixed(1)} goles · {dominanceAnalysis.values.totalCorners.toFixed(1)} corners · {dominanceAnalysis.values.totalCards.toFixed(1)} tarjetas
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs text-slate-400">Goles esperados</p>
              <h3 className="mt-1 text-xl font-black">{dominanceAnalysis.values.localGoals.toFixed(1)} - {dominanceAnalysis.values.visitGoals.toFixed(1)}</h3>
              <p className="mt-1 text-sm text-slate-300">{match.local || "Local"} vs {match.visitante || "Visitante"}</p>
              <p className="mt-2 rounded-xl bg-white/10 p-2 text-xs">{dominanceAnalysis.dependencies.goals.label}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs text-slate-400">Corners esperados</p>
              <h3 className="mt-1 text-xl font-black">{dominanceAnalysis.values.localCorners.toFixed(1)} - {dominanceAnalysis.values.visitCorners.toFixed(1)}</h3>
              <p className="mt-1 text-sm text-slate-300">Total: {dominanceAnalysis.values.totalCorners.toFixed(1)}</p>
              <p className="mt-2 rounded-xl bg-white/10 p-2 text-xs">{dominanceAnalysis.dependencies.corners.label}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs text-slate-400">Tarjetas esperadas</p>
              <h3 className="mt-1 text-xl font-black">{dominanceAnalysis.values.localCards.toFixed(1)} - {dominanceAnalysis.values.visitCards.toFixed(1)}</h3>
              <p className="mt-1 text-sm text-slate-300">Ajustado por árbitro</p>
              <p className="mt-2 rounded-xl bg-white/10 p-2 text-xs">{dominanceAnalysis.dependencies.cards.label}</p>
            </div>
          </div>

          {dominanceAnalysis.dominators.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-50">
              <h3 className="mb-2 font-black">📌 Lecturas de dominancia</h3>
              {dominanceAnalysis.dominators.map((note) => <p key={note}>• {note}</p>)}
            </div>
          ) : null}

          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3">
              <h3 className="text-xl font-black">🏦 Líneas reales totales</h3>
              <p className="text-xs text-slate-300">Goles, corners y tarjetas se llenan aquí y alimentan también Picks clasificados, Anti-Casa, Resumen 90’ y Modo PRO.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {renderHouseMarket("⚽ Goles", "goalsOverLine", "goalsOverOdd", "goalsUnderLine", "goalsUnderOdd", GOAL_LINES, [...GOAL_LINES].reverse())}
              {renderHouseMarket("🚩 Corners", "cornersOverLine", "cornersOverOdd", "cornersUnderLine", "cornersUnderOdd", CORNER_OVER_LINES, CORNER_UNDER_LINES)}
              {renderHouseMarket("🟨 Tarjetas", "cardsOverLine", "cardsOverOdd", "cardsUnderLine", "cardsUnderOdd", CARD_LINES, [...CARD_LINES].reverse())}
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3">
              <h3 className="text-xl font-black">🎯 Líneas por equipo</h3>
              <p className="text-xs text-slate-300">Úsalas cuando la casa ofrezca corners/goles/tarjetas por equipo. Sirven para detectar si el total depende de un solo lado.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {renderDominancePair(`⚽ ${match.local || "Local"} goles`, "localGoalsOverLine", "localGoalsOverOdd", "localGoalsUnderLine", "localGoalsUnderOdd", TEAM_GOAL_LINES, [...TEAM_GOAL_LINES].reverse())}
              {renderDominancePair(`⚽ ${match.visitante || "Visitante"} goles`, "visitGoalsOverLine", "visitGoalsOverOdd", "visitGoalsUnderLine", "visitGoalsUnderOdd", TEAM_GOAL_LINES, [...TEAM_GOAL_LINES].reverse())}
              {renderDominancePair(`🚩 ${match.local || "Local"} corners`, "localCornersOverLine", "localCornersOverOdd", "localCornersUnderLine", "localCornersUnderOdd", TEAM_CORNER_LINES, [...TEAM_CORNER_LINES].reverse())}
              {renderDominancePair(`🚩 ${match.visitante || "Visitante"} corners`, "visitCornersOverLine", "visitCornersOverOdd", "visitCornersUnderLine", "visitCornersUnderOdd", TEAM_CORNER_LINES, [...TEAM_CORNER_LINES].reverse())}
              {renderDominancePair(`🟨 ${match.local || "Local"} tarjetas`, "localCardsOverLine", "localCardsOverOdd", "localCardsUnderLine", "localCardsUnderOdd", TEAM_CARD_LINES, [...TEAM_CARD_LINES].reverse())}
              {renderDominancePair(`🟨 ${match.visitante || "Visitante"} tarjetas`, "visitCardsOverLine", "visitCardsOverOdd", "visitCardsUnderLine", "visitCardsUnderOdd", TEAM_CARD_LINES, [...TEAM_CARD_LINES].reverse())}
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3">
              <h3 className="text-xl font-black">🛡️ Resultado protegido y handicap</h3>
              <p className="text-xs text-slate-300">Estas cuotas siguen alimentando doble oportunidad, handicap y protección del Modo PRO.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {renderResultHouseMarket()}
              {renderHandicapHouseMarket()}
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {dominanceAnalysis.picks.length === 0 ? <p className="text-sm text-slate-300">Carga registros y líneas para generar picks por dominancia.</p> : null}
            {dominanceAnalysis.picks.map((pick) => (
              <article key={pick.key} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black">{pick.label}</h3>
                    <p className="text-xs text-slate-300">{pick.reason}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${pick.grade === "safe" ? "bg-emerald-400/20 text-emerald-100" : pick.grade === "reasonable" ? "bg-amber-400/20 text-amber-100" : "bg-rose-400/20 text-rose-100"}`}>{getTierLabel(pick.grade)}</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-xl bg-white/5 p-3">Score: <b>{pick.score.toFixed(1)}%</b></div>
                  <div className="rounded-xl bg-white/5 p-3">Cuota: <b>{pick.odd > 1 ? pick.odd.toFixed(2) : "—"}</b></div>
                  <div className="rounded-xl bg-white/5 p-3">Riesgo: <b>{pick.risk}</b></div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-5 rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <h2 className="mb-4 text-2xl font-bold">🏦 Lectura de casa + registros</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {housePicks.map((pick) => (
              <article key={pick.key} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-black">{pick.label}</h3><p className="text-sm text-slate-300">Modelo: {formatScore(pick.modelScore)} · Prob. casa: {pick.implied ? formatScore(pick.implied) : "—"}</p></div>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${pick.grade === "safe" ? "bg-emerald-400/20 text-emerald-100" : pick.grade === "reasonable" ? "bg-amber-400/20 text-amber-100" : "bg-rose-400/20 text-rose-100"}`}>{pick.tier}</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                  <div className="rounded-xl bg-white/5 p-3">Cuota: <b>{pick.odd ? pick.odd.toFixed(2) : "—"}</b></div>
                  <div className="rounded-xl bg-white/5 p-3">Value: <b>{pick.implied ? `${pick.value >= 0 ? "+" : ""}${pick.value.toFixed(1)}%` : "—"}</b></div>
                  <div className="rounded-xl bg-white/5 p-3">Línea: <b>{pick.line}</b></div>
                  <div className="rounded-xl bg-white/5 p-3">Anti-casa: <b>{pick.trapLabel || "—"}</b></div>
                </div>
                {pick.riskFlags.length > 0 ? <div className="mt-3 rounded-xl bg-amber-400/10 p-3 text-xs text-amber-100">{pick.riskFlags.map((flag) => <p key={flag}>• {flag}</p>)}</div> : null}
              </article>
            ))}
          </div>
        </section>

        {contradictionAlerts.length > 0 ? (
          <section className="mb-5 rounded-3xl border border-amber-300/40 bg-amber-400/10 p-4 backdrop-blur-xl">
            <h2 className="text-xl font-bold text-amber-100">⚠️ Alertas de contradicción</h2>
            <div className="mt-2 space-y-1 text-sm text-amber-50">{contradictionAlerts.map((alert) => <p key={alert}>• {alert}</p>)}</div>
          </section>
        ) : null}

        <section className="mb-5 rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <h2 className="mb-4 text-2xl font-bold">📊 Picks clasificados</h2>
          <div className="space-y-3">
            {results.length === 0 ? <p className="text-sm text-slate-300">Todavía no hay picks. Agrega indicadores con registro tipo X/X.</p> : null}
            {results.map((pick) => (
              <article key={pick.key} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 shadow-lg">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black">{pick.sources?.[0]?.period && pick.sources[0].period !== "full" ? `${getPeriodLabel(pick.sources[0].period)} · ` : ""}{pick.label}{pick.line ? ` · ${pick.line}` : ""}</h3>
                    <p className="text-sm text-slate-300">Señales: {pick.count} · SofaScore: {formatScore(pick.confidence)} · Registros: {pick.recentScore ? formatScore(pick.recentScore) : "—"} · Licuadora: {formatScore(pick.blendedScore)}</p>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-sm font-bold ${pick.grade === "safe" ? "bg-emerald-400/20 text-emerald-100" : pick.grade === "reasonable" ? "bg-amber-400/20 text-amber-100" : "bg-rose-400/20 text-rose-100"}`}>{pick.tier}</div>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-xl bg-white/5 p-3">Cuota casa: <b>{pick.avgOdd ? pick.avgOdd.toFixed(2) : "—"}</b></div>
                  <div className="rounded-xl bg-white/5 p-3">Prob. casa: <b>{pick.implied ? `${pick.implied.toFixed(1)}%` : "—"}</b></div>
                  <div className={`rounded-xl p-3 ${pick.value >= 8 ? "bg-emerald-500/20 text-emerald-100" : pick.value < 0 ? "bg-rose-500/20 text-rose-100" : "bg-white/5"}`}>Value: <b>{pick.implied ? `${pick.value >= 0 ? "+" : ""}${pick.value.toFixed(1)}%` : "—"}</b></div>
                </div>
                {pick.riskFlags.length > 0 ? <div className="mt-3 rounded-xl bg-amber-400/10 p-3 text-xs text-amber-100">{pick.riskFlags.map((flag) => <p key={flag}>• {flag}</p>)}</div> : null}
              </article>
            ))}
          </div>
        </section>

  {hasMinimumData && antiCasaAlerts.length > 0 ? (
          <section className="mb-5 rounded-3xl border border-orange-300/30 bg-orange-400/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">🧨 Detector Anti-Casa</h2>
                <p className="text-xs text-orange-100/80">Detecta líneas estrechas, trampas visuales y value real antes de meterlas en parlay.</p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {antiCasaAlerts.map((pick) => (
                <div key={pick.key} className={`rounded-2xl border p-4 ${pick.trapLevel === "valor_real" ? "border-emerald-300/30 bg-emerald-400/10" : pick.trapLevel === "linea_comoda" ? "border-sky-300/30 bg-sky-400/10" : pick.trapLevel === "trampa_probable" ? "border-rose-300/30 bg-rose-400/10" : "border-amber-300/30 bg-amber-400/10"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-300">{pick.trapLabel}</p>
                      <h3 className="mt-1 font-black">{pick.label}</h3>
                      <p className="text-xs text-slate-300">Margen vs línea: {typeof pick.margin === "number" ? pick.margin.toFixed(1) : "—"} · Modelo {formatScore(pick.modelScore)}</p>
                    </div>
                    <span className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black">{pick.odd ? pick.odd.toFixed(2) : "Sin cuota"}</span>
                  </div>
                  {pick.riskFlags.length > 0 ? (
                    <div className="mt-3 space-y-1 text-xs text-orange-50">
                      {pick.riskFlags.slice(0, 3).map((flag) => <p key={flag}>• {flag}</p>)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}


        {analysis ? (
          <section className="mb-5 overflow-hidden rounded-[2rem] border border-yellow-300/40 bg-gradient-to-br from-yellow-300/15 via-slate-900/80 to-violet-500/15 p-1 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="rounded-[1.8rem] bg-slate-950/55 p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-yellow-200/80">Centro de decisión</p>
                  <h2 className="mt-1 text-3xl font-black">🧠 Análisis inteligente</h2>
                </div>
                <div className={`rounded-2xl px-4 py-3 text-xl font-black ${analysis.decision.includes("JUGAR") ? "bg-emerald-400/15 text-emerald-100" : analysis.decision.includes("NO") ? "bg-rose-400/15 text-rose-100" : "bg-amber-400/15 text-amber-100"}`}>
                  {analysis.decision}
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 lg:col-span-2">
                  <p className="text-xs text-slate-400">Mejor lectura</p>
                  <p className="mt-1 text-2xl font-black">{analysis.best.label} {analysis.best.line ? `· ${analysis.best.line}` : ""}</p>
                  <p className="mt-2 text-sm text-slate-300">{analysis.detail}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs text-slate-400">Puntaje</p>
                  <p className="mt-1 text-3xl font-black text-sky-100">{analysis.best.score.toFixed(1)}%</p>
                  <p className="text-xs text-slate-400">Origen: {analysis.best.source}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs text-slate-400">Value / Perfil</p>
                  <p className="mt-1 text-xl font-black">{analysis.best.implied ? `${analysis.best.value >= 0 ? "+" : ""}${analysis.best.value.toFixed(1)}%` : "Sin cuota"}</p>
                  <p className="text-xs text-slate-400">{matchProfile.type === "abierto" ? "🔥 Abierto" : matchProfile.type === "cerrado" ? "🧊 Cerrado" : matchProfile.type === "trampa" ? "⚠️ Trampa" : "⚖️ Equilibrado"}</p>
                </div>
              </div>
            </div>
          </section>
        ) : null}


        {proMode ? (
          <section className={`mb-5 overflow-hidden rounded-[2rem] border p-1 shadow-2xl shadow-black/50 backdrop-blur-xl ${proMode.tone === "green" ? "border-emerald-300/40 bg-emerald-400/10" : proMode.tone === "red" ? "border-rose-300/40 bg-rose-400/10" : "border-amber-300/40 bg-amber-400/10"}`}>
            <div className="rounded-[1.8rem] bg-slate-950/60 p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-200/80">Modo PRO rentable</p>
                  <h2 className="mt-1 text-3xl font-black">🤖 {proMode.title}</h2>
                  <p className="mt-1 max-w-3xl text-sm text-slate-300">{proMode.message}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-right">
                  <p className="text-xs text-slate-400">Mejor confianza real</p>
                  <p className="text-3xl font-black text-emerald-100">{proMode.top ? `${proMode.top.realConfidence.toFixed(1)}/100` : "—"}</p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-black text-emerald-100">🧊 Parlay PRO corto</h3>
                      <p className="text-xs text-emerald-50/80">Solo 2 selecciones, familias distintas y sin zonas trampa.</p>
                    </div>
                    <span className="rounded-xl bg-white/10 px-3 py-2 text-sm font-black">Cuota: {formatOdd(combinedOdds(proMode.proParlay))}</span>
                  </div>
                  <div className="space-y-3">
                    {proMode.proParlay.length === 0 ? <p className="text-sm text-slate-300">Sin parlay PRO limpio. No fuerces combinación.</p> : null}
                    {proMode.proParlay.map((pick, index) => (
                      <div key={pick.key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                        <div>
                          <p className="text-xs text-slate-400">Selección {index + 1} · {pick.source}</p>
                          <p className="font-black">{pick.label} {pick.line ? `· ${pick.line}` : ""}</p>
                          <p className="text-xs text-emerald-100">Confianza real {pick.realConfidence.toFixed(1)} · Score {formatScore(pick.score)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">{formatOdd(pick.odd)}</span>
                          <button onClick={() => addPickToDaily(pick)} disabled={isPickInDaily(pick)} className={`rounded-xl px-3 py-2 text-xs font-black shadow-lg transition ${isPickInDaily(pick) ? "bg-emerald-400/20 text-emerald-100" : "bg-cyan-300 text-cyan-950 hover:bg-cyan-200"}`}>
                            {isPickInDaily(pick) ? "✔ Añadido" : "📤 Agregar"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-4">
                  <h3 className="text-xl font-black text-sky-100">🎯 Simples PRO</h3>
                  <p className="text-xs text-sky-50/80">Mejor para stake controlado si no hay parlay limpio.</p>
                  <div className="mt-3 space-y-3">
                    {proMode.proSimples.length === 0 ? <p className="text-sm text-slate-300">Sin simple clara.</p> : null}
                    {proMode.proSimples.map((pick) => (
                      <div key={pick.key} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-black">{pick.label} {pick.line ? `· ${pick.line}` : ""}</p>
                            <p className="text-xs text-sky-100">Confianza real {pick.realConfidence.toFixed(1)} · {pick.source}</p>
                          </div>
                          <span className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black">{formatOdd(pick.odd)}</span>
                        </div>
                        <button onClick={() => addPickToDaily(pick)} disabled={isPickInDaily(pick)} className={`mt-3 w-full rounded-xl px-3 py-2 text-xs font-black ${isPickInDaily(pick) ? "bg-emerald-400/20 text-emerald-100" : "bg-cyan-300 text-cyan-950"}`}>
                          {isPickInDaily(pick) ? "✔ Añadido al día" : "📤 Agregar al día"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {proMode.bloqueados.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4">
                  <h3 className="font-black text-rose-100">⛔ Detector de sabotaje / no combinar</h3>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {proMode.bloqueados.map((pick) => (
                      <div key={pick.key} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
                        <p className="font-black">{pick.label} {pick.line ? `· ${pick.line}` : ""}</p>
                        <p className="text-xs text-rose-100">Confianza real {pick.realConfidence.toFixed(1)} · No forzar</p>
                        {pick.reasons.length > 0 ? <p className="mt-1 text-xs text-slate-300">• {pick.reasons[0]}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <h2 className="text-2xl font-bold">🧩 Sugerencia de posible parlay</h2>
          <p className="mt-1 text-xs text-slate-300">No es apuesta segura. Es una combinación razonable si no hay contradicciones fuertes.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
              <h3 className="font-black text-emerald-100">🧊 Parlay conservador</h3>
              <div className="mt-3 space-y-3">
                {parlaySuggestions.conservador.length === 0 ? <p className="text-sm text-slate-300">Sin combinación conservadora clara.</p> : null}
                {parlaySuggestions.conservador.map((pick, index) => (
                  <div key={pick.key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div><p className="text-xs text-slate-400">Selección {index + 1} · {pick.source}</p><p className="font-black">{pick.label} {pick.line ? `· ${pick.line}` : ""}</p><p className="text-xs text-slate-300">{pick.tier} · Score {formatScore(pick.score)}</p></div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">{pick.odd ? pick.odd.toFixed(2) : "Sin cuota"}</span>
                      <button
                        onClick={() => addPickToDaily(pick)}
                        disabled={isPickInDaily(pick)}
                        className={`rounded-xl px-3 py-2 text-xs font-black shadow-lg transition ${isPickInDaily(pick) ? "bg-emerald-400/20 text-emerald-100" : "bg-cyan-300 text-cyan-950 hover:bg-cyan-200"}`}
                      >
                        {isPickInDaily(pick) ? "✔ Añadido" : "📤 Agregar al día"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
            </div>
            <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4">
              <h3 className="font-black text-rose-100">🔥 Parlay riesgoso</h3>
              <div className="mt-3 space-y-3">
                {parlaySuggestions.riesgoso.length === 0 ? <p className="text-sm text-slate-300">Sin combinación riesgosa clara.</p> : null}
                {parlaySuggestions.riesgoso.map((pick, index) => (
                  <div key={pick.key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div><p className="text-xs text-slate-400">Selección {index + 1} · {pick.source}</p><p className="font-black">{pick.label} {pick.line ? `· ${pick.line}` : ""}</p><p className="text-xs text-slate-300">{pick.tier} · Score {formatScore(pick.score)}</p></div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">{pick.odd ? pick.odd.toFixed(2) : "Sin cuota"}</span>
                      <button
                        onClick={() => addPickToDaily(pick)}
                        disabled={isPickInDaily(pick)}
                        className={`rounded-xl px-3 py-2 text-xs font-black shadow-lg transition ${isPickInDaily(pick) ? "bg-emerald-400/20 text-emerald-100" : "bg-cyan-300 text-cyan-950 hover:bg-cyan-200"}`}
                      >
                        {isPickInDaily(pick) ? "✔ Añadido" : "📤 Agregar al día"}
                      </button>
                    </div>
                  </div>
                ))}
                
              </div>
            </div>
          </div>
          
        </section>

        <section className="mt-5 overflow-hidden rounded-[2rem] border border-cyan-300/25 bg-gradient-to-br from-cyan-400/15 via-slate-950/70 to-violet-500/15 p-1 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="rounded-[1.8rem] bg-slate-950/55 p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-200/80">Planificador del día</p>
                <h2 className="mt-1 text-3xl font-black">📤 Parlays o simples del día</h2>
                <p className="mt-1 text-sm text-slate-300">Selecciona picks desde el bloque de parlay. Este bloque NO se borra con Limpiar partido.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={exportDailyPicks} className="rounded-2xl bg-cyan-400 px-4 py-3 font-black text-cyan-950">🗃️ Exportar día</button>
                <button onClick={() => dailyPicksImportRef.current?.click()} className="rounded-2xl bg-violet-400 px-4 py-3 font-black text-violet-950">📨 Importar día</button>
                <button onClick={clearDailyPicks} className="rounded-2xl bg-rose-500 px-4 py-3 font-black text-white">🧹 Limpiar día</button>
                <input ref={dailyPicksImportRef} type="file" accept="application/json" className="hidden" onChange={(event) => importDailyPicks(event.target.files?.[0] || null)} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs text-slate-400">Picks seleccionados</p>
                <p className="mt-1 text-3xl font-black text-cyan-100">{dailyPicks.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs text-slate-400">Cuota total si combinaras todo</p>
                <p className="mt-1 text-3xl font-black text-amber-100">{combinedOdds(dailyPicks) ? combinedOdds(dailyPicks).toFixed(2) : "—"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 md:col-span-2">
                <p className="text-xs text-slate-400">Regla de disciplina</p>
                <p className="mt-1 text-sm font-semibold text-slate-200">No agregues mercados manuales encima. Primero genera el plan y respeta qué va simple, qué va parlay y qué se descarta.</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {dailyPicks.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 text-sm text-slate-300">
                  Todavía no seleccionaste picks. Usa el botón <b>📤 Agregar al día</b> en Parlay conservador o riesgoso.
                </div>
              ) : null}
              {dailyPicks.map((pick) => (
                <div key={pick.id} className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/45 p-4 lg:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-xs text-slate-400">{pick.matchName} · {pick.source}</p>
                    <p className="text-lg font-black">{pick.label} {pick.line ? `· ${pick.line}` : ""}</p>
                    <p className="text-xs text-slate-300">{pick.tier} · Score {formatScore(pick.score)} · {formatOdd(pick.odd)}</p>
                    {pick.riskFlags.length ? <p className="mt-1 text-xs text-amber-100">⚠️ {pick.riskFlags[0]}</p> : null}
                  </div>
                  <button onClick={() => removeDailyPick(pick.id)} className="rounded-2xl bg-rose-500/90 px-4 py-2 text-sm font-black text-white">Quitar</button>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/10 p-4">
              <div>
                <h3 className="text-xl font-black">🤖 Generador de estrategia</h3>
                <p className="text-sm text-slate-300">La app separa simples, parlay conservador, riesgoso y descartes para evitar sabotear el sistema.</p>
              </div>
              <button onClick={() => setDailyPlanGenerated(true)} disabled={dailyPicks.length === 0} className="rounded-2xl bg-emerald-400 px-5 py-3 font-black text-emerald-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300">Generar Parlay o Simples del día</button>
            </div>

            {dailyPlanGenerated ? (
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {dailyPlan.map((group) => (
                  <div key={group.title} className={`rounded-3xl border p-4 ${group.tone === "safe" ? "border-emerald-300/25 bg-emerald-400/10" : group.tone === "reasonable" ? "border-cyan-300/25 bg-cyan-400/10" : group.tone === "risky" ? "border-rose-300/25 bg-rose-400/10" : "border-slate-300/20 bg-slate-400/10"}`}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-black">{group.title}</h3>
                        <p className="text-xs text-slate-300">{group.subtitle}</p>
                      </div>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{group.picks.length} picks</span>
                    </div>
                    {group.title.includes("Parlay") && group.picks.length ? (
                      <p className="mb-3 rounded-2xl bg-slate-950/40 px-3 py-2 text-sm font-black text-amber-100">Cuota combinada aprox: {combinedOdds(group.picks).toFixed(2)}</p>
                    ) : null}
                    <div className="space-y-2">
                      {group.picks.length === 0 ? <p className="text-sm text-slate-300">Sin picks para esta categoría.</p> : null}
                      {group.picks.map((pick, index) => (
                        <div key={pick.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
                          <p className="text-xs text-slate-400">Selección {index + 1} · {pick.matchName}</p>
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-black">{pick.label} {pick.line ? `· ${pick.line}` : ""}</p>
                            <span className="rounded-xl bg-white/10 px-3 py-2 text-sm font-black">{formatOdd(pick.odd)}</span>
                          </div>
                          <p className="text-xs text-slate-300">{pick.tier} · Score {formatScore(pick.score)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {finalReading ? (
          <section className="relative overflow-hidden rounded-3xl border border-sky-300/20 bg-slate-950/45 p-4 shadow-2xl shadow-sky-950/40 backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at top left, ${match.localColor1}33, transparent 35%), radial-gradient(circle at bottom right, ${match.visitColor1}33, transparent 35%)` }} />
            <div className="relative z-10">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-sky-200">Lectura para comparar después</p>
                  <h2 className="mt-1 text-2xl font-black text-white">🔮 Resumen de lectura 90’</h2>
                  <p className="mt-1 text-xs text-slate-300">No es apuesta segura. Sirve para revisar qué tan cerca estuvo la app al finalizar el partido.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-right">
                  <p className="text-xs text-slate-400">Perfil del partido</p>
                  <p className="text-lg font-black">{finalReading.profile === "abierto" ? "🔥 Abierto" : finalReading.profile === "cerrado" ? "🧊 Cerrado" : finalReading.profile === "trampa" ? "⚠️ Trampa" : "⚖️ Equilibrado"}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ganador probable</p>
                  <p className="mt-2 text-xl font-black text-white">{finalReading.winner.label}</p>
                  <div className="mt-3 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-emerald-400" style={{ width: `${finalReading.winner.pct}%` }} /></div>
                  <p className="mt-2 text-2xl font-black text-emerald-100">{finalReading.winner.pct.toFixed(1)}%</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Doble oportunidad</p>
                  <p className="mt-2 text-xl font-black text-white">{finalReading.doubleChance.label}</p>
                  <div className="mt-3 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-sky-400" style={{ width: `${finalReading.doubleChance.pct}%` }} /></div>
                  <p className="mt-2 text-2xl font-black text-sky-100">{finalReading.doubleChance.pct.toFixed(1)}%</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total de goles</p>
                  <p className="mt-2 text-lg font-black text-white">{finalReading.goals.label}</p>
                  <p className="mt-1 text-xs text-slate-300">Esperado: {finalReading.goals.expected.toFixed(1)}</p>
                  <p className="mt-2 text-2xl font-black text-violet-100">{finalReading.goals.pct.toFixed(1)}%</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total de corners</p>
                  <p className="mt-2 text-lg font-black text-white">{finalReading.corners.label}</p>
                  <p className="mt-1 text-xs text-slate-300">Esperado: {finalReading.corners.expected.toFixed(1)}</p>
                  <p className="mt-2 text-2xl font-black text-amber-100">{finalReading.corners.pct.toFixed(1)}%</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total de tarjetas</p>
                  <p className="mt-2 text-lg font-black text-white">{finalReading.cards.label}</p>
                  <p className="mt-1 text-xs text-slate-300">Esperado: {finalReading.cards.expected.toFixed(1)}</p>
                  <p className="mt-2 text-2xl font-black text-rose-100">{finalReading.cards.pct.toFixed(1)}%</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Mensaje de sugerencia</p>
                <p className="mt-2 text-sm font-semibold text-cyan-50">{finalReading.message}</p>
              </div>
            </div>
          </section>
        ) : null}
        
<div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4 lg:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-black">➕ Registrar apuesta</h3>
                  <button onClick={quickFillBankBet} className="rounded-xl bg-amber-300 px-3 py-2 text-sm font-black text-amber-950">⚡ Usar mejor lectura</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <input className={inputClass} type="date" value={bankBetDraft.date} onChange={(event) => setBankBetDraft((prev) => ({ ...prev, date: event.target.value }))} />
                  <input className={inputClass} placeholder="Partido" value={bankBetDraft.matchName} onChange={(event) => setBankBetDraft((prev) => ({ ...prev, matchName: event.target.value }))} />
                  <input className={inputClass} placeholder="Pick / selección" value={bankBetDraft.pick} onChange={(event) => setBankBetDraft((prev) => ({ ...prev, pick: event.target.value }))} />
                  <select className={selectClass} value={bankBetDraft.market} onChange={(event) => setBankBetDraft((prev) => ({ ...prev, market: event.target.value }))}>
                    <option value="">Mercado</option>
                    <option value="Ganador / doble oportunidad">Ganador / doble oportunidad</option>
                    <option value="Goles">Goles</option>
                    <option value="Corners">Corners</option>
                    <option value="Tarjetas">Tarjetas</option>
                    <option value="Handicap">Handicap</option>
                    <option value="Parlay">Parlay</option>
                  </select>
                  <input className={inputClass} inputMode="decimal" placeholder="Monto apostado" value={bankBetDraft.stake} onChange={(event) => setBankBetDraft((prev) => ({ ...prev, stake: event.target.value }))} />
                  <input className={inputClass} inputMode="decimal" placeholder="Cuota total" value={bankBetDraft.odd} onChange={(event) => setBankBetDraft((prev) => ({ ...prev, odd: event.target.value }))} />
                  <select className={selectClass} value={bankBetDraft.source} onChange={(event) => setBankBetDraft((prev) => ({ ...prev, source: event.target.value as BetSource }))}>
                    <option value="app">🤖 App</option>
                    <option value="manual">🧍 Manual</option>
                  </select>
                  <select className={selectClass} value={bankBetDraft.status} onChange={(event) => setBankBetDraft((prev) => ({ ...prev, status: event.target.value as BetStatus }))}>
                    <option value="pending">Pendiente</option>
                    <option value="won">Ganada</option>
                    <option value="lost">Perdida</option>
                    <option value="void">Nula</option>
                  </select>
                  <input className={`${inputClass} sm:col-span-2 lg:col-span-3`} placeholder="Nota corta: por qué la jugaste / qué aprendiste" value={bankBetDraft.notes} onChange={(event) => setBankBetDraft((prev) => ({ ...prev, notes: event.target.value }))} />
                  <button onClick={addBankBet} className="rounded-2xl bg-emerald-400 px-4 py-3 font-black text-emerald-950 shadow-lg shadow-emerald-400/20">Guardar apuesta</button>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <h3 className="text-xl font-black">🏆 Mercados</h3>
                <div className="mt-3 space-y-2">
                  {bankrollStats.byMarket.length === 0 ? <p className="text-sm text-slate-300">Aún no hay mercados cerrados.</p> : null}
                  {bankrollStats.byMarket.map((item) => (
                    <div key={item.market} className="rounded-2xl bg-slate-950/45 p-3">
                      <div className="flex justify-between gap-2 text-sm"><span className="font-bold">{item.market}</span><span className={item.profit >= 0 ? "text-emerald-200" : "text-rose-200"}>{item.profit >= 0 ? "+" : ""}{formatMoney(item.profit)}</span></div>
                      <p className="text-xs text-slate-400">{item.total} cerradas · ROI {item.stake > 0 ? ((item.profit / item.stake) * 100).toFixed(1) : "0.0"}%</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
        
        {match.local && match.visitante ? (
          <section
            className="mb-5 overflow-hidden rounded-3xl border border-white/10 p-1 shadow-2xl shadow-black/40 backdrop-blur-xl"
            style={{ background: `linear-gradient(120deg, ${match.localColor1}55, rgba(15,23,42,.85) 40%, rgba(15,23,42,.85) 60%, ${match.visitColor1}55)` }}
          >
            <div className="rounded-[1.35rem] bg-slate-950/45 p-5 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.35em] text-slate-200">Partido analizado</p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <TeamBadge name={match.local} color1={match.localColor1} color2={match.localColor2} />
                <div className="text-3xl font-black tracking-wide text-white sm:text-5xl">
                  {match.local}
                  <span className="mx-3 text-slate-400">vs</span>
                  {match.visitante}
                </div>
                <TeamBadge name={match.visitante} color1={match.visitColor1} color2={match.visitColor2} />
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs text-slate-200">
                <span className="rounded-full bg-white/10 px-3 py-1">1: {match.oddLocal || "—"}</span>
                <span className="rounded-full bg-white/10 px-3 py-1">X: {match.oddDraw || "—"}</span>
                <span className="rounded-full bg-white/10 px-3 py-1">2: {match.oddVisit || "—"}</span>
              </div>
            </div>
          </section>
        ) : null}

      </div>
      
    </main>
    
  );

  
}