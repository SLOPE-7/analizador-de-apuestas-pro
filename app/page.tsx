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

type ExportShape = {
  version: number;
  exportedAt: string;
  match: Match;
  indicators: Indicator[];
  localRecent: RecentRow[];
  visitRecent: RecentRow[];
  houseMarkets: HouseMarket;
};

const STORAGE_KEY = "analizador_pro_h2h_casa_v4";

const MARKET_OPTIONS = [
  { label: "Sin derrotas", value: "sin_derrotas", line: "" },
  { label: "Sin victorias", value: "sin_victorias", line: "" },
  { label: "Victorias", value: "victorias", line: "" },
  { label: "Más de 2.5 goles", value: "over_2_5", line: "2.5" },
  { label: "Más de 1.5 goles", value: "over_1_5", line: "1.5" },
  { label: "Menos de 2.5 goles", value: "under_2_5", line: "2.5" },
  { label: "Menos de 4.5 goles", value: "under_4_5", line: "4.5" },
  { label: "Más de 5.5 corners", value: "over_5_5_corners", line: "5.5" },
  { label: "Más de 6.5 corners", value: "over_6_5_corners", line: "6.5" },
  { label: "Más de 8.5 corners", value: "over_8_5_corners", line: "8.5" },
  { label: "Más de 9.5 corners", value: "over_9_5_corners", line: "9.5" },
  { label: "Más de 10.5 corners", value: "over_10_5_corners", line: "10.5" },
  { label: "Menos de 10.5 corners", value: "under_10_5_corners", line: "10.5" },
  { label: "Menos de 14.5 corners", value: "under_14_5_corners", line: "14.5" },
  { label: "Ambos marcan", value: "btts", line: "Sí" },
  { label: "Más de 2.5 tarjetas", value: "over_2_5_cards", line: "2.5" },
  { label: "Más de 4.5 tarjetas", value: "over_4_5_cards", line: "4.5" },
  { label: "Menos de 4.5 tarjetas", value: "under_4_5_cards", line: "4.5" },
  { label: "Menos de 6.5 tarjetas", value: "under_6_5_cards", line: "6.5" },
  { label: "Ninguna portería a cero", value: "no_clean", line: "Sí" },
  { label: "Ganador", value: "ganador", line: "" },
  { label: "Ganador del primer tiempo", value: "first_half_winner", line: "1T" },
  { label: "Gana cualquier mitad", value: "wins_any_half", line: "Any" },
  { label: "Empate", value: "empate", line: "" },
  { label: "Local o empate", value: "local_o_empate", line: "1X" },
  { label: "Visitante o empate", value: "visitante_o_empate", line: "X2" },
  { label: "Local o visitante", value: "local_o_visitante", line: "12" },
  { label: "Local +1.5 handicap", value: "local_plus_1_5", line: "+1.5" },
  { label: "Local +0.5 handicap", value: "local_plus_0_5", line: "+0.5" },
  { label: "Local -0.5 handicap", value: "local_minus_0_5", line: "-0.5" },
  { label: "Local -1.5 handicap", value: "local_minus_1_5", line: "-1.5" },
  { label: "Visitante +1.5 handicap", value: "visit_plus_1_5", line: "+1.5" },
  { label: "Visitante +0.5 handicap", value: "visit_plus_0_5", line: "+0.5" },
  { label: "Visitante -0.5 handicap", value: "visit_minus_0_5", line: "-0.5" },
  { label: "Visitante -1.5 handicap", value: "visit_minus_1_5", line: "-1.5" },
];

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
const GOAL_LINES = ["0.5", "1.5", "2.5", "3.5", "4.5", "5.5"];
const CORNER_OVER_LINES = ["4.5", "5.5", "6.5", "7.5", "8.5", "9.5", "10.5"];
const CORNER_UNDER_LINES = ["14.5", "13.5", "12.5", "11.5", "10.5", "9.5", "8.5", "7.5", "6.5", "5.5"];
const CARD_LINES = ["1.5", "2.5", "3.5", "4.5", "5.5", "6.5"];
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
  if (marketValue === "victorias") return Math.max(local.winPct, visit.winPct);
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
  ].some((odd) => toNumber(odd) > 1);
}

