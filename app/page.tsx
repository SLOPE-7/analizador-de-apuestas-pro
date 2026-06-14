// @ts-nocheck
"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ── RESPONSIVE HOOK ───────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  // Hasta montar en el cliente, devolvemos false (igual que el servidor) para evitar hydration mismatch.
  return mounted ? isMobile : false;
}

// ── UTILS ────────────────────────────────────────────────────────────────────
const AI_MODEL = "claude-sonnet-4-5";   // único lugar para cambiar el modelo
const makeId = () => Math.random().toString(36).slice(2, 10);
const toNum = (v) => { const n = parseFloat(String(v || "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const impliedProb = (odd) => odd > 1 ? (1 / odd) * 100 : 0;
const fmtMoney = (v) => Number.isFinite(v) ? v.toFixed(2) : "0.00";
const fmtPct = (v) => `${Number.isFinite(v) ? v.toFixed(1) : "0.0"}%`;

// Extrae el primer objeto JSON balanceado de un texto (respuestas de la IA).
// Devuelve el objeto parseado o lanza Error con mensaje claro.
function extractJSON(raw) {
  const cleaned = String(raw || "").replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("La IA no devolvió JSON válido. Intenta de nuevo.");
  let depth = 0, end = -1;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("JSON incompleto en la respuesta de la IA.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

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

// Reglas de disciplina de Sergio: escala por confianza + tope 4% del banco.
// 70-74%→$10, 75-79%→$15, 80-84%→$20, 85%+→$25. Nunca >4% del bankroll.
function stakeRecomendado(confianza) {
  const c = Number(confianza) || 0;
  if (c >= 85) return 25;
  if (c >= 80) return 20;
  if (c >= 75) return 15;
  if (c >= 70) return 10;
  return 0; // bajo 70% no entra
}
function chequeoStake(stake, confianza, bank) {
  const s = toNum(stake);
  const rec = stakeRecomendado(confianza);
  const tope = bank > 0 ? bank * 0.04 : 0;
  const alertas = [];
  if (bank > 0 && s > tope) alertas.push(`⚠️ Supera el 4% del banco (máx $${fmtMoney(tope)})`);
  if (rec > 0 && s > rec) alertas.push(`⚠️ Tu escala sugiere $${rec} para ${confianza}% de confianza`);
  if (rec === 0 && confianza > 0 && confianza < 70) alertas.push(`⚠️ Confianza bajo 70% — fuera de tus reglas`);
  return { rec, tope, alertas, ok: alertas.length === 0 };
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
const SK = "apuestas_ia_pro_v2";
const BK = "bankroll_ia_pro_v2";
const HK = "historial_ia_pro_v2";
const RK = "review_ia_pro_v3";
const JK = "jornadas_mundial_v1";
const GK = "grupo_ctx_mundial_v1";
const GLK = "grupos_guardados_v1";
const ANK = "analisis_guardados_v1";
const FK = "favoritos_ia_pro_v1";
const AIK = "last_ai_result_v1";
const EK = "equipos_perfil_v1"; // team profiles

// ── TEAM PROFILE HELPERS ──────────────────────────────────────────────────────
function emptyPartidoEquipo(deporte = "futbol") {
  if (deporte === "mlb") return {
    id: "", fecha: "", rival: "", condicion: "local", resultado: "", // W/L
    carrerasAnotadas: "", carrerasRecibidas: "",
    hitsAnotados: "", hitsRecibidos: "",
    errores: "", innings: "",
    picksIA: [], eventos: [], notas: "",
  };
  if (deporte === "nba") return {
    id: "", fecha: "", rival: "", condicion: "local", resultado: "",
    puntosAnotados: "", puntosRecibidos: "",
    rebotes: "", asistencias: "", triples: "",
    picksIA: [], eventos: [], notas: "",
  };
  return { // futbol
    id: "", fecha: "", rival: "", condicion: "local", resultado: "",
    golesAnotados: "", golesRecibidos: "",
    corners: "", tarjetas: "", tarjetasRojas: "",
    picksIA: [], eventos: [], notas: "",
  };
}

function calcTeamAvg(partidos, deporte) {
  if (!partidos.length) return null;
  const n = partidos.length;
  const avg = (field) => {
    const vals = partidos.map(p => parseFloat(p[field])).filter(v => !isNaN(v));
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "N/D";
  };
  const wins = partidos.filter(p => p.resultado === "W" || p.resultado === "Victoria").length;
  const winRate = ((wins / n) * 100).toFixed(0);
  if (deporte === "mlb") return {
    partidos: n, winRate,
    carrerasAnotadas: avg("carrerasAnotadas"),
    carrerasRecibidas: avg("carrerasRecibidas"),
    hitsAnotados: avg("hitsAnotados"),
  };
  if (deporte === "nba") return {
    partidos: n, winRate,
    puntosAnotados: avg("puntosAnotados"),
    puntosRecibidos: avg("puntosRecibidos"),
    rebotes: avg("rebotes"),
  };
  return {
    partidos: n, winRate,
    golesAnotados: avg("golesAnotados"),
    golesRecibidos: avg("golesRecibidos"),
    corners: avg("corners"),
    tarjetas: avg("tarjetas"),
  };
}

function buildTeamProfileContext(equipos, local, visitante, deporte) {
  const find = (nombre) => equipos.find(e =>
    e.nombre.toLowerCase().trim() === (nombre||"").toLowerCase().trim() &&
    (e.deporte || "futbol") === deporte
  );
  const perfilLocal = find(local);
  const perfilVisitante = find(visitante);
  if (!perfilLocal && !perfilVisitante) return "";

  let ctx = "\n\n📊 PERFIL ESTADÍSTICO REAL (datos registrados por el usuario):\n";

  [{ equipo: local, perfil: perfilLocal }, { equipo: visitante, perfil: perfilVisitante }].forEach(({ equipo, perfil }) => {
    if (!perfil || !perfil.partidos?.length) return;
    const avg = calcTeamAvg(perfil.partidos.slice(-5), deporte);
    if (!avg) return;
    ctx += `\n🏟️ ${equipo} (últimos ${avg.partidos} partidos registrados):\n`;
    ctx += `  Win rate: ${avg.winRate}%\n`;
    if (deporte === "futbol") {
      ctx += `  Goles anotados/juego: ${avg.golesAnotados} | Goles recibidos/juego: ${avg.golesRecibidos}\n`;
      ctx += `  Corners/juego: ${avg.corners} | Tarjetas/juego: ${avg.tarjetas}\n`;
    } else if (deporte === "mlb") {
      ctx += `  Carreras anotadas/juego: ${avg.carrerasAnotadas} | Recibidas: ${avg.carrerasRecibidas}\n`;
      ctx += `  Hits anotados/juego: ${avg.hitsAnotados}\n`;
    } else if (deporte === "nba") {
      ctx += `  Puntos anotados/juego: ${avg.puntosAnotados} | Recibidos: ${avg.puntosRecibidos}\n`;
      ctx += `  Rebotes/juego: ${avg.rebotes}\n`;
    }
    // Últimos eventos relevantes
    const eventos = perfil.partidos.slice(-3).flatMap(p => p.eventos || []).filter(Boolean);
    if (eventos.length) ctx += `  Eventos recientes: ${eventos.slice(-5).join(", ")}\n`;
    // Picks que la IA dio previamente
    const picksHistorial = perfil.partidos.slice(-3).flatMap(p => (p.picksIA || []).map(pk => `${pk.mercado} ${pk.resultado === "acierto" ? "✅" : pk.resultado === "fallo" ? "❌" : "⬜"}`));
    if (picksHistorial.length) ctx += `  Picks anteriores: ${picksHistorial.join(", ")}\n`;
  });

  ctx += "\nUsa estos datos reales para calibrar tus picks. Son más confiables que las estadísticas genéricas.";
  return ctx;
}

function loadState(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function saveState(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── EMPTY SHAPES ─────────────────────────────────────────────────────────────
const emptyMatch = () => ({ local: "", visitante: "", oddLocal: "", oddDraw: "", oddVisit: "", liga: "", modo: "clubes" });
const emptyPick = () => ({ id: makeId(), mercado: "", linea: "", tipo: "over", confianza: 0, prioridad: "media", justificacion: "", cuotaSugerida: "", cuotaCasa: "", seleccionado: false, value: 0, ev: 0, roi: 0, color: "gray", valueLabel: "Sin datos", kellyAmt: 0, timestamp: new Date().toISOString(), pesoAnalisis: 0, condicionPartido: "", exigenciaEquipo: "" });
const emptyBet = () => ({ id: makeId(), fecha: new Date().toISOString().slice(0,10), partido: "", pick: "", mercado: "", stake: "", cuota: "", estado: "pendiente", notas: "" });
const emptyBankroll = () => ({ inicial: "", apuestas: [] });
const emptyReview = () => ({
  id: makeId(), fecha: new Date().toISOString(), partido: "", local: "", visitante: "", liga: "", modo: "clubes",
  resumenIA: "", pronosticoIA: "", picks: [],
  resultadoReal: { golesLocal: "", golesVisita: "", notas: "" },
  totalPicks: 0, aciertos: 0, fallos: 0,
});
// NEW: Jornada entry for mundial tracking
const emptyJornada = () => ({ id: makeId(), seleccion: "", jornada: "", rival: "", resultado: "", goles: "", necesidad: "", formacion: "", jugadoresClave: "", notas: "", fecha: new Date().toISOString().slice(0,10) });

// Base fija de los 12 grupos del Mundial 2026 (equipos precargados).
const MUNDIAL_GRUPOS = {
  A: ["México", "Sudáfrica", "Corea del Sur", "Chequia"],
  B: ["Canadá", "Suiza", "Catar", "Bosnia y Herzegovina"],
  C: ["Brasil", "Marruecos", "Haití", "Escocia"],
  D: ["Estados Unidos", "Paraguay", "Australia", "Turquía"],
  E: ["Alemania", "Curazao", "Costa de Marfil", "Ecuador"],
  F: ["Países Bajos", "Japón", "Suecia", "Túnez"],
  G: ["Bélgica", "Egipto", "Irán", "Nueva Zelanda"],
  H: ["España", "Cabo Verde", "Arabia Saudita", "Uruguay"],
  I: ["Francia", "Senegal", "Irak", "Noruega"],
  J: ["Argentina", "Argelia", "Austria", "Jordania"],
  K: ["Portugal", "DR Congo", "Uzbekistán", "Colombia"],
  L: ["Inglaterra", "Croacia", "Ghana", "Panamá"],
};

const emptyGrupoEquipo = () => ({ nombre: "", pj: "", pts: "", gf: "", gc: "" });
const emptyGrupoCtx = () => ({
  grupo: "",
  equipos: [emptyGrupoEquipo(), emptyGrupoEquipo(), emptyGrupoEquipo(), emptyGrupoEquipo()],
  resultadosPrevios: "",   // texto libre: "J1: Argentina 2-1 Islandia, Portugal 0-0 Nigeria"
});

// ── SISTEMA MULTIDEPORTE ──────────────────────────────────────────────────────
const SPORTS = {
  futbol: {
    id: "futbol", label: "⚽ Fútbol", emoji: "⚽",
    color: "#4f46e5", colorSoft: "rgba(79,70,229,.15)", border: "rgba(79,70,229,.3)",
    gradient: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    bgGradient: "radial-gradient(ellipse at 20% 20%, rgba(79,70,229,.25) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(124,58,237,.18) 0%, transparent 55%)",
    pattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cg fill='none' stroke='%234f46e5' stroke-width='1.5' opacity='0.5'%3E%3Ccircle cx='100' cy='100' r='34'/%3E%3Cline x1='100' y1='0' x2='100' y2='66'/%3E%3Cline x1='100' y1='134' x2='100' y2='200'/%3E%3Crect x='0' y='62' width='30' height='76'/%3E%3Crect x='170' y='62' width='30' height='76'/%3E%3C/g%3E%3C/svg%3E")`,
    hasDraw: true,
    defaultOddLabel: ["Local (1)", "Empate (X)", "Visitante (2)"],
    fields: [
      { key: "local", label: "🏠 Local", placeholder: "Ej: Real Madrid" },
      { key: "visitante", label: "✈️ Visitante", placeholder: "Ej: Barcelona" },
      { key: "liga", label: "🏆 Liga", placeholder: "Ej: La Liga" },
    ],
    filters: ["Todos📝","1x2 / Doble oportunidad⚔️","Ambos marcan🔥","Goles / Total⚽","1ª mitad⏱️","Corners⛳","Tarjetas🟨","Jugadores / Especiales⭐"],
  },
  mlb: {
    id: "mlb", label: "⚾ MLB", emoji: "⚾",
    color: "#dc2626", colorSoft: "rgba(220,38,38,.15)", border: "rgba(220,38,38,.3)",
    gradient: "linear-gradient(135deg, #dc2626, #b91c1c)",
    bgGradient: "radial-gradient(ellipse at 20% 20%, rgba(220,38,38,.25) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(185,28,28,.18) 0%, transparent 55%)",
    pattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cg fill='none' stroke='%23dc2626' stroke-width='1.5' opacity='0.5'%3E%3Cpath d='M80 30 L130 80 L80 130 L30 80 Z'/%3E%3Cpath d='M55 55 Q80 70 105 55' stroke-dasharray='3,5'/%3E%3Cpath d='M55 105 Q80 90 105 105' stroke-dasharray='3,5'/%3E%3C/g%3E%3C/svg%3E")`,
    hasDraw: false,
    defaultOddLabel: ["Local (ML)", "", "Visitante (ML)"],
    fields: [
      { key: "local", label: "🏠 Equipo Local", placeholder: "Ej: New York Yankees" },
      { key: "visitante", label: "✈️ Equipo Visitante", placeholder: "Ej: Los Angeles Dodgers" },
      { key: "liga", label: "⚾ División / Serie", placeholder: "Ej: AL East · Regular Season" },
    ],
    filters: ["Todos📝","Ganador💰","Primeras 5 entradas⚾","Más/Menos carreras📊","1era entrada sin carrera🎯","Carreras por equipo🏏","Props del Pitcher🔥","Ventaja de carreras🌀"],
  },
  nba: {
    id: "nba", label: "🏀 NBA", emoji: "🏀",
    color: "#ea580c", colorSoft: "rgba(234,88,12,.15)", border: "rgba(234,88,12,.3)",
    gradient: "linear-gradient(135deg, #ea580c, #c2410c)",
    bgGradient: "radial-gradient(ellipse at 20% 20%, rgba(234,88,12,.25) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(194,65,12,.18) 0%, transparent 55%)",
    pattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cg fill='none' stroke='%23ea580c' stroke-width='1.5' opacity='0.5'%3E%3Cpath d='M0 70 Q40 100 0 130'/%3E%3Cpath d='M200 70 Q160 100 200 130'/%3E%3Ccircle cx='100' cy='100' r='28'/%3E%3Cline x1='100' y1='0' x2='100' y2='72'/%3E%3Cline x1='100' y1='128' x2='100' y2='200'/%3E%3C/g%3E%3C/svg%3E")`,
    hasDraw: false,
    defaultOddLabel: ["Local (ML)", "", "Visitante (ML)"],
    fields: [
      { key: "local", label: "🏠 Equipo Local", placeholder: "Ej: Los Angeles Lakers" },
      { key: "visitante", label: "✈️ Equipo Visitante", placeholder: "Ej: Boston Celtics" },
      { key: "liga", label: "🏀 Conferencia / Ronda", placeholder: "Ej: NBA · Western Conference" },
    ],
    filters: ["Todos📝","Ganador / Hándicap💰","Totales📊","1ª Mitad🕐","Primer cuarto🏀","Props de jugador⭐","Totales por equipo📊","Especiales🎯"],
  },
};

function buildMLBPrompt(match, feedbackCtx = "") {
  const { local, visitante, oddLocal, oddVisit, liga } = match;
  return `Eres un analista deportivo profesional especializado en MLB. Actúas como un analista de alto nivel que busca VALUE BETS y ventajas que el mercado subestima.${feedbackCtx}

PARTIDO: ${local} vs ${visitante}${liga ? ` (${liga})` : ""}
CUOTAS: Local ${oddLocal || "N/D"} | Visitante ${oddVisit || "N/D"}

ANALIZA OBLIGATORIAMENTE EN ESTE ORDEN:

1. PITCHER ABRIDOR (crítico):
   - ERA, WHIP, xERA, FIP de temporada
   - Últimas 3-5 salidas: carreras, hits, strikeouts, innings lanzados
   - Splits zurdo/derecho vs el lineup rival (¿el lineup tiene más zurdos o derechos?)
   - Rendimiento en casa vs visita
   - Días de descanso desde su última salida

2. BULLPEN:
   - ERA del bullpen últimos 7 días
   - Innings lanzados últimos 3 días (fatiga)
   - Fiabilidad del cerrador
   - Diferencia de calidad de bullpens entre ambos equipos

3. LINEUP Y BATEO:
   - OPS y promedio últimas 2 semanas
   - Rendimiento vs lanzadores zurdos/derechos (según el pitcher rival)
   - Jugadores en racha positiva o negativa
   - Lesiones o bajas en la alineación

4. FACTORES DEL PARQUE Y CLIMA:
   - Park factor (¿favorece pitchers o bateadores?)
   - Viento: dirección y velocidad (crítico para HR y totales)
   - Temperatura y humedad

5. UMPIRE DEL HOME PLATE:
   - Tendencia Over/Under histórica
   - Zona de strike amplia o estrecha
   - Impacto en strikeouts

6. FACTORES OCULTOS:
   - Viajes recientes (serie de ciudad diferente)
   - Back-to-back o series consecutivas
   - Motivación (playoff race, eliminado, etc.)
   - Cambios de entrenador o problemas internos

7. H2H RECIENTE:
   - Últimos 5-10 enfrentamientos directos
   - Patrones y tendencias entre estos equipos
   - Rendimiento del pitcher abridor vs este lineup específico

MERCADOS DISPONIBLES (usa nombre exacto de Hondubet):
"Moneyline" | "Run line" (±1.5) | "Total de carreras" Over/Under ⭐ | "Total de carreras por equipo" | "Innings 1 a 5 - Ganador" ⭐ | "Innings 1 a 5 - Total" | "Hándicap F5" | "Ganador de la 1ª entrada" | "Anota en la 1ª entrada" | "Ponches del lanzador" | "Outs registrados por el lanzador" | "Jonrones" | "Hits del bateador" | "Carreras impulsadas (RBI)" | "Bases totales" | "Par/Impar de carreras"

JSON puro sin backticks:
{"resumen":"contexto completo del juego","pitcherLocal":"ERA/WHIP/xERA/splits/forma reciente","pitcherVisitante":"ERA/WHIP/xERA/splits/forma reciente","bullpen":"estado del bullpen de ambos equipos últimos 7 días","splitsMatchup":"análisis zurdo-derecho del pitcher vs lineup rival","condicionesClima":"parque/viento/temperatura/umpire","h2h":"últimos enfrentamientos y patrones","factoresOcultos":"viajes/fatiga/motivación/calendario","marcadorEsperado":{"local":4,"visitante":2,"totalCarreras":6.5,"descripcion":"proyección basada en ERA y bateo"},"comparacionH2H":[{"categoria":"Ataque","local":"dato","visitante":"dato","ventaja":"local/visitante/equilibrado"},{"categoria":"Pitcheo","local":"dato","visitante":"dato","ventaja":"local/visitante/equilibrado"},{"categoria":"Bullpen","local":"dato","visitante":"dato","ventaja":"local/visitante/equilibrado"},{"categoria":"Forma","local":"dato","visitante":"dato","ventaja":"local/visitante/equilibrado"}],"picks":[{"mercado":"nombre EXACTO","linea":"línea","tipo":"over/under/local/visitante","confianza":72,"prioridad":"alta","pesoAnalisis":8,"justificacion":"datos reales: ERA splits matchup bullpen parque umpire","jugador":"nombre si es prop","cuotaSugerida":"1.85","ev":"+5.2%","riesgo":"bajo/medio/alto"}],"pronostico":"resultado más probable","alertas":["alerta"],"perfilPartido":"abierto"}

REGLAS:
- Máximo 3 picks de alta calidad. Confianza mín 70%. pesoAnalisis mín 7.
- SPLITS son críticos: si el pitcher es zurdo y el lineup tiene 7 derechos, es ventaja del pitcher.
- ERA >5.00 rival: Over total siempre. NO Under.
- Si recomiendas Hándicap >75%: NO Under total (contradicción).
- F5 es el mercado más predecible cuando hay pitcher dominante.
- Solo el JSON.`;
}

function buildNBAPrompt(match, feedbackCtx = "") {
  const { local, visitante, oddLocal, oddVisit, liga } = match;
  return `Eres un analista deportivo profesional especializado en NBA. Buscas VALUE BETS y ventajas que el mercado subestima.${feedbackCtx}

PARTIDO: ${local} vs ${visitante}${liga ? ` (${liga})` : ""}
CUOTAS: Local ${oddLocal || "N/D"} | Visitante ${oddVisit || "N/D"}

ANALIZA OBLIGATORIAMENTE:

1. PACE Y TOTALES:
   - Pace (posesiones por 48 min) de ambos equipos
   - OffRtg y DefRtg últimos 10 partidos
   - Puntos anotados y permitidos recientes
   - ¿El partido tiende a ser rápido o lento según el matchup?

2. LESIONES Y ROTACIONES (crítico para props):
   - Jugadores OUT, Doubtful, Questionable
   - Impacto en minutos y producción de otros jugadores
   - ¿Hay rotaciones por posición en playoff race o eliminado?

3. BACK-TO-BACK Y FATIGA:
   - ¿Algún equipo juega 2do partido consecutivo?
   - ¿3 partidos en 4 días?
   - Viajes recientes (cross-country)

4. MATCHUPS INDIVIDUALES:
   - Quién guarda a la estrella rival
   - Déficit defensivo perimetral vs interior
   - Mismatches favorables para props

5. ÁRBITRO:
   - Promedio de faltas por partido
   - Tendencia de puntos (alto/bajo scoring)
   - Impacto en tiros libres y ritmo

6. FACTORES SITUACIONALES:
   - Importancia del partido (playoff seeding, eliminación)
   - Motivación de ambos equipos
   - Historial en este escenario

7. H2H RECIENTE:
   - Últimos 5-10 enfrentamientos
   - Tendencias de totales entre estos equipos
   - Rendimiento de props de jugadores específicos vs este rival

MERCADOS (usa nombre exacto de Hondubet):
"Moneyline" | "Spread / hándicap de puntos" | "Totales del partido" ⭐ | "Total por mitad" | "Totales por cuarto" ⭐ | "Hándicap por cuarto / mitad" | "Ganador del cuarto" | "Total de puntos por equipo" | "Puntos del jugador" | "Rebotes del jugador" | "Asistencias del jugador" | "Triples anotados" | "Combinadas P+R+A" | "Dobles-dobles / triples-dobles" | "Par / impar de puntos" | "Habrá prórroga"

JSON puro sin backticks:
{"resumen":"contexto completo del partido","paceTendencia":"Pace/OffRtg/DefRtg y total esperado","lesionesImpacto":"lesiones y cómo afectan props y resultado","factoresSituacionales":"motivación/back-to-back/viajes/árbitro","matchupsClaves":"defensores vs estrellas y mismatches","h2h":"últimos enfrentamientos y patrones de totales","marcadorEsperado":{"local":115,"visitante":108,"totalPuntos":223,"descripcion":"proyección basada en pace y defensa"},"comparacionH2H":[{"categoria":"Ataque","local":"dato","visitante":"dato","ventaja":"local/visitante/equilibrado"},{"categoria":"Defensa","local":"dato","visitante":"dato","ventaja":"local/visitante/equilibrado"},{"categoria":"Pace","local":"dato","visitante":"dato","ventaja":"local/visitante/equilibrado"},{"categoria":"Lesiones","local":"dato","visitante":"dato","ventaja":"local/visitante/equilibrado"}],"picks":[{"mercado":"nombre EXACTO","linea":"línea","tipo":"over/under/local/visitante","confianza":72,"prioridad":"alta","pesoAnalisis":8,"justificacion":"datos: pace lesiones matchup árbitro b2b","jugador":"nombre si es prop","cuotaSugerida":"1.85","ev":"+4.5%","riesgo":"bajo/medio/alto"}],"pronostico":"resultado y spread esperado","alertas":["alerta"],"perfilPartido":"abierto"}

REGLAS:
- Máximo 3 picks. Confianza mín 70%. pesoAnalisis mín 7.
- Back-to-back: reduce total esperado ~4-6 pts, baja confianza en props de estrellas.
- Props: solo con lesión confirmada del defensor o mismatch claro documentado.
- Favorito claro (spread 8+): Over total favorecido.
- Solo el JSON.`;
}

// ── FILTROS POR DEPORTE ──────────────────────────────────────────────────────
const MARKET_FILTERS_BY_SPORT = {
  futbol: ["Todos📝","1x2 / Doble oportunidad⚔️","Ambos marcan🔥","Goles / Total⚽","1ª mitad⏱️","Corners⛳","Tarjetas🟨","Jugadores / Especiales⭐"],
  mlb:    ["Todos📝","Ganador💰","Innings 1-5⚾","Totales📊","Primer inning🎯","Props Pitcher🔥","Props Jugador🏏","Hándicap🌀"],
  nba:    ["Todos📝","Ganador / Hándicap💰","Totales📊","1ª Mitad🕐","Primer cuarto🏀","Props de jugador⭐","Totales por equipo📊","Especiales🎯"],
};
function matchesFilterMulti(pick, filter, sport) {
  if (filter === "Todos") return true;
  const m = (pick.mercado || "").toLowerCase();
  const j = (pick.jugador || "").toLowerCase();
  if (sport === "mlb") {
    if (filter === "Ganador") return m.includes("ganador") || m.includes("moneyline") || m.includes(" ml");
    if (filter === "Innings 1-5") return m.includes("innings 1 a 5") || m.includes("f5") || m.includes("5 entradas") || m.includes("primeras 5");
    if (filter === "Totales") return (m.includes("totales") || m.includes("total") || m.includes("over") || m.includes("under") || m.includes("más/menos")) && !m.includes("innings 1 a 5") && !m.includes("primer inning") && !m.includes("jugador");
    if (filter === "Primer inning") return m.includes("primer inning") || m.includes("1er inning") || m.includes("primera entrada") || m.includes("nrfi") || m.includes("yrfi");
    if (filter === "Props Pitcher") return m.includes("pitcher") || m.includes("lanzador") || m.includes("strikeout") || m.includes("outs lanzados");
    if (filter === "Props Jugador") return m.includes("jugador") || (pick.jugador && pick.jugador.length > 0) || m.includes("home runs más") || m.includes("hits más") || m.includes("rbi") || m.includes("carreras impulsadas") || m.includes("bases totales");
    if (filter === "Hándicap") return m.includes("hándicap") || m.includes("handicap") || m.includes("-1.5") || m.includes("+1.5") || m.includes("run line");
  }
  if (sport === "nba") {
    if (filter === "Ganador / Hándicap") return m.includes("ganador") || m.includes("moneyline") || m.includes("hándicap") || m.includes("handicap") || m.includes("mitad/final");
    if (filter === "Totales") return (m.includes("totales (incl") || m.includes("over") || m.includes("under") || m.includes("más de") || m.includes("menos de")) && !m.includes("1ª mitad") && !m.includes("primer cuarto") && !m.includes("1 totales") && !m.includes("2 totales") && !m.includes("jugador") && !pick.jugador;
    if (filter === "1ª Mitad") return m.includes("1ª mitad") || m.includes("primera mitad") || m.includes("1er tiempo") || m.includes("primer tiempo");
    if (filter === "Primer cuarto") return m.includes("primer cuarto") || m.includes("1er cuarto") || m.includes("1q");
    if (filter === "Props de jugador") return !!pick.jugador || m.includes("puntos más") || m.includes("rebotes más") || m.includes("asistencias más") || m.includes("pts-reb") || m.includes("pts-asist") || m.includes("reb-ast") || m.includes("doble-doble") || m.includes("3 pts anotados más") || m.includes("tiros libres anotados");
    if (filter === "Totales por equipo") return m.includes("1 totales") || m.includes("2 totales") || m.includes("del equipo - 1") || m.includes("del equipo - 2") || m.includes("del equipo 1") || m.includes("del equipo 2");
    if (filter === "Especiales") return m.includes("impar/par") || m.includes("par/impar") || m.includes("prórroga") || m.includes("carrera a") || m.includes("robos") || m.includes("bloqueos") || m.includes("asistencias (incl");
  }
  // Default fútbol
  if (filter === "1x2 / Doble oportunidad") return m.includes("1x2") || m.includes("ganador") || m.includes("doble oportunidad") || m.includes("local") || m.includes("visitante") || m.includes("empate") || m.includes("1x") || m.includes("x2") || m.includes("12") || m.includes("hándicap") || m.includes("handicap");
  if (filter === "Ambos marcan") return m.includes("ambos equipos marcan") || m.includes("btts") || m.includes("ambos marcan");
  if (filter === "Goles / Total") return (m.includes("total de goles") || m.includes("marcador exacto") || m.includes("goles exacto") || ((m.includes("over") || m.includes("under") || m.includes("más") || m.includes("menos")) && !m.includes("corner") && !m.includes("esquina") && !m.includes("tarjeta") && !m.includes("mitad")));
  if (filter === "1ª mitad") return m.includes("1ª mitad") || m.includes("1er tiempo") || m.includes("primer tiempo") || m.includes("descanso");
  if (filter === "Corners") return m.includes("corner") || m.includes("esquina") || m.includes("tiros de esquina");
  if (filter === "Tarjetas") return m.includes("tarjeta") || m.includes("amarilla") || m.includes("roja") || m.includes("cartón");
  if (filter === "Jugadores / Especiales") return m.includes("gol") || m.includes("goleador") || m.includes("portería") || m.includes("penalti") || m.includes("par/impar") || m.includes("jugador") || m.includes("primero") || m.includes("último") || m.includes("margen");
  return true;
}

// ── BANKROLL CALCS ───────────────────────────────────────────────────────────
// ── SISTEMA DE ESTRELLAS ─────────────────────────────────────────────────────
function calcPickStars(pick, reviews) {
  let score = 0;

  // 1. Confianza IA (0-3 pts)
  const conf = toNum(pick.confianza);
  if (conf >= 85) score += 3;
  else if (conf >= 78) score += 2.5;
  else if (conf >= 72) score += 2;
  else if (conf >= 70) score += 1.5;
  else score += 1;

  // 2. Peso del análisis (0-1 pt)
  const peso = toNum(pick.pesoAnalisis);
  if (peso >= 9) score += 1;
  else if (peso >= 7) score += 0.5;

  // 3. Track record personal en ese mercado (0-1 pt)
  const allPicks = reviews.flatMap(r => r.picks || []);
  const settled = allPicks.filter(p =>
    (p.resultado === "acierto" || p.resultado === "fallo") &&
    (p.mercado || "").toLowerCase().includes((pick.mercado || "").toLowerCase().slice(0, 6))
  );
  if (settled.length >= 3) {
    const rate = settled.filter(p => p.resultado === "acierto").length / settled.length;
    if (rate >= 0.70) score += 1;
    else if (rate >= 0.55) score += 0.5;
    else score -= 0.5; // mercado con mal track record penaliza
  }

  // 4. Value de cuota (0-0.5 pt)
  const cuota = toNum(pick.cuotaSugerida) || toNum(pick.cuotaCasa);
  if (cuota >= 1.8) score += 0.5;

  // Clamp 1-5 estrellas
  const stars = Math.min(5, Math.max(1, Math.round(score)));
  const color = stars >= 5 ? "#fbbf24" : stars >= 4 ? "#f97316" : stars >= 3 ? "#a78bfa" : stars >= 2 ? "#64748b" : "#334155";
  const label = stars >= 5 ? "Pick Premium" : stars >= 4 ? "Pick Sólido" : stars >= 3 ? "Pick Normal" : stars >= 2 ? "Pick Dudoso" : "Evitar";
  return { stars, color, label };
}
// ── PICKS CORRELACIONADOS ────────────────────────────────────────────────────
function detectCorrelatedPicks(picks) {
  const correlations = [];
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const a = picks[i]; const b = picks[j];
      const ma = (a.mercado || "").toLowerCase();
      const mb = (b.mercado || "").toLowerCase();
      const ta = (a.tipo || "").toLowerCase();
      const tb = (b.tipo || "").toLowerCase();
      if ((ma.includes("1x2") || ma.includes("ganador") || ma.includes("moneyline")) &&
          (mb.includes("total") || mb.includes("goles") || mb.includes("carreras") || mb.includes("puntos")) && tb === "over") {
        correlations.push({ picks: [a.id, b.id], labels: [a.mercado, b.mercado], tipo: "positiva", razon: `Si gana el favorito suele haber más ${mb.includes("goles") ? "goles" : mb.includes("carreras") ? "carreras" : "puntos"} — buena combinada`, emoji: "🔗✅" });
      }
      if ((ma.includes("total") || ma.includes("goles")) && ta === "over" &&
          (mb.includes("ambos") && (mb.includes("no") || mb.includes("ng")))) {
        correlations.push({ picks: [a.id, b.id], labels: [a.mercado, b.mercado], tipo: "negativa", razon: "Over goles y Ambos no marcan son CONTRADICTORIOS — si hay Over ambos equipos casi siempre marcan", emoji: "⚠️❌" });
      }
      if ((ma.includes("hándicap") || ma.includes("-1.5") || ma.includes("-2")) &&
          (mb.includes("total") || mb.includes("goles") || mb.includes("carreras")) && tb === "under") {
        correlations.push({ picks: [a.id, b.id], labels: [a.mercado, b.mercado], tipo: "negativa", razon: "Hándicap alto del favorito y Under son CONTRADICTORIOS — si gana por mucho hay más puntos", emoji: "⚠️❌" });
      }
      if ((ma.includes("corner") || ma.includes("esquina")) && ta === "over" &&
          (mb.includes("total") || mb.includes("goles")) && tb === "over") {
        correlations.push({ picks: [a.id, b.id], labels: [a.mercado, b.mercado], tipo: "positiva", razon: "Over corners y Over goles se refuerzan — partido abierto favorece ambos mercados", emoji: "🔗✅" });
      }
    }
  }
  return correlations;
}

// ── PICK DEL DÍA ─────────────────────────────────────────────────────────────
function calcPickDelDia(picks, reviews) {
  if (!picks.length) return null;
  const scored = picks.map(p => {
    const stars = calcPickStars(p, reviews);
    const conf = toNum(p.confianza);
    const peso = toNum(p.pesoAnalisis);
    const cuota = toNum(p.cuotaSugerida) || toNum(p.cuotaCasa);
    const score = (stars.stars * 20) + (conf * 0.4) + (peso * 3) + (cuota > 1.7 ? 10 : cuota > 1.5 ? 5 : 0);
    return { ...p, _score: score, _stars: stars };
  });
  scored.sort((a, b) => b._score - a._score);
  return scored[0];
}

function detectTotalMarkets(picks) {
  const markets = [];
  const seen = new Set();
  picks.forEach(p => {
    const m = (p.mercado || "").toLowerCase();
    if ((m.includes("gol") || m.includes("total de goles")) && !seen.has("goles")) {
      seen.add("goles"); markets.push({ key: "goles", label: "⚽ Goles", icon: "⚽" });
    }
    if ((m.includes("corner") || m.includes("esquina")) && !seen.has("corners")) {
      seen.add("corners"); markets.push({ key: "corners", label: "⛳ Corners", icon: "⛳" });
    }
    if ((m.includes("tarjeta") || m.includes("cartón")) && !seen.has("tarjetas")) {
      seen.add("tarjetas"); markets.push({ key: "tarjetas", label: "🟨 Tarjetas", icon: "🟨" });
    }
    if ((m.includes("carrera") || m.includes("totales (incl")) && !seen.has("carreras")) {
      seen.add("carreras"); markets.push({ key: "carreras", label: "⚾ Carreras", icon: "⚾" });
    }
    if ((m.includes("punto") || m.includes("totales (incl. prórroga)")) && !seen.has("puntos")) {
      seen.add("puntos"); markets.push({ key: "puntos", label: "🏀 Puntos", icon: "🏀" });
    }
  });
  return markets;
}

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

// ── IA STATS + CALIBRATION ─────────────────────────────────────────────────
function calcIAStats(reviews) {
  const allPicks = reviews.flatMap(r => r.picks || []);
  const settled = allPicks.filter(p => p.resultado === "acierto" || p.resultado === "fallo");
  const aciertos = settled.filter(p => p.resultado === "acierto").length;
  const fallos = settled.filter(p => p.resultado === "fallo").length;
  const winRate = settled.length ? (aciertos / settled.length) * 100 : 0;

  const buckets = { "65-74": { hits: 0, total: 0 }, "75-84": { hits: 0, total: 0 }, "85+": { hits: 0, total: 0 } };
  settled.forEach(p => {
    const c = p.confianza || 0;
    const key = c >= 85 ? "85+" : c >= 75 ? "75-84" : "65-74";
    buckets[key].total++;
    if (p.resultado === "acierto") buckets[key].hits++;
  });

  let streak = 0, streakType = "neutral";
  for (const p of [...settled].reverse()) {
    if (streak === 0) { streakType = p.resultado === "acierto" ? "acierto" : "fallo"; streak = 1; }
    else if (p.resultado === streakType) streak++;
    else break;
  }

  const overs = allPicks.filter(p => (p.tipo || "").toLowerCase() === "over").length;
  const unders = allPicks.filter(p => (p.tipo || "").toLowerCase() === "under").length;
  const biasPct = allPicks.length ? (overs / allPicks.length) * 100 : 50;
  const biasAlert = biasPct >= 75 ? "⚠️ Sesgo alto hacia OVERS — la IA recibe este contexto en próximo análisis" : biasPct <= 25 ? "⚠️ Sesgo alto hacia UNDERS" : null;

  // NEW: market-level breakdown
  const mercadoStats = {};
  settled.forEach(p => {
    const key = (p.mercado || "Otro").split(" ")[0];
    if (!mercadoStats[key]) mercadoStats[key] = { hits: 0, total: 0 };
    mercadoStats[key].total++;
    if (p.resultado === "acierto") mercadoStats[key].hits++;
  });

  // NEW: failing patterns (markets with < 40% hit rate and at least 3 picks)
  const failingMarkets = Object.entries(mercadoStats)
    .filter(([, v]) => v.total >= 3 && (v.hits / v.total) < 0.4)
    .map(([k, v]) => ({ mercado: k, rate: (v.hits / v.total * 100).toFixed(0), total: v.total }));

  const winningMarkets = Object.entries(mercadoStats)
    .filter(([, v]) => v.total >= 3 && (v.hits / v.total) >= 0.6)
    .map(([k, v]) => ({ mercado: k, rate: (v.hits / v.total * 100).toFixed(0), total: v.total }));

  return { aciertos, fallos, winRate, buckets, streak, streakType, biasAlert, totalPicks: settled.length, overs, unders, biasPct, mercadoStats, failingMarkets, winningMarkets };
}

// ── ROI POR COMPETICIÓN ──────────────────────────────────────────────────────
function calcROIByLiga(reviews) {
  const byLiga = {};
  reviews.forEach(r => {
    const liga = r.liga || "Sin liga";
    if (!byLiga[liga]) byLiga[liga] = { total: 0, aciertos: 0 };
    (r.picks || []).forEach(p => {
      if (p.resultado === "acierto" || p.resultado === "fallo") {
        byLiga[liga].total++;
        if (p.resultado === "acierto") byLiga[liga].aciertos++;
      }
    });
  });
  return Object.entries(byLiga)
    .filter(([, v]) => v.total >= 3)
    .map(([liga, v]) => ({
      liga,
      total: v.total,
      aciertos: v.aciertos,
      rate: (v.aciertos / v.total) * 100,
    }))
    .sort((a, b) => b.rate - a.rate);
}
function getMarketTrackRecord(reviews, mercado) {
  const allPicks = reviews.flatMap(r => r.picks || []);
  const settled = allPicks.filter(p =>
    (p.resultado === "acierto" || p.resultado === "fallo") &&
    (p.mercado || "").toLowerCase().includes((mercado || "").toLowerCase().slice(0, 6))
  );
  if (settled.length < 2) return null; // necesita mínimo 2 para ser relevante
  const hits = settled.filter(p => p.resultado === "acierto").length;
  const rate = (hits / settled.length) * 100;
  const color = rate >= 65 ? "green" : rate >= 45 ? "yellow" : "red";
  const label = rate >= 65 ? `✅ ${rate.toFixed(0)}% acierto (${settled.length} picks)` :
                rate >= 45 ? `🟡 ${rate.toFixed(0)}% acierto (${settled.length} picks)` :
                             `🔴 ${rate.toFixed(0)}% acierto (${settled.length} picks) — Cuidado`;
  return { hits, total: settled.length, rate, color, label };
}
function buildFeedbackContext(reviews) {
  const allPicks = reviews.flatMap(r => r.picks || []);
  const settled = allPicks.filter(p => p.resultado === "acierto" || p.resultado === "fallo");
  if (settled.length < 3) return "";

  const overs = allPicks.filter(p => (p.tipo || "").toLowerCase() === "over").length;
  const unders = allPicks.filter(p => (p.tipo || "").toLowerCase() === "under").length;
  const biasPct = allPicks.length ? (overs / allPicks.length) * 100 : 50;

  const mercadoStats = {};
  settled.forEach(p => {
    const key = (p.mercado || "Otro").split(" ")[0];
    if (!mercadoStats[key]) mercadoStats[key] = { hits: 0, total: 0 };
    mercadoStats[key].total++;
    if (p.resultado === "acierto") mercadoStats[key].hits++;
  });

  const winRate = settled.length ? (settled.filter(p => p.resultado === "acierto").length / settled.length * 100).toFixed(0) : 0;

  const failingMkts = Object.entries(mercadoStats)
    .filter(([, v]) => v.total >= 3 && (v.hits / v.total) < 0.4)
    .map(([k, v]) => `${k} (${(v.hits / v.total * 100).toFixed(0)}% acierto en ${v.total} picks)`);
  const winningMkts = Object.entries(mercadoStats)
    .filter(([, v]) => v.total >= 3 && (v.hits / v.total) >= 0.6)
    .map(([k, v]) => `${k} (${(v.hits / v.total * 100).toFixed(0)}% acierto en ${v.total} picks)`);

  let ctx = `\n\n⚠️ HISTORIAL REAL DE TUS PREDICCIONES (${settled.length} picks evaluados):\n`;
  ctx += `- Win rate global: ${winRate}%\n`;
  ctx += `- Bias: ${biasPct.toFixed(0)}% de tus picks son OVERS — `;
  ctx += biasPct >= 70 ? "SESGO ALTO HACIA OVERS, evítalos salvo que los datos sean muy claros\n" : "equilibrado\n";
  if (failingMkts.length) ctx += `- MERCADOS QUE FALLAN: ${failingMkts.join(", ")} → REDUCE confianza en estos\n`;
  if (winningMkts.length) ctx += `- MERCADOS EXITOSOS: ${winningMkts.join(", ")} → puedes dar más peso a estos\n`;
  ctx += `- ❌ MARCADOR EXACTO tiene 0% acierto en el historial — NO sugerir este mercado.\n`;
  ctx += `- ⚠️ Picks con confianza 85%+ solo aciertan el 50% — trata esa confianza como si fuera 70% real.\n`;
  ctx += `- ⭐ "Total de goles" Over/Under tiene 83% de acierto — prioriza este mercado cuando los datos lo respalden.\n`;
  ctx += `Usa este historial para calibrar tus picks. Si un mercado tiene track record malo, baja la confianza o no lo incluyas.`;
  return ctx;
}

// ── SISTEMA DE MEMORIA POR EQUIPO ────────────────────────────────────────────
function buildTeamMemory(reviews, local, visitante) {
  const relevant = reviews.filter(r => {
    const teams = [r.local, r.visitante].map(t => (t||"").toLowerCase());
    return teams.includes((local||"").toLowerCase()) || teams.includes((visitante||"").toLowerCase());
  });
  if (!relevant.length) return "";
  let ctx = "\n\n🧠 MEMORIA DE EQUIPO (análisis previos):\n";
  relevant.slice(-5).forEach(r => {
    const picks = (r.picks||[]).filter(p => p.resultado === "acierto" || p.resultado === "fallo");
    if (!picks.length) return;
    const win = picks.filter(p => p.resultado === "acierto").length;
    ctx += `• ${r.partido} (${r.fecha?.slice(0,10)||""}): ${win}/${picks.length} picks correctos\n`;
    picks.forEach(p => {
      ctx += `  → ${p.mercado} ${p.linea||""}: ${p.resultado === "acierto" ? "✅" : "❌"} (${p.confianza}% conf)\n`;
    });
  });
  ctx += "\nUsa este historial para ajustar confianza. Si un mercado falló antes con estos equipos, sé más conservador.";
  return ctx;
}

// ── FÚTBOL PROMPT COMPLETO ───────────────────────────────────────────────────
function buildFutbolPrompt(match, feedbackCtx = "", jornadaCtx = "", memoryCtx = "") {
  const { local, visitante, oddLocal, oddDraw, oddVisit, liga } = match;
  return `Eres un analista deportivo profesional especializado en fútbol. Buscas VALUE BETS y ventajas ocultas que el mercado subestima.${feedbackCtx}${jornadaCtx}${memoryCtx}

PARTIDO: ${local} vs ${visitante}${liga ? ` (${liga})` : ""}
CUOTAS: Local ${oddLocal||"N/D"} | Empate ${oddDraw||"N/D"} | Visitante ${oddVisit||"N/D"}

ANALIZA OBLIGATORIAMENTE EN ESTE ORDEN:

1. FORMA RECIENTE (últimos 5 y 10 partidos):
   - Rendimiento como LOCAL (solo partidos en casa)
   - Rendimiento como VISITANTE (solo partidos fuera)
   - ¿El equipo está en ascenso, descenso o estable?
   - Rachas: goles marcados, recibidos, corners, tarjetas

2. HISTORIAL H2H:
   - Últimos 5-10 enfrentamientos directos
   - ¿Quién domina históricamente?
   - Tendencias de goles, BTTS, corners en estos matchups
   - Patrones repetitivos entre estos equipos

3. SITUACIÓN COMPETITIVA:
   - ¿Qué necesita cada equipo? (clasificación, descenso, copa, nada)
   - Motivación real de cada equipo
   - ¿Es un partido trámite o vital?

4. ESTADIO Y CONDICIONES:
   - Ventaja de localía real (no solo nominal)
   - Altitud si aplica
   - Clima y temperatura (lluvia afecta totales y corners)
   - Tipo de superficie

5. ÁRBITRO:
   - Promedio de tarjetas amarillas por partido
   - Penales señalados histórico
   - Tendencia localista/visitante
   - ¿Afecta mercados de tarjetas o penalti?

6. LESIONES Y BAJAS:
   - Jugadores clave OUT o en duda
   - Impacto en ataque y defensa
   - Posibles titulares vs suplentes

7. ANÁLISIS TÁCTICO:
   - Sistema de juego de cada equipo
   - Fortalezas y debilidades ofensivas/defensivas
   - xG y xGA si disponibles
   - Presión, posesión, transiciones

8. FACTORES OCULTOS:
   - Viajes recientes o calendarios congestionados
   - Cambios de entrenador o problemas internos
   - Declaraciones o motivaciones especiales
   - Partidos cada 3 días (fatiga acumulada)

MERCADOS DISPONIBLES (usa nombre exacto de Hondubet):
"1x2" | "Doble oportunidad" | "Empate no apuesta" | "Hándicap asiático" | "Hándicap europeo" | "Margen de victoria" | "1ª mitad - 1x2" | "Mitad/Final" | "Total de goles" Over/Under ⭐ | "1ª mitad - total" | "2ª mitad - total" | "Ambos equipos marcan" Sí/No | "Goles por equipo" | "Par/Impar de goles" | "Rango de goles" | "Equipo que marca primero" | "Total tiros de esquina" ⭐ | "1ª mitad - total tiros de esquina" | "Hándicap de córners" | "Primer córner" | "Total de tarjetas" | "1ª mitad - total tarjetas" | "Jugador con tarjeta" | "Portería a cero" | "Penalti en el encuentro" | "Goleador en cualquier momento" | "Primer gol" | "Mitad con más goles"

JSON puro sin backticks:
{"resumen":"contexto completo del partido","condicionPartido":"qué necesita cada equipo y cómo define el estilo","formaLocal":"últimos 5 partidos de ${local} en casa con goles/corners/resultado","formaVisitante":"últimos 5 partidos de ${visitante} fuera con goles/corners/resultado","h2h":"últimos enfrentamientos con tendencias de goles y corners","arbitro":{"nombre":"nombre si disponible","tarjetasPromedio":"X por partido","penalesHistorico":"Y penales en Z partidos","tendencia":"localista/neutral/visitante","impactoMercados":"cómo afecta tarjetas y penalti"},"lesiones":"bajas clave y su impacto","tactico":"análisis táctico y xG estimado","factoresOcultos":"viajes/fatiga/motivación especial","marcadorEsperado":{"local":1,"visitante":1,"totalGoles":2.3,"descripcion":"proyección basada en xG y forma"},"comparacionH2H":[{"categoria":"Ataque","local":"dato real","visitante":"dato real","ventaja":"local/visitante/equilibrado"},{"categoria":"Defensa","local":"dato real","visitante":"dato real","ventaja":"local/visitante/equilibrado"},{"categoria":"Forma","local":"dato real","visitante":"dato real","ventaja":"local/visitante/equilibrado"},{"categoria":"Localía","local":"rendimiento en casa","visitante":"rendimiento fuera","ventaja":"local/visitante/equilibrado"},{"categoria":"Motivación","local":"dato","visitante":"dato","ventaja":"local/visitante/equilibrado"},{"categoria":"Lesiones","local":"bajas","visitante":"bajas","ventaja":"local/visitante/equilibrado"}],"picks":[{"mercado":"nombre EXACTO","linea":"línea","tipo":"over/under/si/no/local/visitante/empate","confianza":72,"prioridad":"alta","pesoAnalisis":8,"justificacion":"datos reales con números: goles promedio lesiones forma h2h árbitro","condicionPartido":"cómo la situación del partido afecta este pick","cuotaSugerida":"1.75","ev":"+6.3%","riesgo":"bajo/medio/alto"}],"pronostico":"resultado más probable con razonamiento","alertas":["alerta concreta"],"perfilPartido":"abierto"}

REGLAS:
- Máximo 3 picks de alta calidad. Confianza mín 70%. pesoAnalisis mín 7.
- ❌ NUNCA sugieras "Marcador exacto" — 0% en historial del usuario.
- ⭐ "Total de goles" tiene 83% de acierto — prioriza cuando los datos lo justifican.
- FAVORITO CLARO (local ≤1.50): partido ABIERTO. Over goles. NO "Ambos no marcan" sin datos reales.
- EQUIPOS BRASILEÑOS en Libertadores de local: MUY ABIERTO. Over goles y corners siempre.
- FINAL/COPA: techo 62% para Over goles. Prioriza 1x2, Under, resultado al descanso.
- Solo el JSON.`;
}

function buildMundialPrompt(match, feedbackCtx = "", jornadaCtx = "", memoryCtx = "", mundialCtx = {}, modoRapido = false) {
  const { local, visitante, oddLocal, oddDraw, oddVisit, liga } = match;
  const fase = mundialCtx.fase || "grupos";
  const jornada = mundialCtx.jornada || "J1";
  const localClasif = mundialCtx.localClasificado;
  const visitClasif = mundialCtx.visitanteClasificado;
  const localElim = mundialCtx.localEliminado;
  const visitElim = mundialCtx.visitanteEliminado;
  const descLocal = mundialCtx.diasDescansoLocal;
  const descVisit = mundialCtx.diasDescansoVisitante;

  const faseCtx = {
    grupos: "FASE DE GRUPOS — Los equipos pueden clasificar o quedar eliminados. Los equipos grandes atacan más en grupos por diferencia de goles.",
    octavos: "OCTAVOS DE FINAL — Eliminación directa. Presión máxima. Equipos juegan para no perder. Más cautelosos tácticamente.",
    cuartos: "CUARTOS DE FINAL — Muy pocas veces se superan estas instancias. Fatiga acumulada de 3-4 partidos. Equipos más conservadores.",
    semifinal: "SEMIFINAL — Presión extrema. Táctica defensiva prioritaria. Promedian 1.4 goles. Over goles tiene techo 60%.",
    final: "FINAL — Máxima presión. Ambos equipos priorizan NO perder. Promedian 1.2 goles. Over 2.5 raramente se da en finales de Mundial.",
  }[fase] || "";

  const jornadaCtxStr = fase === "grupos" ? {
    J1: "JORNADA 1 — Primera vez que se enfrentan en este torneo. Sin presión de clasificación aún. Los equipos suelen jugar más abiertos.",
    J2: "JORNADA 2 — Los resultados de J1 condicionan completamente cómo juega cada equipo. Analiza si necesitan ganar o pueden permitirse empatar.",
    J3: "JORNADA 3 (ÚLTIMA JORNADA) — Ambos partidos del grupo se juegan en simultáneo. Los equipos conocen exactamente qué necesitan. Alta probabilidad de acuerdos tácticos si ambos clasifican. Muy difícil de predecir.",
  }[jornada] || "" : "";

  const necesidadCtx = [];
  if (localClasif) necesidadCtx.push(`${local} YA CLASIFICÓ — puede rotar jugadores titulares, menor intensidad, prioriza descanso para siguiente ronda.`);
  if (visitClasif) necesidadCtx.push(`${visitante} YA CLASIFICÓ — puede rotar jugadores titulares, menor intensidad.`);
  if (localElim) necesidadCtx.push(`${local} YA ESTÁ ELIMINADO — partido sin trascendencia competitiva, motivación reducida.`);
  if (visitElim) necesidadCtx.push(`${visitante} YA ESTÁ ELIMINADO — partido sin trascendencia competitiva, motivación reducida.`);

  const descansoCtx = [];
  if (descLocal) descansoCtx.push(`${local}: ${descLocal} días de descanso desde su último partido.`);
  if (descVisit) descansoCtx.push(`${visitante}: ${descVisit} días de descanso desde su último partido.`);

  return `Eres un analista deportivo profesional especializado en selecciones nacionales y torneos internacionales. Buscas VALUE BETS con análisis profundo del contexto del torneo.${feedbackCtx}${jornadaCtx}${memoryCtx}${modoRapido ? "\n\n⚡ MODO RÁPIDO: Sé conciso. Llena resumen, estadoGrupo, los 2-3 mejores picks, mejorApuesta y apuestaEvitar. Puedes dejar vacíos los campos descriptivos largos (tactico, factoresOcultos, h2hMundiales). Prioriza velocidad sin perder el análisis del contexto del grupo." : ""}

PARTIDO: ${local} vs ${visitante}${liga ? ` (${liga})` : ""}
CUOTAS: Local ${oddLocal||"N/D"} | Empate ${oddDraw||"N/D"} | Visitante ${oddVisit||"N/D"}

⚠️ CONTEXTO DEL TORNEO (CRÍTICO):
FASE: ${fase.toUpperCase()} ${jornada !== "N/A" ? `— ${jornada}` : ""}
${faseCtx}
${jornadaCtxStr}
${necesidadCtx.length ? "\n🎯 NECESIDADES DE CLASIFICACIÓN:\n" + necesidadCtx.join("\n") : ""}
${descansoCtx.length ? "\n💪 DESCANSO:\n" + descansoCtx.join("\n") : ""}

ANALIZA OBLIGATORIAMENTE:

1. RANKING FIFA Y NIVEL REAL:
   - Diferencia de nivel entre selecciones
   - Rendimiento histórico en Mundiales específicamente (no solo amistosos)
   - ¿Hay equipos que históricamente se activan en eliminatorias? (ej: Argentina, Alemania)

2. FORMA RECIENTE EN COMPETICIÓN (CRÍTICO):
   - Últimos 5 partidos pero DIFERENCIANDO si son amistosos vs partidos competitivos
   - ⚠️ BUSCA ESPECÍFICAMENTE: partidos amistosos de preparación para este torneo (últimas 3-4 semanas antes del torneo). Estos amistosos revelan el estado físico real, las rotaciones del DT y qué jugadores llegan en forma.
   - ¿Hubo sorpresas en los amistosos? (una selección "menor" que ganó a una "mayor" indica algo)
   - Rendimiento específico en este torneo si ya jugaron
   - Goles anotados y recibidos por partido en este torneo

3. H2H EN MUNDIALES Y TORNEOS MAYORES:
   - Enfrentamientos directos en Mundiales específicamente
   - ¿Hay selecciones que históricamente se complican entre sí en torneos?
   - Patrones de resultado en partidos de presión

4. ROTACIONES Y SQUAD:
   ${localClasif ? `⚠️ ${local} CLASIFICADO — analiza qué jugadores probablemente rota` : `Titularidad esperada de ${local}`}
   ${visitClasif ? `⚠️ ${visitante} CLASIFICADO — analiza qué jugadores probablemente rota` : `Titularidad esperada de ${visitante}`}
   - Lesiones y suspensiones confirmadas
   - Jugadores clave en forma o bajo rendimiento

5. FATIGA ACUMULADA EN EL TORNEO:
   - Partidos jugados en este torneo (los cuartos y semis tienen fatiga real)
   - Intensidad de partidos anteriores (prórrogas, penales)
   ${descLocal ? `- ${local}: ${descLocal} días de descanso` : ""}
   ${descVisit ? `- ${visitante}: ${descVisit} días de descanso` : ""}

6. ÁRBITRO:
   - Nombre si disponible
   - Tendencia de tarjetas y penales en Mundiales
   - Árbitros europeos vs sudamericanos vs asiáticos tienen estilos muy diferentes

7. ANÁLISIS TÁCTICO DE SELECCIONES:
   - Sistema de juego preferido en este torneo (puede diferir de amistosos)
   - Fortalezas y debilidades específicas vs el rival
   - ¿Cómo se enfrentan tácticamente estos estilos?

8. FACTORES OCULTOS DE TORNEO:
   - Presión mediática del país (algunos países con presión extrema rinden peor)
   - Historia reciente de penales (si puede ir a eliminación por penales)
   - Condiciones climáticas del estadio
   - Altitud si aplica

9. ESTILO DE JUEGO → MERCADOS (CRÍTICO PARA EL VALUE):
   Conecta el estilo REAL de cada selección con los mercados concretos. No basta decir "juega bien"; traduce el estilo a apuestas:
   - ESTILO OFENSIVO/VERTICAL (mucha posesión rival forzada, presión alta, transiciones rápidas) → favorece Over goles, Over córners, Ambos marcan. Ej: selecciones que atacan con laterales profundos generan muchos córners.
   - ESTILO DEFENSIVO/REACTIVO (bloque bajo, contraataque, repliegue) → favorece Under goles, Portería a cero del rival fuerte, menos córners. Suele subir tarjetas (faltas tácticas).
   - JUEGO FÍSICO/TRABADO (mucha disputa, faltas, duelos) → Over tarjetas, posible Under goles, penalti más probable.
   - DESEQUILIBRIO DE NIVEL (favorito claro vs débil que se encierra) → el débil genera córners a favor del grande, pero el grande puede no concretar (cuidado con Over 2.5 inflado).
   - Cruza SIEMPRE el estilo del local contra el del visitante: dos equipos ofensivos = partido abierto (Over); ofensivo vs defensivo = depende de quién imponga ritmo; dos defensivos = Under casi seguro.

10. INFLUENCIA DE LA HINCHADA Y LOCALÍA (especial Mundial 2026):
   - SEDE LOCAL REAL: México, Estados Unidos y Canadá juegan EN CASA este Mundial. La hinchada masiva a favor sube su rendimiento, presiona al árbitro (más faltas pitadas a favor, posible penalti) y puede intimidar al rival. Pondera esto en 1x2 y en tarjetas del rival.
   - PRESIÓN INVERSA: una hinchada local muy exigente también puede generar ansiedad en el equipo local si el partido se complica (ej: anfitrión que necesita ganar). Considera ambos lados.
   - NEUTRALIDAD: en partidos sin local real, identifica qué afición viajó más (sudamericanos y mexicanos llenan estadios) y cómo afecta el ambiente.

MERCADOS (usa nombres exactos de Hondubet):
"1x2" | "Doble oportunidad" | "Empate no apuesta" | "Hándicap asiático" | "Total de goles" Over/Under ⭐ | "1ª mitad - 1x2" | "1ª mitad - total" | "Ambos equipos marcan" | "Total tiros de esquina" | "Total de tarjetas" | "Portería a cero" | "Penalti en el encuentro"

11. CALIFICA CADA MERCADO DE 1 A 10:
   Evalúa el valor de cada mercado disponible (1 = sin valor, evitar; 10 = valor máximo). No solo el que vas a recomendar.

12. DETECTA TRAMPAS DEL MERCADO:
   - Favoritos sobrevalorados (cuota muy baja para el riesgo real)
   - Equipos infravalorados por narrativa
   - Narrativas falsas que infla el público
   - Exceso de confianza pública en un resultado

13. MEJOR APUESTA Y APUESTA A EVITAR:
   - Identifica LA mejor apuesta del partido (la de mayor valor real)
   - Identifica explícitamente qué apuesta EVITAR (trampa o sin valor)

⚠️ REGLA DE DATOS FALTANTES (CRÍTICO):
Si en fase de grupos NO tienes la tabla del grupo ni los resultados previos, y son necesarios para evaluar las necesidades de clasificación, NO inventes. En el JSON, marca "datosFaltantes" con la lista específica de lo que necesitas del usuario, y BAJA la confianza de todos los picks a máximo 60%. Solo da confianza alta cuando el contexto del grupo esté completo.

JSON puro sin backticks:
{"resumen":"contexto completo del partido y fase","estadoGrupo":"resumen de la tabla: quién lidera, quién está obligado, quién puede rotar (o vacío si no hay datos)","condicionPartido":"qué necesita cada selección en esta fase específica","necesidadLocal":"qué resultado necesita el local y su urgencia","necesidadVisitante":"qué resultado necesita el visitante y su urgencia","formaLocal":"últimos 5 con goles - diferenciando competitivos vs amistosos","formaVisitante":"últimos 5 con goles - diferenciando competitivos vs amistosos","h2hMundiales":"historial específico en Mundiales y torneos mayores","rotacionesEsperadas":"qué jugadores pueden rotar si algún equipo ya clasificó","fatigaAcumulada":"análisis de fatiga por partidos jugados en el torneo","arbitro":{"nombre":"","tarjetasPromedio":"","tendencia":"","impactoMercados":""},"tactico":"sistemas y matchup táctico","estiloMercados":{"goles":"cómo los estilos afectan goles (over/under y por qué)","corners":"proyección de córners según estilo","tarjetas":"proyección de tarjetas según físico/faltas","resultado":"cómo el choque de estilos define el 1x2"},"factorHinchada":"impacto de la hinchada/localía en este partido (especial si juega anfitrión)","factoresOcultos":"presión mediática/clima/altitud/contexto emocional","marcadorEsperado":{"local":1,"visitante":0,"totalGoles":1.8,"descripcion":"proyección considerando fase y necesidades"},"comparacionH2H":[{"categoria":"Nivel FIFA","local":"","visitante":"","ventaja":""},{"categoria":"Forma reciente","local":"","visitante":"","ventaja":""},{"categoria":"Motivación","local":"","visitante":"","ventaja":""},{"categoria":"Fatiga","local":"","visitante":"","ventaja":""},{"categoria":"Lesiones","local":"","visitante":"","ventaja":""},{"categoria":"H2H Mundiales","local":"","visitante":"","ventaja":""}],"mercadosCalificados":[{"mercado":"nombre","nota":8,"comentario":"por qué esa nota"}],"trampasMercado":["descripción de cada trampa detectada"],"mejorApuesta":{"mercado":"","linea":"","razon":"por qué es la de mayor valor"},"apuestaEvitar":{"mercado":"","razon":"por qué evitarla"},"datosFaltantes":[],"picks":[{"mercado":"nombre EXACTO","linea":"","tipo":"","confianza":72,"prioridad":"alta","pesoAnalisis":8,"justificacion":"datos reales considerando fase del torneo","condicionPartido":"","cuotaSugerida":"","ev":"","riesgo":""}],"pronostico":"resultado considerando fase y contexto","alertas":[],"perfilPartido":"cerrado"}

REGLAS CRÍTICAS POR FASE:
- GRUPOS J3: Muy difícil de predecir si ambos clasifican. Baja confianza máx 68%.
- GRUPOS con equipo clasificado: Reduce confianza en resultado. Prioriza totales de goles.
- ELIMINATORIAS: Techo 65% para Over goles. Prioriza 1x2, Doble oportunidad, Under.
- SEMIFINAL/FINAL: Techo 60% Over goles. Promedian 1.2-1.4 goles. Prioriza Under y 1x2.
- Nunca "Marcador exacto". ⭐ "Total de goles" sigue siendo el mejor mercado.
- Solo el JSON.`;
}

// ── MAIN AI ANALYSIS ─────────────────────────────────────────────────────────
function calcDashboard(bankroll, reviews) {
  const apuestas = bankroll.apuestas || [];
  const inicial = toNum(bankroll.inicial) || 0;

  // P&L por día (últimos 14 días)
  const dayMap = {};
  apuestas.forEach(b => {
    if (b.estado !== "ganada" && b.estado !== "perdida") return;
    const day = b.fecha?.slice(0, 10) || "?";
    if (!dayMap[day]) dayMap[day] = { pnl: 0, ganadas: 0, perdidas: 0 };
    const stake = toNum(b.stake);
    const cuota = toNum(b.cuota);
    if (b.estado === "ganada") { dayMap[day].pnl += stake * (cuota - 1); dayMap[day].ganadas++; }
    else { dayMap[day].pnl -= stake; dayMap[day].perdidas++; }
  });
  const sortedDays = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b)).slice(-14);

  // Curva de bankroll acumulada
  let running = inicial;
  const bankCurve = [{ day: "Inicio", val: inicial }];
  sortedDays.forEach(([day, data]) => {
    running += data.pnl;
    bankCurve.push({ day: day.slice(5), val: Math.max(0, running) });
  });

  // Mercados con más aciertos
  const allPicks = reviews.flatMap(r => r.picks || []);
  const settled = allPicks.filter(p => p.resultado === "acierto" || p.resultado === "fallo");
  const mktMap = {};
  settled.forEach(p => {
    const key = (p.mercado || "Otro").replace(/\s*(Over|Under)\s*[\d.]+/i, "").trim().slice(0, 28);
    if (!mktMap[key]) mktMap[key] = { hits: 0, total: 0 };
    mktMap[key].total++;
    if (p.resultado === "acierto") mktMap[key].hits++;
  });
  const marketStats = Object.entries(mktMap)
    .filter(([, v]) => v.total >= 2)
    .map(([k, v]) => ({ label: k, hits: v.hits, total: v.total, rate: (v.hits / v.total) * 100 }))
    .sort((a, b) => b.rate - a.rate);

  // Equipos que más te hacen ganar
  const teamMap = {};
  reviews.forEach(r => {
    const teams = [r.local, r.visitante].filter(Boolean);
    const picksR = (r.picks || []).filter(p => p.resultado === "acierto" || p.resultado === "fallo");
    if (!picksR.length) return;
    const hits = picksR.filter(p => p.resultado === "acierto").length;
    teams.forEach(t => {
      if (!t) return;
      if (!teamMap[t]) teamMap[t] = { hits: 0, total: 0 };
      teamMap[t].total += picksR.length;
      teamMap[t].hits += hits;
    });
  });
  const teamStats = Object.entries(teamMap)
    .filter(([, v]) => v.total >= 2)
    .map(([k, v]) => ({ label: k, hits: v.hits, total: v.total, rate: (v.hits / v.total) * 100 }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8);

  // Totales rápidos
  const totalStaked = apuestas.filter(b => b.estado !== "pendiente").reduce((s, b) => s + toNum(b.stake), 0);
  const totalPnl = sortedDays.reduce((s, [, d]) => s + d.pnl, 0);
  const currentBank = inicial + totalPnl;
  const roi = totalStaked > 0 ? (totalPnl / totalStaked) * 100 : 0;

  // Yield por deporte
  const sportMap = { futbol: { staked: 0, pnl: 0 }, mlb: { staked: 0, pnl: 0 }, nba: { staked: 0, pnl: 0 } };
  apuestas.filter(b => b.estado === "ganada" || b.estado === "perdida").forEach(b => {
    const sp = b.deporte || "futbol";
    if (!sportMap[sp]) sportMap[sp] = { staked: 0, pnl: 0 };
    const stake = toNum(b.stake);
    const cuota = toNum(b.cuota);
    sportMap[sp].staked += stake;
    sportMap[sp].pnl += b.estado === "ganada" ? stake * (cuota - 1) : -stake;
  });
  const yieldBySport = Object.entries(sportMap)
    .filter(([, v]) => v.staked > 0)
    .map(([sport, v]) => ({
      sport,
      label: sport === "futbol" ? "⚽ Fútbol" : sport === "mlb" ? "⚾ MLB" : "🏀 NBA",
      staked: v.staked,
      pnl: v.pnl,
      yield: (v.pnl / v.staked) * 100,
    }))
    .sort((a, b) => b.yield - a.yield);

  return { bankCurve, sortedDays, marketStats, teamStats, totalStaked, totalPnl, currentBank, roi, inicial, yieldBySport };
}

// Mini bar chart component (SVG inline)
// Line chart for bankroll curve
function BankCurve({ data }) {
  if (data.length < 2) return <div style={{ color: "#475569", fontSize: 12, padding: 20, textAlign: "center" }}>Registra apuestas para ver la curva</div>;
  const vals = data.map(d => d.val);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 300; const H = 80;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((d.val - min) / range) * (H - 10) - 5;
    return `${x},${y}`;
  }).join(" ");
  const lastVal = vals[vals.length - 1];
  const firstVal = vals[0];
  const lineColor = lastVal >= firstVal ? "#34d399" : "#f87171";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="bankGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
          <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - ((d.val - min) / range) * (H - 10) - 5;
        return <circle key={i} cx={x} cy={y} r={3} fill={lineColor} />;
      })}
      {/* Labels */}
      {data.map((d, i) => {
        if (i === 0 || i === data.length - 1 || data.length < 6) {
          const x = (i / (data.length - 1)) * W;
          const y = H - ((d.val - min) / range) * (H - 10) - 5;
          return <text key={`l${i}`} x={x} y={Math.min(y - 5, H - 15)} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,.5)">{d.day}</text>;
        }
        return null;
      })}
    </svg>
  );
}
function buildJornadaContext(jornadas, local, visitante) {
  const jorLocal = jornadas.filter(j => j.seleccion.toLowerCase().includes(local.toLowerCase().slice(0, 4)));
  const jorVisit = jornadas.filter(j => j.seleccion.toLowerCase().includes(visitante.toLowerCase().slice(0, 4)));
  if (!jorLocal.length && !jorVisit.length) return "";

  let ctx = "\n\n📋 HISTORIAL DE JORNADAS REGISTRADO:\n";
  if (jorLocal.length) {
    ctx += `\n${local}:\n`;
    jorLocal.forEach(j => {
      ctx += `  • Jornada ${j.jornada} vs ${j.rival}: ${j.resultado} (${j.goles}) | Necesidad: ${j.necesidad} | Formación: ${j.formacion} | Clave: ${j.jugadoresClave}\n`;
      if (j.notas) ctx += `    Notas: ${j.notas}\n`;
    });
  }
  if (jorVisit.length) {
    ctx += `\n${visitante}:\n`;
    jorVisit.forEach(j => {
      ctx += `  • Jornada ${j.jornada} vs ${j.rival}: ${j.resultado} (${j.goles}) | Necesidad: ${j.necesidad} | Formación: ${j.formacion} | Clave: ${j.jugadoresClave}\n`;
      if (j.notas) ctx += `    Notas: ${j.notas}\n`;
    });
  }
  ctx += "\nUsa estos datos de jornadas para tu análisis. Son observaciones reales del usuario.";
  return ctx;
}

