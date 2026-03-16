"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Row = {
  rival: string;
  gf: number | "";
  gc: number | "";
  cards: number | "";
  corners: number | "";
};

type Pick = {
  market: string;
  probability: number;
  tier?: "segura" | "valor" | "arriesgada";
};

type ResultStatus = "pendiente" | "ganada" | "perdida";

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
  cards35: number;
  cards45: number;
  corners85: number;
  corners95: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  totalExpectedGoals: number;
  topScores: { score: string; probability: number }[];
  zeroZeroProbability: number;
  oneZeroProbability: number;
  zeroOneProbability: number;
  picks: Pick[];
  safestPick: Pick | null;
  valuePick: Pick | null;
  riskyPick: Pick | null;
  riskFlags: RiskFlags;
};

type SavedAnalysis = {
  id: number;
  matchInfo: {
    home: string;
    away: string;
    league: string;
    country: string;
    date: string;
    referee: string;
    refereeCards: string;
    homePosition: string;
    awayPosition: string;
  };
  homeRows: Row[];
  awayRows: Row[];
  analysis: AnalysisResult;
  topPicks: Pick[];
  stake: string;
  odds: string;
  result: ResultStatus;
};

type TodayMatch = {
  fixture: {
    id: number;
    date: string;
    status?: { short?: string };
  };
  league: {
    name: string;
    country: string;
    season?: number;
  };
  teams: {
    home: { name: string; id?: number };
    away: { name: string; id?: number };
  };
};

type CountryOption = { name: string };

