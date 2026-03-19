"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Row = {
  rival: string;
  gf: number | "";
  gc: number | "";
  ownCards: number | "";
  oppCards: number | "";
  ownRedCards: number | "";
  oppRedCards: number | "";
  ownCorners: number | "";
  oppCorners: number | "";
};

type PickFamily = "goles" | "tarjetas" | "rojas" | "corners" | "ganador" | "doble";

type Pick = {
  market: string;
  probability: number;
  family: PickFamily;
  tier?: "segura" | "valor" | "arriesgada";
};

type ResultStatus = "pendiente" | "ganada" | "perdida";
type MatchOutcome = "G" | "E" | "P";

type RiskFlags = {
  zeroZeroRisk: "alto" | "medio" | "bajo";
  avoidGoals: boolean;
  trapMatch: boolean;
  lowTempo: boolean;
  reasonList: string[];
  alternativeMarkets: string[];
};

type AnalysisResult = {
  localWin: number;
  draw: number;
  awayWin: number;
  over15: number;
  over25: number;
  over35: number;
  under35: number;
  btts: number;
  homeOrDraw: number;
  awayOrDraw: number;
  noDraw: number;

  cardsOver25: number;
  cardsOver35: number;
  cardsOver45: number;
  cardsUnder55: number;
  cardsUnder65: number;
  cardsUnder75: number;

  redsOver05: number;
  redsUnder15: number;

  cornersOver55: number;
  cornersOver65: number;
  cornersOver75: number;
  cornersUnder105: number;
  cornersUnder115: number;
  cornersUnder125: number;

  expectedHomeGoals: number;
  expectedAwayGoals: number;
  totalExpectedGoals: number;

  expectedHomeYellowCards: number;
  expectedAwayYellowCards: number;
  expectedTotalYellowCards: number;

  expectedHomeRedCards: number;
  expectedAwayRedCards: number;
  expectedTotalRedCards: number;

  topScores: { score: string; probability: number }[];
  zeroZeroProbability: number;
  oneZeroProbability: number;
  zeroOneProbability: number;

  picks: Pick[];
  safestPick: Pick | null;
  valuePick: Pick | null;
  riskyPick: Pick | null;

  bestGoalsPick: Pick | null;
  bestCardsPick: Pick | null;
  bestRedCardsPick: Pick | null;
  bestCornersPick: Pick | null;
  bestWinnerPick: Pick | null;
  bestDoubleChancePick: Pick | null;

  riskFlags: RiskFlags;
};

type MatchInfo = {
  home: string;
  away: string;
  league: string;
  country: string;
  date: string;
  referee: string;
  refereeCards: string;
  refereeYellowCards: string;
  refereeRedCards: string;
  homePosition: string;
  awayPosition: string;
};

type SavedAnalysis = {
  id: number;
  matchInfo: MatchInfo;
  homeRows: Row[];
  awayRows: Row[];
  analysis: AnalysisResult;
  topPicks: Pick[];
  stake: string;
  odds: string;
  result: ResultStatus;
};

type SavedTeamTemplate = {
  teamName: string;
  side: "home" | "away";
  rows: Row[];
  updatedAt: string;
};

const STORAGE_KEY = "analizador-manual-pro-guardados-v5";
const SELECTED_KEY = "analizador-manual-pro-seleccionados-v5";
const BANKROLL_KEY = "analizador-manual-pro-bankroll-v5";
const DRAFT_KEY = "analizador-manual-pro-borrador-v5";
const TEAM_LIBRARY_KEY = "analizador-manual-team-library-v2";

const EMPTY_MATCH_INFO: MatchInfo = {
  home: "",
  away: "",
  league: "",
  country: "",
  date: "",
  referee: "",
  refereeCards: "",
  refereeYellowCards: "",
  refereeRedCards: "",
  homePosition: "",
  awayPosition: "",
};

const emptyRows = (): Row[] =>
  Array.from({ length: 10 }, () => ({
    rival: "",
    gf: "",
    gc: "",
    ownCards: "",
    oppCards: "",
    ownRedCards: "",
    oppRedCards: "",
    ownCorners: "",
    oppCorners: "",
  }));

function toNumber(value: number | "") {
  return value === "" ? 0 : Number(value);
}

function pct(value: number) {
  return `${Math.round(value)}%`;
}