// Construye contexto de la tabla del grupo a partir de lo que el usuario llenó.
// Calcula diferencia de goles y ordena. Devuelve "" si no hay datos suficientes.
function buildGrupoContext(grupoCtx) {
  if (!grupoCtx) return "";
  const eqs = (grupoCtx.equipos || []).filter(e => e.nombre && e.nombre.trim());
  if (eqs.length < 2 && !grupoCtx.resultadosPrevios) return "";

  let ctx = `\n\n🏆 TABLA DEL GRUPO ${grupoCtx.grupo || ""} (datos reales del usuario):\n`;
  if (eqs.length) {
    const tabla = eqs.map(e => {
      const gf = toNum(e.gf), gc = toNum(e.gc);
      return { nombre: e.nombre, pj: toNum(e.pj), pts: toNum(e.pts), gf, gc, dif: gf - gc };
    }).sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.gf - a.gf);

    tabla.forEach((e, i) => {
      ctx += `  ${i + 1}. ${e.nombre} — ${e.pts} pts | PJ ${e.pj} | GF ${e.gf} GC ${e.gc} | Dif ${e.dif >= 0 ? "+" : ""}${e.dif}\n`;
    });
    ctx += "\nLos 2 primeros clasifican. Usa posiciones, puntos y diferencia de goles para deducir qué necesita cada selección.\n";
  }
  if (grupoCtx.resultadosPrevios && grupoCtx.resultadosPrevios.trim()) {
    ctx += `\nRESULTADOS PREVIOS DEL GRUPO:\n${grupoCtx.resultadosPrevios.trim()}\n`;
  }
  ctx += "\n⚠️ Analiza el GRUPO COMPLETO antes del partido. El contexto de clasificación tiene prioridad sobre las estadísticas históricas.";
  return ctx;
}

