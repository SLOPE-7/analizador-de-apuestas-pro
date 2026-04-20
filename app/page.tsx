"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type MatchStage =
  | "Liga"
  | "Fase de grupos"
  | "Playoffs"
  | "16vos"
  | "8vos"
  | "4tos"
  | "Semifinal"
  | "Final";

type MatchType =
  | "Liga"
  | "Ida"
  | "Vuelta"
  | "Partido único"
  | "Clásico"
  | "Copa";

type ResultState = "G" | "E" | "P" | "";
type TeamCondition = "local" | "visitante";
type TeamStyle = "Ofensivo" | "Equilibrado" | "Cerrado" | "Directo" | "Presión alta" | "Mixto";
type RiskLevel = "Bajo" | "Medio" | "Alto";
type NeedLevel = "Alta" | "Media" | "Baja" | "Ninguna";

type TeamRow = {
  rival: string;
  fecha: string;
  gf: number | "";
  gc: number | "";
  ownCorners: number | "";
  oppCorners: number | "";
  ownYellow: number | "";
  oppYellow: number | "";
  ownRed: number | "";
  oppRed: number | "";
  xg: string;
  xgAgainst: string;
  shotsOnTarget: number | "";
  shotsOnTargetAgainst: number | "";
  shots: number | "";
  shotsAgainst: number | "";
  estado: ResultState;
};

type MatchInfo = {
  local: string;
  visitante: string;
  paisLocal: string;
  paisVisitante: string;
  liga: string;
  fecha: string;
  temporada: string;
  grupo: string;
  posicionLocal: number | "";
  posicionVisitante: number | "";
  etapa: MatchStage;
  tipo: MatchType;
  notas: string;
};

type TieContext = {
  esEliminatoria: boolean;
  esPartidoIda: boolean;
  partidoIdaJugado: boolean;
  idaLocalTeam: string;
  idaVisitanteTeam: string;
  idaGFLocal: number | "";
  idaGFVisitante: number | "";
  idaCorners: number | "";
  idaTarjetas: number | "";
  idaXgLocal: string;
  idaXgVisitante: string;
  idaShotsLocal: number | "";
  idaShotsVisitante: number | "";
  idaShotsOnTargetLocal: number | "";
  idaShotsOnTargetVisitante: number | "";
  globalLocal: number | "";
  globalVisitante: number | "";
  necesidadLocal: NeedLevel;
  necesidadVisitante: NeedLevel;
  lecturaManual: string;
};

type RefereeInfo = {
  nombre: string;
  promedioAmarillas: string;
  promedioRojas: string;
  sinConfirmar: boolean;
};

type PickDecision = "selected" | "discarded" | null;

type MatchSupportInfo = {
  possessionLocal: string;
  possessionVisit: string;
  bigChancesLocal: string;
  bigChancesVisit: string;
};

type HeadToHeadInfo = {
  played: boolean;
  fecha: string;
  anteriorLocal: string;
  anteriorVisitante: string;
  golesLocal: number | "";
  golesVisitante: number | "";
  cornersTotal: number | "";
  tarjetasTotal: number | "";
  notas: string;
};

type TeamProfile = {
  teamName: string;
  condition: TeamCondition;
  country: string;
  league: string;
  style: TeamStyle;
  idealMarkets: string;
  notes: string;
  favorite?: boolean;
  rows: TeamRow[];
  savedAt: string;
};


type TeamMeta = {
  style: TeamStyle;
  idealMarkets: string;
  notes: string;
  favorite: boolean;
};

type SavedReferee = {
  nombre: string;
  promedioAmarillas: number;
  promedioRojas: number;
  savedAt: string;
};

type MarketFamily =
  | "result"
  | "doubleChance"
  | "goals"
  | "btts"
  | "corners"
  | "cards"
  | "shots"
  | "shotsOnTarget"
  | "teamGoals"
  | "halftimeGoals";

type MarketLine = {
  id: string;
  family: MarketFamily;
  label: string;
  odd: string;
  line: string;
  direction?: "over" | "under" | "yes" | "no" | "pick";
  side?: "local" | "visitante" | "total";
  enabled: boolean;
};

type SuggestedPick = {
  id: string;
  label: string;
  family: MarketFamily;
  probability: number;
  edge: number;
  implied: number;
  risk: RiskLevel;
  reason: string;
  realConfidence: number;
  tier: "Top" | "Alternativo" | "Agresivo";
  marketPriority: number;
  fallback: boolean;
};

type StatSummary = {
  count: number;
  gfAvg: number;
  gcAvg: number;
  totalGoalsAvg: number;
  totalGoalsWeighted: number;
  ownCornersAvg: number;
  oppCornersAvg: number;
  totalCornersAvg: number;
  totalCornersWeighted: number;
  ownCardsAvg: number;
  oppCardsAvg: number;
  totalCardsAvg: number;
  totalCardsWeighted: number;
  xgAvg: number;
  xgAgainstAvg: number;
  xgWeighted: number;
  xgAgainstWeighted: number;
  shotsAvg: number;
  shotsAgainstAvg: number;
  shotsWeighted: number;
  shotsAgainstWeighted: number;
  shotsOnTargetAvg: number;
  shotsOnTargetAgainstAvg: number;
  shotsOnTargetWeighted: number;
  shotsOnTargetAgainstWeighted: number;
  winPct: number;
  drawPct: number;
  lossPct: number;
  noLosePct: number;
  bttsPct: number;
  over05Pct: number;
  over15Pct: number;
  over25Pct: number;
  under35Pct: number;
  under45Pct: number;
  under55Pct: number;
  cornersOver: Record<string, number>;
  cornersUnder: Record<string, number>;
  cardsOver: Record<string, number>;
  cardsUnder: Record<string, number>;
  freshnessScore: number;
  freshnessLabel: string;
  totalGoalsStd: number;
  cornersStd: number;
  cardsStd: number;
};

const STAGES: MatchStage[] = [
  "Liga",
  "Fase de grupos",
  "Playoffs",
  "16vos",
  "8vos",
  "4tos",
  "Semifinal",
  "Final",
];

const TYPES: MatchType[] = ["Liga", "Ida", "Vuelta", "Partido único", "Clásico", "Copa"];

const NEED_LEVELS: NeedLevel[] = ["Alta", "Media", "Baja", "Ninguna"];
const TEAM_STYLES: TeamStyle[] = ["Ofensivo", "Equilibrado", "Cerrado", "Directo", "Presión alta", "Mixto"];

const TEAM_STORAGE_KEY = "analizador_saved_teams_v2";
const REF_STORAGE_KEY = "analizador_saved_refs_v2";
const DRAFT_STORAGE_KEY = "analizador_match_draft_v3";
const MARKET_STORAGE_KEY = "analizador_market_presets_v1";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function toNumber(value: number | string | "") {
  if (value === "" || value === null || value === undefined) return 0;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return (part / total) * 100;
}

function variance(values: number[]) {
  if (!values.length) return 0;
  const mean = avg(values);
  return avg(values.map((v) => (v - mean) ** 2));
}

function stdDev(values: number[]) {
  return Math.sqrt(variance(values));
}

function impliedProb(odd: number | string | "") {
  if (odd === "") return 0;
  const value = Number(String(odd).replace(",", "."));
  if (!Number.isFinite(value) || value <= 1.0) return 0;
  return 100 / value;
}

function poisson(lambda: number, k: number): number {
  let factorial = 1;
  for (let i = 2; i <= k; i += 1) factorial *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial;
}

function createEmptyRow(): TeamRow {
  return {
    rival: "",
    fecha: "",
    gf: "",
    gc: "",
    ownCorners: "",
    oppCorners: "",
    ownYellow: "",
    oppYellow: "",
    ownRed: "",
    oppRed: "",
    xg: "",
    xgAgainst: "",
    shotsOnTarget: "",
    shotsOnTargetAgainst: "",
    shots: "",
    shotsAgainst: "",
    estado: "",
  };
}

function createEmptyRows() {
  return Array.from({ length: 10 }, () => createEmptyRow());
}

function buildNameSuggestions(savedTeams: TeamProfile[], local: string, visitante: string, localRows: TeamRow[], visitRows: TeamRow[]) {
  const names = new Set<string>();
  savedTeams.forEach((team) => {
    if (team.teamName?.trim()) names.add(team.teamName.trim());
    team.rows?.forEach((row) => {
      if (row.rival?.trim()) names.add(row.rival.trim());
    });
  });
  if (local.trim()) names.add(local.trim());
  if (visitante.trim()) names.add(visitante.trim());
  localRows.forEach((row) => {
    if (row.rival?.trim()) names.add(row.rival.trim());
  });
  visitRows.forEach((row) => {
    if (row.rival?.trim()) names.add(row.rival.trim());
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, "es"));
}

function emptyMatchInfo(): MatchInfo {
  return {
    local: "",
    visitante: "",
    paisLocal: "",
    paisVisitante: "",
    liga: "",
    fecha: "",
    temporada: "",
    grupo: "",
    posicionLocal: "",
    posicionVisitante: "",
    etapa: "Liga",
    tipo: "Liga",
    notas: "",
  };
}

function emptyTieContext(): TieContext {
  return {
    esEliminatoria: false,
    esPartidoIda: false,
    partidoIdaJugado: false,
    idaLocalTeam: "",
    idaVisitanteTeam: "",
    idaGFLocal: "",
    idaGFVisitante: "",
    idaCorners: "",
    idaTarjetas: "",
    idaXgLocal: "",
    idaXgVisitante: "",
    idaShotsLocal: "",
    idaShotsVisitante: "",
    idaShotsOnTargetLocal: "",
    idaShotsOnTargetVisitante: "",
    globalLocal: "",
    globalVisitante: "",
    necesidadLocal: "Ninguna",
    necesidadVisitante: "Ninguna",
    lecturaManual: "",
  };
}

function emptyReferee(): RefereeInfo {
  return {
    nombre: "",
    promedioAmarillas: "",
    promedioRojas: "",
    sinConfirmar: false,
  };
}

function emptyTeamMeta(): TeamMeta {
  return {
    style: "Mixto",
    idealMarkets: "",
    notes: "",
    favorite: false,
  };
}

function downloadJsonFile(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}


function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function classifyPickTier(probability: number, edge: number) {
  if (probability >= 85 && edge >= 8) return { label: "Seguro", badge: "border-emerald-300 bg-emerald-50 text-emerald-800" };
  if (probability >= 72 && edge >= 4) return { label: "Medio", badge: "border-sky-300 bg-sky-50 text-sky-800" };
  return { label: "Agresivo", badge: "border-amber-300 bg-amber-50 text-amber-800" };
}

function createEmptyMatchSupportInfo(): MatchSupportInfo {
  return {
    possessionLocal: "",
    possessionVisit: "",
    bigChancesLocal: "",
    bigChancesVisit: "",
  };
}

function emptyHeadToHeadInfo(): HeadToHeadInfo {
  return {
    played: false,
    fecha: "",
    anteriorLocal: "",
    anteriorVisitante: "",
    golesLocal: "",
    golesVisitante: "",
    cornersTotal: "",
    tarjetasTotal: "",
    notas: "",
  };
}

function resultLabelFromScore(local: number, visit: number, localName: string, visitName: string) {
  if (local > visit) return `${localName} ganó`;
  if (visit > local) return `${visitName} ganó`;
  return "Empataron";
}

function compareDirection(actual: number, expected: number, label: string) {
  const diff = actual - expected;
  if (Math.abs(diff) < 0.35) return `${label} muy alineado con la proyección actual.`;
  if (diff > 0) return `${label} por encima de lo que hoy espera la IA.`;
  return `${label} por debajo de lo que hoy espera la IA.`;
}

function buildTrendSnapshot(rows: TeamRow[]) {
  const valid = rows.filter((r) => r.rival.trim() || r.gf !== "" || r.gc !== "" || r.xg !== "" || r.shots !== "" || r.ownCorners !== "");
  const recent = valid.slice(0, 5);
  const older = valid.slice(5, 10);
  const pack = (set: TeamRow[]) => ({
    goalsFor: avg(set.map((r) => toNumber(r.gf))),
    goalsAgainst: avg(set.map((r) => toNumber(r.gc))),
    xg: avg(set.map((r) => toNumber(r.xg))),
    shots: avg(set.map((r) => toNumber(r.shots))),
    corners: avg(set.map((r) => toNumber(r.ownCorners))),
    pointsRate: avg(set.map((r) => r.estado === "G" ? 3 : r.estado === "E" ? 1 : 0)),
  });
  return { recent: pack(recent), older: pack(older), recentCount: recent.length, olderCount: older.length };
}

function buildImprovementText(teamName: string, trend: ReturnType<typeof buildTrendSnapshot>) {
  if (trend.recentCount < 3 || trend.olderCount < 3) return `${teamName} aún no tiene suficiente muestra para medir mejora real.`;
  const attackDiff = trend.recent.xg - trend.older.xg;
  const defenseDiff = trend.older.goalsAgainst - trend.recent.goalsAgainst;
  const pointsDiff = trend.recent.pointsRate - trend.older.pointsRate;
  const shotsDiff = trend.recent.shots - trend.older.shots;

  const notes: string[] = [];
  if (attackDiff >= 0.2) notes.push("llega generando más peligro");
  else if (attackDiff <= -0.2) notes.push("ha bajado su producción ofensiva");

  if (defenseDiff >= 0.2) notes.push("defiende mejor que antes");
  else if (defenseDiff <= -0.2) notes.push("está concediendo más de lo ideal");

  if (shotsDiff >= 1.5) notes.push("remata con más frecuencia");
  else if (shotsDiff <= -1.5) notes.push("remata menos que en su tramo anterior");

  if (pointsDiff >= 0.35) notes.push("sus resultados recientes son mejores");
  else if (pointsDiff <= -0.35) notes.push("sus resultados recientes se enfriaron");

  if (!notes.length) return `${teamName} llega bastante estable, sin cambio fuerte frente a su tramo anterior.`;
  return `${teamName} ${notes.join(", ")}.`;
}

function decoratePickLabel(label: string, family: MarketFamily, side: "local" | "visitante" | "total" | undefined, local: string, visitante: string) {
  const localName = local.trim() || "Local";
  const visitName = visitante.trim() || "Visitante";

  if (family === "result" || family === "doubleChance" || family === "teamGoals") {
    if (side === "local") return `${label} · ${localName}`;
    if (side === "visitante") return `${label} · ${visitName}`;
  }

  if (family === "goals" || family === "btts" || family === "corners" || family === "cards" || family === "shots" || family === "shotsOnTarget" || family === "halftimeGoals") {
    return `${label} · ${localName} vs ${visitName}`;
  }

  return label;
}