function dec(value: number) {
  return value.toFixed(2);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function factorial(n: number) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

function poisson(lambda: number, k: number) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function weightedAverage(values: number[]) {
  if (!values.length) return 0;
  const weights = values.map((_, index) => values.length - index);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const total = values.reduce((sum, value, index) => sum + value * weights[index], 0);
  return total / weightSum;
}

function weightedPercent(values: number[]) {
  return weightedAverage(values) * 100;
}

function getOutcome(gf: number, gc: number): MatchOutcome {
  if (gf > gc) return "G";
  if (gf === gc) return "E";
  return "P";
}

function getMetrics(rows: Row[]) {
  const played = rows.filter(
    (r) =>
      r.rival ||
      r.gf !== "" ||
      r.gc !== "" ||
      r.ownCards !== "" ||
      r.oppCards !== "" ||
      r.ownRedCards !== "" ||
      r.oppRedCards !== "" ||
      r.ownCorners !== "" ||
      r.oppCorners !== ""
  );

  if (!played.length) {
    return {
      matches: 0,
      over15: 0,
      over25: 0,
      over35: 0,
      under35: 0,
      btts: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      avgGF: 0,
      avgGC: 0,
      avgGoals: 0,
      avgOwnCards: 0,
      avgOppCards: 0,
      avgTotalCards: 0,
      avgOwnRedCards: 0,
      avgOppRedCards: 0,
      avgTotalRedCards: 0,
      avgOwnCorners: 0,
      avgOppCorners: 0,
      avgTotalCorners: 0,
      weightedGF: 0,
      weightedGC: 0,
      weightedOwnCards: 0,
      weightedOppCards: 0,
      weightedTotalCards: 0,
      weightedOwnRedCards: 0,
      weightedOppRedCards: 0,
      weightedTotalRedCards: 0,
      weightedOwnCorners: 0,
      weightedOppCorners: 0,
      weightedTotalCorners: 0,
      winCount: 0,
      drawCount: 0,
      lossCount: 0,
    };
  }

  const totals = played.map((r) => toNumber(r.gf) + toNumber(r.gc));
  const gfs = played.map((r) => toNumber(r.gf));
  const gcs = played.map((r) => toNumber(r.gc));

  const ownCards = played.map((r) => toNumber(r.ownCards));
  const oppCards = played.map((r) => toNumber(r.oppCards));
  const totalCards = played.map((r) => toNumber(r.ownCards) + toNumber(r.oppCards));

  const ownRedCards = played.map((r) => toNumber(r.ownRedCards));
  const oppRedCards = played.map((r) => toNumber(r.oppRedCards));
  const totalRedCards = played.map((r) => toNumber(r.ownRedCards) + toNumber(r.oppRedCards));

  const ownCorners = played.map((r) => toNumber(r.ownCorners));
  const oppCorners = played.map((r) => toNumber(r.oppCorners));
  const totalCorners = played.map((r) => toNumber(r.ownCorners) + toNumber(r.oppCorners));

  const over15Flags = totals.map((t) => (t >= 2 ? 1 : 0));
  const over25Flags = totals.map((t) => (t >= 3 ? 1 : 0));
  const over35Flags = totals.map((t) => (t >= 4 ? 1 : 0));
  const under35Flags = totals.map((t) => (t <= 3 ? 1 : 0));
  const bttsFlags = played.map((r) => (toNumber(r.gf) > 0 && toNumber(r.gc) > 0 ? 1 : 0));
  const winFlags = played.map((r) => (toNumber(r.gf) > toNumber(r.gc) ? 1 : 0));
  const drawFlags = played.map((r) => (toNumber(r.gf) === toNumber(r.gc) ? 1 : 0));
  const lossFlags = played.map((r) => (toNumber(r.gf) < toNumber(r.gc) ? 1 : 0));

  return {
    matches: played.length,
    over15: weightedPercent(over15Flags),
    over25: weightedPercent(over25Flags),
    over35: weightedPercent(over35Flags),
    under35: weightedPercent(under35Flags),
    btts: weightedPercent(bttsFlags),
    wins: weightedPercent(winFlags),
    draws: weightedPercent(drawFlags),
    losses: weightedPercent(lossFlags),

    avgGF: average(gfs),
    avgGC: average(gcs),
    avgGoals: average(totals),

    avgOwnCards: average(ownCards),
    avgOppCards: average(oppCards),
    avgTotalCards: average(totalCards),

    avgOwnRedCards: average(ownRedCards),
    avgOppRedCards: average(oppRedCards),
    avgTotalRedCards: average(totalRedCards),

    avgOwnCorners: average(ownCorners),
    avgOppCorners: average(oppCorners),
    avgTotalCorners: average(totalCorners),

    weightedGF: weightedAverage(gfs),
    weightedGC: weightedAverage(gcs),

    weightedOwnCards: weightedAverage(ownCards),
    weightedOppCards: weightedAverage(oppCards),
    weightedTotalCards: weightedAverage(totalCards),

    weightedOwnRedCards: weightedAverage(ownRedCards),
    weightedOppRedCards: weightedAverage(oppRedCards),
    weightedTotalRedCards: weightedAverage(totalRedCards),

    weightedOwnCorners: weightedAverage(ownCorners),
    weightedOppCorners: weightedAverage(oppCorners),
    weightedTotalCorners: weightedAverage(totalCorners),

     winCount: winFlags.reduce<number>((a, b) => a + b, 0),
      drawCount: drawFlags.reduce<number>((a, b) => a + b, 0),
      lossCount: lossFlags.reduce<number>((a, b) => a + b, 0),
  };
}

function confidenceLabel(value: number) {
  if (value >= 85) return "Muy alta";
  if (value >= 75) return "Alta";
  if (value >= 65) return "Media";
  return "Baja";
}

function badgeClass(value: number) {
  if (value >= 85) return "bg-green-100 text-green-800 border border-green-300";
  if (value >= 75) return "bg-emerald-100 text-emerald-800 border border-emerald-300";
  if (value >= 65) return "bg-yellow-100 text-yellow-800 border border-yellow-300";
  return "bg-slate-100 text-slate-700 border border-slate-300";
}

function analysisCardClass(value: number) {
  if (value >= 85) return "border-green-300 bg-green-50";
  if (value >= 75) return "border-emerald-300 bg-emerald-50";
  if (value >= 65) return "border-yellow-300 bg-yellow-50";
  return "border-slate-200 bg-white";
}

function trafficLightClass(value: number) {
  if (value >= 80) return "bg-green-500";
  if (value >= 68) return "bg-yellow-400";
  return "bg-red-500";
}

function riskBadgeClass(level: "alto" | "medio" | "bajo") {
  if (level === "alto") return "bg-red-100 text-red-800 border-red-300";
  if (level === "medio") return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-green-100 text-green-800 border-green-300";
}

function resultBadgeClass(result: MatchOutcome) {
  if (result === "G") return "bg-green-100 text-green-800 border-green-300";
  if (result === "E") return "bg-slate-100 text-slate-700 border-slate-300";
  return "bg-red-100 text-red-800 border-red-300";
}

function randomPoisson(lambda: number) {
  const L = Math.exp(-lambda);
  let p = 1;
  let k = 0;
  do {
    k += 1;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function kellyFraction(probabilityPct: number, odds: number) {
  const p = probabilityPct / 100;
  const b = odds - 1;
  if (b <= 0) return 0;
  const q = 1 - p;
  return Math.max(0, (b * p - q) / b);
}

function uniqueRivals(rows: Row[]) {
  return Array.from(new Set(rows.map((r) => r.rival.trim()).filter(Boolean))).sort();
}

function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getTemplateKey(teamName: string, side: "home" | "away") {
  return `${normalizeName(teamName)}__${side}`;
}

function getCommonOpponents(homeRows: Row[], awayRows: Row[]) {
  const homeMap = new Map(
    homeRows.filter((r) => r.rival.trim()).map((r) => [normalizeName(r.rival), r] as const)
  );

  const awayMap = new Map(
    awayRows.filter((r) => r.rival.trim()).map((r) => [normalizeName(r.rival), r] as const)
  );

  const common: {
    rival: string;
    homeGF: number;
    homeGC: number;
    awayGF: number;
    awayGC: number;
  }[] = [];

  for (const [key, homeRow] of homeMap.entries()) {
    const awayRow = awayMap.get(key);
    if (awayRow) {
      common.push({
        rival: homeRow.rival,
        homeGF: toNumber(homeRow.gf),
        homeGC: toNumber(homeRow.gc),
        awayGF: toNumber(awayRow.gf),
        awayGC: toNumber(awayRow.gc),
      });
    }
  }

  return common;
}

function compactTopPicks(analysis: AnalysisResult): Pick[] {
  return [
    analysis.bestGoalsPick,
    analysis.bestCardsPick,
    analysis.bestRedCardsPick,
    analysis.bestCornersPick,
    analysis.bestWinnerPick,
    analysis.bestDoubleChancePick,
  ].filter(Boolean) as Pick[];
}

function hasUsefulRows(rows: Row[]) {
  return rows.some(
    (r) =>
      r.rival.trim() ||
      r.gf !== "" ||
      r.gc !== "" ||
      r.ownCards !== "" ||
      r.oppCards !== "" ||
      r.ownRedCards !== "" ||
      r.oppRedCards !== "" ||
      r.ownCorners !== "" ||
      r.oppCorners !== ""
  );
}

function cleanTeamName(name: string) {
  return name.trim();
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function Home() {
  const [matchInfo, setMatchInfo] = useState<MatchInfo>(EMPTY_MATCH_INFO);
  const [homeRows, setHomeRows] = useState<Row[]>(emptyRows());
  const [awayRows, setAwayRows] = useState<Row[]>(emptyRows());

  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [bankroll, setBankroll] = useState("1000");
  const [stakeMethod, setStakeMethod] = useState<"fijo" | "confianza" | "kelly">("confianza");
  const [stakeOdds, setStakeOdds] = useState("1.80");
  const [preferredMarket, setPreferredMarket] = useState<
    "auto" | "goles" | "tarjetas" | "corners" | "1x2"
  >("auto");

  const [searchTeam, setSearchTeam] = useState("");
  const [searchLeague, setSearchLeague] = useState("");

  const [teamLibrary, setTeamLibrary] = useState<SavedTeamTemplate[]>([]);
  const [selectedSavedHomeTeam, setSelectedSavedHomeTeam] = useState("");
  const [selectedSavedAwayTeam, setSelectedSavedAwayTeam] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const selected = localStorage.getItem(SELECTED_KEY);
      const savedBankroll = localStorage.getItem(BANKROLL_KEY);
      const draft = localStorage.getItem(DRAFT_KEY);
      const savedLibrary = localStorage.getItem(TEAM_LIBRARY_KEY);

      if (saved) setSavedAnalyses(JSON.parse(saved));
      if (selected) setSelectedIds(JSON.parse(selected));
      if (savedLibrary) setTeamLibrary(JSON.parse(savedLibrary));

      if (savedBankroll) {
        const parsed = JSON.parse(savedBankroll);
        setBankroll(parsed.bankroll ?? "1000");
        setStakeMethod(parsed.stakeMethod ?? "confianza");
        setStakeOdds(parsed.stakeOdds ?? "1.80");
        setPreferredMarket(parsed.preferredMarket ?? "auto");
      }

      if (draft) {
        const parsedDraft = JSON.parse(draft);
        setMatchInfo(parsedDraft.matchInfo ?? EMPTY_MATCH_INFO);
        setHomeRows(parsedDraft.homeRows ?? emptyRows());
        setAwayRows(parsedDraft.awayRows ?? emptyRows());
        setEditingId(parsedDraft.editingId ?? null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedAnalyses));
  }, [savedAnalyses]);

  useEffect(() => {
    localStorage.setItem(SELECTED_KEY, JSON.stringify(selectedIds));
  }, [selectedIds]);

  useEffect(() => {
    localStorage.setItem(
      BANKROLL_KEY,
      JSON.stringify({ bankroll, stakeMethod, stakeOdds, preferredMarket })
    );
  }, [bankroll, stakeMethod, stakeOdds, preferredMarket]);

  useEffect(() => {
    const draft = { matchInfo, homeRows, awayRows, editingId };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [matchInfo, homeRows, awayRows, editingId]);

  useEffect(() => {
    localStorage.setItem(TEAM_LIBRARY_KEY, JSON.stringify(teamLibrary));
  }, [teamLibrary]);

  const home = useMemo(() => getMetrics(homeRows), [homeRows]);
  const away = useMemo(() => getMetrics(awayRows), [awayRows]);

  const homeRivalSuggestions = useMemo(() => uniqueRivals(homeRows), [homeRows]);
  const awayRivalSuggestions = useMemo(() => uniqueRivals(awayRows), [awayRows]);
  const commonOpponents = useMemo(() => getCommonOpponents(homeRows, awayRows), [homeRows, awayRows]);

  const homeSavedOptions = useMemo(
    () => [...teamLibrary].filter((t) => t.side === "home").sort((a, b) => a.teamName.localeCompare(b.teamName)),
    [teamLibrary]
  );

  const awaySavedOptions = useMemo(
    () => [...teamLibrary].filter((t) => t.side === "away").sort((a, b) => a.teamName.localeCompare(b.teamName)),
    [teamLibrary]
  );

  const analysis = useMemo<AnalysisResult>(() => {
    const refereeCards = Number(matchInfo.refereeCards || 0);
    const refereeYellowCards =
      Number(matchInfo.refereeYellowCards || 0) || Number(matchInfo.refereeCards || 0);
    const refereeRedCards = Number(matchInfo.refereeRedCards || 0);

    const homePos = Number(matchInfo.homePosition || 0);
    const awayPos = Number(matchInfo.awayPosition || 0);
    const posFactor = homePos > 0 && awayPos > 0 ? clamp((awayPos - homePos) * 1.5, -12, 12) : 0;

    const commonBonusRaw =
      commonOpponents.length > 0
        ? average(
            commonOpponents.map((c) => {
              const homeDiff = c.homeGF - c.homeGC;
              const awayDiff = c.awayGF - c.awayGC;
              return homeDiff - awayDiff;
            })
          )
        : 0;

    const commonBonus = clamp(commonBonusRaw * 0.08, -0.35, 0.35);

    const expectedHomeGoals = clamp(
      (home.weightedGF + away.weightedGC) / 2 + Math.max(posFactor, 0) * 0.03 + Math.max(commonBonus, 0),
      0.2,
      3.8
    );

    const expectedAwayGoals = clamp(
      (away.weightedGF + home.weightedGC) / 2 + Math.max(-posFactor, 0) * 0.03 + Math.max(-commonBonus, 0),
      0.2,
      3.8
    );

    const totalExpectedGoals = expectedHomeGoals + expectedAwayGoals;

    const maxGoals = 6;
    let localWin = 0;
    let draw = 0;
    let awayWin = 0;
    let over15Pois = 0;
    let over25Pois = 0;
    let over35Pois = 0;
    let under35Pois = 0;
    let bttsPois = 0;
    let zeroZeroProbability = 0;
    let oneZeroProbability = 0;
    let zeroOneProbability = 0;
    const scoreMatrix: { score: string; probability: number }[] = [];

    for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
      for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
        const probability = poisson(expectedHomeGoals, homeGoals) * poisson(expectedAwayGoals, awayGoals);

        scoreMatrix.push({
          score: `${homeGoals}-${awayGoals}`,
          probability: probability * 100,
        });

        if (homeGoals === 0 && awayGoals === 0) zeroZeroProbability = probability * 100;
        if (homeGoals === 1 && awayGoals === 0) oneZeroProbability = probability * 100;
        if (homeGoals === 0 && awayGoals === 1) zeroOneProbability = probability * 100;

        if (homeGoals > awayGoals) localWin += probability;
        else if (homeGoals === awayGoals) draw += probability;
        else awayWin += probability;

        const total = homeGoals + awayGoals;
        if (total >= 2) over15Pois += probability;
        if (total >= 3) over25Pois += probability;
        if (total >= 4) over35Pois += probability;
        if (total <= 3) under35Pois += probability;
        if (homeGoals > 0 && awayGoals > 0) bttsPois += probability;
      }
    }

    const localWinForm =
      (home.wins + away.losses) / 2 + Math.max(posFactor, 0) * 0.8 + Math.max(commonBonusRaw, 0) * 2;
    const awayWinForm =
      (away.wins + home.losses) / 2 + Math.max(-posFactor, 0) * 0.8 + Math.max(-commonBonusRaw, 0) * 2;
    const drawForm = (home.draws + away.draws) / 2;

    const localWinPct = clamp(localWin * 100 * 0.72 + localWinForm * 0.28, 0, 95);
    const awayWinPct = clamp(awayWin * 100 * 0.72 + awayWinForm * 0.28, 0, 95);
    const drawPct = clamp(draw * 100 * 0.72 + drawForm * 0.28, 0, 40);

    const total1x2 = localWinPct + awayWinPct + drawPct || 1;
    const localWinNorm = (localWinPct / total1x2) * 100;
    const awayWinNorm = (awayWinPct / total1x2) * 100;
    const drawNorm = (drawPct / total1x2) * 100;

    const over15 = clamp(over15Pois * 100 * 0.7 + ((home.over15 + away.over15) / 2) * 0.3, 0, 99);
    const over25 = clamp(over25Pois * 100 * 0.7 + ((home.over25 + away.over25) / 2) * 0.3, 0, 99);
    const over35 = clamp(over35Pois * 100 * 0.7 + ((home.over35 + away.over35) / 2) * 0.3, 0, 99);
    const under35 = clamp(under35Pois * 100 * 0.7 + ((home.under35 + away.under35) / 2) * 0.3, 0, 99);
    const btts = clamp(bttsPois * 100 * 0.7 + ((home.btts + away.btts) / 2) * 0.3, 0, 99);

    const homeOrDraw = Math.min(localWinNorm + drawNorm, 100);
    const awayOrDraw = Math.min(awayWinNorm + drawNorm, 100);
    const noDraw = Math.min(localWinNorm + awayWinNorm, 100);

    const expectedHomeYellowCards = (home.weightedOwnCards + away.weightedOppCards) / 2;
    const expectedAwayYellowCards = (away.weightedOwnCards + home.weightedOppCards) / 2;
    const expectedTotalYellowCards = refereeYellowCards
      ? (expectedHomeYellowCards + expectedAwayYellowCards + refereeYellowCards) / 3
      : expectedHomeYellowCards + expectedAwayYellowCards;

    const expectedHomeRedCards = (home.weightedOwnRedCards + away.weightedOppRedCards) / 2;
    const expectedAwayRedCards = (away.weightedOwnRedCards + home.weightedOppRedCards) / 2;
    const expectedTotalRedCards = refereeRedCards
      ? (expectedHomeRedCards + expectedAwayRedCards + refereeRedCards) / 3
      : expectedHomeRedCards + expectedAwayRedCards;

    const estimatedCards = refereeCards
      ? (expectedHomeYellowCards + expectedAwayYellowCards + refereeCards) / 3
      : expectedHomeYellowCards + expectedAwayYellowCards;

    const estimatedHomeCorners = (home.weightedOwnCorners + away.weightedOppCorners) / 2;
    const estimatedAwayCorners = (away.weightedOwnCorners + home.weightedOppCorners) / 2;
    const estimatedCorners = estimatedHomeCorners + estimatedAwayCorners;

    const cardsOver25 = clamp(42 + estimatedCards * 7.2, 0, 97);
    const cardsOver35 = clamp(30 + estimatedCards * 7.0, 0, 96);
    const cardsOver45 = clamp(18 + estimatedCards * 6.8, 0, 94);
    const cardsUnder55 = clamp(105 - cardsOver45 * 0.9, 0, 96);
    const cardsUnder65 = clamp(112 - cardsOver35 * 0.75, 0, 97);
    const cardsUnder75 = clamp(118 - cardsOver25 * 0.55, 0, 98);

    const redsOver05 = clamp(10 + expectedTotalRedCards * 75, 0, 92);
    const redsUnder15 = clamp(100 - redsOver05 * 0.65, 30, 99);

    const cornersOver55 = clamp(48 + estimatedCorners * 4.6, 0, 98);
    const cornersOver65 = clamp(36 + estimatedCorners * 4.4, 0, 97);
    const cornersOver75 = clamp(24 + estimatedCorners * 4.2, 0, 95);
    const cornersUnder105 = clamp(116 - cornersOver75 * 0.85, 0, 96);
    const cornersUnder115 = clamp(121 - cornersOver65 * 0.75, 0, 97);
    const cornersUnder125 = clamp(126 - cornersOver55 * 0.65, 0, 98);

    const topScores = scoreMatrix.sort((a, b) => b.probability - a.probability).slice(0, 4);
    const scoreNames = topScores.map((s) => s.score);

    const reasonList: string[] = [];
    const alternativeMarkets: string[] = [];

    const zeroZeroRisk: "alto" | "medio" | "bajo" =
      zeroZeroProbability >= 13 || (scoreNames.includes("0-0") && topScores[0]?.score === "0-0")
        ? "alto"
        : zeroZeroProbability >= 8 || scoreNames.includes("0-0")
        ? "medio"
        : "bajo";

    const lowTempo = totalExpectedGoals < 2.05;
    if (lowTempo) reasonList.push("Goles esperados totales bajos");
    if (zeroZeroRisk !== "bajo") reasonList.push("Riesgo relevante de 0-0");
    if (over15 < 68) reasonList.push("Over 1.5 no es tan fuerte");
    if (btts < 52) reasonList.push("BTTS bajo");
    if (drawNorm >= 30) reasonList.push("Empate relativamente alto");
    if (scoreNames.includes("1-0") || scoreNames.includes("0-1")) {
      reasonList.push("Marcadores cortos entre los más probables");
    }

    const avoidGoals =
      (over15 < 68 && btts < 52) ||
      totalExpectedGoals < 1.85 ||
      zeroZeroRisk === "alto" ||
      (topScores[0]?.score === "0-0" && zeroZeroProbability >= 12) ||
      drawNorm >= 34;

    const trapMatch =
      avoidGoals &&
      (zeroZeroRisk === "alto" || totalExpectedGoals < 1.9 || oneZeroProbability + zeroOneProbability >= 24);

    if (avoidGoals) {
      if (under35 >= 70) alternativeMarkets.push("Menos de 3.5 goles");
      if (cardsOver25 >= 65) alternativeMarkets.push("Más de 2.5 amarillas");
      if (redsUnder15 >= 72) alternativeMarkets.push("Menos de 1.5 rojas");
      if (cornersOver55 >= 65) alternativeMarkets.push("Más de 5.5 corners");
      if (homeOrDraw >= 75) alternativeMarkets.push("Local o empate (1X)");
      if (awayOrDraw >= 75) alternativeMarkets.push("Visitante o empate (X2)");
    }

    let picks: Pick[] = [
      { market: "Más de 1.5 goles", probability: over15, family: "goles" },
      { market: "Más de 2.5 goles", probability: over25, family: "goles", tier: "valor" },
      { market: "Más de 3.5 goles", probability: over35, family: "goles", tier: "arriesgada" },
      { market: "Menos de 3.5 goles", probability: under35, family: "goles" },
      { market: "Ambos marcan", probability: btts, family: "goles" },

      { market: "Gana local", probability: localWinNorm, family: "ganador", tier: "arriesgada" },
      { market: "Empate", probability: drawNorm, family: "ganador", tier: "arriesgada" },
      { market: "Gana visitante", probability: awayWinNorm, family: "ganador", tier: "arriesgada" },

      { market: "Local o empate (1X)", probability: homeOrDraw, family: "doble" },
      { market: "Visitante o empate (X2)", probability: awayOrDraw, family: "doble" },
      { market: "No empate (1 o 2)", probability: noDraw, family: "doble", tier: "valor" },

      { market: "Más de 2.5 amarillas", probability: cardsOver25, family: "tarjetas" },
      { market: "Más de 3.5 amarillas", probability: cardsOver35, family: "tarjetas" },
      { market: "Más de 4.5 amarillas", probability: cardsOver45, family: "tarjetas", tier: "valor" },
      { market: "Menos de 5.5 amarillas", probability: cardsUnder55, family: "tarjetas" },
      { market: "Menos de 6.5 amarillas", probability: cardsUnder65, family: "tarjetas" },
      { market: "Menos de 7.5 amarillas", probability: cardsUnder75, family: "tarjetas" },

      { market: "Más de 0.5 rojas", probability: redsOver05, family: "rojas", tier: "arriesgada" },
      { market: "Menos de 1.5 rojas", probability: redsUnder15, family: "rojas" },

      { market: "Más de 5.5 corners", probability: cornersOver55, family: "corners" },
      { market: "Más de 6.5 corners", probability: cornersOver65, family: "corners" },
      { market: "Más de 7.5 corners", probability: cornersOver75, family: "corners" },
      { market: "Menos de 10.5 corners", probability: cornersUnder105, family: "corners" },
      { market: "Menos de 11.5 corners", probability: cornersUnder115, family: "corners" },
      { market: "Menos de 12.5 corners", probability: cornersUnder125, family: "corners" },
    ];

    if (avoidGoals) {
      const blocked = new Set(["Más de 1.5 goles", "Más de 2.5 goles", "Más de 3.5 goles", "Ambos marcan"]);
      picks = picks.map((pick) =>
        blocked.has(pick.market) ? { ...pick, probability: Math.max(0, pick.probability - 12) } : pick
      );
    }

    picks = picks.map((pick) => {
      const penalty = pick.family === "corners" ? 8 : 0;
      return { ...pick, probability: clamp(pick.probability - penalty, 0, 99) };
    });

    if (preferredMarket !== "auto") {
      picks = picks.map((pick) => {
        let boost = 0;
        if (preferredMarket === "goles" && pick.family === "goles") boost = 6;
        if (preferredMarket === "tarjetas" && (pick.family === "tarjetas" || pick.family === "rojas")) boost = 6;
        if (preferredMarket === "corners" && pick.family === "corners") boost = 6;
        if (preferredMarket === "1x2" && (pick.family === "ganador" || pick.family === "doble")) boost = 6;
        return { ...pick, probability: clamp(pick.probability + boost, 0, 99) };
      });
    }

    picks = picks.sort((a, b) => b.probability - a.probability);

    const bestGoalsPick = picks.filter((p) => p.family === "goles")[0] ?? null;
    const bestCardsPick = picks.filter((p) => p.family === "tarjetas")[0] ?? null;
    const bestRedCardsPick = picks.filter((p) => p.family === "rojas")[0] ?? null;
    const bestCornersPick = picks.filter((p) => p.family === "corners")[0] ?? null;
    const bestWinnerPick = picks.filter((p) => p.family === "ganador")[0] ?? null;
    const bestDoubleChancePick = picks.filter((p) => p.family === "doble")[0] ?? null;

    const safestPick =
      [bestGoalsPick, bestCardsPick, bestRedCardsPick, bestCornersPick, bestWinnerPick, bestDoubleChancePick]
        .filter(Boolean)
        .sort((a, b) => (b?.probability ?? 0) - (a?.probability ?? 0))[0] ?? null;

    const valuePick =
      picks.find(
        (p) =>
          p.market !== safestPick?.market &&
          ((p.tier === "valor" && p.probability >= 68) || (p.probability >= 68 && p.probability < 82))
      ) ?? null;

    const riskyPick =
      picks.find(
        (p) =>
          p.market !== safestPick?.market &&
          p.market !== valuePick?.market &&
          ((p.tier === "arriesgada" && p.probability >= 55) || (p.probability >= 55 && p.probability < 75))
      ) ?? null;

    return {
      localWin: localWinNorm,
      draw: drawNorm,
      awayWin: awayWinNorm,
      over15,
      over25,
      over35,
      under35,
      btts,
      homeOrDraw,
      awayOrDraw,
      noDraw,

      cardsOver25,
      cardsOver35,
      cardsOver45,
      cardsUnder55,
      cardsUnder65,
      cardsUnder75,

      redsOver05,
      redsUnder15,

      cornersOver55,
      cornersOver65,
      cornersOver75,
      cornersUnder105,
      cornersUnder115,
      cornersUnder125,

      expectedHomeGoals,
      expectedAwayGoals,
      totalExpectedGoals,

      expectedHomeYellowCards,
      expectedAwayYellowCards,
      expectedTotalYellowCards,

      expectedHomeRedCards,
      expectedAwayRedCards,
      expectedTotalRedCards,

      topScores,
      zeroZeroProbability,
      oneZeroProbability,
      zeroOneProbability,

      picks,
      safestPick,
      valuePick,
      riskyPick,

      bestGoalsPick,
      bestCardsPick,
      bestRedCardsPick,
      bestCornersPick,
      bestWinnerPick,
      bestDoubleChancePick,

      riskFlags: {
        zeroZeroRisk,
        avoidGoals,
        trapMatch,
        lowTempo,
        reasonList,
        alternativeMarkets,
      },
    };
  }, [
    home,
    away,
    matchInfo.refereeCards,
    matchInfo.refereeYellowCards,
    matchInfo.refereeRedCards,
    matchInfo.homePosition,
    matchInfo.awayPosition,
    preferredMarket,
    commonOpponents,
  ]);

  const monteCarlo = useMemo(() => {
    const simulations = 10000;
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let btts = 0;
    const scores: Record<string, number> = {};

    for (let i = 0; i < simulations; i += 1) {
      const hg = randomPoisson(analysis.expectedHomeGoals);
      const ag = randomPoisson(analysis.expectedAwayGoals);
      const key = `${hg}-${ag}`;
      scores[key] = (scores[key] || 0) + 1;
      if (hg > ag) homeWins += 1;
      else if (hg === ag) draws += 1;
      else awayWins += 1;
      if (hg > 0 && ag > 0) btts += 1;
    }

    const topScores = Object.entries(scores)
      .map(([score, count]) => ({ score, probability: (count / simulations) * 100 }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 4);

    return {
      simulations,
      homeWin: (homeWins / simulations) * 100,
      draw: (draws / simulations) * 100,
      awayWin: (awayWins / simulations) * 100,
      btts: (btts / simulations) * 100,
      topScores,
    };
  }, [analysis.expectedHomeGoals, analysis.expectedAwayGoals]);

  const bankrollAnalysis = useMemo(() => {
    const bank = Number(bankroll || 0);
    const odds = Number(stakeOdds || 0);
    const basePick = analysis.safestPick ?? analysis.picks[0] ?? null;
    const probability = basePick?.probability ?? 0;

    let percent = 0;
    if (stakeMethod === "fijo") percent = 2;
    if (stakeMethod === "confianza") {
      if (probability >= 85) percent = 5;
      else if (probability >= 75) percent = 3;
      else if (probability >= 65) percent = 2;
      else percent = 1;
    }
    if (stakeMethod === "kelly") {
      percent = clamp(kellyFraction(probability, odds) * 100 * 0.5, 0, 8);
    }

    const amount = bank * (percent / 100);
    return { basePick, probability, percent, amount };
  }, [bankroll, stakeMethod, stakeOdds, analysis]);

  const filteredAnalyses = useMemo(() => {
    return savedAnalyses.filter((item) => {
      const teamMatch =
        searchTeam === "" ||
        item.matchInfo.home.toLowerCase().includes(searchTeam.toLowerCase()) ||
        item.matchInfo.away.toLowerCase().includes(searchTeam.toLowerCase());

      const leagueMatch =
        searchLeague === "" ||
        item.matchInfo.league.toLowerCase().includes(searchLeague.toLowerCase());

      return teamMatch && leagueMatch;
    });
  }, [savedAnalyses, searchTeam, searchLeague]);

  const selectedAnalyses = useMemo(
    () => savedAnalyses.filter((item) => selectedIds.includes(item.id)),
    [savedAnalyses, selectedIds]
  );

  const generatedParlays = useMemo(() => {
    const buildLinesForMatch = (
      item: SavedAnalysis,
      mode: "conservadora" | "media" | "agresiva"
    ) => {
      const pool = compactTopPicks(item.analysis)
        .filter((pick) => {
          if (mode === "conservadora") return pick.probability >= 75;
          if (mode === "media") return pick.probability >= 68;
          return pick.probability >= 60;
        })
        .sort((a, b) => b.probability - a.probability);

      const fallback = [...item.analysis.picks].sort((a, b) => b.probability - a.probability);
      const source = pool.length ? pool : fallback;

      const usedFamilies = new Set<PickFamily>();
      const lines: Pick[] = [];

      for (const pick of source) {
        if (!usedFamilies.has(pick.family)) {
          lines.push(pick);
          usedFamilies.add(pick.family);
        }
        if (lines.length === 3) break;
      }

      if (lines.length < 3) {
        for (const pick of fallback) {
          if (!lines.find((l) => l.market === pick.market)) {
            lines.push(pick);
          }
          if (lines.length === 3) break;
        }
      }

      return {
        id: item.id,
        match: `${item.matchInfo.home || "Local"} vs ${item.matchInfo.away || "Visitante"}`,
        lines,
      };
    };

    const build = (mode: "conservadora" | "media" | "agresiva") => {
      const matches = selectedAnalyses.map((item) => buildLinesForMatch(item, mode));
      const allProbabilities = matches.flatMap((m) => m.lines.map((l) => l.probability));
      const avgProbability = allProbabilities.length
        ? allProbabilities.reduce((sum, p) => sum + p, 0) / allProbabilities.length
        : 0;

      return {
        mode,
        matches,
        avgProbability,
        confidence: confidenceLabel(avgProbability),
      };
    };

    return {
      conservadora: build("conservadora"),
      media: build("media"),
      agresiva: build("agresiva"),
    };
  }, [selectedAnalyses]);

  const performance = useMemo(() => {
    const settled = savedAnalyses.filter((item) => item.result !== "pendiente");
    const wins = settled.filter((item) => item.result === "ganada");
    const losses = settled.filter((item) => item.result === "perdida");
    const totalStake = settled.reduce((sum, item) => sum + Number(item.stake || 0), 0);

    const profit = settled.reduce((sum, item) => {
      const stake = Number(item.stake || 0);
      const odds = Number(item.odds || 0);
      if (item.result === "ganada") return sum + stake * (odds - 1);
      if (item.result === "perdida") return sum - stake;
      return sum;
    }, 0);

    const roi = totalStake > 0 ? (profit / totalStake) * 100 : 0;

    return {
      total: savedAnalyses.length,
      settled: settled.length,
      wins: wins.length,
      losses: losses.length,
      hitRate: settled.length > 0 ? (wins.length / settled.length) * 100 : 0,
      totalStake,
      profit,
      roi,
    };
  }, [savedAnalyses]);

  const updateRow = (
    setter: React.Dispatch<React.SetStateAction<Row[]>>,
    index: number,
    field: keyof Row,
    value: string
  ) => {
    setter((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [field]: field === "rival" ? value : value === "" ? "" : Number(value),
      };
      return copy;
    });
  };

  const resetForm = () => {
    setMatchInfo(EMPTY_MATCH_INFO);
    setHomeRows(emptyRows());
    setAwayRows(emptyRows());
    setEditingId(null);
    setSelectedSavedHomeTeam("");
    setSelectedSavedAwayTeam("");
    localStorage.removeItem(DRAFT_KEY);
  };

  const saveAnalysis = () => {
    if (!matchInfo.home.trim() && !matchInfo.away.trim()) return;

    const topPicks = compactTopPicks(analysis);

    if (editingId) {
      setSavedAnalyses((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? {
                ...item,
                matchInfo: { ...matchInfo },
                homeRows: [...homeRows],
                awayRows: [...awayRows],
                analysis: { ...analysis },
                topPicks,
              }
            : item
        )
      );
      setEditingId(null);
      localStorage.removeItem(DRAFT_KEY);
      return;
    }

    const saved: SavedAnalysis = {
      id: Date.now(),
      matchInfo: { ...matchInfo },
      homeRows: [...homeRows],
      awayRows: [...awayRows],
      analysis: { ...analysis },
      topPicks,
      stake: "",
      odds: "",
      result: "pendiente",
    };

    setSavedAnalyses((prev) => [saved, ...prev]);
    localStorage.removeItem(DRAFT_KEY);
  };

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const editAnalysis = (item: SavedAnalysis) => {
    setMatchInfo(item.matchInfo);
    setHomeRows(item.homeRows);
    setAwayRows(item.awayRows);
    setEditingId(item.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteAnalysis = (id: number) => {
    setSavedAnalyses((prev) => prev.filter((item) => item.id !== id));
    setSelectedIds((prev) => prev.filter((item) => item !== id));
    if (editingId === id) setEditingId(null);
  };

  const updateSavedField = (id: number, field: "stake" | "odds", value: string) =>
    setSavedAnalyses((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );

  const updateSavedResult = (id: number, result: ResultStatus) =>
    setSavedAnalyses((prev) =>
      prev.map((item) => (item.id === id ? { ...item, result } : item))
    );

  const exportAnalyses = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      bankroll,
      stakeMethod,
      stakeOdds,
      preferredMarket,
      savedAnalyses,
      teamLibrary,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analizador-manual-pro-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importAnalyses = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed.savedAnalyses)) setSavedAnalyses(parsed.savedAnalyses);
        if (Array.isArray(parsed.teamLibrary)) setTeamLibrary(parsed.teamLibrary);
        if (typeof parsed.bankroll === "string") setBankroll(parsed.bankroll);
        if (
          parsed.stakeMethod === "fijo" ||
          parsed.stakeMethod === "confianza" ||
          parsed.stakeMethod === "kelly"
        ) {
          setStakeMethod(parsed.stakeMethod);
        }
        if (typeof parsed.stakeOdds === "string") setStakeOdds(parsed.stakeOdds);
        if (
          parsed.preferredMarket === "auto" ||
          parsed.preferredMarket === "goles" ||
          parsed.preferredMarket === "tarjetas" ||
          parsed.preferredMarket === "corners" ||
          parsed.preferredMarket === "1x2"
        ) {
          setPreferredMarket(parsed.preferredMarket);
        }
        setSelectedIds([]);
        setEditingId(null);
      } catch {
        alert("El archivo no es válido para importar.");
      }
    };

    reader.readAsText(file);
    event.target.value = "";
  };

  const saveTeamTemplate = (side: "home" | "away") => {
    const teamName = cleanTeamName(side === "home" ? matchInfo.home : matchInfo.away);
    const rows = side === "home" ? homeRows : awayRows;

    if (!teamName) {
      alert(`Escribe primero el nombre del equipo ${side === "home" ? "local" : "visitante"}.`);
      return;
    }

    if (!hasUsefulRows(rows)) {
      alert(`No hay datos para guardar del equipo ${teamName}.`);
      return;
    }

    const payload: SavedTeamTemplate = {
      teamName,
      side,
      rows: [...rows],
      updatedAt: new Date().toISOString(),
    };

    setTeamLibrary((prev) => {
      const key = getTemplateKey(teamName, side);
      const exists = prev.some((item) => getTemplateKey(item.teamName, item.side) === key);
      if (exists) {
        return prev.map((item) =>
          getTemplateKey(item.teamName, item.side) === key ? payload : item
        );
      }
      return [payload, ...prev].sort((a, b) => a.teamName.localeCompare(b.teamName));
    });

    alert(`Registro guardado para ${teamName} como ${side === "home" ? "LOCAL" : "VISITANTE"}.`);
  };

  const loadTeamTemplate = (side: "home" | "away", teamName: string) => {
    const found = teamLibrary.find(
      (item) => normalizeName(item.teamName) === normalizeName(teamName) && item.side === side
    );

    if (!found) return;

    if (side === "home") {
      setMatchInfo((prev) => ({ ...prev, home: found.teamName }));
      setHomeRows(found.rows.map((r) => ({ ...r })));
      setSelectedSavedHomeTeam(found.teamName);
    } else {
      setMatchInfo((prev) => ({ ...prev, away: found.teamName }));
      setAwayRows(found.rows.map((r) => ({ ...r })));
      setSelectedSavedAwayTeam(found.teamName);
    }
  };

  const deleteTeamTemplate = (teamName: string, side: "home" | "away") => {
    setTeamLibrary((prev) =>
      prev.filter((item) => !(normalizeName(item.teamName) === normalizeName(teamName) && item.side === side))
    );

    if (side === "home" && normalizeName(selectedSavedHomeTeam) === normalizeName(teamName)) {
      setSelectedSavedHomeTeam("");
    }

    if (side === "away" && normalizeName(selectedSavedAwayTeam) === normalizeName(teamName)) {
      setSelectedSavedAwayTeam("");
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-2xl bg-slate-900 p-5 shadow-md">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={importAnalyses}
            className="hidden"
          />
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Analizador Manual de Apuestas</h1>
              <p className="mt-1 text-sm text-slate-300">
                Ahora guarda equipos por separado como local y visitante, incluye rojas y muestra G/E/P.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportAnalyses}
                className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/20"
              >
                Exportar
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/20"
              >
                Importar
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-purple-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-bold text-purple-700">1. Gestión de bankroll y mercado</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Field
              label="Bankroll actual"
              value={bankroll}
              onChange={setBankroll}
              cls="border-purple-300 text-slate-900 focus:border-purple-500"
            />
            <div>
              <label className="mb-2 block text-sm font-bold text-purple-700">Método de stake</label>
              <select
                value={stakeMethod}
                onChange={(e) => setStakeMethod(e.target.value as "fijo" | "confianza" | "kelly")}
                className="w-full rounded-xl border-2 border-purple-300 px-3 py-2 text-slate-900 outline-none focus:border-purple-500"
              >
                <option value="fijo">Fijo</option>
                <option value="confianza">Por confianza</option>
                <option value="kelly">Kelly 50%</option>
              </select>
            </div>
            <Field
              label="Cuota para stake"
              value={stakeOdds}
              onChange={setStakeOdds}
              cls="border-purple-300 text-slate-900 focus:border-purple-500"
            />
            <div>
              <label className="mb-2 block text-sm font-bold text-purple-700">Mercado de preferencia</label>
              <select
                value={preferredMarket}
                onChange={(e) =>
                  setPreferredMarket(
                    e.target.value as "auto" | "goles" | "tarjetas" | "corners" | "1x2"
                  )
                }
                className="w-full rounded-xl border-2 border-purple-300 px-3 py-2 text-slate-900 outline-none focus:border-purple-500"
              >
                <option value="auto">Automático</option>
                <option value="goles">Goles</option>
                <option value="tarjetas">Tarjetas</option>
                <option value="corners">Corners</option>
                <option value="1x2">1X2 / doble oportunidad</option>
              </select>
            </div>
            <SmallInfoBox
              label="Stake sugerido"
              value={dec(bankrollAnalysis.amount)}
              sub={`${dec(bankrollAnalysis.percent)}% del bank`}
              tone="purple"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-blue-700">2. Datos del partido</h2>
            <div className="flex flex-wrap gap-2">
              {editingId && (
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                  Editando análisis
                </span>
              )}
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                Borrador automático
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Field
              label="Equipo local"
              value={matchInfo.home}
              onChange={(v) => setMatchInfo((p) => ({ ...p, home: v }))}
              cls="border-blue-300 text-blue-700 focus:border-blue-500"
            />
            <Field
              label="Equipo visitante"
              value={matchInfo.away}
              onChange={(v) => setMatchInfo((p) => ({ ...p, away: v }))}
              cls="border-red-300 text-red-700 focus:border-red-500"
            />
            <Field
              label="Puesto local"
              value={matchInfo.homePosition}
              onChange={(v) => setMatchInfo((p) => ({ ...p, homePosition: v }))}
              cls="border-blue-300 text-slate-900 focus:border-blue-500"
            />
            <Field
              label="Puesto visitante"
              value={matchInfo.awayPosition}
              onChange={(v) => setMatchInfo((p) => ({ ...p, awayPosition: v }))}
              cls="border-red-300 text-slate-900 focus:border-red-500"
            />
            <Field
              label="Liga"
              value={matchInfo.league}
              onChange={(v) => setMatchInfo((p) => ({ ...p, league: v }))}
              cls="border-sky-200 text-slate-900 focus:border-sky-500"
            />
            <Field
              label="País"
              value={matchInfo.country}
              onChange={(v) => setMatchInfo((p) => ({ ...p, country: v }))}
              cls="border-sky-200 text-slate-900 focus:border-sky-500"
            />
            <Field
              label="Fecha"
              value={matchInfo.date}
              onChange={(v) => setMatchInfo((p) => ({ ...p, date: v }))}
              cls="border-sky-200 text-slate-900 focus:border-sky-500"
            />
            <Field
              label="Árbitro"
              value={matchInfo.referee}
              onChange={(v) => setMatchInfo((p) => ({ ...p, referee: v }))}
              cls="border-sky-200 text-slate-900 focus:border-sky-500"
            />
            <Field
              label="Promedio tarjetas árbitro"
              value={matchInfo.refereeCards}
              onChange={(v) => setMatchInfo((p) => ({ ...p, refereeCards: v }))}
              cls="border-sky-200 text-slate-900 focus:border-sky-500"
            />
            <Field
              label="Promedio amarillas árbitro"
              value={matchInfo.refereeYellowCards}
              onChange={(v) => setMatchInfo((p) => ({ ...p, refereeYellowCards: v }))}
              cls="border-amber-200 text-slate-900 focus:border-amber-500"
            />
            <Field
              label="Promedio rojas árbitro"
              value={matchInfo.refereeRedCards}
              onChange={(v) => setMatchInfo((p) => ({ ...p, refereeRedCards: v }))}
              cls="border-rose-200 text-slate-900 focus:border-rose-500"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-blue-700">Biblioteca de equipos</h2>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                Locales guardados: {homeSavedOptions.length}
              </span>
              <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
                Visitantes guardados: {awaySavedOptions.length}
              </span>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <div>
                  <label className="mb-2 block text-sm font-bold text-blue-700">
                    Cargar equipo guardado (local)
                  </label>
                  <select
                    value={selectedSavedHomeTeam}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedSavedHomeTeam(value);
                      if (value) loadTeamTemplate("home", value);
                    }}
                    className="w-full rounded-xl border-2 border-blue-300 px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
                  >
                    <option value="">Seleccionar equipo local guardado</option>
                    {homeSavedOptions.map((team) => (
                      <option key={`home-${team.teamName}-${team.updatedAt}`} value={team.teamName}>
                        {team.teamName}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => saveTeamTemplate("home")}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                >
                  Guardar local
                </button>

                <button
                  onClick={() => {
                    if (selectedSavedHomeTeam) deleteTeamTemplate(selectedSavedHomeTeam, "home");
                  }}
                  className="rounded-xl bg-red-100 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-200"
                >
                  Eliminar
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {homeSavedOptions.slice(0, 4).map((item) => (
                  <div
                    key={`home-preview-${item.teamName}-${item.updatedAt}`}
                    className="flex items-center justify-between rounded-xl border border-blue-200 bg-white p-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">{item.teamName}</p>
                      <p className="text-xs text-slate-600">LOCAL · {formatDateTime(item.updatedAt)}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedSavedHomeTeam(item.teamName);
                        loadTeamTemplate("home", item.teamName);
                      }}
                      className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700"
                    >
                      Cargar
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <div>
                  <label className="mb-2 block text-sm font-bold text-red-700">
                    Cargar equipo guardado (visitante)
                  </label>
                  <select
                    value={selectedSavedAwayTeam}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedSavedAwayTeam(value);
                      if (value) loadTeamTemplate("away", value);
                    }}
                    className="w-full rounded-xl border-2 border-red-300 px-3 py-2 text-slate-900 outline-none focus:border-red-500"
                  >
                    <option value="">Seleccionar equipo visitante guardado</option>
                    {awaySavedOptions.map((team) => (
                      <option key={`away-${team.teamName}-${team.updatedAt}`} value={team.teamName}>
                        {team.teamName}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => saveTeamTemplate("away")}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
                >
                  Guardar visitante
                </button>

                <button
                  onClick={() => {
                    if (selectedSavedAwayTeam) deleteTeamTemplate(selectedSavedAwayTeam, "away");
                  }}
                  className="rounded-xl bg-red-100 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-200"
                >
                  Eliminar
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {awaySavedOptions.slice(0, 4).map((item) => (
                  <div
                    key={`away-preview-${item.teamName}-${item.updatedAt}`}
                    className="flex items-center justify-between rounded-xl border border-red-200 bg-white p-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">{item.teamName}</p>
                      <p className="text-xs text-slate-600">VISITANTE · {formatDateTime(item.updatedAt)}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedSavedAwayTeam(item.teamName);
                        loadTeamTemplate("away", item.teamName);
                      }}
                      className="rounded-lg bg-red-100 px-3 py-1 text-xs font-bold text-red-700"
                    >
                      Cargar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <TeamSection
          title="3. Últimos 10 del local"
          titleColor="text-blue-700"
          boxColor="border-blue-200"
          headerBg="bg-blue-100"
          inputClass="border-blue-300 text-slate-900 focus:border-blue-500"
          rows={homeRows}
          onChange={updateRow.bind(null, setHomeRows)}
          metrics={home}
          suggestions={awayRivalSuggestions}
        />

        <TeamSection
          title="4. Últimos 10 del visitante"
          titleColor="text-red-700"
          boxColor="border-red-200"
          headerBg="bg-red-100"
          inputClass="border-red-300 text-slate-900 focus:border-red-500"
          rows={awayRows}
          onChange={updateRow.bind(null, setAwayRows)}
          metrics={away}
          suggestions={homeRivalSuggestions}
        />

        <section className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm xl:col-span-2">
            <h2 className="mb-3 text-lg font-bold text-emerald-700">5. Análisis final</h2>

            <section className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
              <h3 className="mb-3 text-base font-bold text-red-700">Protección anti partidos trampa</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <RiskInfoBox
                  label="Riesgo de 0-0"
                  value={analysis.riskFlags.zeroZeroRisk.toUpperCase()}
                  level={analysis.riskFlags.zeroZeroRisk}
                />
                <RiskInfoBox
                  label="Probabilidad 0-0"
                  value={pct(analysis.zeroZeroProbability)}
                  level={analysis.riskFlags.zeroZeroRisk}
                />
                <RiskInfoBox
                  label="Goles esperados"
                  value={dec(analysis.totalExpectedGoals)}
                  level={
                    analysis.totalExpectedGoals < 1.9
                      ? "alto"
                      : analysis.totalExpectedGoals < 2.2
                      ? "medio"
                      : "bajo"
                  }
                />
                <RiskInfoBox
                  label="Estado over 1.5"
                  value={analysis.riskFlags.avoidGoals ? "CUIDADO" : "APTO"}
                  level={analysis.riskFlags.avoidGoals ? "medio" : "bajo"}
                />
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                <div
                  className={`rounded-xl border p-3 ${
                    analysis.riskFlags.trapMatch
                      ? "border-red-300 bg-red-100"
                      : "border-green-300 bg-green-100"
                  }`}
                >
                  <p
                    className={`font-bold ${
                      analysis.riskFlags.trapMatch ? "text-red-800" : "text-green-800"
                    }`}
                  >
                    {analysis.riskFlags.trapMatch
                      ? "Partido trampa para goles"
                      : "Partido sin alerta fuerte"}
                  </p>
                  <div className="mt-2 space-y-1">
                    {analysis.riskFlags.reasonList.length > 0 ? (
                      analysis.riskFlags.reasonList.map((reason) => (
                        <div key={reason} className="text-sm text-slate-700">
                          • {reason}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-700">No hay alertas fuertes activas.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-sky-200 bg-sky-100 p-3">
                  <p className="font-bold text-sky-800">Mercados alternativos</p>
                  <div className="mt-2 space-y-1">
                    {analysis.riskFlags.alternativeMarkets.length > 0 ? (
                      analysis.riskFlags.alternativeMarkets.map((market) => (
                        <div key={market} className="text-sm text-slate-700">
                          • {market}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-700">Partido apto para mercados principales.</div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <SmallStatBox label="Goles esp. local" value={dec(analysis.expectedHomeGoals)} tone="blue" />
              <SmallStatBox label="Goles esp. visitante" value={dec(analysis.expectedAwayGoals)} tone="red" />
              <SmallStatBox label="Amarillas esp." value={dec(analysis.expectedTotalYellowCards)} tone="amber" />
              <SmallStatBox label="Rojas esp." value={dec(analysis.expectedTotalRedCards)} tone="red" />
              <SmallStatBox label="Local o empate (1X)" value={pct(analysis.homeOrDraw)} tone="green" />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["Over 1.5", analysis.over15],
                ["Over 2.5", analysis.over25],
                ["Over 3.5", analysis.over35],
                ["Menos de 3.5", analysis.under35],
                ["Ambos marcan", analysis.btts],

                ["Gana local", analysis.localWin],
                ["Empate", analysis.draw],
                ["Gana visitante", analysis.awayWin],
                ["Local o empate (1X)", analysis.homeOrDraw],
                ["Visitante o empate (X2)", analysis.awayOrDraw],
                ["No empate (1 o 2)", analysis.noDraw],

                ["Más de 2.5 amarillas", analysis.cardsOver25],
                ["Más de 3.5 amarillas", analysis.cardsOver35],
                ["Más de 4.5 amarillas", analysis.cardsOver45],
                ["Menos de 5.5 amarillas", analysis.cardsUnder55],
                ["Menos de 6.5 amarillas", analysis.cardsUnder65],
                ["Menos de 7.5 amarillas", analysis.cardsUnder75],

                ["Más de 0.5 rojas", analysis.redsOver05],
                ["Menos de 1.5 rojas", analysis.redsUnder15],

                ["Más de 5.5 corners", analysis.cornersOver55],
                ["Más de 6.5 corners", analysis.cornersOver65],
                ["Más de 7.5 corners", analysis.cornersOver75],
                ["Menos de 10.5 corners", analysis.cornersUnder105],
                ["Menos de 11.5 corners", analysis.cornersUnder115],
                ["Menos de 12.5 corners", analysis.cornersUnder125],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className={`flex items-center justify-between rounded-xl border p-3 ${analysisCardClass(
                    Number(value)
                  )}`}
                >
                  <div>
                    <p className="font-bold text-slate-800">{label}</p>
                    <p className="text-xs text-slate-600">
                      Confianza {confidenceLabel(Number(value))}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass(
                      Number(value)
                    )}`}
                  >
                    {pct(Number(value))}
                  </span>
                </div>
              ))}
            </div>

            <section className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
              <h3 className="mb-3 text-base font-bold text-indigo-700">Análisis plus: rivales en común</h3>
              {commonOpponents.length === 0 ? (
                <p className="text-sm text-slate-600">No hay rivales en común todavía.</p>
              ) : (
                <div className="space-y-2">
                  {commonOpponents.map((item) => (
                    <div key={item.rival} className="rounded-xl border border-indigo-200 bg-white p-3">
                      <p className="font-bold text-slate-900">{item.rival}</p>
                      <p className="text-sm text-slate-700">
                        Local: {item.homeGF}-{item.homeGC} · Visitante: {item.awayGF}-{item.awayGC}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
              <p className="font-bold text-cyan-800">Marcadores más probables</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                {analysis.topScores.map((item) => (
                  <div key={item.score} className="rounded-xl border border-cyan-200 bg-white p-3">
                    <p className="text-lg font-bold text-slate-900">{item.score}</p>
                    <p className="text-sm text-slate-600">{pct(item.probability)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={saveAnalysis}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
              >
                {editingId ? "Actualizar análisis" : "Guardar análisis"}
              </button>
              <button
                onClick={resetForm}
                className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-300"
              >
                Nuevo partido
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <section className="rounded-2xl border border-violet-200 bg-white p-3 shadow-sm">
              <h2 className="mb-2 text-base font-bold text-violet-700">6. Mejores mercados</h2>
              <div className="space-y-2">
                <CompactRecommendation label="Goles" pick={analysis.bestGoalsPick} />
                <CompactRecommendation label="Amarillas" pick={analysis.bestCardsPick} />
                <CompactRecommendation label="Rojas" pick={analysis.bestRedCardsPick} />
                <CompactRecommendation label="Corners" pick={analysis.bestCornersPick} />
                <CompactRecommendation label="Ganador" pick={analysis.bestWinnerPick} />
                <CompactRecommendation label="Doble oportunidad" pick={analysis.bestDoubleChancePick} />
              </div>
            </section>

            <section className="rounded-2xl border border-orange-200 bg-white p-3 shadow-sm">
              <h2 className="mb-2 text-base font-bold text-orange-700">Semáforo de apuestas</h2>
              <div className="space-y-2">
                <MiniRecommendationCard title="Más segura" pick={analysis.safestPick} color="green" />
                <MiniRecommendationCard title="Mejor valor" pick={analysis.valuePick} color="amber" />
                <MiniRecommendationCard title="Arriesgada" pick={analysis.riskyPick} color="rose" />
              </div>
            </section>

            <section className="rounded-2xl border border-teal-200 bg-white p-3 shadow-sm">
              <h2 className="mb-2 text-base font-bold text-teal-700">Monte Carlo</h2>
              <div className="grid gap-2">
                <SmallStatBox label="Simulaciones" value={String(monteCarlo.simulations)} tone="green" />
                <SmallStatBox label="Local gana" value={pct(monteCarlo.homeWin)} tone="blue" />
                <SmallStatBox label="Empate" value={pct(monteCarlo.draw)} tone="amber" />
                <SmallStatBox label="Visitante gana" value={pct(monteCarlo.awayWin)} tone="red" />
              </div>
            </section>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-bold text-emerald-700">Detector de valor</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ValueRow label="Over 2.5" modelProb={analysis.over25} />
            <ValueRow label="Ambos marcan" modelProb={analysis.btts} />
            <ValueRow label="Local o empate (1X)" modelProb={analysis.homeOrDraw} />
            <ValueRow label="Visitante o empate (X2)" modelProb={analysis.awayOrDraw} />
            <ValueRow label="Más de 5.5 corners" modelProb={analysis.cornersOver55} />
            <ValueRow label="Más de 2.5 amarillas" modelProb={analysis.cardsOver25} />
          </div>
        </section>

        <section className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-bold text-indigo-700">Rendimiento</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <SmallStatBox label="Análisis guardados" value={String(performance.total)} tone="blue" />
            <SmallStatBox label="Apuestas cerradas" value={String(performance.settled)} tone="amber" />
            <SmallStatBox label="Ganadas" value={String(performance.wins)} tone="green" />
            <SmallStatBox label="Perdidas" value={String(performance.losses)} tone="red" />
            <SmallStatBox label="Hit Rate" value={pct(performance.hitRate)} tone="green" />
            <SmallStatBox
              label="ROI"
              value={`${dec(performance.roi)}%`}
              tone={performance.roi >= 0 ? "green" : "red"}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">Lista rápida</h2>
            <p className="text-sm text-slate-500">{filteredAnalyses.length} partidos</p>
          </div>

          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <input
              placeholder="Buscar por equipo"
              value={searchTeam}
              onChange={(e) => setSearchTeam(e.target.value)}
              className="rounded-xl border-2 border-slate-300 px-3 py-2"
            />
            <input
              placeholder="Filtrar por liga"
              value={searchLeague}
              onChange={(e) => setSearchLeague(e.target.value)}
              className="rounded-xl border-2 border-slate-300 px-3 py-2"
            />
          </div>

          {filteredAnalyses.length === 0 ? (
            <p className="text-slate-600">No hay partidos guardados.</p>
          ) : (
            <div className="space-y-2">
              {filteredAnalyses.map((item) => (
                <div
                  key={`compact-${item.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      <span className="text-blue-700">{item.matchInfo.home || "Local"}</span>
                      {" vs "}
                      <span className="text-red-700">{item.matchInfo.away || "Visitante"}</span>
                    </p>
                    <p className="truncate text-xs text-slate-600">
                      {item.matchInfo.league || "Liga"} · {item.matchInfo.date || "Sin fecha"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {item.topPicks.slice(0, 3).map((pick) => (
                      <span
                        key={`${item.id}-${pick.market}`}
                        className={`rounded-full px-2 py-1 text-[11px] font-bold ${badgeClass(
                          pick.probability
                        )}`}
                      >
                        {pick.market}
                      </span>
                    ))}

                    <button
                      onClick={() => toggleSelection(item.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                        selectedIds.includes(item.id)
                          ? "bg-green-600 text-white"
                          : "bg-slate-200 text-slate-800"
                      }`}
                    >
                      {selectedIds.includes(item.id) ? "OK" : "Sel"}
                    </button>

                    <button
                      onClick={() => editAnalysis(item)}
                      className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700"
                    >
                      Editar
                    </button>

                    <button
                      onClick={() => deleteAnalysis(item.id)}
                      className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700"
                    >
                      X
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-indigo-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-indigo-700">Historial de análisis</h2>
            {savedAnalyses.length > 0 && (
              <button
                onClick={() => {
                  setSavedAnalyses([]);
                  setSelectedIds([]);
                  setEditingId(null);
                }}
                className="rounded-xl bg-red-100 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-200"
              >
                Borrar todo
              </button>
            )}
          </div>

          {filteredAnalyses.length === 0 ? (
            <p className="text-slate-600">Aún no has guardado análisis.</p>
          ) : (
            <div className="space-y-2">
              {filteredAnalyses.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        <span className="text-blue-700">{item.matchInfo.home || "Local"}</span>
                        {" vs "}
                        <span className="text-red-700">{item.matchInfo.away || "Visitante"}</span>
                      </p>
                      <p className="text-xs text-slate-600">
                        {item.matchInfo.league || "Liga"} · {item.matchInfo.country || "País"} ·{" "}
                        {item.matchInfo.date || "Sin fecha"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => toggleSelection(item.id)}
                        className={`rounded-lg px-3 py-1 text-xs font-bold ${
                          selectedIds.includes(item.id)
                            ? "bg-green-600 text-white"
                            : "bg-slate-200 text-slate-800"
                        }`}
                      >
                        {selectedIds.includes(item.id) ? "Seleccionado" : "Seleccionar"}
                      </button>

                      <button
                        onClick={() => editAnalysis(item)}
                        className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700"
                      >
                        Editar
                      </button>

                      <button
                        onClick={() => deleteAnalysis(item.id)}
                        className="rounded-lg bg-red-100 px-3 py-1 text-xs font-bold text-red-700"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                    {item.topPicks.map((pick, index) => (
                      <div
                        key={index}
                        className={`rounded-xl border p-2 ${analysisCardClass(pick.probability)}`}
                      >
                        <p className="text-xs font-semibold text-slate-800">{pick.market}</p>
                        <p className="text-xs text-slate-600">{pct(pick.probability)}</p>
                      </div>
                    ))}

                    <div className="rounded-xl border border-slate-200 p-2">
                      <p className="text-xs font-semibold text-slate-700">Stake</p>
                      <input
                        value={item.stake}
                        onChange={(e) => updateSavedField(item.id, "stake", e.target.value)}
                        className="mt-1 w-full rounded-lg border-2 border-slate-300 px-2 py-1 text-sm text-slate-900"
                        placeholder="0"
                      />
                    </div>

                    <div className="rounded-xl border border-slate-200 p-2">
                      <p className="text-xs font-semibold text-slate-700">Cuota</p>
                      <input
                        value={item.odds}
                        onChange={(e) => updateSavedField(item.id, "odds", e.target.value)}
                        className="mt-1 w-full rounded-lg border-2 border-slate-300 px-2 py-1 text-sm text-slate-900"
                        placeholder="0"
                      />
                    </div>

                    <div className="rounded-xl border border-slate-200 p-2">
                      <p className="text-xs font-semibold text-slate-700">Resultado</p>
                      <select
                        value={item.result}
                        onChange={(e) => updateSavedResult(item.id, e.target.value as ResultStatus)}
                        className="mt-1 w-full rounded-lg border-2 border-slate-300 px-2 py-1 text-sm text-slate-900"
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="ganada">Ganada</option>
                        <option value="perdida">Perdida</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-fuchsia-200 bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-base font-bold text-fuchsia-700">7. Generador de parlay</h2>
          {selectedAnalyses.length === 0 ? (
            <p className="text-slate-600">Selecciona uno o más análisis guardados para generar parlays.</p>
          ) : (
            <div className="space-y-3">
              <MiniParlayBlock title="Conservadora" color="fuchsia" data={generatedParlays.conservadora} />
              <MiniParlayBlock title="Media" color="sky" data={generatedParlays.media} />
              <MiniParlayBlock title="Agresiva" color="rose" data={generatedParlays.agresiva} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  cls,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  cls: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border-2 px-3 py-2 text-sm font-medium outline-none ${cls}`}
      />
    </div>
  );
}

function SmallInfoBox({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "purple";
}) {
  const cls = { purple: "border-purple-200 bg-purple-50 text-purple-700" }[tone];

  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <p className="text-sm font-bold">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-700">{sub}</p>
    </div>
  );
}

function SmallStatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "red" | "green" | "amber";
}) {
  const styles = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    red: "bg-red-50 border-red-200 text-red-700",
    green: "bg-green-50 border-green-200 text-green-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
  } as const;

  return (
    <div className={`rounded-xl border p-3 ${styles[tone]}`}>
      <p className="text-xs font-bold">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function RiskInfoBox({
  label,
  value,
  level,
}: {
  label: string;
  value: string;
  level: "alto" | "medio" | "bajo";
}) {
  return (
    <div className={`rounded-xl border p-3 ${riskBadgeClass(level)}`}>
      <p className="text-xs font-bold">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function CompactRecommendation({
  label,
  pick,
}: {
  label: string;
  pick: Pick | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-xs font-bold text-slate-600">{label}</p>
      {pick ? (
        <>
          <p className="mt-1 text-sm font-bold text-slate-900">{pick.market}</p>
          <p className="text-xs text-slate-600">{pct(pick.probability)}</p>
        </>
      ) : (
        <p className="mt-1 text-xs text-slate-500">Sin señal clara</p>
      )}
    </div>
  );
}

function MiniRecommendationCard({
  title,
  pick,
  color,
}: {
  title: string;
  pick: Pick | null;
  color: "green" | "amber" | "rose";
}) {
  const styles = {
    green: "border-green-200 bg-green-50 text-green-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  } as const;

  return (
    <div className={`rounded-xl border p-2.5 ${styles[color]}`}>
      <p className="text-xs font-bold">{title}</p>
      {pick ? (
        <>
          <p className="mt-1 text-sm font-bold text-slate-900">{pick.market}</p>
          <p className="text-xs text-slate-700">{pct(pick.probability)}</p>
        </>
      ) : (
        <p className="mt-1 text-xs text-slate-700">Sin sugerencia</p>
      )}
    </div>
  );
}

function ValueRow({ label, modelProb }: { label: string; modelProb: number }) {
  const [odds, setOdds] = useState("");
  const oddsNumber = Number(odds || 0);
  const implied = oddsNumber > 0 ? (1 / oddsNumber) * 100 : 0;
  const edge = modelProb - implied;

  let status = "Sin cuota";
  let statusClass = "bg-slate-100 text-slate-700 border-slate-300";

  if (oddsNumber > 0 && edge > 5) {
    status = "Valor alto";
    statusClass = "bg-green-100 text-green-800 border-green-300";
  } else if (oddsNumber > 0 && edge > 0) {
    status = "Valor leve";
    statusClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
  } else if (oddsNumber > 0) {
    status = "Sin valor";
    statusClass = "bg-rose-100 text-rose-800 border-rose-300";
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="font-bold text-slate-900">{label}</p>
      <p className="mt-1 text-sm text-slate-600">Probabilidad modelo: {pct(modelProb)}</p>

      <input
        type="number"
        step="0.01"
        value={odds}
        onChange={(e) => setOdds(e.target.value)}
        placeholder="Ingresa cuota"
        className="mt-3 w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-slate-500"
      />

      <button
        onClick={() => setOdds("")}
        className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-300"
      >
        Limpiar
      </button>

      <div className="mt-3 space-y-1 text-sm">
        <p className="text-slate-700">
          Prob. implícita: <span className="font-bold">{oddsNumber > 0 ? pct(implied) : "-"}</span>
        </p>
        <p className="text-slate-700">
          Edge: <span className="font-bold">{oddsNumber > 0 ? `${dec(edge)}%` : "-"}</span>
        </p>
      </div>

      <span className={`mt-3 inline-block rounded-full border px-3 py-1 text-xs font-bold ${statusClass}`}>
        {status}
      </span>
    </div>
  );
}

function MiniParlayBlock({
  title,
  color,
  data,
}: {
  title: string;
  color: "fuchsia" | "sky" | "rose";
  data: {
    matches: { id: number; match: string; lines: Pick[] }[];
    avgProbability: number;
    confidence: string;
  };
}) {
  const styles = {
    fuchsia: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
  } as const;

  return (
    <div className={`rounded-xl border p-3 ${styles[color]}`}>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className={`inline-block h-3.5 w-3.5 rounded-full ${trafficLightClass(data.avgProbability)}`} />
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="text-xs text-slate-700">{pct(data.avgProbability)}</p>
        <p className="text-xs text-slate-700">{data.confidence}</p>
      </div>

      <div className="space-y-2">
        {data.matches.map((match) => (
          <div
            key={`${title}-${match.id}`}
            className="rounded-xl border border-white bg-white/80 p-3"
          >
            <p className="mb-2 text-sm font-bold text-slate-900">{match.match}</p>

            <div className="grid gap-2 md:grid-cols-3">
              {match.lines.map((line, idx) => (
                <div
                  key={`${match.id}-${line.market}-${idx}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                >
                  <p className="text-[11px] font-bold text-slate-600">Línea {idx + 1}</p>
                  <p className="mt-1 text-xs font-bold text-slate-900">{line.market}</p>
                  <span className={`mt-2 inline-block rounded-full px-2 py-1 text-[11px] font-bold ${badgeClass(line.probability)}`}>
                    {pct(line.probability)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamSection({
  title,
  rows,
  onChange,
  metrics,
  titleColor,
  boxColor,
  headerBg,
  inputClass,
  suggestions,
}: {
  title: string;
  rows: Row[];
  onChange: (index: number, field: keyof Row, value: string) => void;
  metrics: ReturnType<typeof getMetrics>;
  titleColor: string;
  boxColor: string;
  headerBg: string;
  inputClass: string;
  suggestions: string[];
}) {
  return (
    <section className={`rounded-2xl border bg-white p-4 shadow-sm ${boxColor}`}>
      <h2 className={`mb-3 text-lg font-bold ${titleColor}`}>{title}</h2>

      <div className="overflow-x-auto">
        <div className="min-w-[1460px] space-y-2">
          <div
            className={`grid grid-cols-[40px_230px_70px_70px_88px_88px_88px_88px_88px_88px_88px_76px] gap-2 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 ${headerBg}`}
          >
            <div>#</div>
            <div>Rival</div>
            <div>GF</div>
            <div>GC</div>
            <div>Am Eq.</div>
            <div>Am Rival</div>
            <div>R Eq.</div>
            <div>R Rival</div>
            <div>C. Eq.</div>
            <div>C. Rival</div>
            <div>Total</div>
            <div>G/E/P</div>
          </div>

          {rows.map((row, index) => {
            const total = toNumber(row.gf) + toNumber(row.gc);
            const outcome = getOutcome(toNumber(row.gf), toNumber(row.gc));

            return (
              <div
                key={index}
                className="grid grid-cols-[40px_230px_70px_70px_88px_88px_88px_88px_88px_88px_88px_76px] items-center gap-2"
              >
                <div className="px-2 text-sm font-bold text-slate-700">{index + 1}</div>

                <input
                  list={`${title}-rivals`}
                  className={`rounded-xl border-2 px-3 py-2 text-sm outline-none ${inputClass}`}
                  value={row.rival}
                  onChange={(e) => onChange(index, "rival", e.target.value)}
                />

                <input
                  type="number"
                  className={`rounded-xl border-2 px-3 py-2 text-sm outline-none ${inputClass}`}
                  value={row.gf}
                  onChange={(e) => onChange(index, "gf", e.target.value)}
                />

                <input
                  type="number"
                  className={`rounded-xl border-2 px-3 py-2 text-sm outline-none ${inputClass}`}
                  value={row.gc}
                  onChange={(e) => onChange(index, "gc", e.target.value)}
                />

                <input
                  type="number"
                  className={`rounded-xl border-2 px-3 py-2 text-sm outline-none ${inputClass}`}
                  value={row.ownCards}
                  onChange={(e) => onChange(index, "ownCards", e.target.value)}
                />

                <input
                  type="number"
                  className={`rounded-xl border-2 px-3 py-2 text-sm outline-none ${inputClass}`}
                  value={row.oppCards}
                  onChange={(e) => onChange(index, "oppCards", e.target.value)}
                />

                <input
                  type="number"
                  className={`rounded-xl border-2 px-3 py-2 text-sm outline-none ${inputClass}`}
                  value={row.ownRedCards}
                  onChange={(e) => onChange(index, "ownRedCards", e.target.value)}
                />

                <input
                  type="number"
                  className={`rounded-xl border-2 px-3 py-2 text-sm outline-none ${inputClass}`}
                  value={row.oppRedCards}
                  onChange={(e) => onChange(index, "oppRedCards", e.target.value)}
                />

                <input
                  type="number"
                  className={`rounded-xl border-2 px-3 py-2 text-sm outline-none ${inputClass}`}
                  value={row.ownCorners}
                  onChange={(e) => onChange(index, "ownCorners", e.target.value)}
                />

                <input
                  type="number"
                  className={`rounded-xl border-2 px-3 py-2 text-sm outline-none ${inputClass}`}
                  value={row.oppCorners}
                  onChange={(e) => onChange(index, "oppCorners", e.target.value)}
                />

                <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">
                  {total}
                </div>

                <div className="text-center">
                  <span className={`inline-block rounded-full border px-3 py-1 text-xs font-bold ${resultBadgeClass(outcome)}`}>
                    {outcome}
                  </span>
                </div>
              </div>
            );
          })}

          <datalist id={`${title}-rivals`}>
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-15">
        {[
          ["O1.5", pct(metrics.over15)],
          ["O2.5", pct(metrics.over25)],
          ["O3.5", pct(metrics.over35)],
          ["U3.5", pct(metrics.under35)],
          ["BTTS", pct(metrics.btts)],
          ["GF prom.", metrics.avgGF.toFixed(2)],
          ["GC prom.", metrics.avgGC.toFixed(2)],
          ["Am eq.", metrics.avgOwnCards.toFixed(2)],
          ["Am rival", metrics.avgOppCards.toFixed(2)],
          ["Am total", metrics.avgTotalCards.toFixed(2)],
          ["R eq.", metrics.avgOwnRedCards.toFixed(2)],
          ["R rival", metrics.avgOppRedCards.toFixed(2)],
          ["R total", metrics.avgTotalRedCards.toFixed(2)],
          ["Corn eq.", metrics.avgOwnCorners.toFixed(2)],
          ["Corn rival", metrics.avgOppCorners.toFixed(2)],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-600">{label}</p>
            <p className="text-lg font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-bold text-green-700">Ganados</p>
          <p className="text-xl font-bold text-slate-900">{metrics.winCount}</p>
        </div>
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-700">Empatados</p>
          <p className="text-xl font-bold text-slate-900">{metrics.drawCount}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-bold text-red-700">Perdidos</p>
          <p className="text-xl font-bold text-slate-900">{metrics.lossCount}</p>
        </div>
      </div>
    </section>
  );
}