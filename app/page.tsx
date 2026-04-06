"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { analizarParlay } from "@/lib/sistemaDios";
import { optimizarParlay } from "@/lib/optimizador";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type MatchStage =
  | "Liga"
  | "16vos"
  | "8vos"
  | "4tos"
  | "Semifinal"
  | "Final";

type MatchType = "Liga" | "Ida" | "Vuelta" | "Clásico" | "Copa";

type ResultState = "G" | "E" | "P" | "";

type TeamCondition = "local" | "visitante";

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
  estado: ResultState;
};

type MatchInfo = {
  local: string;
  visitante: string;
  liga: string;
  fecha: string;
  posicionLocal: number | "";
  posicionVisitante: number | "";
  etapa: MatchStage;
  tipo: MatchType;
  globalScore: string;
  notas: string;
};

type RefereeInfo = {
  nombre: string;
  promedioAmarillas: number | "";
  promedioRojas: number | "";
};

type SavedTeamPack = {
  teamName: string;
  condition: TeamCondition;
  rows: TeamRow[];
  savedAt: string;
};

type SavedReferee = {
  nombre: string;
  promedioAmarillas: number;
  promedioRojas: number;
};

type ExportedTeamFile = {
  version: 1;
  kind: "team";
  teamName: string;
  condition: TeamCondition;
  liga: string;
  rows: TeamRow[];
  savedAt: string;
};

type ExportedRefereeFile = {
  version: 1;
  kind: "referee";
  refInfo: RefereeInfo;
  savedAt: string;
};

type ExportedMatchFile = {
  version: 1;
  kind: "match";
  fileName: string;
  savedAt: string;
  payload: {
    matchInfo: MatchInfo;
    refInfo: RefereeInfo;
    localRows: TeamRow[];
    visitRows: TeamRow[];
    odds: {
      local: number | "";
      empate: number | "";
      visitante: number | "";
      over15: number | "";
      over25: number | "";
      under35: number | "";
      under45: number | "";
      btts: number | "";
      corners75: number | "";
      corners85: number | "";
      corners105: number | "";
      cards35: number | "";
      cards45: number | "";
      cards55: number | "";
    };
    parlay: PickItem[];
    monteCarloResult: {
      localWin: number;
      draw: number;
      awayWin: number;
      over15: number;
      over25: number;
      btts: number;
      topScores: ScoreProb[];
    } | null;
  };
};

type PickItem = {
  id: string;
  mercado: string;
  probabilidad: number;
  riesgo: "Bajo" | "Medio" | "Alto";
  motivo: string;
};

type ScoreProb = {
  score: string;
  prob: number;
};

const STAGES: MatchStage[] = ["Liga", "16vos", "8vos", "4tos", "Semifinal", "Final"];
const TYPES: MatchType[] = ["Liga", "Ida", "Vuelta", "Clásico", "Copa"];

const TEAM_STORAGE_KEY = "analizador_saved_teams_v1";
const REF_STORAGE_KEY = "analizador_saved_refs_v1";
const MATCH_DRAFT_KEY = "analizador_match_draft_v2";

function createEmptyRows(): TeamRow[] {
  return Array.from({ length: 10 }, () => ({
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
    estado: "",

    
  }));
}



