"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type TeamSide = "local" | "visitante" | "h2h" | "ambos";
type MatchResult = "" | "G" | "E" | "P";
type Grade = "safe" | "reasonable" | "risky";
type MatchProfileType = "abierto" | "cerrado" | "trampa" | "equilibrado";

type Indicator = {
  id: string;
  team: TeamSide;
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
};

type RecentRow = {
  id: string;
  goalsFor: string;
  goalsAgainst: string;
  corners: string;
  cards: string;
  result: MatchResult;
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

type ExportShape = {
  version: number;
  exportedAt: string;
  match: Match;
  indicators: Indicator[];
  localRecent: RecentRow[];
  visitRecent: RecentRow[];
};

const STORAGE_KEY = "analizador_pro_h2h_licuadora_v2";

const MARKET_OPTIONS = [
  { label: "Sin derrotas", value: "sin_derrotas", line: "" },
  { label: "Sin victorias", value: "sin_victorias", line: "" },
  { label: "Más de 2.5 goles", value: "over_2_5", line: "2.5" },
  { label: "Más de 1.5 goles", value: "over_1_5", line: "1.5" },
  { label: "Menos de 2.5 goles", value: "under_2_5", line: "2.5" },
  { label: "Menos de 4.5 goles", value: "under_4_5", line: "4.5" },
  { label: "Más de 5.5 corners", value: "over_5_5_corners", line: "5.5" },
  { label: "Más de 6.5 corners", value: "over_6_5_corners", line: "6.5" },
  { label: "Menos de 10.5 corners", value: "under_10_5_corners", line: "10.5" },
  { label: "Menos de 14.5 corners", value: "under_14_5_corners", line: "14.5" },
  { label: "Ambos marcan", value: "btts", line: "Sí" },
  { label: "Más de 2.5 tarjetas", value: "over_2_5_cards", line: "2.5" },
  { label: "Más de 4.5 tarjetas", value: "over_4_5_cards", line: "4.5" },
  { label: "Menos de 4.5 tarjetas", value: "under_4_5_cards", line: "4.5" },
  { label: "Menos de 6.5 tarjetas", value: "under_6_5_cards", line: "6.5" },
  { label: "Ninguna portería a cero", value: "no_clean", line: "Sí" },
  { label: "Ganador", value: "ganador", line: "" },
  { label: "Empate", value: "empate", line: "" },
  { label: "Local o empate", value: "local_o_empate", line: "1X" },
  { label: "Visitante o empate", value: "visitante_o_empate", line: "X2" },
  { label: "Local o visitante", value: "local_o_visitante", line: "12" },
];

const TEAM_OPTIONS: { label: string; value: TeamSide }[] = [
  { label: "🏠 Local", value: "local" },
  { label: "✈️ Visitante", value: "visitante" },
  { label: "🤝 H2H", value: "h2h" },
  { label: "🔥 Ambos", value: "ambos" },
];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyRecentRow(): RecentRow {
  return {
    id: makeId(),
    goalsFor: "",
    goalsAgainst: "",
    corners: "",
    cards: "",
    result: "",
  };
}

function createRecentRows() {
  return Array.from({ length: 3 }, () => emptyRecentRow());
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
  return Math.min(100, Math.max(0, (a / b) * 100));
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

function getGrade(score: number, flags: string[]): Grade {
  const seriousFlags = flags.filter((flag) => flag.includes("Contradicción") || flag.includes("bloquea") || flag.includes("Bloqueado") || flag.includes("sin value"));
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
      row.corners !== "" ||
      row.cards !== "" ||
      row.result !== ""
  );
}

function buildRecentStats(rows: RecentRow[]) {
  const valid = countValidRows(rows);
  const goalsFor = valid.map((row) => toNumber(row.goalsFor));
  const goalsAgainst = valid.map((row) => toNumber(row.goalsAgainst));
  const totalGoals = valid.map((row) => toNumber(row.goalsFor) + toNumber(row.goalsAgainst));
  const corners = valid.map((row) => toNumber(row.corners));
  const cards = valid.map((row) => toNumber(row.cards));

  const btts = valid.filter((row) => toNumber(row.goalsFor) > 0 && toNumber(row.goalsAgainst) > 0).length;
  const noClean = valid.filter((row) => toNumber(row.goalsAgainst) > 0).length;
  const noLose = valid.filter((row) => row.result === "G" || row.result === "E").length;
  const noWin = valid.filter((row) => row.result === "E" || row.result === "P").length;
  const wins = valid.filter((row) => row.result === "G").length;
  const draws = valid.filter((row) => row.result === "E").length;

  return {
    count: valid.length,
    goalsForAvg: average(goalsFor),
    goalsAgainstAvg: average(goalsAgainst),
    totalGoalsAvg: average(totalGoals),
    cornersAvg: average(corners),
    cardsAvg: average(cards),
    bttsPct: valid.length ? (btts / valid.length) * 100 : 0,
    noCleanPct: valid.length ? (noClean / valid.length) * 100 : 0,
    noLosePct: valid.length ? (noLose / valid.length) * 100 : 0,
    noWinPct: valid.length ? (noWin / valid.length) * 100 : 0,
    winPct: valid.length ? (wins / valid.length) * 100 : 0,
    drawPct: valid.length ? (draws / valid.length) * 100 : 0,
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
  const local = buildRecentStats(localRows);
  const visit = buildRecentStats(visitRows);
  const avgGoals = average([local.totalGoalsAvg, visit.totalGoalsAvg].filter((n) => n > 0));
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
  const notes: string[] = [];

  if (type === "abierto") notes.push("Perfil abierto: BTTS/no portería a cero/goles recientes empujan contra unders agresivos.");
  if (type === "cerrado") notes.push("Perfil cerrado: under goles/corners puede tener más sentido, pero evita cuotas muy bajas.");
  if (type === "trampa") notes.push("Perfil trampa: SofaScore mezcla under con señales de gol. Evita parlay grande.");
  if (blockUnderGoals) notes.push("Bloqueo preventivo: Under 2.5 queda castigado por señales ofensivas.");
  if (cornerUnderSignal >= 70) notes.push("Corners under viene mostrando estabilidad en las pruebas.");
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

function marketSortPenalty(marketValue: string, blendedScore: number, count: number) {
  // Tarjetas no deben dominar siempre, pero tampoco desaparecer.
  // Las mandamos detrás de corners/goles si están cerca en puntaje.
  if (!isCardMarket(marketValue)) return 0;
  if (blendedScore >= 90 && count >= 2) return 3;
  if (blendedScore >= 82 && count >= 2) return 7;
  if (blendedScore >= 75) return 10;
  return 16;
}

function scoreMarketFromRecent(marketValue: string, line: string, localRows: RecentRow[], visitRows: RecentRow[]) {
  const local = buildRecentStats(localRows);
  const visit = buildRecentStats(visitRows);
  const totalCount = local.count + visit.count;

  if (totalCount === 0) return 0;

  const avgTotalGoals = average([local.totalGoalsAvg, visit.totalGoalsAvg].filter((n) => n > 0));
  const avgCorners = average([local.cornersAvg, visit.cornersAvg].filter((n) => n > 0));
  const avgCards = average([local.cardsAvg, visit.cardsAvg].filter((n) => n > 0));
  const lineNumber = toNumber(line);

  if (marketValue === "over_2_5") return Math.min(100, Math.max(0, 50 + (avgTotalGoals - 2.5) * 22));
  if (marketValue === "over_1_5") return Math.min(100, Math.max(0, 60 + (avgTotalGoals - 1.5) * 18));
  if (marketValue === "under_2_5") return Math.min(100, Math.max(0, 55 + (2.5 - avgTotalGoals) * 22));
  if (marketValue === "under_4_5") return Math.min(100, Math.max(0, 65 + (4.5 - avgTotalGoals) * 12));
  if (marketValue === "btts") return average([local.bttsPct, visit.bttsPct].filter((n) => n >= 0));
  if (marketValue === "no_clean") return average([local.noCleanPct, visit.noCleanPct].filter((n) => n >= 0));
  if (marketValue.includes("corners")) {
    if (marketValue.includes("over")) return Math.min(100, Math.max(0, 50 + (avgCorners - lineNumber) * 12));
    if (marketValue.includes("under")) return Math.min(100, Math.max(0, 55 + (lineNumber - avgCorners) * 10));
  }
  if (isCardMarket(marketValue)) {
    // Tarjetas dependen mucho de árbitro/contexto. Las dejamos más conservadoras para que no dominen siempre.
    if (marketValue.includes("over")) return clamp(45 + (avgCards - lineNumber) * 12, 0, 88);
    if (marketValue.includes("under")) return clamp(50 + (lineNumber - avgCards) * 10, 0, 88);
  }
  if (marketValue === "sin_derrotas") return Math.max(local.noLosePct, visit.noLosePct);
  if (marketValue === "sin_victorias") return Math.max(local.noWinPct, visit.noWinPct);
  if (marketValue === "ganador") return Math.max(local.winPct, visit.winPct);
  if (marketValue === "empate") return average([local.drawPct, visit.drawPct].filter((n) => n >= 0));
  if (marketValue === "local_o_empate") return local.noLosePct;
  if (marketValue === "visitante_o_empate") return visit.noLosePct;
  if (marketValue === "local_o_visitante") return clamp(100 - average([local.drawPct, visit.drawPct].filter((n) => n >= 0)), 0, 100);

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
  if (strong.has("ganador_") && strong.has("empate_")) {
    alerts.push("Ganador y empate aparecen fuertes: evitar 1X2 directo.");
  }

  return alerts;
}

function safeReadStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("analizador_pro_h2h_moderno_v1") || localStorage.getItem("simpleApp");
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ExportShape>;
  } catch {
    return null;
  }
}

function formatScore(score: number) {
  return `${score.toFixed(1)}%`;
}

export default function Page() {
  const importRef = useRef<HTMLInputElement | null>(null);

  const [match, setMatch] = useState<Match>({
    local: "",
    visitante: "",
    oddLocal: "",
    oddDraw: "",
    oddVisit: "",
  });

  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [localRecent, setLocalRecent] = useState<RecentRow[]>(createRecentRows());
  const [visitRecent, setVisitRecent] = useState<RecentRow[]>(createRecentRows());

  const addIndicator = () => {
    setIndicators((prev) => [
      ...prev,
      { id: makeId(), team: "ambos", market: "", line: "", record: "", houseOdd: "" },
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

  const matchProfile = useMemo(() => buildMatchProfile(indicators, localRecent, visitRecent), [indicators, localRecent, visitRecent]);

  const results = useMemo<ResultPick[]>(() => {
    const grouped: Record<string, Indicator[]> = {};

    indicators.forEach((indicator) => {
      const marketValue = getMarketValue(indicator.market);
      const pct = parseRecord(indicator.record);
      if (!marketValue || pct <= 0) return;
      const key = `${marketValue}_${indicator.line || ""}`;
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
        const recentScore = scoreMarketFromRecent(marketValue, line, localRecent, visitRecent);
        let blendedScore = recentScore > 0 ? confidence * 0.68 + recentScore * 0.32 : confidence;
        const riskFlags: string[] = [];

        if (isUnderGoalMarket(marketValue) && matchProfile.blockUnderGoals) {
          blendedScore = clamp(blendedScore - (marketValue === "under_2_5" ? 30 : 14), 0, 100);
          riskFlags.push("Bloqueado/castigado: hay BTTS, no clean sheet o perfil abierto contra el under de goles.");
        }

        if (isOverGoalMarket(marketValue) && matchProfile.type === "abierto") {
          blendedScore = clamp(blendedScore + 8, 0, 100);
        }

        if (isCardMarket(marketValue)) {
          // Castigo moderado: no queremos que tarjetas sea siempre #1, pero sí debe aparecer si es fuerte.
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
  }, [indicators, localRecent, visitRecent, matchProfile]);

  const contradictionAlerts = useMemo(() => detectContradictions(results), [results]);

  const analysis = useMemo(() => {
    if (!results.length) return null;

    const playable = results.filter((pick) => pick.blendedScore >= 58);
    const nonCardPlayable = playable.filter((pick) => !isCardMarket(pick.marketValue));
    const bestOverall = playable[0] || results[0];
    const bestNonCard = nonCardPlayable[0];
    // Si tarjetas supera por mucho, puede ser mejor pick. Si no, priorizamos otro mercado.
    const best = isCardMarket(bestOverall.marketValue) && bestNonCard && bestOverall.blendedScore - bestNonCard.blendedScore < 8
      ? bestNonCard
      : bestOverall;
    const hasHardContradiction = contradictionAlerts.length > 0;

    let decision = "⚠️ Evaluar";
    let detail = "Hay señales, pero falta confirmar cuota o contexto.";

    if (hasHardContradiction || matchProfile.type === "trampa") {
      decision = "⚠️ JUGAR CONSERVADOR";
      detail = "Hay contradicciones o perfil trampa. Evita parlay grande y busca línea más protegida.";
    }
    if (!hasHardContradiction && matchProfile.type !== "trampa" && best.grade === "safe" && (best.value >= 5 || best.avgOdd === 0)) {
      decision = "🔥 JUGAR";
      detail = "La señal principal tiene buena fuerza y los registros no la contradicen.";
    }
    if (isCardMarket(best.marketValue) && best.avgOdd === 0) {
      decision = best.blendedScore >= 82 ? "⚠️ JUGAR CONSERVADOR" : "⚠️ Evaluar";
      detail = "Tarjetas tiene buena señal, pero depende de árbitro/contexto. Mejor usarla solo si la cuota acompaña o como selección secundaria.";
    }
    if (best.grade === "risky") {
      decision = "❌ NO JUGAR";
      detail = "No hay suficiente fuerza o hay demasiado riesgo oculto.";
    }

    return { best, decision, detail };
  }, [results, contradictionAlerts, matchProfile]);

  const parlaySuggestions = useMemo(() => {
    const familyOf = (market: string) => {
      if (isCardMarket(market)) return "cards";
      if (market.includes("corners")) return "corners";
      if (isGoalMarket(market)) return "goals";
      if (["ganador", "empate", "sin_derrotas", "local_o_empate", "visitante_o_empate", "local_o_visitante"].includes(market)) return "result";
      return market;
    };

    const build = (mode: "conservador" | "riesgoso") => {
      const allowed: ResultPick[] = [];
      const usedFamilies = new Set<string>();

      for (const pick of results) {
        if (pick.grade === "risky") continue;
        if (pick.riskFlags.some((flag) => flag.includes("sin value") || flag.includes("Bloqueado"))) continue;
        if (isCardMarket(pick.marketValue) && (pick.blendedScore < 76 || pick.count < 2)) continue;
        if (mode === "conservador" && (pick.marketValue === "btts" || pick.marketValue === "over_2_5" || pick.marketValue === "ganador")) continue;
        if (mode === "conservador" && isUnderGoalMarket(pick.marketValue) && matchProfile.blockUnderGoals) continue;
        if (mode === "riesgoso" && !(isGoalMarket(pick.marketValue) || pick.marketValue === "ganador" || pick.marketValue === "empate")) continue;

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
  }, [results, matchProfile]);

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
      });
    }

    if (Array.isArray(saved.indicators)) {
      setIndicators(
        saved.indicators.map((item) => ({
          id: item.id || makeId(),
          team: (item.team as TeamSide) || "ambos",
          market: getMarketValue(item.market || ""),
          line: item.line || "",
          record: item.record || "",
          houseOdd: item.houseOdd || "",
        }))
      );
    }

    if (Array.isArray(saved.localRecent)) {
      setLocalRecent(saved.localRecent.map((row) => ({ ...emptyRecentRow(), ...row, id: row.id || makeId() })));
    }

    if (Array.isArray(saved.visitRecent)) {
      setVisitRecent(saved.visitRecent.map((row) => ({ ...emptyRecentRow(), ...row, id: row.id || makeId() })));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ match, indicators, localRecent, visitRecent }));
  }, [match, indicators, localRecent, visitRecent]);

  const clearAll = () => {
    if (!confirm("¿Seguro que quieres borrar todo el partido actual?")) return;
    setMatch({ local: "", visitante: "", oddLocal: "", oddDraw: "", oddVisit: "" });
    setIndicators([]);
    setLocalRecent(createRecentRows());
    setVisitRecent(createRecentRows());
  };

  const saveManual = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ match, indicators, localRecent, visitRecent }));
    alert("✅ Partido guardado");
  };

  const exportMatch = () => {
    const fileName = `${match.local || "local"}_vs_${match.visitante || "visitante"}`
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .toLowerCase();
    const data: ExportShape = {
      version: 2,
      exportedAt: new Date().toISOString(),
      match,
      indicators,
      localRecent,
      visitRecent,
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
        });

        setIndicators(
          data.indicators.map((item) => ({
            id: item.id || makeId(),
            team: (item.team as TeamSide) || "ambos",
            market: getMarketValue(item.market || ""),
            line: item.line || "",
            record: item.record || "",
            houseOdd: item.houseOdd || "",
          }))
        );

        setLocalRecent(Array.isArray(data.localRecent) ? data.localRecent.map((row) => ({ ...emptyRecentRow(), ...row, id: row.id || makeId() })) : createRecentRows());
        setVisitRecent(Array.isArray(data.visitRecent) ? data.visitRecent.map((row) => ({ ...emptyRecentRow(), ...row, id: row.id || makeId() })) : createRecentRows());

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

  const renderRecentBlock = (title: string, side: "local" | "visitante", rows: RecentRow[]) => (
    <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">{title}</h3>
          <p className="text-xs text-slate-300">Solo lo clave: goles, corners, tarjetas y resultado.</p>
        </div>
        <button
          onClick={() => addRecentRow(side)}
          className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/15"
        >
          + Partido
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 sm:grid-cols-5">
            <input
              className={selectClass}
              inputMode="numeric"
              placeholder={`P${index + 1} GF`}
              value={row.goalsFor}
              onChange={(event) => updateRecent(side, row.id, "goalsFor", event.target.value)}
            />
            <input
              className={selectClass}
              inputMode="numeric"
              placeholder="GC"
              value={row.goalsAgainst}
              onChange={(event) => updateRecent(side, row.id, "goalsAgainst", event.target.value)}
            />
            <input
              className={selectClass}
              inputMode="numeric"
              placeholder="Corners"
              value={row.corners}
              onChange={(event) => updateRecent(side, row.id, "corners", event.target.value)}
            />
            <input
              className={selectClass}
              inputMode="numeric"
              placeholder="Tarjetas"
              value={row.cards}
              onChange={(event) => updateRecent(side, row.id, "cards", event.target.value)}
            />
            <select
              className={selectClass}
              value={row.result}
              onChange={(event) => updateRecent(side, row.id, "result", event.target.value)}
            >
              <option value="">Resultado</option>
              <option value="G">G</option>
              <option value="E">E</option>
              <option value="P">P</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#070b12] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.25),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(251,146,60,0.22),transparent_28%),radial-gradient(circle_at_50%_90%,rgba(168,85,247,0.16),transparent_30%)]" />

      <div className="mx-auto max-w-6xl px-4 py-6 pb-24">
        <header className="mb-6">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">🔥 Analizador Pro H2H</h1>
          <p className="mt-1 text-sm text-slate-300">Rachas + últimos registros + cuotas reales + detector de partido + parlay separado</p>
        </header>

        <section className="mb-5 rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-4 flex flex-wrap gap-3">
            <button onClick={saveManual} className="rounded-2xl bg-emerald-500 px-4 py-3 font-bold text-emerald-950 shadow-lg shadow-emerald-500/20">
              💾 Guardar
            </button>
            <button onClick={clearAll} className="rounded-2xl bg-rose-500 px-4 py-3 font-bold text-white shadow-lg shadow-rose-500/20">
              🧹 Limpiar
            </button>
            <button onClick={() => importRef.current?.click()} className="rounded-2xl bg-sky-400 px-4 py-3 font-bold text-sky-950 shadow-lg shadow-sky-400/20">
              📨 Importar
            </button>
            <button onClick={exportMatch} className="rounded-2xl bg-violet-400 px-4 py-3 font-bold text-violet-950 shadow-lg shadow-violet-400/20">
              🗃️ Exportar
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => importMatch(event.target.files?.[0] || null)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input className={inputClass} placeholder="🛡️ Local" value={match.local} onChange={(event) => setMatch({ ...match, local: event.target.value })} />
            <input className={inputClass} placeholder="🚌 Visitante" value={match.visitante} onChange={(event) => setMatch({ ...match, visitante: event.target.value })} />
            <input className={inputClass} inputMode="decimal" placeholder="💶 Cuota Local 1X2" value={match.oddLocal} onChange={(event) => setMatch({ ...match, oddLocal: event.target.value })} />
            <input className={inputClass} inputMode="decimal" placeholder="£ Empate" value={match.oddDraw} onChange={(event) => setMatch({ ...match, oddDraw: event.target.value })} />
            <input className={inputClass} inputMode="decimal" placeholder="💶 Cuota Visitante 1X2" value={match.oddVisit} onChange={(event) => setMatch({ ...match, oddVisit: event.target.value })} />
          </div>
        </section>

        <section className="mb-5 rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">Indicadores SofaScore</h2>
              <p className="text-xs text-slate-300">Carga 3 a 6 señales fuertes. Evita llenar mercados débiles.</p>
            </div>
            <button onClick={addIndicator} className="rounded-2xl bg-gradient-to-r from-sky-300 to-blue-500 px-4 py-3 font-bold text-slate-950 shadow-lg shadow-sky-500/20">
              + Agregar indicador
            </button>
          </div>

          <div className="space-y-3">
            {indicators.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-slate-300">
                Ejemplo: Ambos marcan 5/5, Más de 2.5 goles 8/10, Menos de 10.5 corners 6/7. Agrega cuota casa si la tienes.
              </div>
            ) : null}

            {indicators.map((indicator) => (
              <div key={indicator.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3 shadow-lg">
                <div className="grid gap-2 sm:grid-cols-6">
                  <select value={indicator.team} onChange={(event) => updateIndicator(indicator.id, "team", event.target.value)} className={selectClass}>
                    {TEAM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
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
                    {MARKET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>

                  <input className={selectClass} placeholder="Línea" value={indicator.line} onChange={(event) => updateIndicator(indicator.id, "line", event.target.value)} />
                  <input className={selectClass} inputMode="text" placeholder="Registro X/X" value={indicator.record} onChange={(event) => updateIndicator(indicator.id, "record", event.target.value)} />
                  <input className={selectClass} inputMode="decimal" placeholder="Cuota casa" value={indicator.houseOdd} onChange={(event) => updateIndicator(indicator.id, "houseOdd", event.target.value)} />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-300">
                  <span>
                    {getTeamLabel(indicator.team, match)} · {getMarketLabel(indicator.market)}
                    {indicator.line ? ` · ${indicator.line}` : ""}
                  </span>
                  <button onClick={() => removeIndicator(indicator.id)} className="rounded-xl bg-rose-500 px-4 py-2 font-bold text-white">✖</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-5 rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-4">
            <h2 className="text-2xl font-bold">🧪 Últimos registros</h2>
            <p className="text-xs text-slate-300">La licuadora compara estos datos contra las rachas de SofaScore para evitar picks engañosos.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {renderRecentBlock(`Registro Local · ${match.local || "Local"}`, "local", localRecent)}
            {renderRecentBlock(`Registro Visitante · ${match.visitante || "Visitante"}`, "visitante", visitRecent)}
          </div>
        </section>

        <section className="mb-5 rounded-3xl border border-cyan-300/30 bg-cyan-400/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <h2 className="text-2xl font-bold">🧭 Detector de partido</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-slate-950/45 p-3">
              <p className="text-xs text-slate-400">Tipo</p>
              <p className="text-lg font-black">{matchProfile.type === "abierto" ? "🔥 Abierto" : matchProfile.type === "cerrado" ? "🧊 Cerrado" : matchProfile.type === "trampa" ? "⚠️ Trampa" : "⚖️ Equilibrado"}</p>
            </div>
            <div className="rounded-2xl bg-slate-950/45 p-3">
              <p className="text-xs text-slate-400">Prom. goles</p>
              <p className="text-lg font-black">{matchProfile.avgGoals ? matchProfile.avgGoals.toFixed(2) : "—"}</p>
            </div>
            <div className="rounded-2xl bg-slate-950/45 p-3">
              <p className="text-xs text-slate-400">Presión ofensiva</p>
              <p className="text-lg font-black">{formatScore(matchProfile.attackingPressure)}</p>
            </div>
            <div className="rounded-2xl bg-slate-950/45 p-3">
              <p className="text-xs text-slate-400">Bloqueo under</p>
              <p className="text-lg font-black">{matchProfile.blockUnderGoals ? "Activo" : "No"}</p>
            </div>
          </div>
          {matchProfile.notes.length > 0 ? (
            <div className="mt-3 rounded-2xl bg-slate-950/45 p-3 text-sm text-cyan-50">
              {matchProfile.notes.map((note) => <p key={note}>• {note}</p>)}
            </div>
          ) : null}
        </section>

        {contradictionAlerts.length > 0 ? (
          <section className="mb-5 rounded-3xl border border-amber-300/40 bg-amber-400/10 p-4 backdrop-blur-xl">
            <h2 className="text-xl font-bold text-amber-100">⚠️ Alertas de contradicción</h2>
            <div className="mt-2 space-y-1 text-sm text-amber-50">
              {contradictionAlerts.map((alert) => (
                <p key={alert}>• {alert}</p>
              ))}
            </div>
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
                    <h3 className="text-lg font-black">
                      {pick.label}
                      {pick.line ? ` · ${pick.line}` : ""}
                    </h3>
                    <p className="text-sm text-slate-300">
                      Señales: {pick.count} · SofaScore: {formatScore(pick.confidence)} · Registros: {pick.recentScore ? formatScore(pick.recentScore) : "—"} · Licuadora: {formatScore(pick.blendedScore)}
                    </p>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-sm font-bold ${pick.grade === "safe" ? "bg-emerald-400/20 text-emerald-100" : pick.grade === "reasonable" ? "bg-amber-400/20 text-amber-100" : "bg-rose-400/20 text-rose-100"}`}>
                    {pick.tier}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-xl bg-white/5 p-3">
                    Cuota casa: <b>{pick.avgOdd ? pick.avgOdd.toFixed(2) : "—"}</b>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3">
                    Prob. casa: <b>{pick.implied ? `${pick.implied.toFixed(1)}%` : "—"}</b>
                  </div>
                  <div className={`rounded-xl p-3 ${pick.value >= 8 ? "bg-emerald-500/20 text-emerald-100" : pick.value < 0 ? "bg-rose-500/20 text-rose-100" : "bg-white/5"}`}>
                    Value: <b>{pick.implied ? `${pick.value >= 0 ? "+" : ""}${pick.value.toFixed(1)}%` : "—"}</b>
                  </div>
                </div>

                {pick.riskFlags.length > 0 ? (
                  <div className="mt-3 rounded-xl bg-amber-400/10 p-3 text-xs text-amber-100">
                    {pick.riskFlags.map((flag) => (
                      <p key={flag}>• {flag}</p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        {analysis ? (
          <section className="mb-5 rounded-3xl border border-yellow-300/40 bg-yellow-300/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <h2 className="text-2xl font-bold">🧠 Análisis inteligente</h2>
            <div className="mt-3 rounded-2xl bg-slate-950/50 p-4">
              <p>
                Mejor pick: <b>{analysis.best.label} {analysis.best.line ? `· ${analysis.best.line}` : ""}</b>
              </p>
              <p>
                Licuadora: <b>{analysis.best.blendedScore.toFixed(1)}%</b>
              </p>
              <p>
                Value: <b>{analysis.best.implied ? `${analysis.best.value >= 0 ? "+" : ""}${analysis.best.value.toFixed(1)}%` : "Sin cuota del mercado"}</b>
              </p>
              <p>
                Tipo de partido: <b>{matchProfile.type === "abierto" ? "Abierto" : matchProfile.type === "cerrado" ? "Cerrado" : matchProfile.type === "trampa" ? "Trampa" : "Equilibrado"}</b>
              </p>
              <p className="mt-2 text-xl font-black">{analysis.decision}</p>
              <p className="mt-1 text-sm text-slate-300">{analysis.detail}</p>
            </div>
          </section>
        ) : null}



        <section className="rounded-5xl border border-white/20 bg-white/20 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <h2 className="text-2xl font-bold">🧩 Sugerencia de posible parlay</h2>
          <p className="mt-1 text-xs text-slate-300">No es apuesta segura. Es una combinación razonable si no hay contradicciones fuertes.</p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
              <h3 className="font-black text-emerald-100">🧊 Parlay conservador</h3>
              <p className="mb-3 text-xs text-emerald-50/80">Prioriza corners, doble oportunidad y líneas protegidas. Evita goles agresivos si hay bloqueo.</p>
              <div className="space-y-3">
                {parlaySuggestions.conservador.length === 0 ? <p className="text-sm text-slate-300">Sin combinación conservadora clara.</p> : null}
                {parlaySuggestions.conservador.map((pick, index) => (
                  <div key={pick.key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div>
                      <p className="text-xs text-slate-400">Selección {index + 1}</p>
                      <p className="font-black">{pick.label} {pick.line ? `· ${pick.line}` : ""}</p>
                      <p className="text-xs text-slate-300">{pick.tier} · Licuadora {formatScore(pick.blendedScore)}</p>
                    </div>
                    <span className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">{pick.avgOdd ? pick.avgOdd.toFixed(2) : "Sin cuota"}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4">
              <h3 className="font-black text-rose-100">🔥 Parlay riesgoso</h3>
              <p className="mb-3 text-xs text-rose-50/80">Solo si quieres cuota. Incluye goles/BTTS/ganador, pero no lo mezcles con señales bloqueadas.</p>
              <div className="space-y-3">
                {parlaySuggestions.riesgoso.length === 0 ? <p className="text-sm text-slate-300">Sin combinación riesgosa clara.</p> : null}
                {parlaySuggestions.riesgoso.map((pick, index) => (
                  <div key={pick.key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div>
                      <p className="text-xs text-slate-400">Selección {index + 1}</p>
                      <p className="font-black">{pick.label} {pick.line ? `· ${pick.line}` : ""}</p>
                      <p className="text-xs text-slate-300">{pick.tier} · Licuadora {formatScore(pick.blendedScore)}</p>
                    </div>
                    <span className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">{pick.avgOdd ? pick.avgOdd.toFixed(2) : "Sin cuota"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
            {match.local && match.visitante ? (
          <section className="mb-5 rounded-5xl border border-white/25 bg-gradient-to-r from-sky-800/20 via-violet-500/20 to-orange-500/20 p-5 text-center shadow-2xl shadow-black/40 backdrop-blur-xl">
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.35em] text-slate-200">Partido analizado</p>
            <div className="text-5xl font-black tracking-wide text-white sm:text-5x1">
              ⚽ {match.local}
              <span className="mx-3 text-slate-400">vs</span>
              {match.visitante} ⚽
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs text-slate-200">
              <span className="rounded-full bg-white/10 px-3 py-1">1: {match.oddLocal || "—"}</span>
              <span className="rounded-full bg-white/10 px-3 py-1">X: {match.oddDraw || "—"}</span>
              <span className="rounded-full bg-white/10 px-3 py-1">2: {match.oddVisit || "—"}</span>
            </div>
          </section>
        ) : null}
    </main>



  );

  
}