// Construye contexto de aprendizaje: lecciones de evaluaciones de análisis previos.
function buildAprendizajeContext(analisisGuardados) {
  // Usa las marcas manuales (✅/❌) que el usuario puso en cada mercado.
  const conMarcas = (analisisGuardados || []).filter(a => (a.mercadosCalificados || []).some(m => m.marca === "acierto" || m.marca === "fallo"));
  if (!conMarcas.length) return "";

  let ctx = "\n\n🧠 REGISTRO DE TUS ANÁLISIS PREVIOS (aprende de aciertos y errores marcados por el usuario):";
  // Detecta sesgos: ¿qué mercados con nota alta fallaron?
  let acierto = 0, fallo = 0;
  const fallosNotaAlta = [];
  conMarcas.slice(0, 12).forEach(a => {
    (a.mercadosCalificados || []).forEach(m => {
      if (m.marca === "acierto") acierto++;
      else if (m.marca === "fallo") {
        fallo++;
        if (toNum(m.nota) >= 7) fallosNotaAlta.push(`${m.mercado} (le diste ${m.nota}/10 y falló) en ${a.partido}`);
      }
    });
  });
  const total = acierto + fallo;
  if (total > 0) {
    const pct = Math.round((acierto / total) * 100);
    ctx += `\nTasa de acierto histórica en mercados calificados: ${pct}% (${acierto}/${total}).`;
    if (pct < 50) ctx += " Estás fallando más de lo que aciertas — sé MÁS conservador, baja las notas que pongas.";
  }
  if (fallosNotaAlta.length) {
    ctx += "\n⚠️ Mercados que calificaste ALTO pero fallaron (no repitas el error):\n" + fallosNotaAlta.slice(0, 6).map(f => `- ${f}`).join("\n");
  }
  ctx += "\nUsa este registro para calibrar mejor tus calificaciones en este análisis.";
  return ctx;
}

// ── PESO BADGE ───────────────────────────────────────────────────────────────
function PesoBadge({ peso }) {
  const filled = Math.round((peso / 10) * 8);
  const color = peso >= 8 ? "#34d399" : peso >= 6 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "4px 10px", border: `1px solid ${color}25` }}>
      <div style={{ display: "flex", gap: 2 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ width: 5, height: 10, borderRadius: 2, background: i < filled ? color : "rgba(255,255,255,.08)" }} />
        ))}
      </div>
      <span style={{ fontSize: 10, fontWeight: 800, color }}>{peso}/10 · {peso >= 8 ? "Análisis sólido" : peso >= 6 ? "Análisis moderado" : "Análisis débil"}</span>
    </div>
  );
}

// ── ESCALA DE CONFIANZA ──────────────────────────────────────────────────────
function getConfidenceScale(confianza) {
  if (confianza >= 85) return { icon: "🟢", label: "Muy Alta", color: "#34d399", bg: "rgba(52,211,153,.12)", border: "rgba(52,211,153,.3)" };
  if (confianza >= 78) return { icon: "🟢", label: "Alta", color: "#86efac", bg: "rgba(134,239,172,.10)", border: "rgba(134,239,172,.25)" };
  if (confianza >= 70) return { icon: "🟡", label: "Media", color: "#fbbf24", bg: "rgba(251,191,36,.10)", border: "rgba(251,191,36,.25)" };
  if (confianza >= 62) return { icon: "🟠", label: "Baja", color: "#fb923c", bg: "rgba(251,146,60,.10)", border: "rgba(251,146,60,.25)" };
  return { icon: "🔴", label: "Evitar", color: "#f87171", bg: "rgba(248,113,113,.10)", border: "rgba(248,113,113,.25)" };
}

