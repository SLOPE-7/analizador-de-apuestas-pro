// @ts-nocheck
"use client";
import { useState, useEffect, useCallback, useRef } from "react";

// ── RESPONSIVE HOOK ───────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

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
const SK = "apuestas_ia_pro_v2";
const BK = "bankroll_ia_pro_v2";
const HK = "historial_ia_pro_v2";
const RK = "review_ia_pro_v3";
const JK = "jornadas_mundial_v1"; // NEW: jornada tracking for mundial mode
const FK = "favoritos_ia_pro_v1"; // favoritos: clubes + selecciones

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

// ── SISTEMA MULTIDEPORTE ──────────────────────────────────────────────────────
const SPORTS = {
  futbol: {
    id: "futbol", label: "⚽ Fútbol", emoji: "⚽",
    color: "#4f46e5", colorSoft: "rgba(79,70,229,.15)", border: "rgba(79,70,229,.3)",
    gradient: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    bgGradient: "radial-gradient(ellipse at 20% 20%, rgba(79,70,229,.25) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(124,58,237,.18) 0%, transparent 55%)",
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

function detectSport(match) {
  const text = `${match.local} ${match.visitante} ${match.liga}`.toLowerCase();
  // MLB keywords
  const mlbTeams = ["yankees","red sox","dodgers","cubs","giants","astros","braves","mets","padres","cardinals","phillies","rangers","angels","athletics","mariners","twins","tigers","white sox","royals","guardians","orioles","rays","blue jays","pirates","reds","brewers","rockies","diamondbacks","marlins","nationals"];
  const nbaTeams = ["lakers","celtics","bulls","warriors","heat","nets","knicks","bucks","suns","clippers","nuggets","76ers","raptors","mavericks","jazz","pelicans","grizzlies","rockets","thunder","trail blazers","kings","timberwolves","hornets","pistons","pacers","hawks","magic","wizards","cavaliers","spurs"];
  if (mlbTeams.some(t => text.includes(t)) || text.includes("mlb") || text.includes("béisbol") || text.includes("baseball")) return "mlb";
  if (nbaTeams.some(t => text.includes(t)) || text.includes("nba") || text.includes("basketball") || text.includes("baloncesto")) return "nba";
  return "futbol";
}

function buildMLBPrompt(match, feedbackCtx = "") {
  const { local, visitante, oddLocal, oddVisit, liga } = match;
  return `Eres un analista experto en apuestas de MLB (béisbol). Eres CRÍTICO y CONSERVADOR.${feedbackCtx}

PARTIDO MLB: ${local} vs ${visitante}${liga ? ` (${liga})` : ""}
CUOTAS ML: Local ${oddLocal || "N/D"} | Visitante ${oddVisit || "N/D"}

Busca información reciente y analiza con criterio ESTRICTO:
1. PITCHER ABRIDOR: ERA, WHIP, xERA, últimas 3 salidas (strikeouts, hits permitidos, carreras), rendimiento en casa/visita
2. BULLPEN: ERA últimos 7 días, fatiga acumulada, fiabilidad del cierre
3. BATEO: promedio de bateo reciente, OPS últimas 2 semanas, matchup zurdo/derecho vs el pitcher rival
4. PARQUE Y CLIMA: factor del parque (a favor de pitcher o bateador), viento, temperatura
5. UMPIRE: zona de strikes, tendencia (pro-pitcher = más strikeouts, pro-bateador = más hits)
6. DESCANSO: días de descanso del pitcher, viaje largo reciente, back-to-back
7. PRIMERA ENTRADA: historial del pitcher en el primer inning específicamente
8. PRIMERAS 5 ENTRADAS (F5): rendimiento de ambos abridores en innings 1-5

Genera picks usando EXACTAMENTE estos nombres de mercado (los mismos que usa la casa de apuestas):

MERCADOS DISPONIBLES:
- "Ganador (incl. extra innings)" → quién gana el partido
- "Totales (incl. extra innings)" → total de carreras Over/Under (ej: Over 8.5)
- "Hándicap (incl. extra innings)" → ventaja de carreras (ej: ${local} -1.5)
- "Innings 1 a 5 - Ganador" → quién gana las primeras 5 entradas
- "Innings 1 a 5 - Total" → total carreras en primeras 5 entradas Over/Under
- "Innings 1 a 5 - Hándicap" → ventaja en primeras 5 entradas
- "Primer Inning - Ganador" → quién anota primero en el 1er inning
- "Primer Inning - Total" → si hay carrera o no en el 1er inning (Over/Under 0.5)
- "Pitcher Strikeouts Más/Menos de" → total strikeouts del pitcher abridor (ej: Over 6.5)
- "Lanzador - Outs lanzados Más/Menos" → entradas completadas por el pitcher (ej: Over 17.5 outs)
- "Lanzador - Hits permitidos Más/Menos" → hits que recibe el pitcher
- "Jugador - Home Runs Más/Menos" → si un bateador conecta jonrón o no
- "Jugador - Hits Más/Menos" → hits de un bateador específico
- "Jugador - Carreras Impulsadas Más/Menos" → RBIs de un bateador
- "Jugador - Bases Totales Más/Menos" → bases totales de un bateador
- "Jugador - Strikeouts Más/Menos" → si un bateador poncha o no
- "Par/Impar (incl. extra innings)" → si el total de carreras es par o impar
- "Home Runs Más/Menos de" → total home runs del partido

Responde ÚNICAMENTE con este JSON puro, sin backticks:
{"resumen":"contexto del juego y condiciones clave","pitcherLocal":"pitcher de ${local}: ERA/WHIP/últimas salidas/tendencia strikeouts","pitcherVisitante":"pitcher de ${visitante}: ERA/WHIP/últimas salidas/tendencia strikeouts","condicionesBateo":"matchups zurdo-derecho, parque, viento, umpire","picks":[{"mercado":"nombre EXACTO del mercado como aparece arriba","linea":"línea numérica (ej: 8.5, 6.5, -1.5)","tipo":"over/under/local/visitante","confianza":72,"prioridad":"alta","pesoAnalisis":8,"justificacion":"razón con datos reales: ERA, matchups, bullpen, parque, umpire","jugador":"nombre del jugador si es prop de jugador, sino vacío","cuotaSugerida":"1.85"}],"pronostico":"resultado más probable con razonamiento","alertas":["alerta concreta"],"perfilPartido":"abierto"}

REGLAS ESTRICTAS MLB:
- Máximo 3 picks de alta calidad.
- Confianza mínima: 70%. pesoAnalisis mínimo: 7. Si no cumple ambos, NO lo incluyas.
- Prioriza: Innings 1-5 Ganador, Hándicap cuando hay diferencia clara de calidad, Totales Over cuando hay pitcher débil rival.
- ⭐ "Innings 1 a 5 - Ganador" es el mercado más predecible en MLB — priorízalo cuando el pitcher dominante es claro.
- ⚠️ Confianza 85%+: solo si tienes 3+ factores sólidos (ERA, matchup, parque, bullpen). Si no, baja a 75% máximo.
- Si el pitcher tiene ERA > 4.5 en sus últimas 3 salidas, NO recomiendes Under de carreras.
- Si hay viento a favor del bateador (>15 mph hacia el outfield), considera Over en totales.
- Para props de jugadores, solo sugiere si hay matchup claramente favorable zurdo vs derecho.

⚠️ REGLA CRÍTICA — FAVORITO CLARO MLB (diferencia récord +12 juegos o más):
Cuando hay diferencia clara entre equipos (ej: 34-20 vs 20-35):
- El equipo débil tiene pitcher malo que recibirá muchas carreras del equipo fuerte.
- Over total del partido es casi siempre correcto en estos casos.
- NO sugieras Under total si el equipo fuerte tiene cuota ML menor a 1.55.
- El equipo fuerte anotará 6+ carreras sobre el pitcher débil — eso solo ya supera casi cualquier línea Under.

⚠️ REGLA CRÍTICA — FAVORITO CLARO NBA (spread de 8+ puntos):
Cuando hay diferencia clara entre equipos (spread de 8 puntos o más):
- El equipo favorito jugará rápido, atacará con confianza y anotará muchos puntos.
- El equipo débil intentará el contragolpe pero concederá mucho.
- Prioriza Over total del partido — ambos equipos anotarán más de lo normal.
- El equipo favorito cubrirá el spread en casa la mayoría de las veces.
- No sugieras Under total cuando hay favorito claro — los partidos desequilibrados tienden a tener más puntos, no menos.

⚠️ REGLA CRÍTICA — ERA ALTO DEL PITCHER RIVAL:
Si el pitcher del equipo débil tiene ERA > 5.00 en sus últimas 3 salidas o ERA de temporada > 5.50:
- NO sugieras Under del total del partido completo. El equipo fuerte anotará muchas carreras sobre ese pitcher.
- El Under solo aplica para F5/Innings 1-5 si el pitcher del equipo fuerte es dominante con ERA < 3.00.
- En este caso prioriza: Over total del partido, Hándicap -1.5 del equipo fuerte, Innings 1-5 Over o Ganador.
- Lógica: pitcher malo = muchas carreras concedidas = total alto aunque el pitcher rival sea bueno.

⚠️ REGLA CRÍTICA — CONTRADICCIÓN PITCHER DOMINANTE + TOTAL:
Si recomiendas Ganador claro o Hándicap del equipo fuerte con alta confianza (>75%), es CONTRADICTORIO recomendar Under del total — el equipo fuerte va a anotar muchas carreras. En ese caso: Over total o no incluir el mercado de totales.
- Solo el JSON.`;
}

function buildNBAPrompt(match, feedbackCtx = "") {
  const { local, visitante, oddLocal, oddVisit, liga } = match;
  return `Eres un analista experto en apuestas de NBA (baloncesto). Eres CRÍTICO y CONSERVADOR.${feedbackCtx}

PARTIDO NBA: ${local} vs ${visitante}${liga ? ` (${liga})` : ""}
CUOTAS ML: Local ${oddLocal || "N/D"} | Visitante ${oddVisit || "N/D"}

Busca información reciente y analiza con criterio ESTRICTO:
1. PACE Y TOTALES: ritmo de juego, puntos promedio últimos 10 juegos de ambos equipos, OffRtg y DefRtg
2. LESIONES: jugadores fuera o en duda — es lo más crítico para los props de jugador
3. BACK-TO-BACK: ¿algún equipo juega segundo partido consecutivo? Baja el ritmo y los totales
4. MATCHUPS: quién guarda a quién, déficit defensivo perimetral o interior
5. ÁRBITRO: si está disponible, tendencia de llamadas (más faltas = más tiros libres = más puntos)
6. ROTACIONES: ¿equipo clasificado o eliminado que puede rotar estrellas?
7. PRIMER CUARTO: historial de arranques de ambos equipos
8. PROPS JUGADOR: basado en lesiones del rival, matchup favorable, minutos proyectados

Para cada pick, calcula un PESO DE ANÁLISIS del 1 al 10.

Genera picks usando EXACTAMENTE estos nombres de mercado (como aparecen en la casa de apuestas):

MERCADOS DISPONIBLES:
— RESULTADO —
- "Ganador (incl. prórroga)" → quién gana el partido
- "Hándicap (incl. prórroga)" → ventaja/desventaja de puntos (ej: ${local} -5.5)
- "Totales (incl. prórroga)" → Over/Under puntos totales del partido (ej: Over 224.5)
- "1ª Mitad - total" → Over/Under puntos en el 1er tiempo
- "1ª Mitad - Hándicap" → hándicap en el primer tiempo
- "1ª Mitad - 1x2" → quién va ganando al descanso
- "Primer cuarto - Totales" → Over/Under puntos en el 1er cuarto
- "Primer cuarto - hándicap" → hándicap en el primer cuarto
- "Primer cuarto - 1x2" → quién va ganando al final del 1er cuarto
- "Primer cuarto - margen de victoria" → por cuántos va ganando en el 1er cuarto
- "Mitad/final" → combinado resultado mitad y resultado final
- "Impar/par (incl. prórroga)" → si el total de puntos es par o impar
- "Habrá prórroga" → si el partido va a prórroga
- "Carrera a 20 puntos (incl. prórroga)" → quién llega primero a 20 pts
- "Carrera a 30 puntos (incl. prórroga)" → quién llega primero a 30 pts

— TOTALES POR EQUIPO —
- "1 Totales (incl. prórroga)" → puntos del equipo local Over/Under
- "2 Totales (incl. prórroga)" → puntos del equipo visitante Over/Under
- "Tiros de tres puntos anotados por el equipo - 1 (incl. prórroga)" → triples del local
- "Tiros de tres puntos anotados por el equipo - 2 (incl. prórroga)" → triples del visitante
- "Total de Tiros de tres puntos anotados en el partido (incl. prórroga)" → triples totales

— PROPS DE JUGADOR —
- "Puntos Más de/Menos de (incl. prórroga)" → puntos de un jugador específico
- "Rebotes Más de/Menos de (incl. prórroga)" → rebotes de un jugador
- "Asistencias Más de/Menos de (incl. prórroga)" → asistencias de un jugador
- "3 Pts anotados Más de/Menos de (incl. prórroga)" → triples de un jugador
- "Pts-Reb (incl. prórroga)" → puntos+rebotes combinados de un jugador
- "Pts-Asist. (incl. prórroga)" → puntos+asistencias combinados
- "Pts-reb-ast (incl. OT)" → puntos+rebotes+asistencias (PRA) de un jugador
- "Reb-Ast. (incl. prórroga)" → rebotes+asistencias de un jugador
- "Hacer un doble-doble (incl. prórroga)" → si un jugador logra doble-doble
- "Tiros Libres Anotados Más de/Menos de (incl. prórroga)" → tiros libres de jugador

— TOTALES DEL PARTIDO —
- "Total de asistencias (incl. prórroga)" → asistencias totales del partido
- "Total de robos en el partido (incl. prórroga)" → robos totales
- "Total de bloqueos en el partido (incl. prórroga)" → bloqueos totales

Responde ÚNICAMENTE con este JSON puro, sin backticks:
{"resumen":"contexto del partido y condiciones clave","paceTendencia":"análisis de ritmo, puntos promedio y total esperado","lesionesImpacto":"lesiones clave y cómo afectan picks y props","picks":[{"mercado":"nombre EXACTO del mercado como aparece arriba","linea":"línea numérica o selección (ej: Over 224.5, Local, 5.5)","tipo":"over/under/local/visitante","confianza":72,"prioridad":"alta","pesoAnalisis":8,"justificacion":"razón con datos reales: pace, lesiones, matchup, back-to-back, árbitro","jugador":"nombre completo del jugador si es prop, sino vacío","cuotaSugerida":"1.85"}],"pronostico":"resultado más probable con spread recomendado","alertas":["alerta concreta"],"perfilPartido":"abierto"}

REGLAS ESTRICTAS NBA:
- Máximo 5 picks de alta calidad.
- Confianza mínima: 67%. pesoAnalisis mínimo: 6.
- Si hay back-to-back, baja el total esperado y reduce confianza en props de minutos altos.
- Para props de jugador, solo sugiere si hay matchup claramente favorable o lesión del rival que libere minutos.
- Prioriza: Totales del partido, 1er cuarto totales, props con lesiones confirmadas del rival.
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

// ── DASHBOARD VISUAL ─────────────────────────────────────────────────────────
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
function MiniBarChart({ data, height = 80, color = "#6366f1" }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => Math.abs(d.val)), 1);
  const w = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      {data.map((d, i) => {
        const barH = (Math.abs(d.val) / max) * (height * 0.85);
        const isPos = d.val >= 0;
        const barColor = isPos ? "#34d399" : "#f87171";
        const y = isPos ? height - barH : height / 2;
        return (
          <g key={i}>
            <rect x={i * w + 0.5} y={y} width={w - 1} height={barH}
              fill={barColor} opacity={0.8} rx={1} />
          </g>
        );
      })}
      <line x1={0} y1={height / 2} x2={100} y2={height / 2} stroke="rgba(255,255,255,.1)" strokeWidth={0.5} />
    </svg>
  );
}

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

// ── FAVORITOS: PROMPT DE BÚSQUEDA DE PARTIDOS ────────────────────────────────
function buildPartidosPrompt(favoritos) {
  const clubes = favoritos.filter(f => f.tipo === "club").map(f => `${f.nombre} (${f.ligas?.join(", ") || "todas sus competencias"})`);
  const selecciones = favoritos.filter(f => f.tipo === "seleccion").map(f => f.nombre);
  const hoy = new Date().toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return `Eres un asistente de apuestas deportivas. Busca en la web los partidos de fútbol de los próximos 3 días (hoy es ${hoy}) para los equipos y selecciones indicados. Considera TODAS sus competencias activas (liga local, copas, Champions, eliminatorias, etc.).

EQUIPOS A BUSCAR:
${clubes.length ? `Clubes:\n${clubes.map(c => `- ${c}`).join("\n")}` : ""}
${selecciones.length ? `Selecciones nacionales:\n${selecciones.map(s => `- ${s}`).join("\n")}` : ""}

Para cada partido encontrado, incluye: equipos, competencia exacta, fecha, hora aproximada (si la encuentras). Si un equipo no tiene partido en los próximos 3 días, no lo incluyas.

Responde ÚNICAMENTE con este JSON puro, sin backticks, sin texto extra:
{"partidos":[{"local":"nombre equipo local","visitante":"nombre equipo visitante","liga":"nombre competencia exacta","fecha":"YYYY-MM-DD","hora":"HH:MM o vacío","tipo":"club o seleccion","equipoFavorito":"nombre del equipo favorito que aparece en este partido"}],"busquedaFecha":"${hoy}","resumen":"cuántos partidos encontraste y de qué equipos"}`;
}

// ── AI PROMPT BUILDER ────────────────────────────────────────────────────────
function buildAIPrompt(match, mode = "full", feedbackCtx = "", jornadaCtx = "") {
  const { local, visitante, oddLocal, oddDraw, oddVisit, liga } = match;
  if (mode === "mlb") return buildMLBPrompt(match, feedbackCtx);
  if (mode === "nba") return buildNBAPrompt(match, feedbackCtx);

  if (mode === "mundial") {
    return `Eres un analista experto en apuestas deportivas de fútbol internacional y mundiales. Eres CRÍTICO y CONSERVADOR. Cada pick debe ganar su lugar con datos reales.${feedbackCtx}${jornadaCtx}

PARTIDO SELECCIONES: ${local} vs ${visitante}${liga ? ` (${liga})` : ""}
CUOTAS 1X2: Local ${oddLocal || "N/D"} | Empate ${oddDraw || "N/D"} | Visitante ${oddVisit || "N/D"}
CONTEXTO: Partido de selecciones nacionales / Mundial / Eliminatorias

Busca información reciente sobre estas selecciones. Analiza con criterio ESTRICTO:
- Qué NECESITA cada selección en esta fase (clasificar, pasar primero, arriesgar o cuidar)
- Condición física real: lesionados, sancionados, minutos acumulados en el torneo
- Formación táctica confirmada o probable — las selecciones no cambian mucho
- Jugadores clave y su estado real (titular seguro, duda, descansado)
- Historial directo entre estas selecciones en torneos similares
- Los partidos de selecciones tienden a ser más cerrados — pesa fuertemente los unders
- Presión psicológica: ¿quién tiene más que perder?
- Diferencia de nivel FIFA ranking y calidad de plantilla

Para cada pick, calcula un PESO DE ANÁLISIS del 1 al 10 según cuántos factores sólidos lo respaldan.

Responde ÚNICAMENTE con este JSON puro, sin texto antes ni después, sin backticks:

{"resumen":"contexto y fase del torneo","condicionPartido":"descripción de qué necesita cada selección y cómo afecta el juego","formaLocal":"forma reciente de ${local} con datos de lesiones y disponibilidad","formaVisitante":"forma reciente de ${visitante} con datos de lesiones y disponibilidad","historialDirecto":"últimos 3-5 enfrentamientos entre ambas","formacionesClaves":"formaciones probables de ambas y jugadores clave titulares","picks":[{"mercado":"nombre exacto","linea":"línea numérica","tipo":"over o under","confianza":72,"prioridad":"alta","pesoAnalisis":7,"justificacion":"razón con datos específicos: lesionados, necesidad, forma, historial","condicionPartido":"cómo la necesidad de cada selección afecta este pick","cuotaSugerida":"1.75"}],"pronostico":"resultado más probable","alertas":["alerta concreta"],"perfilPartido":"cerrado","clavesTacticas":"análisis táctico basado en formaciones y jugadores clave"}

REGLAS ESTRICTAS:
- Máximo 3 picks de alta calidad. Las selecciones son impredecibles — menos es más.
- Prioriza unders y mercados de resultado — las selecciones juegan más defensivas en torneos
- Confianza mínima: 70%. pesoAnalisis mínimo: 7. Si no cumple ambos, NO lo incluyas.
- ⭐ PRIORIZA "Total de goles" Over/Under y "1x2" — son los más predecibles en selecciones.
- ❌ NUNCA sugieras "Marcador exacto" — probabilidad real menor al 10%.
- ⚠️ Confianza 85%+: solo si tienes 3+ factores sólidos independientes. Si no, baja a 75% máximo.
- Cada pick debe tener condicionPartido explicando cómo la situación del torneo lo afecta
- Si un pick tiene track record malo en el historial del usuario, baja su confianza o elimínalo

⚠️ REGLA CRÍTICA — FAVORITO CLARO EN SELECCIONES:
Cuando hay diferencia clara de nivel entre selecciones (cuota local 1.50 o menos, o diferencia de ranking FIFA >30 posiciones):
- El partido es ABIERTO — la selección favorita ataca con confianza y la rival intenta el contragolpe.
- No sugieras Under de goles ni "Ambos no marcan" basándote solo en que el favorito es fuerte.
- Prioriza Over goles y Over corners cuando hay favoritismo claro.
- En fase de grupos, los equipos grandes atacan más porque necesitan diferencia de goles.

⚠️ REGLA CRÍTICA — FINALES Y SEMIFINALES DE TORNEO:
Si es Final, Semifinal, o partido de eliminación directa en un Mundial/Eurocopa/Copa América/Champions:
- BAJA la confianza en Over de goles un 20%. Las finales de selecciones promedian 1.4 goles.
- BAJA la confianza en Over de corners un 20%. Más control, menos transiciones.
- Confianza MÁXIMA para Over goles en una final/semifinal: 60%.
- En eliminatorias directas los equipos juegan para no perder, no para ganar. Prioriza: 1x2, Under, empate en la primera mitad, resultado al descanso.
- Solo el JSON.`;
  }

  if (mode === "full") {
    return `Eres un analista experto en apuestas deportivas de fútbol. Eres CRÍTICO y CONSERVADOR — no generas picks por generar. Cada pick debe ganarse su lugar con datos reales.${feedbackCtx}

PARTIDO: ${local} vs ${visitante}${liga ? ` (${liga})` : ""}
CUOTAS 1X2: Local ${oddLocal || "N/D"} | Empate ${oddDraw || "N/D"} | Visitante ${oddVisit || "N/D"}

Busca información reciente. Analiza con criterio ESTRICTO y profundo:
1. CONDICIÓN DEL PARTIDO: ¿Qué necesita cada equipo? (título, descenso, Europa, sin presión)
2. LESIONES Y BAJAS: ¿Quién no está? ¿Afecta ataque o defensa?
3. FORMA REAL: Últimos 5 partidos con goles, corners y tarjetas reales
4. CONTEXTO LOCAL vs VISITANTE: rendimiento específico en casa o fuera
5. ENFRENTAMIENTOS DIRECTOS: últimos h2h relevantes
6. FATIGA / ROTACIÓN: ¿Vienen de Europa? ¿Próximo partido importante?
7. CORNERS: promedio de corners por partido de ambos equipos
8. TARJETAS: historial de tarjetas, árbitro designado si está disponible

Para cada pick, calcula un PESO DE ANÁLISIS del 1 al 10.

Genera picks usando EXACTAMENTE estos nombres de mercado (como aparecen en la casa de apuestas):

MERCADOS DISPONIBLES:
— RESULTADO —
- "1x2" → resultado final (1=local, X=empate, 2=visitante)
- "Doble oportunidad" → 1X, X2 o 12
- "Ambos equipos marcan" → Sí o No
- "Hándicap" → ventaja/desventaja de goles (ej: ${local} -1)
- "Margen de victoria" → por cuántos goles gana
- "1ª mitad - 1x2" → resultado al descanso
- "1ª mitad / doble oportunidad" → doble oportunidad en 1er tiempo
- "Ambos equipos marcan 1ª mitad" → BTTS en el primer tiempo
- "Par/Impar" → si el total de goles es par o impar

— GOLES —
- "Total de goles" → Over/Under total del partido (ej: Over 2.5) ⭐ MERCADO PRIORITARIO
- "1ª mitad - total" → Over/Under goles en 1er tiempo (ej: Over 1.5)
- "2ª mitad - total" → Over/Under goles en 2do tiempo
- "Marcador exacto" → resultado exacto del partido ⛔ NO SUGERIR — muy difícil, baja probabilidad real
- "Total de goles exacto" → número exacto de goles (ej: 2 goles)
- "Ambos equipos marcan 2 goles o más" → ambos anotan 2+
- "1 gano ambas mitades" → el local gana los dos tiempos
- "1 marco en ambos tiempos" → el local marca en los dos tiempos

— CORNERS (Tiros de esquina) —
- "Total tiros de esquina" → Over/Under corners totales (ej: Over 9.5)
- "1ª mitad - total tiros de esquina" → corners en 1er tiempo
- "Total tiros de esquina Par/Impar" → par o impar total corners
- "Carrera a 5 tiros de esquina" → quién llega primero a 5 corners
- "Carrera a 7 tiros de esquina" → quién llega primero a 7 corners
- "1 tiros de esquina" → corners solo del equipo local
- "2 tiros de esquina" → corners solo del equipo visitante

— TARJETAS —
- "Total de tarjetas" → Over/Under tarjetas totales (ej: Over 3.5)
- "1ª mitad - total tarjetas" → tarjetas en primer tiempo
- "Tarjetas exactas" → número exacto de tarjetas
- "Jugador recibe una tarjeta" → pick sobre jugador específico

— JUGADORES —
- "Primer gol" → quién marca el primer gol
- "Último gol" → quién marca el último gol
- "Goleador en cualquier momento" → jugador que marca en cualquier momento
- "Primer goleador y marcador exacto" → combinado goleador + resultado

— ESPECIALES —
- "Portería a cero" → equipo que no recibe gol
- "Penalti en el encuentro" → si habrá penalti o no
- "1er tiempo - ambos equipos marcan" → BTTS primer tiempo
- "Impacto o más de 2.5" → goles especiales

Responde ÚNICAMENTE con este JSON puro, sin texto antes ni después, sin backticks:

{"resumen":"contexto preciso del partido","condicionPartido":"qué necesita cada equipo y cómo define el estilo de juego","formaLocal":"forma real de ${local} últimos 5 partidos con goles/corners/tarjetas","formaVisitante":"forma real de ${visitante} últimos 5 partidos con goles/corners/tarjetas","picks":[{"mercado":"nombre EXACTO del mercado como aparece arriba","linea":"línea o selección (ej: Over 2.5, Sí, Local, 1X)","tipo":"over/under/si/no/local/visitante/empate","confianza":72,"prioridad":"alta","pesoAnalisis":8,"justificacion":"razón específica con datos: goles promedio, lesionados, forma, h2h, corners","condicionPartido":"cómo la situación del partido afecta este pick","cuotaSugerida":"1.75","exigenciaEquipo":"qué exige el partido a cada equipo"}],"pronostico":"resultado más probable con razonamiento","alertas":["alerta concreta"],"perfilPartido":"abierto"}

REGLAS ESTRICTAS:
- Máximo 3 picks. Calidad sobre cantidad — 3 picks sólidos ganan más que 5 mediocres.
- Equilibra mercados: no solo goles — incluye corners o tarjetas si los datos lo justifican.
- Confianza mínima: 70%. pesoAnalisis mínimo: 7. Si no cumple ambos, NO lo incluyas.
- condicionPartido es OBLIGATORIO para cada pick.
- Un under bien fundamentado vale más que tres overs dudosos.
- ⭐ PRIORIZA "Total de goles" Over/Under — es el mercado más predecible y con mejor track record histórico.
- ❌ NUNCA sugieras "Marcador exacto" — tiene menos del 10% de probabilidad real y distorsiona el análisis.
- ⚠️ Los picks con confianza 85%+ deben tener al menos 3 factores sólidos independientes. Si no los tienes, baja la confianza a 75% máximo.

⚠️ REGLA CRÍTICA — FAVORITO CLARO (local @1.50 o menos):
Cuando la cuota del local es 1.50 o menor, o hay diferencia grande entre equipos:
- El partido es ABIERTO por defecto — el favorito ataca desde el inicio con confianza.
- NUNCA sugieras "Ambos no marcan" solo porque el favorito es fuerte — el visitante intentará el contragolpe.
- Prioriza Over goles sobre Under en estos partidos.
- En Copa Libertadores y Copa Sudamericana con equipo brasileño de local (Palmeiras, Flamengo, Fluminense, Botafogo, Atlético Mineiro): el perfil es MUY ABIERTO — estos equipos promedian 2.5+ goles en casa. Over goles y Over corners son los mercados correctos.
- "Ambos no marcan" solo si el visitante tiene datos reales de ataque muy débil (menos de 0.8 goles por partido fuera).

⚠️ REGLA CRÍTICA — FINALES Y ELIMINATORIAS:
Si el partido es una FINAL (Copa del Rey, FA Cup, Conference League, Europa League, Champions, cualquier final de torneo) o partido decisivo de eliminatoria:
- BAJA automáticamente la confianza en Over de goles un 20%. Las finales promedian 1.6 goles vs 2.7 en liga.
- BAJA automáticamente la confianza en Over de corners un 20%. Las finales tienen más control y menos transiciones.
- Confianza MÁXIMA para Over goles en una final: 62% aunque el historial ofensivo diga lo contrario.
- Los equipos en finales priorizan NO perder sobre atacar. La presión táctica cierra espacios.
- En finales prioriza: 1x2, resultado al descanso, Under goles, Ambos marcan NO, hándicap.
- Solo el JSON.`;
  }

  return `Analista de value betting. Evalúa si hay value en estos picks.

PARTIDO: ${local} vs ${visitante}
PICKS: ${JSON.stringify(match.picks || [])}

Responde SOLO con este JSON sin texto extra:
{"evaluaciones":[{"id":"id_del_pick","tieneValue":true,"edge":5.2,"recomendacion":"✅ Tiene value","alerta":""}],"mejorPick":"id","advertencia":""}`;
}

// ── TIMING DEL ANÁLISIS ──────────────────────────────────────────────────────
function getTimingStatus(matchDateTime, sport) {
  if (!matchDateTime) return null;
  const now = new Date();
  const match = new Date(matchDateTime);
  const diffMs = match - now;
  const diffHours = diffMs / 1000 / 3600;

  // Partido ya comenzó o terminó
  if (diffHours < -2) return { status: "finished", color: "#475569", icon: "⚫", title: "Partido ya terminó", msg: "Este partido ya finalizó.", canAnalyze: false, canOverride: false };
  if (diffHours < 0) return { status: "live", color: "#fbbf24", icon: "🔴", title: "Partido en curso", msg: "El partido ya comenzó — análisis pre-partido no aplica.", canAnalyze: false, canOverride: false };

  // Rangos ideales por deporte
  const ranges = {
    futbol: { ideal: [2, 6], early: [6, 24], tooEarly: 24 },
    mlb:    { ideal: [3, 6], early: [6, 12], tooEarly: 12 },
    nba:    { ideal: [1, 4], early: [4, 8],  tooEarly: 8  },
  };
  const r = ranges[sport] || ranges.futbol;
  const tips = {
    futbol: "Las alineaciones y noticias de última hora salen 2-3h antes.",
    mlb:    "El pitcher abridor se confirma 2-3h antes. Sin eso, el análisis es incompleto.",
    nba:    "El injury report oficial sale 1h antes. Las lesiones son clave en NBA.",
  };

  if (diffHours <= r.ideal[1] && diffHours >= r.ideal[0]) {
    return { status: "ideal", color: "#34d399", icon: "🟢", title: "Momento ideal para analizar", msg: `Faltan ${diffHours.toFixed(1)}h — ${tips[sport]}`, canAnalyze: true, canOverride: false, hoursLeft: diffHours };
  }
  if (diffHours < r.ideal[0]) {
    return { status: "close", color: "#fbbf24", icon: "🟡", title: "Muy cerca del partido", msg: `Faltan ${(diffHours * 60).toFixed(0)} minutos. Verifica las alineaciones antes de apostar.`, canAnalyze: true, canOverride: false, hoursLeft: diffHours };
  }
  if (diffHours <= r.early[1]) {
    return { status: "early", color: "#fb923c", icon: "🟠", title: "Un poco pronto", msg: `Faltan ${diffHours.toFixed(1)}h. ${tips[sport]} Puedes analizar pero vuelve a verificar más cerca.`, canAnalyze: false, canOverride: true, hoursLeft: diffHours };
  }
  return { status: "tooEarly", color: "#f87171", icon: "🔴", title: "Demasiado pronto", msg: `Faltan ${diffHours.toFixed(0)}h. Los datos clave aún no están confirmados. Espera.`, canAnalyze: false, canOverride: true, hoursLeft: diffHours };
}
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
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  const bg = type === "success" ? "rgba(5,150,105,.97)" : type === "error" ? "rgba(220,38,38,.97)" : "rgba(99,102,241,.97)";
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: bg, color: "#fff", borderRadius: 16, padding: "14px 20px", fontWeight: 800, fontSize: 14, boxShadow: "0 8px 40px rgba(0,0,0,.5)", display: "flex", alignItems: "center", gap: 10, animation: "slideIn .25s ease" }}>
      {type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️"} {msg}
      <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.7)", cursor: "pointer", fontSize: 18, marginLeft: 4 }}>×</button>
    </div>
  );
}

// ── PESO BADGE ────────────────────────────────────────────────────────────────
function PesoBadge({ peso }) {
  if (!peso) return null;
  const color = peso >= 8 ? "#34d399" : peso >= 6 ? "#fbbf24" : "#f87171";
  const bg = peso >= 8 ? "rgba(52,211,153,.12)" : peso >= 6 ? "rgba(245,158,11,.12)" : "rgba(239,68,68,.12)";
  const label = peso >= 8 ? "Análisis sólido" : peso >= 6 ? "Análisis moderado" : "Análisis débil";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, background: bg, border: `1px solid ${color}30`, borderRadius: 8, padding: "3px 8px" }}>
      <div style={{ display: "flex", gap: 2 }}>
        {[1,2,3,4,5,6,7,8,9,10].map(i => (
          <div key={i} style={{ width: 4, height: 12, borderRadius: 2, background: i <= peso ? color : "rgba(255,255,255,.1)" }} />
        ))}
      </div>
      <span style={{ fontSize: 10, fontWeight: 800, color, marginLeft: 4 }}>{peso}/10 · {label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const isMobile = useIsMobile();
  // ── STATE ──────────────────────────────────────────────────────────────
  const [match, setMatch] = useState(emptyMatch);
  const [activeSport, setActiveSport] = useState("futbol"); // "futbol" | "mlb" | "nba"
  const sport = SPORTS[activeSport];
  const aiStatus_ref = useRef("idle");
  const [aiStatus, setAiStatus] = useState("idle");
  const [aiResult, setAiResult] = useState(null);
  const [picks, setPicks] = useState([]);
  const [marketFilter, setMarketFilter] = useState("Todos");
  const [ticketStake, setTicketStake] = useState("10");
  const [esParlay, setEsParlay] = useState(true);
  const [bankroll, setBankroll] = useState(() => loadState(BK, emptyBankroll()));
  const [betDraft, setBetDraft] = useState(emptyBet);
  const [historial, setHistorial] = useState(() => loadState(HK, []));
  const [reviews, setReviews] = useState(() => loadState(RK, []));
  const [jornadas, setJornadas] = useState(() => loadState(JK, [])); // NEW
  const [favoritos, setFavoritos] = useState(() => loadState(FK, []));
  const [partidosBusqueda, setPartidosBusqueda] = useState(() => {
    const saved = loadState("partidos_busqueda_v1", null);
    if (!saved) return null;
    // Expire after 24h
    const savedAt = new Date(saved.savedAt || 0);
    const diff = (Date.now() - savedAt.getTime()) / 1000 / 3600;
    return diff < 24 ? saved : null;
  });
  const [buscandoPartidos, setBuscandoPartidos] = useState(false);
  const [favDraft, setFavDraft] = useState({ nombre: "", tipo: "club", ligas: "" });
  const [activeTab, setActiveTab] = useState("analisis");
  const [showBankHistory, setShowBankHistory] = useState(false);
  const [verifyingValue, setVerifyingValue] = useState(false);
  const [validatingTicket, setValidatingTicket] = useState(false);
  const [ticketValidation, setTicketValidation] = useState(null);
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [expertMode, setExpertMode] = useState(false);
  const [dailyLossLimit, setDailyLossLimit] = useState(() => loadState("daily_loss_limit_v1", "20"));
  const [aiError, setAiError] = useState("");
  const [toast, setToast] = useState(null);
  const [modoMundial, setModoMundial] = useState(false);
  const [reviewDraft, setReviewDraft] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showJornadaForm, setShowJornadaForm] = useState(false);
  const [jornadaDraft, setJornadaDraft] = useState(emptyJornada);
  const [userNote, setUserNote] = useState(""); // nota del usuario antes de analizar
  const [matchDateTime, setMatchDateTime] = useState("");
  const [timingOverride, setTimingOverride] = useState(false);
  const [showLineAnalyzer, setShowLineAnalyzer] = useState(false);
  const [lineInputs, setLineInputs] = useState({}); // { "goles": {overLine, overOdd, underLine, underOdd}, ... }
  const [lineAnalysis, setLineAnalysis] = useState(null);
  const [analyzingLines, setAnalyzingLines] = useState(false);
  const resultsRef = useRef(null);

  useEffect(() => { saveState(BK, bankroll); }, [bankroll]);
  useEffect(() => { saveState(HK, historial); }, [historial]);
  useEffect(() => { saveState(RK, reviews); }, [reviews]);
  useEffect(() => { saveState(JK, jornadas); }, [jornadas]);
  useEffect(() => { saveState(FK, favoritos); }, [favoritos]);
  useEffect(() => { saveState("daily_loss_limit_v1", dailyLossLimit); }, [dailyLossLimit]);

  const dashboard = calcDashboard(bankroll, reviews);

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
      const promptMode = activeSport === "mlb" ? "mlb" : activeSport === "nba" ? "nba" : modoMundial ? "mundial" : "full";
      const feedbackCtx = buildFeedbackContext(reviews);
      const jornadaCtx = modoMundial && activeSport === "futbol" ? buildJornadaContext(jornadas, match.local, match.visitante) : "";
      const notaCtx = userNote.trim() ? `\n\n📝 NOTA DEL ANALISTA: ${userNote.trim()}` : "";
      const prompt = buildAIPrompt(match, promptMode, feedbackCtx + notaCtx, jornadaCtx);

      const resp = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 4000,
          useWebSearch: true,
          messages: [{ role: "user", content: prompt }],
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
        let jsonStr = end > -1 ? cleaned.slice(start, end + 1) : cleaned.slice(start);
        if (end === -1) {
          // JSON truncado — intentar cerrar arrays y objetos abiertos
          jsonStr = jsonStr.replace(/,?\s*\{[^{}]*$/, "").replace(/,?\s*"[^"]*$/, "");
          const ob = (jsonStr.match(/\{/g)||[]).length - (jsonStr.match(/\}/g)||[]).length;
          const ab = (jsonStr.match(/\[/g)||[]).length - (jsonStr.match(/\]/g)||[]).length;
          for (let i=0;i<ab;i++) jsonStr+="]";
          for (let i=0;i<ob;i++) jsonStr+="}";
        }
        parsed = JSON.parse(jsonStr);
      } catch (_e) {
        throw new Error("La IA no devolvió JSON válido. Intenta de nuevo.");
      }

      setAiResult(parsed);
      const newPicks = (parsed.picks || []).map(p => {
        const conf = clamp(Number(p.confianza) || 50, 0, 100);
        return {
          ...emptyPick(), id: makeId(),
          mercado: p.mercado || "", linea: p.linea || "", tipo: p.tipo || "over",
          confianza: conf, prioridad: p.prioridad || "media",
          justificacion: p.justificacion || "", cuotaSugerida: p.cuotaSugerida || "",
          pesoAnalisis: Number(p.pesoAnalisis) || 0,
          condicionPartido: p.condicionPartido || "",
          exigenciaEquipo: p.exigenciaEquipo || "",
          timestamp: new Date().toISOString(),
        };
      });
      setPicks(newPicks);
      setAiStatus("done");
      setTicketValidation(null);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    } catch (err) {
      setAiStatus("error");
      setAiError(String(err.message || "Error desconocido"));
    }
  }, [match, modoMundial, reviews, jornadas, userNote, activeSport]);

  // ── VERIFY VALUE ────────────────────────────────────────────────────────
  const analyzeLines = async () => {
    const markets = detectTotalMarkets(picks);
    const filledMarkets = markets.filter(m => {
      const inp = lineInputs[m.key] || {};
      return inp.overLine && inp.overOdd && inp.underLine && inp.underOdd;
    });
    if (!filledMarkets.length) return;

    setAnalyzingLines(true);
    setLineAnalysis(null);
    try {
      const marketContext = filledMarkets.map(m => {
        const inp = lineInputs[m.key];
        return `${m.label}: Over ${inp.overLine} a cuota ${inp.overOdd} | Under ${inp.underLine} a cuota ${inp.underOdd}`;
      }).join("\n");

      const picksContext = picks.map(p =>
        `${p.mercado} (${p.tipo?.toUpperCase()}) — Confianza IA: ${p.confianza}% — Justificación: ${p.justificacion || ""}`
      ).join("\n");

      const prompt = `Eres un experto en detección de value betting y líneas infladas por casas de apuestas.

PARTIDO: ${match.local} vs ${match.visitante}
ANÁLISIS IA PREVIO:
${picksContext}

LÍNEAS REALES DE LA CASA DE APUESTAS:
${marketContext}

TAREA: Analiza si la casa de apuestas está inflando las líneas para ganar más. Para cada mercado:
1. Calcula la probabilidad implícita del Over y del Under según las cuotas reales
2. Compara con la estimación de la IA
3. Detecta si hay valor en Over o Under según los números reales
4. Identifica si la casa infló la línea (ej: ponen Over 2.5 muy barato para atraer apostadores pero el valor real está en Under 2.5 o en Over diferente)

Responde SOLO con este JSON sin backticks:
{"mercados":[{"mercado":"nombre","lineaOver":"2.5","cuotaOver":"1.75","probImplicitaOver":"57.1%","lineaUnder":"2.5","cuotaUnder":"2.05","probImplicitaUnder":"48.8%","totalImplicita":"105.9%","margenCasa":"5.9%","valueReal":"under","razon":"La casa infló el Over — probabilidad implícita total >105% indica margen alto. Con estimación IA de 55% de goles, el Under tiene value real","alerta":"⚠️ La casa pone Over muy accesible para atraer apostadores — el dinero inteligente está en el Under","confianzaAjustada":72}],"mejorApuesta":"descripción del mejor pick considerando las líneas reales","advertencia":"advertencia general si aplica"}`;

      const resp = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1500,
          useWebSearch: false,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await resp.json();
      const textBlock = (data.content || []).find(b => b.type === "text");
      if (!textBlock) throw new Error();
      const raw = textBlock.text.replace(/```json|```/g, "").trim();
      const start = raw.indexOf("{");
      let result;
      try {
        let depth = 0, end = -1;
        for (let ci = start; ci < raw.length; ci++) {
          if (raw[ci] === "{") depth++;
          else if (raw[ci] === "}") { depth--; if (depth === 0) { end = ci; break; } }
        }
        result = JSON.parse(raw.slice(start, end + 1));
      } catch (_e) {
        result = { mercados: [], mejorApuesta: "Error al analizar", advertencia: "" };
      }
      setLineAnalysis(result);
    } catch (_e) {
      setLineAnalysis({ mercados: [], mejorApuesta: "Error al analizar. Intenta de nuevo.", advertencia: "" });
    } finally {
      setAnalyzingLines(false);
    }
  };

  const validateTicket = useCallback(async () => {
    const ticketPicks = picks.filter(p => p.enTicket);
    if (ticketPicks.length < 2) {
      setTicketValidation({ status: "ok", alerts: [], message: "Agrega al menos 2 picks al ticket para validar." });
      return;
    }
    setValidatingTicket(true);
    setTicketValidation(null);
    try {
      const picksContext = ticketPicks.map((p, i) =>
        `Pick ${i+1}: "${p.mercado}${p.linea ? ` ${p.linea}` : ""}" (${p.tipo?.toUpperCase()}) — Confianza: ${p.confianza}% — Justificación: ${p.justificacion || "sin justificación"}`
      ).join("\n");

      const prompt = `Eres un analista experto en apuestas deportivas. Analiza este ticket de apuestas y detecta problemas.

PARTIDO: ${match.local} vs ${match.visitante}
DEPORTE: ${activeSport}
PERFIL IA: ${aiResult?.perfilPartido || "desconocido"}

PICKS SELECCIONADOS:
${picksContext}

Analiza si hay:
1. CONTRADICCIONES: picks que se anulan entre sí (ej: Over goles + Under goles, o Local gana + Ambos marcan No con equipo débil)
2. SOLAPAMIENTO: picks del mismo mercado disfrazados (ej: Over 2.5 goles + BTTS Sí — si Over falla, BTTS también falla casi siempre)
3. RIESGO OCULTO: picks que parecen independientes pero están correlacionados negativamente
4. PICK MÁS DÉBIL: el pick que tiene menos base y debería quitarse del ticket

Responde SOLO con este JSON sin backticks:
{"status":"ok","alerts":[{"tipo":"contradiccion","picks":"Pick 1 y Pick 2","mensaje":"explicación concisa de por qué se contradicen o solapan","accion":"Quita uno de los dos","severidad":"alta"}],"mejorTicket":"cuáles picks conservar si tuvieras que elegir solo 2","consejo":"consejo final en una línea"}

Si el ticket está limpio, responde: {"status":"ok","alerts":[],"mejorTicket":"todos","consejo":"Ticket limpio, sin contradicciones detectadas"}`;

      const resp = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1000,
          useWebSearch: false,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await resp.json();
      const textBlock = (data.content || []).find(b => b.type === "text");
      if (!textBlock) throw new Error();
      const raw = textBlock.text.replace(/```json|```/g, "").trim();
      const start = raw.indexOf("{");
      let result;
      try {
        let depth = 0, end = -1;
        for (let ci = start; ci < raw.length; ci++) {
          if (raw[ci] === "{") depth++;
          else if (raw[ci] === "}") { depth--; if (depth === 0) { end = ci; break; } }
        }
        result = JSON.parse(raw.slice(start, end + 1));
      } catch (_e) {
        result = { status: "ok", alerts: [], mejorTicket: "todos", consejo: "No se pudo analizar el ticket." };
      }
      setTicketValidation(result);
    } catch (_e) {
      setTicketValidation({ status: "error", alerts: [], consejo: "Error al validar. Intenta de nuevo." });
    } finally {
      setValidatingTicket(false);
    }
  }, [picks, match, activeSport, aiResult]);

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
          max_tokens: 2000,
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
      const st = bankrollStats(bankroll);
      const kb = bank > 0 ? kellyStake(p.confianza, toNum(odd), st.currentBank || bank) : null;
      return { ...p, cuotaCasa: odd, ...vr, kellyAmt: kb?.amount || 0, kellyLabel: kb?.label || "" };
    }));
  };

  const togglePickSel = (id) => setPicks(prev => prev.map(p => p.id === id ? { ...p, seleccionado: !p.seleccionado } : p));
  const ticket = calcTicket(picks, ticketStake, esParlay);

  const saveTicket = () => {
    const sel = picks.filter(p => p.seleccionado && toNum(p.cuotaCasa) > 1);
    if (!sel.length) return;
    const entry = {
      id: makeId(), fecha: new Date().toISOString(),
      partido: `${match.local} vs ${match.visitante}`,
      local: match.local, visitante: match.visitante,
      liga: match.liga, modo: modoMundial ? "mundial" : "clubes", deporte: activeSport,
      picks: sel, stake: ticketStake, esParlay, ...ticket,
      estado: "pendiente",
      resumenIA: aiResult?.resumen || "",
      pronosticoIA: aiResult?.pronostico || "",
      condicionPartido: aiResult?.condicionPartido || "",
    };
    setHistorial(prev => [entry, ...prev].slice(0, 50));
    const bets = sel.map(p => ({
      ...emptyBet(), id: makeId(),
      partido: `${match.local} vs ${match.visitante}`,
      pick: `${p.mercado} ${p.linea}`, mercado: p.tipo,
      stake: esParlay ? ticketStake : (toNum(ticketStake) / sel.length).toFixed(2),
      cuota: p.cuotaCasa, estado: "pendiente"
    }));
    setBankroll(prev => ({ ...prev, apuestas: [...bets, ...prev.apuestas] }));
    showToast(`✅ Ticket guardado: ${sel.length} picks`, "success");
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
    const finalReview = { ...reviewDraft, aciertos, fallos, totalPicks: reviewDraft.picks.length };
    setReviews(prev => [finalReview, ...prev].slice(0, 100));
    setShowReviewModal(false);
    setReviewDraft(null);
    showToast("📊 Review guardado. El motor IA aprende de este resultado.", "success");
  };

  // NEW: Save jornada
  const saveJornada = () => {
    if (!jornadaDraft.seleccion.trim()) { showToast("Ingresa el nombre de la selección", "error"); return; }
    setJornadas(prev => [{ ...jornadaDraft, id: makeId() }, ...prev].slice(0, 200));
    setJornadaDraft(emptyJornada());
    setShowJornadaForm(false);
    showToast("✅ Jornada registrada. El motor la usará en próximos análisis.", "success");
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
          model: "claude-sonnet-4-5",
          max_tokens: 2000,
          useWebSearch: true,
          messages: [{ role: "user", content: buildPartidosPrompt(favoritos) }],
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error?.message || `Error ${resp.status}`);
      const finalText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const cleaned = finalText.replace(/```json|```/g, "").trim();
      const start = cleaned.indexOf("{");
      if (start === -1) throw new Error("Sin JSON");
      let depth = 0, end = -1;
      for (let i = start; i < cleaned.length; i++) {
        if (cleaned[i] === "{") depth++;
        else if (cleaned[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
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
    setMatch(emptyMatch()); setAiStatus("idle"); setAiResult(null); setPicks([]); setAiError(""); setMarketFilter("Todos"); setActiveTab("analisis"); setModoMundial(false); setUserNote(""); setMatchDateTime(""); setTimingOverride(false);
  };

  const importRef = useRef(null);
  const importData = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result);
        if (data.match) setMatch({ ...emptyMatch(), ...data.match });
        if (data.activeSport && SPORTS[data.activeSport]) setActiveSport(data.activeSport);
        if (Array.isArray(data.picks)) setPicks(data.picks);
        if (data.bankroll) setBankroll({ ...emptyBankroll(), ...data.bankroll });
        if (Array.isArray(data.historial)) setHistorial(data.historial);
        if (Array.isArray(data.reviews)) setReviews(data.reviews);
        if (Array.isArray(data.jornadas)) setJornadas(data.jornadas);
        if (Array.isArray(data.favoritos)) setFavoritos(data.favoritos);
        if (data.aiResult) { setAiResult(data.aiResult); setAiStatus("done"); }
        else { setAiResult(null); setAiStatus("idle"); }
        setActiveTab("analisis");
        showToast("✅ Datos importados correctamente", "success");
      } catch { showToast("❌ Archivo inválido", "error"); }
    };
    reader.readAsText(file);
  };

  const exportData = () => {
    const data = { match, picks, bankroll, historial, reviews, jornadas, favoritos, aiResult, activeSport, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    const matchName = match.local && match.visitante ? `${match.local}_vs_${match.visitante}`.replace(/[^a-zA-Z0-9_áéíóúÁÉÍÓÚüÜñÑ-]/g, "_").slice(0, 50) : "apuestas";
    a.download = `${matchName}_${today}.json`; a.click(); URL.revokeObjectURL(url);
  };

  const currentFilters = MARKET_FILTERS_BY_SPORT[activeSport] || MARKET_FILTERS_BY_SPORT.futbol;
  const cleanFilter = (f) => f.replace(/[^\w\s\/ªáéíóúüñÁÉÍÓÚÜÑ·-]/g, "").trim();
  const filteredPicks = picks.filter(p => matchesFilterMulti(p, cleanFilter(marketFilter), activeSport));
  const hasFeedback = reviews.length >= 3;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── TABS ───────────────────────────────────────────────────────────────
  const tabs = [
    { id: "analisis", label: "🔍 Análisis" },
    { id: "picks", label: "🎯 Picks" },
    { id: "ticket", label: "🧾 Ticket" },
    { id: "bankroll", label: "💼 Bankroll" },
    { id: "historial", label: "📚 Historial" },
    { id: "ia-review", label: "🆚 IA vs Real" },
    { id: "ia-stats", label: "📈 Stats IA" },
    { id: "favoritos", label: "⭐ Favoritos" },
    ...(modoMundial ? [{ id: "jornadas", label: "🏆 Jornadas" }] : []),
  ];

  // ── INPUT STYLE ────────────────────────────────────────────────────────
  const inputStyle = { width: "100%", background: "rgba(15,23,42,.7)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "10px 12px", color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box", transition: "border-color .2s" };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" };

  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: `#020817`, backgroundImage: sport.bgGradient || "", minHeight: "100vh", color: "#f1f5f9", transition: "background-image .4s ease" }}>
      {/* Background */}
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(99,102,241,.15), transparent), radial-gradient(ellipse 40% 30% at 80% 80%, rgba(16,185,129,.06), transparent)", pointerEvents: "none", zIndex: 0 }} />

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
            {Object.values(SPORTS).map(s => (
              <button key={s.id} onClick={() => { setActiveSport(s.id); setMarketFilter("Todos"); setModoMundial(false); }}
                style={{ padding: isMobile ? "3px 10px" : "4px 12px", borderRadius: 20, border: `1px solid ${activeSport === s.id ? s.color : "rgba(255,255,255,.08)"}`, background: activeSport === s.id ? s.colorSoft : "transparent", color: activeSport === s.id ? "#e0e7ff" : "#475569", cursor: "pointer", fontWeight: 800, fontSize: isMobile ? 11 : 12, transition: "all .2s", whiteSpace: "nowrap", flexShrink: 0 }}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ minHeight: isMobile ? 44 : 52, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
              <div style={{ width: isMobile ? 28 : 34, height: isMobile ? 28 : 34, flexShrink: 0, borderRadius: 10, background: sport.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 15 : 18 }}>
                {modoMundial ? "🏆" : sport.emoji}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: isMobile ? 13 : 15, letterSpacing: "-.02em", color: "#e0e7ff" }}>
                  BetAnalyzer<span style={{ color: sport.color }}>PRO</span>
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
            <section style={{ background: `rgba(15,15,30,.5)`, border: `1px solid ${modoMundial ? "rgba(251,191,36,.25)" : sport.border}`, borderRadius: 20, padding: isMobile ? 16 : 24, marginBottom: 20, backdropFilter: "blur(8px)" }}>
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
                    <input value={match[f.key]} onChange={e => setMatch(m => ({ ...m, [f.key]: e.target.value }))}
                      placeholder={f.placeholder} style={inputStyle} />
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
              {match.oddLocal && match.oddVisit && (
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

            {/* ── NOTA DEL ANALISTA ───────────────────────────────────────── */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>
                📝 Nota del analista <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#334155" }}>(opcional — solo si sabes algo extra)</span>
              </div>
              <textarea
                value={userNote}
                onChange={e => setUserNote(e.target.value)}
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
                style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(99,102,241,.2)", background: "rgba(15,23,42,.6)", color: "#e0e7ff", fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
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

            {/* ── TOGGLE WEB / SIN WEB ────────────────────────────────────── */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setUseWebSearch(true)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: `2px solid ${useWebSearch ? "#0ea5e9" : "rgba(255,255,255,.08)"}`, background: useWebSearch ? "rgba(14,165,233,.15)" : "transparent", color: useWebSearch ? "#38bdf8" : "#475569", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                🌐 Con web <span style={{ fontSize: 10, display: "block", fontWeight: 500, opacity: .7 }}>~$0.20 · más preciso</span>
              </button>
              <button onClick={() => setUseWebSearch(false)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: `2px solid ${!useWebSearch ? "#10b981" : "rgba(255,255,255,.08)"}`, background: !useWebSearch ? "rgba(16,185,129,.15)" : "transparent", color: !useWebSearch ? "#34d399" : "#475569", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                ⚡ Sin web <span style={{ fontSize: 10, display: "block", fontWeight: 500, opacity: .7 }}>~$0.05 · más rápido</span>
              </button>
            </div>

            {(() => {
              const timing = getTimingStatus(matchDateTime, activeSport);
              const isBlocked = timing && !timing.canAnalyze && !timingOverride;
              return (
                <button onClick={isBlocked ? undefined : runAIAnalysis}
                  disabled={aiStatus === "loading" || isBlocked}
                  style={{ width: "100%", padding: "18px 24px", borderRadius: 16, border: "none", background: aiStatus === "loading" ? "rgba(99,102,241,.25)" : isBlocked ? "rgba(100,116,139,.2)" : sport.gradient, color: isBlocked ? "#475569" : "#fff", fontSize: 16, fontWeight: 900, cursor: isBlocked ? "not-allowed" : aiStatus === "loading" ? "not-allowed" : "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: isBlocked || aiStatus === "loading" ? "none" : `0 4px 24px ${sport.color}55`, transition: "all .2s" }}>
                  {aiStatus === "loading" ? (
                    <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span> Analizando{useWebSearch ? " + buscando en web" : ""}...</>
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

                {/* Main cards */}
                <div style={{ display: "grid", gap: 14, gridTemplateColumns: expertMode && !isMobile ? "1fr 1fr" : "1fr", marginBottom: 16 }}>
                  <div style={{ background: "rgba(30,27,75,.35)", border: "1px solid rgba(99,102,241,.15)", borderRadius: 16, padding: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", marginBottom: 8, textTransform: "uppercase" }}>📋 Resumen</div>
                    <p style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.6, margin: 0 }}>{aiResult.resumen}</p>
                    {modoMundial && aiResult.historialDirecto && (
                      <div style={{ marginTop: 12, background: "rgba(251,191,36,.05)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(251,191,36,.1)" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24", marginBottom: 4 }}>📜 HISTORIAL DIRECTO</div>
                        <p style={{ fontSize: 13, color: "#fde68a", margin: 0, lineHeight: 1.5 }}>{aiResult.historialDirecto}</p>
                      </div>
                    )}
                    {modoMundial && aiResult.formacionesClaves && (
                      <div style={{ marginTop: 10, background: "rgba(56,189,248,.05)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(56,189,248,.12)" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", marginBottom: 4 }}>⚙️ FORMACIONES Y JUGADORES CLAVE</div>
                        <p style={{ fontSize: 13, color: "#bae6fd", margin: 0, lineHeight: 1.5 }}>{aiResult.formacionesClaves}</p>
                      </div>
                    )}
                    {aiResult.pronostico && (
                      <div style={{ marginTop: 12, background: "rgba(99,102,241,.08)", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#818cf8", marginBottom: 4 }}>🎯 PRONÓSTICO IA</div>
                        <p style={{ fontSize: 13, color: "#e0e7ff", margin: 0, lineHeight: 1.5 }}>{aiResult.pronostico}</p>
                      </div>
                    )}
                    {modoMundial && aiResult.clavesTacticas && (
                      <div style={{ marginTop: 10, background: "rgba(52,211,153,.04)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(52,211,153,.1)" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#34d399", marginBottom: 4 }}>🧩 CLAVES TÁCTICAS</div>
                        <p style={{ fontSize: 13, color: "#a7f3d0", margin: 0, lineHeight: 1.5 }}>{aiResult.clavesTacticas}</p>
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

                            {/* Confidence bar */}
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                              <div style={{ flex: 1, background: "rgba(255,255,255,.05)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pick.confianza}%`, background: pick.confianza >= 75 ? "#34d399" : pick.confianza >= 65 ? "#fbbf24" : "#f87171", borderRadius: 4, transition: "width .5s" }} />
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 800, color: pick.confianza >= 75 ? "#34d399" : pick.confianza >= 65 ? "#fbbf24" : "#f87171", minWidth: 36 }}>{pick.confianza}%</span>
                            </div>

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
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#6366f1", textTransform: "uppercase", marginBottom: 2 }}>Constructor</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>🧾 Ticket de Apuesta</h2>
            </div>

            {picks.filter(p => p.seleccionado).length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#334155" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
                <div style={{ fontWeight: 700, color: "#475569", marginBottom: 8 }}>Ticket vacío</div>
                <div style={{ fontSize: 13 }}>Selecciona picks desde la pestaña "Picks"</div>
                <button onClick={() => setActiveTab("picks")} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(99,102,241,.25)", background: "rgba(99,102,241,.08)", color: "#818cf8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ← Ver Picks
                </button>
              </div>
            ) : (
              <>
                <div style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                  {picks.filter(p => p.seleccionado).map(p => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e7ff" }}>{p.mercado} {p.linea}</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{p.confianza}% conf. · {p.tipo} {p.pesoAnalisis ? `· Peso: ${p.pesoAnalisis}/10` : ""}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 15, fontWeight: 900, color: "#e0e7ff" }}>{toNum(p.cuotaCasa) > 1 ? toNum(p.cuotaCasa).toFixed(2) : "—"}</div>
                        <button onClick={() => togglePickSel(p.id)} style={{ fontSize: 10, color: "#f87171", background: "none", border: "none", cursor: "pointer" }}>✕ Quitar</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Monto a apostar ($)</label>
                    <input type="number" value={ticketStake} onChange={e => setTicketStake(e.target.value)} style={inputStyle} placeholder="10" />
                  </div>
                  <div>
                    <label style={labelStyle}>Tipo</label>
                    <select value={esParlay ? "parlay" : "simple"} onChange={e => setEsParlay(e.target.value === "parlay")}
                      style={{ ...inputStyle, cursor: "pointer" }}>
                      <option value="parlay">Combinada (Parlay)</option>
                      <option value="simple">Simples Individuales</option>
                    </select>
                  </div>
                </div>

                {ticket.count > 0 && (
                  <div style={{ background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
                      {[
                        { label: "Cuota combinada", val: ticket.combinada.toFixed(2), color: "#a5b4fc" },
                        { label: "Potencial", val: `$${fmtMoney(ticket.potencial)}`, color: "#34d399" },
                        { label: "Prob. real", val: fmtPct(ticket.probReal), color: "#fbbf24" },
                        { label: "Value ticket", val: `${ticket.value > 0 ? "+" : ""}${ticket.value.toFixed(1)}pp`, color: ticket.value >= 5 ? "#34d399" : ticket.value >= 0 ? "#fbbf24" : "#f87171" },
                      ].map(x => (
                        <div key={x.label} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>{x.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: x.color }}>{x.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── VALIDACIÓN DEL TICKET CON IA ─────────────────────────── */}
                {picks.filter(p => p.enTicket).length >= 2 && (
                  <div style={{ marginBottom: 16 }}>
                    <button onClick={validateTicket} disabled={validatingTicket}
                      style={{ width: "100%", padding: 12, borderRadius: 14, border: "1px solid rgba(99,102,241,.3)", background: "rgba(99,102,241,.1)", color: "#a5b4fc", fontSize: 13, fontWeight: 800, cursor: validatingTicket ? "not-allowed" : "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      {validatingTicket ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span> Analizando ticket...</> : "🔍 Validar ticket con IA"}
                    </button>

                    {ticketValidation && (
                      <div style={{ background: "rgba(15,23,42,.6)", border: `1px solid ${ticketValidation.alerts?.length > 0 ? "rgba(251,191,36,.3)" : "rgba(52,211,153,.3)"}`, borderRadius: 14, padding: 14 }}>
                        {/* Alerts */}
                        {ticketValidation.alerts?.length > 0 ? (
                          <div style={{ marginBottom: 10 }}>
                            {ticketValidation.alerts.map((alert, i) => (
                              <div key={i} style={{ background: alert.severidad === "alta" ? "rgba(239,68,68,.1)" : "rgba(251,191,36,.1)", border: `1px solid ${alert.severidad === "alta" ? "rgba(239,68,68,.3)" : "rgba(251,191,36,.3)"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                  <span style={{ fontSize: 14 }}>{alert.severidad === "alta" ? "❌" : "⚠️"}</span>
                                  <span style={{ fontSize: 12, fontWeight: 900, color: alert.severidad === "alta" ? "#f87171" : "#fbbf24", textTransform: "uppercase", letterSpacing: ".05em" }}>
                                    {alert.tipo === "contradiccion" ? "Contradicción" : alert.tipo === "solapamiento" ? "Solapamiento" : "Riesgo oculto"}
                                  </span>
                                  <span style={{ fontSize: 11, color: "#64748b" }}>{alert.picks}</span>
                                </div>
                                <p style={{ fontSize: 12, color: "#e0e7ff", margin: "0 0 4px" }}>{alert.mensaje}</p>
                                <p style={{ fontSize: 11, color: "#6366f1", margin: 0, fontWeight: 700 }}>👉 {alert.accion}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 18 }}>✅</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: "#34d399" }}>Ticket limpio — sin contradicciones detectadas</span>
                          </div>
                        )}

                        {/* Mejor ticket sugerido */}
                        {ticketValidation.mejorTicket && ticketValidation.mejorTicket !== "todos" && ticketValidation.alerts?.length > 0 && (
                          <div style={{ background: "rgba(99,102,241,.1)", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: "#a5b4fc" }}>💡 Mejor combinación: </span>
                            <span style={{ fontSize: 11, color: "#e0e7ff" }}>{ticketValidation.mejorTicket}</span>
                          </div>
                        )}

                        {/* Consejo final */}
                        {ticketValidation.consejo && (
                          <p style={{ fontSize: 12, color: "#64748b", margin: 0, fontStyle: "italic" }}>"{ticketValidation.consejo}"</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <button onClick={saveTicket}
                  style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #059669, #047857)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 20px rgba(5,150,105,.3)" }}>
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

            {/* Curva del bankroll */}
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
