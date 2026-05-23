// @ts-nocheck
"use client";
import { useState, useEffect, useCallback, useRef } from "react";

// ── UTILS ────────────────────────────────────────────────────────────────────
const makeId = () => Math.random().toString(36).slice(2, 10);
const toNum = (v) => { const n = parseFloat(String(v || "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const impliedProb = (odd) => odd > 1 ? (1 / odd) * 100 : 0;
const fmtMoney = (v) => Number.isFinite(v) ? v.toFixed(2) : "0.00";
const fmtPct = (v) => `${Number.isFinite(v) ? v.toFixed(1) : "0.0"}%`;

function kellyStake(prob, odd, bank) {
  if (!bank || !odd || odd <= 1 || !prob) return null;
  const p = prob / 100;
  const q = 1 - p;
  const b = odd - 1;
  const kelly = (b * p - q) / b;
  if (kelly <= 0) return { pct: 0, amount: 0, label: "❌ Sin value (Kelly negativo)", tier: "none" };
  const frac = Math.min(kelly * 0.5, 0.12);
  const amount = bank * frac;
  const tier = frac >= 0.06 ? "fuerte" : frac >= 0.03 ? "moderado" : frac >= 0.01 ? "minimo" : "none";
  const pctLabel = (frac * 100).toFixed(1);
  return { pct: frac * 100, amount, label: `${pctLabel}% del banco → $${fmtMoney(amount)}`, tier };
}

function valueAndRisk(prob, odd) {
  if (!prob || !odd || odd <= 1) return { value: 0, ev: 0, roi: 0, color: "gray", label: "Sin datos" };
  const implied = impliedProb(odd);
  const value = prob - implied;
  const ev = (prob / 100) * (odd - 1) - (1 - prob / 100);
  const roi = ev * 100;
  const color = value >= 8 ? "green" : value >= 2 ? "yellow" : "red";
  const label = value >= 8 ? "🟢 Value fuerte" : value >= 2 ? "🟡 Value moderado" : "🔴 Sin value / evitar";
  return { value, ev, roi, color, label };
}

// ── STORAGE ──────────────────────────────────────────────────────────────────
const SK = "apuestas_ia_pro_v1";
const BK = "bankroll_ia_pro_v1";
const HK = "historial_ia_pro_v1";
const RK = "review_ia_pro_v2";   // NEW: IA vs Reality reviews

function loadState(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function saveState(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── EMPTY SHAPES ─────────────────────────────────────────────────────────────
const emptyMatch = () => ({ local: "", visitante: "", oddLocal: "", oddDraw: "", oddVisit: "", liga: "", modo: "clubes" });
const emptyPick = () => ({ id: makeId(), mercado: "", linea: "", tipo: "over", confianza: 0, prioridad: "media", justificacion: "", cuotaSugerida: "", cuotaCasa: "", seleccionado: false, value: 0, ev: 0, roi: 0, color: "gray", valueLabel: "Sin datos", kellyAmt: 0, timestamp: new Date().toISOString() });
const emptyBet = () => ({ id: makeId(), fecha: new Date().toISOString().slice(0,10), partido: "", pick: "", mercado: "", stake: "", cuota: "", estado: "pendiente", notas: "" });
const emptyBankroll = () => ({ inicial: "", apuestas: [] });
// NEW: empty review shape
const emptyReview = () => ({
  id: makeId(),
  fecha: new Date().toISOString(),
  partido: "",
  local: "",
  visitante: "",
  liga: "",
  modo: "clubes",
  resumenIA: "",
  pronosticoIA: "",
  picks: [],        // array of { mercado, linea, confianza, tipo, cuotaCasa, resultado: "acierto"|"fallo"|"nulo" }
  resultadoReal: { golesLocal: "", golesVisita: "", notas: "" },
  totalPicks: 0,
  aciertos: 0,
  fallos: 0,
});

// ── FILTROS DE MERCADO ───────────────────────────────────────────────────────
const MARKET_FILTERS = ["Todos📝", "1X2⚔️", "Doble Oportunidad🛠️", "Goles⚽", "Corners⛳", "Tarjetas🟧🟥", "Handicap🌀", "Remates🦿"];
function matchesFilter(pick, filter) {
  if (filter === "Todos") return true;
  const m = (pick.mercado || "").toLowerCase();
  if (filter === "1X2") return m.includes("ganador") || m.includes("1x2") || m.includes("local") || m.includes("visitante") || m.includes("empate");
  if (filter === "Doble Oportunidad") return m.includes("doble") || m.includes("1x") || m.includes("x2") || m.includes("12");
  if (filter === "Goles") return m.includes("gol") || m.includes("btts") || m.includes("ambos marcan") || m.includes("over") || m.includes("under");
  if (filter === "Corners") return m.includes("corner") || m.includes("saque");
  if (filter === "Tarjetas") return m.includes("tarjeta") || m.includes("amarilla") || m.includes("roja");
  if (filter === "Handicap") return m.includes("handicap") || m.includes("hándicap");
  if (filter === "Remates") return m.includes("remate") || m.includes("shot") || m.includes("disparo");
  return true;
}

// ── BANKROLL CALCS ───────────────────────────────────────────────────────────
function betProfit(bet) {
  const s = toNum(bet.stake), o = toNum(bet.cuota);
  if (bet.estado === "ganada") return o > 1 ? s * (o - 1) : 0;
  if (bet.estado === "perdida") return -s;
  return 0;
}
function bankrollStats(bankroll) {
  const inicial = toNum(bankroll.inicial);
  const settled = bankroll.apuestas.filter(b => b.estado === "ganada" || b.estado === "perdida");
  const totalStaked = settled.reduce((s, b) => s + toNum(b.stake), 0);
  const totalProfit = settled.reduce((s, b) => s + betProfit(b), 0);
  const wins = settled.filter(b => b.estado === "ganada").length;
  const losses = settled.filter(b => b.estado === "perdida").length;
  const winRate = settled.length ? (wins / settled.length) * 100 : 0;
  const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
  const currentBank = inicial + totalProfit;
  return { inicial, wins, losses, totalProfit, totalStaked, winRate, roi, currentBank, settledCount: settled.length };
}

// NEW: IA review stats — track record de la IA separado del usuario
function calcIAStats(reviews) {
  const allPicks = reviews.flatMap(r => r.picks || []);
  const settled = allPicks.filter(p => p.resultado === "acierto" || p.resultado === "fallo");
  const aciertos = settled.filter(p => p.resultado === "acierto").length;
  const fallos = settled.filter(p => p.resultado === "fallo").length;
  const winRate = settled.length ? (aciertos / settled.length) * 100 : 0;

  // Calibration: group by confidence bucket, check accuracy
  const buckets = { "65-74": { hits: 0, total: 0 }, "75-84": { hits: 0, total: 0 }, "85+": { hits: 0, total: 0 } };
  settled.forEach(p => {
    const c = p.confianza || 0;
    const key = c >= 85 ? "85+" : c >= 75 ? "75-84" : "65-74";
    buckets[key].total++;
    if (p.resultado === "acierto") buckets[key].hits++;
  });

  // Current streak
  let streak = 0;
  let streakType = "neutral";
  for (const p of [...settled].reverse()) {
    if (streak === 0) { streakType = p.resultado === "acierto" ? "acierto" : "fallo"; streak = 1; }
    else if (p.resultado === streakType) streak++;
    else break;
  }

  // Bias detection: count overs vs unders
  const overs = allPicks.filter(p => (p.tipo || "").toLowerCase() === "over").length;
  const unders = allPicks.filter(p => (p.tipo || "").toLowerCase() === "under").length;
  const biasPct = allPicks.length ? (overs / allPicks.length) * 100 : 50;
  const biasAlert = biasPct >= 80 ? "⚠️ Sesgo alto hacia OVERS" : biasPct <= 20 ? "⚠️ Sesgo alto hacia UNDERS" : null;

  return { aciertos, fallos, winRate, buckets, streak, streakType, biasAlert, totalPicks: settled.length, overs, unders };
}

// ── AI PROMPT BUILDER ────────────────────────────────────────────────────────
function buildAIPrompt(match, mode = "full") {
  const { local, visitante, oddLocal, oddDraw, oddVisit, liga, modo } = match;

  if (mode === "mundial") {
    return `Eres un analista experto en apuestas deportivas de fútbol internacional y mundiales. Eres crítico y conservador.

PARTIDO SELECCIONES: ${local} vs ${visitante}${liga ? ` (${liga})` : ""}
CUOTAS 1X2: Local ${oddLocal || "N/D"} | Empate ${oddDraw || "N/D"} | Visitante ${oddVisit || "N/D"}
CONTEXTO: Partido de selecciones nacionales / Mundial / Eliminatorias

Busca información reciente sobre estas selecciones. Analiza con criterio ESTRICTO considerando:
- Historial en fase de grupos vs eliminatorias directas
- Rendimiento fuera de casa / en cancha neutral
- Estado físico y disponibilidad de jugadores clave (lesiones, sanciones)
- Estilos de juego en competencias internacionales (más defensivos que en ligas)
- Presión psicológica de torneos eliminatorios
- Historial directo entre ambas selecciones
- Los partidos de selecciones tienden a ser más cerrados — considera unders y resultados exactos
- Diferencias de nivel FIFA ranking

Responde ÚNICAMENTE con este JSON puro, sin texto antes ni después, sin backticks:

{"resumen":"contexto breve del partido incluyendo fase del torneo","formaLocal":"forma reciente de ${local} en selección con datos concretos","formaVisitante":"forma reciente de ${visitante} en selección con datos concretos","historialDirecto":"últimos enfrentamientos entre ambas selecciones","picks":[{"mercado":"nombre exacto del mercado","linea":"línea numérica","tipo":"over o under","confianza":72,"prioridad":"alta","justificacion":"razón específica basada en datos de selecciones","cuotaSugerida":"1.75"}],"pronostico":"resultado más probable con razonamiento","alertas":["alerta concreta si aplica"],"perfilPartido":"cerrado","clavesTacticas":"análisis táctico clave para este partido de selecciones"}

REGLAS ESTRICTAS:
- Máximo 5 picks. Los partidos de selecciones son más impredecibles.
- Prioriza unders y mercados de resultados — las selecciones juegan más conservadoras
- Confianza mínima: 65%. Si no llegas, no lo incluyas.
- Justificación debe mencionar datos específicos de selecciones
- Solo el JSON.`;
  }

  if (mode === "full") {
    return `Eres un analista experto en apuestas deportivas de fútbol. Eres crítico y conservador — no generas picks por generar, solo cuando los datos realmente lo justifican.

PARTIDO: ${local} vs ${visitante}${liga ? ` (${liga})` : ""}
CUOTAS 1X2: Local ${oddLocal || "N/D"} | Empate ${oddDraw || "N/D"} | Visitante ${oddVisit || "N/D"}

Busca información reciente sobre estos equipos. Analiza con criterio ESTRICTO:
- Si un equipo tiene pocas anotaciones recientes, NO sugieras overs de goles
- Si los partidos recientes tienen pocos corners, NO sugieras overs de corners
- Un under bien justificado vale más que cinco overs sin base
- Solo sugiere picks donde la diferencia entre tu estimación y la cuota implícita sea real

Responde ÚNICAMENTE con este JSON puro, sin texto antes ni después, sin backticks:

{"resumen":"contexto breve del partido","formaLocal":"forma reciente de ${local} con datos concretos","formaVisitante":"forma reciente de ${visitante} con datos concretos","picks":[{"mercado":"nombre exacto del mercado","linea":"línea numérica","tipo":"over o under","confianza":72,"prioridad":"alta","justificacion":"razón específica basada en datos, menciona si es over o under y por qué","cuotaSugerida":"1.75"}],"pronostico":"resultado más probable con razonamiento","alertas":["alerta concreta si aplica"],"perfilPartido":"abierto"}

REGLAS ESTRICTAS para los picks:
- Máximo 6 picks. Calidad sobre cantidad.
- Equilibra overs y unders según los datos reales — no pongas 5 overs si los equipos son defensivos
- Confianza mínima para incluir un pick: 65%. Si no llegas, no lo incluyas.
- Si el partido tiene perfil defensivo, prioriza unders y resultado exacto
- Justificación debe mencionar datos concretos: "promedio de X goles en últimos 5 partidos"
- Solo el JSON.`;
  }

  return `Analista de value betting. Evalúa si hay value en estos picks.

PARTIDO: ${local} vs ${visitante}
PICKS: ${JSON.stringify(match.picks || [])}

Responde SOLO con este JSON sin texto extra:
{"evaluaciones":[{"id":"id_del_pick","tieneValue":true,"edge":5.2,"recomendacion":"✅ Tiene value","alerta":""}],"mejorPick":"id","advertencia":""}`;
}

// ── TICKET CALCS ─────────────────────────────────────────────────────────────
function calcTicket(picks, monto, esParlay) {
  const sel = picks.filter(p => p.seleccionado && toNum(p.cuotaCasa) > 1);
  if (!sel.length) return { combinada: 0, potencial: 0, probReal: 0, probCasa: 0, value: 0 };
  const combinada = sel.reduce((acc, p) => acc * toNum(p.cuotaCasa), 1);
  const probReal = sel.reduce((acc, p) => acc * (p.confianza / 100), 1) * 100;
  const probCasa = sel.reduce((acc, p) => acc * (impliedProb(toNum(p.cuotaCasa)) / 100), 1) * 100;
  const montoNum = toNum(monto);
  const potencial = esParlay ? montoNum * combinada : sel.reduce((acc, p) => acc + montoNum * toNum(p.cuotaCasa), 0);
  const value = probReal - probCasa;
  return { combinada, potencial, probReal, probCasa, value, count: sel.length };
}

// ── NOTIFICATION COMPONENT ───────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  const bg = type === "success" ? "rgba(5,150,105,.95)" : type === "error" ? "rgba(220,38,38,.95)" : "rgba(99,102,241,.95)";
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: bg, color: "#fff", borderRadius: 14, padding: "14px 20px", fontWeight: 800, fontSize: 14, boxShadow: "0 8px 32px rgba(0,0,0,.4)", display: "flex", alignItems: "center", gap: 10, animation: "slideIn .25s ease" }}>
      {type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️"} {msg}
      <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.7)", cursor: "pointer", fontSize: 16, marginLeft: 4 }}>×</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── STATE ──────────────────────────────────────────────────────────────
  const [match, setMatch] = useState(emptyMatch);
  const [aiStatus, setAiStatus] = useState("idle");
  const [aiResult, setAiResult] = useState(null);
  const [picks, setPicks] = useState([]);
  const [marketFilter, setMarketFilter] = useState("Todos");
  const [ticketStake, setTicketStake] = useState("10");
  const [esParlay, setEsParlay] = useState(true);
  const [bankroll, setBankroll] = useState(() => loadState(BK, emptyBankroll()));
  const [betDraft, setBetDraft] = useState(emptyBet);
  const [historial, setHistorial] = useState(() => loadState(HK, []));
  const [reviews, setReviews] = useState(() => loadState(RK, []));   // NEW
  const [activeTab, setActiveTab] = useState("analisis");
  const [showBankHistory, setShowBankHistory] = useState(false);
  const [verifyingValue, setVerifyingValue] = useState(false);
  const [expertMode, setExpertMode] = useState(false);
  const [dailyLossLimit, setDailyLossLimit] = useState("20");
  const [aiError, setAiError] = useState("");
  const [toast, setToast] = useState(null);                          // NEW: toast notifications
  const [modoMundial, setModoMundial] = useState(false);             // NEW: World Cup mode
  // NEW: Review draft state
  const [reviewDraft, setReviewDraft] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const resultsRef = useRef(null);

  useEffect(() => { saveState(BK, bankroll); }, [bankroll]);
  useEffect(() => { saveState(HK, historial); }, [historial]);
  useEffect(() => { saveState(RK, reviews); }, [reviews]);           // NEW

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type, id: makeId() });
  }, []);

  // ── AI ANALYSIS ────────────────────────────────────────────────────────
  const runAIAnalysis = useCallback(async () => {
    if (!match.local.trim() || !match.visitante.trim()) {
      setAiError("Ingresa ambos equipos para analizar.");
      return;
    }
    setAiStatus("loading");
    setAiError("");
    setAiResult(null);
    setPicks([]);
    try {
      const promptMode = modoMundial ? "mundial" : "full";
      const resp = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 2500,
          useWebSearch: true,
          messages: [{ role: "user", content: buildAIPrompt(match, promptMode) }],
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error?.message || `Error de API (${resp.status})`);

      const finalText = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      if (!finalText) throw new Error("Sin respuesta de texto de la IA");

      let parsed;
      try {
        const cleaned = finalText.replace(/```json|```/g, "").trim();
        const start = cleaned.indexOf("{");
        if (start === -1) throw new Error("no_json");
        let depth = 0, end = -1;
        for (let ci = start; ci < cleaned.length; ci++) {
          if (cleaned[ci] === "{") depth++;
          else if (cleaned[ci] === "}") { depth--; if (depth === 0) { end = ci; break; } }
        }
        if (end === -1) throw new Error("no_json");
        parsed = JSON.parse(cleaned.slice(start, end + 1));
      } catch (_e) {
        throw new Error("La IA no devolvió JSON válido. Intenta de nuevo.");
      }

      setAiResult(parsed);
      const newPicks = (parsed.picks || []).map(p => {
        const conf = clamp(Number(p.confianza) || 50, 0, 100);
        return { ...emptyPick(), id: makeId(), mercado: p.mercado || "", linea: p.linea || "", tipo: p.tipo || "over", confianza: conf, prioridad: p.prioridad || "media", justificacion: p.justificacion || "", cuotaSugerida: p.cuotaSugerida || "", timestamp: new Date().toISOString() };
      });
      setPicks(newPicks);
      setAiStatus("done");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    } catch (err) {
      setAiStatus("error");
      setAiError(String(err.message || "Error desconocido"));
    }
  }, [match, modoMundial]);

  // ── VERIFY VALUE ────────────────────────────────────────────────────────
  const verifyValue = useCallback(async () => {
    const withOdds = picks.filter(p => toNum(p.cuotaCasa) > 1);
    if (!withOdds.length) return;
    setVerifyingValue(true);
    try {
      const resp = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1500,
          useWebSearch: false,
          messages: [{ role: "user", content: buildAIPrompt({ ...match, picks: withOdds.map(p => ({ id: p.id, mercado: p.mercado, linea: p.linea, confianza: p.confianza, cuotaCasa: p.cuotaCasa })) }, "verify") }]
        })
      });
      const data = await resp.json();
      const textBlock = (data.content || []).find((b) => b.type === "text");
      if (!textBlock) throw new Error();
      const rawText = textBlock.text.replace(/```json|```/g, "").trim();
      let vParsed = { evaluaciones: [] };
      try {
        const vStart = rawText.indexOf("{");
        if (vStart >= 0) {
          let vDepth = 0, vEnd = -1;
          for (let ci = vStart; ci < rawText.length; ci++) {
            if (rawText[ci] === "{") vDepth++;
            else if (rawText[ci] === "}") { vDepth--; if (vDepth === 0) { vEnd = ci; break; } }
          }
          if (vEnd > 0) vParsed = JSON.parse(rawText.slice(vStart, vEnd + 1));
        }
      } catch (_e) {}
      const evals = vParsed.evaluaciones || [];
      setPicks(prev => prev.map(p => {
        const ev = evals.find(e => e.id === p.id);
        if (!ev || !p.cuotaCasa) return p;
        const vr = valueAndRisk(p.confianza, toNum(p.cuotaCasa));
        return { ...p, ...vr, recomendacionIA: ev.recomendacion, alertaIA: ev.alerta };
      }));
    } catch {}
    setVerifyingValue(false);
  }, [picks, match]);

  const updatePickOdd = (id, odd) => {
    setPicks(prev => prev.map(p => {
      if (p.id !== id) return p;
      const vr = valueAndRisk(p.confianza, toNum(odd));
      const bank = toNum(bankroll.inicial);
      const stats = bankrollStats(bankroll);
      const kb = bank > 0 ? kellyStake(p.confianza, toNum(odd), stats.currentBank || bank) : null;
      return { ...p, cuotaCasa: odd, ...vr, kellyAmt: kb?.amount || 0, kellyLabel: kb?.label || "" };
    }));
  };

  const togglePickSel = (id) => setPicks(prev => prev.map(p => p.id === id ? { ...p, seleccionado: !p.seleccionado } : p));
  const ticket = calcTicket(picks, ticketStake, esParlay);

  const saveTicket = () => {
    const sel = picks.filter(p => p.seleccionado && toNum(p.cuotaCasa) > 1);
    if (!sel.length) return;
    const entry = {
      id: makeId(),
      fecha: new Date().toISOString(),
      partido: `${match.local} vs ${match.visitante}`,
      local: match.local,
      visitante: match.visitante,
      liga: match.liga,
      modo: modoMundial ? "mundial" : "clubes",
      picks: sel,
      stake: ticketStake,
      esParlay,
      ...ticket,
      estado: "pendiente",
      resumenIA: aiResult?.resumen || "",
      pronosticoIA: aiResult?.pronostico || "",
    };
    setHistorial(prev => [entry, ...prev].slice(0, 50));
    const bets = sel.map(p => ({
      ...emptyBet(),
      id: makeId(),
      partido: `${match.local} vs ${match.visitante}`,
      pick: `${p.mercado} ${p.linea}`,
      mercado: p.tipo,
      stake: esParlay ? ticketStake : (toNum(ticketStake) / sel.length).toFixed(2),
      cuota: p.cuotaCasa,
      estado: "pendiente"
    }));
    setBankroll(prev => ({ ...prev, apuestas: [...bets, ...prev.apuestas] }));
    showToast(`✅ Ticket guardado: ${sel.length} picks`, "success");
  };

  // NEW: Open review modal for a ticket
  const openReviewModal = (ticket) => {
    setReviewDraft({
      ...emptyReview(),
      id: makeId(),
      fecha: new Date().toISOString(),
      partido: ticket.partido,
      local: ticket.local || "",
      visitante: ticket.visitante || "",
      liga: ticket.liga || "",
      modo: ticket.modo || "clubes",
      resumenIA: ticket.resumenIA || "",
      pronosticoIA: ticket.pronosticoIA || "",
      ticketId: ticket.id,
      picks: (ticket.picks || []).map(p => ({
        id: p.id,
        mercado: p.mercado,
        linea: p.linea,
        tipo: p.tipo,
        confianza: p.confianza,
        cuotaCasa: p.cuotaCasa,
        resultado: "pendiente",  // "acierto" | "fallo" | "nulo"
      })),
      resultadoReal: { golesLocal: "", golesVisita: "", notas: "" },
    });
    setShowReviewModal(true);
  };

  // NEW: Save review
  const saveReview = () => {
    if (!reviewDraft) return;
    const aciertos = reviewDraft.picks.filter(p => p.resultado === "acierto").length;
    const fallos = reviewDraft.picks.filter(p => p.resultado === "fallo").length;
    const finalReview = { ...reviewDraft, aciertos, fallos, totalPicks: reviewDraft.picks.length };
    setReviews(prev => [finalReview, ...prev].slice(0, 100));
    setShowReviewModal(false);
    setReviewDraft(null);
    showToast("📊 Review guardado correctamente", "success");
  };

  // ── BANKROLL ───────────────────────────────────────────────────────────
  const addBet = () => {
    if (!betDraft.partido.trim() || !betDraft.pick.trim() || toNum(betDraft.stake) <= 0 || toNum(betDraft.cuota) <= 1) {
      showToast("Completa: partido, pick, monto y cuota > 1", "error"); return;
    }
    setBankroll(prev => ({ ...prev, apuestas: [{ ...betDraft, id: makeId() }, ...prev.apuestas] }));
    setBetDraft(emptyBet());
    showToast("Apuesta registrada", "success");
  };
  const updateBetStatus = (id, estado) => setBankroll(prev => ({ ...prev, apuestas: prev.apuestas.map(b => b.id === id ? { ...b, estado } : b) }));
  const deleteBet = (id) => { if (confirm("¿Eliminar apuesta?")) setBankroll(prev => ({ ...prev, apuestas: prev.apuestas.filter(b => b.id !== id) })); };
  const stats = bankrollStats(bankroll);
  const iaStats = calcIAStats(reviews);   // NEW

  const lastSettled = bankroll.apuestas.filter(b => b.estado === "ganada" || b.estado === "perdida");
  let streak = 0;
  for (const b of lastSettled) { if (b.estado === "perdida") streak++; else break; }

  const today = new Date().toISOString().slice(0, 10);
  const todayLoss = Math.abs(Math.min(0, bankroll.apuestas.filter(b => b.fecha === today && (b.estado === "ganada" || b.estado === "perdida")).reduce((s, b) => s + betProfit(b), 0)));
  const dailyLimitAmt = toNum(bankroll.inicial) * toNum(dailyLossLimit) / 100;
  const dailyExceeded = dailyLimitAmt > 0 && todayLoss >= dailyLimitAmt;

  const clearAll = () => {
    if (!window.confirm("¿Limpiar partido actual? El bankroll e historial se conservan.")) return;
    setMatch(emptyMatch());
    setAiStatus("idle");
    setAiResult(null);
    setPicks([]);
    setAiError("");
    setMarketFilter("Todos");
    setActiveTab("analisis");
    setModoMundial(false);
  };

  const importRef = useRef(null);
  const importData = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result);
        if (data.match) setMatch({ ...emptyMatch(), ...data.match });
        if (Array.isArray(data.picks)) setPicks(data.picks);
        if (data.bankroll) setBankroll({ ...emptyBankroll(), ...data.bankroll });
        if (Array.isArray(data.historial)) setHistorial(data.historial);
        if (Array.isArray(data.reviews)) setReviews(data.reviews);
        if (data.aiResult) { setAiResult(data.aiResult); setAiStatus("done"); }
        else { setAiResult(null); setAiStatus("idle"); }
        setActiveTab("analisis");
        showToast("✅ Datos importados correctamente", "success");
      } catch {
        showToast("❌ Archivo inválido", "error");
      }
    };
    reader.readAsText(file);
  };

  const exportData = () => {
    const data = { match, picks, bankroll, historial, reviews, aiResult, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    const matchName = match.local && match.visitante
      ? `${match.local}_vs_${match.visitante}`.replace(/[^a-zA-Z0-9_áéíóúÁÉÍÓÚüÜñÑ-]/g, "_").slice(0, 50)
      : "apuestas";
    a.download = `${matchName}_${today}.json`; a.click(); URL.revokeObjectURL(url);
  };

  const filteredPicks = picks.filter(p => matchesFilter(p, marketFilter));

  // ── TABS ───────────────────────────────────────────────────────────────
  const tabs = [
    { id: "analisis", label: "🔍 Análisis" },
    { id: "picks", label: "🎯 Picks" },
    { id: "ticket", label: "🧾 Ticket" },
    { id: "bankroll", label: "💼 Bankroll" },
    { id: "historial", label: "📚 Historial" },
    { id: "ia-review", label: "🆚 IA vs Realidad" },  // NEW
    { id: "ia-stats", label: "📈 Stats IA" },            // NEW
  ];

  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#030712", minHeight: "100vh", color: "#f1f5f9" }}>
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,.18), transparent)", pointerEvents: "none", zIndex: 0 }} />

      {/* TOAST */}
      {toast && <Toast key={toast.id} msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* REVIEW MODAL */}
      {showReviewModal && reviewDraft && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#0f172a", border: "1px solid rgba(99,102,241,.3)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#818cf8", textTransform: "uppercase", letterSpacing: ".1em" }}>Post-partido</div>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>🆚 IA dijo vs Realidad</h3>
              </div>
              <button onClick={() => { setShowReviewModal(false); setReviewDraft(null); }} style={{ background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer" }}>×</button>
            </div>

            <div style={{ background: "rgba(99,102,241,.08)", borderRadius: 12, padding: "10px 14px", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: "#a5b4fc", fontSize: 14 }}>{reviewDraft.partido}</div>
              {reviewDraft.pronosticoIA && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>IA predijo: {reviewDraft.pronosticoIA}</div>}
            </div>

            {/* Resultado real */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>Resultado real del partido</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: "#475569", display: "block", marginBottom: 3 }}>{reviewDraft.local || "Local"} (goles)</label>
                  <input type="number" value={reviewDraft.resultadoReal.golesLocal}
                    onChange={e => setReviewDraft(r => ({ ...r, resultadoReal: { ...r.resultadoReal, golesLocal: e.target.value } }))}
                    placeholder="0"
                    style={{ width: "100%", background: "rgba(15,23,42,.8)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#475569", display: "block", marginBottom: 3 }}>{reviewDraft.visitante || "Visitante"} (goles)</label>
                  <input type="number" value={reviewDraft.resultadoReal.golesVisita}
                    onChange={e => setReviewDraft(r => ({ ...r, resultadoReal: { ...r.resultadoReal, golesVisita: e.target.value } }))}
                    placeholder="0"
                    style={{ width: "100%", background: "rgba(15,23,42,.8)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
              <input value={reviewDraft.resultadoReal.notas}
                onChange={e => setReviewDraft(r => ({ ...r, resultadoReal: { ...r.resultadoReal, notas: e.target.value } }))}
                placeholder="Notas adicionales (tarjetas, corners, etc.)"
                style={{ width: "100%", background: "rgba(15,23,42,.8)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Picks evaluation */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 10, textTransform: "uppercase" }}>¿Qué dijo la IA? → ¿Acertó?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {reviewDraft.picks.map((p, i) => (
                  <div key={p.id || i} style={{ background: "rgba(15,23,42,.6)", border: `1px solid ${p.resultado === "acierto" ? "rgba(52,211,153,.3)" : p.resultado === "fallo" ? "rgba(239,68,68,.3)" : "rgba(255,255,255,.07)"}`, borderRadius: 12, padding: "10px 14px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e7ff", marginBottom: 6 }}>
                      {p.mercado} {p.linea} <span style={{ fontSize: 11, color: "#64748b" }}>({p.tipo}) · {p.confianza}% conf.</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["acierto", "fallo", "nulo"].map(r => (
                        <button key={r} onClick={() => setReviewDraft(rd => ({ ...rd, picks: rd.picks.map((pk, j) => j === i ? { ...pk, resultado: r } : pk) }))}
                          style={{ flex: 1, padding: "5px 0", borderRadius: 8, border: `1px solid ${p.resultado === r ? (r === "acierto" ? "rgba(52,211,153,.5)" : r === "fallo" ? "rgba(239,68,68,.5)" : "rgba(148,163,184,.4)") : "rgba(255,255,255,.08)"}`, background: p.resultado === r ? (r === "acierto" ? "rgba(52,211,153,.15)" : r === "fallo" ? "rgba(239,68,68,.15)" : "rgba(148,163,184,.1)") : "transparent", color: p.resultado === r ? (r === "acierto" ? "#34d399" : r === "fallo" ? "#f87171" : "#94a3b8") : "#475569", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                          {r === "acierto" ? "✅ Acertó" : r === "fallo" ? "❌ Falló" : "⬜ Nulo"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={saveReview} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #4f46e5, #7c3aed)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>
              💾 Guardar Review Post-partido
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid rgba(99,102,241,.2)", background: "rgba(3,7,18,.8)", backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 16px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 28 }}>{modoMundial ? "🏆" : "⚽"}</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: "-.02em", color: "#e0e7ff" }}>BetAnalyzer KAL<span style={{ color: "#818cf8" }}>PRO</span>{modoMundial && <span style={{ color: "#fbbf24", fontSize: 12, marginLeft: 6 }}>MUNDIAL</span>}</div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>IA Predictiva · Gestión de Banca</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {/* NEW: Mundial toggle */}
            <button onClick={() => setModoMundial(v => !v)}
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: `1px solid ${modoMundial ? "rgba(251,191,36,.5)" : "rgba(255,255,255,.1)"}`, background: modoMundial ? "rgba(251,191,36,.15)" : "transparent", color: modoMundial ? "#fbbf24" : "#64748b", cursor: "pointer", fontWeight: 700 }}>
              {modoMundial ? "🏆 Mundial ON" : "🏆 Modo Mundial"}
            </button>
            <button onClick={() => setExpertMode(v => !v)}
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: `1px solid ${expertMode ? "rgba(99,102,241,.5)" : "rgba(255,255,255,.1)"}`, background: expertMode ? "rgba(99,102,241,.2)" : "transparent", color: expertMode ? "#a5b4fc" : "#64748b", cursor: "pointer", fontWeight: 700 }}>
              {expertMode ? "🧠 Experto" : "📊 Básico"}
            </button>
            <button onClick={clearAll} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.1)", color: "#f87171", cursor: "pointer", fontWeight: 700 }}>🗑 Nuevo</button>
            <button onClick={() => importRef.current?.click()} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(56,189,248,.3)", background: "rgba(56,189,248,.1)", color: "#7dd3fc", cursor: "pointer", fontWeight: 700 }}>📂 Import</button>
            <button onClick={exportData} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "#64748b", cursor: "pointer", fontWeight: 700 }}>⬇ Export</button>
            <input ref={importRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => importData(e.target.files?.[0] || null)} />
          </div>
        </div>
      </header>

      {/* TABS */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,.06)", background: "rgba(3,7,18,.6)", backdropFilter: "blur(10px)", position: "sticky", top: 64, zIndex: 40 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 16px", display: "flex", gap: 2, overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ padding: "12px 14px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", border: "none", background: "transparent", color: activeTab === t.id ? "#818cf8" : "#475569", cursor: "pointer", borderBottom: `2px solid ${activeTab === t.id ? "#818cf8" : "transparent"}`, transition: "all .15s" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* NEW: Mundial banner */}
      {modoMundial && (
        <div style={{ background: "linear-gradient(90deg, rgba(251,191,36,.12), rgba(245,158,11,.06))", borderBottom: "1px solid rgba(251,191,36,.2)", padding: "8px 16px", textAlign: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#fbbf24" }}>🏆 MODO MUNDIAL ACTIVO — El análisis está optimizado para selecciones nacionales y torneos internacionales</span>
        </div>
      )}

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 80px", position: "relative", zIndex: 1 }}>

        {/* ── TAB: ANÁLISIS ─────────────────────────────────────────────── */}
        {activeTab === "analisis" && (
          <div>
            <section style={{ background: "rgba(30,27,75,.4)", border: `1px solid ${modoMundial ? "rgba(251,191,36,.25)" : "rgba(99,102,241,.2)"}`, borderRadius: 20, padding: 24, marginBottom: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: modoMundial ? "#fbbf24" : "#818cf8", marginBottom: 4 }}>
                  {modoMundial ? "🏆 Datos del Partido — Selecciones" : "⚽ Datos del Partido"}
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>
                  {modoMundial ? "🏆 Registrar Partido de Selecciones" : "⚽ Registrar Partido"}
                </h2>
              </div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {[
                  { key: "local", label: modoMundial ? "🏠 Selección Local" : "🏠 Equipo Local", placeholder: modoMundial ? "Ej: Argentina" : "Ej: Real Madrid" },
                  { key: "visitante", label: modoMundial ? "✈️ Selección Visitante" : "✈️ Equipo Visitante", placeholder: modoMundial ? "Ej: Francia" : "Ej: Barcelona" },
                  { key: "liga", label: modoMundial ? "🏆 Torneo / Fase" : "🏆 Liga / Competición", placeholder: modoMundial ? "Ej: Mundial 2026 — Octavos" : "Ej: La Liga" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>{f.label}</label>
                    <input value={match[f.key]} onChange={e => setMatch(m => ({ ...m, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ width: "100%", background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "10px 12px", color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3,1fr)", marginTop: 12 }}>
                {[
                  { key: "oddLocal", label: "Cuota Local (1)" },
                  { key: "oddDraw", label: "Cuota Empate (X)" },
                  { key: "oddVisit", label: "Cuota Visitante (2)" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>{f.label}</label>
                    <input type="number" step="0.01" value={match[f.key]} onChange={e => setMatch(m => ({ ...m, [f.key]: e.target.value }))}
                      placeholder="1.85"
                      style={{ width: "100%", background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "10px 12px", color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
              {match.oddLocal && match.oddDraw && match.oddVisit && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { label: match.local || "Local", p: impliedProb(toNum(match.oddLocal)), color: "#34d399" },
                    { label: "Empate", p: impliedProb(toNum(match.oddDraw)), color: "#94a3b8" },
                    { label: match.visitante || "Visitante", p: impliedProb(toNum(match.oddVisit)), color: "#f87171" },
                  ].map(x => (
                    <div key={x.label} style={{ background: "rgba(15,23,42,.6)", borderRadius: 10, padding: "6px 12px", fontSize: 12 }}>
                      <span style={{ color: "#64748b" }}>{x.label}: </span>
                      <span style={{ color: x.color, fontWeight: 800 }}>{fmtPct(x.p)}</span>
                      <span style={{ color: "#475569", fontSize: 10 }}> implícita</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <button onClick={runAIAnalysis} disabled={aiStatus === "loading"}
              style={{ width: "100%", padding: "18px 24px", borderRadius: 16, border: "none", background: aiStatus === "loading" ? "rgba(99,102,241,.3)" : modoMundial ? "linear-gradient(135deg, #92400e, #b45309)" : "linear-gradient(135deg, #4f46e5, #7c3aed)", color: "#fff", fontSize: 16, fontWeight: 900, cursor: aiStatus === "loading" ? "not-allowed" : "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all .2s", boxShadow: aiStatus === "loading" ? "none" : modoMundial ? "0 4px 24px rgba(180,83,9,.4)" : "0 4px 24px rgba(99,102,241,.4)" }}>
              {aiStatus === "loading" ? (
                <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span> Analizando con IA + Web Search...</>
              ) : (
                <><span>{modoMundial ? "🏆" : "🤖"}</span> {modoMundial ? "Analizar Selecciones con IA" : "Analizar Partido con IA"}</>
              )}
            </button>

            {aiError && (
              <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, color: "#fca5a5", fontSize: 13 }}>
                ⚠️ {aiError}
              </div>
            )}

            {aiStatus === "done" && aiResult && (
              <div ref={resultsRef}>
                {aiResult.perfilPartido && (
                  <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ background: aiResult.perfilPartido === "abierto" ? "rgba(52,211,153,.15)" : aiResult.perfilPartido === "trampa" ? "rgba(239,68,68,.15)" : aiResult.perfilPartido === "cerrado" ? "rgba(56,189,248,.15)" : "rgba(148,163,184,.15)", border: `1px solid ${aiResult.perfilPartido === "abierto" ? "rgba(52,211,153,.3)" : aiResult.perfilPartido === "trampa" ? "rgba(239,68,68,.3)" : aiResult.perfilPartido === "cerrado" ? "rgba(56,189,248,.3)" : "rgba(148,163,184,.3)"}`, borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 800, color: aiResult.perfilPartido === "abierto" ? "#34d399" : aiResult.perfilPartido === "trampa" ? "#f87171" : aiResult.perfilPartido === "cerrado" ? "#38bdf8" : "#94a3b8" }}>
                      Perfil: {aiResult.perfilPartido}
                    </span>
                    {modoMundial && <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 20, background: "rgba(251,191,36,.1)", color: "#fbbf24", fontWeight: 800, border: "1px solid rgba(251,191,36,.3)" }}>🏆 Selecciones</span>}
                    <span style={{ fontSize: 13, color: "#64748b" }}>{match.local} vs {match.visitante}</span>
                  </div>
                )}

                {aiResult.alertas?.filter(Boolean).length > 0 && (
                  <div style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#fbbf24", marginBottom: 6 }}>⚠️ ALERTAS</div>
                    {aiResult.alertas.map((a, i) => <div key={i} style={{ fontSize: 13, color: "#fde68a", marginBottom: 2 }}>• {a}</div>)}
                  </div>
                )}

                <div style={{ display: "grid", gap: 14, gridTemplateColumns: expertMode ? "1fr 1fr" : "1fr", marginBottom: 16 }}>
                  <div style={{ background: "rgba(30,27,75,.4)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 16, padding: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#818cf8", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".08em" }}>📋 Resumen del Partido</div>
                    <p style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.6, margin: 0 }}>{aiResult.resumen}</p>
                    {/* NEW: historialDirecto for mundial mode */}
                    {modoMundial && aiResult.historialDirecto && (
                      <div style={{ marginTop: 12, background: "rgba(251,191,36,.06)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(251,191,36,.15)" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24", marginBottom: 4 }}>📜 HISTORIAL DIRECTO</div>
                        <p style={{ fontSize: 13, color: "#fde68a", margin: 0, lineHeight: 1.5 }}>{aiResult.historialDirecto}</p>
                      </div>
                    )}
                    {aiResult.pronostico && (
                      <div style={{ marginTop: 12, background: "rgba(99,102,241,.1)", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#818cf8", marginBottom: 4 }}>🎯 PRONÓSTICO IA</div>
                        <p style={{ fontSize: 13, color: "#e0e7ff", margin: 0, lineHeight: 1.5 }}>{aiResult.pronostico}</p>
                      </div>
                    )}
                    {/* NEW: clavesTacticas for mundial mode */}
                    {modoMundial && aiResult.clavesTacticas && (
                      <div style={{ marginTop: 10, background: "rgba(56,189,248,.06)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(56,189,248,.15)" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", marginBottom: 4 }}>⚙️ CLAVES TÁCTICAS</div>
                        <p style={{ fontSize: 13, color: "#bae6fd", margin: 0, lineHeight: 1.5 }}>{aiResult.clavesTacticas}</p>
                      </div>
                    )}
                  </div>
                  {expertMode && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {aiResult.formaLocal && (
                        <div style={{ background: "rgba(52,211,153,.05)", border: "1px solid rgba(52,211,153,.15)", borderRadius: 16, padding: 16, flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#34d399", marginBottom: 6 }}>🏠 {match.local}</div>
                          <p style={{ fontSize: 13, color: "#a7f3d0", margin: 0, lineHeight: 1.5 }}>{aiResult.formaLocal}</p>
                        </div>
                      )}
                      {aiResult.formaVisitante && (
                        <div style={{ background: "rgba(248,113,113,.05)", border: "1px solid rgba(248,113,113,.15)", borderRadius: 16, padding: 16, flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#f87171", marginBottom: 6 }}>✈️ {match.visitante}</div>
                          <p style={{ fontSize: 13, color: "#fecaca", margin: 0, lineHeight: 1.5 }}>{aiResult.formaVisitante}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button onClick={() => setActiveTab("picks")}
                  style={{ width: "100%", padding: "14px", borderRadius: 14, border: "1px solid rgba(99,102,241,.25)", background: "rgba(99,102,241,.15)", color: "#818cf8", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                  🎯 Ver {picks.length} Picks Generados →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: PICKS ─────────────────────────────────────────────────── */}
        {activeTab === "picks" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#818cf8", textTransform: "uppercase", marginBottom: 2 }}>Predicciones IA</div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>🎯 Picks del Partido</h2>
              </div>
              {picks.some(p => toNum(p.cuotaCasa) > 1) && (
                <button onClick={verifyValue} disabled={verifyingValue}
                  style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(99,102,241,.3)", background: "rgba(99,102,241,.1)", color: "#a5b4fc", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  {verifyingValue ? "⚙️ Verificando..." : "🔍 Verificar Value con IA"}
                </button>
              )}
            </div>

            {picks.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Sin picks generados</div>
                <div style={{ fontSize: 13 }}>Ve a "Análisis" e ingresa un partido para comenzar</div>
                <button onClick={() => setActiveTab("analisis")}
                  style={{ marginTop: 16, padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(99,102,241,.3)", background: "rgba(99,102,241,.1)", color: "#818cf8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ← Ir a Análisis
                </button>
              </div>
            )}

            {picks.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {MARKET_FILTERS.map(f => (
                    <button key={f} onClick={() => setMarketFilter(f)}
                      style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${marketFilter === f ? "rgba(99,102,241,.5)" : "rgba(255,255,255,.08)"}`, background: marketFilter === f ? "rgba(99,102,241,.2)" : "transparent", color: marketFilter === f ? "#a5b4fc" : "#475569", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {f}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filteredPicks.map(pick => {
                    const hasOdd = toNum(pick.cuotaCasa) > 1;
                    const vr = hasOdd ? valueAndRisk(pick.confianza, toNum(pick.cuotaCasa)) : null;
                    return (
                      <div key={pick.id} style={{ background: pick.seleccionado ? "rgba(99,102,241,.12)" : "rgba(15,23,42,.6)", border: `1px solid ${pick.seleccionado ? "rgba(99,102,241,.4)" : "rgba(255,255,255,.07)"}`, borderRadius: 16, padding: 16, transition: "all .15s" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                              <span style={{ fontWeight: 900, fontSize: 15, color: "#e0e7ff" }}>{pick.mercado}</span>
                              {pick.linea && <span style={{ fontSize: 12, color: "#94a3b8" }}>({pick.linea})</span>}
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700, ...{ alta: { background: "rgba(52,211,153,.1)", color: "#34d399" }, media: { background: "rgba(245,158,11,.1)", color: "#fbbf24" }, baja: { background: "rgba(148,163,184,.1)", color: "#94a3b8" } }[pick.prioridad] }}>
                                {pick.prioridad}
                              </span>
                              {/* NEW: over/under badge */}
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: pick.tipo === "over" ? "rgba(52,211,153,.08)" : "rgba(56,189,248,.08)", color: pick.tipo === "over" ? "#6ee7b7" : "#7dd3fc", border: `1px solid ${pick.tipo === "over" ? "rgba(52,211,153,.2)" : "rgba(56,189,248,.2)"}` }}>
                                {pick.tipo?.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                              <div style={{ flex: 1, background: "rgba(255,255,255,.06)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pick.confianza}%`, background: pick.confianza >= 75 ? "#34d399" : pick.confianza >= 60 ? "#fbbf24" : "#f87171", borderRadius: 4, transition: "width .5s" }} />
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 800, color: pick.confianza >= 75 ? "#34d399" : pick.confianza >= 60 ? "#fbbf24" : "#f87171", minWidth: 36 }}>{pick.confianza}%</span>
                            </div>
                            {expertMode && pick.justificacion && (
                              <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px", lineHeight: 1.5 }}>{pick.justificacion}</p>
                            )}
                            {hasOdd && vr && (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 800, background: vr.color === "green" ? "rgba(52,211,153,.1)" : vr.color === "yellow" ? "rgba(245,158,11,.1)" : "rgba(239,68,68,.1)", color: vr.color === "green" ? "#34d399" : vr.color === "yellow" ? "#fbbf24" : "#f87171" }}>
                                  {vr.label}
                                </span>
                                {expertMode && <>
                                  <span style={{ fontSize: 11, color: "#475569" }}>EV: <b style={{ color: vr.ev > 0 ? "#34d399" : "#f87171" }}>{vr.ev > 0 ? "+" : ""}{(vr.ev * 100).toFixed(1)}%</b></span>
                                  <span style={{ fontSize: 11, color: "#475569" }}>Edge: <b style={{ color: "#94a3b8" }}>{vr.value.toFixed(1)}pp</b></span>
                                </>}
                                {pick.kellyLabel && <span style={{ fontSize: 11, color: "#a5b4fc" }}>Kelly: {pick.kellyLabel}</span>}
                                {pick.recomendacionIA && <span style={{ fontSize: 11, color: "#94a3b8" }}>{pick.recomendacionIA}</span>}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", minWidth: 120 }}>
                            <div>
                              <div style={{ fontSize: 10, color: "#475569", marginBottom: 3, textAlign: "right" }}>Cuota Casa</div>
                              <input type="number" step="0.01" value={pick.cuotaCasa} onChange={e => updatePickOdd(pick.id, e.target.value)}
                                placeholder={pick.cuotaSugerida || "1.85"}
                                style={{ width: 90, background: "rgba(15,23,42,.8)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "6px 8px", color: "#e2e8f0", fontSize: 13, fontWeight: 700, outline: "none", textAlign: "center" }} />
                            </div>
                            {pick.cuotaSugerida && <div style={{ fontSize: 10, color: "#475569" }}>Mín: {pick.cuotaSugerida}</div>}
                            <button onClick={() => togglePickSel(pick.id)}
                              style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${pick.seleccionado ? "rgba(99,102,241,.5)" : "rgba(255,255,255,.1)"}`, background: pick.seleccionado ? "rgba(99,102,241,.25)" : "transparent", color: pick.seleccionado ? "#a5b4fc" : "#475569", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                              {pick.seleccionado ? "✓ Sel." : "+ Ticket"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {picks.filter(p => p.seleccionado).length > 0 && (
                  <button onClick={() => setActiveTab("ticket")}
                    style={{ width: "100%", marginTop: 16, padding: "14px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #4f46e5, #7c3aed)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 20px rgba(99,102,241,.3)" }}>
                    🧾 Ver Ticket ({picks.filter(p => p.seleccionado).length} picks) →
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── TAB: TICKET ────────────────────────────────────────────────── */}
        {activeTab === "ticket" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#818cf8", textTransform: "uppercase", marginBottom: 2 }}>Apuesta Configurada</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>🧾 Ticket de Apuesta</h2>
            </div>

            {picks.filter(p => p.seleccionado).length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎫</div>
                <div>Sin picks seleccionados. Ve a Picks y selecciona los que quieras apostar.</div>
              </div>
            ) : (
              <>
                <div style={{ background: "rgba(30,27,75,.4)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 16, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>💰 Stake total</label>
                      <input type="number" value={ticketStake} onChange={e => setTicketStake(e.target.value)}
                        style={{ width: "100%", background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "10px 12px", color: "#e2e8f0", fontSize: 15, fontWeight: 800, outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Tipo de apuesta</label>
                      <div style={{ display: "flex", gap: 8, height: 40 }}>
                        {[["Parlay", true], ["Singles", false]].map(([label, val]) => (
                          <button key={label} onClick={() => setEsParlay(val)}
                            style={{ flex: 1, borderRadius: 10, border: `1px solid ${esParlay === val ? "rgba(99,102,241,.4)" : "rgba(255,255,255,.1)"}`, background: esParlay === val ? "rgba(99,102,241,.2)" : "transparent", color: esParlay === val ? "#a5b4fc" : "#475569", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {ticket.count > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
                      {[
                        { label: "Picks", val: ticket.count, color: "#818cf8" },
                        { label: esParlay ? "Cuota combinada" : "Stake/pick", val: esParlay ? ticket.combinada.toFixed(2) : `$${(toNum(ticketStake) / ticket.count).toFixed(2)}`, color: "#e0e7ff" },
                        { label: "Ganancia potencial", val: `$${fmtMoney(ticket.potencial - toNum(ticketStake))}`, color: "#34d399" },
                        { label: "Prob. real est.", val: fmtPct(ticket.probReal), color: "#818cf8" },
                        { label: "Value del ticket", val: ticket.value >= 5 ? "🟢 " + ticket.value.toFixed(1) + "pp" : ticket.value >= 0 ? "🟡 " + ticket.value.toFixed(1) + "pp" : "🔴 " + ticket.value.toFixed(1) + "pp", color: ticket.value >= 5 ? "#34d399" : ticket.value >= 0 ? "#fbbf24" : "#f87171" },
                      ].map(x => (
                        <div key={x.label} style={{ background: "rgba(15,23,42,.4)", borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ fontSize: 10, color: "#475569", marginBottom: 3 }}>{x.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: x.color }}>{x.val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {esParlay && ticket.count > 0 && toNum(bankroll.inicial) > 0 && (() => {
                  const kb = kellyStake(ticket.probReal, ticket.combinada, stats.currentBank);
                  return kb && kb.tier !== "none" ? (
                    <div style={{ background: "rgba(167,139,250,.07)", border: "1px solid rgba(167,139,250,.2)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#a78bfa", marginBottom: 4 }}>🧮 Kelly Criterion</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#e0e7ff" }}>{kb.label}</div>
                    </div>
                  ) : null;
                })()}

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {picks.filter(p => p.seleccionado).map((pick, i) => (
                    <div key={pick.id} style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569", minWidth: 20 }}>#{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#e0e7ff" }}>{pick.mercado} {pick.linea}</div>
                        <div style={{ fontSize: 12, color: "#475569" }}>{match.local} vs {match.visitante} · {pick.confianza}%</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 15, fontWeight: 900, color: "#818cf8" }}>{toNum(pick.cuotaCasa) > 1 ? toNum(pick.cuotaCasa).toFixed(2) : "—"}</div>
                        {pick.valueLabel && <div style={{ fontSize: 10, color: pick.color === "green" ? "#34d399" : pick.color === "yellow" ? "#fbbf24" : "#f87171" }}>{pick.valueLabel}</div>}
                      </div>
                      <button onClick={() => togglePickSel(pick.id)} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "rgba(239,68,68,.15)", color: "#f87171", fontSize: 11, cursor: "pointer" }}>✕</button>
                    </div>
                  ))}
                </div>

                <button onClick={saveTicket} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #059669, #047857)", color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 20px rgba(5,150,105,.3)" }}>
                  💾 Guardar Ticket en Historial
                </button>
              </>
            )}
          </div>
        )}

        {/* ── TAB: BANKROLL ──────────────────────────────────────────────── */}
        {activeTab === "bankroll" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#34d399", textTransform: "uppercase", marginBottom: 2 }}>Gestión de Dinero</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>💼 Bankroll Tracker</h2>
            </div>

            {streak >= 3 && (
              <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 14, color: "#fca5a5", fontSize: 13, fontWeight: 700 }}>
                🚨 {streak >= 5 ? `Llevas ${streak} pérdidas consecutivas. ¡Para ya!` : `${streak} pérdidas seguidas. Considera pausar.`}
              </div>
            )}
            {dailyExceeded && (
              <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 14, color: "#fca5a5", fontSize: 13, fontWeight: 700 }}>
                🚨 Stop-loss diario alcanzado: perdiste ${fmtMoney(todayLoss)} hoy (límite: ${fmtMoney(dailyLimitAmt)})
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Banco actual", val: `$${fmtMoney(stats.currentBank)}`, color: stats.currentBank >= stats.inicial ? "#34d399" : "#f87171" },
                { label: "P&L total", val: `${stats.totalProfit >= 0 ? "+" : ""}$${fmtMoney(stats.totalProfit)}`, color: stats.totalProfit >= 0 ? "#34d399" : "#f87171" },
                { label: "ROI", val: `${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`, color: stats.roi >= 0 ? "#34d399" : "#f87171" },
                { label: "Win Rate", val: fmtPct(stats.winRate), color: "#818cf8" },
                { label: "Ganadas", val: stats.wins, color: "#34d399" },
                { label: "Perdidas", val: stats.losses, color: "#f87171" },
              ].map(x => (
                <div key={x.label} style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "14px 12px" }}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>{x.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: x.color }}>{x.val}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Banco inicial ($)</label>
                  <input type="number" value={bankroll.inicial} onChange={e => setBankroll(b => ({ ...b, inicial: e.target.value }))}
                    placeholder="1000"
                    style={{ width: "100%", background: "rgba(3,7,18,.6)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Stop-loss diario (%)</label>
                  <input type="number" value={dailyLossLimit} onChange={e => setDailyLossLimit(e.target.value)}
                    placeholder="20"
                    style={{ width: "100%", background: "rgba(3,7,18,.6)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
            </div>

            <div style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 12 }}>+ Registrar apuesta manual</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { key: "partido", label: "Partido", placeholder: "Real Madrid vs Barça" },
                  { key: "pick", label: "Pick", placeholder: "Más de 2.5 goles" },
                  { key: "stake", label: "Monto ($)", placeholder: "10", type: "number" },
                  { key: "cuota", label: "Cuota", placeholder: "1.85", type: "number" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 10, color: "#475569", display: "block", marginBottom: 3 }}>{f.label}</label>
                    <input type={f.type || "text"} value={betDraft[f.key]} onChange={e => setBetDraft(b => ({ ...b, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ width: "100%", background: "rgba(3,7,18,.6)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "7px 10px", color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
              <button onClick={addBet} style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 10, border: "none", background: "rgba(99,102,241,.2)", color: "#a5b4fc", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                + Agregar Apuesta
              </button>
            </div>

            <button onClick={() => setShowBankHistory(v => !v)}
              style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", background: "transparent", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📋 Historial de apuestas ({bankroll.apuestas.length})</span>
              <span>{showBankHistory ? "▲" : "▼"}</span>
            </button>

            {showBankHistory && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {bankroll.apuestas.length === 0 && <div style={{ textAlign: "center", color: "#475569", padding: 20, fontSize: 13 }}>Sin apuestas registradas</div>}
                {bankroll.apuestas.slice(0, 30).map(bet => (
                  <div key={bet.id} style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e7ff" }}>{bet.partido}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{bet.pick} · ${bet.stake} @ {bet.cuota}</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{bet.fecha}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {bet.estado === "pendiente" && (
                          <>
                            <button onClick={() => updateBetStatus(bet.id, "ganada")} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "rgba(52,211,153,.2)", color: "#34d399", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✓ W</button>
                            <button onClick={() => updateBetStatus(bet.id, "perdida")} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "rgba(239,68,68,.2)", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✗ L</button>
                          </>
                        )}
                        {bet.estado !== "pendiente" && (
                          <span style={{ fontSize: 13, fontWeight: 800, color: bet.estado === "ganada" ? "#34d399" : "#f87171" }}>
                            {bet.estado === "ganada" ? `+$${fmtMoney(betProfit(bet))}` : `-$${fmtMoney(Math.abs(betProfit(bet)))}`}
                          </span>
                        )}
                        {bet.estado === "pendiente" && <span style={{ fontSize: 11, color: "#475569" }}>pendiente</span>}
                        <button onClick={() => deleteBet(bet.id)} style={{ padding: "4px 6px", borderRadius: 6, border: "none", background: "rgba(239,68,68,.1)", color: "#f87171", fontSize: 11, cursor: "pointer" }}>🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: HISTORIAL ─────────────────────────────────────────────── */}
        {activeTab === "historial" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#818cf8", textTransform: "uppercase", marginBottom: 2 }}>Registro y Tracking</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>📚 Historial de Tickets</h2>
            </div>

            {historial.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <div>Sin tickets guardados aún</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {historial.map(ticket => {
                  const alreadyReviewed = reviews.some(r => r.ticketId === ticket.id);
                  return (
                    <div key={ticket.id} style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: "#e0e7ff" }}>{ticket.partido}</div>
                            {ticket.modo === "mundial" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(251,191,36,.1)", color: "#fbbf24", fontWeight: 800, border: "1px solid rgba(251,191,36,.2)" }}>🏆 Mundial</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "#475569" }}>{new Date(ticket.fecha).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: "#818cf8" }}>{ticket.esParlay ? "Parlay" : "Singles"}</div>
                          <div style={{ fontSize: 13, color: "#34d399" }}>Pot: ${fmtMoney(ticket.potencial - toNum(ticket.stake))}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {(ticket.picks || []).map((p, i) => (
                          <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(99,102,241,.1)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,.2)" }}>
                            {p.mercado} {p.linea} @ {p.cuotaCasa}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>Stake: ${ticket.stake}</span>
                        <span style={{ fontSize: 12, color: "#64748b" }}>|</span>
                        <span style={{ fontSize: 12, color: "#64748b" }}>Prob: {fmtPct(ticket.probReal)}</span>
                        {/* NEW: Review button */}
                        {alreadyReviewed ? (
                          <span style={{ marginLeft: "auto", fontSize: 11, color: "#34d399", fontWeight: 700 }}>✅ Revisado</span>
                        ) : (
                          <button onClick={() => openReviewModal(ticket)}
                            style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(99,102,241,.3)", background: "rgba(99,102,241,.1)", color: "#a5b4fc", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                            🆚 Registrar Resultado Real
                          </button>
                        )}
                        <button onClick={() => { if (confirm("¿Eliminar ticket?")) setHistorial(h => h.filter(t => t.id !== ticket.id)); }}
                          style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: "rgba(239,68,68,.1)", color: "#f87171", fontSize: 11, cursor: "pointer" }}>
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: IA VS REALIDAD ────────────────────────────────────────── */}
        {activeTab === "ia-review" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#f59e0b", textTransform: "uppercase", marginBottom: 2 }}>Track Record</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>🆚 IA dijo vs Realidad</h2>
              <p style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>Este registro es solo para TI — la IA no usa esta memoria para generar picks.</p>
            </div>

            {reviews.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Sin reviews registrados</div>
                <div style={{ fontSize: 13 }}>Ve al Historial de Tickets y presiona "Registrar Resultado Real" después de cada partido</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {reviews.map(review => {
                  const acc = review.totalPicks > 0 ? (review.aciertos / review.totalPicks * 100) : 0;
                  return (
                    <div key={review.id} style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: "#e0e7ff" }}>{review.partido}</div>
                            {review.modo === "mundial" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(251,191,36,.1)", color: "#fbbf24", fontWeight: 800 }}>🏆</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "#475569" }}>{new Date(review.fecha).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}</div>
                          {review.liga && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{review.liga}</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: acc >= 60 ? "#34d399" : acc >= 40 ? "#fbbf24" : "#f87171" }}>{acc.toFixed(0)}%</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{review.aciertos}✅ / {review.fallos}❌</div>
                        </div>
                      </div>

                      {/* Resultado real */}
                      {(review.resultadoReal?.golesLocal !== "" || review.resultadoReal?.golesVisita !== "") && (
                        <div style={{ background: "rgba(99,102,241,.08)", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
                          <span style={{ fontSize: 12, color: "#64748b" }}>Resultado real: </span>
                          <span style={{ fontWeight: 800, color: "#e0e7ff", fontSize: 14 }}>
                            {review.local} {review.resultadoReal?.golesLocal} – {review.resultadoReal?.golesVisita} {review.visitante}
                          </span>
                          {review.resultadoReal?.notas && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{review.resultadoReal.notas}</div>}
                        </div>
                      )}

                      {review.pronosticoIA && (
                        <div style={{ background: "rgba(30,27,75,.5)", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
                          <div style={{ fontSize: 10, color: "#818cf8", fontWeight: 800, marginBottom: 2 }}>IA PREDIJO:</div>
                          <div style={{ fontSize: 12, color: "#a5b4fc" }}>{review.pronosticoIA}</div>
                        </div>
                      )}

                      {/* Picks breakdown */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(review.picks || []).map((p, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(15,23,42,.4)", borderRadius: 8, padding: "7px 12px" }}>
                            <div style={{ fontSize: 12, color: "#94a3b8" }}>{p.mercado} {p.linea} <span style={{ color: "#64748b" }}>({p.confianza}%)</span></div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: p.resultado === "acierto" ? "#34d399" : p.resultado === "fallo" ? "#f87171" : "#475569" }}>
                              {p.resultado === "acierto" ? "✅" : p.resultado === "fallo" ? "❌" : "⬜"}
                            </span>
                          </div>
                        ))}
                      </div>

                      <button onClick={() => { if (confirm("¿Eliminar este review?")) setReviews(r => r.filter(rv => rv.id !== review.id)); }}
                        style={{ marginTop: 10, padding: "4px 12px", borderRadius: 8, border: "none", background: "rgba(239,68,68,.1)", color: "#f87171", fontSize: 11, cursor: "pointer" }}>
                        🗑 Eliminar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: STATS IA ───────────────────────────────────────────────── */}
        {activeTab === "ia-stats" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#38bdf8", textTransform: "uppercase", marginBottom: 2 }}>Performance</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>📈 Stats de la IA</h2>
              <p style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>Track record real — basado en tus reviews post-partido.</p>
            </div>

            {iaStats.totalPicks === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📉</div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Sin datos aún</div>
                <div style={{ fontSize: 13 }}>Registra resultados reales desde el Historial para ver las estadísticas de la IA</div>
              </div>
            ) : (
              <>
                {/* Main stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
                  {[
                    { label: "Win Rate IA", val: fmtPct(iaStats.winRate), color: iaStats.winRate >= 55 ? "#34d399" : iaStats.winRate >= 45 ? "#fbbf24" : "#f87171" },
                    { label: "Picks evaluados", val: iaStats.totalPicks, color: "#818cf8" },
                    { label: "Aciertos", val: iaStats.aciertos, color: "#34d399" },
                    { label: "Fallos", val: iaStats.fallos, color: "#f87171" },
                    { label: "Overs sugeridos", val: iaStats.overs, color: "#6ee7b7" },
                    { label: "Unders sugeridos", val: iaStats.unders, color: "#7dd3fc" },
                  ].map(x => (
                    <div key={x.label} style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "14px 12px" }}>
                      <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>{x.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: x.color }}>{x.val}</div>
                    </div>
                  ))}
                </div>

                {/* Streak */}
                <div style={{ background: "rgba(15,23,42,.6)", border: `1px solid ${iaStats.streakType === "acierto" ? "rgba(52,211,153,.2)" : "rgba(239,68,68,.2)"}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 6 }}>RACHA ACTUAL DE LA IA</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: iaStats.streakType === "acierto" ? "#34d399" : "#f87171" }}>
                    {iaStats.streak > 0 ? `${iaStats.streakType === "acierto" ? "✅" : "❌"} ${iaStats.streak} ${iaStats.streakType === "acierto" ? "aciertos" : "fallos"} consecutivos` : "Sin racha"}
                  </div>
                </div>

                {/* Bias alert */}
                {iaStats.biasAlert && (
                  <div style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>{iaStats.biasAlert}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      {iaStats.overs} overs vs {iaStats.unders} unders sugeridos. Tómalo en cuenta al interpretar los picks.
                    </div>
                  </div>
                )}

                {/* Calibration by confidence bucket */}
                <div style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 12, textTransform: "uppercase" }}>Calibración por Nivel de Confianza</div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 14 }}>¿Los picks con mayor confianza realmente ganan más?</div>
                  {Object.entries(iaStats.buckets).map(([range, data]) => {
                    const pct = data.total > 0 ? (data.hits / data.total * 100) : null;
                    return (
                      <div key={range} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>Confianza {range}%</span>
                          <span style={{ fontSize: 12, color: pct === null ? "#475569" : pct >= 60 ? "#34d399" : pct >= 45 ? "#fbbf24" : "#f87171", fontWeight: 800 }}>
                            {pct === null ? "Sin datos" : `${pct.toFixed(0)}% (${data.hits}/${data.total})`}
                          </span>
                        </div>
                        {data.total > 0 && (
                          <div style={{ background: "rgba(255,255,255,.06)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: pct >= 60 ? "#34d399" : pct >= 45 ? "#fbbf24" : "#f87171", borderRadius: 4, transition: "width .5s" }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 8, lineHeight: 1.5 }}>
                    💡 Si los picks de 85%+ acierten menos que los de 65-74%, la IA está sobreestimando su confianza.
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}