function calcProbabilidades(confianza, cuota) {
  const conf = toNum(confianza);
  const odd = toNum(cuota);
  if (!conf || !odd || odd <= 1) return null;
  const probImplicita = (1 / odd) * 100;
  const edge = conf - probImplicita;
  const ev = ((conf / 100) * (odd - 1) - (1 - conf / 100)) * 100;
  return {
    probIA: conf.toFixed(1),
    probImplicita: probImplicita.toFixed(1),
    edge: edge.toFixed(1),
    ev: ev.toFixed(1),
    hasValue: edge > 0,
  };
}
// ── TEAM AUTOCOMPLETE ─────────────────────────────────────────────────────────
function TeamAutocomplete({ value, onChange, placeholder, style, equipos, onSelect }) {
  const [show, setShow] = useState(false);
  const allNames = useMemo(() => {
    const names = new Set();
    (equipos || []).forEach(e => names.add(e.nombre));
    return [...names];
  }, [equipos]);
  const filtered = value.trim().length >= 1
    ? allNames.filter(n => n.toLowerCase().includes(value.toLowerCase())).slice(0, 6)
    : [];
  return (
    <div style={{ position: "relative" }}>
      <input value={value} onChange={e => { onChange(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)} onBlur={() => setTimeout(() => setShow(false), 150)}
        placeholder={placeholder} style={style} />
      {show && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999, background: "rgba(15,23,42,.98)", border: "1px solid rgba(99,102,241,.3)", borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.5)", marginTop: 2 }}>
          {filtered.map(name => {
            const dep = (equipos||[]).find(e => e.nombre === name)?.deporte;
            return (
              <button key={name} onMouseDown={() => { (onSelect || onChange)(name); setShow(false); }}
                style={{ width: "100%", padding: "8px 14px", textAlign: "left", background: "none", border: "none", color: "#e0e7ff", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span>{dep === "mlb" ? "⚾" : dep === "nba" ? "🏀" : "⚽"}</span>
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Toast({ msg, type, onClose }) {
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: type === "success" ? "rgba(5,150,105,.95)" : type === "error" ? "rgba(185,28,28,.95)" : "rgba(30,27,75,.95)", border: `1px solid ${type === "success" ? "rgba(52,211,153,.4)" : type === "error" ? "rgba(239,68,68,.4)" : "rgba(99,102,241,.3)"}`, borderRadius: 14, padding: "12px 20px", color: "#fff", fontSize: 13, fontWeight: 700, boxShadow: "0 8px 32px rgba(0,0,0,.4)", display: "flex", alignItems: "center", gap: 10, maxWidth: 320, animation: "slideIn .2s ease" }}>
      <span>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.6)", cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>
    </div>
  );
}

// ── FAVORITOS PROMPT ─────────────────────────────────────────────────────────
function buildPartidosPrompt(favoritos) {
  const hoy = new Date().toISOString().slice(0, 10);
  const lista = favoritos.map(f => `- ${f.nombre} (${f.tipo === "seleccion" ? "Selección" : "Club"}${f.ligas?.length ? ": " + f.ligas.join(", ") : ""})`).join("\n");
  return `Busca los próximos partidos (hoy ${hoy} y los siguientes 3 días) de estos equipos:\n${lista}\n\nResponde SOLO con este JSON sin backticks:\n{"partidos":[{"local":"nombre","visitante":"nombre","liga":"competencia","fecha":"YYYY-MM-DD","hora":"HH:MM","tipo":"club o seleccion","equipoFavorito":"nombre del favorito que aparece"}],"busquedaFecha":"${hoy}","resumen":"resumen breve"}`;
}

// ── TIMING DEL ANÁLISIS ──────────────────────────────────────────────────────
function getTimingStatus(matchDateTime, sport) {
  if (!matchDateTime) return null;
  const now = new Date();
  const match = new Date(matchDateTime);
  const diffMs = match - now;
  const diffHours = diffMs / 1000 / 3600;
  if (diffHours < -2) return { status: "finished", color: "#475569", icon: "⚫", title: "Partido ya terminó", msg: "Este partido ya finalizó.", canAnalyze: false, canOverride: false };
  if (diffHours < 0) return { status: "live", color: "#fbbf24", icon: "🔴", title: "Partido en curso", msg: "El partido ya comenzó.", canAnalyze: false, canOverride: false };
  const ranges = { futbol: { ideal: [2, 6], tooEarly: 24 }, mlb: { ideal: [3, 6], tooEarly: 12 }, nba: { ideal: [1, 4], tooEarly: 8 } };
  const r = ranges[sport] || ranges.futbol;
  const tips = { futbol: "Las alineaciones salen 2-3h antes.", mlb: "El pitcher se confirma 2-3h antes.", nba: "El injury report sale 1h antes." };
  if (diffHours <= r.ideal[1] && diffHours >= r.ideal[0]) return { status: "ideal", color: "#34d399", icon: "🟢", title: "Momento ideal para analizar", msg: `Faltan ${diffHours.toFixed(1)}h — ${tips[sport]}`, canAnalyze: true, canOverride: false };
  if (diffHours < r.ideal[0]) return { status: "close", color: "#fbbf24", icon: "🟡", title: "Muy cerca del partido", msg: `Faltan ${(diffHours * 60).toFixed(0)} minutos. Verifica alineaciones.`, canAnalyze: true, canOverride: false };
  if (diffHours <= r.tooEarly * 0.5) return { status: "early", color: "#fb923c", icon: "🟠", title: "Un poco pronto", msg: `Faltan ${diffHours.toFixed(1)}h. ${tips[sport]}`, canAnalyze: false, canOverride: true };
  return { status: "tooEarly", color: "#f87171", icon: "🔴", title: "Demasiado pronto", msg: `Faltan ${diffHours.toFixed(0)}h. Los datos clave no están confirmados.`, canAnalyze: false, canOverride: true };
}

export default function App() {
  const isMobile = useIsMobile();

  // ── STATES ───────────────────────────────────────────────────────────────
  const [activeSport, setActiveSport] = useState("futbol");
  const [modoMundial, setModoMundial] = useState(false);
  const [match, setMatch] = useState(emptyMatch());
  const [aiStatus, setAiStatus] = useState("idle");
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");
  const [picks, setPicks] = useState([]);
  const [marketFilter, setMarketFilter] = useState("Todos");
  const [activeTab, setActiveTab] = useState("analisis");
  const [ticketStake, setTicketStake] = useState("10");
  const [esParlay, setEsParlay] = useState(true);
  const [cuotaManual, setCuotaManual] = useState("");        // cuota total escrita a mano (estilo Hondubet)
  const [cuotaManualActiva, setCuotaManualActiva] = useState(false);
  const [toast, setToast] = useState(null);
  const [expertMode, setExpertMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [bankroll, setBankroll] = useState(() => loadState(BK, emptyBankroll()));
  const [historial, setHistorial] = useState(() => loadState(HK, []));
  const [reviews, setReviews] = useState(() => loadState(RK, []));
  const [jornadas, setJornadas] = useState(() => loadState(JK, []));
  const [grupoCtx, setGrupoCtx] = useState(() => loadState(GK, emptyGrupoCtx()));
  const [mundialRapido, setMundialRapido] = useState(false);
  const [gruposGuardados, setGruposGuardados] = useState(() => loadState(GLK, {}));   // { "A": {grupo, equipos, resultadosPrevios}, ... }
  const [analisisGuardados, setAnalisisGuardados] = useState(() => loadState(ANK, []));  // análisis completos para revisar tras el partido
  const [showGruposIO, setShowGruposIO] = useState(false);                            // panel de exportar/importar
  const [favoritos, setFavoritos] = useState(() => loadState(FK, []));
  const [equipos, setEquipos] = useState(() => loadState(EK, [])); // team profiles
  const [betDraft, setBetDraft] = useState(emptyBet());
  const [jornadaDraft, setJornadaDraft] = useState(emptyJornada());
  const [favDraft, setFavDraft] = useState({ nombre: "", tipo: "club", ligas: "" });
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDraft, setReviewDraft] = useState(null);
  const [buscandoPartidos, setBuscandoPartidos] = useState(false);
  const [partidosBusqueda, setPartidosBusqueda] = useState(() => loadState("partidos_busqueda_v1", null));
  const [dailyLossLimit, setDailyLossLimit] = useState(() => loadState("daily_loss_limit_v1", 20));
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [mundialCtx, setMundialCtx] = useState({
    fase: "grupos",
    jornada: "J1",
    localClasificado: false,
    visitanteClasificado: false,
    localEliminado: false,
    visitanteEliminado: false,
    diasDescansoLocal: "",
    diasDescansoVisitante: "",
  });
  const [datosExtra, setDatosExtra] = useState({
    titularLocal: "", titularVisitante: "", bajasClave: "", arbitro: "", notaArbitro: "",
    eraUltimas3Local: "", eraUltimas3Visitante: "", umpire: "", vientoMph: "", vientoDir: "",
    lesionesHoy: "", minutosLimitados: "",
  });
  const [equipoSearch, setEquipoSearch] = useState("");
  const [equipoSeleccionado, setEquipoSeleccionado] = useState(null);
  const [partidoDraft, setPartidoDraft] = useState(null);
  const [eventoInput, setEventoInput] = useState("");
  const [matchDateTime, setMatchDateTime] = useState("");
  const [timingOverride, setTimingOverride] = useState(false);
  const [userNote, setUserNote] = useState("");
  const [showLineAnalyzer, setShowLineAnalyzer] = useState(false);
  const [lineInputs, setLineInputs] = useState({});
  const [lineAnalysis, setLineAnalysis] = useState(null);
  const [analyzingLines, setAnalyzingLines] = useState(false);
  const [validatingTicket, setValidatingTicket] = useState(false);
  const [ticketValidation, setTicketValidation] = useState(null);
  const [verifyingValue, setVerifyingValue] = useState(false);
  const [showBankHistory, setShowBankHistory] = useState(false);

  const resultsRef = useRef(null);
  const importRef = useRef(null);

  // ── EFFECTS ───────────────────────────────────────────────────────────────
  useEffect(() => { setMounted(true); }, []);
  // Restaurar último análisis guardado DESPUÉS de montar (evita hydration mismatch con el servidor).
  useEffect(() => {
    const saved = loadState(AIK, null);
    if (!saved) return;
    if (saved.activeSport && saved.activeSport === "futbol") setActiveSport(saved.activeSport);
    if (saved.modoMundial) setModoMundial(true);
    if (saved.match) setMatch(saved.match);
    if (saved.aiResult) { setAiResult(saved.aiResult); setAiStatus("done"); }
    if (saved.picks) setPicks(saved.picks);
  }, []);
  useEffect(() => { saveState(BK, bankroll); }, [bankroll]);
  useEffect(() => { saveState(HK, historial); }, [historial]);
  useEffect(() => { saveState(RK, reviews); }, [reviews]);
  useEffect(() => { saveState(JK, jornadas); }, [jornadas]);
  useEffect(() => { saveState(GK, grupoCtx); }, [grupoCtx]);
  useEffect(() => { saveState(GLK, gruposGuardados); }, [gruposGuardados]);
  useEffect(() => { saveState(ANK, analisisGuardados); }, [analisisGuardados]);

  // Auto-guardado: cuando editas la tabla y hay un grupo con nombre, guarda solo (con debounce).
  useEffect(() => {
    const letra = (grupoCtx.grupo || "").trim().toUpperCase();
    if (!letra) return;
    const tieneAlgo = grupoCtx.equipos.some(e => e.nombre && e.nombre.trim());
    if (!tieneAlgo) return;
    const t = setTimeout(() => {
      setGruposGuardados(prev => ({ ...prev, [letra]: { grupo: letra, equipos: grupoCtx.equipos.map(e => ({ ...e })), resultadosPrevios: grupoCtx.resultadosPrevios } }));
    }, 800);
    return () => clearTimeout(t);
  }, [grupoCtx]);
  useEffect(() => { saveState(FK, favoritos); }, [favoritos]);
  useEffect(() => { saveState(EK, equipos); }, [equipos]);
  useEffect(() => { saveState("daily_loss_limit_v1", dailyLossLimit); }, [dailyLossLimit]);

  // Si cambia la cantidad de picks seleccionados, la cuota manual ya no corresponde → reset a auto
  const numSeleccionados = picks.filter(p => p.seleccionado).length;
  useEffect(() => {
    if (cuotaManualActiva) { setCuotaManualActiva(false); setCuotaManual(""); }
  }, [numSeleccionados]);

  const dashboard = calcDashboard(bankroll, reviews);

  const showToast = (msg, type = "success") => {
    setToast({ id: makeId(), msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const sport = SPORTS[activeSport] || SPORTS.futbol;

  const togglePickSel = (id) => setPicks(prev => prev.map(p => p.id === id ? { ...p, seleccionado: !p.seleccionado, enTicket: !p.seleccionado } : p));
  const updatePickOdd = (id, val) => setPicks(prev => prev.map(p => p.id === id ? { ...p, cuotaCasa: val } : p));

  const ticket = (() => {
    const sel = picks.filter(p => p.seleccionado);
    if (!sel.length) return { count: 0, combinada: 1, combinadaAuto: 1, manual: false, potencial: 0, probReal: 0, value: 0 };
    const stake = toNum(ticketStake) || 10;
    if (esParlay) {
      // Auto = multiplicación de cuotas (parlay real)
      const combinadaAuto = sel.reduce((acc, p) => acc * (toNum(p.cuotaCasa) || toNum(p.cuotaSugerida) || 1), 1);
      // Si el usuario escribió cuota manual (la que da Hondubet con sus ajustes), usar esa
      const cuotaUser = toNum(cuotaManual);
      const usarManual = cuotaManualActiva && cuotaUser > 1;
      const combinada = usarManual ? cuotaUser : combinadaAuto;
      const potencial = stake * combinada;
      const probReal = sel.reduce((acc, p) => acc * (toNum(p.confianza) / 100), 1) * 100;
      const implied = combinada > 0 ? (1 / combinada) * 100 : 0;
      return { count: sel.length, combinada, combinadaAuto, manual: usarManual, potencial, probReal, value: probReal - implied };
    } else {
      // Individual: cada pick es una apuesta aparte. NO se promedia ni multiplica.
      const potencial = sel.reduce((s, p) => s + (toNum(p.cuotaCasa) || toNum(p.cuotaSugerida) || 1) * stake, 0);
      return { count: sel.length, combinada: 0, combinadaAuto: 0, manual: false, potencial, probReal: 0, value: 0 };
    }
  })();

  const guardarGrupoActual = () => {
    const nombre = (grupoCtx.grupo || "").trim().toUpperCase();
    if (!nombre) { showToast("Escribe el nombre del grupo (ej: A) antes de guardar", "error"); return; }
    const tieneEquipos = grupoCtx.equipos.some(e => e.nombre && e.nombre.trim());
    if (!tieneEquipos) { showToast("Llena al menos un equipo antes de guardar", "error"); return; }
    setGruposGuardados(prev => ({ ...prev, [nombre]: { grupo: nombre, equipos: grupoCtx.equipos.map(e => ({ ...e })), resultadosPrevios: grupoCtx.resultadosPrevios } }));
    showToast(`✅ Grupo ${nombre} guardado`, "success");
  };

  const cargarGrupo = (nombre) => {
    const g = gruposGuardados[nombre];
    if (!g) return;
    setGrupoCtx({ grupo: g.grupo, equipos: g.equipos.map(e => ({ ...e })), resultadosPrevios: g.resultadosPrevios || "" });
    showToast(`📥 Grupo ${nombre} cargado`, "success");
  };

  // Carga un grupo desde el menú: usa datos guardados si existen, si no la base fija de equipos.
  const seleccionarGrupoMundial = (letra) => {
    if (!letra) return;
    const guardado = gruposGuardados[letra];
    if (guardado && Array.isArray(guardado.equipos) && guardado.equipos.some(e => e.nombre)) {
      setGrupoCtx({ grupo: letra, equipos: guardado.equipos.map(e => ({ ...e })), resultadosPrevios: guardado.resultadosPrevios || "" });
      showToast(`📥 Grupo ${letra} cargado (con tus datos guardados)`, "success");
    } else {
      const base = (MUNDIAL_GRUPOS[letra] || []).map(nombre => ({ ...emptyGrupoEquipo(), nombre }));
      while (base.length < 4) base.push(emptyGrupoEquipo());
      setGrupoCtx({ grupo: letra, equipos: base, resultadosPrevios: "" });
      showToast(`🏆 Grupo ${letra} cargado (equipos base)`, "success");
    }
  };

  const eliminarGrupoGuardado = (nombre) => {
    setGruposGuardados(prev => { const copy = { ...prev }; delete copy[nombre]; return copy; });
    showToast(`Grupo ${nombre} eliminado`, "success");
  };

  const exportarGrupos = () => {
    try {
      // Respaldo COMPLETO: todas las claves de la app
      const claves = [SK, BK, HK, RK, JK, GK, GLK, ANK, FK, AIK, EK];
      const respaldo = { _tipo: "betanalyzer_backup", _fecha: new Date().toISOString(), datos: {} };
      claves.forEach(k => {
        const v = loadState(k, null);
        if (v !== null) respaldo.datos[k] = v;
      });
      const txt = JSON.stringify(respaldo, null, 2);
      const blob = new Blob([txt], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const fecha = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `betanalyzer-respaldo-${fecha}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("📤 Respaldo completo descargado", "success");
    } catch (err) {
      console.error("exportarGrupos:", err);
      showToast("Error al exportar el respaldo", "error");
    }
  };

  const importarGruposArchivo = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result || ""));
        // Soporta respaldo completo nuevo Y archivos viejos de solo-grupos
        let datos;
        if (parsed && parsed._tipo === "betanalyzer_backup" && parsed.datos) {
          datos = parsed.datos;
        } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          // Archivo viejo (solo grupos): lo metemos bajo la clave de grupos
          datos = { [GLK]: parsed };
        } else {
          throw new Error("Formato inválido");
        }
        if (!confirm("Esto REEMPLAZARÁ todos los datos de este dispositivo con los del archivo. ¿Continuar?")) return;
        // Escribir cada clave en storage y refrescar
        Object.entries(datos).forEach(([k, v]) => { try { saveState(k, v); } catch (e) { console.error("import key", k, e); } });
        showToast("📥 Respaldo importado. Recargando…", "success");
        setShowGruposIO(false);
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        console.error("importarGruposArchivo:", err);
        showToast("Archivo inválido. Usa uno exportado por la app.", "error");
      }
    };
    reader.onerror = () => showToast("No se pudo leer el archivo", "error");
    reader.readAsText(file);
  };

  const saveTicket = () => {
    const sel = picks.filter(p => p.seleccionado);
    if (!sel.length) { showToast("Selecciona al menos un pick", "error"); return; }
    const stake = toNum(ticketStake) || 10;
    const t = {
      id: makeId(), fecha: new Date().toISOString().slice(0, 10),
      partido: `${match.local} vs ${match.visitante}`,
      local: match.local, visitante: match.visitante, liga: match.liga,
      deporte: activeSport,
      picks: sel.map(p => ({ ...p })),
      stake, esParlay,
      cuotaTotal: esParlay ? ticket.combinada : 0,
      cuotaAuto: esParlay ? ticket.combinadaAuto : 0,
      cuotaManual: ticket.manual,
      potencial: ticket.potencial,
      estado: "pendiente", resumenIA: aiResult?.resumen || "",
      pronosticoIA: aiResult?.pronostico || "",
    };
    setHistorial(prev => [t, ...prev]);
    showToast("✅ Ticket guardado en historial", "success");
  };

  // Guarda el análisis completo actual (con mercados calificados) para revisarlo tras el partido.
  const guardarAnalisisParaRevisar = () => {
    if (!aiResult) { showToast("Primero analiza un partido", "error"); return; }
    const registro = {
      id: makeId(),
      fecha: new Date().toISOString(),
      partido: `${match.local} vs ${match.visitante}`,
      local: match.local, visitante: match.visitante,
      deporte: activeSport, modoMundial,
      grupo: modoMundial ? (grupoCtx.grupo || "") : "",
      mercadosCalificados: (aiResult.mercadosCalificados || []).map(m => ({ ...m, resultado: "pendiente" })),
      mejorApuesta: aiResult.mejorApuesta || null,
      apuestaEvitar: aiResult.apuestaEvitar || null,
      trampasMercado: aiResult.trampasMercado || [],
      pronostico: aiResult.pronostico || "",
      perfilPartido: aiResult.perfilPartido || "",
      marcadorEsperado: aiResult.marcadorEsperado || null,
      resultadoReal: { golesLocal: "", golesVisita: "", tarjetas: "", corners: "", notas: "" },
    };
    setAnalisisGuardados(prev => [registro, ...prev]);
    showToast("📌 Análisis guardado para revisar tras el partido", "success");
  };

  const openReviewModal = (ticket) => {
    setReviewDraft({
      ...emptyReview(), id: makeId(), fecha: new Date().toISOString(),
      partido: ticket.partido, local: ticket.local || "", visitante: ticket.visitante || "",
      liga: ticket.liga || "", modo: ticket.modo || "clubes",
      deporte: ticket.deporte || activeSport || "futbol",
      resumenIA: ticket.resumenIA || "", pronosticoIA: ticket.pronosticoIA || "",
      ticketId: ticket.id,
      picks: (ticket.picks || []).map(p => ({
        id: p.id, mercado: p.mercado, linea: p.linea, tipo: p.tipo,
        confianza: p.confianza, cuotaCasa: p.cuotaCasa, resultado: "pendiente",
        justificacion: p.justificacion || "",
      })),
      resultadoReal: { golesLocal: "", golesVisita: "", notas: "" },
    });
    setShowReviewModal(true);
  };

  const saveReview = () => {
    if (!reviewDraft) return;
    const aciertos = reviewDraft.picks.filter(p => p.resultado === "acierto").length;
    const fallos = reviewDraft.picks.filter(p => p.resultado === "fallo").length;
    const finalReview = { ...reviewDraft, totalPicks: reviewDraft.picks.length, aciertos, fallos };
    setReviews(prev => [finalReview, ...prev.filter(r => r.id !== finalReview.id)]);
    setShowReviewModal(false);
    setReviewDraft(null);
    showToast(`✅ Review guardado: ${aciertos}/${aciertos + fallos} picks correctos`, "success");
  };

  const saveJornada = () => {
    if (!jornadaDraft.seleccion.trim() || !jornadaDraft.rival.trim()) { showToast("Completa selección y rival", "error"); return; }
    setJornadas(prev => [...prev, { ...jornadaDraft, id: makeId() }]);
    setJornadaDraft(emptyJornada());
    showToast("✅ Jornada guardada", "success");
  };

  const importData = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.activeSport) setActiveSport(data.activeSport);
        if (data.modoMundial) setModoMundial(true);
        if (data.match) setMatch(data.match);
        if (data.picks) setPicks(data.picks);
        if (data.aiResult) { setAiResult(data.aiResult); setAiStatus("done"); }
        if (typeof data.userNote === "string") setUserNote(data.userNote);
        if (data.datosExtra) setDatosExtra(d => ({ ...d, ...data.datosExtra }));
        if (typeof data.matchDateTime === "string") setMatchDateTime(data.matchDateTime);
        if (typeof data.useWebSearch === "boolean") setUseWebSearch(data.useWebSearch);
        if (data.grupoCtx) setGrupoCtx(data.grupoCtx);
        // Compatibilidad con respaldos viejos que traían todo
        if (data.bankroll) setBankroll(data.bankroll);
        if (data.historial) setHistorial(data.historial);
        if (data.reviews) setReviews(data.reviews);
        if (Array.isArray(data.favoritos)) setFavoritos(data.favoritos);
        setActiveTab("analisis");
        showToast("📂 Análisis cargado", "success");
      } catch (err) { console.error("importData:", err); showToast("Archivo inválido", "error"); }
    };
    reader.readAsText(file);
  };

  // ── FAVORITOS ──────────────────────────────────────────────────────────
  const addFavorito = () => {
    if (!favDraft.nombre.trim()) { showToast("Ingresa el nombre del equipo o selección", "error"); return; }
    const ligasArr = favDraft.ligas.split(",").map(l => l.trim()).filter(Boolean);
    setFavoritos(prev => [...prev, { id: makeId(), nombre: favDraft.nombre.trim(), tipo: favDraft.tipo, ligas: ligasArr }]);
    setFavDraft({ nombre: "", tipo: "club", ligas: "" });
    showToast("⭐ Favorito agregado", "success");
  };
  const removeFavorito = (id) => setFavoritos(prev => prev.filter(f => f.id !== id));

  const buscarPartidos = useCallback(async () => {
    if (!favoritos.length) { showToast("Agrega al menos un favorito primero", "error"); return; }
    setBuscandoPartidos(true);
    setPartidosBusqueda(null);
    try {
      const resp = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 2000,
          useWebSearch: true,
          messages: [{ role: "user", content: buildPartidosPrompt(favoritos) }],
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error?.message || `Error ${resp.status}`);
      const finalText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const parsed = extractJSON(finalText);
      setPartidosBusqueda({ ...parsed, savedAt: new Date().toISOString() });
      saveState("partidos_busqueda_v1", { ...parsed, savedAt: new Date().toISOString() });
      showToast(`✅ ${parsed.partidos?.length || 0} partidos encontrados`, "success");
    } catch (err) {
      showToast(`❌ Error al buscar: ${err.message}`, "error");
    }
    setBuscandoPartidos(false);
  }, [favoritos]);

  const cargarPartido = (p) => {
    setMatch({ local: p.local, visitante: p.visitante, liga: p.liga, oddLocal: "", oddDraw: "", oddVisit: "", modo: p.tipo === "seleccion" ? "mundial" : "clubes" });
    if (p.tipo === "seleccion") setModoMundial(true);
    setActiveTab("analisis");
    setAiStatus("idle"); setAiResult(null); setPicks([]);
    showToast(`✅ ${p.local} vs ${p.visitante} cargado`, "success");
  };
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
  const iaStats = calcIAStats(reviews);

  const lastSettled = bankroll.apuestas.filter(b => b.estado === "ganada" || b.estado === "perdida");
  let streak = 0;
  for (const b of lastSettled) { if (b.estado === "perdida") streak++; else break; }

  const today = new Date().toISOString().slice(0, 10);
  const todayLoss = Math.abs(Math.min(0, bankroll.apuestas.filter(b => b.fecha === today && (b.estado === "ganada" || b.estado === "perdida")).reduce((s, b) => s + betProfit(b), 0)));
  const dailyLimitAmt = toNum(bankroll.inicial) * toNum(dailyLossLimit) / 100;
  const dailyExceeded = dailyLimitAmt > 0 && todayLoss >= dailyLimitAmt;

  const clearAll = () => {
    if (!window.confirm("¿Limpiar partido actual? El bankroll e historial se conservan.")) return;
    setMatch(emptyMatch()); setAiStatus("idle"); setAiResult(null); setPicks([]); setAiError(""); setMarketFilter("Todos"); setActiveTab("analisis"); setModoMundial(false); setUserNote(""); setMatchDateTime(""); setTimingOverride(false); setTicketValidation(null);
    setMundialCtx({ fase: "grupos", jornada: "J1", localClasificado: false, visitanteClasificado: false, localEliminado: false, visitanteEliminado: false, diasDescansoLocal: "", diasDescansoVisitante: "" });
    setDatosExtra({ titularLocal: "", titularVisitante: "", bajasClave: "", arbitro: "", notaArbitro: "", eraUltimas3Local: "", eraUltimas3Visitante: "", umpire: "", vientoMph: "", vientoDir: "", lesionesHoy: "", minutosLimitados: "" });
    saveState(AIK, null);
  };

  const validateTicket = async () => {
    const ticketPicks = picks.filter(p => p.enTicket || p.seleccionado);
    if (ticketPicks.length < 2) return;
    setValidatingTicket(true); setTicketValidation(null);
    try {
      const picksCtx = ticketPicks.map((p, i) => `Pick ${i+1}: "${p.mercado}${p.linea ? ` ${p.linea}` : ""}" (${p.tipo?.toUpperCase()}) — ${p.confianza}% — ${p.justificacion || ""}`).join("\n");
      const prompt = `Analiza este ticket y detecta contradicciones.\nPartido: ${match.local} vs ${match.visitante}\n\n${picksCtx}\n\nResponde SOLO con JSON sin backticks:\n{"status":"ok","alerts":[{"tipo":"contradiccion","picks":"Pick 1 y Pick 2","mensaje":"razón","accion":"qué hacer","severidad":"alta"}],"mejorTicket":"cuáles conservar","consejo":"consejo final"}`;
      const resp = await fetch("/api/ai-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: AI_MODEL, max_tokens: 800, useWebSearch: false, messages: [{ role: "user", content: prompt }] }) });
      const data = await resp.json();
      const text = (data.content || []).find(b => b.type === "text")?.text || "";
      setTicketValidation(extractJSON(text));
    } catch (err) { console.error("validateTicket:", err); setTicketValidation({ status: "ok", alerts: [], consejo: "Error al validar." }); }
    finally { setValidatingTicket(false); }
  };

  const verifyValue = async () => {
    const withOdds = picks.filter(p => toNum(p.cuotaCasa) > 1);
    if (!withOdds.length) return;
    setVerifyingValue(true);
    try {
      const ctx = withOdds.map(p => `${p.mercado} ${p.linea||""} — Cuota: ${p.cuotaCasa} — Confianza IA: ${p.confianza}%`).join("\n");
      const prompt = `Verifica el value de estos picks para ${match.local} vs ${match.visitante}:\n${ctx}\n\nPara cada pick calcula: prob implícita, compara con confianza IA, determina si hay value positivo o negativo. Responde en texto conciso.`;
      const resp = await fetch("/api/ai-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: AI_MODEL, max_tokens: 600, useWebSearch: false, messages: [{ role: "user", content: prompt }] }) });
      const data = await resp.json();
      const text = (data.content || []).find(b => b.type === "text")?.text || "";
      showToast(text.slice(0, 120) + "...", "success");
    } catch (err) { console.error("verifyValue:", err); showToast("Error al verificar value", "error"); }
    finally { setVerifyingValue(false); }
  };

  const analyzeLines = async () => {
    const markets = detectTotalMarkets(picks);
    const filled = markets.filter(m => { const i = lineInputs[m.key]||{}; return i.overLine && i.overOdd && i.underLine && i.underOdd; });
    if (!filled.length) return;
    setAnalyzingLines(true); setLineAnalysis(null);
    try {
      const ctx = filled.map(m => { const i = lineInputs[m.key]; return `${m.label}: Over ${i.overLine} @${i.overOdd} | Under ${i.underLine} @${i.underOdd}`; }).join("\n");
      const prompt = `Detecta líneas infladas para ${match.local} vs ${match.visitante}:\n${ctx}\n\nAnaliza probabilidades implícitas y detecta value. Responde SOLO con JSON sin backticks:\n{"mercados":[{"mercado":"nombre","lineaOver":"2.5","cuotaOver":"1.75","probImplicitaOver":"57%","lineaUnder":"2.5","cuotaUnder":"2.05","probImplicitaUnder":"49%","margenCasa":"6%","valueReal":"under","razon":"explicación","alerta":"alerta"}],"mejorApuesta":"descripción","advertencia":""}`;
      const resp = await fetch("/api/ai-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: AI_MODEL, max_tokens: 1000, useWebSearch: false, messages: [{ role: "user", content: prompt }] }) });
      const data = await resp.json();
      const text = (data.content || []).find(b => b.type === "text")?.text || "";
      setLineAnalysis(extractJSON(text));
    } catch (err) { console.error("analyzeLines:", err); setLineAnalysis({ mercados: [], mejorApuesta: "Error al analizar." }); }
    finally { setAnalyzingLines(false); }
  };

  const runAIAnalysis = async () => {
    if (!match.local.trim() || !match.visitante.trim()) { showToast("Ingresa ambos equipos", "error"); return; }
    setAiStatus("loading"); setAiError(""); setAiResult(null); setPicks([]); setTicketValidation(null);
    try {
      const feedbackCtx = buildFeedbackContext(reviews);
      const jornadaCtx = buildJornadaContext(jornadas, match.local, match.visitante) + (modoMundial ? buildGrupoContext(grupoCtx) + buildAprendizajeContext(analisisGuardados) : "");
      const memoryCtx = buildTeamMemory(reviews, match.local, match.visitante);
      const teamProfileCtx = buildTeamProfileContext(equipos, match.local, match.visitante, activeSport);
      const notaCtx = userNote.trim() ? `\n\n📝 NOTA DEL ANALISTA (prioridad alta): ${userNote.trim()}` : "";

      // Construir contexto de datos extra
      const extraParts = [];
      if (activeSport === "futbol" || modoMundial) {
        if (datosExtra.titularLocal) extraParts.push(`Alineación/titulares ${match.local}: ${datosExtra.titularLocal}`);
        if (datosExtra.titularVisitante) extraParts.push(`Alineación/titulares ${match.visitante}: ${datosExtra.titularVisitante}`);
        if (datosExtra.bajasClave) extraParts.push(`Bajas clave confirmadas: ${datosExtra.bajasClave}`);
        if (datosExtra.arbitro) extraParts.push(`Árbitro confirmado: ${datosExtra.arbitro}${datosExtra.notaArbitro ? ` — ${datosExtra.notaArbitro}` : ""}`);
      }
      if (activeSport === "mlb") {
        if (datosExtra.eraUltimas3Local) extraParts.push(`ERA pitcher ${match.local} últimas 3 salidas: ${datosExtra.eraUltimas3Local}`);
        if (datosExtra.eraUltimas3Visitante) extraParts.push(`ERA pitcher ${match.visitante} últimas 3 salidas: ${datosExtra.eraUltimas3Visitante}`);
        if (datosExtra.umpire) extraParts.push(`Umpire home plate confirmado: ${datosExtra.umpire}`);
        if (datosExtra.vientoMph) extraParts.push(`Viento: ${datosExtra.vientoMph} mph${datosExtra.vientoDir ? ` dirección ${datosExtra.vientoDir}` : ""}`);
      }
      if (activeSport === "nba") {
        if (datosExtra.lesionesHoy) extraParts.push(`Lesiones/cambios de hoy: ${datosExtra.lesionesHoy}`);
        if (datosExtra.minutosLimitados) extraParts.push(`Minutos limitados confirmados: ${datosExtra.minutosLimitados}`);
      }
      const extraCtx = extraParts.length ? `\n\n🔍 DATOS CLAVE DEL USUARIO (alta prioridad, verificados):\n${extraParts.map(p => `• ${p}`).join("\n")}` : "";
      let prompt;
      if (activeSport === "mlb") prompt = buildMLBPrompt(match, feedbackCtx + notaCtx + memoryCtx + teamProfileCtx + extraCtx);
      else if (activeSport === "nba") prompt = buildNBAPrompt(match, feedbackCtx + notaCtx + memoryCtx + teamProfileCtx + extraCtx);
      else if (modoMundial) prompt = buildMundialPrompt(match, feedbackCtx + notaCtx + extraCtx + teamProfileCtx, jornadaCtx, memoryCtx, mundialCtx, mundialRapido);
      else prompt = buildFutbolPrompt(match, feedbackCtx + notaCtx + extraCtx + teamProfileCtx, jornadaCtx, memoryCtx);

      const resp = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: modoMundial && !mundialRapido ? 8000 : 4000,
          useWebSearch: useWebSearch,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const msg = errData?.error?.message || errData?.message || `Error ${resp.status}`;
        if (msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("billing") || resp.status === 529) {
          throw new Error("créditos insuficientes — recarga en console.anthropic.com");
        }
        throw new Error(msg);
      }
      const data = await resp.json();
      const finalText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const cleaned = finalText.replace(/```json|```/g, "").trim();
      const start = cleaned.indexOf("{");
      if (start === -1) throw new Error("La IA no devolvió JSON válido. Intenta de nuevo.");
      let depth = 0, end = -1;
      for (let ci = start; ci < cleaned.length; ci++) {
        if (cleaned[ci] === "{") depth++;
        else if (cleaned[ci] === "}") { depth--; if (depth === 0) { end = ci; break; } }
      }
      let jsonStr = end > -1 ? cleaned.slice(start, end + 1) : cleaned.slice(start);
      let parsed = null;
      // Intento directo
      try { parsed = JSON.parse(jsonStr); } catch { parsed = null; }
      // Si falló (truncado), recuperación progresiva: cerrar y, si no, ir recortando el final.
      if (!parsed) {
        const intentarCerrar = (s) => {
          let str = s;
          // cerrar cadena abierta
          const quotes = (str.match(/(?<!\\)"/g) || []).length;
          if (quotes % 2 !== 0) str += '"';
          // quitar coma/fragmento colgante
          str = str.replace(/,\s*$/, "").replace(/:\s*$/, ":null").replace(/,\s*([}\]])/g, "$1");
          // balancear
          const ab = (str.match(/\[/g)||[]).length - (str.match(/\]/g)||[]).length;
          const ob = (str.match(/\{/g)||[]).length - (str.match(/\}/g)||[]).length;
          for (let i=0;i<Math.max(0,ab);i++) str+="]";
          for (let i=0;i<Math.max(0,ob);i++) str+="}";
          return str;
        };
        // Primero intenta cerrar tal cual
        try { parsed = JSON.parse(intentarCerrar(jsonStr)); } catch { parsed = null; }
        // Si aún falla, recorta el último elemento incompleto y reintenta, hasta 40 veces
        if (!parsed) {
          let work = jsonStr;
          for (let intento = 0; intento < 40 && !parsed; intento++) {
            // recorta hasta la última coma de nivel superior o el último cierre válido
            const lastComma = work.lastIndexOf(",");
            const lastBrace = Math.max(work.lastIndexOf("}"), work.lastIndexOf("]"));
            const cut = Math.max(lastComma, lastBrace);
            if (cut <= 0) break;
            work = work.slice(0, cut);
            try { parsed = JSON.parse(intentarCerrar(work)); } catch { parsed = null; }
          }
        }
      }
      if (!parsed) {
        console.error("JSON irrecuperable:", jsonStr.slice(-200));
        throw new Error("La IA devolvió una respuesta incompleta. Prueba el modo Rápido o vuelve a intentar.");
      }
      setAiResult(parsed);
      const newPicks = (parsed.picks || []).map(p => {
        const conf = clamp(Number(p.confianza) || 50, 0, 100);
        const cuota = toNum(p.cuotaSugerida) || toNum(p.cuotaCasa) || 0;
        const vr = cuota > 1 ? valueAndRisk(conf, cuota) : { value: 0, ev: 0, roi: 0, color: "gray", label: "Sin datos" };
        const bank = toNum(bankroll.inicial);
        const kelly = cuota > 1 ? kellyStake(conf, cuota, bank) : null;
        return {
          ...emptyPick(), id: makeId(),
          mercado: p.mercado || "", linea: p.linea || "", tipo: p.tipo || "over",
          confianza: conf, prioridad: p.prioridad || "media", pesoAnalisis: toNum(p.pesoAnalisis) || 0,
          justificacion: p.justificacion || "", cuotaSugerida: p.cuotaSugerida || "",
          condicionPartido: p.condicionPartido || "", exigenciaEquipo: p.exigenciaEquipo || "",
          jugador: p.jugador || "", riesgo: p.riesgo || "",
          value: vr.value, ev: vr.ev, roi: vr.roi, color: vr.color, valueLabel: vr.label,
          kellyAmt: kelly?.amount || 0,
        };
      });
      setPicks(newPicks);
      setAiStatus("done");
      // Persist analysis so it survives tab switches and refreshes
      saveState(AIK, { aiResult: parsed, picks: newPicks, match, activeSport, modoMundial });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    } catch (err) {
      setAiStatus("error");
      setAiError(err.message || "Error desconocido");
    }
  };

  const exportData = () => {
    const data = {
      _tipo: "analisis_partido",
      _fecha: new Date().toISOString(),
      match, picks, aiResult, activeSport, modoMundial,
      userNote, datosExtra, matchDateTime, useWebSearch,
      grupoCtx: modoMundial ? grupoCtx : null,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    const matchName = match.local && match.visitante ? `${match.local}_vs_${match.visitante}`.replace(/[^a-zA-Z0-9_áéíóúÁÉÍÓÚüÜñÑ-]/g, "_").slice(0, 50) : "analisis";
    a.download = `${matchName}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(aiResult ? "⬇️ Análisis del partido descargado" : "⬇️ Datos del partido guardados", "success");
  };

  const currentFilters = MARKET_FILTERS_BY_SPORT[activeSport] || MARKET_FILTERS_BY_SPORT.futbol;
  const cleanFilter = (f) => f.replace(/[^\w\s\/ªáéíóúüñÁÉÍÓÚÜÑ·-]/g, "").trim();
  const filteredPicks = picks.filter(p => matchesFilterMulti(p, cleanFilter(marketFilter), activeSport));
  const hasFeedback = reviews.length >= 3;

  // ── TABS ───────────────────────────────────────────────────────────────
  const tabs = [
    { id: "analisis", label: "🔍 Análisis" },
    { id: "picks", label: "🎯 Picks" },
    { id: "ticket", label: "🧾 Ticket" },
    { id: "bankroll", label: "💼 Bankroll" },
    { id: "historial", label: "📚 Historial" },
    { id: "ia-review", label: "🆚 IA vs Real" },
    { id: "ia-stats", label: "📈 Stats IA" },
    { id: "equipos", label: "🏟️ Equipos" },
    { id: "favoritos", label: "⭐ Favoritos" },
    ...(modoMundial ? [{ id: "jornadas", label: "🏆 Jornadas" }] : []),
    ...(modoMundial ? [{ id: "aprendizaje", label: "🧠 Aprendizaje IA" }] : []),
  ];

  // ── INPUT STYLE ────────────────────────────────────────────────────────
  const inputStyle = { width: "100%", background: "rgba(15,23,42,.7)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "10px 12px", color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box", transition: "border-color .2s" };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" };

  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: `#020817`, backgroundImage: sport.bgGradient || "", minHeight: "100vh", color: "#f1f5f9", transition: "background-image .4s ease" }}>
      {/* Background */}
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(99,102,241,.15), transparent), radial-gradient(ellipse 40% 30% at 80% 80%, rgba(16,185,129,.06), transparent)", pointerEvents: "none", zIndex: 0 }} />
      {/* Sport themed pattern (muy sutil, en todo el fondo) */}
      {sport.pattern && (
        <div style={{ position: "fixed", inset: 0, backgroundImage: sport.pattern, backgroundRepeat: "repeat", backgroundSize: "240px", opacity: 0.06, pointerEvents: "none", zIndex: 0, transition: "opacity .4s ease" }} />
      )}

      {/* TOAST */}
      {toast && <Toast key={toast.id} msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── REVIEW MODAL ─────────────────────────────────────────────────── */}
      {showReviewModal && reviewDraft && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
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

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>Resultado real</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>{reviewDraft.local || "Local"} {reviewDraft.deporte === "mlb" ? "(carreras)" : reviewDraft.deporte === "nba" ? "(puntos)" : "(goles)"}</label>
                  <input type="number" value={reviewDraft.resultadoReal.golesLocal}
                    onChange={e => setReviewDraft(r => ({ ...r, resultadoReal: { ...r.resultadoReal, golesLocal: e.target.value } }))}
                    placeholder="0" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>{reviewDraft.visitante || "Visitante"} {reviewDraft.deporte === "mlb" ? "(carreras)" : reviewDraft.deporte === "nba" ? "(puntos)" : "(goles)"}</label>
                  <input type="number" value={reviewDraft.resultadoReal.golesVisita}
                    onChange={e => setReviewDraft(r => ({ ...r, resultadoReal: { ...r.resultadoReal, golesVisita: e.target.value } }))}
                    placeholder="0" style={inputStyle} />
                </div>
              </div>
              <input value={reviewDraft.resultadoReal.notas}
                onChange={e => setReviewDraft(r => ({ ...r, resultadoReal: { ...r.resultadoReal, notas: e.target.value } }))}
                placeholder={reviewDraft.deporte === "mlb" ? "Notas: innings, strikeouts, HR, etc." : reviewDraft.deporte === "nba" ? "Notas: puntos 1er cuarto, parciales, etc." : "Notas: corners, tarjetas, etc."}
                style={inputStyle} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 10, textTransform: "uppercase" }}>¿Qué dijo la IA? → ¿Acertó?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {reviewDraft.picks.map((p, i) => (
                  <div key={p.id || i} style={{ background: "rgba(15,23,42,.6)", border: `1px solid ${p.resultado === "acierto" ? "rgba(52,211,153,.3)" : p.resultado === "fallo" ? "rgba(239,68,68,.3)" : "rgba(255,255,255,.07)"}`, borderRadius: 12, padding: "10px 14px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e7ff", marginBottom: 4 }}>
                      {p.mercado} {p.linea} <span style={{ fontSize: 11, color: "#64748b" }}>({p.tipo}) · {p.confianza}%</span>
                    </div>
                    {p.justificacion && (
                      <p style={{ fontSize: 11, color: "#475569", margin: "0 0 8px", lineHeight: 1.5, fontStyle: "italic" }}>💡 {p.justificacion}</p>
                    )}
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
              💾 Guardar Review — El motor aprende de esto
            </button>
          </div>
        </div>
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header style={{ borderBottom: `1px solid ${sport.border}`, background: "rgba(2,8,23,.95)", backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 50, transition: "border-color .3s" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "0 10px" : "0 16px" }}>
          {/* Sport selector */}
          <div style={{ display: "flex", gap: 4, paddingTop: 6, paddingBottom: 4, overflowX: "auto", scrollbarWidth: "none" }}>
            {Object.values(SPORTS).filter(s => s.id === "futbol").map(s => (
              <button key={s.id} onClick={() => { setActiveSport(s.id); setMarketFilter("Todos"); setModoMundial(false); setEquipoSeleccionado(null); setPartidoDraft(null); }}
                style={{ padding: isMobile ? "3px 10px" : "4px 12px", borderRadius: 20, border: `1px solid ${activeSport === s.id ? s.color : "rgba(255,255,255,.08)"}`, background: activeSport === s.id ? s.colorSoft : "transparent", color: activeSport === s.id ? "#e0e7ff" : "#475569", cursor: "pointer", fontWeight: 800, fontSize: isMobile ? 11 : 12, transition: "all .2s", whiteSpace: "nowrap", flexShrink: 0 }}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ minHeight: isMobile ? 44 : 52, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
              <div style={{ width: isMobile ? 28 : 34, height: isMobile ? 28 : 34, flexShrink: 0, borderRadius: 10, background: sport.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 15 : 18 }}>
                {mounted && modoMundial ? "🏆" : sport.emoji}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: isMobile ? 13 : 15, letterSpacing: "-.02em", color: "#e0e7ff" }}>
                  KALBetAnalyzer<span style={{ color: sport.color }}>PRO</span>
                  {modoMundial && <span style={{ color: "#fbbf24", fontSize: 9, marginLeft: 4, background: "rgba(251,191,36,.1)", padding: "1px 4px", borderRadius: 4 }}>🏆</span>}
                  {!isMobile && <span style={{ color: sport.color, fontSize: 10, marginLeft: 5, background: sport.colorSoft, padding: "1px 5px", borderRadius: 4, border: `1px solid ${sport.border}` }}>{sport.label}</span>}
                </div>
                <div style={{ fontSize: 9, color: "#334155", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>
                  {mounted ? (hasFeedback ? `Calibrado · ${reviews.length} reviews` : "Sin calibración") : "..."}
                </div>
              </div>
            </div>
            {/* Action buttons */}
            <div style={{ display: "flex", gap: isMobile ? 3 : 5, alignItems: "center", flexShrink: 0 }}>
              {activeSport === "futbol" && (
                <button onClick={() => setModoMundial(v => !v)}
                  style={{ fontSize: isMobile ? 14 : 11, padding: isMobile ? "5px 7px" : "4px 10px", borderRadius: 20, border: `1px solid ${modoMundial ? "rgba(251,191,36,.5)" : "rgba(255,255,255,.08)"}`, background: modoMundial ? "rgba(251,191,36,.12)" : "transparent", color: modoMundial ? "#fbbf24" : "#475569", cursor: "pointer", fontWeight: 700 }}>
                  {isMobile ? "🏆" : `🏆 ${modoMundial ? "Mundial ON" : "Mundial"}`}
                </button>
              )}
              {!isMobile && (
                <button onClick={() => setExpertMode(v => !v)}
                  style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: `1px solid ${expertMode ? `${sport.color}66` : "rgba(255,255,255,.08)"}`, background: expertMode ? sport.colorSoft : "transparent", color: expertMode ? "#a5b4fc" : "#475569", cursor: "pointer", fontWeight: 700 }}>
                  {expertMode ? "🧠 Experto" : "📊 Básico"}
                </button>
              )}
              <button onClick={clearAll} style={{ fontSize: isMobile ? 14 : 11, padding: isMobile ? "5px 7px" : "4px 10px", borderRadius: 20, border: "1px solid rgba(239,68,68,.25)", background: "rgba(239,68,68,.08)", color: "#f87171", cursor: "pointer", fontWeight: 700 }}>{isMobile ? "🗑" : "🗑 Nuevo"}</button>
              <button onClick={() => importRef.current?.click()} style={{ fontSize: isMobile ? 14 : 11, padding: isMobile ? "5px 7px" : "4px 10px", borderRadius: 20, border: "1px solid rgba(56,189,248,.25)", background: "rgba(56,189,248,.08)", color: "#7dd3fc", cursor: "pointer", fontWeight: 700 }}>📂</button>
              <button onClick={exportData} style={{ fontSize: isMobile ? 14 : 11, padding: isMobile ? "5px 7px" : "4px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,.08)", background: "transparent", color: "#475569", cursor: "pointer", fontWeight: 700 }}>⬇</button>
              {/* Botón Hondubet */}
              <a href="https://hondubet.com/" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: isMobile ? 11 : 11, padding: isMobile ? "5px 8px" : "4px 10px", borderRadius: 20, border: "1px solid rgba(234,179,8,.35)", background: "rgba(234,179,8,.12)", color: "#fbbf24", cursor: "pointer", fontWeight: 800, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                🎰 {!isMobile && "Hondubet"}
              </a>
              <input ref={importRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => importData(e.target.files?.[0] || null)} />
            </div>
          </div>
        </div>
      </header>

      {/* ── TABS ──────────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,.05)", background: "rgba(2,8,23,.7)", backdropFilter: "blur(10px)", position: "sticky", top: 60, zIndex: 40 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 16px", display: "flex", gap: 0, overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ padding: "11px 13px", fontSize: 12, fontWeight: activeTab === t.id ? 800 : 600, whiteSpace: "nowrap", border: "none", background: "transparent", color: activeTab === t.id ? "#e0e7ff" : "#334155", cursor: "pointer", borderBottom: `2px solid ${activeTab === t.id ? sport.color : "transparent"}`, transition: "all .15s" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mundial banner */}
      {modoMundial && (
        <div style={{ background: "linear-gradient(90deg, rgba(251,191,36,.1), rgba(245,158,11,.05), rgba(251,191,36,.1))", borderBottom: "1px solid rgba(251,191,36,.15)", padding: "7px 16px", textAlign: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24" }}>🏆 MODO MUNDIAL — Análisis jornada a jornada activo · Registra cada partido en "Jornadas" para que el motor aprenda</span>
        </div>
      )}

      {/* Feedback banner */}
      {mounted && hasFeedback && (
        <div style={{ background: "rgba(52,211,153,.05)", borderBottom: "1px solid rgba(52,211,153,.1)", padding: "5px 16px", textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "#6ee7b7" }}>🧠 Motor calibrado con {reviews.length} reviews · Win rate IA: <strong>{fmtPct(iaStats.winRate)}</strong> · El próximo análisis usa este historial</span>
        </div>
      )}

      {/* Daily exceeded warning */}
      {dailyExceeded && (
        <div style={{ background: "rgba(239,68,68,.1)", borderBottom: "1px solid rgba(239,68,68,.2)", padding: "8px 16px", textAlign: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#f87171" }}>🛑 LÍMITE DIARIO ALCANZADO — ${fmtMoney(todayLoss)} perdidos hoy. Recomendamos parar.</span>
        </div>
      )}

      <main style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "16px 12px 80px" : "24px 16px 80px", position: "relative", zIndex: 1 }}>

        {/* ── TAB: ANÁLISIS ────────────────────────────────────────────────── */}
        {activeTab === "analisis" && (
          <div>
            {/* ── ALERTA DE RACHA NEGATIVA ──────────────────────────────────── */}
            {mounted && (() => {
              const lastSettled = bankroll.apuestas.filter(b => b.estado === "ganada" || b.estado === "perdida");
              let lossStreak = 0;
              for (const b of lastSettled) { if (b.estado === "perdida") lossStreak++; else break; }
              if (lossStreak < 3) return null;
              return (
                <div style={{ background: lossStreak >= 5 ? "rgba(220,38,38,.15)" : "rgba(239,68,68,.08)", border: `1px solid ${lossStreak >= 5 ? "rgba(220,38,38,.5)" : "rgba(239,68,68,.3)"}`, borderRadius: 16, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 24 }}>{lossStreak >= 5 ? "🚨" : "⚠️"}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#f87171" }}>
                      {lossStreak >= 5 ? `STOP — ${lossStreak} pérdidas consecutivas` : `Racha de ${lossStreak} pérdidas seguidas`}
                    </div>
                    <div style={{ fontSize: 11, color: "#f87171", opacity: .75, marginTop: 2 }}>
                      {lossStreak >= 5 ? "Para. Revisa tu estrategia antes de apostar de nuevo. El tilt destruye bankrolls." : "Considera reducir el stake en los próximos picks o pausar por hoy."}
                    </div>
                  </div>
                </div>
              );
            })()}
            <section style={{ position: "relative", overflow: "hidden", boxSizing: "border-box", maxWidth: "100%", background: `rgba(15,15,30,.5)`, border: `1px solid ${modoMundial ? "rgba(251,191,36,.25)" : sport.border}`, borderRadius: 20, padding: isMobile ? 16 : 24, marginBottom: 20, backdropFilter: "blur(8px)" }}>
              {sport.pattern && (
                <div style={{ position: "absolute", inset: 0, backgroundImage: sport.pattern, backgroundRepeat: "repeat", backgroundSize: "200px", opacity: 0.12, pointerEvents: "none", zIndex: 0 }} />
              )}
              <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: modoMundial ? "#fbbf24" : sport.color, marginBottom: 4 }}>
                  {sport.emoji} {activeSport === "mlb" ? "JUEGO MLB" : activeSport === "nba" ? "PARTIDO NBA" : modoMundial ? "SELECCIONES" : "PARTIDO"}
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>
                  {activeSport === "mlb" ? "⚾ Registrar Juego MLB" : activeSport === "nba" ? "🏀 Registrar Partido NBA" : modoMundial ? "🏆 Registrar Partido de Selecciones" : "⚽ Registrar Partido"}
                </h2>
              </div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {(modoMundial ? [
                  { key: "local", label: "🏠 Selección Local", placeholder: "Ej: Argentina" },
                  { key: "visitante", label: "✈️ Selección Visitante", placeholder: "Ej: Francia" },
                  { key: "liga", label: "🏆 Fase / Torneo", placeholder: "Ej: Mundial 2026 — Octavos" },
                ] : (sport.fields || [
                  { key: "local", label: "🏠 Local", placeholder: "Ej: Real Madrid" },
                  { key: "visitante", label: "✈️ Visitante", placeholder: "Ej: Barcelona" },
                  { key: "liga", label: "🏆 Liga", placeholder: "Ej: La Liga" },
                ])).map(f => (
                  <div key={f.key}>
                    <label style={labelStyle}>{f.label}</label>
                    {(f.key === "local" || f.key === "visitante") ? (
                      <TeamAutocomplete
                        value={match[f.key]}
                        onChange={val => setMatch(m => ({ ...m, [f.key]: val }))}
                        placeholder={f.placeholder}
                        style={inputStyle}
                        equipos={equipos}
                      />
                    ) : (
                      <input value={match[f.key]} onChange={e => setMatch(m => ({ ...m, [f.key]: e.target.value }))}
                        placeholder={f.placeholder} style={inputStyle} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: sport.hasDraw ? (isMobile ? "1fr 1fr" : "repeat(3,1fr)") : "repeat(2,1fr)", marginTop: 12 }}>
                {[
                  { key: "oddLocal", label: sport.defaultOddLabel[0] || "Cuota Local" },
                  ...(sport.hasDraw ? [{ key: "oddDraw", label: "Cuota Empate (X)" }] : []),
                  { key: "oddVisit", label: sport.defaultOddLabel[2] || "Cuota Visitante" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={labelStyle}>{f.label}</label>
                    <input type="number" step="0.01" value={match[f.key]} onChange={e => setMatch(m => ({ ...m, [f.key]: e.target.value }))}
                      placeholder="1.85" style={inputStyle} />
                  </div>
                ))}
              </div>
              {mounted && match.oddLocal && match.oddVisit && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { label: match.local || "Local", p: impliedProb(toNum(match.oddLocal)), color: "#34d399" },
                    ...(sport.hasDraw && match.oddDraw ? [{ label: "Empate", p: impliedProb(toNum(match.oddDraw)), color: "#94a3b8" }] : []),
                    { label: match.visitante || "Visitante", p: impliedProb(toNum(match.oddVisit)), color: "#f87171" },
                  ].map(x => (
                    <div key={x.label} style={{ background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "5px 10px", fontSize: 12 }}>
                      <span style={{ color: "#475569" }}>{x.label}: </span>
                      <span style={{ color: x.color, fontWeight: 800 }}>{fmtPct(x.p)}</span>
                      <span style={{ color: "#334155", fontSize: 10 }}> impl.</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </section>

            {/* Feedback context indicator */}
            {mounted && hasFeedback && (
              <div style={{ background: "rgba(52,211,153,.06)", border: "1px solid rgba(52,211,153,.15)", borderRadius: 12, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>🧠</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#34d399" }}>El motor recibe tu historial</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>
                    {iaStats.failingMarkets.length > 0 ? `⚠️ Mercados que fallan: ${iaStats.failingMarkets.map(m => m.mercado).join(", ")}` : "Sin patrones de fallo detectados aún."}
                    {iaStats.biasPct >= 70 ? " · Bias alto hacia OVERS — la IA reducirá overs." : ""}
                  </div>
                </div>
              </div>
            )}

            {/* ── FECHA Y HORA DEL PARTIDO ─────────────────────────────────── */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>
                🕐 Fecha y hora del partido <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#334155" }}>(para saber si es buen momento de analizar)</span>
              </div>
              <input
                type="datetime-local"
                value={matchDateTime}
                onChange={e => { setMatchDateTime(e.target.value); setTimingOverride(false); }}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(99,102,241,.2)", background: "rgba(15,23,42,.6)", color: "#e0e7ff", fontSize: 13, outline: "none", boxSizing: "border-box", colorScheme: "dark" }}
              />
            </div>

            {/* ── ALERTA DE TIMING ─────────────────────────────────────────── */}
            {(() => {
              const timing = getTimingStatus(matchDateTime, activeSport);
              if (!timing) return null;
              return (
                <div style={{ background: `${timing.color}15`, border: `1px solid ${timing.color}40`, borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>{timing.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: timing.color }}>{timing.title}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 8px" }}>{timing.msg}</p>

                  {/* Guía de timing por deporte */}
                  {(timing.status === "early" || timing.status === "tooEarly") && (
                    <div style={{ fontSize: 11, color: "#475569", marginBottom: 10, lineHeight: 1.6 }}>
                      {activeSport === "futbol" && "⚽ Fútbol: analiza 2-6h antes. Las alineaciones oficiales salen ~1h antes."}
                      {activeSport === "mlb" && "⚾ MLB: analiza 3-6h antes. El pitcher se confirma 2-3h antes — sin eso el análisis es incompleto."}
                      {activeSport === "nba" && "🏀 NBA: analiza 1-4h antes. El injury report oficial sale 1h antes del tip-off."}
                    </div>
                  )}

                  {/* Botón de desbloqueo manual */}
                  {timing.canOverride && !timingOverride && (
                    <button
                      onClick={() => {
                        if (window.confirm(
                          `⚠️ Analizar demasiado pronto puede dar picks incorrectos.\n\n` +
                          `${activeSport === "mlb" ? "El pitcher abridor puede no estar confirmado aún." : activeSport === "nba" ? "Las lesiones clave pueden no estar reportadas aún." : "Las alineaciones y noticias de última hora no están disponibles aún."}\n\n` +
                          `¿Confirmas que quieres analizar de todas formas?`
                        )) {
                          setTimingOverride(true);
                        }
                      }}
                      style={{ fontSize: 11, padding: "6px 12px", borderRadius: 8, border: `1px solid ${timing.color}50`, background: `${timing.color}15`, color: timing.color, cursor: "pointer", fontWeight: 700 }}>
                      🔓 Analizar de todas formas
                    </button>
                  )}
                  {timingOverride && (
                    <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700 }}>
                      ⚠️ Análisis desbloqueado manualmente — los datos pueden estar incompletos
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── CONTEXTO MUNDIAL ─────────────────────────────────────────── */}
            {modoMundial && (
              <div style={{ background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)", borderRadius: 16, padding: 16, marginBottom: 16, boxSizing: "border-box", maxWidth: "100%" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>
                  🏆 Contexto del torneo
                </div>

                {/* Fase + Jornada */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>Fase del torneo</label>
                    <select value={mundialCtx.fase} onChange={e => setMundialCtx(c => ({ ...c, fase: e.target.value, jornada: e.target.value !== "grupos" ? "N/A" : c.jornada }))}
                      style={{ ...inputStyle, cursor: "pointer" }}>
                      <option value="grupos">Fase de Grupos</option>
                      <option value="octavos">Octavos de Final</option>
                      <option value="cuartos">Cuartos de Final</option>
                      <option value="semifinal">Semifinal</option>
                      <option value="final">Final</option>
                    </select>
                  </div>
                  {mundialCtx.fase === "grupos" && (
                    <div>
                      <label style={labelStyle}>Jornada del grupo</label>
                      <select value={mundialCtx.jornada} onChange={e => setMundialCtx(c => ({ ...c, jornada: e.target.value }))}
                        style={{ ...inputStyle, cursor: "pointer" }}>
                        <option value="J1">Jornada 1</option>
                        <option value="J2">Jornada 2</option>
                        <option value="J3">Jornada 3 (última)</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Estado de clasificación */}
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Estado de clasificación</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {[
                      { key: "localClasificado", label: `${match.local || "Local"} ya clasificó`, color: "#34d399" },
                      { key: "visitanteClasificado", label: `${match.visitante || "Visitante"} ya clasificó`, color: "#34d399" },
                      { key: "localEliminado", label: `${match.local || "Local"} ya eliminado`, color: "#f87171" },
                      { key: "visitanteEliminado", label: `${match.visitante || "Visitante"} ya eliminado`, color: "#f87171" },
                    ].map(item => (
                      <label key={item.key} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
                        <input type="checkbox" checked={mundialCtx[item.key] || false}
                          onChange={e => setMundialCtx(c => ({ ...c, [item.key]: e.target.checked }))}
                          style={{ width: 14, height: 14 }} />
                        <span style={{ fontSize: 11, color: mundialCtx[item.key] ? item.color : "#475569", fontWeight: mundialCtx[item.key] ? 700 : 400 }}>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Días de descanso */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={labelStyle}>Días descanso {match.local || "local"}</label>
                    <input type="number" min="1" max="10" value={mundialCtx.diasDescansoLocal}
                      onChange={e => setMundialCtx(c => ({ ...c, diasDescansoLocal: e.target.value }))}
                      placeholder="Ej: 4" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Días descanso {match.visitante || "visitante"}</label>
                    <input type="number" min="1" max="10" value={mundialCtx.diasDescansoVisitante}
                      onChange={e => setMundialCtx(c => ({ ...c, diasDescansoVisitante: e.target.value }))}
                      placeholder="Ej: 3" style={inputStyle} />
                  </div>
                </div>

                {/* Alertas automáticas de contexto */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {mundialCtx.fase === "final" && <div style={{ fontSize: 10, color: "#f87171", fontWeight: 700 }}>⚠️ FINAL: Techo 60% Over goles. Promedian 1.2 goles. Prioriza Under y 1x2.</div>}
                  {mundialCtx.fase === "semifinal" && <div style={{ fontSize: 10, color: "#fb923c", fontWeight: 700 }}>⚠️ SEMIFINAL: Techo 65% Over goles. Táctica defensiva prioritaria.</div>}
                  {mundialCtx.jornada === "J3" && <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>⚠️ JORNADA 3: Última jornada en simultáneo. Difícil de predecir. Baja confianza máx 68%.</div>}
                  {(mundialCtx.localClasificado || mundialCtx.visitanteClasificado) && <div style={{ fontSize: 10, color: "#34d399", fontWeight: 700 }}>ℹ️ Equipo clasificado puede rotar. Baja confianza en picks de resultado.</div>}
                  {(mundialCtx.localEliminado || mundialCtx.visitanteEliminado) && <div style={{ fontSize: 10, color: "#f87171", fontWeight: 700 }}>⚠️ Equipo eliminado: partido sin trascendencia. Motivación reducida.</div>}
                  {mundialCtx.diasDescansoLocal && mundialCtx.diasDescansoVisitante && Math.abs(toNum(mundialCtx.diasDescansoLocal) - toNum(mundialCtx.diasDescansoVisitante)) >= 2 && (
                    <div style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 700 }}>
                      ℹ️ Diferencia de descanso: {Math.abs(toNum(mundialCtx.diasDescansoLocal) - toNum(mundialCtx.diasDescansoVisitante))} días — ventaja para {toNum(mundialCtx.diasDescansoLocal) > toNum(mundialCtx.diasDescansoVisitante) ? match.local : match.visitante}.
                    </div>
                  )}
                </div>

                {/* ── TABLA DEL GRUPO (datos reales del usuario) ──────────────── */}
                {mundialCtx.fase === "grupos" && (
                  <div style={{ marginTop: 14, borderTop: "1px solid rgba(251,191,36,.15)", paddingTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#fbbf24" }}>🏆 Tabla del grupo</span>
                      <select value={grupoCtx.grupo ? grupoCtx.grupo.toUpperCase() : ""} onChange={e => seleccionarGrupoMundial(e.target.value)}
                        style={{ width: 130, padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(251,191,36,.3)", background: "rgba(15,23,42,.8)", color: "#fde68a", fontSize: 11, fontWeight: 700, outline: "none" }}>
                        <option value="">Elegir grupo…</option>
                        {Object.keys(MUNDIAL_GRUPOS).map(letra => (
                          <option key={letra} value={letra}>Grupo {letra}{gruposGuardados[letra] ? " ✓" : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ fontSize: 9, color: "#64748b", marginBottom: 8 }}>Elige un grupo y se cargan los 4 equipos. Anota PJ, puntos y goles — se guardan solos. El ✓ marca grupos con datos guardados.</div>
                    <div style={{ display: "grid", gridTemplateColumns: "16px minmax(0,1.7fr) minmax(0,.55fr) minmax(0,.55fr) minmax(0,.55fr) minmax(0,.55fr)", gap: 4, fontSize: 9, color: "#475569", fontWeight: 700, marginBottom: 4, paddingLeft: 4 }}>
                      <span style={{ textAlign: "center" }}>#</span><span>Equipo</span><span style={{ textAlign: "center" }}>PJ</span><span style={{ textAlign: "center" }}>Pts</span><span style={{ textAlign: "center" }}>GF</span><span style={{ textAlign: "center" }}>GC</span>
                    </div>
                    {grupoCtx.equipos.map((eq, idx) => (
                      <div key={idx} style={{ display: "grid", gridTemplateColumns: "16px minmax(0,1.7fr) minmax(0,.55fr) minmax(0,.55fr) minmax(0,.55fr) minmax(0,.55fr)", gap: 4, marginBottom: 4, alignItems: "center" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, textAlign: "center", color: idx < 2 ? "#34d399" : "#475569" }}>{idx + 1}</span>
                        <input value={eq.nombre} onChange={e => setGrupoCtx(c => { const eqs = [...c.equipos]; eqs[idx] = { ...eqs[idx], nombre: e.target.value }; return { ...c, equipos: eqs }; })}
                          placeholder={`Equipo ${idx + 1}`} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", padding: "5px 6px", borderRadius: 7, border: `1px solid ${idx < 2 ? "rgba(52,211,153,.25)" : "rgba(255,255,255,.08)"}`, background: "rgba(15,23,42,.7)", color: "#e0e7ff", fontSize: 11, outline: "none" }} />
                        {["pj", "pts", "gf", "gc"].map(f => (
                          <input key={f} type="number" inputMode="numeric" value={eq[f]} onChange={e => setGrupoCtx(c => { const eqs = [...c.equipos]; eqs[idx] = { ...eqs[idx], [f]: e.target.value }; return { ...c, equipos: eqs }; })}
                            style={{ width: "100%", minWidth: 0, boxSizing: "border-box", padding: "5px 2px", borderRadius: 7, border: "1px solid rgba(255,255,255,.08)", background: "rgba(15,23,42,.7)", color: "#cbd5e1", fontSize: 11, textAlign: "center", outline: "none" }} />
                        ))}
                      </div>
                    ))}
                    <textarea value={grupoCtx.resultadosPrevios} onChange={e => setGrupoCtx(c => ({ ...c, resultadosPrevios: e.target.value }))}
                      placeholder="Resultados previos del grupo (ej: J1: Argentina 2-1 Islandia, Portugal 0-0 Nigeria)"
                      rows={2} style={{ width: "100%", marginTop: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.08)", background: "rgba(15,23,42,.7)", color: "#cbd5e1", fontSize: 11, outline: "none", resize: "vertical", boxSizing: "border-box" }} />

                    {/* Ordenar tabla por puntos y diferencia de goles */}
                    <button onClick={() => setGrupoCtx(c => {
                      const ordenados = [...c.equipos].sort((a, b) => {
                        const ptsA = toNum(a.pts), ptsB = toNum(b.pts);
                        if (ptsB !== ptsA) return ptsB - ptsA;
                        const difA = toNum(a.gf) - toNum(a.gc), difB = toNum(b.gf) - toNum(b.gc);
                        if (difB !== difA) return difB - difA;
                        return toNum(b.gf) - toNum(a.gf);
                      });
                      return { ...c, equipos: ordenados };
                    })}
                      style={{ width: "100%", marginTop: 8, padding: "8px 12px", borderRadius: 9, border: "1px solid rgba(251,191,36,.3)", background: "rgba(251,191,36,.08)", color: "#fbbf24", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                      ↕️ Ordenar tabla (puntos · diferencia de goles)
                    </button>

                    {/* Guardar / cargar grupos */}
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      <button onClick={guardarGrupoActual}
                        style={{ flex: "1 1 auto", padding: "7px 12px", borderRadius: 9, border: "1px solid rgba(52,211,153,.35)", background: "rgba(52,211,153,.1)", color: "#34d399", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                        💾 Guardado automático {grupoCtx.grupo ? `· ${grupoCtx.grupo.toUpperCase()}` : ""}
                      </button>
                      <button onClick={() => setShowGruposIO(v => !v)}
                        style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid rgba(56,189,248,.3)", background: "rgba(56,189,248,.08)", color: "#38bdf8", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                        ↹ Respaldo / Restaurar
                      </button>
                    </div>

                    {/* Chips de grupos guardados */}
                    {Object.keys(gruposGuardados).length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>Grupos guardados (toca para cargar):</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {Object.keys(gruposGuardados).sort().map(nombre => (
                            <div key={nombre} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.25)", borderRadius: 8, padding: "3px 4px 3px 9px" }}>
                              <button onClick={() => cargarGrupo(nombre)}
                                style={{ background: "none", border: "none", color: "#fde68a", fontSize: 11, fontWeight: 800, cursor: "pointer", padding: 0 }}>
                                {nombre}
                              </button>
                              <button onClick={() => eliminarGrupoGuardado(nombre)} title="Eliminar"
                                style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Panel exportar / importar por ARCHIVO */}
                    {showGruposIO && (
                      <div style={{ marginTop: 10, background: "rgba(15,23,42,.6)", border: "1px solid rgba(56,189,248,.2)", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 8, lineHeight: 1.4 }}>
                          <b style={{ color: "#38bdf8" }}>Respaldo completo:</b> exporta TODO (grupos, análisis, historial, banca) a un archivo. Guárdalo en Drive o mándatelo. Al importar en otro dispositivo, <b style={{ color: "#fbbf24" }}>reemplaza</b> todos los datos con los del archivo.
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={exportarGrupos}
                            style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid rgba(56,189,248,.3)", background: "rgba(56,189,248,.1)", color: "#38bdf8", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                            📤 Descargar respaldo
                          </button>
                          <label style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid rgba(52,211,153,.35)", background: "rgba(52,211,153,.1)", color: "#34d399", fontSize: 12, fontWeight: 800, cursor: "pointer", textAlign: "center", boxSizing: "border-box" }}>
                            📥 Restaurar archivo
                            <input type="file" accept=".json,application/json" style={{ display: "none" }}
                              onChange={e => { const f = e.target.files?.[0]; importarGruposArchivo(f); e.target.value = ""; }} />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── NOTA DEL ANALISTA ───────────────────────────────────────── */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>
                📝 Nota del analista <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#334155" }}>(opcional — solo si sabes algo extra)</span>
              </div>
              <textarea
                value={userNote}
                onChange={e => { setUserNote(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.max(e.target.scrollHeight, 56) + "px"; }}
                ref={el => { if (el) { el.style.height = "auto"; el.style.height = Math.max(el.scrollHeight, 56) + "px"; } }}
                placeholder={
                  modoMundial
                    ? "Ej: Francia sin Mbappé, España necesita ganar para clasificar, historial de tarjetas altas..."
                    : activeSport === "mlb"
                    ? "Ej: Pitcher de Oakland ERA 6.2 esta semana, Yankees vienen de 3 victorias, viento a favor del bateador..."
                    : activeSport === "nba"
                    ? "Ej: LeBron jugó 42 min ayer (back-to-back), rival sin base titular, árbitro favorece locales..."
                    : "Ej: Arsenal sin Saka (lesionado), PSG ya clasificado puede rotar, es una final = partido cerrado..."
                }
                rows={2}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(99,102,241,.2)", background: "rgba(15,23,42,.6)", color: "#e0e7ff", fontSize: 13, fontFamily: "inherit", resize: "none", overflow: "hidden", minHeight: 56, outline: "none", boxSizing: "border-box" }}
              />
              <div style={{ marginTop: 6, fontSize: 11, color: "#334155" }}>
                {activeSport === "mlb"
                  ? "💡 Útil para: ERA del pitcher, clima, back-to-back, lesiones de bateadores clave"
                  : activeSport === "nba"
                  ? "💡 Útil para: minutos del día anterior, lesiones, back-to-back, rotaciones confirmadas"
                  : "💡 Útil para: lesiones recientes, contexto del partido, rotaciones, condiciones del campo"}
              </div>
              {userNote.trim() && (
                <div style={{ marginTop: 4, fontSize: 11, color: "#6366f1", fontWeight: 700 }}>
                  ✓ La IA recibirá esta nota como contexto prioritario
                </div>
              )}
            </div>

            {/* ── DATOS CLAVE (opcional, alta precisión) ───────────────────── */}
            {(() => {
              const hasDatos = Object.values(datosExtra).some(v => v);
              return (
                <details style={{ marginBottom: 16 }} open={hasDatos}>
                  <summary style={{ fontSize: 12, fontWeight: 800, color: "#64748b", cursor: "pointer", padding: "8px 12px", background: "rgba(15,23,42,.4)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)", listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>🔍 Datos clave del partido <span style={{ fontWeight: 400, color: "#334155" }}>(opcional — aumentan precisión)</span></span>
                    <span style={{ fontSize: 10, color: hasDatos ? "#34d399" : "#334155" }}>{hasDatos ? "✓ Con datos" : "Vacío"}</span>
                  </summary>
                  <div style={{ background: "rgba(15,23,42,.4)", border: "1px solid rgba(255,255,255,.06)", borderRadius: "0 0 10px 10px", padding: 14, borderTop: "none" }}>
                    <p style={{ fontSize: 10, color: "#475569", margin: "0 0 12px", lineHeight: 1.5 }}>
                      Solo llena lo que sabes con certeza. La IA ya busca el resto. Útil para datos muy recientes (últimas 24h) que la web aún no tiene bien indexados.
                    </p>

                    {/* FÚTBOL / MUNDIAL */}
                    {(activeSport === "futbol" || modoMundial) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <label style={labelStyle}>Titulares/alineación {match.local || "local"}</label>
                            <input value={datosExtra.titularLocal} onChange={e => setDatosExtra(d => ({ ...d, titularLocal: e.target.value }))}
                              placeholder="Ej: Saka titular, Kane descansa" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Titulares/alineación {match.visitante || "visitante"}</label>
                            <input value={datosExtra.titularVisitante} onChange={e => setDatosExtra(d => ({ ...d, titularVisitante: e.target.value }))}
                              placeholder="Ej: Mbappé dudoso, Griezmann OUT" style={inputStyle} />
                          </div>
                        </div>
                        <div>
                          <label style={labelStyle}>Bajas clave confirmadas (hoy)</label>
                          <input value={datosExtra.bajasClave} onChange={e => setDatosExtra(d => ({ ...d, bajasClave: e.target.value }))}
                            placeholder="Ej: Pedri OUT (lesión), Vinicius sancionado" style={inputStyle} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <label style={labelStyle}>Árbitro confirmado</label>
                            <input value={datosExtra.arbitro} onChange={e => setDatosExtra(d => ({ ...d, arbitro: e.target.value }))}
                              placeholder="Ej: Szymon Marciniak" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Nota sobre árbitro</label>
                            <input value={datosExtra.notaArbitro} onChange={e => setDatosExtra(d => ({ ...d, notaArbitro: e.target.value }))}
                              placeholder="Ej: Pita muchas tarjetas, 2+ penales" style={inputStyle} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* MLB */}
                    {activeSport === "mlb" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <label style={labelStyle}>ERA últimas 3 salidas — {match.local || "local"}</label>
                            <input value={datosExtra.eraUltimas3Local} onChange={e => setDatosExtra(d => ({ ...d, eraUltimas3Local: e.target.value }))}
                              placeholder="Ej: 2.1 (dominante)" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>ERA últimas 3 salidas — {match.visitante || "visitante"}</label>
                            <input value={datosExtra.eraUltimas3Visitante} onChange={e => setDatosExtra(d => ({ ...d, eraUltimas3Visitante: e.target.value }))}
                              placeholder="Ej: 6.8 (débil → Over)" style={inputStyle} />
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          <div>
                            <label style={labelStyle}>Umpire confirmado</label>
                            <input value={datosExtra.umpire} onChange={e => setDatosExtra(d => ({ ...d, umpire: e.target.value }))}
                              placeholder="Ej: Angel Hernandez" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Viento (mph)</label>
                            <input type="number" value={datosExtra.vientoMph} onChange={e => setDatosExtra(d => ({ ...d, vientoMph: e.target.value }))}
                              placeholder="Ej: 18" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Dirección viento</label>
                            <select value={datosExtra.vientoDir} onChange={e => setDatosExtra(d => ({ ...d, vientoDir: e.target.value }))}
                              style={{ ...inputStyle, cursor: "pointer" }}>
                              <option value="">Dirección</option>
                              <option value="hacia el outfield (HR)">Hacia outfield ⬆️ HR</option>
                              <option value="desde el outfield (pitchers)">Desde outfield ⬇️ Pitchers</option>
                              <option value="lateral">Lateral</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* NBA */}
                    {activeSport === "nba" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div>
                          <label style={labelStyle}>Lesiones/cambios de hoy (day-to-day)</label>
                          <input value={datosExtra.lesionesHoy} onChange={e => setDatosExtra(d => ({ ...d, lesionesHoy: e.target.value }))}
                            placeholder="Ej: LeBron OUT hoy, Curry probable" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Minutos limitados confirmados</label>
                          <input value={datosExtra.minutosLimitados} onChange={e => setDatosExtra(d => ({ ...d, minutosLimitados: e.target.value }))}
                            placeholder="Ej: Giannis max 25 min (carga)" style={inputStyle} />
                        </div>
                      </div>
                    )}

                    <button onClick={() => setDatosExtra({ titularLocal: "", titularVisitante: "", bajasClave: "", arbitro: "", notaArbitro: "", eraUltimas3Local: "", eraUltimas3Visitante: "", umpire: "", vientoMph: "", vientoDir: "", lesionesHoy: "", minutosLimitados: "" })}
                      style={{ marginTop: 10, fontSize: 11, color: "#475569", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      Limpiar datos
                    </button>
                  </div>
                </details>
              );
            })()}

            {/* ── TOGGLE WEB cuando está en modo IA ───────────────────────── */}
                          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button onClick={() => setUseWebSearch(true)}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: `1px solid ${useWebSearch ? "#0ea5e9" : "rgba(255,255,255,.08)"}`, background: useWebSearch ? "rgba(14,165,233,.08)" : "transparent", color: useWebSearch ? "#38bdf8" : "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  🌐 Con web ~$0.20
                </button>
                <button onClick={() => setUseWebSearch(false)}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: `1px solid ${!useWebSearch ? "#6366f1" : "rgba(255,255,255,.08)"}`, background: !useWebSearch ? "rgba(99,102,241,.08)" : "transparent", color: !useWebSearch ? "#a5b4fc" : "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  ⚡ Sin web ~$0.05
                </button>
              </div>

            {/* ── BOTÓN ANALIZAR ────────────────────────────────────────────── */}
            {modoMundial && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {[{ v: false, label: "🔬 Completo", desc: "análisis profundo" }, { v: true, label: "⚡ Rápido", desc: "solo lo esencial" }].map(opt => (
                  <button key={String(opt.v)} onClick={() => setMundialRapido(opt.v)}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 12, border: mundialRapido === opt.v ? "1px solid rgba(251,191,36,.5)" : "1px solid rgba(255,255,255,.08)", background: mundialRapido === opt.v ? "rgba(251,191,36,.12)" : "rgba(15,23,42,.5)", color: mundialRapido === opt.v ? "#fde68a" : "#64748b", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    {opt.label}
                    <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            )}
            {(() => {
              const timing = getTimingStatus(matchDateTime, activeSport);
              const isBlocked = timing && !timing.canAnalyze && !timingOverride;
              
              return (
                <button onClick={isBlocked ? undefined : runAIAnalysis}
                  disabled={aiStatus === "loading" || isBlocked}
                  style={{ width: "100%", padding: "18px 24px", borderRadius: 16, border: "none", background: aiStatus === "loading" ? "rgba(99,102,241,.25)" : isBlocked ? "rgba(100,116,139,.2)" : sport.gradient, color: isBlocked ? "#475569" : "#fff", fontSize: 16, fontWeight: 900, cursor: isBlocked ? "not-allowed" : aiStatus === "loading" ? "not-allowed" : "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: isBlocked || aiStatus === "loading" ? "none" : `0 4px 24px ${sport.color + "55"}`, transition: "all .2s" }}>
                  {aiStatus === "loading" ? (
                    <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span> {`Analizando${useWebSearch ? " + buscando en web" : ""}...`}</>
                  ) : isBlocked ? (
                    <><span>🔒</span> Análisis bloqueado — muy pronto para analizar</>
                  ) : (
                    <><span>{sport.emoji}</span> Analizar {activeSport === "mlb" ? "Juego MLB" : activeSport === "nba" ? "Partido NBA" : modoMundial ? "Selecciones" : "Partido"} con IA</>
                  )}
                </button>
              );
            })()}

            {aiError && (
              <div style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
                <p style={{ color: "#fca5a5", fontSize: 13, margin: "0 0 10px" }}>⚠️ {aiError}</p>
                {(aiError.toLowerCase().includes("credit") || aiError.toLowerCase().includes("billing") || aiError.toLowerCase().includes("balance") || aiError.toLowerCase().includes("quota") || aiError.toLowerCase().includes("crédito")) && (
                  <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: "rgba(239,68,68,.2)", border: "1px solid rgba(239,68,68,.4)", color: "#fca5a5", fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
                    💳 Recargar créditos en Anthropic →
                  </a>
                )}
              </div>
            )}

            {aiStatus === "done" && aiResult && (
              <div ref={resultsRef}>
                {/* Perfil badges row */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
                  {aiResult.perfilPartido && (
                    <span style={{ background: aiResult.perfilPartido === "abierto" ? "rgba(52,211,153,.12)" : aiResult.perfilPartido === "cerrado" ? "rgba(56,189,248,.12)" : "rgba(239,68,68,.12)", border: `1px solid ${aiResult.perfilPartido === "abierto" ? "rgba(52,211,153,.25)" : aiResult.perfilPartido === "cerrado" ? "rgba(56,189,248,.25)" : "rgba(239,68,68,.25)"}`, borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 800, color: aiResult.perfilPartido === "abierto" ? "#34d399" : aiResult.perfilPartido === "cerrado" ? "#38bdf8" : "#f87171" }}>
                      Perfil: {aiResult.perfilPartido}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: "#334155", alignSelf: "center" }}>{match.local} vs {match.visitante}</span>
                  {picks.length > 0 && <span style={{ fontSize: 12, background: "rgba(99,102,241,.12)", color: "#a5b4fc", padding: "4px 12px", borderRadius: 20, fontWeight: 800 }}>{picks.length} picks generados</span>}
                  {/* Botón rápido de resultado */}
                  {historial.length > 0 && historial[0].partido === `${match.local} vs ${match.visitante}` && (
                    <button
                      onClick={() => openReviewModal(historial[0])}
                      style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 20, border: "1px solid rgba(52,211,153,.4)", background: "rgba(52,211,153,.1)", color: "#34d399", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                      📝 ¿Cómo terminó?
                    </button>
                  )}
                </div>

                {/* Alerts */}
                {aiResult.alertas?.filter(Boolean).length > 0 && (
                  <div style={{ background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#fbbf24", marginBottom: 6 }}>⚠️ ALERTAS DEL MOTOR</div>
                    {aiResult.alertas.map((a, i) => <div key={i} style={{ fontSize: 13, color: "#fde68a", marginBottom: 2 }}>• {a}</div>)}
                  </div>
                )}

                {/* Condicion del partido — NEW */}
                {aiResult.condicionPartido && (
                  <div style={{ background: "rgba(139,92,246,.06)", border: "1px solid rgba(139,92,246,.2)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#a78bfa", marginBottom: 6 }}>⚡ CONDICIÓN DEL PARTIDO</div>
                    <p style={{ fontSize: 13, color: "#ddd6fe", margin: 0, lineHeight: 1.6 }}>{aiResult.condicionPartido}</p>
                  </div>
                )}

                {/* ── MUNDIAL: datos faltantes (punto 10) ─────────────────────── */}
                {modoMundial && aiResult.datosFaltantes?.filter(Boolean).length > 0 && (
                  <div style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#f87171", marginBottom: 6 }}>🛑 FALTAN DATOS PARA UN ANÁLISIS CONFIABLE</div>
                    {aiResult.datosFaltantes.filter(Boolean).map((d, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#fecaca", marginBottom: 2 }}>• {d}</div>
                    ))}
                    <div style={{ fontSize: 10, color: "#f87171", opacity: .7, marginTop: 6 }}>Llena la tabla del grupo arriba y vuelve a analizar para mayor confianza.</div>
                  </div>
                )}

                {/* ── MUNDIAL: estado del grupo ───────────────────────────────── */}
                {modoMundial && (aiResult.estiloMercados || aiResult.factorHinchada) && (
                  <div style={{ background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#a5b4fc", marginBottom: 8 }}>🎯 ESTILO DE JUEGO → MERCADOS</div>
                    {aiResult.estiloMercados && (
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                        {aiResult.estiloMercados.goles && <div style={{ background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 10, fontWeight: 800, color: "#34d399", marginBottom: 2 }}>⚽ GOLES</div><div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.5 }}>{aiResult.estiloMercados.goles}</div></div>}
                        {aiResult.estiloMercados.corners && <div style={{ background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 10, fontWeight: 800, color: "#38bdf8", marginBottom: 2 }}>⛳ CÓRNERS</div><div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.5 }}>{aiResult.estiloMercados.corners}</div></div>}
                        {aiResult.estiloMercados.tarjetas && <div style={{ background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 10, fontWeight: 800, color: "#fbbf24", marginBottom: 2 }}>🟨 TARJETAS</div><div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.5 }}>{aiResult.estiloMercados.tarjetas}</div></div>}
                        {aiResult.estiloMercados.resultado && <div style={{ background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 10, fontWeight: 800, color: "#f472b6", marginBottom: 2 }}>🎲 RESULTADO</div><div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.5 }}>{aiResult.estiloMercados.resultado}</div></div>}
                      </div>
                    )}
                    {aiResult.factorHinchada && (
                      <div style={{ background: "rgba(251,146,60,.08)", borderRadius: 8, padding: "8px 10px", marginTop: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#fb923c" }}>📣 HINCHADA / LOCALÍA: </span>
                        <span style={{ fontSize: 11, color: "#fed7aa" }}>{aiResult.factorHinchada}</span>
                      </div>
                    )}
                  </div>
                )}

                {modoMundial && aiResult.estadoGrupo && (
                  <div style={{ background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#fbbf24", marginBottom: 6 }}>🏆 ESTADO DEL GRUPO</div>
                    <p style={{ fontSize: 13, color: "#fde68a", margin: 0, lineHeight: 1.6 }}>{aiResult.estadoGrupo}</p>
                    {(aiResult.necesidadLocal || aiResult.necesidadVisitante) && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                        {aiResult.necesidadLocal && <div style={{ background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{match.local}</div><div style={{ fontSize: 11, color: "#cbd5e1" }}>{aiResult.necesidadLocal}</div></div>}
                        {aiResult.necesidadVisitante && <div style={{ background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{match.visitante}</div><div style={{ fontSize: 11, color: "#cbd5e1" }}>{aiResult.necesidadVisitante}</div></div>}
                      </div>
                    )}
                  </div>
                )}

                {/* ── MUNDIAL: mejor apuesta + apuesta a evitar ───────────────── */}
                {modoMundial && (aiResult.mejorApuesta?.mercado || aiResult.apuestaEvitar?.mercado) && (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    {aiResult.mejorApuesta?.mercado && (
                      <div style={{ background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.3)", borderRadius: 14, padding: "12px 16px" }}>
                        <div style={{ fontWeight: 800, fontSize: 12, color: "#34d399", marginBottom: 6 }}>✅ MEJOR APUESTA</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#a7f3d0", marginBottom: 4 }}>{aiResult.mejorApuesta.mercado}{aiResult.mejorApuesta.linea ? ` ${aiResult.mejorApuesta.linea}` : ""}</div>
                        <p style={{ fontSize: 11, color: "#cbd5e1", margin: 0, lineHeight: 1.5 }}>{aiResult.mejorApuesta.razon}</p>
                      </div>
                    )}
                    {aiResult.apuestaEvitar?.mercado && (
                      <div style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 14, padding: "12px 16px" }}>
                        <div style={{ fontWeight: 800, fontSize: 12, color: "#f87171", marginBottom: 6 }}>🚫 APUESTA A EVITAR</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#fecaca", marginBottom: 4 }}>{aiResult.apuestaEvitar.mercado}</div>
                        <p style={{ fontSize: 11, color: "#cbd5e1", margin: 0, lineHeight: 1.5 }}>{aiResult.apuestaEvitar.razon}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── MUNDIAL: mercados calificados 1-10 ──────────────────────── */}
                {modoMundial && aiResult.mercadosCalificados?.filter(m => m.mercado).length > 0 && (
                  <div style={{ background: "rgba(56,189,248,.05)", border: "1px solid rgba(56,189,248,.18)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#38bdf8", marginBottom: 10 }}>📊 MERCADOS CALIFICADOS (1-10)</div>
                    {[...aiResult.mercadosCalificados].filter(m => m.mercado).sort((a, b) => (toNum(b.nota) - toNum(a.nota))).map((m, i) => {
                      const nota = toNum(m.nota);
                      const col = nota >= 8 ? "#34d399" : nota >= 6 ? "#fbbf24" : nota >= 4 ? "#fb923c" : "#f87171";
                      return (
                        <div key={i} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#e0e7ff" }}>{m.mercado}</span>
                            <span style={{ fontSize: 13, fontWeight: 900, color: col }}>{nota}/10</span>
                          </div>
                          <div style={{ height: 5, background: "rgba(15,23,42,.6)", borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
                            <div style={{ width: `${nota * 10}%`, height: "100%", background: col, borderRadius: 3 }} />
                          </div>
                          {m.comentario && <div style={{ fontSize: 10, color: "#64748b" }}>{m.comentario}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── MUNDIAL: trampas del mercado ────────────────────────────── */}
                {modoMundial && aiResult.trampasMercado?.filter(Boolean).length > 0 && (
                  <div style={{ background: "rgba(251,146,60,.07)", border: "1px solid rgba(251,146,60,.25)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#fb923c", marginBottom: 6 }}>⚠️ TRAMPAS DEL MERCADO</div>
                    {aiResult.trampasMercado.filter(Boolean).map((t, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#fed7aa", marginBottom: 3, lineHeight: 1.5 }}>• {t}</div>
                    ))}
                  </div>
                )}

                {/* Main cards */}
                <div style={{ display: "grid", gap: 14, gridTemplateColumns: expertMode && !isMobile ? "1fr 1fr" : "1fr", marginBottom: 16 }}>

                  {/* Marcador esperado */}
                  {aiResult.marcadorEsperado && (
                    <div style={{ background: "rgba(15,23,42,.7)", border: `1px solid ${sport.border}`, borderRadius: 16, padding: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: sport.color, marginBottom: 12, textTransform: "uppercase" }}>
                        🎯 Proyección del partido
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 10 }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>{match.local || "Local"}</div>
                          <div style={{ fontSize: 42, fontWeight: 900, color: "#34d399", lineHeight: 1 }}>
                            {aiResult.marcadorEsperado.local ?? "?"}
                          </div>
                        </div>
                        <div style={{ fontSize: 20, color: "#334155", fontWeight: 900 }}>–</div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>{match.visitante || "Visitante"}</div>
                          <div style={{ fontSize: 42, fontWeight: 900, color: "#f87171", lineHeight: 1 }}>
                            {aiResult.marcadorEsperado.visitante ?? "?"}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: "#475569" }}>
                          Total proyectado: <strong style={{ color: "#e0e7ff" }}>
                            {aiResult.marcadorEsperado.totalGoles ?? aiResult.marcadorEsperado.totalCarreras ?? aiResult.marcadorEsperado.totalPuntos ?? "?"}
                          </strong>
                          {activeSport === "mlb" ? " carreras" : activeSport === "nba" ? " pts" : " goles"}
                        </span>
                      </div>
                      {aiResult.marcadorEsperado.descripcion && (
                        <p style={{ fontSize: 12, color: "#64748b", textAlign: "center", margin: 0, fontStyle: "italic" }}>
                          {aiResult.marcadorEsperado.descripcion}
                        </p>
                      )}
                    </div>
                  )}

                  <div style={{ background: "rgba(30,27,75,.35)", border: "1px solid rgba(99,102,241,.15)", borderRadius: 16, padding: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", marginBottom: 8, textTransform: "uppercase" }}>📋 Resumen</div>
                    <p style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.6, margin: 0 }}>{aiResult.resumen}</p>
                    {aiResult.pronostico && (
                      <div style={{ marginTop: 12, background: "rgba(99,102,241,.08)", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#818cf8", marginBottom: 4 }}>🎯 PRONÓSTICO IA</div>
                        <p style={{ fontSize: 13, color: "#e0e7ff", margin: 0, lineHeight: 1.5 }}>{aiResult.pronostico}</p>
                      </div>
                    )}
                  </div>
                  {expertMode && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {aiResult.formaLocal && (
                        <div style={{ background: "rgba(52,211,153,.04)", border: "1px solid rgba(52,211,153,.12)", borderRadius: 16, padding: 16, flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#34d399", marginBottom: 6 }}>🏠 {match.local}</div>
                          <p style={{ fontSize: 13, color: "#a7f3d0", margin: 0, lineHeight: 1.5 }}>{aiResult.formaLocal}</p>
                        </div>
                      )}
                      {aiResult.formaVisitante && (
                        <div style={{ background: "rgba(248,113,113,.04)", border: "1px solid rgba(248,113,113,.12)", borderRadius: 16, padding: 16, flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#f87171", marginBottom: 6 }}>✈️ {match.visitante}</div>
                          <p style={{ fontSize: 13, color: "#fecaca", margin: 0, lineHeight: 1.5 }}>{aiResult.formaVisitante}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── COMPARACIÓN H2H VISUAL ─────────────────────────────── */}
                {aiResult.comparacionH2H && aiResult.comparacionH2H.length > 0 && (
                  <div style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>⚔️ Comparación H2H</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 4, alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: "#34d399", textAlign: "center", padding: "4px 8px", background: "rgba(52,211,153,.1)", borderRadius: 8 }}>{match.local}</div>
                      <div style={{ fontSize: 10, color: "#475569", textAlign: "center", padding: "0 8px" }}>vs</div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: "#f87171", textAlign: "center", padding: "4px 8px", background: "rgba(248,113,113,.1)", borderRadius: 8 }}>{match.visitante}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {aiResult.comparacionH2H.map((row, i) => {
                        const ventajaLocal = row.ventaja === "local";
                        const ventajaVisita = row.ventaja === "visitante";
                        return (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr", gap: 4, alignItems: "center" }}>
                            <div style={{ fontSize: 11, color: ventajaLocal ? "#34d399" : "#64748b", textAlign: "right", padding: "4px 8px", background: ventajaLocal ? "rgba(52,211,153,.08)" : "rgba(255,255,255,.02)", borderRadius: 6, fontWeight: ventajaLocal ? 800 : 400 }}>{row.local}</div>
                            <div style={{ fontSize: 10, color: "#a5b4fc", textAlign: "center", fontWeight: 800, background: "rgba(99,102,241,.1)", borderRadius: 6, padding: "3px 4px" }}>{row.categoria}</div>
                            <div style={{ fontSize: 11, color: ventajaVisita ? "#f87171" : "#64748b", textAlign: "left", padding: "4px 8px", background: ventajaVisita ? "rgba(248,113,113,.08)" : "rgba(255,255,255,.02)", borderRadius: 6, fontWeight: ventajaVisita ? 800 : 400 }}>{row.visitante}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── ÁRBITRO ────────────────────────────────────────────── */}
                {aiResult.arbitro && aiResult.arbitro.nombre && (
                  <div style={{ background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)", borderRadius: 16, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24", textTransform: "uppercase", marginBottom: 8 }}>🟨 Árbitro: {aiResult.arbitro.nombre}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      {aiResult.arbitro.tarjetasPromedio && <span style={{ fontSize: 11, background: "rgba(251,191,36,.12)", color: "#fde68a", padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>🟨 {aiResult.arbitro.tarjetasPromedio} tarjetas/partido</span>}
                      {aiResult.arbitro.tendencia && <span style={{ fontSize: 11, background: "rgba(99,102,241,.12)", color: "#a5b4fc", padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>Tendencia: {aiResult.arbitro.tendencia}</span>}
                      {aiResult.arbitro.penalesHistorico && <span style={{ fontSize: 11, background: "rgba(239,68,68,.1)", color: "#f87171", padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>⚡ {aiResult.arbitro.penalesHistorico}</span>}
                    </div>
                    {aiResult.arbitro.impactoMercados && <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{aiResult.arbitro.impactoMercados}</p>}
                  </div>
                )}

                {/* ── ALERTAS (mostradas arriba en "Alertas del motor") ──────── */}

                {modoMundial && (aiResult.mercadosCalificados?.length > 0 || aiResult.mejorApuesta?.mercado) && (
                  <button onClick={guardarAnalisisParaRevisar}
                    style={{ width: "100%", padding: "12px", borderRadius: 14, border: "1px solid rgba(251,191,36,.3)", background: "rgba(251,191,36,.1)", color: "#fbbf24", fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 10 }}>
                    📌 Guardar análisis para revisar tras el partido
                  </button>
                )}

                <button onClick={() => setActiveTab("picks")}
                  style={{ width: "100%", padding: "14px", borderRadius: 14, border: "1px solid rgba(99,102,241,.2)", background: "rgba(99,102,241,.1)", color: "#818cf8", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                  🎯 Ver {picks.length} Picks Generados →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: PICKS ──────────────────────────────────────────────────── */}
        {activeTab === "picks" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#6366f1", textTransform: "uppercase", marginBottom: 2 }}>Predicciones IA</div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>🎯 Picks del Partido</h2>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {picks.length > 0 && detectTotalMarkets(picks).length > 0 && (
                  <button onClick={() => { setShowLineAnalyzer(v => !v); setLineAnalysis(null); }}
                    style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${showLineAnalyzer ? "rgba(251,191,36,.5)" : "rgba(251,191,36,.2)"}`, background: showLineAnalyzer ? "rgba(251,191,36,.15)" : "rgba(251,191,36,.06)", color: "#fbbf24", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    📊 {showLineAnalyzer ? "Cerrar" : "Analizar líneas"}
                  </button>
                )}
                {picks.some(p => toNum(p.cuotaCasa) > 1) && (
                  <button onClick={verifyValue} disabled={verifyingValue}
                    style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(99,102,241,.25)", background: "rgba(99,102,241,.08)", color: "#a5b4fc", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    {verifyingValue ? "⚙️ Verificando..." : "🔍 Verificar Value"}
                  </button>
                )}
              </div>
            </div>

            {/* ── PICK DEL DÍA ─────────────────────────────────────────────── */}
            {picks.length > 0 && (() => {
              const top = calcPickDelDia(picks, reviews);
              if (!top) return null;
              const cuota = toNum(top.cuotaSugerida) || toNum(top.cuotaCasa);
              const vr = cuota > 1 ? valueAndRisk(toNum(top.confianza), cuota) : null;
              return (
                <div style={{ background: "linear-gradient(135deg, rgba(251,191,36,.12), rgba(245,158,11,.06))", border: "2px solid rgba(251,191,36,.4)", borderRadius: 18, padding: "16px 18px", marginBottom: 20, boxShadow: "0 0 30px rgba(251,191,36,.1)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 20 }}>🏆</span>
                    <span style={{ fontSize: 12, fontWeight: 900, color: "#fbbf24", textTransform: "uppercase", letterSpacing: ".1em" }}>Pick del día</span>
                    <div style={{ display: "flex", gap: 1, marginLeft: 4 }}>
                      {[1,2,3,4,5].map(s => <span key={s} style={{ fontSize: 12, opacity: s <= top._stars.stars ? 1 : 0.15 }}>⭐</span>)}
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#e0e7ff", marginBottom: 4 }}>
                    {top.mercado} {top.linea && <span style={{ color: "#fbbf24" }}>{top.linea}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8, fontSize: 12 }}>
                    <span style={{ background: "rgba(99,102,241,.15)", color: "#a5b4fc", padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>{top.confianza}% confianza</span>
                    {top.tipo && <span style={{ background: top.tipo === "over" ? "rgba(52,211,153,.12)" : "rgba(239,68,68,.12)", color: top.tipo === "over" ? "#34d399" : "#f87171", padding: "2px 10px", borderRadius: 20, fontWeight: 800, textTransform: "uppercase" }}>{top.tipo}</span>}
                    {cuota > 1 && <span style={{ background: "rgba(255,255,255,.06)", color: "#94a3b8", padding: "2px 10px", borderRadius: 20 }}>Cuota: {cuota.toFixed(2)}</span>}
                    {vr && <span style={{ color: vr.color === "green" ? "#34d399" : vr.color === "yellow" ? "#fbbf24" : "#f87171", fontWeight: 700 }}>{vr.label}</span>}
                  </div>
                  {top.justificacion && <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>{top.justificacion}</p>}
                </div>
              );
            })()}

            {/* ── CORRELACIONES ENTRE PICKS ────────────────────────────────── */}
            {picks.length >= 2 && (() => {
              const corrs = detectCorrelatedPicks(picks);
              if (!corrs.length) return null;
              const negativas = corrs.filter(c => c.tipo === "negativa");
              const positivas = corrs.filter(c => c.tipo === "positiva");
              return (
                <div style={{ marginBottom: 16 }}>
                  {negativas.map((c, i) => (
                    <div key={i} style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 12, padding: "10px 14px", marginBottom: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#f87171", marginBottom: 3 }}>
                          PICKS CONTRADICTORIOS: {c.labels[0]} + {c.labels[1]}
                        </div>
                        <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{c.razon}</p>
                      </div>
                    </div>
                  ))}
                  {positivas.map((c, i) => (
                    <div key={i} style={{ background: "rgba(52,211,153,.06)", border: "1px solid rgba(52,211,153,.2)", borderRadius: 12, padding: "10px 14px", marginBottom: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>🔗</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#34d399", marginBottom: 3 }}>
                          BUENA COMBINADA: {c.labels[0]} + {c.labels[1]}
                        </div>
                        <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{c.razon}</p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── ANALIZADOR DE LÍNEAS ─────────────────────────────────────── */}
            {showLineAnalyzer && picks.length > 0 && (() => {
              const totalMarkets = detectTotalMarkets(picks);
              if (!totalMarkets.length) return null;
              const allFilled = totalMarkets.every(m => {
                const inp = lineInputs[m.key] || {};
                return inp.overLine && inp.overOdd && inp.underLine && inp.underOdd;
              });
              return (
                <div style={{ background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#fbbf24", marginBottom: 4 }}>📊 Detector de líneas infladas</div>
                  <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 14px", lineHeight: 1.5 }}>
                    Ingresa las líneas exactas de Hondubet. La IA detectará si la casa inflö alguna línea y dónde está el value real.
                  </p>

                  {totalMarkets.map(mkt => {
                    const inp = lineInputs[mkt.key] || {};
                    const update = (field, val) => setLineInputs(prev => ({ ...prev, [mkt.key]: { ...(prev[mkt.key] || {}), [field]: val } }));
                    return (
                      <div key={mkt.key} style={{ background: "rgba(15,23,42,.5)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#e0e7ff", marginBottom: 10 }}>{mkt.label}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div>
                            <label style={{ fontSize: 10, color: "#34d399", fontWeight: 700, display: "block", marginBottom: 4 }}>📈 OVER — Línea más baja</label>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input type="number" step="0.5" placeholder="2.5" value={inp.overLine || ""}
                                onChange={e => update("overLine", e.target.value)}
                                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(52,211,153,.2)", background: "rgba(52,211,153,.06)", color: "#e0e7ff", fontSize: 12, outline: "none" }} />
                              <input type="number" step="0.01" placeholder="1.75" value={inp.overOdd || ""}
                                onChange={e => update("overOdd", e.target.value)}
                                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(52,211,153,.2)", background: "rgba(52,211,153,.06)", color: "#e0e7ff", fontSize: 12, outline: "none" }} />
                            </div>
                            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                              <span style={{ fontSize: 9, color: "#475569" }}>línea</span>
                              <span style={{ fontSize: 9, color: "#475569", marginLeft: 30 }}>cuota</span>
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: 10, color: "#f87171", fontWeight: 700, display: "block", marginBottom: 4 }}>📉 UNDER — Línea más alta</label>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input type="number" step="0.5" placeholder="3.5" value={inp.underLine || ""}
                                onChange={e => update("underLine", e.target.value)}
                                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.06)", color: "#e0e7ff", fontSize: 12, outline: "none" }} />
                              <input type="number" step="0.01" placeholder="2.10" value={inp.underOdd || ""}
                                onChange={e => update("underOdd", e.target.value)}
                                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.06)", color: "#e0e7ff", fontSize: 12, outline: "none" }} />
                            </div>
                            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                              <span style={{ fontSize: 9, color: "#475569" }}>línea</span>
                              <span style={{ fontSize: 9, color: "#475569", marginLeft: 30 }}>cuota</span>
                            </div>
                          </div>
                        </div>
                        {/* Cálculo rápido de prob implícita */}
                        {inp.overOdd && inp.underOdd && (
                          <div style={{ fontSize: 10, color: "#64748b", display: "flex", gap: 12 }}>
                            <span>Over impl: <strong style={{ color: "#34d399" }}>{(100 / toNum(inp.overOdd)).toFixed(1)}%</strong></span>
                            <span>Under impl: <strong style={{ color: "#f87171" }}>{(100 / toNum(inp.underOdd)).toFixed(1)}%</strong></span>
                            <span>Margen casa: <strong style={{ color: (100/toNum(inp.overOdd) + 100/toNum(inp.underOdd) - 100) > 6 ? "#f87171" : "#fbbf24" }}>
                              {(100/toNum(inp.overOdd) + 100/toNum(inp.underOdd) - 100).toFixed(1)}%
                            </strong></span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button onClick={analyzeLines} disabled={!allFilled || analyzingLines}
                    style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: allFilled ? "linear-gradient(135deg, #d97706, #b45309)" : "rgba(100,116,139,.2)", color: allFilled ? "#fff" : "#475569", fontSize: 13, fontWeight: 900, cursor: allFilled ? "pointer" : "not-allowed", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    {analyzingLines ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span> Analizando líneas...</> : "🔍 Detectar líneas infladas"}
                  </button>

                  {!allFilled && <p style={{ fontSize: 10, color: "#475569", textAlign: "center", margin: "6px 0 0" }}>Completa todas las líneas y cuotas para analizar</p>}

                  {/* Resultado del análisis */}
                  {lineAnalysis && (
                    <div style={{ marginTop: 14 }}>
                      {lineAnalysis.mercados?.map((m, i) => {
                        const isOver = m.valueReal === "over";
                        const valueColor = isOver ? "#34d399" : "#f87171";
                        return (
                          <div key={i} style={{ background: `${valueColor}10`, border: `1px solid ${valueColor}30`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 900, color: "#e0e7ff" }}>{m.mercado}</span>
                              <span style={{ fontSize: 12, fontWeight: 900, color: valueColor, background: `${valueColor}20`, padding: "2px 10px", borderRadius: 20 }}>
                                Value: {m.valueReal?.toUpperCase()} {m.lineaOver && (isOver ? m.lineaOver : m.lineaUnder)}
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 11 }}>
                              <div>
                                <span style={{ color: "#475569" }}>Over impl: </span>
                                <span style={{ color: "#34d399", fontWeight: 700 }}>{m.probImplicitaOver}</span>
                              </div>
                              <div>
                                <span style={{ color: "#475569" }}>Under impl: </span>
                                <span style={{ color: "#f87171", fontWeight: 700 }}>{m.probImplicitaUnder}</span>
                              </div>
                              <div>
                                <span style={{ color: "#475569" }}>Margen casa: </span>
                                <span style={{ color: "#fbbf24", fontWeight: 700 }}>{m.margenCasa}</span>
                              </div>
                            </div>
                            <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 6px", lineHeight: 1.5 }}>{m.razon}</p>
                            {m.alerta && <p style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, margin: 0 }}>{m.alerta}</p>}
                          </div>
                        );
                      })}
                      {lineAnalysis.mejorApuesta && (
                        <div style={{ background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.25)", borderRadius: 12, padding: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", marginBottom: 4 }}>💡 Mejor apuesta según las líneas reales</div>
                          <p style={{ fontSize: 12, color: "#e0e7ff", margin: 0 }}>{lineAnalysis.mejorApuesta}</p>
                        </div>
                      )}
                      {lineAnalysis.advertencia && (
                        <p style={{ fontSize: 11, color: "#fbbf24", margin: "8px 0 0", fontWeight: 700 }}>⚠️ {lineAnalysis.advertencia}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {picks.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#334155" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
                <div style={{ fontWeight: 700, marginBottom: 8, color: "#475569" }}>Sin picks generados</div>
                <div style={{ fontSize: 13 }}>Ve a "Análisis" e ingresa un partido para comenzar</div>
                <button onClick={() => setActiveTab("analisis")}
                  style={{ marginTop: 16, padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(99,102,241,.25)", background: "rgba(99,102,241,.08)", color: "#818cf8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ← Ir a Análisis
                </button>
              </div>
            )}

            {picks.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {currentFilters.map(f => (
                    <button key={f} onClick={() => setMarketFilter(f)}
                      style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${cleanFilter(marketFilter) === cleanFilter(f) ? "rgba(99,102,241,.4)" : "rgba(255,255,255,.06)"}`, background: cleanFilter(marketFilter) === cleanFilter(f) ? "rgba(99,102,241,.15)" : "transparent", color: cleanFilter(marketFilter) === cleanFilter(f) ? "#a5b4fc" : "#334155", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {f}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {filteredPicks
                    .sort((a, b) => (b.pesoAnalisis || 0) - (a.pesoAnalisis || 0))
                    .map((pick, idx) => {
                    const hasOdd = toNum(pick.cuotaCasa) > 1;
                    const vr = hasOdd ? valueAndRisk(pick.confianza, toNum(pick.cuotaCasa)) : null;
                    const isTopPick = idx === 0 && (pick.pesoAnalisis || 0) >= 7;
                    const starRating = calcPickStars(pick, reviews);
                    return (
                      <div key={pick.id} style={{
                        background: pick.seleccionado ? "rgba(99,102,241,.1)" : "rgba(15,23,42,.5)",
                        border: `1px solid ${starRating.stars >= 5 ? "rgba(251,191,36,.4)" : starRating.stars >= 4 ? "rgba(249,115,22,.3)" : isTopPick ? "rgba(251,191,36,.3)" : pick.seleccionado ? "rgba(99,102,241,.35)" : "rgba(255,255,255,.06)"}`,
                        borderRadius: 16, padding: 16, transition: "all .15s",
                        boxShadow: starRating.stars >= 5 ? "0 0 24px rgba(251,191,36,.12)" : starRating.stars >= 4 ? "0 0 20px rgba(249,115,22,.08)" : "none"
                      }}>
                        {/* Estrellas + label premium */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ display: "flex", gap: 1 }}>
                              {[1,2,3,4,5].map(s => (
                                <span key={s} style={{ fontSize: 13, opacity: s <= starRating.stars ? 1 : 0.15, filter: s <= starRating.stars ? "none" : "grayscale(1)" }}>⭐</span>
                              ))}
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 800, color: starRating.color, textTransform: "uppercase", letterSpacing: ".07em" }}>{starRating.label}</span>
                          </div>
                          {isTopPick && <div style={{ fontSize: 10, fontWeight: 900, color: "#fbbf24", textTransform: "uppercase", letterSpacing: ".1em" }}>🏆 Mejor pick</div>}
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                              <span style={{ fontWeight: 900, fontSize: 15, color: "#e0e7ff" }}>{pick.mercado}</span>
                              {pick.linea && <span style={{ fontSize: 12, color: "#64748b" }}>({pick.linea})</span>}
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700, ...{ alta: { background: "rgba(52,211,153,.1)", color: "#34d399" }, media: { background: "rgba(245,158,11,.1)", color: "#fbbf24" }, baja: { background: "rgba(148,163,184,.1)", color: "#94a3b8" } }[pick.prioridad] }}>
                                {pick.prioridad}
                              </span>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: pick.tipo === "over" ? "rgba(52,211,153,.07)" : "rgba(56,189,248,.07)", color: pick.tipo === "over" ? "#6ee7b7" : "#7dd3fc", border: `1px solid ${pick.tipo === "over" ? "rgba(52,211,153,.2)" : "rgba(56,189,248,.2)"}` }}>
                                {pick.tipo?.toUpperCase()}
                              </span>
                            </div>

                            {/* Confidence scale + probability */}
                            {(() => {
                              const scale = getConfidenceScale(pick.confianza);
                              const cuota = toNum(pick.cuotaCasa) || toNum(pick.cuotaSugerida);
                              const probs = calcProbabilidades(pick.confianza, cuota);
                              return (
                                <div style={{ marginBottom: 10 }}>
                                  {/* Escala visual */}
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                    <div style={{ flex: 1, background: "rgba(255,255,255,.05)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                                      <div style={{ height: "100%", width: `${pick.confianza}%`, background: scale.color, borderRadius: 4, transition: "width .5s" }} />
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <span style={{ fontSize: 14 }}>{scale.icon}</span>
                                      <span style={{ fontSize: 13, fontWeight: 900, color: scale.color }}>{pick.confianza}%</span>
                                      <span style={{ fontSize: 10, fontWeight: 700, color: scale.color, background: scale.bg, border: `1px solid ${scale.border}`, padding: "1px 7px", borderRadius: 20 }}>{scale.label}</span>
                                    </div>
                                  </div>

                                  {/* Probabilidades vs casa */}
                                  {probs && (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
                                      <div style={{ background: "rgba(15,23,42,.6)", borderRadius: 8, padding: "5px 8px", textAlign: "center" }}>
                                        <div style={{ fontSize: 9, color: "#475569", marginBottom: 1 }}>Prob. IA</div>
                                        <div style={{ fontSize: 12, fontWeight: 900, color: "#a5b4fc" }}>{probs.probIA}%</div>
                                      </div>
                                      <div style={{ background: "rgba(15,23,42,.6)", borderRadius: 8, padding: "5px 8px", textAlign: "center" }}>
                                        <div style={{ fontSize: 9, color: "#475569", marginBottom: 1 }}>Prob. casa</div>
                                        <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>{probs.probImplicita}%</div>
                                      </div>
                                      <div style={{ background: probs.hasValue ? "rgba(52,211,153,.08)" : "rgba(239,68,68,.08)", borderRadius: 8, padding: "5px 8px", textAlign: "center", border: `1px solid ${probs.hasValue ? "rgba(52,211,153,.2)" : "rgba(239,68,68,.2)"}` }}>
                                        <div style={{ fontSize: 9, color: "#475569", marginBottom: 1 }}>Edge</div>
                                        <div style={{ fontSize: 12, fontWeight: 900, color: probs.hasValue ? "#34d399" : "#f87171" }}>{probs.edge > 0 ? "+" : ""}{probs.edge}pp</div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Peso análisis — NEW */}
                            {pick.pesoAnalisis > 0 && (
                              <div style={{ marginBottom: 8 }}>
                                <PesoBadge peso={pick.pesoAnalisis} />
                              </div>
                            )}

                            {/* Track record badge — tu historial personal con este mercado */}
                            {(() => {
                              const tr = getMarketTrackRecord(reviews, pick.mercado);
                              if (!tr) return null;
                              const bg = tr.color === "green" ? "rgba(52,211,153,.08)" : tr.color === "yellow" ? "rgba(251,191,36,.08)" : "rgba(239,68,68,.08)";
                              const border = tr.color === "green" ? "rgba(52,211,153,.2)" : tr.color === "yellow" ? "rgba(251,191,36,.2)" : "rgba(239,68,68,.2)";
                              const textColor = tr.color === "green" ? "#34d399" : tr.color === "yellow" ? "#fbbf24" : "#f87171";
                              return (
                                <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "5px 10px", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: textColor, textTransform: "uppercase", letterSpacing: ".06em" }}>Tu historial</span>
                                  <span style={{ fontSize: 11, color: textColor, fontWeight: 700 }}>{tr.label}</span>
                                </div>
                              );
                            })()}

                            {/* Justificacion siempre visible */}
                            {pick.justificacion && (
                              <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px", lineHeight: 1.5 }}>{pick.justificacion}</p>
                            )}

                            {/* Condicion del partido — NEW */}
                            {pick.condicionPartido && expertMode && (
                              <div style={{ background: "rgba(139,92,246,.06)", border: "1px solid rgba(139,92,246,.12)", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: "#a78bfa", marginBottom: 2 }}>CONDICIÓN DEL PARTIDO</div>
                                <p style={{ fontSize: 11, color: "#ddd6fe", margin: 0, lineHeight: 1.4 }}>{pick.condicionPartido}</p>
                              </div>
                            )}

                            {/* Value metrics */}
                            {hasOdd && vr && (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 800, background: vr.color === "green" ? "rgba(52,211,153,.1)" : vr.color === "yellow" ? "rgba(245,158,11,.1)" : "rgba(239,68,68,.1)", color: vr.color === "green" ? "#34d399" : vr.color === "yellow" ? "#fbbf24" : "#f87171" }}>
                                  {vr.label}
                                </span>
                                {pick.riesgo && (
                                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: pick.riesgo === "bajo" ? "rgba(52,211,153,.08)" : pick.riesgo === "medio" ? "rgba(251,191,36,.08)" : "rgba(239,68,68,.08)", color: pick.riesgo === "bajo" ? "#34d399" : pick.riesgo === "medio" ? "#fbbf24" : "#f87171" }}>
                                    ⚡ Riesgo {pick.riesgo}
                                  </span>
                                )}
                                {expertMode && <>
                                  <span style={{ fontSize: 11, color: "#475569" }}>EV: <b style={{ color: vr.ev > 0 ? "#34d399" : "#f87171" }}>{vr.ev > 0 ? "+" : ""}{(vr.ev * 100).toFixed(1)}%</b></span>
                                  <span style={{ fontSize: 11, color: "#475569" }}>Edge: <b style={{ color: "#94a3b8" }}>{vr.value.toFixed(1)}pp</b></span>
                                </>}
                                {pick.kellyLabel && <span style={{ fontSize: 11, color: "#a5b4fc" }}>Kelly: {pick.kellyLabel}</span>}
                                {pick.recomendacionIA && <span style={{ fontSize: 11, color: "#94a3b8" }}>{pick.recomendacionIA}</span>}
                              </div>
                            )}
                          </div>

                          {/* Right side: odds + select */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: 110 }}>
                            <input
                              type="number" step="0.01" value={pick.cuotaCasa}
                              onChange={e => updatePickOdd(pick.id, e.target.value)}
                              placeholder={pick.cuotaSugerida || "Cuota"}
                              style={{ width: 100, background: "rgba(15,23,42,.7)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "6px 8px", color: "#e2e8f0", fontSize: 14, fontWeight: 700, outline: "none", textAlign: "center" }}
                            />
                            <button onClick={() => togglePickSel(pick.id)}
                              style={{ width: 100, padding: "7px 0", borderRadius: 10, border: `1px solid ${pick.seleccionado ? "rgba(99,102,241,.5)" : "rgba(255,255,255,.1)"}`, background: pick.seleccionado ? "rgba(99,102,241,.2)" : "transparent", color: pick.seleccionado ? "#a5b4fc" : "#475569", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                              {pick.seleccionado ? "✅ Añadido" : "+ Ticket"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB: TICKET ──────────────────────────────────────────────────── */}
        {activeTab === "ticket" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#6366f1", textTransform: "uppercase", marginBottom: 2 }}>Cupón</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>🎫 Ticket de Apuesta</h2>
            </div>

            {picks.filter(p => p.seleccionado).length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#334155" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎫</div>
                <div style={{ fontWeight: 700, color: "#475569", marginBottom: 8 }}>Ticket vacío</div>
                <div style={{ fontSize: 13 }}>Selecciona picks desde la pestaña "Picks"</div>
                <button onClick={() => setActiveTab("picks")} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(99,102,241,.25)", background: "rgba(99,102,241,.08)", color: "#818cf8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ← Ver Picks
                </button>
              </div>
            ) : (
              <>
                {/* ── MODO SELECTOR: Individual / Múltiple ────────────────── */}
                <div style={{ display: "flex", background: "rgba(15,23,42,.8)", borderRadius: 12, padding: 4, marginBottom: 16, border: "1px solid rgba(255,255,255,.06)" }}>
                  <button onClick={() => setEsParlay(false)}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: !esParlay ? "rgba(99,102,241,.2)" : "transparent", color: !esParlay ? "#a5b4fc" : "#475569", fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all .15s" }}>
                    Individual
                  </button>
                  <button onClick={() => setEsParlay(true)}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: esParlay ? "rgba(99,102,241,.2)" : "transparent", color: esParlay ? "#a5b4fc" : "#475569", fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all .15s" }}>
                    Múltiple
                  </button>
                </div>

                {/* ── PARTIDO INFO ─────────────────────────────────────────── */}
                {match.local && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                    <span style={{ fontSize: 14 }}>{sport.emoji}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#e0e7ff" }}>{match.local} vs {match.visitante}</span>
                    {match.liga && <span style={{ fontSize: 11, color: "#475569" }}>· {match.liga}</span>}
                  </div>
                )}

                {/* ── MODO INDIVIDUAL ─────────────────────────────────────── */}
                {!esParlay && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                    {picks.filter(p => p.seleccionado).map(p => {
                      const cuota = toNum(p.cuotaCasa) || toNum(p.cuotaSugerida);
                      const stake = toNum(ticketStake) || 10;
                      const ganancia = cuota > 1 ? stake * cuota : 0;
                      return (
                        <div key={p.id} style={{ background: "rgba(15,23,42,.7)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "#e0e7ff", marginBottom: 2 }}>{p.mercado}</div>
                              <div style={{ fontSize: 12, color: "#6366f1", fontWeight: 700 }}>{p.linea || p.tipo}</div>
                              <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{p.confianza}% conf. · {p.tipo?.toUpperCase()}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff" }}>{cuota > 1 ? cuota.toFixed(2) : "—"}</div>
                              <button onClick={() => togglePickSel(p.id)} style={{ fontSize: 10, color: "#f87171", background: "none", border: "none", cursor: "pointer", marginTop: 2 }}>✕ Quitar</button>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="number" value={ticketStake} onChange={e => setTicketStake(e.target.value)}
                              style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)", background: "rgba(15,23,42,.8)", color: "#e0e7ff", fontSize: 13, outline: "none" }}
                              placeholder="10" />
                            {cuota > 1 && <span style={{ fontSize: 12, color: "#34d399", fontWeight: 800 }}>Ganar: ${fmtMoney(ganancia)}</span>}
                          </div>
                          {(() => {
                            const chk = chequeoStake(ticketStake, p.confianza, toNum(bankroll.inicial));
                            if (chk.ok) return null;
                            return (
                              <div style={{ marginTop: 8 }}>
                                {chk.alertas.map((a, i) => (
                                  <div key={i} style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>{a}</div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                    {/* Total Individual */}
                    {picks.filter(p => p.seleccionado).length > 1 && (
                      <div style={{ background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.15)", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: 11, color: "#475569" }}>Total apostado</div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: "#e0e7ff" }}>${fmtMoney((toNum(ticketStake)||10) * picks.filter(p=>p.seleccionado).length)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#475569" }}>Ganancia total si aciertan todos</div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: "#34d399" }}>
                            ${fmtMoney(picks.filter(p=>p.seleccionado).reduce((s,p) => s + ((toNum(p.cuotaCasa)||toNum(p.cuotaSugerida)||1) * (toNum(ticketStake)||10)), 0))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── MODO MÚLTIPLE (PARLAY) ───────────────────────────────── */}
                {esParlay && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ background: "rgba(15,23,42,.7)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
                      {picks.filter(p => p.seleccionado).map((p, i) => (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < picks.filter(x=>x.seleccionado).length - 1 ? "1px solid rgba(255,255,255,.04)" : "none" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#e0e7ff" }}>{p.mercado}</div>
                            <div style={{ fontSize: 11, color: "#6366f1" }}>{p.linea || p.tipo}</div>
                            <div style={{ fontSize: 10, color: "#475569" }}>{p.confianza}% conf.</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: "#e0e7ff" }}>{toNum(p.cuotaCasa) > 1 ? toNum(p.cuotaCasa).toFixed(2) : toNum(p.cuotaSugerida) > 1 ? toNum(p.cuotaSugerida).toFixed(2) : "—"}</div>
                            <button onClick={() => togglePickSel(p.id)} style={{ fontSize: 11, color: "#f87171", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Combo stake input */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>Combo</span>
                      <span style={{ fontSize: 12, color: "#a5b4fc", fontWeight: 700 }}>1x</span>
                      <input type="number" value={ticketStake} onChange={e => setTicketStake(e.target.value)}
                        style={{ width: 80, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)", background: "rgba(15,23,42,.8)", color: "#e0e7ff", fontSize: 14, fontWeight: 800, outline: "none" }}
                        placeholder="10" />
                    </div>

                    {/* Alerta de disciplina de stake (escala por confianza + tope 4%) */}
                    {(() => {
                      const sel = picks.filter(p => p.seleccionado);
                      const minConf = sel.length ? Math.min(...sel.map(p => Number(p.confianza) || 0)) : 0;
                      const chk = chequeoStake(ticketStake, minConf, toNum(bankroll.inicial));
                      if (chk.ok) return null;
                      return (
                        <div style={{ background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.25)", borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
                          {chk.alertas.map((a, i) => (
                            <div key={i} style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, marginBottom: i < chk.alertas.length - 1 ? 4 : 0 }}>{a}</div>
                          ))}
                          <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>Leg más débil: {minConf}% conf.</div>
                        </div>
                      );
                    })()}

                    {ticket.count > 0 && (
                      <div style={{ background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 14, padding: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 10, color: "#475569", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                              Cuota total
                              {ticket.manual && <span style={{ fontSize: 9, color: "#fbbf24", fontWeight: 800, background: "rgba(251,191,36,.12)", borderRadius: 5, padding: "1px 5px" }}>MANUAL</span>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input
                                type="number"
                                step="0.01"
                                value={cuotaManualActiva ? cuotaManual : ticket.combinadaAuto.toFixed(2)}
                                onChange={e => { setCuotaManual(e.target.value); setCuotaManualActiva(true); }}
                                style={{ width: 90, padding: "4px 8px", borderRadius: 8, border: ticket.manual ? "1px solid rgba(251,191,36,.4)" : "1px solid rgba(255,255,255,.1)", background: "rgba(15,23,42,.8)", color: ticket.manual ? "#fbbf24" : "#a5b4fc", fontSize: 22, fontWeight: 900, outline: "none" }}
                              />
                              {ticket.manual && (
                                <button
                                  onClick={() => { setCuotaManualActiva(false); setCuotaManual(""); }}
                                  title="Volver a la cuota automática"
                                  style={{ fontSize: 14, background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 0 }}>
                                  ↺
                                </button>
                              )}
                            </div>
                            {ticket.manual && (
                              <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>Auto: {ticket.combinadaAuto.toFixed(2)}</div>
                            )}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>Valor total</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: "#64748b" }}>${fmtMoney(toNum(ticketStake)||10)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>Prob. real</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#fbbf24" }}>{fmtPct(ticket.probReal)}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>Ganancia Total</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: "#34d399" }}>${fmtMoney(ticket.potencial)}</div>
                          </div>
                        </div>
                        {ticket.value > 0 && (
                          <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 700 }}>Value ticket: +{ticket.value.toFixed(1)}pp</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── VALIDACIÓN IA ─────────────────────────────────────────── */}
                {picks.filter(p => p.enTicket).length >= 2 && (
                  <div style={{ marginBottom: 12 }}>
                    <button onClick={validateTicket} disabled={validatingTicket}
                      style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid rgba(99,102,241,.3)", background: "rgba(99,102,241,.08)", color: "#a5b4fc", fontSize: 12, fontWeight: 800, cursor: validatingTicket ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      {validatingTicket ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span> Analizando...</> : "🔍 Validar ticket con IA"}
                    </button>
                    {ticketValidation && (
                      <div style={{ background: "rgba(15,23,42,.6)", border: `1px solid ${ticketValidation.alerts?.length > 0 ? "rgba(251,191,36,.3)" : "rgba(52,211,153,.3)"}`, borderRadius: 12, padding: 12, marginTop: 8 }}>
                        {ticketValidation.alerts?.length > 0 ? (
                          ticketValidation.alerts.map((alert, i) => (
                            <div key={i} style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 800, color: alert.severidad === "alta" ? "#f87171" : "#fbbf24" }}>{alert.severidad === "alta" ? "❌" : "⚠️"} {alert.picks}</div>
                              <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0" }}>{alert.mensaje}</p>
                              <p style={{ fontSize: 11, color: "#6366f1", margin: 0, fontWeight: 700 }}>👉 {alert.accion}</p>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 12, color: "#34d399", fontWeight: 800 }}>✅ Ticket limpio — sin contradicciones</div>
                        )}
                        {ticketValidation.consejo && <p style={{ fontSize: 11, color: "#64748b", margin: "8px 0 0", fontStyle: "italic" }}>"{ticketValidation.consejo}"</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* ── GUARDAR ──────────────────────────────────────────────── */}
                <button onClick={saveTicket}
                  style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #059669, #047857)", color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 20px rgba(5,150,105,.3)" }}>
                  💾 Guardar Ticket en Bankroll
                </button>
              </>
            )}
          </div>
        )}

        {/* ── TAB: BANKROLL ─────────────────────────────────────────────────── */}
        {activeTab === "bankroll" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#6366f1", textTransform: "uppercase", marginBottom: 2 }}>Gestión</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>💼 Bankroll · Dashboard</h2>
            </div>

            {/* ══ DASHBOARD VISUAL ══════════════════════════════════════════ */}
            {/* Tarjetas KPI */}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", marginBottom: 16 }}>
              {[
                { label: "Banco actual", val: `$${fmtMoney(dashboard.currentBank)}`, color: dashboard.currentBank >= dashboard.inicial ? "#34d399" : "#f87171", sub: `Inicio: $${fmtMoney(dashboard.inicial)}` },
                { label: "P&L total", val: `${dashboard.totalPnl >= 0 ? "+" : ""}$${fmtMoney(dashboard.totalPnl)}`, color: dashboard.totalPnl >= 0 ? "#34d399" : "#f87171", sub: `Apostado: $${fmtMoney(dashboard.totalStaked)}` },
                { label: "ROI", val: `${dashboard.roi >= 0 ? "+" : ""}${dashboard.roi.toFixed(1)}%`, color: dashboard.roi >= 5 ? "#34d399" : dashboard.roi >= 0 ? "#fbbf24" : "#f87171", sub: "Retorno sobre apostado" },
                { label: "Win rate picks", val: mounted ? `${reviews.length ? ((reviews.flatMap(r => r.picks||[]).filter(p=>p.resultado==="acierto").length / Math.max(reviews.flatMap(r=>r.picks||[]).filter(p=>p.resultado==="acierto"||p.resultado==="fallo").length,1))*100).toFixed(0) : 0}%` : "—", color: "#a5b4fc", sub: mounted ? `${reviews.flatMap(r=>r.picks||[]).filter(p=>p.resultado==="acierto"||p.resultado==="fallo").length} picks evaluados` : "Cargando..." },
              ].map((kpi, i) => (
                <div key={i} style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{kpi.label}</div>
                  <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: kpi.color }}>{kpi.val}</div>
                  <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{kpi.sub}</div>
                </div>
              ))}
            </div>

            {/* Control de límite diario de pérdida */}
            <div style={{ background: dailyExceeded ? "rgba(239,68,68,.08)" : "rgba(15,23,42,.6)", border: `1px solid ${dailyExceeded ? "rgba(239,68,68,.3)" : "rgba(255,255,255,.07)"}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: dailyExceeded ? "#f87171" : "#6366f1", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>🛑 Límite diario de pérdida</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    Si pierdes más de este % del banco en un día, la app te avisa para parar.
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" inputMode="numeric" value={dailyLossLimit}
                    onChange={e => setDailyLossLimit(clamp(toNum(e.target.value), 1, 100))}
                    style={{ width: 64, padding: "8px 10px", borderRadius: 9, border: "1px solid rgba(255,255,255,.1)", background: "rgba(15,23,42,.8)", color: "#e0e7ff", fontSize: 16, fontWeight: 800, textAlign: "center", outline: "none", boxSizing: "border-box" }} />
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#64748b" }}>%</span>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.06)" }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>Límite en dinero: <b style={{ color: "#cbd5e1" }}>${fmtMoney(dailyLimitAmt)}</b></span>
                <span style={{ fontSize: 11, color: todayLoss > 0 ? "#f87171" : "#64748b" }}>Perdido hoy: <b style={{ color: todayLoss > 0 ? "#f87171" : "#cbd5e1" }}>${fmtMoney(todayLoss)}</b></span>
              </div>
            </div>

            {dashboard.bankCurve.length >= 2 && (
              <div style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>📈 Evolución del banco</div>
                <BankCurve data={dashboard.bankCurve} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: "#334155" }}>${fmtMoney(dashboard.bankCurve[0]?.val || 0)}</span>
                  <span style={{ fontSize: 10, color: dashboard.currentBank >= dashboard.inicial ? "#34d399" : "#f87171", fontWeight: 800 }}>${fmtMoney(dashboard.currentBank)}</span>
                </div>
              </div>
            )}

            {/* P&L por día */}
            {dashboard.sortedDays.length > 0 && (
              <div style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>📊 P&L por día</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
                  {dashboard.sortedDays.map(([day, data], i) => {
                    const maxPnl = Math.max(...dashboard.sortedDays.map(([,d]) => Math.abs(d.pnl)), 1);
                    const barH = Math.max((Math.abs(data.pnl) / maxPnl) * 50, 4);
                    const isPos = data.pnl >= 0;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{ fontSize: 8, color: isPos ? "#34d399" : "#f87171", fontWeight: 800 }}>{isPos ? "+" : ""}{data.pnl.toFixed(0)}</div>
                        <div style={{ width: "100%", height: barH, background: isPos ? "rgba(52,211,153,.7)" : "rgba(239,68,68,.7)", borderRadius: "3px 3px 0 0" }} />
                        <div style={{ fontSize: 8, color: "#334155" }}>{day.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Yield por deporte */}
            {dashboard.yieldBySport?.length > 0 && (
              <div style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>🏅 Yield por deporte</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {dashboard.yieldBySport.map((s, i) => {
                    const color = s.yield >= 5 ? "#34d399" : s.yield >= 0 ? "#fbbf24" : "#f87171";
                    const barW = Math.min(100, Math.abs(s.yield) * 4);
                    return (
                      <div key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#e0e7ff" }}>{s.label}</span>
                          <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                            <span style={{ color: "#475569" }}>Apostado: <strong style={{ color: "#94a3b8" }}>${fmtMoney(s.staked)}</strong></span>
                            <span style={{ color: "#475569" }}>P&L: <strong style={{ color: s.pnl >= 0 ? "#34d399" : "#f87171" }}>{s.pnl >= 0 ? "+" : ""}${fmtMoney(s.pnl)}</strong></span>
                            <span style={{ color: "#475569" }}>Yield: <strong style={{ color }}>{s.yield >= 0 ? "+" : ""}{s.yield.toFixed(1)}%</strong></span>
                          </div>
                        </div>
                        <div style={{ height: 6, background: "rgba(255,255,255,.05)", borderRadius: 3 }}>
                          <div style={{ height: "100%", width: `${barW}%`, background: color, borderRadius: 3, transition: "width .5s" }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>
                          {s.yield >= 10 ? "🔥 Excelente — sigue apostando en este deporte" : s.yield >= 5 ? "✅ Bueno — rentable" : s.yield >= 0 ? "🟡 Neutro — sin pérdidas pero sin ganancias claras" : "🔴 Negativo — reduce stakes aquí"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", marginBottom: 20 }}>

              {/* Mercados con más aciertos */}
              {dashboard.marketStats.length > 0 && (
                <div style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>🎯 Mercados por acierto</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dashboard.marketStats.slice(0, 6).map((m, i) => {
                      const color = m.rate >= 65 ? "#34d399" : m.rate >= 45 ? "#fbbf24" : "#f87171";
                      return (
                        <div key={i}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 11, color: "#e0e7ff", fontWeight: 600, maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
                            <span style={{ fontSize: 11, fontWeight: 900, color }}>{m.rate.toFixed(0)}% ({m.hits}/{m.total})</span>
                          </div>
                          <div style={{ height: 4, background: "rgba(255,255,255,.05)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${m.rate}%`, background: color, borderRadius: 2, transition: "width .5s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Equipos que más ganan */}
              {dashboard.teamStats.length > 0 && (
                <div style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>⭐ Equipos rentables</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dashboard.teamStats.map((t, i) => {
                      const color = t.rate >= 65 ? "#34d399" : t.rate >= 45 ? "#fbbf24" : "#f87171";
                      const isFav = favoritos.some(f => f.nombre.toLowerCase() === t.label.toLowerCase());
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 11, color: "#e0e7ff", fontWeight: 600 }}>{t.label}</span>
                                {isFav && <span style={{ fontSize: 10 }}>⭐</span>}
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 900, color }}>{t.rate.toFixed(0)}%</span>
                            </div>
                            <div style={{ height: 4, background: "rgba(255,255,255,.05)", borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${t.rate}%`, background: color, borderRadius: 2 }} />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (isFav) {
                                setFavoritos(prev => prev.filter(f => f.nombre.toLowerCase() !== t.label.toLowerCase()));
                              } else {
                                setFavoritos(prev => [...prev, { id: makeId(), nombre: t.label, tipo: "club", ligas: "" }]);
                              }
                            }}
                            style={{ fontSize: 14, background: "none", border: "none", cursor: "pointer", opacity: isFav ? 1 : 0.3, transition: "opacity .2s" }}
                            title={isFav ? "Quitar de favoritos" : "Agregar a favoritos"}
                          >⭐</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Mensaje si no hay datos */}
            {!dashboard.bankCurve.length || dashboard.bankCurve.length < 2 ? (
              <div style={{ background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.15)", borderRadius: 16, padding: "20px 16px", textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#a5b4fc", marginBottom: 4 }}>Configura tu banco para ver el dashboard</div>
                <div style={{ fontSize: 11, color: "#475569" }}>Ingresa tu saldo inicial de $630 y registra tus apuestas para ver las gráficas.</div>
              </div>
            ) : null}

            {/* ── CONFIGURAR BANCO INICIAL ──────────────────────────────────── */}
            <div style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>💰 Tu banco en Hondubet</div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700, display: "block", marginBottom: 4 }}>Saldo inicial ($)</label>
                  <input
                    type="number"
                    value={bankroll.inicial}
                    onChange={e => setBankroll(b => ({ ...b, inicial: e.target.value }))}
                    placeholder="630"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(99,102,241,.3)", background: "rgba(15,23,42,.8)", color: "#e0e7ff", fontSize: 16, fontWeight: 800, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ fontSize: 12, color: "#475569", paddingBottom: 10 }}>
                  Actual: <span style={{ color: dashboard.currentBank >= toNum(bankroll.inicial) ? "#34d399" : "#f87171", fontWeight: 800 }}>${fmtMoney(dashboard.currentBank)}</span>
                </div>
              </div>
              {!bankroll.inicial && (
                <p style={{ fontSize: 11, color: "#fbbf24", margin: "8px 0 0", fontWeight: 700 }}>⚠️ Ingresa tu saldo de Hondubet para activar Kelly y el dashboard</p>
              )}
            </div>

            {/* ── RESUMEN DEL DÍA ──────────────────────────────────────────── */}
            {mounted && (() => {
              const today = new Date().toISOString().slice(0, 10);
              const todayBets = bankroll.apuestas.filter(b => b.fecha === today);
              const todaySettled = todayBets.filter(b => b.estado === "ganada" || b.estado === "perdida");
              const todayPending = todayBets.filter(b => b.estado === "pendiente");
              const todayPnl = todaySettled.reduce((s, b) => s + betProfit(b), 0);
              const todayWins = todaySettled.filter(b => b.estado === "ganada").length;
              const todayStaked = todaySettled.reduce((s, b) => s + toNum(b.stake), 0);
              if (!todayBets.length) return null;
              return (
                <div style={{ background: `${todayPnl >= 0 ? "rgba(52,211,153,.08)" : "rgba(239,68,68,.08)"}`, border: `1px solid ${todayPnl >= 0 ? "rgba(52,211,153,.2)" : "rgba(239,68,68,.2)"}`, borderRadius: 16, padding: "14px 18px", marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: todayPnl >= 0 ? "#34d399" : "#f87171", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
                    📅 Resumen de hoy — {new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#475569" }}>Apuestas hoy</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff" }}>{todayBets.length}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#475569" }}>Resultadas</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff" }}>{todaySettled.length} {todayPending.length > 0 && <span style={{ fontSize: 11, color: "#fbbf24" }}>({todayPending.length} pend.)</span>}</div>
                    </div>
                    {todaySettled.length > 0 && (
                      <>
                        <div>
                          <div style={{ fontSize: 10, color: "#475569" }}>Win rate hoy</div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: todayWins / todaySettled.length >= 0.5 ? "#34d399" : "#f87171" }}>
                            {((todayWins / todaySettled.length) * 100).toFixed(0)}%
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#475569" }}>P&L hoy</div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: todayPnl >= 0 ? "#34d399" : "#f87171" }}>
                            {todayPnl >= 0 ? "+" : ""}${fmtMoney(todayPnl)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#475569" }}>Apostado hoy</div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: "#94a3b8" }}>${fmtMoney(todayStaked)}</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(130px, 1fr))", marginBottom: 20 }}>
              {[
                { label: "Banco inicial", val: `$${fmtMoney(stats.inicial)}`, color: "#94a3b8" },
                { label: "Banco actual", val: `$${fmtMoney(stats.currentBank)}`, color: stats.currentBank >= stats.inicial ? "#34d399" : "#f87171" },
                { label: "P&L total", val: `${stats.totalProfit >= 0 ? "+" : ""}$${fmtMoney(stats.totalProfit)}`, color: stats.totalProfit >= 0 ? "#34d399" : "#f87171" },
                { label: "Win rate", val: fmtPct(stats.winRate), color: stats.winRate >= 55 ? "#34d399" : stats.winRate >= 45 ? "#fbbf24" : "#f87171" },
                { label: "ROI", val: fmtPct(stats.roi), color: stats.roi >= 0 ? "#34d399" : "#f87171" },
                { label: "Apostado", val: `$${fmtMoney(stats.totalStaked)}`, color: "#818cf8" },
              ].map(x => (
                <div key={x.label} style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 12, padding: "14px 12px" }}>
                  <div style={{ fontSize: 10, color: "#334155", marginBottom: 4 }}>{x.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: x.color }}>{x.val}</div>
                </div>
              ))}
            </div>

            {streak >= 3 && (
              <div style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#f87171" }}>🔴 Racha de {streak} pérdidas consecutivas — considera reducir el stake</span>
              </div>
            )}

            <div style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#64748b", marginBottom: 14, textTransform: "uppercase" }}>Nueva Apuesta Manual</div>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  { key: "partido", label: "Partido", placeholder: "Ej: Madrid vs Barça" },
                  { key: "pick", label: "Pick", placeholder: "Ej: Over 2.5 goles" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={labelStyle}>{f.label}</label>
                    <input value={betDraft[f.key]} onChange={e => setBetDraft(b => ({ ...b, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inputStyle} />
                  </div>
                ))}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Stake ($)</label>
                    <input type="number" value={betDraft.stake} onChange={e => setBetDraft(b => ({ ...b, stake: e.target.value }))} placeholder="10" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Cuota</label>
                    <input type="number" step="0.01" value={betDraft.cuota} onChange={e => setBetDraft(b => ({ ...b, cuota: e.target.value }))} placeholder="1.85" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Banco inicial ($)</label>
                    <input type="number" value={bankroll.inicial} onChange={e => setBankroll(b => ({ ...b, inicial: e.target.value }))} placeholder="100" style={inputStyle} />
                  </div>
                </div>
              </div>
              <button onClick={addBet} style={{ marginTop: 12, width: "100%", padding: 12, borderRadius: 12, border: "none", background: "rgba(99,102,241,.2)", color: "#a5b4fc", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                ＋ Registrar Apuesta
              </button>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Apuestas ({bankroll.apuestas.length})</div>
                <button onClick={() => setShowBankHistory(v => !v)} style={{ fontSize: 11, color: "#475569", background: "none", border: "none", cursor: "pointer" }}>
                  {showBankHistory ? "Ocultar" : "Mostrar todas"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(showBankHistory ? bankroll.apuestas : bankroll.apuestas.slice(0, 5)).map(bet => (
                  <div key={bet.id} style={{ background: "rgba(15,23,42,.5)", border: `1px solid ${bet.estado === "ganada" ? "rgba(52,211,153,.2)" : bet.estado === "perdida" ? "rgba(239,68,68,.2)" : "rgba(255,255,255,.06)"}`, borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e7ff" }}>{bet.partido}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>{bet.pick} · ${fmtMoney(toNum(bet.stake))} @ {toNum(bet.cuota).toFixed(2)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {bet.estado !== "ganada" && bet.estado !== "perdida" && <>
                        <button onClick={() => updateBetStatus(bet.id, "ganada")} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "none", background: "rgba(52,211,153,.15)", color: "#34d399", cursor: "pointer", fontWeight: 700 }}>✅</button>
                        <button onClick={() => updateBetStatus(bet.id, "perdida")} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "none", background: "rgba(239,68,68,.15)", color: "#f87171", cursor: "pointer", fontWeight: 700 }}>❌</button>
                      </>}
                      {bet.estado === "ganada" && <span style={{ fontSize: 12, fontWeight: 800, color: "#34d399" }}>+${fmtMoney(betProfit(bet))}</span>}
                      {bet.estado === "perdida" && <span style={{ fontSize: 12, fontWeight: 800, color: "#f87171" }}>-${fmtMoney(toNum(bet.stake))}</span>}
                      <button onClick={() => deleteBet(bet.id)} style={{ fontSize: 11, color: "#334155", background: "none", border: "none", cursor: "pointer" }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: HISTORIAL ───────────────────────────────────────────────── */}
        {activeTab === "historial" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#6366f1", textTransform: "uppercase", marginBottom: 2 }}>Tickets guardados</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>📚 Historial</h2>
            </div>

            {/* ── ROI POR COMPETICIÓN ───────────────────────────────────────── */}
            {(() => {
              const roiByLiga = calcROIByLiga(reviews);
              if (!roiByLiga.length) return null;
              return (
                <div style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(99,102,241,.15)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#6366f1", textTransform: "uppercase", marginBottom: 12 }}>📊 Tu acierto por competición</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {roiByLiga.map(({ liga, total, aciertos, rate }) => {
                      const color = rate >= 65 ? "#34d399" : rate >= 45 ? "#fbbf24" : "#f87171";
                      const bg = rate >= 65 ? "rgba(52,211,153,.08)" : rate >= 45 ? "rgba(245,158,11,.08)" : "rgba(239,68,68,.08)";
                      return (
                        <div key={liga} style={{ background: bg, border: `1px solid ${color}25`, borderRadius: 12, padding: "10px 14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#e0e7ff" }}>{liga}</span>
                            <span style={{ fontSize: 13, fontWeight: 900, color }}>{rate.toFixed(0)}% · {aciertos}/{total}</span>
                          </div>
                          <div style={{ height: 6, background: "rgba(255,255,255,.05)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${rate}%`, background: color, borderRadius: 4, transition: "width .5s" }} />
                          </div>
                          <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                            {rate >= 65 ? "✅ Tu mejor competición — prioriza picks aquí" : rate >= 45 ? "🟡 Rendimiento moderado" : "🔴 Competición difícil — reduce stake o evita"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {historial.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#334155" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
                <div style={{ fontWeight: 700, color: "#475569" }}>Sin tickets guardados</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {historial.map(ticket => (
                  <div key={ticket.id} style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 16, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800, color: "#e0e7ff", fontSize: 14 }}>{ticket.partido}</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{ticket.liga} · {new Date(ticket.fecha).toLocaleDateString()} · {ticket.picks?.length || 0} picks</div>
                        {ticket.condicionPartido && <div style={{ fontSize: 11, color: "#a78bfa", marginTop: 2 }}>⚡ {ticket.condicionPartido.slice(0, 80)}...</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#a5b4fc" }}>x{ticket.combinada?.toFixed(2)}</span>
                        <button onClick={() => openReviewModal(ticket)}
                          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(99,102,241,.3)", background: "rgba(99,102,241,.1)", color: "#a5b4fc", cursor: "pointer", fontWeight: 700 }}>
                          📝 Review
                        </button>
                        <button onClick={() => { if (confirm("¿Eliminar ticket?")) setHistorial(prev => prev.filter(h => h.id !== ticket.id)); }}
                          style={{ fontSize: 11, color: "#334155", background: "none", border: "none", cursor: "pointer" }}>🗑</button>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(ticket.picks || []).map((p, i) => (
                        <span key={i} style={{ fontSize: 11, background: "rgba(99,102,241,.08)", color: "#818cf8", padding: "3px 8px", borderRadius: 6 }}>
                          {p.mercado} {p.linea} {p.pesoAnalisis ? `(${p.pesoAnalisis}/10)` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: IA VS REALIDAD ──────────────────────────────────────────── */}
        {activeTab === "ia-review" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#6366f1", textTransform: "uppercase", marginBottom: 2 }}>Calibración</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>🆚 IA vs Realidad</h2>
              <p style={{ fontSize: 13, color: "#334155", marginTop: 4 }}>Cada review que guardes mejora la calibración del motor para futuros análisis.</p>
            </div>
            {reviews.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#334155" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🆚</div>
                <div style={{ fontWeight: 700, color: "#475569", marginBottom: 8 }}>Sin reviews aún</div>
                <div style={{ fontSize: 13 }}>Después de cada partido, registra el resultado desde "Historial"</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {reviews.map(review => {
                  const acc = review.totalPicks > 0 ? (review.aciertos / review.totalPicks * 100).toFixed(0) : null;
                  return (
                    <div key={review.id} style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 16, padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 800, color: "#e0e7ff", fontSize: 14 }}>{review.partido}</div>
                          <div style={{ fontSize: 11, color: "#475569" }}>{review.liga} · {new Date(review.fecha).toLocaleDateString()}</div>
                        </div>
                        {acc !== null && (
                          <span style={{ fontSize: 14, fontWeight: 900, color: Number(acc) >= 60 ? "#34d399" : Number(acc) >= 40 ? "#fbbf24" : "#f87171", background: "rgba(15,23,42,.7)", padding: "4px 10px", borderRadius: 10 }}>
                            {acc}% acierto
                          </span>
                        )}
                      </div>
                      {review.resultadoReal?.golesLocal !== "" && (
                        <div style={{ background: "rgba(99,102,241,.06)", borderRadius: 10, padding: "6px 12px", marginBottom: 10 }}>
                          <span style={{ fontSize: 11, color: "#64748b" }}>Resultado: </span>
                          <span style={{ fontWeight: 800, color: "#e0e7ff", fontSize: 13 }}>
                            {review.local} {review.resultadoReal?.golesLocal} – {review.resultadoReal?.golesVisita} {review.visitante}
                          </span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(review.picks || []).map((p, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(15,23,42,.4)", borderRadius: 8, padding: "6px 12px" }}>
                            <div style={{ fontSize: 12, color: "#94a3b8" }}>{p.mercado} {p.linea} <span style={{ color: "#475569" }}>({p.confianza}%)</span></div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: p.resultado === "acierto" ? "#34d399" : p.resultado === "fallo" ? "#f87171" : "#334155" }}>
                              {p.resultado === "acierto" ? "✅" : p.resultado === "fallo" ? "❌" : "⬜"}
                            </span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => { if (confirm("¿Eliminar este review?")) setReviews(r => r.filter(rv => rv.id !== review.id)); }}
                        style={{ marginTop: 10, padding: "4px 12px", borderRadius: 8, border: "none", background: "rgba(239,68,68,.08)", color: "#f87171", fontSize: 11, cursor: "pointer" }}>
                        🗑 Eliminar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: STATS IA ────────────────────────────────────────────────── */}
        {activeTab === "ia-stats" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#6366f1", textTransform: "uppercase", marginBottom: 2 }}>Performance</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>📈 Stats del Motor IA</h2>
              <p style={{ fontSize: 13, color: "#334155", marginTop: 4 }}>Track record real — basado en tus reviews. El motor usa estos datos en cada análisis.</p>
            </div>

            {iaStats.totalPicks === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#334155" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📉</div>
                <div style={{ fontWeight: 700, color: "#475569", marginBottom: 8 }}>Sin datos aún</div>
                <div style={{ fontSize: 13 }}>Registra al menos 3 reviews para ver estadísticas y calibrar el motor</div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
                  {[
                    { label: "Win Rate IA", val: fmtPct(iaStats.winRate), color: iaStats.winRate >= 55 ? "#34d399" : iaStats.winRate >= 45 ? "#fbbf24" : "#f87171" },
                    { label: "Picks evaluados", val: iaStats.totalPicks, color: "#818cf8" },
                    { label: "Aciertos", val: iaStats.aciertos, color: "#34d399" },
                    { label: "Fallos", val: iaStats.fallos, color: "#f87171" },
                    { label: "Overs sugeridos", val: iaStats.overs, color: "#6ee7b7" },
                    { label: "Unders sugeridos", val: iaStats.unders, color: "#7dd3fc" },
                  ].map(x => (
                    <div key={x.label} style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 12, padding: "14px 12px" }}>
                      <div style={{ fontSize: 10, color: "#334155", marginBottom: 4 }}>{x.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: x.color }}>{x.val}</div>
                    </div>
                  ))}
                </div>

                {/* NEW: Failing vs winning markets */}
                {iaStats.failingMarkets.length > 0 && (
                  <div style={{ background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#f87171", marginBottom: 10 }}>🔴 MERCADOS QUE FALLAN (el motor los penaliza)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {iaStats.failingMarkets.map(m => (
                        <div key={m.mercado} style={{ display: "flex", justifyContent: "space-between", background: "rgba(15,23,42,.4)", borderRadius: 8, padding: "6px 12px" }}>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>{m.mercado}</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#f87171" }}>{m.rate}% ({m.total} picks)</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 8 }}>La IA recibirá este contexto y bajará la confianza en estos mercados.</div>
                  </div>
                )}

                {iaStats.winningMarkets.length > 0 && (
                  <div style={{ background: "rgba(52,211,153,.04)", border: "1px solid rgba(52,211,153,.12)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#34d399", marginBottom: 10 }}>🟢 MERCADOS EXITOSOS (el motor los potencia)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {iaStats.winningMarkets.map(m => (
                        <div key={m.mercado} style={{ display: "flex", justifyContent: "space-between", background: "rgba(15,23,42,.4)", borderRadius: 8, padding: "6px 12px" }}>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>{m.mercado}</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#34d399" }}>{m.rate}% ({m.total} picks)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Streak */}
                <div style={{ background: "rgba(15,23,42,.5)", border: `1px solid ${iaStats.streakType === "acierto" ? "rgba(52,211,153,.15)" : "rgba(239,68,68,.15)"}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#334155", marginBottom: 6, textTransform: "uppercase" }}>Racha actual del motor</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: iaStats.streakType === "acierto" ? "#34d399" : "#f87171" }}>
                    {iaStats.streak > 0 ? `${iaStats.streakType === "acierto" ? "✅" : "❌"} ${iaStats.streak} ${iaStats.streakType === "acierto" ? "aciertos" : "fallos"} consecutivos` : "Sin racha"}
                  </div>
                </div>

                {/* Bias alert */}
                {iaStats.biasAlert && (
                  <div style={{ background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>{iaStats.biasAlert}</div>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                      {iaStats.overs} overs vs {iaStats.unders} unders. El motor recibe este contexto y ajusta en el próximo análisis.
                    </div>
                  </div>
                )}

                {/* Calibration by confidence */}
                <div style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 12, textTransform: "uppercase" }}>Calibración por Confianza</div>
                  <div style={{ fontSize: 11, color: "#334155", marginBottom: 14 }}>¿Los picks con más confianza realmente ganan más?</div>
                  {Object.entries(iaStats.buckets).map(([range, data]) => {
                    const pct = data.total > 0 ? (data.hits / data.total * 100) : null;
                    return (
                      <div key={range} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>Confianza {range}%</span>
                          <span style={{ fontSize: 12, color: pct === null ? "#334155" : pct >= 60 ? "#34d399" : pct >= 45 ? "#fbbf24" : "#f87171", fontWeight: 800 }}>
                            {pct === null ? "Sin datos" : `${pct.toFixed(0)}% (${data.hits}/${data.total})`}
                          </span>
                        </div>
                        {data.total > 0 && (
                          <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: pct >= 60 ? "#34d399" : pct >= 45 ? "#fbbf24" : "#f87171", borderRadius: 4, transition: "width .5s" }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 11, color: "#334155", marginTop: 8, lineHeight: 1.5 }}>
                    💡 Si los picks de 85%+ acierten menos que los de 65-74%, el motor está sobreestimando confianza en picks difíciles.
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB: EQUIPOS ─────────────────────────────────────────────────── */}
        {activeTab === "equipos" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#6366f1", textTransform: "uppercase", marginBottom: 2 }}>Perfiles</div>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>🏟️ Equipos</h2>
                  <p style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>Registra los resultados reales de cada partido. La IA usa estos datos en el próximo análisis del equipo.</p>
                </div>
                {/* Export / Import buttons */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => {
                    const data = { equipos, exportedAt: new Date().toISOString(), version: "v1" };
                    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `equipos_${activeSport}_${new Date().toISOString().slice(0,10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast("✅ Perfiles exportados", "success");
                  }} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(52,211,153,.3)", background: "rgba(52,211,153,.08)", color: "#34d399", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    ⬇ Exportar
                  </button>
                  <label style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(56,189,248,.3)", background: "rgba(56,189,248,.08)", color: "#7dd3fc", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    📂 Importar
                    <input type="file" accept="application/json" style={{ display: "none" }} onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        try {
                          const data = JSON.parse(ev.target.result);
                          if (!Array.isArray(data.equipos)) throw new Error("Formato inválido");
                          if (window.confirm(`¿Importar ${data.equipos.length} equipos? Los perfiles existentes se fusionarán (no se borrarán).`)) {
                            setEquipos(prev => {
                              const merged = [...prev];
                              data.equipos.forEach(eq => {
                                const idx = merged.findIndex(e => e.id === eq.id);
                                if (idx >= 0) merged[idx] = eq; // update existing
                                else merged.push(eq); // add new
                              });
                              return merged;
                            });
                            showToast(`✅ ${data.equipos.length} equipos importados`, "success");
                          }
                        } catch { showToast("Error al importar — verifica el archivo", "error"); }
                      };
                      reader.readAsText(file);
                      e.target.value = "";
                    }} />
                  </label>
                  {equipos.length > 0 && (
                    <span style={{ fontSize: 11, color: "#475569" }}>{equipos.length} equipo{equipos.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Buscar o crear equipo */}
            <div style={{ background: "rgba(30,27,75,.35)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#a5b4fc", marginBottom: 10 }}>🔍 Buscar o crear equipo</div>
              <div style={{ display: "flex", gap: 8 }}>
                <TeamAutocomplete
                  value={equipoSearch}
                  onChange={setEquipoSearch}
                  equipos={equipos}
                  placeholder="Ej: España, Yankees, Lakers..."
                  style={{ ...inputStyle, flex: 1 }}
                  onSelect={(name) => {
                    const found = equipos.find(eq => eq.nombre.toLowerCase() === name.toLowerCase() && (eq.deporte||"futbol") === activeSport);
                    if (found) { setEquipoSeleccionado(found); }
                    else {
                      const nuevo = { id: makeId(), nombre: name.trim(), deporte: activeSport, partidos: [] };
                      setEquipos(prev => [...prev, nuevo]);
                      setEquipoSeleccionado(nuevo);
                    }
                    setEquipoSearch("");
                  }}
                />
                <button onClick={() => {
                  if (!equipoSearch.trim()) return;
                  const found = equipos.find(eq => eq.nombre.toLowerCase() === equipoSearch.toLowerCase() && (eq.deporte||"futbol") === activeSport);
                  if (found) { setEquipoSeleccionado(found); setEquipoSearch(""); }
                  else {
                    const nuevo = { id: makeId(), nombre: equipoSearch.trim(), deporte: activeSport, partidos: [] };
                    setEquipos(prev => [...prev, nuevo]);
                    setEquipoSeleccionado(nuevo);
                    setEquipoSearch("");
                  }
                }} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "rgba(99,102,241,.2)", color: "#a5b4fc", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
                  Abrir →
                </button>
              </div>
              {/* Lista de equipos registrados */}
              {equipos.filter(e => (e.deporte||"futbol") === activeSport).length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {equipos.filter(e => (e.deporte||"futbol") === activeSport).map(e => (
                    <button key={e.id} onClick={() => setEquipoSeleccionado(e)}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: `1px solid ${equipoSeleccionado?.id === e.id ? "rgba(99,102,241,.5)" : "rgba(255,255,255,.08)"}`, background: equipoSeleccionado?.id === e.id ? "rgba(99,102,241,.2)" : "transparent", color: equipoSeleccionado?.id === e.id ? "#a5b4fc" : "#475569", cursor: "pointer", fontWeight: 700 }}>
                      {e.nombre} <span style={{ opacity: .6 }}>({e.partidos?.length || 0})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Perfil del equipo seleccionado */}
            {equipoSeleccionado && (() => {
              const equipo = equipos.find(e => e.id === equipoSeleccionado.id) || equipoSeleccionado;
              const avg = equipo.partidos?.length ? calcTeamAvg(equipo.partidos.slice(-5), equipo.deporte || activeSport) : null;
              const dep = equipo.deporte || activeSport;

              return (
                <div>
                  {/* Header del equipo */}
                  <div style={{ background: "rgba(15,23,42,.7)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#e0e7ff" }}>{equipo.nombre}</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{dep === "mlb" ? "⚾ MLB" : dep === "nba" ? "🏀 NBA" : "⚽ Fútbol"} · {equipo.partidos?.length || 0} partidos registrados</div>
                      </div>
                      <button onClick={() => { if (window.confirm("¿Eliminar este equipo y todos sus datos?")) { setEquipos(prev => prev.filter(e => e.id !== equipo.id)); setEquipoSeleccionado(null); } }}
                        style={{ fontSize: 11, color: "#f87171", background: "none", border: "none", cursor: "pointer" }}>🗑 Eliminar</button>
                    </div>

                    {/* Promedios */}
                    {avg && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}>
                        <div style={{ textAlign: "center", background: "rgba(99,102,241,.08)", borderRadius: 10, padding: "8px 0" }}>
                          <div style={{ fontSize: 10, color: "#475569" }}>Win rate</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: toNum(avg.winRate) >= 50 ? "#34d399" : "#f87171" }}>{avg.winRate}%</div>
                        </div>
                        {dep === "futbol" && <>
                          <div style={{ textAlign: "center", background: "rgba(52,211,153,.06)", borderRadius: 10, padding: "8px 0" }}>
                            <div style={{ fontSize: 10, color: "#475569" }}>Goles/juego</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#34d399" }}>{avg.golesAnotados}</div>
                          </div>
                          <div style={{ textAlign: "center", background: "rgba(239,68,68,.06)", borderRadius: 10, padding: "8px 0" }}>
                            <div style={{ fontSize: 10, color: "#475569" }}>Recibidos/juego</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#f87171" }}>{avg.golesRecibidos}</div>
                          </div>
                          <div style={{ textAlign: "center", background: "rgba(99,102,241,.06)", borderRadius: 10, padding: "8px 0" }}>
                            <div style={{ fontSize: 10, color: "#475569" }}>Corners/juego</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#a5b4fc" }}>{avg.corners}</div>
                          </div>
                          <div style={{ textAlign: "center", background: "rgba(251,191,36,.06)", borderRadius: 10, padding: "8px 0" }}>
                            <div style={{ fontSize: 10, color: "#475569" }}>Tarjetas/juego</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#fbbf24" }}>{avg.tarjetas}</div>
                          </div>
                        </>}
                        {dep === "mlb" && <>
                          <div style={{ textAlign: "center", background: "rgba(52,211,153,.06)", borderRadius: 10, padding: "8px 0" }}>
                            <div style={{ fontSize: 10, color: "#475569" }}>Carreras/juego</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#34d399" }}>{avg.carrerasAnotadas}</div>
                          </div>
                          <div style={{ textAlign: "center", background: "rgba(239,68,68,.06)", borderRadius: 10, padding: "8px 0" }}>
                            <div style={{ fontSize: 10, color: "#475569" }}>Recibidas/juego</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#f87171" }}>{avg.carrerasRecibidas}</div>
                          </div>
                          <div style={{ textAlign: "center", background: "rgba(99,102,241,.06)", borderRadius: 10, padding: "8px 0" }}>
                            <div style={{ fontSize: 10, color: "#475569" }}>Hits/juego</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#a5b4fc" }}>{avg.hitsAnotados}</div>
                          </div>
                        </>}
                        {dep === "nba" && <>
                          <div style={{ textAlign: "center", background: "rgba(52,211,153,.06)", borderRadius: 10, padding: "8px 0" }}>
                            <div style={{ fontSize: 10, color: "#475569" }}>Puntos/juego</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#34d399" }}>{avg.puntosAnotados}</div>
                          </div>
                          <div style={{ textAlign: "center", background: "rgba(239,68,68,.06)", borderRadius: 10, padding: "8px 0" }}>
                            <div style={{ fontSize: 10, color: "#475569" }}>Recibidos/juego</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#f87171" }}>{avg.puntosRecibidos}</div>
                          </div>
                          <div style={{ textAlign: "center", background: "rgba(99,102,241,.06)", borderRadius: 10, padding: "8px 0" }}>
                            <div style={{ fontSize: 10, color: "#475569" }}>Rebotes/juego</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#a5b4fc" }}>{avg.rebotes}</div>
                          </div>
                        </>}
                      </div>
                    )}
                  </div>

                  {/* Agregar partido */}
                  <div style={{ background: "rgba(30,27,75,.35)", border: `1px solid ${partidoDraft?._editIndex !== undefined ? "rgba(251,191,36,.3)" : "rgba(99,102,241,.15)"}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: partidoDraft?._editIndex !== undefined ? "#fbbf24" : "#a5b4fc", marginBottom: 12 }}>
                      {partidoDraft?._editIndex !== undefined ? "✏️ Editando partido" : "➕ Registrar partido"}
                    </div>
                    {!partidoDraft ? (
                      <button onClick={() => setPartidoDraft({ ...emptyPartidoEquipo(dep), id: makeId(), fecha: new Date().toISOString().slice(0, 10) })}
                        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px dashed rgba(99,102,241,.3)", background: "transparent", color: "#6366f1", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                        + Nuevo partido
                      </button>
                    ) : (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                          <div>
                            <label style={labelStyle}>Rival</label>
                            <input value={partidoDraft.rival ?? ""} onChange={e => setPartidoDraft(d => ({ ...d, rival: e.target.value }))} placeholder={dep === "mlb" ? "Ej: Yankees" : dep === "nba" ? "Ej: Lakers" : "Ej: Alemania"} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Fecha</label>
                            <input type="date" value={partidoDraft.fecha ?? ""} onChange={e => setPartidoDraft(d => ({ ...d, fecha: e.target.value }))} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>{dep === "mlb" ? "Campo (Home/Away)" : "Condición"}</label>
                            <select value={partidoDraft.condicion ?? "local"} onChange={e => setPartidoDraft(d => ({ ...d, condicion: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                              <option value="local">{dep === "mlb" ? "🏠 Home" : dep === "nba" ? "🏠 Home" : "🏠 Local"}</option>
                              <option value="visitante">{dep === "mlb" ? "✈️ Away" : dep === "nba" ? "✈️ Away" : "✈️ Visitante"}</option>
                            </select>
                          </div>
                        </div>

                        {/* Resultado */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                          <div>
                            <label style={labelStyle}>Resultado</label>
                            <select value={partidoDraft.resultado ?? ""} onChange={e => setPartidoDraft(d => ({ ...d, resultado: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                              <option value="">Seleccionar</option>
                              <option value="W">✅ Victoria (W)</option>
                              {dep === "futbol" && <option value="D">🟡 Empate (D)</option>}
                              <option value="L">❌ Derrota (L)</option>
                            </select>
                          </div>
                        </div>

                        {/* Stats por deporte */}
                        {dep === "futbol" && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                            {[
                              { key: "golesAnotados", label: "Goles ⚽", placeholder: "2" },
                              { key: "golesRecibidos", label: "Recibidos 🛡️", placeholder: "1" },
                              { key: "corners", label: "Corners ⛳", placeholder: "5" },
                              { key: "tarjetas", label: "Tarjetas 🟨", placeholder: "2" },
                            ].map(f => (
                              <div key={f.key}>
                                <label style={labelStyle}>{f.label}</label>
                                <input type="number" value={partidoDraft[f.key] ?? ""} onChange={e => setPartidoDraft(d => ({ ...d, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inputStyle} />
                              </div>
                            ))}
                          </div>
                        )}
                        {dep === "mlb" && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                            {[
                              { key: "carrerasAnotadas", label: "Carreras ⚾", placeholder: "5" },
                              { key: "carrerasRecibidas", label: "Recibidas 🛡️", placeholder: "3" },
                              { key: "hitsAnotados", label: "Hits 🏏", placeholder: "9" },
                              { key: "errores", label: "Errores ❌", placeholder: "1" },
                            ].map(f => (
                              <div key={f.key}>
                                <label style={labelStyle}>{f.label}</label>
                                <input type="number" value={partidoDraft[f.key] ?? ""} onChange={e => setPartidoDraft(d => ({ ...d, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inputStyle} />
                              </div>
                            ))}
                          </div>
                        )}
                        {dep === "nba" && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                            <div>
                              <label style={labelStyle}>Puntos 🏀</label>
                              <input type="number" value={partidoDraft.puntosAnotados ?? ""} onChange={e => setPartidoDraft(d => ({ ...d, puntosAnotados: e.target.value }))} placeholder="115" style={inputStyle} />
                            </div>
                            <div>
                              <label style={labelStyle}>Recibidos 🛡️</label>
                              <input type="number" value={partidoDraft.puntosRecibidos ?? ""} onChange={e => setPartidoDraft(d => ({ ...d, puntosRecibidos: e.target.value }))} placeholder="108" style={inputStyle} />
                            </div>
                            <div>
                              <label style={labelStyle}>Rebotes 💪</label>
                              <input type="number" value={partidoDraft.rebotes ?? ""} onChange={e => setPartidoDraft(d => ({ ...d, rebotes: e.target.value }))} placeholder="42" style={inputStyle} />
                            </div>
                            <div>
                              <label style={labelStyle}>Triples 3️⃣ (H/I)</label>
                              <input value={partidoDraft.triples ?? ""} onChange={e => setPartidoDraft(d => ({ ...d, triples: e.target.value }))} placeholder="11/19" style={inputStyle} />
                            </div>
                          </div>
                        )}

                        {/* Eventos del partido */}
                        <div style={{ marginBottom: 10 }}>
                          <label style={labelStyle}>Eventos del partido</label>
                          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                            <input value={eventoInput} onChange={e => setEventoInput(e.target.value)}
                              placeholder="Ej: Penal min 78, Expulsión rival, Goleador: Mbappé..."
                              style={{ ...inputStyle, flex: 1 }}
                              onKeyDown={e => {
                                if (e.key === "Enter" && eventoInput.trim()) {
                                  setPartidoDraft(d => ({ ...d, eventos: [...(d.eventos||[]), eventoInput.trim()] }));
                                  setEventoInput("");
                                }
                              }} />
                            <button onClick={() => {
                              if (!eventoInput.trim()) return;
                              setPartidoDraft(d => ({ ...d, eventos: [...(d.eventos||[]), eventoInput.trim()] }));
                              setEventoInput("");
                            }} style={{ padding: "0 14px", borderRadius: 8, border: "none", background: "rgba(99,102,241,.2)", color: "#a5b4fc", fontWeight: 800, cursor: "pointer" }}>+</button>
                          </div>
                          {(partidoDraft.eventos||[]).length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {partidoDraft.eventos.map((ev, i) => (
                                <span key={i} style={{ fontSize: 11, background: "rgba(99,102,241,.1)", color: "#a5b4fc", padding: "2px 8px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
                                  {ev}
                                  <button onClick={() => setPartidoDraft(d => ({ ...d, eventos: d.eventos.filter((_, j) => j !== i) }))}
                                    style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Picks de la IA para este partido */}
                        {aiResult?.picks && match.local && (match.local.toLowerCase().includes(equipo.nombre.toLowerCase()) || match.visitante?.toLowerCase().includes(equipo.nombre.toLowerCase())) && picks.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <label style={labelStyle}>Picks IA de este análisis</label>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {picks.map(p => (
                                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(15,23,42,.5)", borderRadius: 8, padding: "6px 10px" }}>
                                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{p.mercado} {p.linea} ({p.confianza}%)</span>
                                  <select value={(partidoDraft.picksIA||[]).find(pk => pk.id === p.id)?.resultado || ""}
                                    onChange={e => {
                                      const updated = [...(partidoDraft.picksIA||[]).filter(pk => pk.id !== p.id)];
                                      if (e.target.value) updated.push({ id: p.id, mercado: p.mercado, linea: p.linea, resultado: e.target.value });
                                      setPartidoDraft(d => ({ ...d, picksIA: updated }));
                                    }}
                                    style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,.1)", background: "rgba(15,23,42,.8)", color: "#e0e7ff", cursor: "pointer" }}>
                                    <option value="">Resultado</option>
                                    <option value="acierto">✅ Acierto</option>
                                    <option value="fallo">❌ Fallo</option>
                                  </select>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Notas */}
                        <div style={{ marginBottom: 12 }}>
                          <label style={labelStyle}>Notas adicionales</label>
                          <input value={partidoDraft.notas} onChange={e => setPartidoDraft(d => ({ ...d, notas: e.target.value }))}
                            placeholder="Observaciones, contexto del partido, rendimiento general..."
                            style={inputStyle} />
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => {
                            if (!partidoDraft.rival.trim()) { showToast("Ingresa el rival", "error"); return; }
                            const isEdit = partidoDraft._editIndex !== undefined;
                            const cleanDraft = { ...partidoDraft };
                            delete cleanDraft._editIndex;
                            delete cleanDraft._editEquipoId;
                            setEquipos(prev => prev.map(e => e.id === equipo.id
                              ? { ...e, partidos: isEdit
                                  ? e.partidos.map((p, j) => j === partidoDraft._editIndex ? cleanDraft : p)
                                  : [cleanDraft, ...(e.partidos||[])] }
                              : e
                            ));
                            setPartidoDraft(null);
                            showToast(isEdit ? "✅ Partido actualizado" : "✅ Partido registrado", "success");
                          }} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #4338ca, #6366f1)", color: "#fff", fontWeight: 900, cursor: "pointer", fontSize: 13 }}>
                            {partidoDraft._editIndex !== undefined ? "✏️ Actualizar partido" : "💾 Guardar partido"}
                          </button>
                          <button onClick={() => setPartidoDraft(null)}
                            style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(239,68,68,.25)", background: "transparent", color: "#f87171", fontWeight: 700, cursor: "pointer" }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Historial de partidos del equipo */}
                  {equipo.partidos?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 10 }}>
                        Historial ({equipo.partidos.length} partidos)
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {equipo.partidos.map((p, i) => (
                          <div key={p.id || i} style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "12px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 14 }}>{p.resultado === "W" ? "✅" : p.resultado === "L" ? "❌" : "🟡"}</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: "#e0e7ff" }}>vs {p.rival}</span>
                                <span style={{ fontSize: 11, color: "#475569" }}>{p.condicion === "local" ? "🏠" : "✈️"} {p.fecha}</span>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => setPartidoDraft({ ...p, _editIndex: i, _editEquipoId: equipo.id })}
                                  style={{ fontSize: 10, color: "#a5b4fc", background: "none", border: "none", cursor: "pointer" }}>✏️</button>
                                <button onClick={() => { if (window.confirm("¿Eliminar este partido?")) setEquipos(prev => prev.map(e => e.id === equipo.id ? { ...e, partidos: e.partidos.filter((_, j) => j !== i) } : e)); }}
                                  style={{ fontSize: 10, color: "#334155", background: "none", border: "none", cursor: "pointer" }}>🗑</button>
                              </div>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11 }}>
                              {dep === "futbol" && <>
                                {p.golesAnotados !== "" && <span style={{ color: "#34d399" }}>⚽ {p.golesAnotados} goles</span>}
                                {p.golesRecibidos !== "" && <span style={{ color: "#f87171" }}>🛡️ {p.golesRecibidos} recibidos</span>}
                                {p.corners !== "" && <span style={{ color: "#a5b4fc" }}>⛳ {p.corners} corners</span>}
                                {p.tarjetas !== "" && <span style={{ color: "#fbbf24" }}>🟨 {p.tarjetas} tarjetas</span>}
                              </>}
                              {dep === "mlb" && <>
                                {p.carrerasAnotadas !== "" && <span style={{ color: "#34d399" }}>⚾ {p.carrerasAnotadas} carreras</span>}
                                {p.carrerasRecibidas !== "" && <span style={{ color: "#f87171" }}>🛡️ {p.carrerasRecibidas} recibidas</span>}
                                {p.hitsAnotados !== "" && <span style={{ color: "#a5b4fc" }}>🏏 {p.hitsAnotados} hits</span>}
                              </>}
                              {dep === "nba" && <>
                                {p.puntosAnotados !== "" && <span style={{ color: "#34d399" }}>🏀 {p.puntosAnotados} pts</span>}
                                {p.puntosRecibidos !== "" && <span style={{ color: "#f87171" }}>🛡️ {p.puntosRecibidos} recibidos</span>}
                                {p.rebotes !== "" && <span style={{ color: "#a5b4fc" }}>💪 {p.rebotes} reb</span>}
                              </>}
                            </div>
                            {(p.eventos||[]).length > 0 && (
                              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {p.eventos.map((ev, j) => <span key={j} style={{ fontSize: 10, background: "rgba(99,102,241,.08)", color: "#818cf8", padding: "1px 7px", borderRadius: 20 }}>{ev}</span>)}
                              </div>
                            )}
                            {p.notas && <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>{p.notas}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {!equipoSeleccionado && equipos.filter(e => (e.deporte||"futbol") === activeSport).length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#334155" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🏟️</div>
                <div style={{ fontWeight: 700, color: "#475569", marginBottom: 8 }}>Sin equipos registrados</div>
                <div style={{ fontSize: 13 }}>Busca un equipo arriba para crear su perfil estadístico.</div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: FAVORITOS ───────────────────────────────────────────────── */}
        {activeTab === "favoritos" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#fbbf24", textTransform: "uppercase", marginBottom: 2 }}>Mis equipos</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>⭐ Favoritos</h2>
              <p style={{ fontSize: 13, color: "#334155", marginTop: 4 }}>Agrega tus clubes y selecciones. La IA buscará sus próximos partidos en todas sus competencias de una sola vez.</p>
            </div>

            {/* Add favorite form */}
            <div style={{ background: "rgba(30,27,75,.35)", border: "1px solid rgba(251,191,36,.15)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#fbbf24", marginBottom: 12 }}>➕ Agregar favorito</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <label style={labelStyle}>Nombre</label>
                  <input value={favDraft.nombre} onChange={e => setFavDraft(d => ({ ...d, nombre: e.target.value }))}
                    placeholder="Ej: Real Madrid" style={inputStyle}
                    onKeyDown={e => e.key === "Enter" && addFavorito()} />
                </div>
                <div>
                  <label style={labelStyle}>Tipo</label>
                  <select value={favDraft.tipo} onChange={e => setFavDraft(d => ({ ...d, tipo: e.target.value }))}
                    style={{ ...inputStyle, cursor: "pointer" }}>
                    <option value="club">⚽ Club</option>
                    <option value="seleccion">🏳️ Selección nacional</option>
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>
                    {favDraft.tipo === "club" ? "Competencias (separadas por coma)" : "Torneos activos (opcional)"}
                  </label>
                  <input value={favDraft.ligas} onChange={e => setFavDraft(d => ({ ...d, ligas: e.target.value }))}
                    placeholder={favDraft.tipo === "club" ? "Ej: La Liga, Champions League, Copa del Rey" : "Ej: Eliminatorias CONMEBOL, Copa América"}
                    style={inputStyle} />
                  <div style={{ fontSize: 10, color: "#334155", marginTop: 4 }}>Si dejas vacío, la IA busca en todas sus competencias activas.</div>
                </div>
              </div>
              <button onClick={addFavorito}
                style={{ marginTop: 12, width: "100%", padding: "10px 0", borderRadius: 10, border: "none", background: "rgba(251,191,36,.15)", color: "#fbbf24", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                ⭐ Agregar
              </button>
            </div>

            {/* Favorites list */}
            {favoritos.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 10 }}>
                  Mi lista ({favoritos.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {favoritos.map(f => (
                    <div key={f.id} style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13 }}>{f.tipo === "club" ? "⚽" : "🏳️"}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#e0e7ff" }}>{f.nombre}</span>
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: f.tipo === "club" ? "rgba(99,102,241,.1)" : "rgba(251,191,36,.1)", color: f.tipo === "club" ? "#a5b4fc" : "#fbbf24", fontWeight: 700 }}>
                            {f.tipo === "club" ? "Club" : "Selección"}
                          </span>
                        </div>
                        {f.ligas?.length > 0 && (
                          <div style={{ fontSize: 11, color: "#334155", marginTop: 3 }}>
                            {f.ligas.join(" · ")}
                          </div>
                        )}
                      </div>
                      <button onClick={() => removeFavorito(f.id)}
                        style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 14, padding: 4 }}>🗑</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search button */}
            {favoritos.length > 0 && (
              <button onClick={buscarPartidos} disabled={buscandoPartidos}
                style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: buscandoPartidos ? "rgba(99,102,241,.2)" : "linear-gradient(135deg, #4338ca, #7c3aed)", color: "#fff", fontSize: 15, fontWeight: 900, cursor: buscandoPartidos ? "not-allowed" : "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: buscandoPartidos ? "none" : "0 4px 20px rgba(67,56,202,.3)" }}>
                {buscandoPartidos
                  ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span> Buscando partidos con IA + web...</>
                  : <>🔍 Buscar partidos de mis favoritos (próximos 3 días)</>}
              </button>
            )}

            {/* Results */}
            {partidosBusqueda && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                    Partidos encontrados · {partidosBusqueda.busquedaFecha}
                  </div>
                  <button onClick={() => { setPartidosBusqueda(null); saveState("partidos_busqueda_v1", null); }}
                    style={{ fontSize: 11, color: "#334155", background: "none", border: "none", cursor: "pointer" }}>✕ Limpiar</button>
                </div>

                {partidosBusqueda.resumen && (
                  <div style={{ background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.12)", borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#a5b4fc" }}>
                    🧠 {partidosBusqueda.resumen}
                  </div>
                )}

                {(!partidosBusqueda.partidos || partidosBusqueda.partidos.length === 0) ? (
                  <div style={{ textAlign: "center", padding: "30px 20px", color: "#334155", fontSize: 13 }}>
                    Sin partidos encontrados en los próximos 3 días para tus favoritos.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {partidosBusqueda.partidos.map((p, i) => (
                      <div key={i} style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14, padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: p.tipo === "seleccion" ? "rgba(251,191,36,.1)" : "rgba(99,102,241,.1)", color: p.tipo === "seleccion" ? "#fbbf24" : "#a5b4fc", fontWeight: 700 }}>
                                {p.tipo === "seleccion" ? "🏳️ Selección" : "⚽ Club"}
                              </span>
                              <span style={{ fontSize: 11, color: "#475569" }}>⭐ {p.equipoFavorito}</span>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 900, color: "#e0e7ff" }}>{p.local} vs {p.visitante}</div>
                            <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>
                              🏆 {p.liga}
                              {p.fecha && <> · 📅 {p.fecha}</>}
                              {p.hora && <> · 🕐 {p.hora}</>}
                            </div>
                          </div>
                          <button onClick={() => cargarPartido(p)}
                            style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #059669, #047857)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 2px 10px rgba(5,150,105,.25)" }}>
                            🔍 Analizar →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {favoritos.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#334155" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
                <div style={{ fontSize: 13, color: "#475569" }}>Agrega tus equipos y selecciones favoritas para buscar sus partidos automáticamente.</div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: JORNADAS (MUNDIAL) ──────────────────────────────────────── */}
        {activeTab === "jornadas" && modoMundial && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#fbbf24", textTransform: "uppercase", marginBottom: 2 }}>Motor Mundial</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>🏆 Jornadas por Selección</h2>
              <p style={{ fontSize: 13, color: "#334155", marginTop: 4 }}>Registra partido a partido. El motor usa esto para analizar qué necesita cada selección, su forma, jugadores clave y formación.</p>
            </div>

            {/* New jornada form */}
            <div style={{ background: "rgba(30,27,75,.35)", border: "1px solid rgba(251,191,36,.15)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24", marginBottom: 14 }}>➕ Registrar Jornada</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                {[
                  { key: "seleccion", label: "Selección", placeholder: "Ej: Argentina" },
                  { key: "jornada", label: "Jornada / Fase", placeholder: "Ej: J1 · Grupos" },
                  { key: "rival", label: "Rival", placeholder: "Ej: Arabia Saudita" },
                  { key: "resultado", label: "Resultado", placeholder: "Ej: Victoria / Empate / Derrota" },
                  { key: "goles", label: "Marcador", placeholder: "Ej: 2-1" },
                  { key: "necesidad", label: "Necesidad en esta fase", placeholder: "Ej: Debe ganar para clasificar" },
                  { key: "formacion", label: "Formación usada", placeholder: "Ej: 4-3-3" },
                  { key: "jugadoresClave", label: "Jugadores clave / bajas", placeholder: "Ej: Messi titular, Di María baja" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={labelStyle}>{f.label}</label>
                    <input value={jornadaDraft[f.key]} onChange={e => setJornadaDraft(j => ({ ...j, [f.key]: e.target.value }))}
                      placeholder={f.placeholder} style={inputStyle} />
                  </div>
                ))}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Notas adicionales</label>
                  <input value={jornadaDraft.notas} onChange={e => setJornadaDraft(j => ({ ...j, notas: e.target.value }))}
                    placeholder="Rendimiento, incidencias, sanciones, etc." style={inputStyle} />
                </div>
              </div>
              <button onClick={saveJornada} style={{ marginTop: 14, width: "100%", padding: 12, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #78350f, #b45309)", color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>
                🏆 Guardar Jornada
              </button>
            </div>

            {/* Jornadas list */}
            {jornadas.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#334155" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 13, color: "#475569" }}>Sin jornadas registradas. Cada jornada que registres alimenta el motor de análisis.</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 10, textTransform: "uppercase" }}>Jornadas registradas ({jornadas.length})</div>
                {/* Group by seleccion */}
                {Object.entries(jornadas.reduce((acc, j) => { (acc[j.seleccion] = acc[j.seleccion] || []).push(j); return acc; }, {})).map(([sel, items]) => (
                  <div key={sel} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      🏳️ {sel} <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>({items.length} jornadas)</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {items.map(j => (
                        <div key={j.id} style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(251,191,36,.08)", borderRadius: 12, padding: "12px 16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                            <div>
                              <span style={{ fontSize: 12, fontWeight: 800, color: "#e0e7ff" }}>{j.jornada}</span>
                              <span style={{ fontSize: 12, color: "#475569" }}> vs {j.rival}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: j.resultado?.toLowerCase().includes("victoria") ? "#34d399" : j.resultado?.toLowerCase().includes("derrota") ? "#f87171" : "#fbbf24", marginLeft: 8 }}>{j.goles}</span>
                            </div>
                            <button onClick={() => { if (confirm("¿Eliminar?")) setJornadas(prev => prev.filter(x => x.id !== j.id)); }} style={{ fontSize: 10, color: "#334155", background: "none", border: "none", cursor: "pointer" }}>🗑</button>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {j.necesidad && <span style={{ fontSize: 10, background: "rgba(139,92,246,.1)", color: "#a78bfa", padding: "2px 8px", borderRadius: 6 }}>⚡ {j.necesidad}</span>}
                            {j.formacion && <span style={{ fontSize: 10, background: "rgba(56,189,248,.08)", color: "#7dd3fc", padding: "2px 8px", borderRadius: 6 }}>⚙️ {j.formacion}</span>}
                            {j.jugadoresClave && <span style={{ fontSize: 10, background: "rgba(52,211,153,.07)", color: "#6ee7b7", padding: "2px 8px", borderRadius: 6 }}>⭐ {j.jugadoresClave}</span>}
                          </div>
                          {j.notas && <div style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>{j.notas}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PESTAÑA APRENDIZAJE IA ─────────────────────────────────────── */}
        {activeTab === "aprendizaje" && modoMundial && (
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "#fbbf24", margin: 0 }}>🧠 Aprendizaje de la IA</h2>
              <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Análisis guardados para revisar tras el partido. La IA aprende de sus aciertos y errores para mejorar futuras calificaciones.</p>
            </div>

            {analisisGuardados.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#475569", fontSize: 13 }}>
                Aún no hay análisis guardados.<br />Analiza un partido y toca "📌 Guardar análisis para revisar".
              </div>
            )}

            {analisisGuardados.map(a => {
              return (
                <div key={a.id} style={{ background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 14, marginBottom: 12, boxSizing: "border-box" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#e0e7ff" }}>{a.partido}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>{a.grupo ? `Grupo ${a.grupo} · ` : ""}{new Date(a.fecha).toLocaleDateString()}</div>
                    </div>
                    <button onClick={() => { if (confirm("¿Eliminar este análisis guardado?")) setAnalisisGuardados(prev => prev.filter(x => x.id !== a.id)); }}
                      style={{ background: "none", border: "none", color: "#64748b", fontSize: 16, cursor: "pointer", padding: 0 }}>×</button>
                  </div>

                  {/* Mejor apuesta / A evitar (guardados del análisis, sin gastar créditos) */}
                  {(a.mejorApuesta?.mercado || a.apuestaEvitar?.mercado) && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                      {a.mejorApuesta?.mercado && (
                        <div style={{ background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.3)", borderRadius: 10, padding: "8px 10px", boxSizing: "border-box" }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "#34d399", marginBottom: 3 }}>✅ MEJOR APUESTA</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#a7f3d0" }}>{a.mejorApuesta.mercado}{a.mejorApuesta.linea ? ` ${a.mejorApuesta.linea}` : ""}</div>
                          {a.mejorApuesta.razon && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{a.mejorApuesta.razon}</div>}
                        </div>
                      )}
                      {a.apuestaEvitar?.mercado && (
                        <div style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 10, padding: "8px 10px", boxSizing: "border-box" }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "#f87171", marginBottom: 3 }}>🚫 A EVITAR</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#fecaca" }}>{a.apuestaEvitar.mercado}</div>
                          {a.apuestaEvitar.razon && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{a.apuestaEvitar.razon}</div>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Trampas del mercado */}
                  {a.trampasMercado?.length > 0 && (
                    <div style={{ background: "rgba(251,146,60,.07)", border: "1px solid rgba(251,146,60,.25)", borderRadius: 10, padding: "8px 10px", marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#fb923c", marginBottom: 4 }}>⚠️ TRAMPAS DEL MERCADO</div>
                      {a.trampasMercado.filter(Boolean).map((t, i) => (
                        <div key={i} style={{ fontSize: 11, color: "#fed7aa", marginBottom: 2 }}>• {t}</div>
                      ))}
                    </div>
                  )}

                  {/* Marcador real (opcional, solo como referencia visual) */}
                  <div style={{ background: "rgba(2,8,23,.5)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 6 }}>Resultado real (referencia):</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                      <span style={{ fontSize: 11, color: "#cbd5e1" }}>{a.local}</span>
                      <input type="number" inputMode="numeric" value={a.resultadoReal?.golesLocal ?? ""} onChange={e => setAnalisisGuardados(prev => prev.map(x => x.id === a.id ? { ...x, resultadoReal: { ...x.resultadoReal, golesLocal: e.target.value } } : x))}
                        style={{ width: 44, padding: "6px", borderRadius: 7, border: "1px solid rgba(255,255,255,.1)", background: "rgba(15,23,42,.8)", color: "#e0e7ff", fontSize: 14, fontWeight: 800, textAlign: "center", outline: "none", boxSizing: "border-box" }} />
                      <span style={{ color: "#475569" }}>—</span>
                      <input type="number" inputMode="numeric" value={a.resultadoReal?.golesVisita ?? ""} onChange={e => setAnalisisGuardados(prev => prev.map(x => x.id === a.id ? { ...x, resultadoReal: { ...x.resultadoReal, golesVisita: e.target.value } } : x))}
                        style={{ width: 44, padding: "6px", borderRadius: 7, border: "1px solid rgba(255,255,255,.1)", background: "rgba(15,23,42,.8)", color: "#e0e7ff", fontSize: 14, fontWeight: 800, textAlign: "center", outline: "none", boxSizing: "border-box" }} />
                      <span style={{ fontSize: 11, color: "#cbd5e1" }}>{a.visitante}</span>
                    </div>
                  </div>

                  {/* Mercados calificados — marca cada uno a mano */}
                  {a.mercadosCalificados?.length > 0 && (() => {
                    const aciertos = a.mercadosCalificados.filter(m => m.marca === "acierto").length;
                    const fallos = a.mercadosCalificados.filter(m => m.marca === "fallo").length;
                    const totalMarc = aciertos + fallos;
                    const pct = totalMarc > 0 ? Math.round((aciertos / totalMarc) * 100) : null;
                    const ciclo = { sin: "acierto", acierto: "fallo", fallo: "neutro", neutro: "sin" };
                    const marcar = (idx) => setAnalisisGuardados(prev => prev.map(x => {
                      if (x.id !== a.id) return x;
                      const mc = x.mercadosCalificados.map((mm, j) => j === idx ? { ...mm, marca: ciclo[mm.marca || "sin"] } : mm);
                      return { ...x, mercadosCalificados: mc };
                    }));
                    return (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 10, color: "#64748b" }}>Toca el ícono para marcar acierto/fallo:</span>
                          {pct !== null && <span style={{ fontSize: 11, fontWeight: 800, color: pct >= 60 ? "#34d399" : pct >= 40 ? "#fbbf24" : "#f87171" }}>{pct}% ({aciertos}/{totalMarc})</span>}
                        </div>
                        {[...a.mercadosCalificados].map((m, i) => {
                          // índice real en el array original (no el ordenado)
                          const realIdx = a.mercadosCalificados.indexOf(m);
                          const icon = m.marca === "acierto" ? "✅" : m.marca === "fallo" ? "❌" : m.marca === "neutro" ? "➖" : "⚪";
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 4, padding: "3px 0" }}>
                              <button onClick={() => marcar(realIdx)} title="Toca para marcar"
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}>
                                {icon}
                              </button>
                              <span style={{ color: "#cbd5e1", flex: 1 }}>{m.mercado}</span>
                              <span style={{ fontWeight: 800, color: toNum(m.nota) >= 7 ? "#34d399" : toNum(m.nota) >= 5 ? "#fbbf24" : "#f87171" }}>{m.nota}/10</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {analisisGuardados.some(a => a.mercadosCalificados?.some(m => m.marca)) && (
              <div style={{ background: "rgba(52,211,153,.06)", border: "1px solid rgba(52,211,153,.2)", borderRadius: 12, padding: 12, marginTop: 8, fontSize: 11, color: "#6ee7b7", textAlign: "center" }}>
                📊 Llevas registro de aciertos en {analisisGuardados.filter(a => a.mercadosCalificados?.some(m => m.marca)).length} análisis. Útil para ver qué mercados te funcionan mejor.
              </div>
            )}
          </div>
        )}

      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        input:focus { border-color: rgba(99,102,241,.5) !important; }
        select:focus { border-color: rgba(99,102,241,.5) !important; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99,102,241,.3); border-radius: 4px; }
      `}</style>
    </div>
  );
}