function marketValueFromGroup(group: MarketGroup, direction: "over" | "under", line: string) {
  const safeLine = line.replace(".", "_");
  if (group === "goals") return `${direction}_${safeLine}`;
  if (group === "corners") return `${direction}_${safeLine}_corners`;
  return `${direction}_${safeLine}_cards`;
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
    label = "🟡 Línea estrecha";
    adjustment -= group === "corners" ? 22 : group === "cards" ? 16 : 18;
    flags.push(`Línea estrecha: proyección ${expected.toFixed(1)} vs línea ${lineNumber.toFixed(1)}. No usar fuerte en parlay.`);
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

  const addIndicator = () => {
    setIndicators((prev) => [
      ...prev,
      { id: makeId(), team: "ambos", period: "full", market: "", line: "", record: "", houseOdd: "" },
    ]);
  };

  const updateIndicator = (id: string, field: keyof Indicator, value: string) => {
    setIndicators((prev) => prev.map((indicator) => (indicator.id === id ? { ...indicator, [field]: value } : indicator)));
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
  const matchProfile = useMemo(() => buildMatchProfile(indicators, localRecent, visitRecent), [indicators, localRecent, visitRecent]);
  const totalRecentCount = useMemo(() => countValidRows(localRecent).length + countValidRows(visitRecent).length, [localRecent, visitRecent]);
  const hasMinimumData = useMemo(() => {
    const hasTeams = Boolean(match.local.trim()) && Boolean(match.visitante.trim());
    const hasSignals = hasIndicatorSignal(indicators) || totalRecentCount >= 2 || hasHouseOdd(houseMarkets);
    return hasTeams && hasSignals;
  }, [match.local, match.visitante, indicators, totalRecentCount, houseMarkets]);

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

        const expectedForTrap = candidate.group === "goals" ? projection.expectedGoals : candidate.group === "corners" ? projection.expectedCorners : projection.expectedCards;
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
    const resultCandidates: Array<{ label: string; marketValue: string; line: string; score: number; odd: number }> = [
      { label: `${match.local || "Local"} gana`, marketValue: "ganador", line: "1", score: clamp((local.winPct * 0.6 + visit.noWinPct * 0.4) * strength, 0, 100), odd: toNumber(match.oddLocal) },
      { label: `${match.visitante || "Visitante"} gana`, marketValue: "ganador", line: "2", score: clamp((visit.winPct * 0.6 + local.noWinPct * 0.4) * strength, 0, 100), odd: toNumber(match.oddVisit) },
      { label: "Empate", marketValue: "empate", line: "X", score: clamp(average([local.drawPct, visit.drawPct]) * strength, 0, 100), odd: toNumber(match.oddDraw) },
      { label: `${match.local || "Local"} o empate`, marketValue: "local_o_empate", line: "1X", score: clamp((local.noLosePct * 0.65 + visit.noWinPct * 0.35) * strength, 0, 100), odd: 0 },
      { label: `${match.visitante || "Visitante"} o empate`, marketValue: "visitante_o_empate", line: "X2", score: clamp((visit.noLosePct * 0.65 + local.noWinPct * 0.35) * strength, 0, 100), odd: 0 },
      { label: "Local o visitante", marketValue: "local_o_visitante", line: "12", score: clamp((100 - average([local.drawPct, visit.drawPct])) * strength, 0, 100), odd: 0 },
      { label: `${match.local || "Local"} +1.5 handicap`, marketValue: "local_plus_1_5", line: "+1.5", score: clamp(average([handicapPct(localRecent, 1.5), 100 - handicapPct(visitRecent, -1.5)]) * strength, 0, 100), odd: 0 },
      { label: `${match.visitante || "Visitante"} +1.5 handicap`, marketValue: "visit_plus_1_5", line: "+1.5", score: clamp(average([handicapPct(visitRecent, 1.5), 100 - handicapPct(localRecent, -1.5)]) * strength, 0, 100), odd: 0 },
      { label: `${match.local || "Local"} -1.5 handicap`, marketValue: "local_minus_1_5", line: "-1.5", score: clamp(handicapPct(localRecent, -1.5) * strength, 0, 100), odd: 0 },
      { label: `${match.visitante || "Visitante"} -1.5 handicap`, marketValue: "visit_minus_1_5", line: "-1.5", score: clamp(handicapPct(visitRecent, -1.5) * strength, 0, 100), odd: 0 },
    ];

    const resultPicks: HousePick[] = resultCandidates
      .filter((candidate) => candidate.score >= 56)
      .map((candidate) => {
        const implied = impliedProb(candidate.odd);
        const value = implied > 0 ? candidate.score - implied : 0;
        const riskFlags: string[] = [];
        if ((local.count || 0) + (visit.count || 0) < 6) riskFlags.push("Pocos registros: lectura secundaria.");
        if ((candidate.marketValue === "ganador" || candidate.marketValue.includes("minus")) && candidate.score < 72) riskFlags.push("Ganador/handicap negativo requiere margen: riesgo medio.");
        if (implied > 0 && value < 0) riskFlags.push("La cuota no acompaña: sin value claro.");
        const grade = getGrade(candidate.score, riskFlags);
        return { key: `registro_${candidate.marketValue}_${candidate.line}`, label: candidate.label, marketValue: candidate.marketValue, line: candidate.line, odd: candidate.odd, implied, modelScore: candidate.score, value, grade, tier: getTierLabel(grade), riskFlags };
      });

    return [...marketLinePicks, ...resultPicks].sort((a, b) => b.modelScore - a.modelScore);
  }, [houseMarkets, localRecent, visitRecent, matchProfile, projection, match, hasMinimumData]);

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
          blendedScore = clamp(blendedScore - cardPenalty, 0, 100);
          riskFlags.push("Tarjetas bajan prioridad: mercado dependiente de árbitro/contexto.");
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
  }, [indicators, localRecent, visitRecent, matchProfile, projection.expectedCorners]);

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

  const parlaySuggestions = useMemo(() => {
    if (!hasMinimumData) {
      return { conservador: [], riesgoso: [] };
    }

    const familyOf = (market: string) => {
      if (isCardMarket(market)) return "cards";
      if (market.includes("corners")) return "corners";
      if (isGoalMarket(market)) return "goals";
      if (["ganador", "empate", "sin_derrotas", "sin_victorias", "victorias", "first_half_winner", "wins_any_half", "local_o_empate", "visitante_o_empate", "local_o_visitante", "local_plus_1_5", "local_plus_0_5", "local_minus_0_5", "local_minus_1_5", "visit_plus_1_5", "visit_plus_0_5", "visit_minus_0_5", "visit_minus_1_5"].includes(market)) return "result";
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
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ match, indicators, localRecent, visitRecent, houseMarkets }));
  }, [match, indicators, localRecent, visitRecent, houseMarkets]);

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
  };

  const saveManual = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ match, indicators, localRecent, visitRecent, houseMarkets }));
    alert("✅ Partido guardado");
  };

  const exportMatch = () => {
    const fileName = `${match.local || "local"}_vs_${match.visitante || "visitante"}`
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .toLowerCase();
    const data: ExportShape = {
      version: 4,
      exportedAt: new Date().toISOString(),
      match,
      indicators,
      localRecent,
      visitRecent,
      houseMarkets,
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
          <p className="mt-1 text-sm text-slate-300">Rachas + registros reales + líneas de la casa + detector anti-casa</p>
        </header>

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
            <div className="rounded-2xl bg-slate-950/45 p-3"><p className="text-xs text-slate-400">Tarjetas esperadas</p><p className="text-lg font-black">{projection.expectedCards ? projection.expectedCards.toFixed(1) : "—"}</p></div>
            <div className="rounded-2xl bg-slate-950/45 p-3"><p className="text-xs text-slate-400">Bloqueo under</p><p className="text-lg font-black">{matchProfile.blockUnderGoals || matchProfile.blockUnderCorners ? "Activo" : "No"}</p></div>
          </div>
          {matchProfile.notes.length > 0 ? (
            <div className="mt-3 rounded-2xl bg-slate-950/45 p-3 text-sm text-cyan-50">
              {matchProfile.notes.map((note) => <p key={note}>• {note}</p>)}
            </div>
          ) : null}
        </section>

    
    <section className="mb-5 rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">Indicadores SofaScore🧾</h2>
              <p className="text-xs text-slate-300">Carga 3 a 6 señales fuertes. Evita llenar mercados débiles.</p>
            </div>
            <button onClick={addIndicator} className="rounded-2xl bg-gradient-to-r from-sky-300 to-blue-500 px-4 py-3 font-bold text-slate-950 shadow-lg shadow-sky-500/20">+ Agregar indicador</button>
          </div>

          <div className="space-y-3">
            {indicators.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-slate-300">
                Ejemplo: Ambos marcan 5/5, Más de 2.5 goles 8/10, Menos de 10.5 corners 6/7. Agrega cuota casa si la tienes.
              </div>
            ) : null}

            {indicators.map((indicator) => (
              <div key={indicator.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3 shadow-lg">
                <div className="grid gap-2 sm:grid-cols-7">
                  <select value={indicator.team} onChange={(event) => updateIndicator(indicator.id, "team", event.target.value)} className={selectClass}>
                    {TEAM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <select value={indicator.period || "full"} onChange={(event) => updateIndicator(indicator.id, "period", event.target.value)} className={selectClass}>
                    {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <select
                    value={getMarketValue(indicator.market)}
                    onChange={(event) => {
                      const selected = MARKET_OPTIONS.find((option) => option.value === event.target.value);
                      updateIndicator(indicator.id, "market", selected?.value || "");
                      updateIndicator(indicator.id, "line", selected?.line || "");
                    }}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-3 text-white outline-none focus:border-sky-300 sm:col-span-2"
                  >
                    <option value="">Seleccionar mercado</option>
                    {MARKET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <input className={selectClass} placeholder="Línea" value={indicator.line} onChange={(event) => updateIndicator(indicator.id, "line", event.target.value)} />
                  <input className={selectClass} inputMode="text" placeholder="Registro X/X" value={indicator.record} onChange={(event) => updateIndicator(indicator.id, "record", event.target.value)} />
                  <input className={selectClass} inputMode="decimal" placeholder="Cuota casa" value={indicator.houseOdd} onChange={(event) => updateIndicator(indicator.id, "houseOdd", event.target.value)} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-300">
                  <span>{getTeamLabel(indicator.team, match)} · {getPeriodLabel(indicator.period)} · {getMarketLabel(indicator.market)}{indicator.line ? ` · ${indicator.line}` : ""}</span>
                  <button onClick={() => removeIndicator(indicator.id)} className="rounded-xl bg-rose-500 px-4 py-2 font-bold text-white">✖</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-5 rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-4">
            <h2 className="text-2xl font-bold">🏦 Líneas reales de la casa</h2>
            <p className="text-xs text-slate-300">Selecciona la línea disponible y su cuota. El motor compara la línea contra registros reales.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {renderHouseMarket("⚽ Goles", "goalsOverLine", "goalsOverOdd", "goalsUnderLine", "goalsUnderOdd", GOAL_LINES, [...GOAL_LINES].reverse())}
            {renderHouseMarket("🚩 Corners", "cornersOverLine", "cornersOverOdd", "cornersUnderLine", "cornersUnderOdd", CORNER_OVER_LINES, CORNER_UNDER_LINES)}
            {renderHouseMarket("🟨 Tarjetas", "cardsOverLine", "cardsOverOdd", "cardsUnderLine", "cardsUnderOdd", CARD_LINES, [...CARD_LINES].reverse())}
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
                    <span className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">{pick.odd ? pick.odd.toFixed(2) : "Sin cuota"}</span>
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
                    <span className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">{pick.odd ? pick.odd.toFixed(2) : "Sin cuota"}</span>
                  </div>
                ))}
                
              </div>
            </div>
          </div>
          
        </section>
        
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