function parseDateDaysAgo(value: string) {
  if (!value.trim()) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function weightedAvgByRecency(values: number[], dates: string[]) {
  if (!values.length) return 0;
  const weights = values.map((_, index) => {
    const age = parseDateDaysAgo(dates[index]);
    const positionWeight = [1.6, 1.48, 1.36, 1.24, 1.12, 1, 0.92, 0.84, 0.76, 0.68][index] ?? 0.68;
    if (age === null) return positionWeight;
    if (age <= 45) return positionWeight * 1.15;
    if (age <= 90) return positionWeight * 1.05;
    if (age <= 180) return positionWeight;
    return positionWeight * 0.8;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return values.reduce((acc, value, index) => acc + value * weights[index], 0) / total;
}

function analyzeRows(rows: TeamRow[]): StatSummary {
  const valid = rows.filter(
    (r) =>
      r.rival.trim() ||
      r.fecha.trim() ||
      r.gf !== "" ||
      r.gc !== "" ||
      r.ownCorners !== "" ||
      r.oppCorners !== "" ||
      r.ownYellow !== "" ||
      r.oppYellow !== "" ||
      r.xg !== "" ||
      r.xgAgainst !== "" ||
      r.shots !== "" ||
      r.shotsAgainst !== "" ||
      r.shotsOnTarget !== "" ||
      r.shotsOnTargetAgainst !== ""
  );

  const count = valid.length;
  if (!count) {
    return {
      count: 0,
      gfAvg: 0,
      gcAvg: 0,
      totalGoalsAvg: 0,
      totalGoalsWeighted: 0,
      ownCornersAvg: 0,
      oppCornersAvg: 0,
      totalCornersAvg: 0,
      totalCornersWeighted: 0,
      ownCardsAvg: 0,
      oppCardsAvg: 0,
      totalCardsAvg: 0,
      totalCardsWeighted: 0,
      xgAvg: 0,
      xgAgainstAvg: 0,
      xgWeighted: 0,
      xgAgainstWeighted: 0,
      shotsAvg: 0,
      shotsAgainstAvg: 0,
      shotsWeighted: 0,
      shotsAgainstWeighted: 0,
      shotsOnTargetAvg: 0,
      shotsOnTargetAgainstAvg: 0,
      shotsOnTargetWeighted: 0,
      shotsOnTargetAgainstWeighted: 0,
      winPct: 0,
      drawPct: 0,
      lossPct: 0,
      noLosePct: 0,
      bttsPct: 0,
      over05Pct: 0,
      over15Pct: 0,
      over25Pct: 0,
      under35Pct: 0,
      under45Pct: 0,
      under55Pct: 0,
      cornersOver: {},
      cornersUnder: {},
      cardsOver: {},
      cardsUnder: {},
      freshnessScore: 0,
      freshnessLabel: "Sin datos",
      totalGoalsStd: 0,
      cornersStd: 0,
      cardsStd: 0,
    };
  }

  const gf = valid.map((r) => toNumber(r.gf));
  const gc = valid.map((r) => toNumber(r.gc));
  const totalGoals = valid.map((r) => toNumber(r.gf) + toNumber(r.gc));
  const ownCorners = valid.map((r) => toNumber(r.ownCorners));
  const oppCorners = valid.map((r) => toNumber(r.oppCorners));
  const totalCorners = valid.map((r) => toNumber(r.ownCorners) + toNumber(r.oppCorners));
  const ownCards = valid.map((r) => toNumber(r.ownYellow) + toNumber(r.ownRed));
  const oppCards = valid.map((r) => toNumber(r.oppYellow) + toNumber(r.oppRed));
  const totalCards = valid.map((r) => toNumber(r.ownYellow) + toNumber(r.oppYellow) + toNumber(r.ownRed) + toNumber(r.oppRed));
  const xg = valid.map((r) => toNumber(r.xg));
  const xgAgainst = valid.map((r) => toNumber(r.xgAgainst));
  const shots = valid.map((r) => toNumber(r.shots));
  const shotsAgainst = valid.map((r) => toNumber(r.shotsAgainst));
  const shotsOnTarget = valid.map((r) => toNumber(r.shotsOnTarget));
  const shotsOnTargetAgainst = valid.map((r) => toNumber(r.shotsOnTargetAgainst));
  const dates = valid.map((r) => r.fecha);
  const ages = dates.map(parseDateDaysAgo).filter((x): x is number => x !== null);
  const avgAge = ages.length ? avg(ages) : 999;
  const freshnessScore = clamp(100 - Math.max(0, avgAge - 45) * 0.35, 35, 100);

  const cornersOver: Record<string, number> = {};
  const cornersUnder: Record<string, number> = {};
  const cardsOver: Record<string, number> = {};
  const cardsUnder: Record<string, number> = {};

  [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5].forEach((line) => {
    cornersOver[String(line)] = pct(totalCorners.filter((v) => v > line).length, count);
    cornersUnder[String(line)] = pct(totalCorners.filter((v) => v < line).length, count);
  });

  [2.5, 3.5, 4.5, 5.5].forEach((line) => {
    cardsOver[String(line)] = pct(totalCards.filter((v) => v > line).length, count);
    cardsUnder[String(line)] = pct(totalCards.filter((v) => v < line).length, count);
  });

  const wins = valid.filter((r) => r.estado === "G").length;
  const draws = valid.filter((r) => r.estado === "E").length;
  const losses = valid.filter((r) => r.estado === "P").length;
  const btts = valid.filter((r) => toNumber(r.gf) > 0 && toNumber(r.gc) > 0).length;

  return {
    count,
    gfAvg: avg(gf),
    gcAvg: avg(gc),
    totalGoalsAvg: avg(totalGoals),
    totalGoalsWeighted: weightedAvgByRecency(totalGoals, dates),
    ownCornersAvg: avg(ownCorners),
    oppCornersAvg: avg(oppCorners),
    totalCornersAvg: avg(totalCorners),
    totalCornersWeighted: weightedAvgByRecency(totalCorners, dates),
    ownCardsAvg: avg(ownCards),
    oppCardsAvg: avg(oppCards),
    totalCardsAvg: avg(totalCards),
    totalCardsWeighted: weightedAvgByRecency(totalCards, dates),
    xgAvg: avg(xg),
    xgAgainstAvg: avg(xgAgainst),
    xgWeighted: weightedAvgByRecency(xg, dates),
    xgAgainstWeighted: weightedAvgByRecency(xgAgainst, dates),
    shotsAvg: avg(shots),
    shotsAgainstAvg: avg(shotsAgainst),
    shotsWeighted: weightedAvgByRecency(shots, dates),
    shotsAgainstWeighted: weightedAvgByRecency(shotsAgainst, dates),
    shotsOnTargetAvg: avg(shotsOnTarget),
    shotsOnTargetAgainstAvg: avg(shotsOnTargetAgainst),
    shotsOnTargetWeighted: weightedAvgByRecency(shotsOnTarget, dates),
    shotsOnTargetAgainstWeighted: weightedAvgByRecency(shotsOnTargetAgainst, dates),
    winPct: pct(wins, count),
    drawPct: pct(draws, count),
    lossPct: pct(losses, count),
    noLosePct: pct(wins + draws, count),
    bttsPct: pct(btts, count),
    over05Pct: pct(totalGoals.filter((v) => v > 0.5).length, count),
    over15Pct: pct(totalGoals.filter((v) => v > 1.5).length, count),
    over25Pct: pct(totalGoals.filter((v) => v > 2.5).length, count),
    under35Pct: pct(totalGoals.filter((v) => v < 3.5).length, count),
    under45Pct: pct(totalGoals.filter((v) => v < 4.5).length, count),
    under55Pct: pct(totalGoals.filter((v) => v < 5.5).length, count),
    cornersOver,
    cornersUnder,
    cardsOver,
    cardsUnder,
    freshnessScore,
    freshnessLabel: freshnessScore >= 80 ? "Buena" : freshnessScore >= 65 ? "Aceptable" : "Vieja",
    totalGoalsStd: stdDev(totalGoals),
    cornersStd: stdDev(totalCorners),
    cardsStd: stdDev(totalCards),
  };
}

function probabilityFromLambdaOver(lambda: number, line: number) {
  const floor = Math.floor(line);
  let cumulative = 0;
  for (let k = 0; k <= floor; k += 1) cumulative += poisson(lambda, k);
  return clamp((1 - cumulative) * 100, 0, 100);
}

function probabilityFromLambdaUnder(lambda: number, line: number) {
  const floor = Math.floor(line);
  let cumulative = 0;
  for (let k = 0; k <= floor; k += 1) cumulative += poisson(lambda, k);
  return clamp(cumulative * 100, 0, 100);
}

function probabilityByHeuristic(expected: number, line: number, scale: number, direction: "over" | "under") {
  const z = (expected - line) / scale;
  const logistic = 1 / (1 + Math.exp(-1.35 * z));
  const over = logistic * 100;
  return direction === "over" ? clamp(over, 1, 99) : clamp(100 - over, 1, 99);
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function riskByProbability(probability: number): RiskLevel {
  if (probability >= 71) return "Bajo";
  if (probability >= 60) return "Medio";
  return "Alto";
}

function getMarketFamilyLabel(family: MarketFamily) {
  switch (family) {
    case "result":
      return "resultado";
    case "doubleChance":
      return "doble oportunidad";
    case "goals":
      return "goles";
    case "btts":
      return "ambos marcan";
    case "corners":
      return "corners";
    case "cards":
      return "tarjetas";
    case "shots":
      return "disparos";
    case "shotsOnTarget":
      return "a puerta";
    case "teamGoals":
      return "goles por equipo";
    case "halftimeGoals":
      return "goles por mitad";
    default:
      return family;
  }
}


function classifyMatchType(params: {
  expectedTotalShots: number;
  expectedTotalShotsOnTarget: number;
  expectedGoalsLocal: number;
  expectedGoalsVisit: number;
  expectedTotalGoals: number;
}) {
  const {
    expectedTotalShots,
    expectedTotalShotsOnTarget,
    expectedGoalsLocal,
    expectedGoalsVisit,
    expectedTotalGoals,
  } = params;

  const goalGap = Math.abs(expectedGoalsLocal - expectedGoalsVisit);

  if (expectedTotalShots >= 25 && expectedTotalShotsOnTarget >= 8) {
    return {
      label: "Partido abierto",
      description: "Mucho volumen ofensivo y ritmo alto. Favorece overs y BTTS.",
    };
  }

  if (expectedTotalShots <= 14 && expectedTotalShotsOnTarget <= 4 && expectedTotalGoals <= 2.2) {
    return {
      label: "Partido cerrado",
      description: "Poco ritmo, poca llegada y más valor en unders o no bet.",
    };
  }

  if (goalGap >= 0.8) {
    return {
      label: "Partido desigual",
      description: "Hay ventaja clara de un lado. Favorece ganador o goles por equipo.",
    };
  }

  return {
    label: "Partido equilibrado",
    description: "Choque más parejo. Conviene evitar 1x2 agresivo.",
  };
}

function getMarketPriority(
  family: MarketFamily,
  localTags: string[],
  visitTags: string[],
  matchTypeLabel: string
) {
  const tags = [...localTags, ...visitTags].join(" ").toLowerCase();
  let score = 0;

  if (family === "goals" || family === "teamGoals" || family === "btts" || family === "halftimeGoals") {
    if (tags.includes("goleador")) score += 18;
    if (tags.includes("recibe goles")) score += 14;
    if (matchTypeLabel === "Partido abierto") score += 14;
    if (matchTypeLabel === "Partido cerrado") score -= 12;
  }

  if (family === "corners") {
    if (tags.includes("alto en corners")) score += 20;
    if (tags.includes("bajo en corners")) score -= 10;
  }

  if (family === "cards") {
    if (tags.includes("alto en tarjetas")) score += 18;
    if (tags.includes("bajo en tarjetas")) score -= 18;
  }

  if (family === "result" || family === "doubleChance") {
    if (tags.includes("gana constante")) score += 12;
    if (tags.includes("pierde seguido")) score += 8;
    if (matchTypeLabel === "Partido equilibrado") score -= 12;
    if (matchTypeLabel === "Partido desigual") score += 10;
  }

  if (family === "shots" || family === "shotsOnTarget") {
    if (tags.includes("remata con frecuencia")) score += 16;
    if (tags.includes("conservador")) score -= 10;
  }

  return score;
}

function getRealConfidence(probability: number, qualityScore: number, volatilityLabel: string, edge: number) {
  const qualityFactor = qualityScore / 100;
  const volatilityFactor = volatilityLabel === "Alta" ? 0.76 : volatilityLabel === "Media" ? 0.9 : 1;
  const edgeFactor = edge >= 10 ? 1.08 : edge >= 6 ? 1.03 : 0.96;
  return clamp(probability * qualityFactor * volatilityFactor * edgeFactor, 0, 100);
}

function getTier(realConfidence: number, edge: number): "Top" | "Alternativo" | "Agresivo" {
  if (realConfidence >= 67 && edge >= 6) return "Top";
  if (realConfidence >= 58 && edge >= 4) return "Alternativo";
  return "Agresivo";
}




function buildFallbackReason(reason: string) {
  return `${reason} · Pick de respaldo: el partido no dio una señal top, pero sí una lectura utilizable.`;
}


function buildTeamTags(stats: StatSummary): string[] {
  if (!stats.count) return [];
  const tags: string[] = [];
  if (stats.winPct >= 58) tags.push("Gana constante");
  else if (stats.drawPct >= 34) tags.push("Empata mucho");
  else if (stats.lossPct >= 50) tags.push("Pierde seguido");

  if (stats.gfAvg >= 1.65 || stats.xgWeighted >= 1.55) tags.push("Goleador");
  if (stats.gcAvg >= 1.35 || stats.xgAgainstWeighted >= 1.45) tags.push("Recibe goles");
  if (stats.totalCardsWeighted >= 4.4) tags.push("Alto en tarjetas");
  if (stats.totalCardsWeighted <= 3.0 && stats.count >= 4) tags.push("Bajo en tarjetas");
  if (stats.totalCornersWeighted >= 9.0) tags.push("Alto en corners");
  if (stats.totalCornersWeighted <= 7.0 && stats.count >= 4) tags.push("Bajo en corners");
  if (stats.shotsWeighted >= 12 || stats.shotsOnTargetWeighted >= 4.5) tags.push("Remata con frecuencia");
  if (stats.shotsWeighted <= 8.5 && stats.totalGoalsWeighted <= 2.2) tags.push("Conservador");
  if (stats.noLosePct >= 70) tags.push("No pierde fácil");
  return tags;
}


function getCategoryScore(category: string, stats: StatSummary) {
  switch (category) {
    case "Ganador":
      return stats.winPct + stats.noLosePct * 0.35;
    case "Empate":
      return stats.drawPct;
    case "Pierde":
      return stats.lossPct;
    case "Goleador":
      return stats.gfAvg * 18 + stats.xgWeighted * 16;
    case "Recibe goles":
      return stats.gcAvg * 18 + stats.xgAgainstWeighted * 14;
    case "Corners":
      return stats.totalCornersWeighted * 8 + stats.ownCornersAvg * 6;
    case "Tarjetas":
      return stats.totalCardsWeighted * 10;
    case "Remates":
      return stats.shotsWeighted * 7;
    case "A puerta":
      return stats.shotsOnTargetWeighted * 15;
    default:
      return 0;
  }
}

function topThreeTags(tags: string[]) {
  return tags.slice(0, 3);
}

function tagClass(tag: string) {
  if (tag.includes("Gana") || tag.includes("Goleador") || tag.includes("Remata")) return "border-emerald-400 bg-emerald-100 text-emerald-950";
  if (tag.includes("Empata") || tag.includes("Conservador") || tag.includes("No pierde")) return "border-sky-400 bg-sky-100 text-sky-950";
  if (tag.includes("Pierde") || tag.includes("Recibe")) return "border-rose-400 bg-rose-100 text-rose-950";
  if (tag.includes("tarjetas")) return "border-amber-400 bg-amber-100 text-amber-950";
  if (tag.includes("corners")) return "border-violet-400 bg-violet-100 text-violet-950";
  return "border-slate-400 bg-slate-100 text-slate-900";
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/95 p-4 shadow-sm shadow-slate-950/20">
      <div className="text-xs font-semibold uppercase tracking-wide text-white">{title}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {subtitle ? <div className="mt-1 text-sm text-white">{subtitle}</div> : null}
    </div>
  );
}


function Section({ title, children, subtitle }: { title: string; children: React.ReactNode; subtitle?: string }) {
  return (
    <section className="rounded-3xl border border-slate-700/60 bg-slate-900/95 p-5 shadow-sm shadow-slate-950/20">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-white">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}


function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  list,
}: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  list?: string;
}) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      list={list}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 outline-none ring-0 transition focus:border-sky-500"
    />
  );
}


function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 outline-none transition focus:border-sky-500"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}


function TextArea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 outline-none transition focus:border-sky-500"
    />
  );
}