type ApiFixture = {
  fixture?: {
    id?: number;
    date?: string;
    status?: { short?: string };
  };
  teams: {
    home: { id?: number; name: string };
    away: { id?: number; name: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
};

const STORAGE_KEY = "analizador-apuestas-guardados-v9";
const SELECTED_KEY = "analizador-apuestas-seleccionados-v9";
const BANKROLL_KEY = "analizador-apuestas-bankroll-v1";

const FALLBACK_COUNTRIES: CountryOption[] = [
  { name: "England" },
  { name: "Spain" },
  { name: "Italy" },
  { name: "Germany" },
  { name: "France" },
  { name: "Argentina" },
  { name: "Brazil" },
  { name: "Mexico" },
  { name: "USA" },
  { name: "Portugal" },
  { name: "Netherlands" },
  { name: "Belgium" },
  { name: "Scotland" },
  { name: "Turkey" },
  { name: "Honduras" },
];

const emptyRows = (): Row[] =>
  Array.from({ length: 10 }, () => ({ rival: "", gf: "", gc: "", cards: "", corners: "" }));

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

function poisson(lambda: number, k: number) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function factorial(n: number) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
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

function getMetrics(rows: Row[]) {
  const played = rows.filter(
    (r) => r.rival || r.gf !== "" || r.gc !== "" || r.cards !== "" || r.corners !== ""
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
      avgCards: 0,
      avgCorners: 0,
      weightedGF: 0,
      weightedGC: 0,
      weightedCards: 0,
      weightedCorners: 0,
    };
  }

  const totals = played.map((r) => toNumber(r.gf) + toNumber(r.gc));
  const gfs = played.map((r) => toNumber(r.gf));
  const gcs = played.map((r) => toNumber(r.gc));
  const cards = played.map((r) => toNumber(r.cards));
  const corners = played.map((r) => toNumber(r.corners));

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
    avgCards: average(cards),
    avgCorners: average(corners),
    weightedGF: weightedAverage(gfs),
    weightedGC: weightedAverage(gcs),
    weightedCards: weightedAverage(cards),
    weightedCorners: weightedAverage(corners),
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

function getTodayDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Tegucigalpa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeApiDate(value: string) {
  const date = new Date(value);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function seasonFromDate(dateStr: string) {
  const [year, month] = dateStr.split("-").map(Number);
  return month >= 7 ? year : year - 1;
}

async function apiFootballFetch(path: string, timeoutMs = 15000) {
  const apiKey = process.env.NEXT_PUBLIC_API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("Falta NEXT_PUBLIC_API_FOOTBALL_KEY en .env.local");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://v3.football.api-sports.io/${path}`, {
      method: "GET",
      headers: {
        "x-apisports-key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Error API-Football: ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getAvailableCountries(): Promise<CountryOption[]> {
  try {
    const data = await apiFootballFetch("countries", 12000);
    const response = Array.isArray(data.response) ? data.response : [];
    const countries = response
      .map((item: any) => ({ name: String(item.name || "") }))
      .filter((item: CountryOption) => !!item.name)
      .sort((a: CountryOption, b: CountryOption) => a.name.localeCompare(b.name));
    return countries.length ? countries : FALLBACK_COUNTRIES;
  } catch {
    return FALLBACK_COUNTRIES;
  }
}

async function getMatchesByDateAndCountry(date: string, country?: string): Promise<TodayMatch[]> {
  const timezone = "America/Tegucigalpa";
  const data = await apiFootballFetch(`fixtures?date=${date}&timezone=${encodeURIComponent(timezone)}`, 15000);
  const response = Array.isArray(data.response) ? data.response : [];
  const normalized = response.filter((match: TodayMatch) => normalizeApiDate(match.fixture.date) === date);
  if (!country) return normalized;
  return normalized.filter((match: TodayMatch) => String(match.league.country || "").toLowerCase() === country.toLowerCase());
}

async function getTeamIdByName(teamName: string): Promise<number | null> {
  const data = await apiFootballFetch(`teams?search=${encodeURIComponent(teamName)}`, 12000);
  const response = Array.isArray(data.response) ? data.response : [];
  const id = response[0]?.team?.id;
  return typeof id === "number" ? id : null;
}

async function getRecentTeamRows(teamId: number, venue: "home" | "away", baseDate: string): Promise<Row[]> {
  const timezone = "America/Tegucigalpa";
  const data = await apiFootballFetch(
    `fixtures?team=${teamId}&last=20&timezone=${encodeURIComponent(timezone)}`,
    15000
  );
  const fixtures: ApiFixture[] = Array.isArray(data.response) ? data.response : [];

  const finishedStatuses = new Set(["FT", "AET", "PEN"]);

  let rows = fixtures
    .filter((fixture) => {
      const fixtureDate = fixture.fixture?.date ? normalizeApiDate(fixture.fixture.date) : "";
      const status = fixture.fixture?.status?.short || "";
      const finished = finishedStatuses.has(status);
      const rightVenue =
        venue === "home" ? fixture.teams.home.id === teamId : fixture.teams.away.id === teamId;
      return finished && rightVenue && fixtureDate <= baseDate;
    })
    .sort((a, b) => {
      const aDate = a.fixture?.date ? new Date(a.fixture.date).getTime() : 0;
      const bDate = b.fixture?.date ? new Date(b.fixture.date).getTime() : 0;
      return bDate - aDate;
    })
    .slice(0, 10)
    .map((fixture) => {
      const isHome = fixture.teams.home.id === teamId;
      const rival = isHome ? fixture.teams.away.name : fixture.teams.home.name;
      const gf = isHome ? fixture.goals.home ?? 0 : fixture.goals.away ?? 0;
      const gc = isHome ? fixture.goals.away ?? 0 : fixture.goals.home ?? 0;
      return {
        rival,
        gf,
        gc,
        cards: 0,
        corners: 0,
      } as Row;
    });

  if (rows.length < 5) {
    rows = fixtures
      .filter((fixture) => {
        const fixtureDate = fixture.fixture?.date ? normalizeApiDate(fixture.fixture.date) : "";
        const status = fixture.fixture?.status?.short || "";
        const finished = finishedStatuses.has(status);
        const involved = fixture.teams.home.id === teamId || fixture.teams.away.id === teamId;
        return finished && involved && fixtureDate <= baseDate;
      })
      .sort((a, b) => {
        const aDate = a.fixture?.date ? new Date(a.fixture.date).getTime() : 0;
        const bDate = b.fixture?.date ? new Date(b.fixture.date).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, 10)
      .map((fixture) => {
        const isHome = fixture.teams.home.id === teamId;
        const rival = isHome ? fixture.teams.away.name : fixture.teams.home.name;
        const gf = isHome ? fixture.goals.home ?? 0 : fixture.goals.away ?? 0;
        const gc = isHome ? fixture.goals.away ?? 0 : fixture.goals.home ?? 0;
        return {
          rival,
          gf,
          gc,
          cards: 0,
          corners: 0,
        } as Row;
      });
  }

  const padded = [...rows];
  while (padded.length < 10) padded.push({ rival: "", gf: "", gc: "", cards: "", corners: "" });
  return padded;
}

export default function Home() {
  const [matchInfo, setMatchInfo] = useState({
    home: "",
    away: "",
    league: "",
    country: "",
    date: "",
    referee: "",
    refereeCards: "",
    homePosition: "",
    awayPosition: "",
  });

  const [homeRows, setHomeRows] = useState<Row[]>(emptyRows());
  const [awayRows, setAwayRows] = useState<Row[]>(emptyRows());
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [bankroll, setBankroll] = useState("1000");
  const [stakeMethod, setStakeMethod] = useState<"fijo" | "confianza" | "kelly">("confianza");
  const [stakeOdds, setStakeOdds] = useState("1.80");
  const [searchTeam, setSearchTeam] = useState("");
  const [searchLeague, setSearchLeague] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [countries, setCountries] = useState<CountryOption[]>(FALLBACK_COUNTRIES);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("England");
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [todayMatches, setTodayMatches] = useState<TodayMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState("");
  const [selectedMatch, setSelectedMatch] = useState<TodayMatch | null>(null);
  const [autoStatsLoading, setAutoStatsLoading] = useState(false);
  const [autoStatsError, setAutoStatsError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const selected = localStorage.getItem(SELECTED_KEY);
      const savedBankroll = localStorage.getItem(BANKROLL_KEY);
      if (saved) setSavedAnalyses(JSON.parse(saved));
      if (selected) setSelectedIds(JSON.parse(selected));
      if (savedBankroll) {
        const parsed = JSON.parse(savedBankroll);
        setBankroll(parsed.bankroll ?? "1000");
        setStakeMethod(parsed.stakeMethod ?? "confianza");
        setStakeOdds(parsed.stakeOdds ?? "1.80");
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
    localStorage.setItem(BANKROLL_KEY, JSON.stringify({ bankroll, stakeMethod, stakeOdds }));
  }, [bankroll, stakeMethod, stakeOdds]);

  useEffect(() => {
    let active = true;
    async function loadCountries() {
      try {
        setCountriesLoading(true);
        const list = await getAvailableCountries();
        if (!active) return;
        setCountries(list.length ? list : FALLBACK_COUNTRIES);
      } catch {
        if (!active) return;
        setCountries(FALLBACK_COUNTRIES);
      } finally {
        if (active) setCountriesLoading(false);
      }
    }
    loadCountries();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadMatches() {
      try {
        setMatchesLoading(true);
        setMatchesError("");
        const matches = await getMatchesByDateAndCountry(selectedDate, selectedCountry);
        if (!active) return;
        setTodayMatches(matches);
        setSelectedMatch(null);
      } catch (error) {
        if (!active) return;
        setMatchesError(error instanceof Error ? error.message : "No se pudieron cargar los partidos");
      } finally {
        if (active) setMatchesLoading(false);
      }
    }
    loadMatches();
    return () => {
      active = false;
    };
  }, [selectedCountry, selectedDate]);

  const home = useMemo(() => getMetrics(homeRows), [homeRows]);
  const away = useMemo(() => getMetrics(awayRows), [awayRows]);

  const analysis = useMemo<AnalysisResult>(() => {
    const refereeCards = Number(matchInfo.refereeCards || 0);
    const homePos = Number(matchInfo.homePosition || 0);
    const awayPos = Number(matchInfo.awayPosition || 0);
    const posFactor = homePos > 0 && awayPos > 0 ? clamp((awayPos - homePos) * 1.5, -12, 12) : 0;

    const expectedHomeGoals = clamp((home.weightedGF + away.weightedGC) / 2 + Math.max(posFactor, 0) * 0.03, 0.2, 3.8);
    const expectedAwayGoals = clamp((away.weightedGF + home.weightedGC) / 2 + Math.max(-posFactor, 0) * 0.03, 0.2, 3.8);
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
        scoreMatrix.push({ score: `${homeGoals}-${awayGoals}`, probability: probability * 100 });
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

    const localWinForm = (home.wins + away.losses) / 2 + Math.max(posFactor, 0) * 0.8;
    const awayWinForm = (away.wins + home.losses) / 2 + Math.max(-posFactor, 0) * 0.8;
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

    const estimatedCards = refereeCards ? (home.weightedCards + away.weightedCards + refereeCards) / 3 : (home.weightedCards + away.weightedCards) / 2;
    const estimatedCorners = home.weightedCorners + away.weightedCorners;
    const cards35 = Math.min(55 + estimatedCards * 6, 95);
    const cards45 = Math.min(44 + estimatedCards * 5.6, 93);
    const corners85 = Math.min(40 + estimatedCorners * 4, 94);
    const corners95 = Math.min(30 + estimatedCorners * 4.1, 91);

    const topScores = scoreMatrix.sort((a, b) => b.probability - a.probability).slice(0, 4);
    const scoreNames = topScores.map((s) => s.score);
    const reasonList: string[] = [];
    const alternativeMarkets: string[] = [];

    const zeroZeroRisk: "alto" | "medio" | "bajo" =
      zeroZeroProbability >= 13 || (scoreNames.includes("0-0") && topScores[0]?.score === "0-0") ? "alto" : zeroZeroProbability >= 8 || scoreNames.includes("0-0") ? "medio" : "bajo";

    const lowTempo = totalExpectedGoals < 2.1;
    if (lowTempo) reasonList.push("Goles esperados totales bajos");
    if (zeroZeroRisk !== "bajo") reasonList.push("Riesgo relevante de 0-0");
    if (over15 < 75) reasonList.push("Over 1.5 por debajo del filtro seguro");
    if (btts < 58) reasonList.push("BTTS bajo");
    if (drawNorm >= 28) reasonList.push("Empate relativamente alto");
    if (scoreNames.includes("1-0") || scoreNames.includes("0-1")) reasonList.push("Marcadores cortos entre los más probables");

    const avoidGoals = over15 < 75 || btts < 58 || totalExpectedGoals < 2.1 || zeroZeroRisk === "alto" || topScores.slice(0, 2).some((s) => s.score === "0-0") || drawNorm >= 30;
    const trapMatch = avoidGoals && (zeroZeroRisk !== "bajo" || totalExpectedGoals < 2.0 || (oneZeroProbability + zeroOneProbability) >= 20);

    if (avoidGoals) {
      if (under35 >= 72) alternativeMarkets.push("Menos de 3.5 goles");
      if (cards35 >= 70) alternativeMarkets.push("Más de 3.5 tarjetas");
      if (corners85 >= 70) alternativeMarkets.push("Más de 8.5 corners");
      if (homeOrDraw >= 75) alternativeMarkets.push("Local o empate (1X)");
      if (awayOrDraw >= 75) alternativeMarkets.push("Visitante o empate (X2)");
      if (noDraw >= 78) alternativeMarkets.push("No empate (1 o 2)");
    }

    let picks: Pick[] = [
      { market: "Más de 1.5 goles", probability: over15 },
      { market: "Más de 2.5 goles", probability: over25 },
      { market: "Más de 3.5 goles", probability: over35, tier: "arriesgada" },
      { market: "Menos de 3.5 goles", probability: under35 },
      { market: "Ambos marcan", probability: btts },
      { market: "Gana local", probability: localWinNorm, tier: "arriesgada" },
      { market: "Empate", probability: drawNorm, tier: "arriesgada" },
      { market: "Gana visitante", probability: awayWinNorm, tier: "arriesgada" },
      { market: "Local o empate (1X)", probability: homeOrDraw },
      { market: "Visitante o empate (X2)", probability: awayOrDraw },
      { market: "No empate (1 o 2)", probability: noDraw, tier: "valor" },
      { market: "Más de 3.5 tarjetas", probability: cards35 },
      { market: "Más de 4.5 tarjetas", probability: cards45, tier: "valor" },
      { market: "Más de 8.5 corners", probability: corners85 },
      { market: "Más de 9.5 corners", probability: corners95, tier: "valor" },
    ];

    if (avoidGoals) {
      const blocked = new Set(["Más de 1.5 goles", "Más de 2.5 goles", "Más de 3.5 goles", "Ambos marcan"]);
      picks = picks.map((pick) => blocked.has(pick.market) ? { ...pick, probability: Math.max(0, pick.probability - 18) } : pick).sort((a, b) => b.probability - a.probability);
    } else {
      picks = picks.sort((a, b) => b.probability - a.probability);
    }

    const safestPick = picks.find((p) => !["Más de 3.5 goles", "Empate", "Gana local", "Gana visitante"].includes(p.market) && p.probability >= 80) ?? picks[0] ?? null;
    const valuePick = picks.find((p) => p.tier === "valor" && p.probability >= 68) ?? picks.find((p) => p.probability >= 68 && p.probability < 82) ?? null;
    const riskyPick = picks.find((p) => p.tier === "arriesgada" && p.probability >= 55) ?? picks.find((p) => p.probability >= 55 && p.probability < 75) ?? null;

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
      cards35,
      cards45,
      corners85,
      corners95,
      expectedHomeGoals,
      expectedAwayGoals,
      totalExpectedGoals,
      topScores,
      zeroZeroProbability,
      oneZeroProbability,
      zeroOneProbability,
      picks,
      safestPick,
      valuePick,
      riskyPick,
      riskFlags: { zeroZeroRisk, avoidGoals, trapMatch, lowTempo, reasonList, alternativeMarkets },
    };
  }, [home, away, matchInfo.refereeCards, matchInfo.homePosition, matchInfo.awayPosition]);

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
    if (stakeMethod === "kelly") percent = clamp(kellyFraction(probability, odds) * 100 * 0.5, 0, 8);
    const amount = bank * (percent / 100);
    return { basePick, probability, percent, amount };
  }, [bankroll, stakeMethod, stakeOdds, analysis]);

  const filteredAnalyses = useMemo(() => {
    return savedAnalyses.filter((item) => {
      const teamMatch = searchTeam === "" || item.matchInfo.home.toLowerCase().includes(searchTeam.toLowerCase()) || item.matchInfo.away.toLowerCase().includes(searchTeam.toLowerCase());
      const leagueMatch = searchLeague === "" || item.matchInfo.league.toLowerCase().includes(searchLeague.toLowerCase());
      return teamMatch && leagueMatch;
    });
  }, [savedAnalyses, searchTeam, searchLeague]);

  const selectedAnalyses = useMemo(() => savedAnalyses.filter((item) => selectedIds.includes(item.id)), [savedAnalyses, selectedIds]);

  const generatedParlays = useMemo(() => {
    const blockedGoalMarkets = new Set(["Más de 1.5 goles", "Más de 2.5 goles", "Más de 3.5 goles", "Ambos marcan"]);
    const build = (mode: "conservadora" | "media" | "agresiva") => {
      const legs = selectedAnalyses.map((item) => {
        let filtered = item.analysis.picks.filter((pick) => {
          if (mode === "conservadora") return pick.probability >= 75;
          if (mode === "media") return pick.probability >= 68;
          return pick.probability >= 60;
        });
        if (mode === "conservadora") filtered = filtered.filter((pick) => !["Más de 3.5 goles", "Gana local", "Gana visitante", "Empate"].includes(pick.market));
        if (item.analysis.riskFlags.avoidGoals) filtered = filtered.filter((pick) => !blockedGoalMarkets.has(pick.market));
        const best = filtered[0] ?? item.analysis.picks.find((p) => !blockedGoalMarkets.has(p.market)) ?? item.analysis.picks[0];
        return {
          id: item.id,
          match: `${item.matchInfo.home || "Local"} vs ${item.matchInfo.away || "Visitante"}`,
          market: best.market,
          probability: best.probability,
        };
      });
      const avgProbability = legs.length ? legs.reduce((sum, leg) => sum + leg.probability, 0) / legs.length : 0;
      return { mode, legs, avgProbability, confidence: confidenceLabel(avgProbability) };
    };
    return { conservadora: build("conservadora"), media: build("media"), agresiva: build("agresiva") };
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
    return { total: savedAnalyses.length, settled: settled.length, wins: wins.length, losses: losses.length, hitRate: settled.length > 0 ? (wins.length / settled.length) * 100 : 0, totalStake, profit, roi };
  }, [savedAnalyses]);

  const updateRow = (setter: React.Dispatch<React.SetStateAction<Row[]>>, index: number, field: keyof Row, value: string) => {
    setter((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: field === "rival" ? value : value === "" ? "" : Number(value) };
      return copy;
    });
  };

  const resetForm = () => {
    setMatchInfo({ home: "", away: "", league: "", country: "", date: "", referee: "", refereeCards: "", homePosition: "", awayPosition: "" });
    setHomeRows(emptyRows());
    setAwayRows(emptyRows());
    setEditingId(null);
  };

  const saveAnalysis = () => {
    if (!matchInfo.home && !matchInfo.away) return;
    const topPicks = analysis.picks.slice(0, 3);
    if (editingId) {
      setSavedAnalyses((prev) => prev.map((item) => item.id === editingId ? { ...item, matchInfo: { ...matchInfo }, homeRows: [...homeRows], awayRows: [...awayRows], analysis: { ...analysis }, topPicks } : item));
      setEditingId(null);
      return;
    }
    const saved: SavedAnalysis = { id: Date.now(), matchInfo: { ...matchInfo }, homeRows: [...homeRows], awayRows: [...awayRows], analysis: { ...analysis }, topPicks, stake: "", odds: "", result: "pendiente" };
    setSavedAnalyses((prev) => [saved, ...prev]);
  };

  const toggleSelection = (id: number) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
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

  const updateSavedField = (id: number, field: "stake" | "odds", value: string) => setSavedAnalyses((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
  const updateSavedResult = (id: number, result: ResultStatus) => setSavedAnalyses((prev) => prev.map((item) => item.id === id ? { ...item, result } : item));

  const exportAnalyses = () => {
    const payload = { exportedAt: new Date().toISOString(), bankroll, stakeMethod, stakeOdds, savedAnalyses };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analizador-apuestas-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
        if (typeof parsed.bankroll === "string") setBankroll(parsed.bankroll);
        if (parsed.stakeMethod === "fijo" || parsed.stakeMethod === "confianza" || parsed.stakeMethod === "kelly") setStakeMethod(parsed.stakeMethod);
        if (typeof parsed.stakeOdds === "string") setStakeOdds(parsed.stakeOdds);
        setSelectedIds([]);
        setEditingId(null);
      } catch {
        alert("El archivo no es válido para importar.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-slate-900 p-6 shadow-lg">
          <input ref={fileInputRef} type="file" accept="application/json" onChange={importAnalyses} className="hidden" />
          <h1 className="text-3xl font-bold text-white">Analizador Manual de Apuestas</h1>
          <p className="mt-2 text-slate-200">Registra un partido, llena 5 o 10 juegos por equipo, guarda tus análisis y genera 3 tipos de parlay automática.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={exportAnalyses} className="rounded-2xl bg-white/10 px-4 py-2 font-bold text-white hover:bg-white/20">Exportar análisis</button>
            <button onClick={() => fileInputRef.current?.click()} className="rounded-2xl bg-white/10 px-4 py-2 font-bold text-white hover:bg-white/20">Importar análisis</button>
          </div>
        </div>

        <section className="rounded-3xl border border-purple-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold text-purple-700">Gestión de bankroll</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Bankroll actual" value={bankroll} onChange={setBankroll} cls="border-purple-300 text-slate-900 focus:border-purple-500" />
            <div>
              <label className="mb-2 block text-sm font-bold text-purple-700">Método de stake</label>
              <select value={stakeMethod} onChange={(e) => setStakeMethod(e.target.value as "fijo" | "confianza" | "kelly")} className="w-full rounded-xl border-2 border-purple-300 px-3 py-2 text-slate-900 font-medium outline-none focus:border-purple-500">
                <option value="fijo">Fijo</option>
                <option value="confianza">Por confianza</option>
                <option value="kelly">Kelly 50%</option>
              </select>
            </div>
            <Field label="Cuota para stake" value={stakeOdds} onChange={setStakeOdds} cls="border-purple-300 text-slate-900 focus:border-purple-500" />
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
              <p className="text-sm font-bold text-purple-700">Stake sugerido</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{dec(bankrollAnalysis.amount)}</p>
              <p className="text-sm text-slate-700 mt-1">{dec(bankrollAnalysis.percent)}% del bank</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
              <p className="text-sm font-bold text-purple-700">Pick seleccionado para cálculo de stake</p>
              <p className="text-base font-bold text-slate-900 mt-1">{bankrollAnalysis.basePick?.market ?? "Sin pick"}</p>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
              <p className="text-sm font-bold text-purple-700">Probabilidad del pick seleccionado</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{pct(bankrollAnalysis.probability)}</p>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
              <p className="text-sm font-bold text-purple-700">Método actual</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stakeMethod}</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-blue-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-blue-700">Datos del partido</h2>
            {editingId && <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">Editando análisis guardado</span>}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Equipo local" value={matchInfo.home} onChange={(v) => setMatchInfo((p) => ({ ...p, home: v }))} cls="border-blue-300 text-blue-700 focus:border-blue-500" />
            <Field label="Equipo visitante" value={matchInfo.away} onChange={(v) => setMatchInfo((p) => ({ ...p, away: v }))} cls="border-red-300 text-red-700 focus:border-red-500" />
            <Field label="Puesto local" value={matchInfo.homePosition} onChange={(v) => setMatchInfo((p) => ({ ...p, homePosition: v }))} cls="border-blue-300 text-slate-900 focus:border-blue-500" />
            <Field label="Puesto visitante" value={matchInfo.awayPosition} onChange={(v) => setMatchInfo((p) => ({ ...p, awayPosition: v }))} cls="border-red-300 text-slate-900 focus:border-red-500" />
            <Field label="Liga" value={matchInfo.league} onChange={(v) => setMatchInfo((p) => ({ ...p, league: v }))} cls="border-sky-200 text-slate-900 focus:border-sky-500" />
            <Field label="País" value={matchInfo.country} onChange={(v) => setMatchInfo((p) => ({ ...p, country: v }))} cls="border-sky-200 text-slate-900 focus:border-sky-500" />
            <Field label="Fecha" value={matchInfo.date} onChange={(v) => setMatchInfo((p) => ({ ...p, date: v }))} cls="border-sky-200 text-slate-900 focus:border-sky-500" />
            <Field label="Árbitro" value={matchInfo.referee} onChange={(v) => setMatchInfo((p) => ({ ...p, referee: v }))} cls="border-sky-200 text-slate-900 focus:border-sky-500" />
            <Field label="Promedio tarjetas árbitro" value={matchInfo.refereeCards} onChange={(v) => setMatchInfo((p) => ({ ...p, refereeCards: v }))} cls="border-sky-200 text-slate-900 focus:border-sky-500" />
          </div>
        </section>

        <TeamSection title="Últimos partidos del local" titleColor="text-blue-700" boxColor="border-blue-200" headerBg="bg-blue-100" inputClass="border-blue-300 text-slate-900 font-medium focus:border-blue-500" rows={homeRows} onChange={updateRow.bind(null, setHomeRows)} metrics={home} />
        <TeamSection title="Últimos partidos del visitante" titleColor="text-red-700" boxColor="border-red-200" headerBg="bg-red-100" inputClass="border-red-300 text-slate-900 font-medium focus:border-red-500" rows={awayRows} onChange={updateRow.bind(null, setAwayRows)} metrics={away} />

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm xl:col-span-2">
            <h2 className="mb-4 text-2xl font-bold text-emerald-700">Resultado del análisis</h2>
            <section className="rounded-3xl border border-red-200 bg-red-50 p-4 mb-6">
              <h3 className="text-lg font-bold text-red-700 mb-3">Protección anti partidos trampa</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <RiskInfoBox label="Riesgo de 0-0" value={analysis.riskFlags.zeroZeroRisk.toUpperCase()} level={analysis.riskFlags.zeroZeroRisk} />
                <RiskInfoBox label="Probabilidad 0-0" value={pct(analysis.zeroZeroProbability)} level={analysis.riskFlags.zeroZeroRisk} />
                <RiskInfoBox label="Goles esperados totales" value={dec(analysis.totalExpectedGoals)} level={analysis.totalExpectedGoals < 2.1 ? "alto" : analysis.totalExpectedGoals < 2.35 ? "medio" : "bajo"} />
                <RiskInfoBox label="Estado over 1.5" value={analysis.riskFlags.avoidGoals ? "EVITAR" : "APTO"} level={analysis.riskFlags.avoidGoals ? "alto" : "bajo"} />
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className={`rounded-2xl border p-4 ${analysis.riskFlags.trapMatch ? "border-red-300 bg-red-100" : "border-green-300 bg-green-100"}`}>
                  <p className={`text-base font-bold ${analysis.riskFlags.trapMatch ? "text-red-800" : "text-green-800"}`}>{analysis.riskFlags.trapMatch ? "Partido trampa para goles" : "Partido sin alerta fuerte"}</p>
                  <div className="mt-2 space-y-1">
                    {analysis.riskFlags.reasonList.length > 0 ? analysis.riskFlags.reasonList.map((reason) => <div key={reason} className="text-sm text-slate-700">• {reason}</div>) : <div className="text-sm text-slate-700">No hay alertas fuertes activas.</div>}
                  </div>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-100 p-4">
                  <p className="text-base font-bold text-sky-800">Mercados alternativos</p>
                  <div className="mt-2 space-y-1">
                    {analysis.riskFlags.alternativeMarkets.length > 0 ? analysis.riskFlags.alternativeMarkets.map((market) => <div key={market} className="text-sm text-slate-700">• {market}</div>) : <div className="text-sm text-slate-700">Partido apto para mercados de goles</div>}
                  </div>
                </div>
              </div>
            </section>
            <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <InfoBox label="Goles esperados local" value={dec(analysis.expectedHomeGoals)} color="blue" />
              <InfoBox label="Goles esperados visitante" value={dec(analysis.expectedAwayGoals)} color="red" />
              <InfoBox label="Doble oportunidad local (1X)" value={pct(analysis.homeOrDraw)} color="green" />
              <InfoBox label="Doble oportunidad visitante (X2)" value={pct(analysis.awayOrDraw)} color="amber" />
              <InfoBox label="No empate (1 o 2)" value={pct(analysis.noDraw)} color="amber" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[["Over 1.5", analysis.over15],["Over 2.5", analysis.over25],["Over 3.5", analysis.over35],["Menos de 3.5", analysis.under35],["Ambos marcan", analysis.btts],["Gana local", analysis.localWin],["Empate", analysis.draw],["Gana visitante", analysis.awayWin],["Local o empate (1X)", analysis.homeOrDraw],["Visitante o empate (X2)", analysis.awayOrDraw],["No empate (1 o 2)", analysis.noDraw],["Más de 3.5 tarjetas", analysis.cards35],["Más de 4.5 tarjetas", analysis.cards45],["Más de 8.5 corners", analysis.corners85],["Más de 9.5 corners", analysis.corners95]].map(([label, value]) => <div key={String(label)} className={`flex items-center justify-between rounded-2xl border p-4 ${analysisCardClass(Number(value))}`}><div><p className="font-bold text-slate-800">{label}</p><p className="text-sm text-slate-600">Confianza {confidenceLabel(Number(value))}</p></div><span className={`rounded-full px-3 py-1 text-sm font-bold ${badgeClass(Number(value))}`}>{pct(Number(value))}</span></div>)}
            </div>
            <div className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
              <p className="font-bold text-cyan-800">Marcadores más probables por Poisson</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">{analysis.topScores.map((item) => <div key={item.score} className="rounded-xl bg-white p-3 border border-cyan-200"><p className="text-lg font-bold text-slate-900">{item.score}</p><p className="text-sm text-slate-600">{pct(item.probability)}</p></div>)}</div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={saveAnalysis} className="rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700">{editingId ? "Actualizar análisis" : "Guardar análisis"}</button>
              <button onClick={resetForm} className="rounded-2xl bg-slate-200 px-5 py-3 font-bold text-slate-800 transition hover:bg-slate-300">Nuevo partido</button>
            </div>
          </div>
          <div className="space-y-6">
            <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-2xl font-bold text-violet-700">Top picks</h2>
              <div className="space-y-3">{analysis.picks.slice(0, 5).map((pick, index) => <div key={pick.market} className={`rounded-2xl border p-4 ${analysisCardClass(pick.probability)}`}><p className="font-bold text-slate-900">#{index + 1} {pick.market}</p><p className="mt-1 text-sm text-slate-600">{pct(pick.probability)} · Confianza {confidenceLabel(pick.probability)}</p></div>)}</div>
            </section>
            <section className="rounded-3xl border border-orange-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-2xl font-bold text-orange-700">Recomendación final</h2>
              <div className="space-y-3">
                <RecommendationCard title="Apuesta más segura" pick={analysis.safestPick} color="green" />
                <RecommendationCard title="Apuesta con mejor valor" pick={analysis.valuePick} color="amber" />
                <RecommendationCard title="Apuesta arriesgada" pick={analysis.riskyPick} color="rose" />
              </div>
            </section>
          </div>
        </section>

        <section className="rounded-3xl border border-teal-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold text-teal-700">Simulador Monte Carlo</h2>
          <p className="text-slate-600 mb-4">El partido se simula 10,000 veces usando los goles esperados del modelo.</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 mb-4">
            <InfoBox label="Simulaciones" value={String(monteCarlo.simulations)} color="green" />
            <InfoBox label="Local gana" value={pct(monteCarlo.homeWin)} color="blue" />
            <InfoBox label="Empate" value={pct(monteCarlo.draw)} color="amber" />
            <InfoBox label="Visitante gana" value={pct(monteCarlo.awayWin)} color="red" />
            <InfoBox label="BTTS simulado" value={pct(monteCarlo.btts)} color="green" />
          </div>
          <div className="grid gap-3 md:grid-cols-4">{monteCarlo.topScores.map((item) => <div key={item.score} className="rounded-2xl border border-teal-200 bg-teal-50 p-4"><p className="text-sm font-bold text-teal-700">Marcador simulado</p><p className="text-2xl font-bold text-slate-900 mt-1">{item.score}</p><p className="text-sm text-slate-600 mt-1">{pct(item.probability)}</p></div>)}</div>
        </section>

        <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold text-emerald-700">Detector de apuestas de valor (Value Bets)</h2>
          <p className="text-slate-600 mb-4">Introduce la cuota de la casa de apuestas y compárala con la probabilidad del modelo.</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ValueRow label="Over 2.5" modelProb={analysis.over25} />
            <ValueRow label="Ambos marcan" modelProb={analysis.btts} />
            <ValueRow label="Local o empate (1X)" modelProb={analysis.homeOrDraw} />
            <ValueRow label="Visitante o empate (X2)" modelProb={analysis.awayOrDraw} />
            <ValueRow label="Más de 8.5 corners" modelProb={analysis.corners85} />
            <ValueRow label="Más de 3.5 tarjetas" modelProb={analysis.cards35} />
          </div>
        </section>

        <section className="rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold text-indigo-700">Dashboard de rendimiento</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6 mb-4">
            <InfoBox label="Análisis guardados" value={String(performance.total)} color="blue" />
            <InfoBox label="Apuestas cerradas" value={String(performance.settled)} color="amber" />
            <InfoBox label="Ganadas" value={String(performance.wins)} color="green" />
            <InfoBox label="Perdidas" value={String(performance.losses)} color="red" />
            <InfoBox label="Hit Rate" value={pct(performance.hitRate)} color="green" />
            <InfoBox label="ROI" value={`${dec(performance.roi)}%`} color={performance.roi >= 0 ? "green" : "red"} />
          </div>
          <div className="grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-bold text-slate-700">Stake total</p><p className="text-2xl font-bold text-slate-900 mt-1">{dec(performance.totalStake)}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-bold text-slate-700">Beneficio total</p><p className={`text-2xl font-bold mt-1 ${performance.profit >= 0 ? "text-green-700" : "text-red-700"}`}>{dec(performance.profit)}</p></div></div>
        </section>

        <section className="rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-indigo-700">Historial de análisis guardados</h2>
            {savedAnalyses.length > 0 && <button onClick={() => { setSavedAnalyses([]); setSelectedIds([]); setEditingId(null); }} className="rounded-2xl bg-red-100 px-4 py-2 font-bold text-red-700 hover:bg-red-200">Borrar todo</button>}
          </div>
          <div className="grid md:grid-cols-2 gap-3 mb-4">
            <input placeholder="Buscar por equipo" value={searchTeam} onChange={(e) => setSearchTeam(e.target.value)} className="rounded-xl border-2 border-slate-300 px-3 py-2" />
            <input placeholder="Filtrar por liga" value={searchLeague} onChange={(e) => setSearchLeague(e.target.value)} className="rounded-xl border-2 border-slate-300 px-3 py-2" />
          </div>
          {filteredAnalyses.length === 0 ? <p className="text-slate-600">Aún no has guardado análisis.</p> : <div className="space-y-3">{filteredAnalyses.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="text-lg font-bold text-slate-900"><span className="text-blue-700">{item.matchInfo.home || "Local"}</span>{" vs "}<span className="text-red-700">{item.matchInfo.away || "Visitante"}</span></p><p className="text-sm text-slate-600">{item.matchInfo.league || "Liga"} · {item.matchInfo.country || "País"} · {item.matchInfo.date || "Sin fecha"}</p><p className="text-sm text-slate-500">Puestos: {item.matchInfo.homePosition || "-"} vs {item.matchInfo.awayPosition || "-"}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => toggleSelection(item.id)} className={`rounded-2xl px-4 py-2 font-bold transition ${selectedIds.includes(item.id) ? "bg-green-600 text-white hover:bg-green-700" : "bg-slate-200 text-slate-800 hover:bg-slate-300"}`}>{selectedIds.includes(item.id) ? "Seleccionado" : "Seleccionar"}</button><button onClick={() => editAnalysis(item)} className="rounded-2xl bg-blue-100 px-4 py-2 font-bold text-blue-700 hover:bg-blue-200">Editar</button><button onClick={() => deleteAnalysis(item.id)} className="rounded-2xl bg-red-100 px-4 py-2 font-bold text-red-700 hover:bg-red-200">Eliminar</button></div></div><div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">{item.topPicks.map((pick, index) => <div key={index} className={`rounded-xl border p-3 ${analysisCardClass(pick.probability)}`}><p className="font-semibold text-slate-800">{pick.market}</p><p className="text-sm text-slate-600">{pct(pick.probability)}</p></div>)}<div className="rounded-xl border border-slate-200 p-3"><p className="text-sm font-semibold text-slate-700">Stake</p><input value={item.stake} onChange={(e) => updateSavedField(item.id, "stake", e.target.value)} className="mt-1 w-full rounded-lg border-2 border-slate-300 px-2 py-1 text-slate-900" placeholder="0" /></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-sm font-semibold text-slate-700">Cuota</p><input value={item.odds} onChange={(e) => updateSavedField(item.id, "odds", e.target.value)} className="mt-1 w-full rounded-lg border-2 border-slate-300 px-2 py-1 text-slate-900" placeholder="0" /></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-sm font-semibold text-slate-700">Resultado</p><select value={item.result} onChange={(e) => updateSavedResult(item.id, e.target.value as ResultStatus)} className="mt-1 w-full rounded-lg border-2 border-slate-300 px-2 py-1 text-slate-900"><option value="pendiente">Pendiente</option><option value="ganada">Ganada</option><option value="perdida">Perdida</option></select></div></div></div>)}</div>}
        </section>

        <section className="rounded-3xl border border-fuchsia-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold text-fuchsia-700">Generador de parlay automática</h2>
          {selectedAnalyses.length === 0 ? <p className="text-slate-600">Selecciona uno o más análisis guardados para generar parlays.</p> : <div className="space-y-6"><ParlayBlock title="Conservadora" color="fuchsia" data={generatedParlays.conservadora} /><ParlayBlock title="Media" color="sky" data={generatedParlays.media} /><ParlayBlock title="Agresiva" color="rose" data={generatedParlays.agresiva} /></div>}
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, cls }: { label: string; value: string; onChange: (v: string) => void; cls: string }) {
  return <div><label className="mb-2 block text-sm font-bold text-slate-700">{label}</label><input value={value} onChange={(e) => onChange(e.target.value)} className={`w-full rounded-xl border-2 px-3 py-2 font-medium outline-none ${cls}`} /></div>;
}

function InfoBox({ label, value, color }: { label: string; value: string; color: "blue" | "red" | "green" | "amber" }) {
  const styles = { blue: "bg-blue-50 border-blue-200 text-blue-700", red: "bg-red-50 border-red-200 text-red-700", green: "bg-green-50 border-green-200 text-green-700", amber: "bg-amber-50 border-amber-200 text-amber-700" } as const;
  return <div className={`rounded-2xl border p-4 ${styles[color]}`}><p className="text-sm font-bold">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>;
}

function RiskInfoBox({ label, value, level }: { label: string; value: string; level: "alto" | "medio" | "bajo" }) {
  return <div className={`rounded-2xl border p-4 ${riskBadgeClass(level)}`}><p className="text-sm font-bold">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>;
}

function RecommendationCard({ title, pick, color }: { title: string; pick: Pick | null; color: "green" | "amber" | "rose" }) {
  const styles = { green: "border-green-200 bg-green-50 text-green-700", amber: "border-amber-200 bg-amber-50 text-amber-700", rose: "border-rose-200 bg-rose-50 text-rose-700" } as const;
  return <div className={`rounded-2xl border p-4 ${styles[color]}`}><p className="text-sm font-bold">{title}</p>{pick ? <><p className="mt-2 text-base font-bold text-slate-900">{pick.market}</p><p className="text-sm text-slate-700">{pct(pick.probability)} · Confianza {confidenceLabel(pick.probability)}</p></> : <p className="mt-2 text-sm text-slate-700">Todavía no hay una sugerencia clara.</p>}</div>;
}

function ValueRow({ label, modelProb }: { label: string; modelProb: number }) {
  const [odds, setOdds] = useState("");
  const oddsNumber = Number(odds || 0);
  const implied = oddsNumber > 0 ? (1 / oddsNumber) * 100 : 0;
  const edge = modelProb - implied;
  let status = "Sin cuota";
  let statusClass = "bg-slate-100 text-slate-700 border-slate-300";
  if (oddsNumber > 0 && edge > 5) { status = "Valor alto"; statusClass = "bg-green-100 text-green-800 border-green-300"; }
  else if (oddsNumber > 0 && edge > 0) { status = "Valor leve"; statusClass = "bg-emerald-100 text-emerald-800 border-emerald-300"; }
  else if (oddsNumber > 0) { status = "Sin valor"; statusClass = "bg-rose-100 text-rose-800 border-rose-300"; }
  return <div className="rounded-2xl border border-slate-200 p-4"><p className="font-bold text-slate-900">{label}</p><p className="text-sm text-slate-600 mt-1">Probabilidad modelo: {pct(modelProb)}</p><input type="number" step="0.01" value={odds} onChange={(e) => setOdds(e.target.value)} placeholder="Ingresa cuota" className="mt-3 w-full rounded-xl border-2 border-slate-300 px-3 py-2 font-medium text-slate-900 outline-none focus:border-slate-500" /><div className="mt-3 space-y-1 text-sm"><p className="text-slate-700">Prob. implícita: <span className="font-bold">{oddsNumber > 0 ? pct(implied) : "-"}</span></p><p className="text-slate-700">Edge: <span className="font-bold">{oddsNumber > 0 ? `${dec(edge)}%` : "-"}</span></p></div><span className={`mt-3 inline-block rounded-full border px-3 py-1 text-sm font-bold ${statusClass}`}>{status}</span></div>;
}

function ParlayBlock({ title, color, data }: { title: string; color: "fuchsia" | "sky" | "rose"; data: { legs: { id: number; match: string; market: string; probability: number }[]; avgProbability: number; confidence: string } }) {
  const styles = { fuchsia: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700", sky: "bg-sky-50 border-sky-200 text-sky-700", rose: "bg-rose-50 border-rose-200 text-rose-700" } as const;
  return <div className={`rounded-3xl border p-4 ${styles[color]}`}><div className="grid gap-3 md:grid-cols-3 mb-4"><div className="rounded-2xl bg-white/80 p-4 border border-white"><p className="text-sm font-bold">Tipo</p><div className="mt-2 flex items-center gap-3"><span className={`inline-block h-5 w-5 rounded-full ${trafficLightClass(data.avgProbability)}`} /><p className="text-2xl font-bold text-slate-900">{title}</p></div></div><div className="rounded-2xl bg-white/80 p-4 border border-white"><p className="text-sm font-bold">Probabilidad promedio</p><p className="text-2xl font-bold text-slate-900">{pct(data.avgProbability)}</p></div><div className="rounded-2xl bg-white/80 p-4 border border-white"><p className="text-sm font-bold">Confianza</p><p className="text-2xl font-bold text-slate-900">{data.confidence}</p></div></div><div className="space-y-3">{data.legs.map((leg) => <div key={`${title}-${leg.id}`} className="rounded-2xl border border-white bg-white/80 p-4 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className={`inline-block h-4 w-4 rounded-full ${trafficLightClass(leg.probability)}`} /><div><p className="font-bold text-slate-900">{leg.match}</p><p className="text-sm text-slate-600">{leg.market}</p></div></div><span className={`rounded-full px-3 py-1 text-sm font-bold ${badgeClass(leg.probability)}`}>{pct(leg.probability)}</span></div>)}</div></div>;
}

function TeamSection({ title, rows, onChange, metrics, titleColor, boxColor, headerBg, inputClass }: { title: string; rows: Row[]; onChange: (index: number, field: keyof Row, value: string) => void; metrics: ReturnType<typeof getMetrics>; titleColor: string; boxColor: string; headerBg: string; inputClass: string; }) {
  return <section className={`rounded-3xl border bg-white p-5 shadow-sm ${boxColor}`}><h2 className={`mb-4 text-2xl font-bold ${titleColor}`}>{title}</h2><div className="overflow-x-auto"><div className="min-w-[980px] space-y-2"><div className={`grid grid-cols-11 gap-2 rounded-2xl px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 ${headerBg}`}><div>#</div><div>Rival</div><div>GF</div><div>GC</div><div>Total</div><div>O1.5</div><div>O2.5</div><div>O3.5</div><div>BTTS</div><div>Tarj.</div><div>Corn.</div></div>{rows.map((row, index) => { const total = toNumber(row.gf) + toNumber(row.gc); const o15 = total >= 2 ? 1 : 0; const o25 = total >= 3 ? 1 : 0; const o35 = total >= 4 ? 1 : 0; const btts = toNumber(row.gf) > 0 && toNumber(row.gc) > 0 ? 1 : 0; return <div key={index} className="grid grid-cols-11 items-center gap-2"><div className="px-2 text-sm font-bold text-slate-700">{index + 1}</div><input className={`rounded-xl border-2 px-3 py-2 outline-none ${inputClass}`} value={row.rival} onChange={(e) => onChange(index, "rival", e.target.value)} /><input type="number" className={`rounded-xl border-2 px-3 py-2 outline-none ${inputClass}`} value={row.gf} onChange={(e) => onChange(index, "gf", e.target.value)} /><input type="number" className={`rounded-xl border-2 px-3 py-2 outline-none ${inputClass}`} value={row.gc} onChange={(e) => onChange(index, "gc", e.target.value)} /><div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">{total}</div><div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">{o15}</div><div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">{o25}</div><div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">{o35}</div><div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">{btts}</div><input type="number" className={`rounded-xl border-2 px-3 py-2 outline-none ${inputClass}`} value={row.cards} onChange={(e) => onChange(index, "cards", e.target.value)} /><input type="number" className={`rounded-xl border-2 px-3 py-2 outline-none ${inputClass}`} value={row.corners} onChange={(e) => onChange(index, "corners", e.target.value)} /></div>; })}</div></div><div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-10">{[["O1.5", pct(metrics.over15)],["O2.5", pct(metrics.over25)],["O3.5", pct(metrics.over35)],["U3.5", pct(metrics.under35)],["BTTS", pct(metrics.btts)],["GF prom.", metrics.avgGF.toFixed(2)],["GC prom.", metrics.avgGC.toFixed(2)],["GF rec.", metrics.weightedGF.toFixed(2)],["Tarj. rec.", metrics.weightedCards.toFixed(2)],["Corn. rec.", metrics.weightedCorners.toFixed(2)]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold text-slate-600">{label}</p><p className="text-lg font-bold text-slate-900">{value}</p></div>)}</div></section>;
}