function toNumber(value: number | ""): number {
  return value === "" ? 0 : Number(value);
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return (part / total) * 100;
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function weightedAvg(values: number[]): number {
  if (!values.length) return 0;

  const baseWeights = [1.6, 1.5, 1.4, 1.3, 1.2, 1.0, 1.0, 0.9, 0.8, 0.7];
  const weights = values.map((_, i) => baseWeights[i] ?? 0.7);

  const totalW = weights.reduce((a, b) => a + b, 0);
  const sum = values.reduce((acc, value, i) => acc + value * weights[i], 0);

  return totalW ? sum / totalW : 0;
}

function variance(values: number[]): number {
  if (!values.length) return 0;
  const mean = avg(values);
  return avg(values.map((v) => (v - mean) ** 2));
}

function stdDev(values: number[]): number {
  return Math.sqrt(variance(values));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function poisson(lambda: number, k: number): number {
  const fact = (x: number): number => (x <= 1 ? 1 : x * fact(x - 1));
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact(k);
}

function impliedProb(odd: number | ""): number {
  if (odd === "" || odd <= 0) return 0;
  return 100 / Number(odd);
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function resultFromGoals(gf: number, gc: number): ResultState {
  if (gf > gc) return "G";
  if (gf < gc) return "P";
  return "E";
}

function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function slugifyFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function formatDateForFile(value: string) {
  if (!value?.trim()) {
    return new Date().toISOString().slice(0, 10);
  }
  return value;
}

function downloadJsonFile(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function hasUsefulRows(rows: TeamRow[]) {
  return rows.some(
    (r) =>
      r.rival.trim() ||
      r.fecha.trim() ||
      r.gf !== "" ||
      r.gc !== "" ||
      r.ownCorners !== "" ||
      r.oppCorners !== "" ||
      r.ownYellow !== "" ||
      r.oppYellow !== "" ||
      r.ownRed !== "" ||
      r.oppRed !== ""
  );
}


function parseFlexibleDate(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slashMatch) return null;

  let a = Number(slashMatch[1]);
  let b = Number(slashMatch[2]);
  let year = Number(slashMatch[3]);

  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }

  const monthFirst = a <= 12;
  const dayFirst = b <= 12 ? false : true;
  const month = monthFirst && !dayFirst ? a : b;
  const day = monthFirst && !dayFirst ? b : a;

  const parsed = new Date(year, month - 1, day, 12, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getAgeInDays(value: string): number | null {
  const parsed = parseFlexibleDate(value);
  if (!parsed) return null;
  const diffMs = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function getRecencyBoost(ageDays: number | null, index: number): number {
  const positionWeights = [1.5, 1.42, 1.34, 1.26, 1.18, 1.05, 0.98, 0.9, 0.82, 0.74];
  const positionWeight = positionWeights[index] ?? 0.72;

  if (ageDays === null) return positionWeight;
  if (ageDays <= 45) return positionWeight * 1.2;
  if (ageDays <= 90) return positionWeight * 1.08;
  if (ageDays <= 150) return positionWeight;
  if (ageDays <= 210) return positionWeight * 0.82;
  return positionWeight * 0.6;
}

function weightedAvgBy(values: number[], weights: number[]): number {
  if (!values.length || !weights.length) return 0;
  const totalW = weights.reduce((a, b) => a + b, 0);
  if (!totalW) return 0;
  return values.reduce((acc, value, i) => acc + value * (weights[i] ?? 0), 0) / totalW;
}

function getFreshnessLabel(veryOldCount: number, staleCount: number, count: number) {
  if (!count) return "Sin datos";
  if (veryOldCount >= 3) return "Muy vieja";
  if (staleCount >= 4) return "Mezclada";
  return "Buena";
}

function getTotalGoals(row: TeamRow) {
  return toNumber(row.gf) + toNumber(row.gc);
}

function getBTTS(row: TeamRow) {
  return toNumber(row.gf) > 0 && toNumber(row.gc) > 0 ? 1 : 0;
}

function analyzeRows(rows: TeamRow[]) {
  const valid = rows.filter((r) => r.fecha || r.rival || r.gf !== "" || r.gc !== "");
  const count = valid.length || 1;
  const ages = valid.map((r) => getAgeInDays(r.fecha));
  const recencyWeights = valid.map((_, i) => getRecencyBoost(ages[i], i));

  const gfList = valid.map((r) => toNumber(r.gf));
  const gcList = valid.map((r) => toNumber(r.gc));
  const totalGoalsList = valid.map((r) => getTotalGoals(r));
  const ownCornersList = valid.map((r) => toNumber(r.ownCorners));
  const oppCornersList = valid.map((r) => toNumber(r.oppCorners));
  const totalCornersList = valid.map((r) => toNumber(r.ownCorners) + toNumber(r.oppCorners));
  const ownYellowList = valid.map((r) => toNumber(r.ownYellow));
  const oppYellowList = valid.map((r) => toNumber(r.oppYellow));
  const totalYellowList = valid.map((r) => toNumber(r.ownYellow) + toNumber(r.oppYellow));
  const redList = valid.map((r) => toNumber(r.ownRed) + toNumber(r.oppRed));

  const recentCount = ages.filter((age) => age !== null && age <= 90).length;
  const staleCount = ages.filter((age) => age !== null && age > 150).length;
  const veryOldCount = ages.filter((age) => age !== null && age > 210).length;
  const knownAgeValues = ages.filter((age): age is number => age !== null);
  const averageAgeDays = knownAgeValues.length ? avg(knownAgeValues) : 0;

  const wins = valid.filter((r) => r.estado === "G").length;
  const draws = valid.filter((r) => r.estado === "E").length;
  const losses = valid.filter((r) => r.estado === "P").length;

  const over15 = valid.filter((r) => getTotalGoals(r) > 1.5).length;
  const over25 = valid.filter((r) => getTotalGoals(r) > 2.5).length;
  const over35 = valid.filter((r) => getTotalGoals(r) > 3.5).length;
  const under35 = valid.filter((r) => getTotalGoals(r) < 3.5).length;
  const bttsYes = valid.filter((r) => getBTTS(r) === 1).length;

  const cornersOver75 = totalCornersList.filter((x) => x > 7.5).length;
  const cornersOver85 = totalCornersList.filter((x) => x > 8.5).length;
  const cornersOver95 = totalCornersList.filter((x) => x > 9.5).length;

  const cardsOver35 = totalYellowList.filter((x) => x > 3.5).length;
  const cardsOver45 = totalYellowList.filter((x) => x > 4.5).length;
  const cardsOver55 = totalYellowList.filter((x) => x > 5.5).length;
  const cardsUnder65 = totalYellowList.filter((x) => x < 6.5).length;

  const freshnessScore = clamp(100 - staleCount * 9 - veryOldCount * 10 - Math.max(0, averageAgeDays - 90) * 0.1, 35, 100);

  return {
    count: valid.length,
    gfAvg: avg(gfList),
    gcAvg: avg(gcList),
    totalGoalsAvg: avg(totalGoalsList),
    ownCornersAvg: avg(ownCornersList),
    oppCornersAvg: avg(oppCornersList),
    totalCornersAvg: avg(totalCornersList),
    ownYellowAvg: avg(ownYellowList),
    oppYellowAvg: avg(oppYellowList),
    totalYellowAvg: avg(totalYellowList),
    redAvg: avg(redList),

    gfWeighted: weightedAvgBy(gfList, recencyWeights),
    gcWeighted: weightedAvgBy(gcList, recencyWeights),
    totalGoalsWeighted: weightedAvgBy(totalGoalsList, recencyWeights),
    cornersWeighted: weightedAvgBy(totalCornersList, recencyWeights),
    cardsWeighted: weightedAvgBy(totalYellowList, recencyWeights),

    over15Pct: pct(over15, count),
    over25Pct: pct(over25, count),
    over35Pct: pct(over35, count),
    under35Pct: pct(under35, count),
    bttsPct: pct(bttsYes, count),

    cornersOver75Pct: pct(cornersOver75, count),
    cornersOver85Pct: pct(cornersOver85, count),
    cornersOver95Pct: pct(cornersOver95, count),

    cardsOver35Pct: pct(cardsOver35, count),
    cardsOver45Pct: pct(cardsOver45, count),
    cardsOver55Pct: pct(cardsOver55, count),
    cardsUnder65Pct: pct(cardsUnder65, count),

    winPct: pct(wins, count),
    drawPct: pct(draws, count),
    lossPct: pct(losses, count),
    noLosePct: pct(wins + draws, count),

    totalGoalsStd: stdDev(totalGoalsList),
    cornersStd: stdDev(totalCornersList),
    cardsStd: stdDev(totalYellowList),

    recentCount,
    staleCount,
    veryOldCount,
    averageAgeDays,
    freshnessScore,
    freshnessLabel: getFreshnessLabel(veryOldCount, staleCount, valid.length),
  };
}




function getSectionColors(side: TeamCondition) {
  if (side === "local") {
    return {
      wrapper: "border-2 border-blue-700 bg-blue-100/70",
      header: "text-blue-950",
      sub: "text-blue-900",
      button: "bg-blue-800 hover:bg-blue-900 text-white",
      badge: "bg-blue-200 text-blue-950 border-2 border-blue-700",
      input: "border-2 border-blue-700 bg-white text-slate-950 placeholder:text-slate-500 focus:border-blue-900 focus:ring-2 focus:ring-blue-300",
      tableHead: "bg-blue-200 text-blue-950",
      rowAlt: "even:bg-blue-50/90",
    };
  }

  return {
    wrapper: "border-2 border-red-700 bg-red-100/70",
    header: "text-red-950",
    sub: "text-red-900",
    button: "bg-red-800 hover:bg-red-900 text-white",
    badge: "bg-red-200 text-red-950 border-2 border-red-700",
    input: "border-2 border-red-700 bg-white text-slate-950 placeholder:text-slate-500 focus:border-red-900 focus:ring-2 focus:ring-red-300",
    tableHead: "bg-red-200 text-red-950",
    rowAlt: "even:bg-red-50/90",
  };
}

function getRefColors() {
  return {
    wrapper: "border-2 border-yellow-500 bg-yellow-100/80",
    header: "text-yellow-950",
    sub: "text-yellow-900",
    button: "bg-yellow-500 hover:bg-yellow-600 text-slate-950",
    input: "border-2 border-yellow-500 bg-white text-slate-950 placeholder:text-slate-500 focus:border-yellow-700 focus:ring-2 focus:ring-yellow-300",
  };
}

function getResultBadgeClass(result: ResultState) {
  if (result === "G") {
    return "bg-emerald-100 text-emerald-800 border border-emerald-300";
  }
  if (result === "E") {
    return "bg-slate-200 text-slate-700 border border-slate-300";
  }
  return "bg-rose-100 text-rose-800 border border-rose-300";
}

function getOpponentSuggestions(
  allRowsA: TeamRow[],
  allRowsB: TeamRow[],
  currentValue: string
) {
  const names = [...allRowsA, ...allRowsB]
    .map((r) => r.rival.trim())
    .filter(Boolean);

  const unique = Array.from(new Set(names));

  if (!currentValue.trim()) return unique.slice(0, 12);

  return unique
    .filter((name) =>
      name.toLowerCase().includes(currentValue.trim().toLowerCase())
    )
    .slice(0, 12);
}

function getLevelLabel(
  value: number,
  high: number,
  medium: number
): "Alto" | "Medio" | "Bajo" {
  if (value >= high) return "Alto";
  if (value >= medium) return "Medio";
  return "Bajo";
}

function getProfileBadgeClass(level: "Alto" | "Medio" | "Bajo") {
  if (level === "Alto") {
    return "bg-emerald-100 text-emerald-800 border border-emerald-300";
  }
  if (level === "Medio") {
    return "bg-amber-100 text-amber-800 border border-amber-300";
  }
  return "bg-slate-200 text-slate-700 border border-slate-300";
}



function getEdgeBadge(edge: number) {
  if (edge >= 10) return "bg-emerald-100 text-emerald-800 border border-emerald-300";
  if (edge >= 5) return "bg-blue-100 text-blue-800 border border-blue-300";
  if (edge >= 2) return "bg-amber-100 text-amber-800 border border-amber-300";
  return "bg-slate-100 text-slate-700 border border-slate-300";
}

function getEdgeLabel(edge: number) {
  if (edge >= 10) return "Fuerte";
  if (edge >= 5) return "Jugable";
  if (edge >= 2) return "Justo";
  return "Sin valor";
}

function getSignalColor(level: "Alto" | "Medio" | "Bajo") {
  if (level === "Alto") return "text-emerald-700";
  if (level === "Medio") return "text-amber-700";
  return "text-slate-600";
}
export default function AnalizadorApuestasPage() {



  
  const [matchInfo, setMatchInfo] = useState<MatchInfo>({
    local: "",
    visitante: "",
    liga: "",
    fecha: "",
    posicionLocal: "",
    posicionVisitante: "",
    etapa: "Liga",
    tipo: "Liga",
    globalScore: "",
    notas: ""

    
  });

  const [refInfo, setRefInfo] = useState<RefereeInfo>({

    nombre: "",
    promedioAmarillas: "",
    promedioRojas: "",
  });

  const [localRows, setLocalRows] = useState<TeamRow[]>(createEmptyRows());
  const [visitRows, setVisitRows] = useState<TeamRow[]>(createEmptyRows());

  const [savedTeams, setSavedTeams] = useState<SavedTeamPack[]>([]);
  const [savedRefs, setSavedRefs] = useState<SavedReferee[]>([]);

  const [selectedSavedLocal, setSelectedSavedLocal] = useState("");
  const [selectedSavedVisit, setSelectedSavedVisit] = useState("");
  const [selectedSavedRef, setSelectedSavedRef] = useState("");

  const importMatchInputRef = useRef<HTMLInputElement | null>(null);
  const importLocalInputRef = useRef<HTMLInputElement | null>(null);
  const importVisitInputRef = useRef<HTMLInputElement | null>(null);
  const importRefInputRef = useRef<HTMLInputElement | null>(null);

  const [odds, setOdds] = useState({
    local: "" as number | "",
    empate: "" as number | "",
    visitante: "" as number | "",
    over15: "" as number | "",
    over25: "" as number | "",
    under35: "" as number | "",
    under45: "" as number | "",
    btts: "" as number | "",
    corners75: "" as number | "",
    corners85: "" as number | "",
    corners105: "" as number | "",
    cards35: "" as number | "",
    cards45: "" as number | "",
    cards55: "" as number | "",
  });


  const [parlay, setParlay] = useState<PickItem[]>([]);
  const [monteCarloRuns, setMonteCarloRuns] = useState(5000);
  const [monteCarloResult, setMonteCarloResult] = useState<{
    localWin: number;
    draw: number;
    awayWin: number;
    over15: number;
    over25: number;
    btts: number;
    topScores: ScoreProb[];
  } | null>(null);

const [iaData, setIaData] = useState({
  tarjetas: "" as number | "",
  corners: "" as number | "",
  btts: "" as "" | "Si" | "No",
  ganador: "" as "" | "Local" | "Visitante",
});

const [h2hData, setH2hData] = useState({
  totalMatches: "" as number | "",
  localWins: "" as number | "",
  draws: "" as number | "",
  visitWins: "" as number | "",
  over25Hits: "" as number | "",
  bttsHits: "" as number | "",
  cornersHighHits: "" as number | "",
  cardsLowHits: "" as number | "",
});

const partidos = useMemo(() => {
  const items = [];

  if (matchInfo.local.trim()) {
    items.push({ equipo: matchInfo.local.trim() });
  }

  if (matchInfo.visitante.trim()) {
    items.push({ equipo: matchInfo.visitante.trim() });
  }

  return items;
}, [matchInfo.local, matchInfo.visitante]);

const resultadoDios = useMemo(() => analizarParlay(partidos), [partidos]);
const sugerencias = useMemo(() => optimizarParlay(partidos), [partidos]);


  useEffect(() => {
    setSavedTeams(safeParse<SavedTeamPack[]>(localStorage.getItem(TEAM_STORAGE_KEY), []));
    setSavedRefs(safeParse<SavedReferee[]>(localStorage.getItem(REF_STORAGE_KEY), []));

    const draft = safeParse<ExportedMatchFile["payload"] | null>(localStorage.getItem(MATCH_DRAFT_KEY), null);
    if (!draft) return;

    setMatchInfo(draft.matchInfo ?? {
      local: "",
      visitante: "",
      liga: "",
      fecha: "",
      posicionLocal: "",
      posicionVisitante: "",
      etapa: "Liga",
      tipo: "Liga",
      globalScore: "",
      notas: "",
    });

    setRefInfo(draft.refInfo ?? {
      nombre: "",
      promedioAmarillas: "",
      promedioRojas: "",
    });

    setLocalRows(draft.localRows ?? createEmptyRows());
    setVisitRows(draft.visitRows ?? createEmptyRows());
    setOdds(
      draft.odds ?? {
        local: "",
        empate: "",
        visitante: "",
        over15: "",
        over25: "",
        under35: "",
        under45: "",
        btts: "",
        corners75: "",
        corners85: "",
        corners105: "",
        cards35: "",
        cards45: "",
        cards55: "",
      }
    );
    setParlay(draft.parlay ?? []);
    setMonteCarloResult(draft.monteCarloResult ?? null);
  }, []);

  useEffect(() => {
    const draft = {
      matchInfo,
      refInfo,
      localRows,
      visitRows,
      odds,
      parlay,
      monteCarloResult,
    };

    localStorage.setItem(MATCH_DRAFT_KEY, JSON.stringify(draft));
  }, [matchInfo, refInfo, localRows, visitRows, odds, parlay, monteCarloResult]);

  const localStats = useMemo(() => analyzeRows(localRows), [localRows]);
  const visitStats = useMemo(() => analyzeRows(visitRows), [visitRows]);

  const expectedGoalsLocal = useMemo(() => {
    const base = (localStats.gfWeighted + visitStats.gcWeighted) / 2;
    const positionAdj =
      matchInfo.posicionLocal !== "" && matchInfo.posicionVisitante !== ""
        ? clamp((Number(matchInfo.posicionVisitante) - Number(matchInfo.posicionLocal)) * 0.03, -0.35, 0.35)
        : 0;
    return clamp(base + positionAdj, 0.2, 4.5);
  }, [localStats.gfWeighted, visitStats.gcWeighted, matchInfo.posicionLocal, matchInfo.posicionVisitante]);

  const expectedGoalsVisit = useMemo(() => {
    const base = (visitStats.gfWeighted + localStats.gcWeighted) / 2;
    const positionAdj =
      matchInfo.posicionLocal !== "" && matchInfo.posicionVisitante !== ""
        ? clamp((Number(matchInfo.posicionLocal) - Number(matchInfo.posicionVisitante)) * 0.03, -0.35, 0.35)
        : 0;
    return clamp(base + positionAdj, 0.2, 4.5);
  }, [visitStats.gfWeighted, localStats.gcWeighted, matchInfo.posicionLocal, matchInfo.posicionVisitante]);

  const expectedTotalGoals = expectedGoalsLocal + expectedGoalsVisit;
  const expectedTotalCorners = (localStats.cornersWeighted + visitStats.cornersWeighted) / 2;
  const expectedTotalCards = useMemo(() => {
    const teamBase = (localStats.cardsWeighted + visitStats.cardsWeighted) / 2;
    const refAdj = refInfo.promedioAmarillas === "" ? 0 : Number(refInfo.promedioAmarillas) * 0.35;
    return clamp(teamBase * 0.65 + refAdj, 0.5, 12);
  }, [localStats.cardsWeighted, visitStats.cardsWeighted, refInfo.promedioAmarillas]);

  const normalVsWeightedDiff = useMemo(() => {
    return {
      goalsLocal: Math.abs(localStats.totalGoalsAvg - localStats.totalGoalsWeighted),
      goalsVisit: Math.abs(visitStats.totalGoalsAvg - visitStats.totalGoalsWeighted),
      cornersLocal: Math.abs(localStats.totalCornersAvg - localStats.cornersWeighted),
      cornersVisit: Math.abs(visitStats.totalCornersAvg - visitStats.cornersWeighted),
      cardsLocal: Math.abs(localStats.totalYellowAvg - localStats.cardsWeighted),
      cardsVisit: Math.abs(visitStats.totalYellowAvg - visitStats.cardsWeighted),
    };
  }, [localStats, visitStats]);

const localProfile = useMemo(() => {
  const goles = getLevelLabel(localStats.totalGoalsWeighted, 2.6, 1.8);
  const btts = getLevelLabel(localStats.bttsPct, 60, 45);
  const corners = getLevelLabel(localStats.cornersWeighted, 9, 7);
  const tarjetas = getLevelLabel(localStats.cardsWeighted, 4.8, 3.2);

  let estabilidad: "Estable" | "Variable" | "Volátil" = "Estable";
  if (localStats.totalGoalsStd >= 1.4 || localStats.cornersStd >= 3) {
    estabilidad = "Variable";
  }
  if (localStats.totalGoalsStd >= 1.8 || localStats.cornersStd >= 4) {
    estabilidad = "Volátil";
  }

  let estilo = "Equilibrado";
  if (localStats.gfWeighted > localStats.gcWeighted + 0.4 && localStats.totalGoalsWeighted >= 2.2) {
    estilo = "Ofensivo";
  } else if (localStats.totalGoalsWeighted < 2.0 && localStats.bttsPct < 50) {
    estilo = "Cerrado";
  }

  return {
    goles,
    btts,
    corners,
    tarjetas,
    estabilidad,
    estilo,
  };
}, [localStats]);

function getCombinedReading(
  localProfile: {
    goles: "Alto" | "Medio" | "Bajo";
    btts: "Alto" | "Medio" | "Bajo";
    corners: "Alto" | "Medio" | "Bajo";
    tarjetas: "Alto" | "Medio" | "Bajo";
    estabilidad: "Estable" | "Variable" | "Volátil";
    estilo: string;
  },
  visitProfile: {
    goles: "Alto" | "Medio" | "Bajo";
    btts: "Alto" | "Medio" | "Bajo";
    corners: "Alto" | "Medio" | "Bajo";
    tarjetas: "Alto" | "Medio" | "Bajo";
    estabilidad: "Estable" | "Variable" | "Volátil";
    estilo: string;
  }
) {
  let cruce = "Equilibrado";
  let lecturaGoles = "Señal media de goles";
  let lecturaBTTS = "Señal media para ambos marcan";
  let lecturaCorners = "Señal media de corners";
  let lecturaTarjetas = "Señal media de tarjetas";
  let riesgo = "Medio";

  if (localProfile.estilo === "Ofensivo" && visitProfile.estilo === "Ofensivo") {
    cruce = "Ofensivo vs Ofensivo";
    lecturaGoles = "Partido apto para goles";
  } else if (
    (localProfile.estilo === "Ofensivo" && visitProfile.estilo === "Cerrado") ||
    (localProfile.estilo === "Cerrado" && visitProfile.estilo === "Ofensivo")
  ) {
    cruce = "Ofensivo vs Cerrado";
    lecturaGoles = "Cuidado con overs altos";
  } else if (localProfile.estilo === "Cerrado" && visitProfile.estilo === "Cerrado") {
    cruce = "Cerrado vs Cerrado";
    lecturaGoles = "Partido de pocos goles";
  }

  if (localProfile.btts === "Alto" && visitProfile.btts === "Alto") {
    lecturaBTTS = "Fuerte señal para ambos marcan";
  } else if (localProfile.btts === "Bajo" || visitProfile.btts === "Bajo") {
    lecturaBTTS = "Señal débil para ambos marcan";
  }

  if (localProfile.corners === "Alto" && visitProfile.corners === "Alto") {
    lecturaCorners = "Partido apto para corners";
  } else if (localProfile.corners === "Bajo" && visitProfile.corners === "Bajo") {
    lecturaCorners = "Señal baja para corners";
  }

  if (localProfile.tarjetas === "Alto" || visitProfile.tarjetas === "Alto") {
    lecturaTarjetas = "Buenas señales para tarjetas";
  } else if (localProfile.tarjetas === "Bajo" && visitProfile.tarjetas === "Bajo") {
    lecturaTarjetas = "Partido flojo para tarjetas";
  }

  if (
    localProfile.estabilidad === "Volátil" ||
    visitProfile.estabilidad === "Volátil"
  ) {
    riesgo = "Alto";
  } else if (
    localProfile.estabilidad === "Variable" ||
    visitProfile.estabilidad === "Variable"
  ) {
    riesgo = "Medio";
  } else {
    riesgo = "Bajo";
  }

  return {
    cruce,
    lecturaGoles,
    lecturaBTTS,
    lecturaCorners,
    lecturaTarjetas,
    riesgo,
  };
}

const visitProfile = useMemo(() => {
  const goles = getLevelLabel(visitStats.totalGoalsWeighted, 2.6, 1.8);
  const btts = getLevelLabel(visitStats.bttsPct, 60, 45);
  const corners = getLevelLabel(visitStats.cornersWeighted, 9, 7);
  const tarjetas = getLevelLabel(visitStats.cardsWeighted, 4.8, 3.2);

  let estabilidad: "Estable" | "Variable" | "Volátil" = "Estable";
  if (visitStats.totalGoalsStd >= 1.4 || visitStats.cornersStd >= 3) {
    estabilidad = "Variable";
  }
  if (visitStats.totalGoalsStd >= 1.8 || visitStats.cornersStd >= 4) {
    estabilidad = "Volátil";
  }

  let estilo = "Equilibrado";
  if (visitStats.gfWeighted > visitStats.gcWeighted + 0.4 && visitStats.totalGoalsWeighted >= 2.2) {
    estilo = "Ofensivo";
  } else if (visitStats.totalGoalsWeighted < 2.0 && visitStats.bttsPct < 50) {
    estilo = "Cerrado";
  }

  return {
    goles,
    btts,
    corners,
    tarjetas,
    estabilidad,
    estilo,
  };
}, [visitStats]);
  
  const volatilityScore = useMemo(() => {
    const g = (localStats.totalGoalsStd + visitStats.totalGoalsStd) / 2;
    const c = (localStats.cornersStd + visitStats.cornersStd) / 2;
    const t = (localStats.cardsStd + visitStats.cardsStd) / 2;
    return g * 16 + c * 6 + t * 10;
  }, [localStats, visitStats]);

  const volatilityLabel = useMemo(() => {
    if (volatilityScore < 28) return "Baja";
    if (volatilityScore < 42) return "Media";
    return "Alta";
  }, [volatilityScore]);

const combinedReading = useMemo(() => {
  return getCombinedReading(localProfile, visitProfile);
}, [localProfile, visitProfile]);


const commonOpponents = useMemo(() => {
  const localOpps = new Map<string, TeamRow>();
  const visitOpps = new Map<string, TeamRow>();

  localRows.forEach((r) => {
    const key = r.rival.trim().toLowerCase();
    if (key) localOpps.set(key, r);
  });

  visitRows.forEach((r) => {
    const key = r.rival.trim().toLowerCase();
    if (key) visitOpps.set(key, r);
  });

  const commons: Array<{
    rival: string;
    localGF: number;
    localGC: number;
    visitGF: number;
    visitGC: number;
  }> = [];

  localOpps.forEach((localRow, key) => {
    const visitRow = visitOpps.get(key);
    if (visitRow) {
      commons.push({
        rival: localRow.rival,
        localGF: toNumber(localRow.gf),
        localGC: toNumber(localRow.gc),
        visitGF: toNumber(visitRow.gf),
        visitGC: toNumber(visitRow.gc),
      });
    }
  });

  return commons;
}, [localRows, visitRows]);


const commonAnalysis = useMemo(() => {
  if (!commonOpponents.length) {
    return {
      total: 0,
      localBetter: 0,
      visitBetter: 0,
      parejos: 0,
      resumen: "Sin rivales en común suficientes.",
    };
  }

  let localBetter = 0;
  let visitBetter = 0;
  let parejos = 0;

  commonOpponents.forEach((item) => {
    const localDiff = item.localGF - item.localGC;
    const visitDiff = item.visitGF - item.visitGC;

    if (localDiff > visitDiff) localBetter++;
    else if (visitDiff > localDiff) visitBetter++;
    else parejos++;
  });

  let resumen = "Rendimiento muy parejo ante rivales compartidos.";
  if (localBetter >= visitBetter + 2) resumen = "El local rindió mejor contra rivales en común.";
  if (visitBetter >= localBetter + 2) resumen = "El visitante rindió mejor contra rivales en común.";

  return {
    total: commonOpponents.length,
    localBetter,
    visitBetter,
    parejos,
    resumen,
  };
}, [commonOpponents]);

const simulation = useMemo(() => {
    let localWin = 0;
    let draw = 0;
    let awayWin = 0;
    const scores: ScoreProb[] = [];

    for (let l = 0; l <= 4; l++) {
      for (let v = 0; v <= 4; v++) {
        const p = poisson(expectedGoalsLocal, l) * poisson(expectedGoalsVisit, v);
        scores.push({ score: `${l}-${v}`, prob: p * 100 });
        if (l > v) localWin += p;
        else if (l === v) draw += p;
        else awayWin += p;
      }
    }

    const topScores = scores.sort((a, b) => b.prob - a.prob).slice(0, 5);

    return {
      localWin: localWin * 100,
      draw: draw * 100,
      awayWin: awayWin * 100,
      topScores,
    };
  }, [expectedGoalsLocal, expectedGoalsVisit]);

  const chartGoalsData = useMemo(
    () => [
      {
        nombre: "Local",
        golesFavor: Number(localStats.gfWeighted.toFixed(2)),
        golesContra: Number(localStats.gcWeighted.toFixed(2)),
      },
      {
        nombre: "Visitante",
        golesFavor: Number(visitStats.gfWeighted.toFixed(2)),
        golesContra: Number(visitStats.gcWeighted.toFixed(2)),
      },
    ],
    [
      localStats.gfWeighted,
      localStats.gcWeighted,
      visitStats.gfWeighted,
      visitStats.gcWeighted,
    ]
  );

  const chartExtrasData = useMemo(
    () => [
      {
        nombre: "Corners",
        local: Number(localStats.cornersWeighted.toFixed(2)),
        visitante: Number(visitStats.cornersWeighted.toFixed(2)),
      },
      {
        nombre: "Tarjetas",
        local: Number(localStats.cardsWeighted.toFixed(2)),
        visitante: Number(visitStats.cardsWeighted.toFixed(2)),
      },
    ],
    [
      localStats.cornersWeighted,
      visitStats.cornersWeighted,
      localStats.cardsWeighted,
      visitStats.cardsWeighted,
    ]
  );

  const chartProbData = useMemo(
    () => [
      { nombre: "Local", prob: Number(simulation.localWin.toFixed(1)) },
      { nombre: "Empate", prob: Number(simulation.draw.toFixed(1)) },
      { nombre: "Visitante", prob: Number(simulation.awayWin.toFixed(1)) },
    ],
    [simulation.localWin, simulation.draw, simulation.awayWin]
  );


  const trapAlert = useMemo(() => {
    let score = 0;
    const reasons: string[] = [];

    const posGap =
      matchInfo.posicionLocal !== "" && matchInfo.posicionVisitante !== ""
        ? Math.abs(Number(matchInfo.posicionLocal) - Number(matchInfo.posicionVisitante))
        : 0;

    const favoriteLocal = expectedGoalsLocal - expectedGoalsVisit > 0.4;
    const favoriteVisit = expectedGoalsVisit - expectedGoalsLocal > 0.4;

    if (favoriteLocal && localStats.winPct < 50) {
      score += 2;
      reasons.push("El local parece favorito, pero no gana con suficiente frecuencia.");
    }

    if (
  volatilityLabel === "Alta" &&
  Math.max(simulation.localWin, simulation.awayWin) < 55
) {
  score += 2;
  reasons.push("Partido impredecible: no conviene confiar en ganador directo.");
}

    if (favoriteVisit && visitStats.winPct < 50) {
      score += 2;
      reasons.push("El visitante parece favorito, pero no gana con suficiente frecuencia.");
    }

    if (Math.abs(localStats.totalGoalsWeighted - localStats.totalGoalsAvg) > 0.7) {
      score += 1;
      reasons.push("El local muestra cambio reciente fuerte en goles.");
    }

    if (Math.abs(visitStats.totalGoalsWeighted - visitStats.totalGoalsAvg) > 0.7) {
      score += 1;
      reasons.push("El visitante muestra cambio reciente fuerte en goles.");
    }

    if (volatilityLabel === "Alta") {
      score += 2;
      reasons.push("La volatilidad general del partido es alta.");
    }

    if (matchInfo.tipo === "Vuelta" && matchInfo.globalScore.trim()) {
      score += 1;
      reasons.push("Es partido de vuelta; el contexto del global puede distorsionar el juego.");
    }

    if (posGap >= 8 && Math.abs(expectedGoalsLocal - expectedGoalsVisit) < 0.35) {
      score += 2;
      reasons.push("La diferencia de tabla no se refleja claramente en los datos del partido.");
    }

    if (score <= 2) return { label: "Estable", color: "text-emerald-700 bg-emerald-50 border-emerald-200", reasons };
    if (score <= 4) return { label: "Cuidado", color: "text-amber-700 bg-amber-50 border-amber-200", reasons };
    return { label: "Partido trampa", color: "text-rose-700 bg-rose-50 border-rose-200", reasons };
  }, [
    expectedGoalsLocal,
    expectedGoalsVisit,
    localStats.winPct,
    visitStats.winPct,
    localStats.totalGoalsWeighted,
    localStats.totalGoalsAvg,
    visitStats.totalGoalsWeighted,
    visitStats.totalGoalsAvg,
    volatilityLabel,
    matchInfo.tipo,
    matchInfo.globalScore,
    matchInfo.posicionLocal,
    matchInfo.posicionVisitante,
  ]);

  const bestPicks = useMemo<PickItem[]>(() => {
    const picks: PickItem[] = [];

    const over15Prob = clamp((localStats.over15Pct + visitStats.over15Pct) / 2, 0, 100);
    const over25Prob = clamp((localStats.over25Pct + visitStats.over25Pct) / 2, 0, 100);
    const under35Prob = clamp((localStats.under35Pct + visitStats.under35Pct) / 2, 0, 100);
    const bttsProb = clamp((localStats.bttsPct + visitStats.bttsPct) / 2, 0, 100);
    const corners85Prob = clamp((localStats.cornersOver85Pct + visitStats.cornersOver85Pct) / 2, 0, 100);
    const cards45Prob =
      clamp((localStats.cardsOver45Pct + visitStats.cardsOver45Pct) / 2, 0, 100) * 0.7 +
      (refInfo.promedioAmarillas === "" ? 0 : Number(refInfo.promedioAmarillas) * 5);

    const freshnessPenalty =
      (100 - localStats.freshnessScore) * 0.12 +
      (100 - visitStats.freshnessScore) * 0.12;

    const knockoutCaution = matchInfo.tipo === "Vuelta" || matchInfo.tipo === "Copa" || matchInfo.etapa !== "Liga";
    const strongGoalSignal = expectedTotalGoals >= 2.55 && bttsProb >= 58;
    const mediumGoalSignal = expectedTotalGoals >= 2.3 && bttsProb >= 52;
    const lowGoalWarning =
      expectedTotalGoals < 2.2 ||
      (bttsProb < 52 && simulation.draw >= 22) ||
      (knockoutCaution && expectedTotalGoals < 2.55);

    const over15Adjusted = clamp(over15Prob - freshnessPenalty - (lowGoalWarning ? 7 : 0), 0, 100);
    const over25Adjusted = clamp(over25Prob - freshnessPenalty - (knockoutCaution ? 5 : 0), 0, 100);
    const under35Adjusted = clamp(under35Prob - freshnessPenalty * 0.35, 0, 100);
    const cornersAdjusted = clamp(corners85Prob - freshnessPenalty * 0.4, 0, 100);
    const cardsAdjusted = clamp(cards45Prob - freshnessPenalty * 0.25, 0, 100);

    if (over15Adjusted >= 73 && mediumGoalSignal && !lowGoalWarning) {
      picks.push({
        id: "over15",
        mercado: "Más de 1.5 goles",
        probabilidad: over15Adjusted,
        riesgo: strongGoalSignal ? "Bajo" : "Medio",
        motivo: strongGoalSignal
          ? "Línea jugable: hay señal ofensiva suficiente y el partido no luce cerrado."
          : "Línea aceptable, pero no conviene combinarla con más goles del mismo juego.",
      });
    }

    if (under35Adjusted >= 69) {
      picks.push({
        id: "under35",
        mercado: "Menos de 3.5 goles",
        probabilidad: under35Adjusted,
        riesgo: under35Adjusted >= 76 ? "Bajo" : "Medio",
        motivo: knockoutCaution
          ? "Línea sólida para cruce tenso o eliminatorio; protege del partido corto."
          : "Buena línea de control cuando el partido no apunta a festival de goles.",
      });
    }

    if (over25Adjusted >= 66 && expectedTotalGoals >= 2.75 && strongGoalSignal && !lowGoalWarning && under35Prob < 78) {
      picks.push({
        id: "over25",
        mercado: "Más de 2.5 goles",
        probabilidad: over25Adjusted,
        riesgo: "Medio",
        motivo: "Línea exigente pero jugable: ambos equipos sí sostienen ritmo para 3 goles.",
      });
    }

    if (bttsProb >= 63 && expectedGoalsLocal >= 0.95 && expectedGoalsVisit >= 0.95) {
      picks.push({
        id: "btts",
        mercado: "Ambos marcan: Sí",
        probabilidad: clamp(bttsProb - freshnessPenalty * 0.3, 0, 100),
        riesgo: "Medio",
        motivo: "Ambos lados tienen base ofensiva suficiente; mejor cuando ninguno depende de un solo gol.",
      });
    }

    const strongCornerSignal = expectedTotalCorners >= 9.4;
    const mediumCornerSignal = expectedTotalCorners >= 8.1;

    if (cornersAdjusted >= 60 && (strongCornerSignal || mediumCornerSignal)) {
      picks.push({
        id: "corners85",
        mercado: strongCornerSignal ? "Más de 8.5 corners" : "Más de 7.5 corners",
        probabilidad: clamp(Math.max(cornersAdjusted, expectedTotalCorners * 8.4), 0, 100),
        riesgo: strongCornerSignal ? "Medio" : "Bajo",
        motivo: strongCornerSignal
          ? "Señal fuerte de volumen por bandas y presión sostenida."
          : "La línea media de corners se ve más cómoda que la línea alta.",
      });
    }

    if (expectedTotalCards >= 3.6) {
      picks.push({
        id: "cards45",
        mercado: expectedTotalCards >= 4.8 ? "Más de 4.5 tarjetas" : "Más de 3.5 tarjetas",
        probabilidad: clamp(Math.max(cardsAdjusted, expectedTotalCards * 12.5), 0, 100),
        riesgo: expectedTotalCards >= 4.8 ? "Medio" : "Bajo",
        motivo:
          expectedTotalCards >= 4.8
            ? "Buena línea cuando equipos y árbitro empujan el partido hacia fricción real."
            : "La línea base es más cómoda que una línea alta de tarjetas.",
      });
    }

    const noLoseLocalProb = clamp((localStats.noLosePct + (100 - visitStats.winPct)) / 2, 0, 100);
    if (simulation.localWin + simulation.draw >= 68 && noLoseLocalProb >= 68) {
      picks.push({
        id: "1x",
        mercado: "Local o empate (1X)",
        probabilidad: clamp((simulation.localWin + simulation.draw + noLoseLocalProb) / 2 - freshnessPenalty * 0.2, 0, 100),
        riesgo: "Bajo",
        motivo: "Mercado más sano que ganador directo cuando el local es superior pero no avasalla.",
      });
    }

    const noLoseVisitProb = clamp((visitStats.noLosePct + (100 - localStats.winPct)) / 2, 0, 100);
    if (simulation.awayWin + simulation.draw >= 68 && noLoseVisitProb >= 68) {
      picks.push({
        id: "x2",
        mercado: "Visitante o empate (X2)",
        probabilidad: clamp((simulation.awayWin + simulation.draw + noLoseVisitProb) / 2 - freshnessPenalty * 0.2, 0, 100),
        riesgo: "Bajo",
        motivo: "Mercado más sano que ganador directo cuando el visitante compite bien pero el partido sigue cerrado.",
      });
    }

    return picks.sort((a, b) => b.probabilidad - a.probabilidad);
  }, [
    localStats,
    visitStats,
    refInfo.promedioAmarillas,
    simulation,
    expectedTotalGoals,
    expectedTotalCorners,
    expectedTotalCards,
    expectedGoalsLocal,
    expectedGoalsVisit,
    matchInfo.tipo,
    matchInfo.etapa,
  ]);


  const discardedMarkets = useMemo(() => {
    const items: string[] = [];

    if (Math.abs(simulation.localWin - simulation.awayWin) < 10) {
      items.push("Ganador directo: el partido se ve demasiado parejo.");
    }

if (expectedTotalGoals < 2.2 && ((localStats.bttsPct + visitStats.bttsPct) / 2) < 55) {
  items.push("Más de 2.5 goles: el partido muestra señales de pocos goles.");
}

    if (volatilityLabel === "Alta") {
      items.push("Marcador exacto: demasiada volatilidad para confiar.");
    }

    if ((localStats.cornersOver85Pct + visitStats.cornersOver85Pct) / 2 < 55) {
      items.push("Corners altos: señal insuficiente.");
    }

    if ((localStats.bttsPct + visitStats.bttsPct) / 2 < 50) {
      items.push("Ambos marcan: señal débil.");
    }

    return items;
  }, [simulation, volatilityLabel, localStats, visitStats]);

  const profile = useMemo(() => {
    const openClosed =
      expectedTotalGoals >= 2.9 ? "Abierto" : expectedTotalGoals <= 2.1 ? "Cerrado" : "Intermedio";
    const cardsStyle =
      expectedTotalCards >= 5.5 ? "Tarjetas altas" : expectedTotalCards <= 4.0 ? "Tarjetas bajas" : "Tarjetas medias";
    const cornersStyle =
      expectedTotalCorners >= 9.3 ? "Corners altos" : expectedTotalCorners <= 7.5 ? "Corners bajos" : "Corners medios";

    return {
      tipo: openClosed,
      goles: expectedTotalGoals >= 2.5 ? "Tendencia a goles" : "Tendencia contenida",
      tarjetas: cardsStyle,
      corners: cornersStyle,
      riesgo: trapAlert.label,
    };
  }, [expectedTotalGoals, expectedTotalCards, expectedTotalCorners, trapAlert.label]);


  const dominanceInfo = useMemo(() => {
    const probs = [
      { key: "local", value: simulation.localWin },
      { key: "empate", value: simulation.draw },
      { key: "visitante", value: simulation.awayWin },
    ].sort((a, b) => b.value - a.value);

    const top = probs[0];
    const second = probs[1];
    const gap = top.value - second.value;

    let level = "Mixto";
    if ((top.key === "local" || top.key === "visitante") && top.value >= 60 && gap >= 14) {
      level = "Dominado";
    } else if (top.value <= 42 || simulation.draw >= 28 || gap < 8) {
      level = "Cerrado";
    }

    return {
      level,
      gap,
      topKey: top.key,
      topValue: top.value,
    };
  }, [simulation]);

  const h2hSummary = useMemo(() => {
    const total = Number(h2hData.totalMatches || 0);
    if (!total) {
      return {
        hasData: false,
        totalMatches: 0,
        localWinPct: 0,
        drawPct: 0,
        visitWinPct: 0,
        over25Pct: 0,
        bttsPct: 0,
        cornersHighPct: 0,
        cardsLowPct: 0,
      };
    }

    return {
      hasData: true,
      totalMatches: total,
      localWinPct: pct(Number(h2hData.localWins || 0), total),
      drawPct: pct(Number(h2hData.draws || 0), total),
      visitWinPct: pct(Number(h2hData.visitWins || 0), total),
      over25Pct: pct(Number(h2hData.over25Hits || 0), total),
      bttsPct: pct(Number(h2hData.bttsHits || 0), total),
      cornersHighPct: pct(Number(h2hData.cornersHighHits || 0), total),
      cardsLowPct: pct(Number(h2hData.cardsLowHits || 0), total),
    };
  }, [h2hData]);

  const h2hReading = useMemo(() => {
    if (!h2hSummary.hasData) {
      return {
        label: "Sin H2H cargado",
        color: "border-slate-200 bg-slate-50 text-slate-700",
        notes: ["Carga el H2H manual si quieres una capa extra de validación."],
      };
    }

    const notes: string[] = [];
    let label = "H2H mixto";
    let color = "border-amber-200 bg-amber-50 text-amber-800";

    if (h2hSummary.over25Pct >= 65) notes.push("El historial acompaña over 2.5.");
    if (h2hSummary.over25Pct <= 40) notes.push("El historial sugiere partido corto de goles.");
    if (h2hSummary.bttsPct >= 60) notes.push("El H2H respalda ambos marcan.");
    if (h2hSummary.bttsPct <= 40) notes.push("El H2H debilita ambos marcan.");
    if (h2hSummary.cornersHighPct >= 60) notes.push("Los corners altos tienen respaldo histórico.");
    if (h2hSummary.cornersHighPct <= 40) notes.push("El historial no acompaña corners altos.");
    if (h2hSummary.cardsLowPct >= 60) notes.push("Las tarjetas tienden a ir más bajas.");
    if (h2hSummary.drawPct >= 30) notes.push("El empate aparece bastante en el H2H.");

    if (h2hSummary.over25Pct >= 65 && h2hSummary.bttsPct >= 58) {
      label = "H2H abierto";
      color = "border-emerald-200 bg-emerald-50 text-emerald-800";
    } else if (h2hSummary.over25Pct <= 40 && h2hSummary.bttsPct <= 45) {
      label = "H2H cerrado";
      color = "border-blue-200 bg-blue-50 text-blue-800";
    }

    return { label, color, notes };
  }, [h2hSummary]);

  const h2hFavoriteValidation = useMemo(() => {
    if (!h2hSummary.hasData) {
      return "Sin H2H suficiente para validar favorito vs cuota.";
    }

    const localHouse = impliedProb(odds.local);
    const visitHouse = impliedProb(odds.visitante);

    if (localHouse > 0) {
      const diff = h2hSummary.localWinPct - localHouse;
      if (diff >= 5) return "El H2H respalda más al local de lo que dice la cuota.";
      if (diff <= -5) return "La cuota del local parece exigente para lo que respalda el H2H.";
    }

    if (visitHouse > 0) {
      const diff = h2hSummary.visitWinPct - visitHouse;
      if (diff >= 5) return "El H2H respalda más al visitante de lo que dice la cuota.";
      if (diff <= -5) return "La cuota del visitante parece exigente para lo que respalda el H2H.";
    }

    return "H2H y cuota sin diferencia fuerte de valor.";
  }, [h2hSummary, odds.local, odds.visitante]);


  const finalReading = useMemo(() => {
    const underLean =
      expectedTotalGoals <= 2.2 ||
      ((localStats.under35Pct + visitStats.under35Pct) / 2 >= 72 &&
        (localStats.bttsPct + visitStats.bttsPct) / 2 <= 55);

    const overLean =
      expectedTotalGoals >= 2.8 &&
      expectedGoalsLocal >= 1.1 &&
      expectedGoalsVisit >= 0.9 &&
      (localStats.bttsPct + visitStats.bttsPct) / 2 >= 55;

    let tipo = "Mixto";
    let recomendacion = "Mercados selectivos";
    let semaforo = "🟡";
    const razones: string[] = [];

    if (dominanceInfo.level === "Dominado") {
      tipo = "Dominado";
      recomendacion = "Se puede atacar favorito o líneas moderadas";
      semaforo = "🟢";
      razones.push("Hay dominancia real en probabilidades.");
    }

    if (underLean && dominanceInfo.level !== "Dominado") {
      tipo = "Cerrado";
      recomendacion = "Evitar overs altos y ganador directo";
      semaforo = "🔴";
      razones.push("El partido tiene señales claras de under.");
    }

    if (overLean && dominanceInfo.level !== "Cerrado") {
      tipo = "Abierto";
      recomendacion = "Partido apto para goles moderados";
      semaforo = dominanceInfo.level === "Dominado" ? "🟢" : "🟡";
      razones.push("Hay base ofensiva en ambos lados.");
    }

    if (trapAlert.label === "Partido trampa") {
      semaforo = "🔴";
      recomendacion = "No entrar fuerte; partido con alertas.";
      razones.push("Se activó el detector de partido trampa.");
    }

    if (simulation.draw >= 28) {
      razones.push("El empate viene alto en la simulación.");
    }

    if (commonAnalysis.total >= 2) {
      razones.push(commonAnalysis.resumen);
    }

    if (h2hSummary.hasData) {
      razones.push(`H2H: ${h2hReading.label}.`);
      if (h2hSummary.drawPct >= 30 && dominanceInfo.level !== "Dominado") {
        razones.push("El historial añade riesgo de empate.");
      }
      if (h2hReading.label === "H2H cerrado" && dominanceInfo.level !== "Dominado") {
        recomendacion = "El historial pide cautela con overs y ganador directo";
      }
    }

    return {
      tipo,
      recomendacion,
      semaforo,
      razones,
    };
  }, [
    commonAnalysis,
    dominanceInfo.level,
    expectedGoalsLocal,
    expectedGoalsVisit,
    expectedTotalGoals,
    localStats.under35Pct,
    visitStats.under35Pct,
    localStats.bttsPct,
    visitStats.bttsPct,
    trapAlert.label,
    simulation.draw,
    h2hReading.label,
    h2hSummary.hasData,
    h2hSummary.drawPct,
  ]);

  const noBetZone = useMemo(() => {
    const reasons: string[] = [];

    if (trapAlert.label === "Partido trampa") reasons.push("El detector marcó partido trampa.");
    if (volatilityLabel === "Alta" && dominanceInfo.level !== "Dominado") reasons.push("La volatilidad es alta.");
    if (simulation.draw >= 30 && dominanceInfo.level !== "Dominado") reasons.push("El empate es demasiado alto.");
    if (
      finalReading.tipo === "Cerrado" &&
      ((localStats.bttsPct + visitStats.bttsPct) / 2 < 56)
    ) reasons.push("Cruce cerrado con señal débil de BTTS.");
    if (
      expectedTotalCorners < 8 &&
      (localStats.cornersOver85Pct + visitStats.cornersOver85Pct) / 2 < 55
    ) reasons.push("No hay volumen claro de corners.");
    if (commonAnalysis.total >= 3 && commonAnalysis.parejos >= commonAnalysis.total - 1)
      reasons.push("Los rivales en común no marcan ventaja clara.");
    if (h2hSummary.hasData && h2hReading.label === "H2H cerrado" && dominanceInfo.level !== "Dominado")
      reasons.push("El H2H también sugiere cautela con goles y ganador.");

    return {
      active: reasons.length >= 2,
      reasons,
    };
  }, [
    trapAlert.label,
    volatilityLabel,
    simulation.draw,
    dominanceInfo.level,
    finalReading.tipo,
    localStats.bttsPct,
    visitStats.bttsPct,
    expectedTotalCorners,
    localStats.cornersOver85Pct,
    visitStats.cornersOver85Pct,
    commonAnalysis,
    h2hSummary.hasData,
    h2hReading.label,
  ]);

  const valueComparison = useMemo(
    () => [
      {
        mercado: "1",
        sistema: simulation.localWin,
        casa: impliedProb(odds.local),
      },
      {
        mercado: "X",
        sistema: simulation.draw,
        casa: impliedProb(odds.empate),
      },
      {
        mercado: "2",
        sistema: simulation.awayWin,
        casa: impliedProb(odds.visitante),
      },
      {
        mercado: "Más de 1.5 goles",
        sistema: monteCarloResult?.over15 ?? Math.min(95, Math.max(0, (localStats.over15Pct + visitStats.over15Pct) / 2)),
        casa: impliedProb(odds.over15),
      },
      {
        mercado: "Más de 2.5 goles",
        sistema: monteCarloResult?.over25 ?? (localStats.over25Pct + visitStats.over25Pct) / 2,
        casa: impliedProb(odds.over25),
      },
      {
        mercado: "Menos de 3.5 goles",
        sistema: (localStats.under35Pct + visitStats.under35Pct) / 2,
        casa: impliedProb(odds.under35),
      },
      {
        mercado: "Menos de 4.5 goles",
        sistema: clamp(((localStats.under35Pct + visitStats.under35Pct) / 2) + 12, 0, 100),
        casa: impliedProb(odds.under45),
      },
      {
        mercado: "BTTS Sí",
        sistema: monteCarloResult?.btts ?? (localStats.bttsPct + visitStats.bttsPct) / 2,
        casa: impliedProb(odds.btts),
      },
      {
        mercado: "Más de 7.5 corners",
        sistema: (localStats.cornersOver75Pct + visitStats.cornersOver75Pct) / 2,
        casa: impliedProb(odds.corners75),
      },
      {
        mercado: "Más de 8.5 corners",
        sistema: (localStats.cornersOver85Pct + visitStats.cornersOver85Pct) / 2,
        casa: impliedProb(odds.corners85),
      },
      {
        mercado: "Menos de 10.5 corners",
        sistema: clamp(
          100 - ((localStats.cornersOver95Pct + visitStats.cornersOver95Pct) / 2),
          0,
          100
        ),
        casa: impliedProb(odds.corners105),
      },
      {
        mercado: "Más de 3.5 tarjetas",
        sistema: (localStats.cardsOver35Pct + visitStats.cardsOver35Pct) / 2,
        casa: impliedProb(odds.cards35),
      },
      {
        mercado: "Más de 4.5 tarjetas",
        sistema: (localStats.cardsOver45Pct + visitStats.cardsOver45Pct) / 2,
        casa: impliedProb(odds.cards45),
      },
      {
        mercado: "Más de 5.5 tarjetas",
        sistema: (localStats.cardsOver55Pct + visitStats.cardsOver55Pct) / 2,
        casa: impliedProb(odds.cards55),
      },
    ],
    [simulation, monteCarloResult, localStats, visitStats, odds]
  );

  const valueBets = useMemo(() => {
    return valueComparison
      .map((item) => ({
        ...item,
        edge: item.sistema - item.casa,
      }))
      .filter((item) => item.casa > 0)
      .sort((a, b) => b.edge - a.edge);
  }, [valueComparison]);

  const strongValueBets = useMemo(() => valueBets.filter((item) => item.edge >= 5), [valueBets]);

  const iaValidation = useMemo(() => {
    let matches = 0;
    let total = 0;
    const notes: string[] = [];

    if (iaData.tarjetas !== "") {
      total++;
      const diff = Math.abs(Number(iaData.tarjetas) - expectedTotalCards);
      if (diff <= 1.2) {
        matches++;
        notes.push("Tarjetas bastante alineadas.");
      } else {
        notes.push("Tarjetas con diferencia importante.");
      }
    }

    if (iaData.corners !== "") {
      total++;
      const diff = Math.abs(Number(iaData.corners) - expectedTotalCorners);
      if (diff <= 1.8) {
        matches++;
        notes.push("Corners alineados.");
      } else {
        notes.push("Corners con diferencia clara.");
      }
    }

    if (iaData.btts) {
      total++;
      const systemBTTS = (monteCarloResult?.btts ?? (localStats.bttsPct + visitStats.bttsPct) / 2) >= 55 ? "Si" : "No";
      if (systemBTTS === iaData.btts) {
        matches++;
        notes.push("BTTS coincide.");
      } else {
        notes.push("BTTS no coincide.");
      }
    }

    if (iaData.ganador) {
      total++;
      const systemWinner =
        simulation.localWin >= simulation.awayWin ? "Local" : "Visitante";
      if (systemWinner === iaData.ganador) {
        matches++;
        notes.push("Ganador coincide.");
      } else {
        notes.push("Ganador no coincide.");
      }
    }

    return {
      total,
      matches,
      score: total ? Math.round((matches / total) * 100) : 0,
      notes,
    };
  }, [iaData, expectedTotalCards, expectedTotalCorners, monteCarloResult, localStats.bttsPct, visitStats.bttsPct, simulation.localWin, simulation.awayWin]);

  function handleRowChange(
    side: TeamCondition,
    index: number,
    field: keyof TeamRow,
    value: string
  ) {
    const setter = side === "local" ? setLocalRows : setVisitRows;
    const current = side === "local" ? localRows : visitRows;

   const next = [...current];
const row = { ...next[index] };

if (field === "gf") row.gf = value === "" ? "" : Number(value);
else if (field === "gc") row.gc = value === "" ? "" : Number(value);
else if (field === "ownCorners") row.ownCorners = value === "" ? "" : Number(value);
else if (field === "oppCorners") row.oppCorners = value === "" ? "" : Number(value);
else if (field === "ownYellow") row.ownYellow = value === "" ? "" : Number(value);
else if (field === "oppYellow") row.oppYellow = value === "" ? "" : Number(value);
else if (field === "ownRed") row.ownRed = value === "" ? "" : Number(value);
else if (field === "oppRed") row.oppRed = value === "" ? "" : Number(value);
else if (field === "rival") row.rival = value;
else if (field === "fecha") row.fecha = value;
else if (field === "estado") row.estado = value as ResultState;

if ((field === "gf" || field === "gc") && row.gf !== "" && row.gc !== "") {
  row.estado = resultFromGoals(Number(row.gf), Number(row.gc));
}

next[index] = row;
setter(next);
  }

  function saveReferee() {
    if (!refInfo.nombre.trim() || refInfo.promedioAmarillas === "") return;
    const next: SavedReferee[] = [
      {
        nombre: refInfo.nombre.trim(),
        promedioAmarillas: Number(refInfo.promedioAmarillas),
        promedioRojas: Number(refInfo.promedioRojas || 0),
      },
      ...savedRefs.filter((r) => r.nombre.toLowerCase() !== refInfo.nombre.trim().toLowerCase()),
    ];
    setSavedRefs(next);
    localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(next));
  }

  function loadRefereeByName(nombre: string) {
    const found = savedRefs.find((r) => r.nombre === nombre);
    if (!found) return;
    setRefInfo({
      nombre: found.nombre,
      promedioAmarillas: found.promedioAmarillas,
      promedioRojas: found.promedioRojas,
    });
  }

  function saveTeam(side: TeamCondition) {
    const teamName = side === "local" ? matchInfo.local.trim() : matchInfo.visitante.trim();
    const rows = side === "local" ? localRows : visitRows;
    if (!teamName) return;

    const pack: SavedTeamPack = {
      teamName,
      condition: side,
      rows,
      savedAt: new Date().toISOString(),
    };

    const next = [
      pack,
      ...savedTeams.filter(
        (t) => !(t.teamName.toLowerCase() === teamName.toLowerCase() && t.condition === side)
      ),
    ];

    setSavedTeams(next);
    localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(next));
  }

  function loadTeamByName(side: TeamCondition, teamName: string) {
    const found = savedTeams.find((t) => t.teamName === teamName && t.condition === side);
    if (!found) return;

    if (side === "local") {
      setMatchInfo((prev) => ({ ...prev, local: found.teamName }));
      setLocalRows(found.rows);
    } else {
      setMatchInfo((prev) => ({ ...prev, visitante: found.teamName }));
      setVisitRows(found.rows);
    }
  }

  function exportMatchToFile() {
    const local = matchInfo.local.trim();
    const visitante = matchInfo.visitante.trim();

    if (!local || !visitante) {
      alert("Debes escribir el equipo local y visitante antes de exportar.");
      return;
    }

    const fechaArchivo = formatDateForFile(matchInfo.fecha);
    const baseName = `${local} vs ${visitante} - ${fechaArchivo}`;
    const safeName = `${slugifyFileName(baseName)}.json`;

    const data: ExportedMatchFile = {
      version: 1,
      kind: "match",
      fileName: baseName,
      savedAt: new Date().toISOString(),
      payload: {
        matchInfo,
        refInfo,
        localRows,
        visitRows,
        odds,
        parlay,
        monteCarloResult,
      },
    };

    downloadJsonFile(data, safeName);
  }

  function exportTeamToFile(side: TeamCondition) {
    const teamName = side === "local" ? matchInfo.local.trim() : matchInfo.visitante.trim();
    const rows = side === "local" ? localRows : visitRows;

    if (!teamName) {
      alert(`Debes escribir el nombre del equipo ${side}.`);
      return;
    }

    if (!hasUsefulRows(rows)) {
      alert(`No hay datos del equipo ${teamName} para exportar.`);
      return;
    }

    const fechaArchivo = formatDateForFile(matchInfo.fecha);
    const baseName = `${teamName} - ${side} - ${fechaArchivo}`;
    const safeName = `${slugifyFileName(baseName)}.json`;

    const data: ExportedTeamFile = {
      version: 1,
      kind: "team",
      teamName,
      condition: side,
      liga: matchInfo.liga ?? "",
      rows,
      savedAt: new Date().toISOString(),
    };

    downloadJsonFile(data, safeName);
  }

  function exportRefereeToFile() {
    if (!refInfo.nombre.trim()) {
      alert("Debes escribir el nombre del árbitro antes de exportar.");
      return;
    }

    const baseName = `${refInfo.nombre} - arbitro`;
    const safeName = `${slugifyFileName(baseName)}.json`;

    const data: ExportedRefereeFile = {
      version: 1,
      kind: "referee",
      refInfo,
      savedAt: new Date().toISOString(),
    };

    downloadJsonFile(data, safeName);
  }

  function readJsonFromFile(
    event: React.ChangeEvent<HTMLInputElement>,
    onSuccess: (data: unknown) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        onSuccess(parsed);
      } catch (error) {
        console.error(error);
        alert("El archivo no es un JSON válido.");
      } finally {
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      alert("No se pudo leer el archivo.");
      event.target.value = "";
    };

    reader.readAsText(file);
  }

  function importMatchFromFile(event: React.ChangeEvent<HTMLInputElement>) {
    readJsonFromFile(event, (raw) => {
      const parsed = raw as ExportedMatchFile;

      if (!parsed || parsed.kind !== "match" || !parsed.payload) {
        alert("Este archivo no corresponde a un partido completo.");
        return;
      }

      setMatchInfo(
        parsed.payload.matchInfo ?? {
          local: "",
          visitante: "",
          liga: "",
          fecha: "",
          posicionLocal: "",
          posicionVisitante: "",
          etapa: "Liga",
          tipo: "Liga",
          globalScore: "",
          notas: "",
        }
      );

      setRefInfo(
        parsed.payload.refInfo ?? {
          nombre: "",
          promedioAmarillas: "",
          promedioRojas: "",
        }
      );

      setLocalRows(parsed.payload.localRows ?? createEmptyRows());
      setVisitRows(parsed.payload.visitRows ?? createEmptyRows());
      setOdds(
        parsed.payload.odds ?? {
          local: "",
          empate: "",
          visitante: "",
          over25: "",
          btts: "",
          corners85: "",
          cards45: "",
        }
      );
      setParlay(parsed.payload.parlay ?? []);
      setMonteCarloResult(parsed.payload.monteCarloResult ?? null);

      setSelectedSavedLocal(parsed.payload.matchInfo?.local ?? "");
      setSelectedSavedVisit(parsed.payload.matchInfo?.visitante ?? "");
      setSelectedSavedRef(parsed.payload.refInfo?.nombre ?? "");

      alert("Partido importado correctamente.");
    });
  }

  function importTeamFromFile(
    event: React.ChangeEvent<HTMLInputElement>,
    side: TeamCondition
  ) {
    readJsonFromFile(event, (raw) => {
      const parsed = raw as ExportedTeamFile;

      if (!parsed || parsed.kind !== "team" || !Array.isArray(parsed.rows)) {
        alert("Este archivo no corresponde a un equipo.");
        return;
      }

      if (side === "local") {
        setMatchInfo((prev) => ({ ...prev, local: parsed.teamName, liga: prev.liga || parsed.liga || "" }));
        setLocalRows(parsed.rows);
        setSelectedSavedLocal(parsed.teamName);
      } else {
        setMatchInfo((prev) => ({ ...prev, visitante: parsed.teamName, liga: prev.liga || parsed.liga || "" }));
        setVisitRows(parsed.rows);
        setSelectedSavedVisit(parsed.teamName);
      }

      alert(`Equipo ${parsed.teamName} importado como ${side}.`);
    });
  }

  function importRefereeFromFile(event: React.ChangeEvent<HTMLInputElement>) {
    readJsonFromFile(event, (raw) => {
      const parsed = raw as ExportedRefereeFile;

      if (!parsed || parsed.kind !== "referee" || !parsed.refInfo) {
        alert("Este archivo no corresponde a un árbitro.");
        return;
      }

      setRefInfo(parsed.refInfo);
      setSelectedSavedRef(parsed.refInfo.nombre ?? "");
      alert("Árbitro importado correctamente.");
    });
  }

function resetAllForNewMatch() {
  setMatchInfo({
    local: "",
    visitante: "",
    liga: "",
    fecha: "",
    posicionLocal: "",
    posicionVisitante: "",
    etapa: "Liga",
    tipo: "Liga",
    globalScore: "",
    notas: "",
  });

  setRefInfo({
    nombre: "",
    promedioAmarillas: "",
    promedioRojas: "",
  });

  setLocalRows(createEmptyRows());
  setVisitRows(createEmptyRows());

  setSelectedSavedLocal("");
  setSelectedSavedVisit("");
  setSelectedSavedRef("");

  setOdds({
    local: "",
    empate: "",
    visitante: "",
    over15: "",
    over25: "",
    under35: "",
    under45: "",
    btts: "",
    corners75: "",
    corners85: "",
    corners105: "",
    cards35: "",
    cards45: "",
    cards55: "",
  });

  setIaData({
    tarjetas: "",
    corners: "",
    btts: "",
    ganador: "",
  });

  setH2hData({
    totalMatches: "",
    localWins: "",
    draws: "",
    visitWins: "",
    over25Hits: "",
    bttsHits: "",
    cornersHighHits: "",
    cardsLowHits: "",
  });

  setParlay([]);
  setMonteCarloResult(null);
  localStorage.removeItem(MATCH_DRAFT_KEY);
}
  
  function runMonteCarlo() {
    let localWin = 0;
    let draw = 0;
    let awayWin = 0;
    let over15 = 0;
    let over25 = 0;
    let btts = 0;
    const scoreMap = new Map<string, number>();

    const randomPoisson = (lambda: number) => {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= Math.random();
      } while (p > L);
      return k - 1;
    };

    for (let i = 0; i < monteCarloRuns; i++) {
      const l = randomPoisson(expectedGoalsLocal);
      const v = randomPoisson(expectedGoalsVisit);

      if (l > v) localWin++;
      else if (l === v) draw++;
      else awayWin++;

      if (l + v > 1.5) over15++;
      if (l + v > 2.5) over25++;
      if (l > 0 && v > 0) btts++;

      const key = `${l}-${v}`;
      scoreMap.set(key, (scoreMap.get(key) || 0) + 1);
    }

    const topScores = [...scoreMap.entries()]
      .map(([score, count]) => ({ score, prob: (count / monteCarloRuns) * 100 }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 5);

    setMonteCarloResult({
      localWin: (localWin / monteCarloRuns) * 100,
      draw: (draw / monteCarloRuns) * 100,
      awayWin: (awayWin / monteCarloRuns) * 100,
      over15: (over15 / monteCarloRuns) * 100,
      over25: (over25 / monteCarloRuns) * 100,
      btts: (btts / monteCarloRuns) * 100,
      topScores,
    });
  }

  function addPickToParlay(pick: PickItem) {
    if (parlay.some((p) => p.id === pick.id)) return;
    setParlay((prev) => [...prev, pick]);
  }

  function removePickFromParlay(id: string) {
    setParlay((prev) => prev.filter((p) => p.id !== id));
  }

  function correlationLabel() {
    const ids = parlay.map((p) => p.id);
    const goalGroup = ids.filter((id) => ["over15", "over25", "under35", "btts"].includes(id)).length;
    if (goalGroup >= 3) return "Alta";
    if (goalGroup === 2) return "Media";
    return "Baja";
  }

  const parlayRisk =
    parlay.length === 0
      ? "Sin parlay"
      : parlay.some((p) => p.riesgo === "Alto")
      ? "Alto"
      : parlay.some((p) => p.riesgo === "Medio")
      ? "Medio"
      : "Bajo";

  const avgParlayProb =
    parlay.length === 0 ? 0 : avg(parlay.map((p) => p.probabilidad));


  function renderTeamTable(
    title: string,
    side: TeamCondition,
    rows: TeamRow[],
    savedValue: string,
    setSavedValue: (v: string) => void
  ) {
    const teamName = side === "local" ? matchInfo.local : matchInfo.visitante;
    const colors = getSectionColors(side);

    return (
      <section className={`rounded-2xl border p-4 shadow-sm ${colors.wrapper}`}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className={`text-xl font-bold ${colors.header}`}>{title}</h2>
<p className={`text-sm ${colors.sub}`}>Últimos 10 partidos en condición {side}.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => saveTeam(side)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${colors.button}`}
            >
              Guardar equipo
            </button>
            <button
              type="button"
              onClick={() => exportTeamToFile(side)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${colors.button}`}
            >
              Exportar {side}
            </button>
            <button
              type="button"
              onClick={() =>
                side === "local"
                  ? importLocalInputRef.current?.click()
                  : importVisitInputRef.current?.click()
              }
              className="rounded-xl border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Importar {side}
            </button>
            <select
              value={savedValue}
              onChange={(e) => {
                setSavedValue(e.target.value);
                loadTeamByName(side, e.target.value);
              }}
              className="rounded-xl border text-slate-900 px-3 py-2 text-sm"
            >
              <option value="">Cargar guardado</option>
              {savedTeams
                .filter((t) => t.condition === side)
                .map((t, i) => (
                  <option key={`${t.teamName}-${t.condition}-${i}`} value={t.teamName}>
                    {t.teamName}
                  </option>
                ))}
            </select>
            <button
              onClick={() => (side === "local" ? setLocalRows(createEmptyRows()) : setVisitRows(createEmptyRows()))}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Limpiar
            </button>
          </div>
        </div>


        {side === "local" ? (
          <input
            ref={importLocalInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => importTeamFromFile(e, "local")}
          />
        ) : (
          <input
            ref={importVisitInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => importTeamFromFile(e, "visitante")}
          />
        )}

        <div className={`mb-3 rounded-xl border p-3 text-sm ${colors.badge}`}>
          Equipo actual: <span className="font-semibold">{teamName || "Sin nombre"}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1250px] w-full border-collapse text-sm">
            <thead>
              <tr className={colors.tableHead}>
                {[
                  "Rival",
                  "Fecha",
                  "GF",
                  "GC",
                  "Total",
                  "BTTS",
                  "Corners propio",
                  "Corners rival",
                  "TA. propio",
                  "TA. rival",
                  "TR propio",
                  "TR rival",
                  "Estado",
                ].map((h) => (
                  <th key={h} className="border border-slate-200 px-2 py-2 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={`odd:bg-white ${colors.rowAlt}`}>
                <td className="border border-slate-200 p-1">
                <div>
                      <input
                             list={`${side}-rivals-${i}`}
      value={row.rival}
      onChange={(e) => handleRowChange(side, i, "rival", e.target.value)}
      className={`w-full rounded-md px-2 py-1 font-semibold ${colors.input}`}
    />
    <datalist id={`${side}-rivals-${i}`}>
      {getOpponentSuggestions(localRows, visitRows, row.rival).map((name) => (
        <option key={`${side}-${i}-${name}`} value={name} />
      ))}
    </datalist>
  </div>
</td>
              <td className="border border-slate-200 p-1">
  <input
    type="text"
    placeholder="MM/DD/AA"
    value={row.fecha}
    onChange={(e) => handleRowChange(side, i, "fecha", e.target.value)}
    className={`w-[110px] rounded-md border-2 px-2 py-1 bg-white text-slate-900 font-semibold placeholder:text-slate-400 ${colors.input}`}
  />
</td>
                  <td className="border border-slate-200 p-1">
                    <input
                      type="number"
                      value={row.gf}
                      onChange={(e) => handleRowChange(side, i, "gf", e.target.value)}
                      className={`w-16 rounded-md px-2 py-1 font-semibold ${colors.input}`}
                    />
                  </td>
                  <td className="border border-slate-200 p-1">
                    <input
                      type="number"
                      value={row.gc}
                      onChange={(e) => handleRowChange(side, i, "gc", e.target.value)}
                      className={`w-16 rounded-md px-2 py-1 font-semibold ${colors.input}`}
                    />
                  </td>
                  <td className="border border-slate-200 px-2 py-1 font-semibold text-slate-700">
                    {getTotalGoals(row)}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 font-semibold text-slate-700">
                    {getBTTS(row) ? "Sí" : "No"}
                  </td>
                  <td className="border border-slate-200 p-1">
                    <input
                      type="number"
                      value={row.ownCorners}
                      onChange={(e) => handleRowChange(side, i, "ownCorners", e.target.value)}
                      className={`w-16 rounded-md px-2 py-1 font-semibold ${colors.input}`}
                    />
                  </td>
                  <td className="border border-slate-200 p-1">
                    <input
                      type="number"
                      value={row.oppCorners}
                      onChange={(e) => handleRowChange(side, i, "oppCorners", e.target.value)}
                      className={`w-16 rounded-md px-2 py-1 font-semibold ${colors.input}`}
                    />
                  </td>
                  <td className="border border-slate-200 p-1">
                    <input
                      type="number"
                      value={row.ownYellow}
                      onChange={(e) => handleRowChange(side, i, "ownYellow", e.target.value)}
                      className={`w-16 rounded-md px-2 py-1 font-semibold ${colors.input}`}
                    />
                  </td>
                  <td className="border border-slate-200 p-1">
                    <input
                      type="number"
                      value={row.oppYellow}
                      onChange={(e) => handleRowChange(side, i, "oppYellow", e.target.value)}
                      className={`w-16 rounded-md px-2 py-1 font-semibold ${colors.input}`}
                    />
                  </td>
                  <td className="border border-slate-200 p-1">
                    <input
                      type="number"
                      value={row.ownRed}
                      onChange={(e) => handleRowChange(side, i, "ownRed", e.target.value)}
                      className={`w-16 rounded-md px-2 py-1 font-semibold ${colors.input}`}
                    />
                  </td>
                  <td className="border border-slate-200 p-1">
                    <input
                      type="number"
                      value={row.oppRed}
                      onChange={(e) => handleRowChange(side, i, "oppRed", e.target.value)}
                      className={`w-16 rounded-md px-2 py-1 font-semibold ${colors.input}`}
                    />
                  </td>
                  <td className="border border-slate-200 px-2 py-1">
  {row.estado ? (
    <span
      className={`inline-flex min-w-[36px] justify-center rounded-lg px-2 py-1 text-xs font-bold ${getResultBadgeClass(
        row.estado
      )}`}
    >
      {row.estado}
    </span>
  ) : (
    "-"
  )}
</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function StatCard({
    title,
    value,
    subtitle,
  }: {
    title: string;
    value: string;
    subtitle?: string;
  }) {


    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white shadow-lg">
          <h1 className="text-3xl font-extrabold">Analizador de Apuestas KAL</h1>
          <p className="mt-2 text-sm text-emerald-50">
            Base para llenar datos de partidos
          </p>
        </section>

<div className="flex justify-end">
  <button
    onClick={resetAllForNewMatch}
    className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800"
  >
    Nuevo partido / Limpiar todo
  </button>
</div>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-slate-800">1. Información del partido</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                placeholder="Equipo local"
                value={matchInfo.local}
                onChange={(e) => setMatchInfo((p) => ({ ...p, local: e.target.value }))}
                className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950 placeholder:text-slate-500 focus:border-slate-700 focus:ring-2 focus:ring-slate-300"
              />
              <input
                placeholder="Equipo visitante"
                value={matchInfo.visitante}
                onChange={(e) => setMatchInfo((p) => ({ ...p, visitante: e.target.value }))}
                className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950 placeholder:text-slate-500 focus:border-slate-700 focus:ring-2 focus:ring-slate-300"
              />
              <input
                placeholder="Liga / torneo"
                value={matchInfo.liga}
                onChange={(e) => setMatchInfo((p) => ({ ...p, liga: e.target.value }))}
                className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950 placeholder:text-slate-500 focus:border-slate-700 focus:ring-2 focus:ring-slate-300"
              />

              

              <input
                type="number"
                placeholder="Posición local"
                value={matchInfo.posicionLocal}
                onChange={(e) =>
                  setMatchInfo((p) => ({
                    ...p,
                    posicionLocal: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
                className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950 placeholder:text-slate-500 focus:border-slate-700 focus:ring-2 focus:ring-slate-300"
              />
              <input
                type="number"
                placeholder="Posición visitante"
                value={matchInfo.posicionVisitante}
                onChange={(e) =>
                  setMatchInfo((p) => ({
                    ...p,
                    posicionVisitante: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
                className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950 placeholder:text-slate-500 focus:border-slate-700 focus:ring-2 focus:ring-slate-300"
              />
              <select
                value={matchInfo.etapa}
                onChange={(e) => setMatchInfo((p) => ({ ...p, etapa: e.target.value as MatchStage }))}
                className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950 placeholder:text-slate-500 focus:border-slate-700 focus:ring-2 focus:ring-slate-300"
              >
                {STAGES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                value={matchInfo.tipo}
                onChange={(e) => setMatchInfo((p) => ({ ...p, tipo: e.target.value as MatchType }))}
                className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950 placeholder:text-slate-500 focus:border-slate-700 focus:ring-2 focus:ring-slate-300"
              >
                {TYPES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>

                    <div>
  <label className="block text-sm font-semibold text-slate-700 mb-1">
    Fecha del partido
  </label>
  <input
    type="date"
    value={matchInfo.fecha}
    onChange={(e) =>
      setMatchInfo((prev) => ({ ...prev, fecha: e.target.value }))
    }
    className="w-full rounded-xl border-2 border-slate-400 px-3 py-2 bg-white text-slate-900 font-semibold focus:border-slate-600 focus:ring-2 focus:ring-slate-300"
  />
</div>

              <input
                placeholder="Marcador global (opcional)"
                value={matchInfo.globalScore}
                onChange={(e) => setMatchInfo((p) => ({ ...p, globalScore: e.target.value }))}
                className="rounded-xl border text-slate-900 px-3 py-2 md:col-span-2"
              />
              <textarea
                placeholder="Notas del partido"
                value={matchInfo.notas}
                onChange={(e) => setMatchInfo((p) => ({ ...p, notas: e.target.value }))}
                className="min-h-[90px] rounded-xl border text-slate-900 px-3 py-2 md:col-span-2"
              />
            </div>
          </div>

          

                 <div className={`rounded-2xl border p-4 shadow-sm ${getRefColors().wrapper}`}>
                 <h2 className={`mb-4 text-xl font-bold ${getRefColors().header}`}>2. Árbitro</h2>
            <div className="space-y-3">
              <input
  list="saved-referees"
  placeholder="Nombre del árbitro"
  value={refInfo.nombre}
  onChange={(e) => setRefInfo((p) => ({ ...p, nombre: e.target.value }))}
  className={`w-full rounded-xl border-2 px-3 py-2 font-semibold ${getRefColors().input}`}
/>
<datalist id="saved-referees">
  {savedRefs.map((r) => (
    <option key={r.nombre} value={r.nombre} />
  ))}
</datalist>
              <input
                type="number"
                placeholder="Promedio amarillas"
                value={refInfo.promedioAmarillas}
                onChange={(e) =>
                  setRefInfo((p) => ({
                    ...p,
                    promedioAmarillas: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
                className={`w-full rounded-xl px-3 py-2 font-semibold ${getRefColors().input}`}
              />
              <input
                type="number"
                placeholder="Promedio rojas"
                value={refInfo.promedioRojas}
                onChange={(e) =>
                  setRefInfo((p) => ({
                    ...p,
                    promedioRojas: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
                className={`w-full rounded-xl px-3 py-2 font-semibold ${getRefColors().input}`}
              />

              <div className="flex gap-2">
                <button
                  onClick={saveReferee}
                  className={`flex-1 rounded-xl px-4 py-2 font-semibold ${getRefColors().button}`}
                >
                  Guardar árbitro
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportRefereeToFile}
                  className="rounded-xl bg-yellow-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-yellow-600"
                >
                  Exportar árbitro
                </button>

                <button
                  type="button"
                  onClick={() => importRefInputRef.current?.click()}
                  className="rounded-xl border border-yellow-500 bg-white px-4 py-2 text-sm font-semibold text-yellow-900 hover:bg-yellow-50"
                >
                  Importar árbitro
                </button>

                <input
                  ref={importRefInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={importRefereeFromFile}
                />
              </div>

              <select
                value={selectedSavedRef}
                onChange={(e) => {
                  setSelectedSavedRef(e.target.value);
                  loadRefereeByName(e.target.value);
                }}
                className={`w-full rounded-xl px-3 py-2 font-semibold ${getRefColors().input}`}
              >
                <option value="">Cargar árbitro guardado</option>
                {savedRefs.map((r) => (
                  <option key={r.nombre} value={r.nombre}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
          <h2 className="text-xl font-bold text-emerald-800">Partido completo</h2>
          <p className="mt-1 text-sm text-emerald-700">
            Exporta o importa todo el partido en un archivo JSON.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={exportMatchToFile}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Exportar partido
            </button>

            <button
              onClick={() => importMatchInputRef.current?.click()}
              className="rounded-xl border border-emerald-500 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Importar partido
            </button>

            <input
              ref={importMatchInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={importMatchFromFile}
            />
          </div>
        </section>

        {renderTeamTable("3. Datos del local", "local", localRows, selectedSavedLocal, setSelectedSavedLocal)}
        {renderTeamTable("4. Datos del visitante", "visitante", visitRows, selectedSavedVisit, setSelectedSavedVisit)}

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-6">
            <section className="w-full rounded-2xl border-2 border-indigo-500 bg-indigo-50 p-5 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-indigo-900">Datos manuales IA</h2>
                  <p className="text-sm text-indigo-800">Llena aquí lo que ves antes del partido en SofaScore u otra IA.</p>
                </div>
                <span className={`inline-flex rounded-xl px-3 py-1 text-sm font-bold ${iaValidation.score >= 75 ? "bg-emerald-100 text-emerald-800" : iaValidation.score >= 50 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`}>
                  Coincidencia: {iaValidation.score}%
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <input type="number" placeholder="Tarjetas IA" value={iaData.tarjetas} onChange={(e) => setIaData((p) => ({ ...p, tarjetas: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border text-indigo-700 bg-white px-3 py-2 text-sm shadow-sm hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <input type="number" placeholder="Corners IA" value={iaData.corners} onChange={(e) => setIaData((p) => ({ ...p, corners: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border text-indigo-700 bg-white px-3 py-2 text-sm shadow-sm hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <select value={iaData.btts} onChange={(e) => setIaData((p) => ({ ...p, btts: e.target.value as "Si" | "No" }))} className="rounded-xl border text-indigo-700 bg-white px-3 py-2 text-sm shadow-sm hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">BTTS IA</option>
                  <option value="Si">Sí</option>
                  <option value="No">No</option>
                </select>
                <select value={iaData.ganador} onChange={(e) => setIaData((p) => ({ ...p, ganador: e.target.value as "Local" | "Visitante" }))} className="rounded-xl border text-indigo-700 bg-white px-3 py-2 text-sm shadow-sm hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">Ganador IA</option>
                  <option value="Local">Local</option>
                  <option value="Visitante">Visitante</option>
                </select>
              </div>
                                     <div className="mt-4 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-base font-bold text-indigo-900">
                  Comparación IA vs Sistema
                </h3>

                <div className="grid grid-cols-[1.2fr_1fr_1fr] border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">
                  <span>Mercado</span>
                  <span className="text-center">IA</span>
                  <span className="text-center">Sistema</span>
                </div>

                <div className="mt-2 space-y-2 text-sm text-slate-800">
                  {iaData.tarjetas !== "" && (
                    <div className="grid grid-cols-[1.2fr_1fr_1fr] items-center rounded-lg bg-slate-50 px-3 py-2">
                      <span>Tarjetas</span>
                      <span className="text-center font-semibold">{iaData.tarjetas}</span>
                      <span className="text-center font-semibold">
                        {expectedTotalCards.toFixed(1)}
                      </span>
                    </div>
                  )}

                  {iaData.corners !== "" && (
                    <div className="grid grid-cols-[1.2fr_1fr_1fr] items-center rounded-lg bg-slate-50 px-3 py-2">
                      <span>Corners</span>
                      <span className="text-center font-semibold">{iaData.corners}</span>
                      <span className="text-center font-semibold">
                        {expectedTotalCorners.toFixed(1)}
                      </span>
                    </div>
                  )}

                  {iaData.btts && (
                    <div className="grid grid-cols-[1.2fr_1fr_1fr] items-center rounded-lg bg-slate-50 px-3 py-2">
                      <span>BTTS</span>
                      <span className="text-center font-semibold">{iaData.btts}</span>
                      <span className="text-center font-semibold">
                        {(monteCarloResult?.btts ??
                          (localStats.bttsPct + visitStats.bttsPct) / 2) >= 55
                          ? "Sí"
                          : "No"}
                      </span>
                    </div>
                  )}

                  {iaData.ganador && (
                    <div className="grid grid-cols-[1.2fr_1fr_1fr] items-center rounded-lg bg-slate-50 px-3 py-2">
                      <span>Ganador</span>
                      <span className="text-center font-semibold">{iaData.ganador}</span>
                      <span className="text-center font-semibold">
                        {simulation.localWin >= simulation.awayWin ? "Local" : "Visitante"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-slate-800">Cuotas de la casa (entrada manual)</h2>
              <p className="mb-4 text-sm text-slate-600">Primero llena las líneas reales de la casa. Más abajo verás el edge calculado automáticamente.</p>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                <input type="number" placeholder="Gana local" value={odds.local} onChange={(e) => setOdds((p) => ({ ...p, local: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="Empate" value={odds.empate} onChange={(e) => setOdds((p) => ({ ...p, empate: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="Gana visitante" value={odds.visitante} onChange={(e) => setOdds((p) => ({ ...p, visitante: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="+1.5 goles" value={odds.over15} onChange={(e) => setOdds((p) => ({ ...p, over15: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="+2.5 goles" value={odds.over25} onChange={(e) => setOdds((p) => ({ ...p, over25: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="-3.5 goles" value={odds.under35} onChange={(e) => setOdds((p) => ({ ...p, under35: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="-4.5 goles" value={odds.under45} onChange={(e) => setOdds((p) => ({ ...p, under45: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="BTTS Sí" value={odds.btts} onChange={(e) => setOdds((p) => ({ ...p, btts: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="+7.5 corners" value={odds.corners75} onChange={(e) => setOdds((p) => ({ ...p, corners75: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="+8.5 corners" value={odds.corners85} onChange={(e) => setOdds((p) => ({ ...p, corners85: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="-10.5 corners" value={odds.corners105} onChange={(e) => setOdds((p) => ({ ...p, corners105: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="+3.5 tarjetas" value={odds.cards35} onChange={(e) => setOdds((p) => ({ ...p, cards35: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="+4.5 tarjetas" value={odds.cards45} onChange={(e) => setOdds((p) => ({ ...p, cards45: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="+5.5 tarjetas" value={odds.cards55} onChange={(e) => setOdds((p) => ({ ...p, cards55: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
              </div>



                     <section className="grid gap-8 xl:grid-cols-2">
          <div className="xl:col-span-5 rounded-4xl border border-slate-900 bg-white p-9 shadow-sm">
            <h2 className="mb-5 text-xl font-bold text-slate-900">Líneas de la casa y edge real</h2>
            <p className="mb-5 text-sm text-slate-900">
              Mete la línea real de la casa. La app compara probabilidad del sistema vs probabilidad implícita y te marca si hay margen real.
            </p>

            <div className="grid gap-2 grid-cols-2 md:grid-cols-2 xl:grid-cols-2">
              
              <input type="number" placeholder="Gana local" value={odds.local} onChange={(e) => setOdds((p) => ({ ...p, local: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-5 py-5 font-semibold text-slate-950" />
              <input type="number" placeholder="Empate" value={odds.empate} onChange={(e) => setOdds((p) => ({ ...p, empate: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
              <input type="number" placeholder="Gana visitante" value={odds.visitante} onChange={(e) => setOdds((p) => ({ ...p, visitante: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
           
              <input type="number" placeholder="+1.5 goles" value={odds.over15} onChange={(e) => setOdds((p) => ({ ...p, over15: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
              <input type="number" placeholder="+2.5 goles" value={odds.over25} onChange={(e) => setOdds((p) => ({ ...p, over25: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
              <input type="number" placeholder="-3.5 goles" value={odds.under35} onChange={(e) => setOdds((p) => ({ ...p, under35: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
              <input type="number" placeholder="-4.5 goles" value={odds.under45} onChange={(e) => setOdds((p) => ({ ...p, under45: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />

              <input type="number" placeholder="BTTS Sí" value={odds.btts} onChange={(e) => setOdds((p) => ({ ...p, btts: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
              <input type="number" placeholder="+7.5 corners" value={odds.corners75} onChange={(e) => setOdds((p) => ({ ...p, corners75: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
              <input type="number" placeholder="+8.5 corners" value={odds.corners85} onChange={(e) => setOdds((p) => ({ ...p, corners85: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
              <input type="number" placeholder="-10.5 corners" value={odds.corners105} onChange={(e) => setOdds((p) => ({ ...p, corners105: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />

              <input type="number" placeholder="+3.5 tarjetas" value={odds.cards35} onChange={(e) => setOdds((p) => ({ ...p, cards35: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
              <input type="number" placeholder="+4.5 tarjetas" value={odds.cards45} onChange={(e) => setOdds((p) => ({ ...p, cards45: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
              <input type="number" placeholder="+5.5 tarjetas" value={odds.cards55} onChange={(e) => setOdds((p) => ({ ...p, cards55: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950" />
            </div>
   <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Aquí importan más el <b>edge</b> y el tipo de partido que el nombre del equipo.
              </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-[860px] w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left text-slate-700">
                    <th className="border px-3 py-2">Mercado</th>
                    <th className="border px-3 py-2">Sistema</th>
                    <th className="border px-3 py-2">Casa</th>
                    <th className="border px-3 py-2">Edge</th>
                    <th className="border px-3 py-2">Lectura</th>
                  </tr>
                </thead>
                <tbody>
                  {valueBets.map((row) => (
                    <tr key={row.mercado} className="odd:bg-white even:bg-slate-50">
                      <td className="border px-3 py-2 font-semibold text-slate-900">{row.mercado}</td>
                      <td className="border px-3 py-2 text-slate-900">{formatPct(row.sistema)}</td>
                      <td className="border px-3 py-2 text-slate-900">{row.casa ? formatPct(row.casa) : "-"}</td>
                      <td className="border px-3 py-2 text-slate-900 font-bold">{row.edge.toFixed(1)}%</td>
                      <td className="border px-3 py-2">
                        <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${getEdgeBadge(row.edge)}`}>
                          {getEdgeLabel(row.edge)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-1">
              <div className="rounded-4xl border border-emerald-500 bg-emerald-50 p-6">
                <h3 className="font-bold text-emerald-800">Value bets fuertes</h3>
                <div className="mt-3 space-y-2 text-sm text-emerald-900">
                  {strongValueBets.length ? strongValueBets.slice(0, 6).map((item) => (
                    <p key={item.mercado}>
                      • <b>{item.mercado}</b> — edge {item.edge.toFixed(1)}%
                    </p>
                  )) : <p>• Aún no hay mercados con edge fuerte.</p>}
                </div>
              </div>
              <div className={`rounded-2xl border p-4 ${noBetZone.active ? "border-rose-300 bg-rose-50" : "border-blue-200 bg-blue-50"}`}>
                <h3 className={`font-bold ${noBetZone.active ? "text-rose-800" : "text-blue-800"}`}>Bloque de decisión</h3>
                <p className={`mt-2 text-sm ${noBetZone.active ? "text-rose-900" : "text-blue-900"}`}>
                  {noBetZone.active ? "NO APOSTAR fuerte este partido." : "No está bloqueado; aún así apuesta solo si hay edge."}
                </p>
                <div className="mt-3 space-y-1 text-sm">
                  {noBetZone.reasons.length ? noBetZone.reasons.map((reason, i) => <p key={i}>• {reason}</p>) : <p>• No hay bloqueos fuertes automáticos.</p>}
                </div>
              </div>
            </div>
          </div>

        </section>

            </section>

            <section className="rounded-2xl border-2 border-violet-400 bg-violet-50 p-4 shadow-sm">
              <h2 className="text-xl font-bold text-violet-900">H2H manual</h2>
              <p className="mt-1 text-sm text-violet-800">Llena aquí el cara a cara previo que ves en SofaScore. No reemplaza el análisis, pero sí ayuda a validar.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <input type="number" placeholder="Total H2H" value={h2hData.totalMatches} onChange={(e) => setH2hData((p) => ({ ...p, totalMatches: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-violet-300 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="Victorias local" value={h2hData.localWins} onChange={(e) => setH2hData((p) => ({ ...p, localWins: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-violet-300 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="Empates" value={h2hData.draws} onChange={(e) => setH2hData((p) => ({ ...p, draws: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-violet-300 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="Victorias visita" value={h2hData.visitWins} onChange={(e) => setH2hData((p) => ({ ...p, visitWins: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-violet-300 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="Hits over 2.5" value={h2hData.over25Hits} onChange={(e) => setH2hData((p) => ({ ...p, over25Hits: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-violet-300 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="Hits BTTS" value={h2hData.bttsHits} onChange={(e) => setH2hData((p) => ({ ...p, bttsHits: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-violet-300 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="Hits corners altos" value={h2hData.cornersHighHits} onChange={(e) => setH2hData((p) => ({ ...p, cornersHighHits: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-violet-300 bg-white px-3 py-2 font-semibold text-slate-950" />
                <input type="number" placeholder="Hits tarjetas bajas" value={h2hData.cardsLowHits} onChange={(e) => setH2hData((p) => ({ ...p, cardsLowHits: e.target.value === "" ? "" : Number(e.target.value) }))} className="rounded-xl border-2 border-violet-300 bg-white px-3 py-2 font-semibold text-slate-950" />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-violet-200 bg-white p-3 text-sm text-slate-800">
                  <p>Total H2H: <b>{h2hSummary.totalMatches || 0}</b></p>
                  <p>Local: <b>{formatPct(h2hSummary.localWinPct)}</b></p>
                  <p>Empate: <b>{formatPct(h2hSummary.drawPct)}</b></p>
                  <p>Visita: <b>{formatPct(h2hSummary.visitWinPct)}</b></p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-white p-3 text-sm text-slate-800">
                  <p>Over 2.5: <b>{formatPct(h2hSummary.over25Pct)}</b></p>
                  <p>BTTS: <b>{formatPct(h2hSummary.bttsPct)}</b></p>
                  <p>Corners altos: <b>{formatPct(h2hSummary.cornersHighPct)}</b></p>
                  <p>Tarjetas bajas: <b>{formatPct(h2hSummary.cardsLowPct)}</b></p>
                </div>
                <div className={`rounded-xl border p-3 text-sm ${h2hReading.color}`}>
                  <p className="font-semibold">Lectura H2H</p>
                  <p className="mt-1 text-lg font-extrabold">{h2hReading.label}</p>
                  <div className="mt-2 space-y-1">
                    {h2hReading.notes.length ? h2hReading.notes.map((note, i) => <p key={i}>• {note}</p>) : <p>• Sin lectura fuerte.</p>}
                  </div>
                  <p className="mt-2 font-semibold">{h2hFavoriteValidation}</p>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800">Entrada manual completa</h3>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p>✅ Partido, árbitro, local y visitante</p>
                <p>✅ IA previa</p>
                <p>✅ Cuotas de la casa</p>
                <p>✅ H2H manual</p>
                <p className="text-slate-500">Después de llenar esto, baja a revisar resultados y picks.</p>
              </div>
            </div>
            <div className={`rounded-2xl border p-4 shadow-sm ${h2hReading.color}`}>
              <h3 className="text-lg font-bold">Resumen rápido H2H</h3>
              <p className="mt-2 text-sm">{h2hFavoriteValidation}</p>
            </div>
          </div>
 
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Goles esperados local" value={expectedGoalsLocal.toFixed(2)} subtitle="Simulación base" />
          <StatCard title="Goles esperados visitante" value={expectedGoalsVisit.toFixed(2)} subtitle="Simulación base" />
          <StatCard title="Corners esperados" value={expectedTotalCorners.toFixed(2)} subtitle="Media ponderada" />
          <StatCard title="Tarjetas esperadas" value={expectedTotalCards.toFixed(2)} subtitle="Equipos + árbitro" />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Recencia local"
            value={localStats.freshnessLabel}
            subtitle={`Recientes: ${localStats.recentCount} · Viejos: ${localStats.staleCount} · Edad media: ${localStats.averageAgeDays.toFixed(0)} días`}
          />
          <StatCard
            title="Recencia visitante"
            value={visitStats.freshnessLabel}
            subtitle={`Recientes: ${visitStats.recentCount} · Viejos: ${visitStats.staleCount} · Edad media: ${visitStats.averageAgeDays.toFixed(0)} días`}
          />
          <StatCard
            title="Lectura +1.5 goles"
            value={expectedTotalGoals >= 2.45 ? "Jugable" : expectedTotalGoals >= 2.2 ? "Justa" : "Evitar"}
            subtitle="No fuerces esta línea solo porque un equipo anota mucho"
          />
          <StatCard
            title="Lectura +2.5 goles"
            value={expectedTotalGoals >= 2.75 ? "Jugable" : expectedTotalGoals >= 2.45 ? "Exigente" : "Evitar"}
            subtitle="Solo para partidos realmente abiertos"
          />
        </section>

        {(localStats.staleCount > 0 || visitStats.staleCount > 0) ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
            <h2 className="text-lg font-bold text-amber-900">Alerta de recencia</h2>
            <p className="mt-1 text-sm text-amber-800">
              Estás mezclando partidos viejos. Cuando metes juegos de más de 5 a 6 meses, la lectura puede engañarte aunque el equipo siga pareciendo goleador.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-amber-900">
              <div className="rounded-xl border border-amber-300 bg-white p-3">
                <p className="font-semibold">{matchInfo.local || "Local"}</p>
                <p>Partidos viejos: <b>{localStats.staleCount}</b></p>
                <p>Muy viejos (+7 meses): <b>{localStats.veryOldCount}</b></p>
              </div>
              <div className="rounded-xl border border-amber-300 bg-white p-3">
                <p className="font-semibold">{matchInfo.visitante || "Visitante"}</p>
                <p>Partidos viejos: <b>{visitStats.staleCount}</b></p>
                <p>Muy viejos (+7 meses): <b>{visitStats.veryOldCount}</b></p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-slate-800">5-10. Resumen estadístico</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <h3 className="mb-3 font-bold text-slate-700">Local</h3>
                <div className="space-y-1 text-sm text-slate-700">
                  <p>GF promedio: <b>{localStats.gfAvg.toFixed(2)}</b></p>
                  <p>GC promedio: <b>{localStats.gcAvg.toFixed(2)}</b></p>
                  <p>Total goles promedio: <b>{localStats.totalGoalsAvg.toFixed(2)}</b></p>
                  <p>Over 1.5: <b>{formatPct(localStats.over15Pct)}</b></p>
                  <p>Over 2.5: <b>{formatPct(localStats.over25Pct)}</b></p>
                  <p>Under 3.5: <b>{formatPct(localStats.under35Pct)}</b></p>
                  <p>BTTS: <b>{formatPct(localStats.bttsPct)}</b></p>
                  <p>Corners promedio: <b>{localStats.totalCornersAvg.toFixed(2)}</b></p>
                  <p>Tarjetas promedio: <b>{localStats.totalYellowAvg.toFixed(2)}</b></p>
                  <p>G / E / P: <b>{formatPct(localStats.winPct)}</b> / <b>{formatPct(localStats.drawPct)}</b> / <b>{formatPct(localStats.lossPct)}</b></p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <h3 className="mb-3 font-bold text-slate-700">Visitante</h3>
                <div className="space-y-1 text-sm text-slate-700">
                  <p>GF promedio: <b>{visitStats.gfAvg.toFixed(2)}</b></p>
                  <p>GC promedio: <b>{visitStats.gcAvg.toFixed(2)}</b></p>
                  <p>Total goles promedio: <b>{visitStats.totalGoalsAvg.toFixed(2)}</b></p>
                  <p>Over 1.5: <b>{formatPct(visitStats.over15Pct)}</b></p>
                  <p>Over 2.5: <b>{formatPct(visitStats.over25Pct)}</b></p>
                  <p>Under 3.5: <b>{formatPct(visitStats.under35Pct)}</b></p>
                  <p>BTTS: <b>{formatPct(visitStats.bttsPct)}</b></p>
                  <p>Corners promedio: <b>{visitStats.totalCornersAvg.toFixed(2)}</b></p>
                  <p>Tarjetas promedio: <b>{visitStats.totalYellowAvg.toFixed(2)}</b></p>
                  <p>G / E / P: <b>{formatPct(visitStats.winPct)}</b> / <b>{formatPct(visitStats.drawPct)}</b> / <b>{formatPct(visitStats.lossPct)}</b></p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`rounded-2xl border p-4 shadow-sm ${trapAlert.color}`}>
              <h3 className="text-lg font-bold">13. Alerta</h3>
              <p className="mt-1 text-2xl font-extrabold">{trapAlert.label}</p>
              <div className="mt-3 space-y-1 text-sm">
                {trapAlert.reasons.length ? (
                  trapAlert.reasons.map((r, i) => <p key={i}>• {r}</p>)
                ) : (
                  <p>• El partido luce estable según los datos cargados.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800">14. Volatilidad</h3>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">{volatilityLabel}</p>
              <p className="mt-1 text-sm text-slate-500">Score: {volatilityScore.toFixed(1)}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800">11-12. Ponderación</h3>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p>Local goles simple vs ponderado: <b>{localStats.totalGoalsAvg.toFixed(2)}</b> / <b>{localStats.totalGoalsWeighted.toFixed(2)}</b></p>
                <p>Visitante goles simple vs ponderado: <b>{visitStats.totalGoalsAvg.toFixed(2)}</b> / <b>{visitStats.totalGoalsWeighted.toFixed(2)}</b></p>
                <p>Diferencia local: <b>{normalVsWeightedDiff.goalsLocal.toFixed(2)}</b></p>
                <p>Diferencia visitante: <b>{normalVsWeightedDiff.goalsVisit.toFixed(2)}</b></p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-slate-800">Lectura final del partido</h2>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Semáforo</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{finalReading.semaforo}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Tipo de partido</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{finalReading.tipo}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Dominancia</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{dominanceInfo.level}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Recomendación</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{finalReading.recomendacion}</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Razones</p>
              <div className="mt-2 space-y-1">
                {finalReading.razones.map((reason, i) => <p key={i}>• {reason}</p>)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
              <h3 className="text-lg font-bold text-violet-900">Comparación real de rivales</h3>
              <div className="mt-3 space-y-1 text-sm text-violet-900">
                <p>Rivales en común: <b>{commonAnalysis.total}</b></p>
                <p>Mejor local: <b>{commonAnalysis.localBetter}</b></p>
                <p>Mejor visitante: <b>{commonAnalysis.visitBetter}</b></p>
                <p>Parejos: <b>{commonAnalysis.parejos}</b></p>
              </div>
              <p className="mt-3 text-sm text-violet-800">{commonAnalysis.resumen}</p>
            </div>

            <div className={`rounded-2xl border p-4 shadow-sm ${noBetZone.active ? "border-rose-300 bg-rose-50" : "border-emerald-300 bg-emerald-50"}`}>
              <h3 className={`text-lg font-bold ${noBetZone.active ? "text-rose-900" : "text-emerald-900"}`}>Zona de apuesta</h3>
              <p className={`mt-2 text-2xl font-extrabold ${noBetZone.active ? "text-rose-700" : "text-emerald-700"}`}>
                {noBetZone.active ? "NO APOSTAR" : "APUESTA SELECTIVA"}
              </p>
              <div className="mt-3 space-y-1 text-sm">
                {noBetZone.reasons.length ? noBetZone.reasons.map((reason, i) => <p key={i}>• {reason}</p>) : <p>• Sin bloqueo fuerte.</p>}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-slate-800">15. Simulación general</h2>
            <div className="space-y-2 text-sm text-slate-700">
              <p>Local gana: <b>{formatPct(simulation.localWin)}</b></p>
              <p>Empate: <b>{formatPct(simulation.draw)}</b></p>
              <p>Visitante gana: <b>{formatPct(simulation.awayWin)}</b></p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-slate-800">16. Marcadores probables</h2>
            <div className="space-y-2 text-sm text-slate-700">
              {simulation.topScores.map((s) => (
                <p key={s.score}>
                  {s.score}: <b>{formatPct(s.prob)}</b>
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-slate-800">17. Monte Carlo</h2>
            <div className="flex gap-2">
              <input
                type="number"
                value={monteCarloRuns}
                onChange={(e) => setMonteCarloRuns(Number(e.target.value) || 5000)}
                className="w-32 rounded-xl border-2 border-slate-500 bg-white px-3 py-2 font-semibold text-slate-950 focus:border-slate-700 focus:ring-2 focus:ring-slate-300"
              />
              <button
                onClick={runMonteCarlo}
                className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
              >
                Ejecutar
              </button>
            </div>

            {monteCarloResult ? (
              <div className="mt-4 space-y-1 text-sm text-slate-700">
                <p>Local gana: <b>{formatPct(monteCarloResult.localWin)}</b></p>
                <p>Empate: <b>{formatPct(monteCarloResult.draw)}</b></p>
                <p>Visitante gana: <b>{formatPct(monteCarloResult.awayWin)}</b></p>
                <p>Más de 1.5: <b>{formatPct(monteCarloResult.over15)}</b></p>
                <p>Más de 2.5: <b>{formatPct(monteCarloResult.over25)}</b></p>
                <p>BTTS Sí: <b>{formatPct(monteCarloResult.btts)}</b></p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Sin ejecutar todavía.</p>
            )}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-slate-800">18. Mejores probabilidades y picks</h2>

            {bestPicks.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {bestPicks.map((pick) => (
                  <div
  key={pick.id}
  className={`rounded-2xl border p-4 ${
    pick.mercado.toLowerCase().includes("corner")
      ? "border-blue-200 bg-blue-50"
      : pick.mercado.toLowerCase().includes("tarjeta")
      ? "border-yellow-200 bg-yellow-50"
      : "border-emerald-200 bg-emerald-50"
  }`}
>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-emerald-800">{pick.mercado}</p>
                        <p className="mt-1 text-sm text-emerald-700">
                          Probabilidad: <b>{formatPct(pick.probabilidad)}</b>
                        </p>
                        <p className="text-sm text-emerald-700">Riesgo: <b>{pick.riesgo}</b></p>
                        <p className="mt-2 text-sm text-emerald-700">{pick.motivo}</p>
                      </div>
                      <button
                        onClick={() => addPickToParlay(pick)}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        + Parlay
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Todavía no hay mercados suficientemente fuertes.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-slate-800">19. Mercados descartados</h2>
            <div className="space-y-2 text-sm text-slate-700">
              {discardedMarkets.length ? (
                discardedMarkets.map((m, i) => <p key={i}>• {m}</p>)
              ) : (
                <p>• No hay descartes fuertes por ahora.</p>
              )}
            </div>
          </div>
        </section>

                         <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-slate-800">Parlay Builder</h2>
            <div className="space-y-3">
              {parlay.length ? (
                parlay.map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="font-semibold text-slate-800">{p.mercado}</p>
                    <p className="text-sm text-slate-600">{formatPct(p.probabilidad)} · Riesgo {p.riesgo}</p>
                    <button
                      onClick={() => removePickFromParlay(p.id)}
                      className="mt-2 text-sm font-semibold text-rose-600 hover:text-rose-700"
                    >
                      Quitar
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No has agregado picks todavía.</p>
              )}

              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <p>Correlación: <b>{correlationLabel()}</b></p>
                <p>Riesgo total: <b>{parlayRisk}</b></p>
                <p>Confianza media: <b>{formatPct(avgParlayProb)}</b></p>
              </div>
            </div>
          </div>        

        <section className="rounded-2xl border-2 border-violet-500 bg-violet-100 p-4 shadow-sm">
  <h2 className="text-xl font-bold text-violet-950">Rivales en común</h2>
  <p className="mt-1 text-sm text-violet-800">
    Esto ayuda a comparar cómo rindieron ambos equipos frente a los mismos rivales.
  </p>

  <div className="mt-4 overflow-x-auto">
    <table className="min-w-[760px] w-full text-sm">
      <thead>
        <tr className="bg-violet-300 text-left text-violet-950">
          <th className="border border-violet-500 px-3 py-2">Rival</th>
          <th className="border border-violet-500 px-3 py-2">Local</th>
          <th className="border border-violet-500 px-3 py-2">Visitante</th>
          <th className="border border-violet-500 px-3 py-2">Lectura</th>
        </tr>
      </thead>
      <tbody>

        {commonOpponents.length > 0 ? (
          commonOpponents.map((item, i) => {
            const localDiff = item.localGF - item.localGC;
            const visitDiff = item.visitGF - item.visitGC;

            let lectura = "Parejo";
            let lecturaClass = "text-slate-900";

            if (localDiff > visitDiff) {
              lectura = "Ventaja local";
              lecturaClass = "text-blue-800 font-bold";
            } else if (visitDiff > localDiff) {
              lectura = "Ventaja visitante";
              lecturaClass = "text-red-800 font-bold";
            }

            return (
              <tr key={`${item.rival}-${i}`} className="odd:bg-white even:bg-violet-50">
                <td className="border border-violet-400 px-3 py-2 font-bold text-violet-950">
                  {item.rival}
                </td>
                <td className="border border-violet-400 bg-white px-3 py-2 font-semibold text-slate-900">
                  {item.localGF}-{item.localGC}
                </td>
                <td className="border border-violet-400 bg-white px-3 py-2 font-semibold text-slate-900">
                  {item.visitGF}-{item.visitGC}
                </td>
                <td className={`border border-violet-400 bg-white px-3 py-2 ${lecturaClass}`}>
                  {lectura}
                </td>
              </tr>
            );
          })
        ) : (
          <tr>
            <td
              colSpan={4}
              className="border border-violet-400 bg-white px-3 py-4 text-center font-medium text-violet-900"
            >
              Aún no hay rivales en común detectados.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</section>

<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
  <h2 className="mb-4 text-xl font-bold text-slate-800">Perfil por equipo</h2>

  <div className="grid gap-4 md:grid-cols-2">
    <div className="rounded-2xl border-2 border-blue-400 bg-blue-50 p-4">
      <h3 className="text-lg font-bold text-blue-900">
        {matchInfo.local || "Equipo local"}
      </h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-semibold text-blue-900">Goles</p>
          <span className={`inline-flex rounded-lg px-2 py-1 text-sm font-bold ${getProfileBadgeClass(localProfile.goles)}`}>
            {localProfile.goles}
          </span>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-blue-900">BTTS</p>
          <span className={`inline-flex rounded-lg px-2 py-1 text-sm font-bold ${getProfileBadgeClass(localProfile.btts)}`}>
            {localProfile.btts}
          </span>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-blue-900">Corners</p>
          <span className={`inline-flex rounded-lg px-2 py-1 text-sm font-bold ${getProfileBadgeClass(localProfile.corners)}`}>
            {localProfile.corners}
          </span>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-blue-900">Tarjetas</p>
          <span className={`inline-flex rounded-lg px-2 py-1 text-sm font-bold ${getProfileBadgeClass(localProfile.tarjetas)}`}>
            {localProfile.tarjetas}
          </span>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-blue-900">Estabilidad</p>
          <span className="inline-flex rounded-lg border border-blue-300 bg-white px-2 py-1 text-sm font-bold text-blue-900">
            {localProfile.estabilidad}
          </span>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-blue-900">Estilo</p>
          <span className="inline-flex rounded-lg border border-blue-300 bg-white px-2 py-1 text-sm font-bold text-blue-900">
            {localProfile.estilo}
          </span>
        </div>
      </div>
    </div>

    <div className="rounded-2xl border-2 border-red-400 bg-red-50 p-4">
      <h3 className="text-lg font-bold text-red-900">
        {matchInfo.visitante || "Equipo visitante"}
      </h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-semibold text-red-900">Goles</p>
          <span className={`inline-flex rounded-lg px-2 py-1 text-sm font-bold ${getProfileBadgeClass(visitProfile.goles)}`}>
            {visitProfile.goles}
          </span>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-red-900">BTTS</p>
          <span className={`inline-flex rounded-lg px-2 py-1 text-sm font-bold ${getProfileBadgeClass(visitProfile.btts)}`}>
            {visitProfile.btts}
          </span>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-red-900">Corners</p>
          <span className={`inline-flex rounded-lg px-2 py-1 text-sm font-bold ${getProfileBadgeClass(visitProfile.corners)}`}>
            {visitProfile.corners}
          </span>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-red-900">Tarjetas</p>
          <span className={`inline-flex rounded-lg px-2 py-1 text-sm font-bold ${getProfileBadgeClass(visitProfile.tarjetas)}`}>
            {visitProfile.tarjetas}
          </span>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-red-900">Estabilidad</p>
          <span className="inline-flex rounded-lg border border-red-300 bg-white px-2 py-1 text-sm font-bold text-red-900">
            {visitProfile.estabilidad}
          </span>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-red-900">Estilo</p>
          <span className="inline-flex rounded-lg border border-red-300 bg-white px-2 py-1 text-sm font-bold text-red-900">
            {visitProfile.estilo}
          </span>
        </div>
      </div>
    </div>
  </div>
</section>


<section className="rounded-2xl border border-purple-200 bg-white p-4 shadow-sm">
  <h2 className="text-xl font-bold text-purple-700">Sistema DIOS</h2>

  <div className="mt-3 space-y-2 text-sm text-slate-700">
    <p>Riesgo total: <b>{resultadoDios.riesgo}</b></p>
    <p>Veredicto: <b>{resultadoDios.veredicto}</b></p>
    <p>Trampas: <b>{resultadoDios.tieneTrampa ? "Sí" : "No"}</b></p>
    <p>Mezcla mala: <b>{resultadoDios.malaCombinacion ? "Sí" : "No"}</b></p>
  </div>

  <div className="mt-4">
    <h3 className="font-semibold text-slate-800">Sugerencias</h3>
    <div className="mt-2 space-y-1 text-sm text-slate-700">
      {sugerencias.length ? (
        sugerencias.map((s, i) => <p key={i}>• {s}</p>)
      ) : (
        <p>• Sin sugerencias por ahora.</p>
      )}
    </div>
  </div>
</section>

<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
  <h2 className="mb-4 text-xl font-bold text-slate-800">Lectura combinada del partido</h2>

  <div className="grid gap-4 md:grid-cols-3">
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">Cruce de estilos</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{combinedReading.cruce}</p>
    </div>

    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">Lectura de goles</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{combinedReading.lecturaGoles}</p>
    </div>

    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">Lectura de BTTS</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{combinedReading.lecturaBTTS}</p>
    </div>

    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">Lectura de corners</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{combinedReading.lecturaCorners}</p>
    </div>

    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">Lectura de tarjetas</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{combinedReading.lecturaTarjetas}</p>
    </div>

    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">Riesgo del cruce</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{combinedReading.riesgo}</p>
    </div>
  </div>
</section>



        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-slate-800">Perfil final del partido</h2>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-slate-500">Tipo</p>
              <p className="font-bold">{profile.tipo}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-slate-500">Goles</p>
              <p className="font-bold">{profile.goles}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-slate-500">Tarjetas</p>
              <p className="font-bold">{profile.tarjetas}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-slate-500">Corners</p>
              <p className="font-bold">{profile.corners}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-slate-500">Riesgo</p>
              <p className="font-bold">{profile.riesgo}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}