export default function Page() {
  const [matchInfo, setMatchInfo] = useState<MatchInfo>(emptyMatchInfo());
  const [tieContext, setTieContext] = useState<TieContext>(emptyTieContext());
  const [refInfo, setRefInfo] = useState<RefereeInfo>(emptyReferee());
  const [localRows, setLocalRows] = useState<TeamRow[]>(createEmptyRows());
  const [visitRows, setVisitRows] = useState<TeamRow[]>(createEmptyRows());
  const [savedTeams, setSavedTeams] = useState<TeamProfile[]>([]);
  const [savedRefs, setSavedRefs] = useState<SavedReferee[]>([]);
  const [localMeta, setLocalMeta] = useState<TeamMeta>(emptyTeamMeta());
  const [visitMeta, setVisitMeta] = useState<TeamMeta>(emptyTeamMeta());
  const [marketLines, setMarketLines] = useState<MarketLine[]>([]);
  const importFullRef = useRef<HTMLInputElement | null>(null);
  const importLocalRef = useRef<HTMLInputElement | null>(null);
  const importVisitRef = useRef<HTMLInputElement | null>(null);
  const importRefereeRef = useRef<HTMLInputElement | null>(null);
  const [marketPresetName, setMarketPresetName] = useState("");
  const [minEdge, setMinEdge] = useState(3);
  const [minProb, setMinProb] = useState(56);
  const [pickDecisions, setPickDecisions] = useState<Record<string, PickDecision>>({});
  const [matchSupportInfo, setMatchSupportInfo] = useState<MatchSupportInfo>(createEmptyMatchSupportInfo());
  const [headToHeadInfo, setHeadToHeadInfo] = useState<HeadToHeadInfo>(emptyHeadToHeadInfo());
  const [savedPresets, setSavedPresets] = useState<string[]>([]);

const resetAll = () => {
  if (!window.confirm("¿Seguro que quieres limpiar todo el partido actual?")) return;
  setMatchInfo(emptyMatchInfo());
  setTieContext(emptyTieContext());
  setRefInfo(emptyReferee());

  setLocalRows(createEmptyRows());
  setVisitRows(createEmptyRows());

  setLocalMeta(emptyTeamMeta());
  setVisitMeta(emptyTeamMeta());

  setMarketLines([]);
  setPickDecisions({});
  setMatchSupportInfo(createEmptyMatchSupportInfo());
  setHeadToHeadInfo(emptyHeadToHeadInfo());

  setMinProb(56);
  setMinEdge(3);
};

  useEffect(() => {
    setSavedTeams(safeParse(localStorage.getItem(TEAM_STORAGE_KEY), []));
    setSavedRefs(safeParse(localStorage.getItem(REF_STORAGE_KEY), []));
    setSavedPresets(Object.keys(safeParse<Record<string, MarketLine[]>>(localStorage.getItem(MARKET_STORAGE_KEY), {})));

    const draft = safeParse<{
      matchInfo: MatchInfo;
      tieContext: TieContext;
      refInfo: RefereeInfo;
      localRows: TeamRow[];
      visitRows: TeamRow[];
      localMeta: TeamMeta;
      visitMeta: TeamMeta;
      marketLines: MarketLine[];
      minEdge: number;
      minProb: number;
      pickDecisions: Record<string, PickDecision>;
      matchSupportInfo: MatchSupportInfo;
      headToHeadInfo: HeadToHeadInfo;
    } | null>(localStorage.getItem(DRAFT_STORAGE_KEY), null);

    if (draft) {
      setMatchInfo(draft.matchInfo ?? emptyMatchInfo());
      setTieContext({ ...emptyTieContext(), ...(draft.tieContext ?? {}) });
      setRefInfo({ ...emptyReferee(), ...(draft.refInfo ?? {}) });
      setLocalRows(draft.localRows ?? createEmptyRows());
      setVisitRows(draft.visitRows ?? createEmptyRows());
      setLocalMeta({ ...emptyTeamMeta(), ...(draft.localMeta ?? {}) });
      setVisitMeta({ ...emptyTeamMeta(), ...(draft.visitMeta ?? {}) });
      setMarketLines(draft.marketLines ?? []);
      setMinEdge(draft.minEdge ?? 3);
      setMinProb(draft.minProb ?? 56);
      setPickDecisions(draft.pickDecisions ?? {});
      setMatchSupportInfo(draft.matchSupportInfo ?? createEmptyMatchSupportInfo());
      setHeadToHeadInfo(draft.headToHeadInfo ?? emptyHeadToHeadInfo());
    } else {
      setMarketLines(buildDefaultMarketLines());
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        matchInfo,
        tieContext,
        refInfo,
        localRows,
        visitRows,
        localMeta,
        visitMeta,
        marketLines,
        minEdge,
        minProb,
        pickDecisions,
        matchSupportInfo,
        headToHeadInfo,
      })
    );
  }, [matchInfo, tieContext, refInfo, localRows, visitRows, localMeta, visitMeta, marketLines, minEdge, minProb, pickDecisions, matchSupportInfo, headToHeadInfo]);

  const localStats = useMemo(() => analyzeRows(localRows), [localRows]);
  const visitStats = useMemo(() => analyzeRows(visitRows), [visitRows]);
  const localTags = useMemo(() => buildTeamTags(localStats), [localStats]);
  const visitTags = useMemo(() => buildTeamTags(visitStats), [visitStats]);

  const qualityScore = useMemo(() => {
    const sampleScore = clamp(((localStats.count + visitStats.count) / 20) * 100, 0, 100);
    const freshness = avg([localStats.freshnessScore, visitStats.freshnessScore]);
    const shotCoverage = [localStats.shotsWeighted, visitStats.shotsWeighted, localStats.shotsOnTargetWeighted, visitStats.shotsOnTargetWeighted].filter((v) => v > 0).length;
    const shotsScore = shotCoverage >= 4 ? 100 : shotCoverage >= 2 ? 70 : 40;
    const refereeScore = refInfo.sinConfirmar ? 70 : refInfo.nombre.trim() && refInfo.promedioAmarillas !== "" ? 100 : 55;
    return clamp(sampleScore * 0.35 + freshness * 0.3 + shotsScore * 0.2 + refereeScore * 0.15, 0, 100);
  }, [localStats, visitStats, refInfo]);

  const expectedGoalsLocal = useMemo(() => {
    let value = localStats.xgWeighted > 0 || visitStats.xgAgainstWeighted > 0
      ? localStats.xgWeighted * 0.62 + visitStats.xgAgainstWeighted * 0.38
      : localStats.gfAvg * 0.58 + visitStats.gcAvg * 0.42;

    if (matchInfo.posicionLocal !== "" && matchInfo.posicionVisitante !== "") {
      value += clamp((Number(matchInfo.posicionVisitante) - Number(matchInfo.posicionLocal)) * 0.025, -0.25, 0.35);
    }
    if (tieContext.necesidadLocal === "Alta") value += 0.18;
    if (tieContext.necesidadVisitante === "Alta") value -= 0.06;
    return clamp(value, 0.15, 4.2);
  }, [localStats, visitStats, matchInfo.posicionLocal, matchInfo.posicionVisitante, tieContext.necesidadLocal, tieContext.necesidadVisitante]);

  const expectedGoalsVisit = useMemo(() => {
    let value = visitStats.xgWeighted > 0 || localStats.xgAgainstWeighted > 0
      ? visitStats.xgWeighted * 0.62 + localStats.xgAgainstWeighted * 0.38
      : visitStats.gfAvg * 0.58 + localStats.gcAvg * 0.42;

    if (matchInfo.posicionLocal !== "" && matchInfo.posicionVisitante !== "") {
      value += clamp((Number(matchInfo.posicionLocal) - Number(matchInfo.posicionVisitante)) * 0.025, -0.25, 0.35);
    }
    if (tieContext.necesidadVisitante === "Alta") value += 0.18;
    if (tieContext.necesidadLocal === "Alta") value -= 0.06;
    return clamp(value, 0.15, 4.2);
  }, [visitStats, localStats, matchInfo.posicionLocal, matchInfo.posicionVisitante, tieContext.necesidadVisitante, tieContext.necesidadLocal]);

  const expectedTotalGoals = expectedGoalsLocal + expectedGoalsVisit;
  const expectedTotalShots = clamp(localStats.shotsWeighted * 0.55 + visitStats.shotsWeighted * 0.55, 8, 35);
  const expectedTotalCorners = useMemo(() => {
    const production = localStats.ownCornersAvg * 0.34 + visitStats.ownCornersAvg * 0.34;
    const concession = localStats.oppCornersAvg * 0.16 + visitStats.oppCornersAvg * 0.16;
    const tempoPenalty = expectedTotalShots < 18 ? 0.45 : 0;
    const needBoost = (tieContext.necesidadLocal === "Alta" ? 0.18 : 0) + (tieContext.necesidadVisitante === "Alta" ? 0.18 : 0);
    return clamp(production + concession + needBoost - tempoPenalty, 4.5, 12.5);
  }, [
    localStats.ownCornersAvg,
    visitStats.ownCornersAvg,
    localStats.oppCornersAvg,
    visitStats.oppCornersAvg,
    tieContext.necesidadLocal,
    tieContext.necesidadVisitante,
    expectedTotalShots,
  ]);

  const expectedTotalCards = useMemo(() => {
    const refBoost = refInfo.sinConfirmar || refInfo.promedioAmarillas === "" ? 0 : Number(refInfo.promedioAmarillas) * 0.4;
    const intensityBoost = tieContext.esEliminatoria ? 0.45 : 0;
    return clamp(localStats.totalCardsWeighted * 0.5 + visitStats.totalCardsWeighted * 0.5 + refBoost * 0.35 + intensityBoost, 1.5, 9);
  }, [localStats.totalCardsWeighted, visitStats.totalCardsWeighted, refInfo.promedioAmarillas, tieContext.esEliminatoria]);

  const expectedTotalShotsOnTarget = clamp(localStats.shotsOnTargetWeighted * 0.55 + visitStats.shotsOnTargetWeighted * 0.55, 2, 14);
  const expectedLocalTeamGoals = clamp(expectedGoalsLocal, 0.1, 4);
  const expectedVisitTeamGoals = clamp(expectedGoalsVisit, 0.1, 4);
  const expectedHalftimeGoals = clamp(expectedTotalGoals * 0.44, 0.1, 3.2);

  const simulation = useMemo(() => {
    let localWin = 0;
    let draw = 0;
    let awayWin = 0;
    let over15 = 0;
    let over25 = 0;
    let btts = 0;

    for (let l = 0; l <= 6; l += 1) {
      for (let v = 0; v <= 6; v += 1) {
        const p = poisson(expectedGoalsLocal, l) * poisson(expectedGoalsVisit, v);
        if (l > v) localWin += p;
        else if (l === v) draw += p;
        else awayWin += p;
        if (l + v > 1) over15 += p;
        if (l + v > 2) over25 += p;
        if (l > 0 && v > 0) btts += p;
      }
    }

    return {
      localWin: localWin * 100,
      draw: draw * 100,
      awayWin: awayWin * 100,
      over15: over15 * 100,
      over25: over25 * 100,
      btts: btts * 100,
    };
  }, [expectedGoalsLocal, expectedGoalsVisit]);

  const volatilityScore = useMemo(() => {
    return (
      avg([localStats.totalGoalsStd, visitStats.totalGoalsStd]) * 18 +
      avg([localStats.cornersStd, visitStats.cornersStd]) * 6 +
      avg([localStats.cardsStd, visitStats.cardsStd]) * 8
    );
  }, [localStats, visitStats]);

  const volatilityLabel = volatilityScore >= 40 ? "Alta" : volatilityScore >= 28 ? "Media" : "Baja";
  const shotBoostInfo = useMemo(() => {
    let boost = 0;
    let bttsBoost = 0;
    const reasons: string[] = [];

    if (expectedTotalShots >= 24) {
      boost += 0.25;
      reasons.push("Volumen alto de disparos.");
    }
    if (expectedTotalShots >= 28) {
      boost += 0.22;
      bttsBoost += 4;
      reasons.push("Disparos muy altos para un partido abierto.");
    }
    if (expectedTotalShotsOnTarget >= 8) {
      boost += 0.18;
      bttsBoost += 4;
      reasons.push("Muchos remates a puerta esperados.");
    }
    if (expectedTotalShotsOnTarget >= 10) {
      boost += 0.20;
      bttsBoost += 5;
      reasons.push("Remates a puerta muy altos.");
    }
    if (expectedTotalCards >= 4.5) {
      boost += 0.14;
      reasons.push("Intensidad alta por tarjetas.");
    }
    if (localStats.shotsWeighted >= 12 && visitStats.shotsWeighted >= 9.5) {
      boost += 0.16;
      bttsBoost += 4;
      reasons.push("Ambos equipos generan disparos.");
    }
    if (localStats.shotsOnTargetWeighted >= 3.8 && visitStats.shotsOnTargetWeighted >= 3.2) {
      boost += 0.16;
      bttsBoost += 5;
      reasons.push("Ambos equipos pisan zona de remate.");
    }
    if (localStats.xgWeighted >= 1.2 && visitStats.xgWeighted >= 1.0) {
      boost += 0.12;
      bttsBoost += 4;
      reasons.push("Ambos equipos sostienen xG razonable.");
    }

    // Castigo para partidos con corners absurdamente bajos que suelen cortar ritmo ofensivo real
    if (expectedTotalCorners <= 5.2) {
      boost -= 0.16;
      reasons.push("Corners muy bajos: se enfría un poco el over.");
    }

    const total = clamp(boost, -0.2, 1.15);
    return {
      total,
      bttsBoost: clamp(bttsBoost, 0, 18),
      adjustedGoals: clamp(expectedTotalGoals + total, 0.2, 6.4),
      active: total >= 0.25,
      reasons,
    };
  }, [
    expectedTotalGoals,
    expectedTotalShots,
    expectedTotalShotsOnTarget,
    expectedTotalCards,
    expectedTotalCorners,
    localStats.shotsWeighted,
    visitStats.shotsWeighted,
    localStats.shotsOnTargetWeighted,
    visitStats.shotsOnTargetWeighted,
  ]);


  const automaticEliminationText = useMemo(() => {
    if (!tieContext.esEliminatoria) return "";
    if (tieContext.globalLocal === "" || tieContext.globalVisitante === "") return "";

    const localGlobal = Number(tieContext.globalLocal);
    const visitGlobal = Number(tieContext.globalVisitante);

    if (localGlobal < visitGlobal) {
      return "Local obligado a ganar / Visitante puede controlar";
    }
    if (visitGlobal < localGlobal) {
      return "Visitante obligado a ganar / Local puede controlar";
    }
    return "Global empatado / Ambos necesitan competir";
  }, [tieContext.esEliminatoria, tieContext.globalLocal, tieContext.globalVisitante]);

  const needReading = useMemo(() => {
    const notes: string[] = [];
    if (!tieContext.esEliminatoria) {
      return { label: "Sin necesidad especial", notes: ["Partido normal o de liga."] };
    }

    if (tieContext.globalLocal !== "" && tieContext.globalVisitante !== "") {
      const diff = Number(tieContext.globalLocal) - Number(tieContext.globalVisitante);
      if (diff < 0) notes.push(`${matchInfo.local || "El local"} llega abajo en el global.`);
      if (diff > 0) notes.push(`${matchInfo.visitante || "El visitante"} llega abajo en el global.`);
      if (diff === 0) notes.push("El global está empatado.");
    }

    if (tieContext.partidoIdaJugado) {
      notes.push("Se cargó información de la ida para contextualizar el ritmo.");
    }

    notes.push(`Necesidad local: ${tieContext.necesidadLocal}.`);
    notes.push(`Necesidad visitante: ${tieContext.necesidadVisitante}.`);

    return {
      label:
        tieContext.necesidadLocal === "Alta" || tieContext.necesidadVisitante === "Alta"
          ? "Eliminatoria con urgencia"
          : "Eliminatoria controlada",
      notes,
    };
  }, [tieContext, matchInfo.local, matchInfo.visitante]);

  const matchTypeInfo = useMemo(() => {
    return classifyMatchType({
      expectedTotalShots,
      expectedTotalShotsOnTarget,
      expectedGoalsLocal,
      expectedGoalsVisit,
      expectedTotalGoals,
    });
  }, [expectedTotalShots, expectedTotalShotsOnTarget, expectedGoalsLocal, expectedGoalsVisit, expectedTotalGoals]);

  const noBetReasons = useMemo(() => {
    const reasons: string[] = [];
    if (qualityScore < 62) reasons.push("La calidad de datos es baja.");
    if (volatilityLabel === "Alta" && Math.max(simulation.localWin, simulation.awayWin) < 58) reasons.push("La volatilidad es alta y no hay dominador claro.");
    if (simulation.draw >= 31) reasons.push("El empate está demasiado alto.");
    if (marketLines.filter((m) => m.enabled && m.odd !== "").length === 0) reasons.push("No has cargado líneas reales de la casa.");
    if (matchTypeInfo.label === "Partido equilibrado" && simulation.draw >= 28) reasons.push("El partido se ve demasiado parejo para entrar fuerte a ganador.");
    if (matchTypeInfo.label === "Partido cerrado" && expectedTotalGoals <= 2.1 && expectedTotalShotsOnTarget <= 4.5) reasons.push("El ritmo ofensivo es demasiado bajo.");
    return reasons;
  }, [qualityScore, volatilityLabel, simulation.localWin, simulation.awayWin, simulation.draw, marketLines, matchTypeInfo, expectedTotalGoals, expectedTotalShotsOnTarget]);

  const hardNoBet = noBetReasons.length >= 3;

  const localTrend = useMemo(() => buildTrendSnapshot(localRows), [localRows]);
  const visitTrend = useMemo(() => buildTrendSnapshot(visitRows), [visitRows]);

  const headToHeadAnalysis = useMemo(() => {
    if (!headToHeadInfo.played || headToHeadInfo.golesLocal === "" || headToHeadInfo.golesVisitante === "") {
      return {
        available: false,
        previousWinner: "Sin duelo cargado",
        projectedWinner: simulation.localWin > simulation.awayWin + 6
          ? `${matchInfo.local || "Local"} perfila mejor hoy`
          : simulation.awayWin > simulation.localWin + 6
          ? `${matchInfo.visitante || "Visitante"} perfila mejor hoy`
          : "Hoy el modelo ve choque parejo",
        previousGoals: 0,
        previousCorners: 0,
        previousCards: 0,
        goalsText: "Carga un duelo anterior para comparar goles.",
        cornersText: "Carga un duelo anterior para comparar corners.",
        cardsText: "Carga un duelo anterior para comparar tarjetas.",
        outcomeText: "Aquí se comparará el ganador anterior contra la lectura actual.",
        improvementTextLocal: buildImprovementText(matchInfo.local || "Local", localTrend),
        improvementTextVisit: buildImprovementText(matchInfo.visitante || "Visitante", visitTrend),
        prepText: "La preparación se leerá según forma reciente, xG, tiros y resultados de cada tramo.",
      };
    }

    const prevLocal = Number(headToHeadInfo.golesLocal);
    const prevVisit = Number(headToHeadInfo.golesVisitante);
    const previousGoals = prevLocal + prevVisit;
    const previousCorners = headToHeadInfo.cornersTotal === "" ? 0 : Number(headToHeadInfo.cornersTotal);
    const previousCards = headToHeadInfo.tarjetasTotal === "" ? 0 : Number(headToHeadInfo.tarjetasTotal);
    const previousWinner = resultLabelFromScore(prevLocal, prevVisit, headToHeadInfo.anteriorLocal || "Local", headToHeadInfo.anteriorVisitante || "Visitante");

    const projectedWinner = simulation.localWin > simulation.awayWin + 6
      ? `${matchInfo.local || "Local"} gana el próximo duelo en la lectura IA`
      : simulation.awayWin > simulation.localWin + 6
      ? `${matchInfo.visitante || "Visitante"} gana el próximo duelo en la lectura IA`
      : "La IA ve un partido mucho más equilibrado ahora";

    const outcomeText = (() => {
      const sameLocal = headToHeadInfo.anteriorLocal.trim().toLowerCase() === (matchInfo.local || "").trim().toLowerCase();
      const sameVisit = headToHeadInfo.anteriorVisitante.trim().toLowerCase() === (matchInfo.visitante || "").trim().toLowerCase();
      if (!sameLocal || !sameVisit) return "El último duelo cargado tiene local/visitante invertido o distinto, úsalo solo como referencia contextual.";
      if (prevLocal > prevVisit && simulation.localWin >= simulation.awayWin) return `${matchInfo.local || "Local"} ganó el duelo anterior y también llega mejor parado hoy.`;
      if (prevVisit > prevLocal && simulation.awayWin >= simulation.localWin) return `${matchInfo.visitante || "Visitante"} ganó el duelo anterior y vuelve a sostener ventaja en la proyección.`;
      if (prevLocal > prevVisit && simulation.awayWin > simulation.localWin + 4) return `${matchInfo.local || "Local"} ganó antes, pero hoy la lectura se mueve hacia ${matchInfo.visitante || "Visitante"}.`;
      if (prevVisit > prevLocal && simulation.localWin > simulation.awayWin + 4) return `${matchInfo.visitante || "Visitante"} ganó antes, pero hoy la lectura se mueve hacia ${matchInfo.local || "Local"}.`;
      return "El antecedente y la proyección actual no se alinean del todo; cuidado con sobrevalorar el choque previo.";
    })();

    const localImprove = buildImprovementText(matchInfo.local || "Local", localTrend);
    const visitImprove = buildImprovementText(matchInfo.visitante || "Visitante", visitTrend);
    const prepText = (() => {
      const localMomentum = localTrend.recent.pointsRate - localTrend.older.pointsRate;
      const visitMomentum = visitTrend.recent.pointsRate - visitTrend.older.pointsRate;
      if (localMomentum >= 0.35 && visitMomentum <= -0.2) return `${matchInfo.local || "Local"} parece llegar mejor preparado por forma y resultados recientes.`;
      if (visitMomentum >= 0.35 && localMomentum <= -0.2) return `${matchInfo.visitante || "Visitante"} parece llegar mejor preparado por forma y resultados recientes.`;
      if (localTrend.recent.xg > visitTrend.recent.xg + 0.25 && localTrend.recent.shots > visitTrend.recent.shots + 1.5) return `${matchInfo.local || "Local"} llega con mejor preparación ofensiva en su tramo reciente.`;
      if (visitTrend.recent.xg > localTrend.recent.xg + 0.25 && visitTrend.recent.shots > localTrend.recent.shots + 1.5) return `${matchInfo.visitante || "Visitante"} llega con mejor preparación ofensiva en su tramo reciente.`;
      return "Ambos llegan con preparación relativamente pareja; pesa más la lectura del partido actual que el recuerdo del choque anterior.";
    })();

    return {
      available: true,
      previousWinner,
      projectedWinner,
      previousGoals,
      previousCorners,
      previousCards,
      goalsText: compareDirection(previousGoals, expectedTotalGoals, `El duelo anterior dejó ${previousGoals} goles`),
      cornersText: previousCorners ? compareDirection(previousCorners, expectedTotalCorners, `El duelo anterior dejó ${previousCorners} corners`) : "No cargaste corners del duelo anterior.",
      cardsText: previousCards ? compareDirection(previousCards, expectedTotalCards, `El duelo anterior dejó ${previousCards} tarjetas`) : "No cargaste tarjetas del duelo anterior.",
      outcomeText,
      improvementTextLocal: localImprove,
      improvementTextVisit: visitImprove,
      prepText,
    };
  }, [headToHeadInfo, simulation.localWin, simulation.awayWin, matchInfo.local, matchInfo.visitante, localTrend, visitTrend, expectedTotalGoals, expectedTotalCorners, expectedTotalCards]);

  const suggestedPicks = useMemo(() => {
    if (hardNoBet) return [];

    const candidates: SuggestedPick[] = [];

    function addCandidate(line: MarketLine, probability: number, reason: string) {
      const implied = impliedProb(line.odd);
      const edge = probability - implied;
      if (line.odd === "" || !line.enabled) return;

      const normalizedLabel = line.label.toLowerCase();
      if (normalizedLabel.includes("más de 0.5 goles")) return;
      if (normalizedLabel.includes("menos de 5.5 goles")) return;
      if (normalizedLabel.includes("menos de 4.5 goles") && matchTypeInfo.label === "Partido abierto") return;

      const primaryMinProb = minProb;
      const primaryMinEdge = minEdge;
      const fallbackMinProb = Math.max(53, minProb - 3);
      const fallbackMinEdge = Math.max(2, minEdge - 1.5);
      const passesPrimary = probability >= primaryMinProb && edge >= primaryMinEdge;
      const passesFallback = probability >= fallbackMinProb && edge >= fallbackMinEdge;

      if (!passesFallback) return;

      const marketPriority = getMarketPriority(line.family, localTags, visitTags, matchTypeInfo.label);
      const realConfidence = getRealConfidence(probability, qualityScore, volatilityLabel, edge);
      const fallback = !passesPrimary;
      const tier = fallback ? "Alternativo" : getTier(realConfidence, edge);

      if ((!fallback && realConfidence < 54) || (fallback && realConfidence < 50)) return;

      candidates.push({
        id: line.id,
        label: decoratePickLabel(line.label, line.family, line.side, matchInfo.local, matchInfo.visitante),
        family: line.family,
        probability,
        edge,
        implied,
        risk: riskByProbability(probability),
        reason: fallback ? buildFallbackReason(reason) : reason,
        realConfidence,
        tier,
        marketPriority,
        fallback,
      });
    }

    const openGameProfile =
      shotBoostInfo.adjustedGoals >= 2.65 &&
      expectedTotalShots >= 24 &&
      expectedTotalShotsOnTarget >= 8;

    const localShotDominance =
      localStats.shotsWeighted - visitStats.shotsWeighted >= 3.5 &&
      localStats.shotsOnTargetWeighted - visitStats.shotsOnTargetWeighted >= 1.2;

    const visitShotDominance =
      visitStats.shotsWeighted - localStats.shotsWeighted >= 3.5 &&
      visitStats.shotsOnTargetWeighted - localStats.shotsOnTargetWeighted >= 1.2;

    const lowCardProfile =
      expectedTotalCards <= 4.0 &&
      expectedTotalShots >= 22 &&
      expectedTotalShotsOnTarget >= 7;

    const strongOpenGoalsProfile =
      shotBoostInfo.adjustedGoals >= 3.0 &&
      expectedTotalShots >= 22 &&
      expectedTotalShotsOnTarget >= 7;

    const usefulGoalsProfile =
      shotBoostInfo.adjustedGoals >= 2.85 &&
      expectedTotalShots >= 22 &&
      expectedTotalShotsOnTarget >= 7;

    const localDeadAttackProfile =
      localStats.shotsWeighted <= 6 ||
      localStats.shotsOnTargetWeighted <= 1.8;

    const visitDeadAttackProfile =
      visitStats.shotsWeighted <= 6 ||
      visitStats.shotsOnTargetWeighted <= 1.8;

    const oneSideDeadProfile = localDeadAttackProfile || visitDeadAttackProfile;

    const bothTeamsActiveProfile =
      localStats.shotsWeighted >= 7 &&
      visitStats.shotsWeighted >= 7 &&
      localStats.shotsOnTargetWeighted >= 2.2 &&
      visitStats.shotsOnTargetWeighted >= 2.2;

    const dynamicOpenProfile =
      bothTeamsActiveProfile &&
      (
        (expectedTotalShotsOnTarget >= 6.4 && expectedTotalShots >= 14) ||
        (shotBoostInfo.total >= 0.35 && expectedTotalShotsOnTarget >= 6) ||
        (simulation.draw >= 35 && expectedTotalShotsOnTarget >= 5 && expectedTotalShots >= 12)
      );

    const hardUnderBlockProfile =
      (expectedTotalShotsOnTarget >= 7 && expectedTotalShots >= 14) ||
      (dynamicOpenProfile && shotBoostInfo.adjustedGoals >= 2.35);

    for (const line of marketLines) {
      if (!line.enabled) continue;
      let probability = 0;
      let reason = "";

      if (line.family === "result") {
        if (line.side === "local") {
          probability = simulation.localWin;
          reason = "La simulación favorece al local para ganar.";
        } else if (line.side === "visitante") {
          probability = simulation.awayWin;
          reason = "La simulación favorece al visitante para ganar.";
        }
      }

      if (line.family === "doubleChance") {
        if (line.side === "local") {
          probability = simulation.localWin + simulation.draw;
          reason = "Cobertura local + empate con soporte de simulación.";
        } else if (line.side === "visitante") {
          probability = simulation.awayWin + simulation.draw;
          reason = "Cobertura visitante + empate con soporte de simulación.";
        }
      }

      if (line.family === "goals" && line.line !== "" && line.direction) {
        const numericLine = toNumber(line.line);
        probability =
          line.direction === "over"
            ? probabilityFromLambdaOver(shotBoostInfo.adjustedGoals, numericLine)
            : probabilityFromLambdaUnder(shotBoostInfo.adjustedGoals, numericLine);

        if (line.direction === "under" && hardUnderBlockProfile && numericLine <= 1.5) {
          probability -= 42;
          reason = "Under bloqueado: el volumen ofensivo no encaja con un partido tan corto.";
        } else if (line.direction === "under" && dynamicOpenProfile && numericLine <= 2.5) {
          probability -= 22;
          reason = "Under castigado: el partido proyecta demasiada actividad ofensiva.";
        } else if ((usefulGoalsProfile || dynamicOpenProfile) && line.direction === "over" && numericLine === 1.5) {
          probability += 22;
          reason = `Over útil reforzado con ${shotBoostInfo.adjustedGoals.toFixed(2)} goles esperados.`;
        } else if ((usefulGoalsProfile || dynamicOpenProfile) && line.direction === "over" && numericLine === 2.5) {
          probability += 18;
          reason = `Over 2.5 reforzado por ritmo ofensivo y ${shotBoostInfo.adjustedGoals.toFixed(2)} goles esperados.`;
        } else if ((strongOpenGoalsProfile || dynamicOpenProfile) && line.direction === "over" && numericLine === 3.5) {
          probability += 10;
          reason = `Perfil fuerte de over con ${shotBoostInfo.adjustedGoals.toFixed(2)} goles esperados.`;
        } else {
          reason = `Goles recalculados sobre ${shotBoostInfo.adjustedGoals.toFixed(2)} esperados.`;
        }

        if (oneSideDeadProfile && line.direction === "over" && numericLine === 1.5) {
          probability -= 14;
          reason = "Over castigado: uno de los equipos proyecta muy poco ataque.";
        }
        if (oneSideDeadProfile && line.direction === "over" && numericLine === 2.5) {
          probability -= 20;
          reason = "Over castigado fuerte: un equipo casi no genera volumen ofensivo.";
        }
        if (oneSideDeadProfile && line.direction === "under" && numericLine === 2.5) {
          probability += 14;
          reason = "Under reforzado: uno de los equipos proyecta producción ofensiva muy baja.";
        }
        if (oneSideDeadProfile && line.direction === "under" && numericLine === 3.5) {
          probability += 10;
          reason = "Under reforzado: el partido no perfila intercambio ofensivo real.";
        }
      }

      if (line.family === "halftimeGoals" && line.line !== "" && line.direction) {
        const numericLine = toNumber(line.line);
        const halftimeLambda = clamp(expectedHalftimeGoals + shotBoostInfo.total * 0.42, 0.05, 3.6);
        probability =
          line.direction === "over"
            ? probabilityFromLambdaOver(halftimeLambda, numericLine)
            : probabilityFromLambdaUnder(halftimeLambda, numericLine);
        reason = `La primera mitad proyecta ${halftimeLambda.toFixed(2)} goles.`;
      }

      if (line.family === "btts") {
        probability = line.direction === "yes"
          ? clamp(
              simulation.btts +
                shotBoostInfo.total * 12 +
                shotBoostInfo.bttsBoost +
                (strongOpenGoalsProfile ? 10 : 0) +
                (usefulGoalsProfile ? 6 : 0) +
                (dynamicOpenProfile ? 8 : 0) +
                (oneSideDeadProfile ? -20 : 0) +
                (bothTeamsActiveProfile ? 8 : 0),
              0,
              100
            )
          : clamp(
              (100 - simulation.btts) -
                shotBoostInfo.total * 12 -
                shotBoostInfo.bttsBoost -
                (strongOpenGoalsProfile ? 10 : 0) -
                (usefulGoalsProfile ? 6 : 0) -
                (dynamicOpenProfile ? 8 : 0) +
                (oneSideDeadProfile ? 20 : 0),
              0,
              100
            );

        reason = oneSideDeadProfile
          ? "BTTS ajustado: un equipo proyecta muy poca producción ofensiva."
          : "BTTS calculado con simulación y ritmo ofensivo.";
      }

      if (line.family === "corners" && line.line !== "" && (line.direction === "over" || line.direction === "under")) {
        const numericLine = toNumber(line.line);
        probability = probabilityByHeuristic(expectedTotalCorners, numericLine, 1.65, line.direction);
        if (expectedTotalShots >= 28 && expectedTotalCorners <= 6.5 && line.direction === "over") probability -= 8;
        if (expectedTotalCorners <= 6.2 && line.direction === "under") probability += 6;
        if (openGameProfile && expectedTotalCorners >= 8.7 && line.direction === "over") probability += 3;
        reason = `Corners recalculados con ${expectedTotalCorners.toFixed(2)} esperados.`;
      }

      if (line.family === "cards" && line.line !== "" && (line.direction === "over" || line.direction === "under")) {
        const numericLine = toNumber(line.line);
        probability = probabilityByHeuristic(expectedTotalCards, numericLine, 1.15, line.direction);
        if (lowCardProfile && line.direction === "over") probability -= 34;
        if (lowCardProfile && line.direction === "under") probability += 14;
        if (openGameProfile && expectedTotalCards < 4.8 && line.direction === "over") probability -= 22;
        reason = `Tarjetas recalculadas con ${expectedTotalCards.toFixed(2)} esperadas y sesgo arbitral.`;
      }

      if (line.family === "shots" && line.line !== "" && (line.direction === "over" || line.direction === "under")) {
        const numericLine = toNumber(line.line);
        probability = probabilityByHeuristic(expectedTotalShots, numericLine, 2.8, line.direction);
        reason = `Disparos totales esperados: ${expectedTotalShots.toFixed(2)}.`;
      }

      if (line.family === "shotsOnTarget" && line.line !== "" && (line.direction === "over" || line.direction === "under")) {
        const numericLine = toNumber(line.line);
        probability = probabilityByHeuristic(expectedTotalShotsOnTarget, numericLine, 1.45, line.direction);
        reason = `Remates a puerta esperados: ${expectedTotalShotsOnTarget.toFixed(2)}.`;
      }

      if (line.family === "teamGoals" && line.line !== "" && line.direction) {
        const numericLine = toNumber(line.line);
        const lambda = line.side === "local" ? expectedLocalTeamGoals : expectedVisitTeamGoals;
        probability =
          line.direction === "over"
            ? probabilityFromLambdaOver(lambda, numericLine)
            : probabilityFromLambdaUnder(lambda, numericLine);
        if (line.side === "local" && localShotDominance && line.direction === "over") probability += 16;
        if (line.side === "visitante" && visitShotDominance && line.direction === "over") probability += 16;
        reason = `Total de goles por equipo recalculado con ${lambda.toFixed(2)} esperados.`;
      }

      if (qualityScore < 60) probability -= 6;
      if (volatilityLabel === "Alta" && ["result", "doubleChance", "shots", "shotsOnTarget"].includes(line.family)) probability -= 4;
      if (shotBoostInfo.active && ["result", "doubleChance"].includes(line.family)) probability -= 5;
      if (dynamicOpenProfile && line.family === "result") probability -= 14;
      if (dynamicOpenProfile && line.family === "doubleChance") probability -= 4;
      if (line.family === "result" && line.side === "local" && localShotDominance) probability += 16;
      if (line.family === "result" && line.side === "visitante" && visitShotDominance) probability += 16;
      if (line.family === "doubleChance" && line.side === "local" && localShotDominance) probability += 9;
      if (line.family === "doubleChance" && line.side === "visitante" && visitShotDominance) probability += 9;
      if (openGameProfile && line.family === "cards") probability -= 12;
      if (tieContext.esEliminatoria && (tieContext.necesidadLocal === "Alta" || tieContext.necesidadVisitante === "Alta")) {
        if (line.family === "goals" && line.direction === "over") probability += 3;
        if (line.family === "corners" && line.direction === "over") probability += 2;
      }

      const finalIsBettable =
        qualityScore >= 65 &&
        !(volatilityLabel === "Alta" && (line.family === "result" || line.family === "doubleChance")) &&
        !(simulation.draw > 30 && line.family === "result") &&
        !(oneSideDeadProfile && line.family === "goals" && line.direction === "over");

      if (!finalIsBettable) continue;

      addCandidate(line, clamp(probability, 0, 100), reason);
    }

    const uniqueByFamily = new Map<string, SuggestedPick>();

    for (const pick of candidates) {
      const key = `${pick.family}-${pick.fallback ? "Respaldo" : pick.tier}`;
      const current = uniqueByFamily.get(key);
      const score =
        pick.realConfidence * 1.2 +
        pick.edge * 1.15 +
        pick.marketPriority * 0.8 +
        (pick.tier === "Top" ? 8 : pick.tier === "Alternativo" ? 4 : 0);

      const currentScore = current
        ? current.realConfidence * 1.2 +
          current.edge * 1.15 +
          current.marketPriority * 0.8 +
          (current.tier === "Top" ? 8 : current.tier === "Alternativo" ? 4 : 0)
        : -999;

      if (!current || score > currentScore) {
        uniqueByFamily.set(key, pick);
      }
    }

    const ranked = Array.from(uniqueByFamily.values()).sort((a, b) => {
      const scoreA = a.realConfidence * 1.25 + a.edge * 1.15 + a.marketPriority * 0.9 - (a.fallback ? 8 : 0);
      const scoreB = b.realConfidence * 1.25 + b.edge * 1.15 + b.marketPriority * 0.9 - (b.fallback ? 8 : 0);
      return scoreB - scoreA;
    });

    const primary = ranked.filter((pick) => !pick.fallback).slice(0, 2);
    if (primary.length) return primary;

    const fallback = ranked.filter((pick) => pick.fallback).slice(0, 1);
    return fallback;
  }, [hardNoBet, marketLines, minProb, minEdge, simulation, expectedTotalGoals, expectedHalftimeGoals, expectedTotalCorners, expectedTotalCards, expectedTotalShots, expectedTotalShotsOnTarget, expectedLocalTeamGoals, expectedVisitTeamGoals, qualityScore, volatilityLabel, tieContext, shotBoostInfo, localStats, visitStats, localTags, visitTags, matchTypeInfo, matchInfo.local, matchInfo.visitante]);

  const crossSuggestions = useMemo(() => {
    const items: { title: string; explanation: string; picks: string[]; side: "local" | "visitante" | "neutral"; confidence: number }[] = [];
    const localName = matchInfo.local.trim() || "Local";
    const visitName = matchInfo.visitante.trim() || "Visitante";
    const hasLocalTag = (needle: string) => localTags.some((tag) => tag.toLowerCase().includes(needle));
    const hasVisitTag = (needle: string) => visitTags.some((tag) => tag.toLowerCase().includes(needle));
    const addCross = (item: { title: string; explanation: string; picks: string[]; side: "local" | "visitante" | "neutral"; confidence: number }) => {
      items.push({ ...item, confidence: clamp(item.confidence, 52, 92) });
    };

    if (!localStats.count || !visitStats.count) return items;

    if ((localStats.winPct >= 55 && visitStats.lossPct >= 40) || (hasLocalTag("gana") && hasVisitTag("pierde"))) {
      addCross({
        title: `${localName} fuerte vs ${visitName} frágil`,
        explanation: `${localName} gana seguido y ${visitName} pierde con frecuencia. El cruce favorece mercados del local.`,
        picks: [`${localName} gana`, `${localName} o empate`],
        side: "local",
        confidence: 56 + (localStats.winPct - visitStats.lossPct) * 0.18 + (localStats.gfAvg - visitStats.gfAvg) * 6 + (simulation.localWin - simulation.awayWin) * 0.22,
      });
    }

    if ((visitStats.winPct >= 55 && localStats.lossPct >= 40) || (hasVisitTag("gana") && hasLocalTag("pierde"))) {
      addCross({
        title: `${visitName} fuerte vs ${localName} frágil`,
        explanation: `${visitName} trae mejor patrón de resultados y ${localName} se cae más de lo deseado. El cruce favorece mercados del visitante.`,
        picks: [`${visitName} gana`, `${visitName} o empate`],
        side: "visitante",
        confidence: 56 + (visitStats.winPct - localStats.lossPct) * 0.18 + (visitStats.gfAvg - localStats.gfAvg) * 6 + (simulation.awayWin - simulation.localWin) * 0.22,
      });
    }

    if ((hasLocalTag("goleador") && hasVisitTag("recibe")) || (localStats.gfAvg >= 1.6 && visitStats.gcAvg >= 1.3)) {
      addCross({
        title: `${localName} ataca bien vs ${visitName} concede`,
        explanation: `${localName} proyecta gol y ${visitName} suele recibir. El cruce favorece goles del local y líneas de over.`,
        picks: [`${localName} más de 0.5 goles`, "Más de 1.5 goles"],
        side: "local",
        confidence: 58 + (localStats.gfAvg * 8) + (visitStats.gcAvg * 5) + (expectedGoalsLocal * 8) - (visitStats.shotsOnTargetAgainstAvg < 2 ? 4 : 0),
      });
    }

    if ((hasVisitTag("goleador") && hasLocalTag("recibe")) || (visitStats.gfAvg >= 1.6 && localStats.gcAvg >= 1.3)) {
      addCross({
        title: `${visitName} ataca bien vs ${localName} concede`,
        explanation: `${visitName} proyecta gol y ${localName} suele dejar espacios. El cruce favorece goles del visitante y líneas de over.`,
        picks: [`${visitName} más de 0.5 goles`, "Más de 1.5 goles"],
        side: "visitante",
        confidence: 58 + (visitStats.gfAvg * 8) + (localStats.gcAvg * 5) + (expectedGoalsVisit * 8) - (localStats.shotsOnTargetAgainstAvg < 2 ? 4 : 0),
      });
    }

    if (
      ((hasLocalTag("goleador") || localStats.gfAvg >= 1.5) && (hasVisitTag("goleador") || visitStats.gfAvg >= 1.3)) ||
      ((hasLocalTag("recibe") || localStats.gcAvg >= 1.2) && (hasVisitTag("recibe") || visitStats.gcAvg >= 1.2))
    ) {
      addCross({
        title: `Cruce ofensivo ${localName} vs ${visitName}`,
        explanation: `Ambos perfiles tienen señales de gol o de concesión. El cruce favorece partido de intercambio.`,
        picks: ["BTTS Sí", "Más de 2.5 goles"],
        side: "neutral",
        confidence: 55 + expectedTotalGoals * 8 + simulation.btts * 0.12 + simulation.over25 * 0.1,
      });
    }

    if (
      (localStats.drawPct >= 28 && visitStats.drawPct >= 28) ||
      (hasLocalTag("empata") && hasVisitTag("empata"))
    ) {
      addCross({
        title: `Cruce de empate`,
        explanation: `Los dos equipos tienen tendencia a cerrar o repartir puntos. El empate gana peso relativo.`,
        picks: [`${localName} o empate`, `${visitName} o empate`],
        side: "neutral",
        confidence: 54 + (localStats.drawPct + visitStats.drawPct) * 0.28 + simulation.draw * 0.18,
      });
    }

    if (
      (hasLocalTag("alto en corners") && visitStats.oppCornersAvg >= 4.8) ||
      (localStats.ownCornersAvg >= 5 && visitStats.oppCornersAvg >= 4.6)
    ) {
      addCross({
        title: `${localName} empuja corners`,
        explanation: `${localName} suele producir corners y ${visitName} concede suficientes. El cruce favorece líneas de corners.`,
        picks: ["Más de 8.5 corners", `Corners ${localName}`],
        side: "local",
        confidence: 56 + localStats.ownCornersAvg * 4 + visitStats.oppCornersAvg * 3.2 + expectedTotalCorners * 1.1,
      });
    }

    if (
      (hasVisitTag("alto en corners") && localStats.oppCornersAvg >= 4.8) ||
      (visitStats.ownCornersAvg >= 5 && localStats.oppCornersAvg >= 4.6)
    ) {
      addCross({
        title: `${visitName} empuja corners`,
        explanation: `${visitName} suele producir corners y ${localName} concede suficientes. El cruce favorece líneas de corners.`,
        picks: ["Más de 8.5 corners", `Corners ${visitName}`],
        side: "visitante",
        confidence: 56 + visitStats.ownCornersAvg * 4 + localStats.oppCornersAvg * 3.2 + expectedTotalCorners * 1.1,
      });
    }

    if (
      ((hasLocalTag("conservador") || localStats.totalGoalsWeighted <= 2.2) &&
        (hasVisitTag("conservador") || visitStats.totalGoalsWeighted <= 2.2)) ||
      (localStats.shotsWeighted <= 9 && visitStats.shotsWeighted <= 9)
    ) {
      addCross({
        title: `Cruce corto / cerrado`,
        explanation: `Ningún perfil empuja un ritmo ofensivo claro. El cruce favorece líneas cortas.`,
        picks: ["Menos de 3.5 goles", "BTTS No"],
        side: "neutral",
        confidence: 55 + (4.2 - expectedTotalGoals) * 9 + (18 - expectedTotalShots) * 1.1,
      });
    }

    const unique = new Set<string>();
    return items
      .filter((item) => {
        const key = `${item.title}__${item.picks.join("|")}`;
        if (unique.has(key)) return false;
        unique.add(key);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 6);
  }, [matchInfo.local, matchInfo.visitante, localStats, visitStats, localTags, visitTags, simulation, expectedGoalsLocal, expectedGoalsVisit, expectedTotalGoals, expectedTotalCorners, expectedTotalShots]);

  const visiblePicks = useMemo(
    () => suggestedPicks.filter((pick) => pickDecisions[pick.id] !== "discarded"),
    [suggestedPicks, pickDecisions]
  );

  const topPick = visiblePicks[0] ?? null;
  const altPick = visiblePicks[1] ?? null;
  const matchDisplayName = `${matchInfo.local.trim() || "Local"} vs ${matchInfo.visitante.trim() || "Visitante"}`;

  const selectedPicks = useMemo(
    () => suggestedPicks.filter((pick) => pickDecisions[pick.id] === "selected"),
    [suggestedPicks, pickDecisions]
  );

  const simulatedTicket = useMemo(() => {
    if (!selectedPicks.length) return null;
    const combinedProbability = selectedPicks.reduce((acc, pick) => acc * (pick.probability / 100), 1) * 100;
    const averageEdge = selectedPicks.reduce((acc, pick) => acc + pick.edge, 0) / selectedPicks.length;
    const profile =
      selectedPicks.length === 1
        ? "Conservador"
        : selectedPicks.length === 2
        ? "Medio"
        : "Agresivo";

    return {
      combinedProbability,
      averageEdge,
      profile,
      expectedHitsPer10: (combinedProbability / 100) * 10,
    };
  }, [selectedPicks]);

  const supportInterpretation = useMemo(() => {
    const notes: string[] = [];
    const possessionLocal = toNumber(matchSupportInfo.possessionLocal);
    const possessionVisit = toNumber(matchSupportInfo.possessionVisit);
    const bigLocal = toNumber(matchSupportInfo.bigChancesLocal);
    const bigVisit = toNumber(matchSupportInfo.bigChancesVisit);

    if (possessionLocal >= 60 && bigLocal > bigVisit + 1) notes.push("Dominio real del local.");
    if (possessionVisit >= 60 && bigVisit > bigLocal + 1) notes.push("Dominio real del visitante.");
    if (bigLocal >= 2 && bigVisit >= 2) notes.push("Ambos equipos generaron ocasiones claras.");
    if (bigLocal <= 1 && bigVisit <= 1 && (possessionLocal || possessionVisit)) notes.push("Partido corto en ocasiones claras.");
    if (possessionLocal >= 58 && bigLocal <= 1) notes.push("Posesión local alta, pero con poco daño real.");
    if (possessionVisit >= 58 && bigVisit <= 1) notes.push("Posesión visitante alta, pero con poco daño real.");
    return notes;
  }, [matchSupportInfo]);

  function updateMatchInfo<K extends keyof MatchInfo>(key: K, value: MatchInfo[K]) {
    setMatchInfo((prev) => ({ ...prev, [key]: value }));
  }

  function updateTieContext<K extends keyof TieContext>(key: K, value: TieContext[K]) {
    setTieContext((prev) => ({ ...prev, [key]: value }));
  }

  function updateRefInfo<K extends keyof RefereeInfo>(key: K, value: RefereeInfo[K]) {
    setRefInfo((prev) => ({ ...prev, [key]: value }));
  }

  function updateMatchSupportInfo<K extends keyof MatchSupportInfo>(key: K, value: MatchSupportInfo[K]) {
    setMatchSupportInfo((prev) => ({ ...prev, [key]: value }));
  }

  function setPickDecision(id: string, decision: PickDecision) {
    setPickDecisions((prev) => ({
      ...prev,
      [id]: prev[id] === decision ? null : decision,
    }));
  }

  function handleRowChange(side: TeamCondition, index: number, field: keyof TeamRow, raw: string) {
    const setter = side === "local" ? setLocalRows : setVisitRows;
    setter((prev) => {
      const copy = [...prev];
      const row = { ...copy[index] };
      const numericFields: (keyof TeamRow)[] = [
        "gf",
        "gc",
        "ownCorners",
        "oppCorners",
        "ownYellow",
        "oppYellow",
        "ownRed",
        "oppRed",
        "xg",
        "xgAgainst",
        "shotsOnTarget",
        "shotsOnTargetAgainst",
        "shots",
        "shotsAgainst",
      ];
      if (numericFields.includes(field)) {
        if (field === "xg" || field === "xgAgainst") {
          (row[field] as string) = raw;
        } else {
          (row[field] as number | "") = raw === "" ? "" : Number(raw);
        }
      } else {
        (row[field] as string) = raw;
      }
      if ((field === "gf" || field === "gc") && row.gf !== "" && row.gc !== "") {
        row.estado = Number(row.gf) > Number(row.gc) ? "G" : Number(row.gf) < Number(row.gc) ? "P" : "E";
      }
      copy[index] = row;
      return copy;
    });
  }

  function saveTeamProfile(side: TeamCondition) {
    const rows = side === "local" ? localRows : visitRows;
    const teamName = side === "local" ? matchInfo.local.trim() : matchInfo.visitante.trim();
    const country = side === "local" ? matchInfo.paisLocal.trim() : matchInfo.paisVisitante.trim();
    if (!teamName) {
      alert("Escribe el nombre del equipo antes de guardar.");
      return;
    }

    const meta = side === "local" ? localMeta : visitMeta;
    const profile: TeamProfile = {
      teamName,
      condition: side,
      country,
      league: matchInfo.liga.trim(),
      style: meta.style,
      idealMarkets: meta.idealMarkets,
      notes: meta.notes,
      favorite: meta.favorite,
      rows,
      savedAt: new Date().toISOString(),
    };

    setSavedTeams((prev) => {
      const next = [profile, ...prev.filter((p) => !(p.teamName === profile.teamName && p.condition === profile.condition))];
      localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(next));
      return next;
    });

    alert(`Perfil de ${teamName} guardado.`);
  }

  function loadTeamProfile(profile: TeamProfile) {
    if (profile.condition === "local") {
      setMatchInfo((prev) => ({ ...prev, local: profile.teamName, paisLocal: profile.country || prev.paisLocal, liga: prev.liga || profile.league }));
      setLocalRows(profile.rows?.length ? profile.rows : createEmptyRows());
      setLocalMeta({ style: profile.style || "Mixto", idealMarkets: profile.idealMarkets || "", notes: profile.notes || "", favorite: Boolean(profile.favorite) });
    } else {
      setMatchInfo((prev) => ({ ...prev, visitante: profile.teamName, paisVisitante: profile.country || prev.paisVisitante, liga: prev.liga || profile.league }));
      setVisitRows(profile.rows?.length ? profile.rows : createEmptyRows());
      setVisitMeta({ style: profile.style || "Mixto", idealMarkets: profile.idealMarkets || "", notes: profile.notes || "", favorite: Boolean(profile.favorite) });
    }
  }

  function deleteTeamProfile(profile: TeamProfile) {
    if (!window.confirm(`¿Eliminar perfil de ${profile.teamName}?`)) return;
    setSavedTeams((prev) => {
      const next = prev.filter((p) => !(p.teamName === profile.teamName && p.condition === profile.condition));
      localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function saveReferee() {
    if (!refInfo.nombre.trim()) {
      alert("Escribe el nombre del árbitro.");
      return;
    }
    const ref: SavedReferee = {
      nombre: refInfo.nombre.trim(),
      promedioAmarillas: Number(refInfo.promedioAmarillas || 0),
      promedioRojas: Number(refInfo.promedioRojas || 0),
      savedAt: new Date().toISOString(),
    };
    setSavedRefs((prev) => {
      const next = [ref, ...prev.filter((r) => r.nombre !== ref.nombre)];
      localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    alert("Árbitro guardado con tarjetas y rojas.");
  }

  function loadReferee(ref: SavedReferee) {
    setRefInfo({
      nombre: ref.nombre,
      promedioAmarillas: String(ref.promedioAmarillas),
      promedioRojas: String(ref.promedioRojas),
      sinConfirmar: false,
    });
  }

  function addMarketLine(family: MarketFamily) {
    const defaultLineMap: Partial<Record<MarketFamily, number>> = {
      goals: 1.5,
      corners: 8.5,
      cards: 3.5,
      shots: 18.5,
      shotsOnTarget: 5.5,
      teamGoals: 0.5,
      halftimeGoals: 0.5,
    };
    const side = family === "result" || family === "doubleChance" || family === "teamGoals" ? "local" : "total";
    const direction = family === "btts" ? "yes" : family === "result" || family === "doubleChance" ? "pick" : "over";
    setMarketLines((prev) => [
      ...prev,
      {
        id: makeId(),
        family,
        label: buildLabel(family, side as "local" | "visitante" | "total", defaultLineMap[family] !== undefined ? String(defaultLineMap[family]) : "", direction as MarketLine["direction"]),
        odd: "",
        line: defaultLineMap[family] !== undefined ? String(defaultLineMap[family]) : "",
        direction: direction as MarketLine["direction"],
        side: side as MarketLine["side"],
        enabled: true,
      },
    ]);
  }

  function updateMarketLine(id: string, patch: Partial<MarketLine>) {
    setMarketLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        next.label = buildLabel(next.family, next.side ?? "total", next.line, next.direction);
        return next;
      })
    );
  }

  function removeMarketLine(id: string) {
    setMarketLines((prev) => prev.filter((line) => line.id !== id));
  }

  function saveMarketPreset() {
    if (!marketPresetName.trim()) {
      alert("Ponle un nombre al perfil de cuotas.");
      return;
    }
    const presets = safeParse<Record<string, MarketLine[]>>(localStorage.getItem(MARKET_STORAGE_KEY), {});
    presets[marketPresetName.trim()] = marketLines;
    localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(presets));
    setSavedPresets(Object.keys(presets));
    alert("Perfil de cuotas guardado.");
  }

  function loadMarketPreset(name: string) {
    const presets = safeParse<Record<string, MarketLine[]>>(localStorage.getItem(MARKET_STORAGE_KEY), {});
    if (!presets[name]) return;
    setMarketLines(presets[name]);
  }

  function deleteMarketPreset(name: string) {
    if (!window.confirm(`¿Eliminar perfil de cuotas ${name}?`)) return;
    const presets = safeParse<Record<string, MarketLine[]>>(localStorage.getItem(MARKET_STORAGE_KEY), {});
    delete presets[name];
    localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(presets));
    setSavedPresets(Object.keys(presets));
    setMarketPresetName((prev) => (prev === name ? "" : prev));
  }


  function exportFullData() {
    downloadJsonFile(
      {
        kind: "full_match",
        exportedAt: new Date().toISOString(),
        matchInfo,
        tieContext,
        refInfo,
        localRows,
        visitRows,
        localMeta,
        visitMeta,
        marketLines,
        minEdge,
        minProb,
      },
      `${slugify(matchInfo.local || "local")}-vs-${slugify(matchInfo.visitante || "visitante")}-analisis.json`
    );
  }

  function exportTeamData(side: TeamCondition) {
    const teamName = side === "local" ? matchInfo.local : matchInfo.visitante;
    const data = {
      kind: "team_profile",
      exportedAt: new Date().toISOString(),
      profile: {
        teamName: teamName || (side === "local" ? "Local" : "Visitante"),
        condition: side,
        country: side === "local" ? matchInfo.paisLocal : matchInfo.paisVisitante,
        league: matchInfo.liga,
        style: side === "local" ? localMeta.style : visitMeta.style,
        idealMarkets: side === "local" ? localMeta.idealMarkets : visitMeta.idealMarkets,
        notes: side === "local" ? localMeta.notes : visitMeta.notes,
        rows: side === "local" ? localRows : visitRows,
        savedAt: new Date().toISOString(),
      },
    };
    downloadJsonFile(data, `${slugify(teamName || side)}-${side}.json`);
  }

  function exportRefereeData() {
    downloadJsonFile({ kind: "referee_profile", exportedAt: new Date().toISOString(), refInfo }, `${slugify(refInfo.nombre || "arbitro")}-arbitro.json`);
  }

  function importJsonFile(file: File, target: "full" | TeamCondition | "referee") {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result || "{}"));
        if (target === "full") {
          setMatchInfo(raw.matchInfo ?? emptyMatchInfo());
          setTieContext({ ...emptyTieContext(), ...(raw.tieContext ?? {}) });
          setRefInfo({ ...emptyReferee(), ...(raw.refInfo ?? {}) });
          setLocalRows(raw.localRows ?? createEmptyRows());
          setVisitRows(raw.visitRows ?? createEmptyRows());
          setLocalMeta({ ...emptyTeamMeta(), ...(raw.localMeta ?? {}) });
          setVisitMeta({ ...emptyTeamMeta(), ...(raw.visitMeta ?? {}) });
          setMarketLines(
            (raw.marketLines ?? buildDefaultMarketLines()).map((line: MarketLine) => ({
              ...line,
              odd: line.odd === "" ? "" : String(line.odd),
              line: line.line === undefined || line.line === null ? "" : String(line.line),
            }))
          );
          setMinEdge(raw.minEdge ?? 3);
          setMinProb(raw.minProb ?? 56);
          return;
        }
        if (target === "referee") {
          const incoming = raw.refInfo ?? raw;
          setRefInfo({
            nombre: incoming.nombre ?? "",
            promedioAmarillas: incoming.promedioAmarillas ?? "",
            promedioRojas: incoming.promedioRojas ?? "",
          });
          return;
        }
        const profile = raw.profile ?? raw;
        if (target === "local") {
          setMatchInfo((prev) => ({ ...prev, local: profile.teamName ?? prev.local, paisLocal: profile.country ?? prev.paisLocal, liga: prev.liga || profile.league || "" }));
          setLocalRows(profile.rows ?? createEmptyRows());
          setLocalMeta({ style: profile.style ?? "Mixto", idealMarkets: profile.idealMarkets ?? "", notes: profile.notes ?? "" });
        } else {
          setMatchInfo((prev) => ({ ...prev, visitante: profile.teamName ?? prev.visitante, paisVisitante: profile.country ?? prev.paisVisitante, liga: prev.liga || profile.league || "" }));
          setVisitRows(profile.rows ?? createEmptyRows());
          setVisitMeta({ style: profile.style ?? "Mixto", idealMarkets: profile.idealMarkets ?? "", notes: profile.notes ?? "" });
        }
      } catch (error) {
        alert("No se pudo importar el archivo JSON.");
      }
    };
    reader.readAsText(file);
  }

  const allNameSuggestions = useMemo(
    () => buildNameSuggestions(savedTeams, matchInfo.local, matchInfo.visitante, localRows, visitRows),
    [savedTeams, matchInfo.local, matchInfo.visitante, localRows, visitRows]
  );

  const rankingProfiles = useMemo(() => {
    const current: TeamProfile[] = [];
    if (matchInfo.local.trim()) {
      current.push({
        teamName: matchInfo.local.trim(),
        condition: "local",
        country: matchInfo.paisLocal.trim(),
        league: matchInfo.liga.trim(),
        style: localMeta.style,
        idealMarkets: localMeta.idealMarkets,
        notes: localMeta.notes,
        favorite: localMeta.favorite,
        rows: localRows,
        savedAt: new Date().toISOString(),
      });
    }
    if (matchInfo.visitante.trim()) {
      current.push({
        teamName: matchInfo.visitante.trim(),
        condition: "visitante",
        country: matchInfo.paisVisitante.trim(),
        league: matchInfo.liga.trim(),
        style: visitMeta.style,
        idealMarkets: visitMeta.idealMarkets,
        notes: visitMeta.notes,
        favorite: visitMeta.favorite,
        rows: visitRows,
        savedAt: new Date().toISOString(),
      });
    }
    const map = new Map<string, TeamProfile>();
    [...current, ...savedTeams].forEach((profile) => {
      map.set(`${profile.teamName}__${profile.country}__${profile.condition}`, profile);
    });
    return Array.from(map.values());
  }, [savedTeams, matchInfo, localMeta, visitMeta, localRows, visitRows]);

  const teamCategoryBoard = useMemo(() => {
    const categories = ["Ganador", "Empate", "Pierde", "Goleador", "Recibe goles", "Corners", "Tarjetas", "Remates", "A puerta"];
    return categories.map((category) => ({
      category,
      teams: rankingProfiles
        .map((profile) => ({ profile, stats: analyzeRows(profile.rows), score: getCategoryScore(category, analyzeRows(profile.rows)) }))
        .filter((item) => item.stats.count > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6),
    }));
  }, [rankingProfiles]);

  const favoriteProfiles = useMemo(
    () => rankingProfiles.filter((profile) => Boolean(profile.favorite)),
    [rankingProfiles]
  );

  const teamsByCountry = useMemo(() => {
    const grouped: Record<string, TeamProfile[]> = {};
    rankingProfiles.forEach((profile) => {
      const key = profile.country?.trim() || "Sin país";
      grouped[key] = grouped[key] || [];
      grouped[key].push(profile);
    });
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [rankingProfiles]);

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-sky-500/30 bg-slate-900/90 p-6 text-white shadow-lg shadow-slate-950/30">
          <h1 className="text-3xl font-bold">⚽✍🏻Analizador de apuestas KAL07🥅📝</h1>
       
        </div>

           <p className="mt-2 max-w-3xl text-sm text-slate-200">
            Esta versión trabaja con líneas reales de la casa. Si la app veía +0.5 goles pero tu casa solo ofrece +1.5,
            aquí recalcula la probabilidad sobre la línea real disponible y, si se rompe el valor, te empuja a otro pick o a no apostar.
          </p>

      

<datalist id="team-suggestions">
          {allNameSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <datalist id="rival-suggestions">
          {allNameSuggestions.map((name) => (
            <option key={`rival-${name}`} value={name} />
          ))}
        </datalist>

<div className="flex justify-end">
<button
  onClick={resetAll}
  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
>
  Nuevo partido / Reset Partido
</button>
</div>

            <button onClick={exportFullData} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Exportar partido completo</button>
            <button onClick={() => importFullRef.current?.click()} className="rounded-xl border border-sky-400 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100">Importar partido completo</button>

        <Section title="1. Datos del partido" subtitle="Incluye países, fase, tipo de partido y contexto básico.">
          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input value={matchInfo.local} onChange={(e) => updateMatchInfo("local", e.target.value)} placeholder="Equipo local" list="team-suggestions" className="w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 outline-none ring-0 transition focus:border-sky-500" />
            <input value={matchInfo.visitante} onChange={(e) => updateMatchInfo("visitante", e.target.value)} placeholder="Equipo visitante" list="team-suggestions" className="w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 outline-none ring-0 transition focus:border-sky-500" />
            <Input value={matchInfo.paisLocal} onChange={(v) => updateMatchInfo("paisLocal", v)} placeholder="País local" />
            <Input value={matchInfo.paisVisitante} onChange={(v) => updateMatchInfo("paisVisitante", v)} placeholder="País visitante" />
            <Input value={matchInfo.liga} onChange={(v) => updateMatchInfo("liga", v)} placeholder="Liga" />
            <Input value={matchInfo.temporada} onChange={(v) => updateMatchInfo("temporada", v)} placeholder="Temporada" />
            <Input value={matchInfo.grupo} onChange={(v) => updateMatchInfo("grupo", v)} placeholder="Grupo (si aplica)" />
            <Input value={matchInfo.fecha} onChange={(v) => updateMatchInfo("fecha", v)} placeholder="Fecha" type="date" />
            <Input value={String(matchInfo.posicionLocal)} onChange={(v) => updateMatchInfo("posicionLocal", v === "" ? "" : Number(v))} placeholder="Posición local" type="number" />
            <Input value={String(matchInfo.posicionVisitante)} onChange={(v) => updateMatchInfo("posicionVisitante", v === "" ? "" : Number(v))} placeholder="Posición visitante" type="number" />
            <Select value={matchInfo.etapa} onChange={(v) => updateMatchInfo("etapa", v as MatchStage)} options={STAGES} />
            <Select value={matchInfo.tipo} onChange={(v) => updateMatchInfo("tipo", v as MatchType)} options={TYPES} />
          </div>
          
          {supportInterpretation.length ? (
            <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <div className="font-bold text-sm">Lectura rápida de dominio</div>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {supportInterpretation.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-3">
            <TextArea value={matchInfo.notas} onChange={(v) => updateMatchInfo("notas", v)} placeholder="Notas del partido, bajas, rotaciones, clima, etc." />
          </div>
          </div>
        </Section>

        <Section title="2. Contexto de eliminatoria e ida/vuelta" subtitle="Aquí dejas de depender del global escrito a mano y lo estructuras mejor.">
          <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            
            <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm">
              <input type="checkbox" checked={tieContext.esEliminatoria} onChange={(e) => updateTieContext("esEliminatoria", e.target.checked)} />
              Es eliminatoria
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm">
              <input type="checkbox" checked={tieContext.esPartidoIda} onChange={(e) => updateTieContext("esPartidoIda", e.target.checked)} />
              Es partido de ida
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm">
              <input type="checkbox" checked={tieContext.partidoIdaJugado} onChange={(e) => updateTieContext("partidoIdaJugado", e.target.checked)} />
              Ya se jugó la ida
            </label>
            <Select value={tieContext.necesidadLocal} onChange={(v) => updateTieContext("necesidadLocal", v as NeedLevel)} options={NEED_LEVELS} />
            <Select value={tieContext.necesidadVisitante} onChange={(v) => updateTieContext("necesidadVisitante", v as NeedLevel)} options={NEED_LEVELS} />
            <Input value={String(tieContext.globalLocal)} onChange={(v) => updateTieContext("globalLocal", v === "" ? "" : Number(v))} placeholder={tieContext.esPartidoIda ? "Último partido local (goles/global previo)" : "Global local"} type="number" />
            <Input value={String(tieContext.globalVisitante)} onChange={(v) => updateTieContext("globalVisitante", v === "" ? "" : Number(v))} placeholder={tieContext.esPartidoIda ? "Último partido visitante (goles/global previo)" : "Global visitante"} type="number" />
            <Input value={tieContext.idaLocalTeam} onChange={(v) => updateTieContext("idaLocalTeam", v)} placeholder="Equipo local en la ida" />
            <Input value={tieContext.idaVisitanteTeam} onChange={(v) => updateTieContext("idaVisitanteTeam", v)} placeholder="Equipo visitante en la ida" />
            <Input value={String(tieContext.idaGFLocal)} onChange={(v) => updateTieContext("idaGFLocal", v === "" ? "" : Number(v))} placeholder="Goles local ida" type="number" />
            <Input value={String(tieContext.idaGFVisitante)} onChange={(v) => updateTieContext("idaGFVisitante", v === "" ? "" : Number(v))} placeholder="Goles visitante ida" type="number" />
            <Input value={String(tieContext.idaCorners)} onChange={(v) => updateTieContext("idaCorners", v === "" ? "" : Number(v))} placeholder="Corners ida" type="number" />
            <Input value={String(tieContext.idaTarjetas)} onChange={(v) => updateTieContext("idaTarjetas", v === "" ? "" : Number(v))} placeholder="Tarjetas ida" type="number" />
            <Input value={tieContext.idaXgLocal} onChange={(v) => updateTieContext("idaXgLocal", v)} placeholder="xG local ida" type="text" inputMode="decimal" />
            <Input value={tieContext.idaXgVisitante} onChange={(v) => updateTieContext("idaXgVisitante", v)} placeholder="xG visitante ida" type="text" inputMode="decimal" />
            <Input value={String(tieContext.idaShotsLocal)} onChange={(v) => updateTieContext("idaShotsLocal", v === "" ? "" : Number(v))} placeholder="Disparos local ida" type="number" />
            <Input value={String(tieContext.idaShotsVisitante)} onChange={(v) => updateTieContext("idaShotsVisitante", v === "" ? "" : Number(v))} placeholder="Disparos visitante ida" type="number" />
            <Input value={String(tieContext.idaShotsOnTargetLocal)} onChange={(v) => updateTieContext("idaShotsOnTargetLocal", v === "" ? "" : Number(v))} placeholder="A puerta local ida" type="number" />
            <Input value={String(tieContext.idaShotsOnTargetVisitante)} onChange={(v) => updateTieContext("idaShotsOnTargetVisitante", v === "" ? "" : Number(v))} placeholder="A puerta visitante ida" type="number" />
          </div>
          <div className="mt-3">
            <TextArea value={tieContext.lecturaManual} onChange={(v) => updateTieContext("lecturaManual", v)} placeholder={tieContext.esPartidoIda ? "Lectura manual del partido de ida y último contexto de ambos equipos." : "Lectura manual de la necesidad del partido o de la ida."} />
          </div>
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">{needReading.label}</div>
            <ul className="mt-2 list-disc pl-5">
              {automaticEliminationText ? <li className="font-semibold">{automaticEliminationText}</li> : null}
              {needReading.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
          </div>
        </Section>

        <Section title="3. Árbitro" subtitle="Aquí ya guarda nombre, promedio de amarillas y promedio de rojas.">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="grid gap-3 md:grid-cols-4">
            <Input value={refInfo.nombre} onChange={(v) => updateRefInfo("nombre", v)} placeholder="Nombre del árbitro" />
            <Input value={refInfo.promedioAmarillas} onChange={(v) => updateRefInfo("promedioAmarillas", v)} placeholder="Promedio amarillas" type="text" inputMode="decimal" />
            <Input value={refInfo.promedioRojas} onChange={(v) => updateRefInfo("promedioRojas", v)} placeholder="Promedio rojas" type="text" inputMode="decimal" />
            <button onClick={saveReferee} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Guardar árbitro</button>
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900">
            <input type="checkbox" checked={refInfo.sinConfirmar} onChange={(e) => updateRefInfo("sinConfirmar", e.target.checked)} />
            Sin confirmar árbitro
          </label>
          {savedRefs.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {savedRefs.slice(0, 8).map((ref) => (
                <button key={ref.nombre} onClick={() => loadReferee(ref)} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900">
                  {ref.nombre} · {ref.promedioAmarillas} TA · {ref.promedioRojas} TR
                </button>
              ))}
            </div>
          ) : null}
          </div>
        </Section>

             <button onClick={exportRefereeData} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950">Exportar árbitro</button>
            <button onClick={() => importRefereeRef.current?.click()} className="rounded-xl border border-amber-300 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100">Importar árbitro</button>


        <div className="grid gap-6 xl:grid-cols-2">
          <TeamBlock
            title="4. Datos del local"
            side="local"
            teamName={matchInfo.local}
            rows={localRows}
            onRowChange={handleRowChange}
            onSave={() => saveTeamProfile("local")}
            stats={localStats}
            tags={localTags}
            meta={localMeta}
            onMetaChange={(patch) => setLocalMeta((prev) => ({ ...prev, ...patch }))}
            suggestions={allNameSuggestions}
          />
          <TeamBlock
            title="5. Datos del visitante"
            side="visitante"
            teamName={matchInfo.visitante}
            rows={visitRows}
            onRowChange={handleRowChange}
            onSave={() => saveTeamProfile("visitante")}
            stats={visitStats}
            tags={visitTags}
            meta={visitMeta}
            onMetaChange={(patch) => setVisitMeta((prev) => ({ ...prev, ...patch }))}
            suggestions={allNameSuggestions}
          />
        </div>

   <Section title="0. Exportar e importar" subtitle="Respalda o carga partido completo, perfiles de equipos y árbitro en JSON.">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <button onClick={() => exportTeamData("local")} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Exportar local</button>
            <button onClick={() => importLocalRef.current?.click()} className="rounded-xl border border-blue-400 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100">Importar local</button>
            <button onClick={() => exportTeamData("visitante")} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white">Exportar visitante</button>
            <button onClick={() => importVisitRef.current?.click()} className="rounded-xl border border-rose-400 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100">Importar visitante</button>
            
          </div>
          <input ref={importFullRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) importJsonFile(file, "full"); e.currentTarget.value = ""; }} />
          <input ref={importLocalRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) importJsonFile(file, "local"); e.currentTarget.value = ""; }} />
          <input ref={importVisitRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) importJsonFile(file, "visitante"); e.currentTarget.value = ""; }} />
          <input ref={importRefereeRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) importJsonFile(file, "referee"); e.currentTarget.value = ""; }} />
          </div>
        </Section>


  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Calidad del dato" value={`${qualityScore.toFixed(0)}/100`} subtitle={qualityScore >= 75 ? "Buena base" : qualityScore >= 60 ? "Jugable" : "Floja"} />
          <StatCard title="Volatilidad" value={volatilityLabel} subtitle={`Score ${volatilityScore.toFixed(1)}`} />
          <StatCard title="Goles esperados" value={expectedTotalGoals.toFixed(2)} subtitle={`${expectedGoalsLocal.toFixed(2)} - ${expectedGoalsVisit.toFixed(2)}`} />
          <StatCard title="No bet zone" value={noBetReasons.length >= 2 ? "Activa" : "No"} subtitle={noBetReasons[0] ?? "Sin bloqueo fuerte"} />
        </div>



        
        <Section title="5.5 Ranking de etiquetas y favoritos" subtitle="Aquí se ordenan los equipos por fortaleza detectada en cada etiqueta o categoría para que puedas ir directo al mercado que más conviene.">
          <div className="grid gap-4 xl:grid-cols-3">
            {teamCategoryBoard.map((bucket) => (
              <div key={bucket.category} className="rounded-2xl border border-slate-700 bg-slate-800/90 p-4">
                <div className="text-sm font-semibold uppercase tracking-wide text-cyan-200">{bucket.category}</div>
                <div className="mt-3 space-y-2">
                  {bucket.teams.length ? bucket.teams.map((item, index) => (
                    <div key={`${bucket.category}-${item.profile.teamName}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm">
                      <span className="font-medium text-white">{index + 1}. {item.profile.teamName}</span>
                      <span className="text-cyan-200">{item.score.toFixed(1)}</span>
                    </div>
                  )) : <div className="text-sm text-slate-300">Sin equipos todavía.</div>}
                </div>
              </div>
            ))}

            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="text-sm font-semibold uppercase tracking-wide text-emerald-200">Equipos favoritos / que te hacen ganar</div>
              <div className="mt-3 space-y-2">
                {favoriteProfiles.length ? favoriteProfiles.map((profile) => (
                  <div key={`fav-${profile.teamName}-${profile.condition}`} className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-900">
                    <div className="font-semibold">{profile.teamName}</div>
                    <div className="text-xs text-slate-600">{profile.country || "Sin país"} · {profile.league || "Sin liga"}</div>
                  </div>
                )) : <div className="text-sm text-emerald-100">Marca equipos como favoritos dentro de local o visitante para verlos aquí.</div>}
              </div>
            </div>
          </div>
        </Section>

{savedTeams.length ? (
          <Section title="6. Perfiles guardados" subtitle="Liga, país y datos del equipo quedan listos para reutilizar.">
            <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {savedTeams.map((profile) => (
                  <div key={`${profile.teamName}-${profile.condition}`} className="rounded-2xl border border-slate-200 bg-white p-4 text-left">
                    <button onClick={() => loadTeamProfile(profile)} className="w-full text-left transition hover:opacity-90">
                      <div className="font-semibold text-slate-900">{profile.teamName}</div>
                      <div className="mt-1 text-sm text-slate-700">{profile.condition} · {profile.country || "Sin país"} · {profile.league || "Sin liga"}</div>
                      {profile.favorite ? <div className="mt-2 text-xs font-semibold text-emerald-700">Favorito</div> : null}
                    </button>
                    <button onClick={() => deleteTeamProfile(profile)} className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">Eliminar perfil</button>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-800/90 p-4">
                <div className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Equipos por país</div>
                <div className="mt-3 space-y-3">
                  {teamsByCountry.map(([country, profiles]) => (
                    <div key={country}>
                      <div className="font-semibold text-white">{country}</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {profiles.map((profile) => (
                          <span key={`${country}-${profile.teamName}-${profile.condition}`} className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-xs text-slate-200">
                            {profile.teamName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        ) : null}

    
        <Section title="7. Líneas reales de la casa" subtitle="Aquí cargas las cuotas reales de tu casa de apuestas. La app recalcula sobre esa línea real, no sobre una línea inventada.">
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3">
          <div className="mb-3 rounded-xl border border-cyan-400/30 bg-slate-950/40 px-3 py-2 text-sm text-cyan-100">Usa este bloque para guardar un perfil de cuotas que repites seguido y cargarlo más rápido en otros partidos. Los cambios de formato en línea/cuota no rompen la IA: solo mejoran cómo escribes decimales y luego el sistema los convierte al calcular.</div>
          <div className="flex flex-wrap gap-2">
            {(["result", "doubleChance", "goals", "btts", "corners", "cards", "shots", "shotsOnTarget", "teamGoals", "halftimeGoals"] as MarketFamily[]).map((family) => (
              <button key={family} onClick={() => addMarketLine(family)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900">
                + {getMarketFamilyLabel(family)}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Input value={String(minProb)} onChange={(v) => setMinProb(v === "" ? 56 : Number(v))} placeholder="Probabilidad mínima" type="number" />
            <Input value={String(minEdge)} onChange={(v) => setMinEdge(v === "" ? 3 : Number(v))} placeholder="Edge mínimo" type="number" />
            <Input value={marketPresetName} onChange={setMarketPresetName} placeholder="Nombre del perfil de cuotas" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={saveMarketPreset} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Guardar perfil</button>
            {savedPresets.map((name) => (
              <div key={name} className="flex items-center gap-2">
                <button onClick={() => loadMarketPreset(name)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900">
                  Cargar perfil: {name}
                </button>
                <button onClick={() => deleteMarketPreset(name)} className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  Eliminar
                </button>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {marketLines.map((line) => (
              <div key={line.id} className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-7">
                <Select
                  value={line.family}
                  onChange={(v) => updateMarketLine(line.id, { family: v as MarketFamily })}
                  options={["result", "doubleChance", "goals", "btts", "corners", "cards", "shots", "shotsOnTarget", "teamGoals", "halftimeGoals"]}
                />
                <Select
                  value={line.side ?? "total"}
                  onChange={(v) => updateMarketLine(line.id, { side: v as MarketLine["side"] })}
                  options={["total", "local", "visitante"]}
                />
                <Select
                  value={line.direction ?? "over"}
                  onChange={(v) => updateMarketLine(line.id, { direction: v as MarketLine["direction"] })}
                  options={line.family === "btts" ? ["yes", "no"] : line.family === "result" || line.family === "doubleChance" ? ["pick"] : ["over", "under"]}
                />
                <Input value={line.line || ""} onChange={(v) => updateMarketLine(line.id, { line: v })} placeholder="Línea" type="text" inputMode="decimal" />
                <Input value={line.odd} onChange={(v) => updateMarketLine(line.id, { odd: v })} placeholder="Cuota" type="text" inputMode="decimal" />
                <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                  <input type="checkbox" checked={line.enabled} onChange={(e) => updateMarketLine(line.id, { enabled: e.target.checked })} />
                  Activa
                </label>
                <button onClick={() => removeMarketLine(line.id)} className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">Eliminar</button>
                <div className="md:col-span-7 text-sm font-medium text-slate-700">{line.label}</div>
              </div>
            ))}
          </div>
          </div>
        </Section>

        <Section title="8. Lectura final y picks" subtitle={`Top pick, pick alternativo o no bet para ${matchDisplayName} según la línea real y tu filtro de edge. Recuerda: solo puede recomendar líneas que hayas cargado en la sección 7.`}>
          <div className="mb-4 rounded-3xl border border-slate-700/60 bg-[linear-gradient(135deg,rgba(15,23,42,.98),rgba(30,41,59,.94))] p-4 shadow-lg shadow-slate-950/30">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800 to-slate-900 p-4 shadow-inner shadow-slate-950/30">
                <div className="text-xs uppercase tracking-wide text-slate-400">Local</div>
                <div className="mt-1 text-lg font-bold text-white">{matchInfo.local || "Equipo local"}</div>
                <div className="mt-1 text-xs text-slate-400">{matchInfo.paisLocal || "Sin país cargado"}</div>
              </div>

              <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 p-4 text-center shadow-inner shadow-slate-950/20">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Lectura del partido</div>
                <div className="mt-2 text-[1.65rem] font-extrabold leading-tight text-white">{matchTypeInfo.label}</div>
                <div className="mx-auto mt-2 max-w-sm text-sm font-medium text-slate-100">{matchTypeInfo.description}</div>
              </div>

              <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800 to-slate-900 p-4 text-right shadow-inner shadow-slate-950/30">
                <div className="text-xs uppercase tracking-wide text-slate-400">Visitante</div>
                <div className="mt-1 text-lg font-bold text-white">{matchInfo.visitante || "Equipo visitante"}</div>
                <div className="mt-1 text-xs text-slate-400">{matchInfo.paisVisitante || "Sin país cargado"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-3">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Local gana" value={formatPct(simulation.localWin)} subtitle="Simulación" />
              <StatCard title="Empate" value={formatPct(simulation.draw)} subtitle="Simulación" />
              <StatCard title="Visitante gana" value={formatPct(simulation.awayWin)} subtitle="Simulación" />
              <StatCard title="BTTS Sí" value={formatPct(simulation.btts)} subtitle="Simulación" />
              <StatCard title="Corners esperados" value={expectedTotalCorners.toFixed(2)} subtitle="Línea real recalculable" />
              <StatCard title="Tarjetas esperadas" value={expectedTotalCards.toFixed(2)} subtitle={refInfo.sinConfirmar ? "Sin árbitro confirmado" : "Con árbitro"} />
              <StatCard title="Disparos esperados" value={expectedTotalShots.toFixed(2)} subtitle="Totales" />
              <StatCard title="A puerta esperados" value={expectedTotalShotsOnTarget.toFixed(2)} subtitle="Totales" />
              <StatCard title="Boost ofensivo" value={`${shotBoostInfo.total >= 0 ? "+" : ""}${shotBoostInfo.total.toFixed(2)}`} subtitle={shotBoostInfo.active ? "Partido roto detectado" : "Sin boost fuerte"} />
            </div>

            {shotBoostInfo.active ? (
              <div className="mt-5 rounded-2xl border border-fuchsia-300 bg-fuchsia-50 p-4 text-fuchsia-900">
                <div className="font-bold">Detector de partido roto / abierto activado</div>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {shotBoostInfo.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {shotBoostInfo.adjustedGoals >= 2.85 && expectedTotalShots >= 22 && expectedTotalShotsOnTarget >= 7 ? (
              <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
                <div className="font-bold">Prioridad ofensiva activada</div>
                <div className="mt-1 text-sm">En este tipo de partido, el ranking empuja arriba goles, BTTS, goles por equipo y ganador con dominancia. Tarjetas pierde prioridad.</div>
              </div>
            ) : null}

            {((expectedTotalShotsOnTarget >= 6.4 && expectedTotalShots >= 14) || (shotBoostInfo.total >= 0.35 && expectedTotalShotsOnTarget >= 6) || (simulation.draw >= 35 && expectedTotalShotsOnTarget >= 5 && expectedTotalShots >= 12)) ? (
              <div className="mt-4 rounded-2xl border border-orange-300 bg-orange-50 p-4 text-orange-900">
                <div className="font-bold">Bloqueo de under corto activado</div>
                <div className="mt-1 text-sm">La app detecta suficiente volumen ofensivo como para castigar under 1.5 y under 2.5.</div>
              </div>
            ) : null}

 <Section title="6.5 Cruce IA: Local vs Visitante" subtitle="Este bloque compara perfiles entre local y visitante para sugerir mercados lógicos según el cruce de etiquetas y métricas.">
          <div className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-3">
            <div className="mb-3 rounded-xl border border-fuchsia-400/30 bg-slate-950/40 px-3 py-2 text-sm text-fuchsia-100">
              {matchDisplayName}. Aquí la app cruza fortalezas del local contra debilidades del visitante, y viceversa, para sugerir mercados por lógica de perfiles.
            </div>

            {crossSuggestions.length ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {crossSuggestions.map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    className={`rounded-2xl border p-4 ${
                      item.side === "local"
                        ? "border-sky-300 bg-sky-50"
                        : item.side === "visitante"
                        ? "border-rose-300 bg-rose-50"
                        : "border-violet-300 bg-violet-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                        Cruce {index + 1}
                      </div>
                      <div className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-900">
                        {formatPct(item.confidence)}
                      </div>
                    </div>
                    <div className="mt-2 text-lg font-bold text-slate-900">{item.title}</div>
                    <div className="mt-2 text-sm text-slate-700">{item.explanation}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.picks.map((pick) => (
                        <span key={pick} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-900">
                          {pick}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-700">
                Aún no hay suficiente cruce limpio entre ambos perfiles. Llena más partidos o afina local/visitante para que la IA compare mejor.
              </div>
            )}
          </div>
        </Section>


            <div className="mt-5 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Historial de choque IA</div>
                  <div className="mt-1 text-sm text-slate-100">Carga el último duelo directo y la app lo compara contra lo que hoy espera tu modelo.</div>
                </div>
                <label className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-slate-950/30 px-3 py-2 text-sm text-cyan-100">
                  <input
                    type="checkbox"
                    checked={headToHeadInfo.played}
                    onChange={(e) => setHeadToHeadInfo((prev) => ({ ...prev, played: e.target.checked }))}
                  />
                  Hubo duelo reciente
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Input value={headToHeadInfo.fecha} onChange={(v) => setHeadToHeadInfo((prev) => ({ ...prev, fecha: v }))} placeholder="Fecha del último duelo" type="date" />
                <Input value={headToHeadInfo.anteriorLocal} onChange={(v) => setHeadToHeadInfo((prev) => ({ ...prev, anteriorLocal: v }))} placeholder="Local anterior" list="team-names" />
                <Input value={headToHeadInfo.anteriorVisitante} onChange={(v) => setHeadToHeadInfo((prev) => ({ ...prev, anteriorVisitante: v }))} placeholder="Visitante anterior" list="team-names" />
                <TextArea value={headToHeadInfo.notas} onChange={(v) => setHeadToHeadInfo((prev) => ({ ...prev, notas: v }))} placeholder="Lectura manual del choque anterior" />
                <Input value={headToHeadInfo.golesLocal} onChange={(v) => setHeadToHeadInfo((prev) => ({ ...prev, golesLocal: v === "" ? "" : Number(v) }))} placeholder="Goles local" type="number" inputMode="numeric" />
                <Input value={headToHeadInfo.golesVisitante} onChange={(v) => setHeadToHeadInfo((prev) => ({ ...prev, golesVisitante: v === "" ? "" : Number(v) }))} placeholder="Goles visitante" type="number" inputMode="numeric" />
                <Input value={headToHeadInfo.cornersTotal} onChange={(v) => setHeadToHeadInfo((prev) => ({ ...prev, cornersTotal: v === "" ? "" : Number(v) }))} placeholder="Corners totales" type="number" inputMode="numeric" />
                <Input value={headToHeadInfo.tarjetasTotal} onChange={(v) => setHeadToHeadInfo((prev) => ({ ...prev, tarjetasTotal: v === "" ? "" : Number(v) }))} placeholder="Tarjetas totales" type="number" inputMode="numeric" />
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-700/60 bg-slate-950/35 p-4">
                  <div className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Comparador duelo anterior vs partido actual</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <StatCard title="Ganador anterior" value={headToHeadAnalysis.previousWinner} subtitle={headToHeadInfo.fecha || "Sin fecha"} />
                    <StatCard title="Lectura próximo duelo" value={headToHeadAnalysis.projectedWinner} subtitle="Proyección IA" />
                    <StatCard title="Goles anteriores" value={headToHeadAnalysis.available ? String(headToHeadAnalysis.previousGoals) : "-"} subtitle={`Esperados hoy ${expectedTotalGoals.toFixed(2)}`} />
                    <StatCard title="Corners anteriores" value={headToHeadAnalysis.available ? String(headToHeadAnalysis.previousCorners || "-") : "-"} subtitle={`Esperados hoy ${expectedTotalCorners.toFixed(2)}`} />
                    <StatCard title="Tarjetas anteriores" value={headToHeadAnalysis.available ? String(headToHeadAnalysis.previousCards || "-") : "-"} subtitle={`Esperadas hoy ${expectedTotalCards.toFixed(2)}`} />
                    <StatCard title="Resultado esperado hoy" value={simulation.localWin > simulation.awayWin ? `${matchInfo.local || "Local"} mejor` : simulation.awayWin > simulation.localWin ? `${matchInfo.visitante || "Visitante"} mejor` : "Muy parejo"} subtitle={`Empate ${formatPct(simulation.draw)}`} />
                  </div>
                </div>

                <div className="rounded-2xl border border-cyan-300/30 bg-white/5 p-4">
                  <div className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Lectura IA del historial</div>
                  <div className="mt-3 space-y-3 text-sm text-slate-100">
                    <div className="rounded-xl border border-slate-700/60 bg-slate-950/35 p-3">{headToHeadAnalysis.outcomeText}</div>
                    <div className="rounded-xl border border-slate-700/60 bg-slate-950/35 p-3">{headToHeadAnalysis.goalsText}</div>
                    <div className="rounded-xl border border-slate-700/60 bg-slate-950/35 p-3">{headToHeadAnalysis.cornersText}</div>
                    <div className="rounded-xl border border-slate-700/60 bg-slate-950/35 p-3">{headToHeadAnalysis.cardsText}</div>
                    {headToHeadInfo.notas.trim() ? (
                      <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-amber-100">Apunte manual: {headToHeadInfo.notas}</div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                <div className="rounded-2xl border border-sky-300/30 bg-sky-500/10 p-4">
                  <div className="text-sm font-semibold uppercase tracking-wide text-sky-100">Cómo ha mejorado {matchInfo.local || "el local"}</div>
                  <div className="mt-2 text-sm text-slate-100">{headToHeadAnalysis.improvementTextLocal}</div>
                </div>
                <div className="rounded-2xl border border-violet-300/30 bg-violet-500/10 p-4">
                  <div className="text-sm font-semibold uppercase tracking-wide text-violet-100">Cómo ha mejorado {matchInfo.visitante || "el visitante"}</div>
                  <div className="mt-2 text-sm text-slate-100">{headToHeadAnalysis.improvementTextVisit}</div>
                </div>
                <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4">
                  <div className="text-sm font-semibold uppercase tracking-wide text-emerald-100">Quién llega mejor preparado</div>
                  <div className="mt-2 text-sm text-slate-100">{headToHeadAnalysis.prepText}</div>
                </div>
              </div>
            </div>

            {hardNoBet ? (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
                <div className="font-bold">NO BET sugerido</div>
                <div className="mt-1 text-sm">El partido no pasa el filtro final. Mejor saltarlo que forzar entrada.</div>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {noBetReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {[topPick, altPick].map((pick, index) => {
                const palette =
                  index === 0
                    ? { box: "border-emerald-200 bg-emerald-50", title: "text-emerald-700", body: "text-emerald-900", label: "Top pick" }
                    : { box: "border-blue-200 bg-blue-50", title: "text-blue-700", body: "text-blue-900", label: "Pick alternativo" };

                return (
                  <div key={index} className={`rounded-2xl border p-4 ${palette.box}`}>
                    <div className={`text-sm font-semibold uppercase tracking-wide ${palette.title}`}>{palette.label}</div>
                    {pick ? (
                      <>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${classifyPickTier(pick.probability, pick.edge).badge}`}>
                            {pick.fallback ? "Respaldo" : pick.tier}
                          </span>
                          <span className="inline-flex rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                            Confianza real {formatPct(pick.realConfidence)}
                          </span>
                        </div>
                        <div className={`mt-2 text-2xl font-bold ${palette.body}`}>{pick.label}</div>
                        <div className={`mt-2 text-sm ${palette.body}`}>Probabilidad: {formatPct(pick.probability)} · Casa: {formatPct(pick.implied)} · Edge: {pick.edge.toFixed(1)} · Prioridad: {pick.marketPriority.toFixed(0)}</div>
                        <div className={`mt-2 text-sm ${palette.body}`}>{pick.reason}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => setPickDecision(pick.id, "selected")}
                            className={`rounded-xl px-3 py-2 text-sm font-semibold ${pickDecisions[pick.id] === "selected" ? "bg-emerald-600 text-white" : "border border-emerald-300 bg-white text-emerald-700"}`}
                          >
                            {pickDecisions[pick.id] === "selected" ? "Tomado" : "Tomar"}
                          </button>
                          <button
                            onClick={() => setPickDecision(pick.id, "discarded")}
                            className={`rounded-xl px-3 py-2 text-sm font-semibold ${pickDecisions[pick.id] === "discarded" ? "bg-rose-600 text-white" : "border border-rose-300 bg-white text-rose-700"}`}
                          >
                            {pickDecisions[pick.id] === "discarded" ? "Descartado" : "Descartar"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className={`mt-2 text-sm ${palette.body}`}>No hay pick limpio para esta posición.</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold uppercase tracking-wide text-slate-700">Resumen de tus picks elegidos</div>
                {selectedPicks.length ? (
                  <>
                    <div className="mt-3 space-y-2">
                      {selectedPicks.map((pick) => (
                        <div key={`sel-${pick.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="font-semibold text-slate-900">{pick.label}</div>
                          <div className="mt-1 text-sm text-slate-700">Prob. {formatPct(pick.probability)} · Conf. real {formatPct(pick.realConfidence)} · Edge {pick.edge.toFixed(1)}</div>
                        </div>
                      ))}
                    </div>
                    {simulatedTicket ? (
                      <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-cyan-900">
                        <div className="font-semibold">Ticket {simulatedTicket.profile}</div>
                        <div className="mt-1 text-sm">Probabilidad combinada aprox.: {formatPct(simulatedTicket.combinedProbability)}</div>
                        <div className="mt-1 text-sm">Golpearía {simulatedTicket.expectedHitsPer10.toFixed(1)} de cada 10 tickets parecidos.</div>
                        <div className="mt-1 text-sm">Edge medio: {simulatedTicket.averageEdge.toFixed(1)}</div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-3 text-sm text-slate-700">Usa Tomar para armar un ticket dentro de la app. Si descartas uno, el siguiente sube automáticamente.</div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold uppercase tracking-wide text-slate-700">Simulación rápida</div>
                <div className="mt-3 space-y-2">
                  {visiblePicks.length ? visiblePicks.slice(0, 5).map((pick) => (
                    <div key={`sim-${pick.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="font-semibold text-slate-900">{pick.label}</div>
                      <div className="mt-1 text-sm text-slate-700">
                        Sale aproximadamente <span className="font-semibold">{(pick.probability / 10).toFixed(1)} de cada 10</span> simulaciones simples.
                      </div>
                    </div>
                  )) : <div className="text-sm text-slate-700">No quedan picks visibles porque fueron descartados o no cumplen filtro.</div>}
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-700 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-200 text-left text-slate-900">
                  <tr>
                    <th className="px-3 py-2">Mercado</th>
                    <th className="px-3 py-2">Prob.</th>
                    <th className="px-3 py-2">Casa</th>
                    <th className="px-3 py-2">Edge</th>
                    <th className="px-3 py-2">Riesgo</th>
                    <th className="px-3 py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePicks.map((pick) => (
                    <tr key={pick.id} className="border-t border-slate-200 text-slate-800">
                      <td className="px-3 py-2 font-medium text-slate-900">{pick.label}</td>
                      <td className="px-3 py-2">{formatPct(pick.probability)}</td>
                      <td className="px-3 py-2">{formatPct(pick.implied)}</td>
                      <td className="px-3 py-2">{pick.edge.toFixed(1)}</td>
                      <td className="px-3 py-2">{pick.risk}</td>
                      <td className="px-3 py-2 text-slate-700">{pick.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function TeamBlock({
  title,
  side,
  teamName,
  rows,
  onRowChange,
  onSave,
  stats,
  tags,
  meta,
  onMetaChange,
  suggestions,
}: {
  title: string;
  side: TeamCondition;
  teamName: string;
  rows: TeamRow[];
  onRowChange: (side: TeamCondition, index: number, field: keyof TeamRow, raw: string) => void;
  onSave: () => void;
  stats: StatSummary;
  tags: string[];
  meta: TeamMeta;
  onMetaChange: (patch: Partial<TeamMeta>) => void;
  suggestions: string[];
}) {
  const shiftRows = () => {
    const filledRows = rows.filter(
      (row) =>
        row.rival.trim() ||
        row.fecha.trim() ||
        row.gf !== "" ||
        row.gc !== "" ||
        row.ownCorners !== "" ||
        row.oppCorners !== "" ||
        row.ownYellow !== "" ||
        row.oppYellow !== "" ||
        row.ownRed !== "" ||
        row.oppRed !== "" ||
        row.xg !== "" ||
        row.xgAgainst !== "" ||
        row.shots !== "" ||
        row.shotsAgainst !== "" ||
        row.shotsOnTarget !== "" ||
        row.shotsOnTargetAgainst !== ""
    );

    if (!filledRows.length) return;

    const ordered = [...filledRows]
      .sort((a, b) => {
        const da = a.fecha ? new Date(`${a.fecha}T12:00:00`).getTime() : 0;
        const db = b.fecha ? new Date(`${b.fecha}T12:00:00`).getTime() : 0;
        return db - da;
      })
      .slice(0, 9);

    const nextRows = [createEmptyRow(), ...ordered].slice(0, 10);

    nextRows.forEach((row, index) => {
      const fields: (keyof TeamRow)[] = [
        "rival",
        "fecha",
        "gf",
        "gc",
        "ownCorners",
        "oppCorners",
        "ownYellow",
        "oppYellow",
        "ownRed",
        "oppRed",
        "xg",
        "xgAgainst",
        "shotsOnTarget",
        "shotsOnTargetAgainst",
        "shots",
        "shotsAgainst",
        "estado",
      ];

      fields.forEach((field) => {
        const value = row[field];
        onRowChange(side, index, field, value === "" ? "" : String(value));
      });
    });
  };

  return (
    <Section title={title} subtitle="Últimos partidos. Lo ideal es llenar al menos 6 con fechas recientes.">
      <div className={`rounded-2xl border p-3 ${side === "local" ? "border-blue-500/30 bg-blue-500/10" : "border-rose-500/30 bg-rose-500/10"}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-lg font-semibold text-white">{teamName || (side === "local" ? "Local" : "Visitante")}</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={shiftRows}
              className="rounded-xl border border-sky-400 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100"
              title="Mueve los partidos recientes y deja una fila nueva arriba. El más antiguo sale si ya tenías 10."
            >
              Desplazar filas
            </button>
            <button onClick={onSave} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Guardar perfil
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <StatCard title="Partidos" value={String(stats.count)} subtitle={`Frescura: ${stats.freshnessLabel}`} />
          <StatCard title="GF / GC" value={`${stats.gfAvg.toFixed(2)} / ${stats.gcAvg.toFixed(2)}`} subtitle="Promedio" />
          <StatCard title="Corners / Tarjetas" value={`${stats.totalCornersWeighted.toFixed(2)} / ${stats.totalCardsWeighted.toFixed(2)}`} subtitle="Ponderado" />
        </div>

        <div className="mb-2 grid gap-3 md:grid-cols-4">
          <Select value={meta.style} onChange={(v) => onMetaChange({ style: v as TeamStyle })} options={TEAM_STYLES} />
          <Input value={meta.idealMarkets} onChange={(v) => onMetaChange({ idealMarkets: v })} placeholder="Mercados ideales: goles, corners..." />
          <Input value={meta.notes} onChange={(v) => onMetaChange({ notes: v })} placeholder="Notas del equipo" />
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
            <input type="checkbox" checked={meta.favorite} onChange={(e) => onMetaChange({ favorite: e.target.checked })} />
            Equipo favorito
          </label>
        </div>

        <div className="mb-4 grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
            <span className="font-semibold text-white">Estilo:</span> marca cómo juega el equipo. Si no estás seguro, deja <span className="font-semibold">Mixto</span>.
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
            <span className="font-semibold text-white">Mercados ideales:</span> escribe lo que te suele servir, por ejemplo <span className="font-semibold">goles, corners</span>.
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
            <span className="font-semibold text-white">Notas:</span> guarda detalles tuyos como <span className="font-semibold">empieza lento</span> o <span className="font-semibold">concede mucho</span>.
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {tags.length ? (
            tags.map((tag) => (
              <span key={tag} className={`rounded-full border px-3 py-1 text-xs font-semibold ${tagClass(tag)}`}>
                {tag}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-200">Sin etiquetas automáticas todavía.</span>
          )}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-700">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-200">
              <tr>
                {[
                  "Rival",
                  "Fecha",
                  "GF",
                  "GC",
                  "Corners+",
                  "Corners-",
                  "TA+",
                  "TA-",
                  "TR+",
                  "TR-",
                  "xG",
                  "xGA",
                  "A puerta+",
                  "A puerta-",
                  "Shots+",
                  "Shots-",
                  "Estado",
                ].map((head) => (
                  <th key={head} className="px-2 py-2 text-left font-semibold">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${side}-${index}`} className="border-t border-slate-700 even:bg-slate-900/40">
                  <td className="px-2 py-2">
                    <input
                      list="rival-suggestions"
                      className="w-36 rounded border border-slate-500 bg-slate-800 px-2 py-1 text-sm text-white"
                      value={row.rival}
                      onChange={(e) => onRowChange(side, index, "rival", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="date"
                      className="w-28 rounded border border-slate-500 bg-slate-800 px-2 py-1 text-sm text-white"
                      value={row.fecha}
                      onChange={(e) => onRowChange(side, index, "fecha", e.target.value)}
                    />
                  </td>
                  {([
                    "gf",
                    "gc",
                    "ownCorners",
                    "oppCorners",
                    "ownYellow",
                    "oppYellow",
                    "ownRed",
                    "oppRed",
                    "xg",
                    "xgAgainst",
                    "shotsOnTarget",
                    "shotsOnTargetAgainst",
                    "shots",
                    "shotsAgainst",
                  ] as (keyof TeamRow)[]).map((field) => {
                    const isDecimalField = field === "xg" || field === "xgAgainst";
                    return (
                      <td key={field} className="px-2 py-2">
                        <input
                          type={isDecimalField ? "text" : "number"}
                          inputMode={isDecimalField ? "decimal" : "numeric"}
                          className="w-16 rounded border border-slate-500 bg-slate-800 px-2 py-1 text-sm text-white"
                          value={String(row[field] ?? "")}
                          onChange={(e) => onRowChange(side, index, field, e.target.value)}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2">
                    <select
                      className="w-16 rounded border border-slate-500 bg-slate-800 px-2 py-1 text-sm text-white"
                      value={row.estado}
                      onChange={(e) => onRowChange(side, index, "estado", e.target.value)}
                    >
                      <option value=""></option>
                      <option value="G">G</option>
                      <option value="E">E</option>
                      <option value="P">P</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}



function buildLabel(family: MarketFamily, side: "local" | "visitante" | "total", line?: string, direction?: MarketLine["direction"]) {
  const teamLabel = side === "local" ? "Local" : side === "visitante" ? "Visitante" : "Total";
  if (family === "result") return side === "local" ? "Local gana" : "Visitante gana";
  if (family === "doubleChance") return side === "local" ? "Local o empate" : "Visitante o empate";
  if (family === "btts") return direction === "no" ? "BTTS No" : "BTTS Sí";
  if (family === "goals") return `${direction === "under" ? "Menos de" : "Más de"} ${line || "1.5"} goles`;
  if (family === "corners") return `${direction === "under" ? "Menos de" : "Más de"} ${line || "8.5"} corners`;
  if (family === "cards") return `${direction === "under" ? "Menos de" : "Más de"} ${line || "3.5"} tarjetas`;
  if (family === "shots") return `${direction === "under" ? "Menos de" : "Más de"} ${line || "18.5"} disparos`;
  if (family === "shotsOnTarget") return `${direction === "under" ? "Menos de" : "Más de"} ${line || "5.5"} remates a puerta`;
  if (family === "teamGoals") return `${teamLabel} ${direction === "under" ? "menos de" : "más de"} ${line || "0.5"} goles`;
  if (family === "halftimeGoals") return `1ª mitad ${direction === "under" ? "menos de" : "más de"} ${line || "0.5"} goles`;
  return family;
}

function buildDefaultMarketLines(): MarketLine[] {
  return [
    { id: makeId(), family: "goals", label: "Más de 1.5 goles", odd: "", line: "1.5", direction: "over", side: "total", enabled: true },
    { id: makeId(), family: "goals", label: "Más de 2.5 goles", odd: "", line: "2.5", direction: "over", side: "total", enabled: true },
    { id: makeId(), family: "goals", label: "Menos de 4.5 goles", odd: "", line: "4.5", direction: "under", side: "total", enabled: true },
    { id: makeId(), family: "corners", label: "Más de 8.5 corners", odd: "", line: "8.5", direction: "over", side: "total", enabled: true },
    { id: makeId(), family: "cards", label: "Más de 3.5 tarjetas", odd: "", line: "3.5", direction: "over", side: "total", enabled: true },
    { id: makeId(), family: "doubleChance", label: "Local o empate", odd: "", line: "", direction: "pick", side: "local", enabled: true },
  ];
}