// @ts-nocheck
"use client";
import { useState, useEffect, useCallback, useRef, Fragment } from "react";

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

// ════════════════════════════════════════════════════════════════════════════
// ── MOTOR FREE (LOCAL · SIN API · SIN CRÉDITOS) ──────────────────────────────
// Calcula probabilidades reales con modelos matemáticos en el navegador.
// Fútbol: Poisson sobre goles esperados. MLB: carreras esperadas + ERA.
// NBA: puntos esperados + distribución normal. Cero internet.
// ════════════════════════════════════════════════════════════════════════════
const _fact = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const _pois = (k, l) => l <= 0 ? (k === 0 ? 1 : 0) : (Math.pow(l, k) * Math.exp(-l)) / _fact(k);
function _scoreMatrix(lh, la, mg = 8) {
  const m = []; for (let h = 0; h <= mg; h++) { m[h] = []; for (let a = 0; a <= mg; a++) m[h][a] = _pois(h, lh) * _pois(a, la); } return m;
}
function _erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
const _normCdf = (x) => 0.5 * (1 + _erf(x / Math.sqrt(2)));

function freeEvaluate(prob, odd) {
  if (!prob || !odd || odd <= 1) return { value: 0, ev: 0, roi: 0, color: "gray", label: "Sin datos", hasValue: false, implied: 0 };
  const implied = impliedProb(odd);
  const value = prob - implied;
  const ev = (prob / 100) * (odd - 1) - (1 - prob / 100);
  const color = value >= 6 ? "green" : value >= 2 ? "yellow" : "red";
  const label = value >= 6 ? "🟢 Value fuerte" : value >= 2 ? "🟡 Value leve" : "🔴 Sin value";
  return { value, ev, roi: ev * 100, color, label, hasValue: value >= 2, implied };
}
function freeConfTier(c) {
  if (c >= 90) return { tier: "A+", color: "#fbbf24", label: "Élite" };
  if (c >= 80) return { tier: "A", color: "#34d399", label: "Fuerte" };
  if (c >= 70) return { tier: "B", color: "#60a5fa", label: "Sólida" };
  if (c >= 60) return { tier: "C", color: "#a78bfa", label: "Moderada" };
  return { tier: "D", color: "#64748b", label: "Débil" };
}
function freeKelly(prob, odd, bank, fraction = 0.5, cap = 0.10) {
  if (!bank || !odd || odd <= 1 || !prob) return null;
  const p = prob / 100, q = 1 - p, b = odd - 1, k = (b * p - q) / b;
  if (k <= 0) return { pct: 0, amount: 0, tier: "none", label: "Sin value (Kelly ≤ 0)" };
  const frac = Math.min(k * fraction, cap), amount = bank * frac;
  const tier = frac >= 0.05 ? "fuerte" : frac >= 0.025 ? "moderado" : frac >= 0.008 ? "minimo" : "none";
  return { pct: frac * 100, amount, tier, label: `${(frac * 100).toFixed(1)}% → $${fmtMoney(amount)}` };
}

function freeAnalyzeFutbol(d) {
  const lg = toNum(d.leagueAvg) > 0 ? toNum(d.leagueAvg) : 1.35, adv = 0.20;
  const hGF = toNum(d.homeGF) || lg, hGA = toNum(d.homeGA) || lg, aGF = toNum(d.awayGF) || lg, aGA = toNum(d.awayGA) || lg;
  const hA = hGF / lg, hD = hGA / lg, aA = aGF / lg, aD = aGA / lg;
  let lh = hA * aD * lg + adv, la = aA * hD * lg;
  lh *= clamp(1 - toNum(d.injuriesHome) * 0.04, 0.6, 1);
  la *= clamp(1 - toNum(d.injuriesAway) * 0.04, 0.6, 1);
  if (d.restHome !== "" && d.restHome != null && toNum(d.restHome) < 3) lh *= 0.95;
  if (d.restAway !== "" && d.restAway != null && toNum(d.restAway) < 3) la *= 0.95;
  lh = clamp(lh, 0.2, 5); la = clamp(la, 0.2, 5);
  const M = _scoreMatrix(lh, la), mx = M.length - 1;
  let pH = 0, pD = 0, pA = 0, btts = 0, ml = { h: 0, a: 0, p: 0 };
  const ov = { 1.5: 0, 2.5: 0, 3.5: 0 };
  for (let h = 0; h <= mx; h++) for (let a = 0; a <= mx; a++) {
    const p = M[h][a];
    if (h > a) pH += p; else if (h === a) pD += p; else pA += p;
    if (h > 0 && a > 0) btts += p;
    const tot = h + a; Object.keys(ov).forEach(l => { if (tot > parseFloat(l)) ov[l] += p; });
    if (p > ml.p) ml = { h, a, p };
  }
  const pc = (x) => clamp(x * 100, 0, 100);

  // ── CORNERS Y TARJETAS (Poisson sobre total esperado) ──────────────────
  // Total esperado = (lo que genera un equipo + lo que concede el otro) / 2, sumado
  const overUnderTotal = (lambda, lines) => {
    const out = {};
    lines.forEach(L => {
      let over = 0;
      for (let k = 0; k <= 40; k++) { if (k > L) over += _pois(k, lambda); }
      out[L] = { over: pc(over), under: pc(1 - over) };
    });
    return out;
  };
  // Corners: promedio entre lo que saca el equipo y lo que concede el rival
  const cornersHome = (toNum(d.cornersHomeFor) + toNum(d.cornersAwayAgainst)) / 2 || 0;
  const cornersAway = (toNum(d.cornersAwayFor) + toNum(d.cornersHomeAgainst)) / 2 || 0;
  const cornersTotal = cornersHome + cornersAway;
  const hasCorners = cornersTotal > 0;
  const cornersOU = hasCorners ? overUnderTotal(cornersTotal, [8.5, 9.5, 10.5, 11.5]) : null;
  // Tarjetas: igual, promedio de las que recibe el equipo y las que provoca el rival
  const cardsHome = (toNum(d.cardsHomeFor) + toNum(d.cardsAwayAgainst)) / 2 || 0;
  const cardsAway = (toNum(d.cardsAwayFor) + toNum(d.cardsHomeAgainst)) / 2 || 0;
  const cardsTotal = cardsHome + cardsAway;
  const hasCards = cardsTotal > 0;
  const cardsOU = hasCards ? overUnderTotal(cardsTotal, [2.5, 3.5, 4.5, 5.5]) : null;

  return {
    sport: "futbol", lambdaHome: lh.toFixed(2), lambdaAway: la.toFixed(2),
    expected: (lh + la).toFixed(2), expLabel: "goles esperados", mostLikely: `${ml.h}-${ml.a}`,
    cornersTotal: hasCorners ? cornersTotal.toFixed(1) : null,
    cardsTotal: hasCards ? cardsTotal.toFixed(1) : null,
    cornersOU, cardsOU,
    probs: {
      local: pc(pH), empate: pc(pD), visitante: pc(pA),
      dobleLocal: pc(pH + pD), dobleVisit: pc(pA + pD),
      btts: pc(btts), bttsNo: pc(1 - btts),
      over15: pc(ov[1.5]), over25: pc(ov[2.5]), over35: pc(ov[3.5]), under25: pc(1 - ov[2.5]),
    },
  };
}
function freeAnalyzeMLB(d) {
  const lg = 4.5;
  let rH = ((toNum(d.homeGF) || lg) + (toNum(d.awayGA) || lg)) / 2, rA = ((toNum(d.awayGF) || lg) + (toNum(d.homeGA) || lg)) / 2;
  if (toNum(d.pitcherAwayERA) > 0) rH *= clamp(toNum(d.pitcherAwayERA) / 4.0, 0.7, 1.4);
  if (toNum(d.pitcherHomeERA) > 0) rA *= clamp(toNum(d.pitcherHomeERA) / 4.0, 0.7, 1.4);
  rH += 0.15; rH = clamp(rH, 1, 12); rA = clamp(rA, 1, 12);
  const M = _scoreMatrix(rH, rA, 18), mx = M.length - 1;
  let pH = 0, pA = 0, rlHome = 0, rlAway = 0; // run line ±1.5
  const ov = { 7.5: 0, 8.5: 0, 9.5: 0 };
  for (let h = 0; h <= mx; h++) for (let a = 0; a <= mx; a++) {
    const p = M[h][a];
    if (h > a) pH += p; else if (h < a) pA += p; else { pH += p / 2; pA += p / 2; }
    if (h - a >= 2) rlHome += p;       // local gana por 2+ (cubre -1.5)
    if (a - h >= 2) rlAway += p;       // visitante gana por 2+ (cubre -1.5)
    const tot = h + a; Object.keys(ov).forEach(l => { if (tot > parseFloat(l)) ov[l] += p; });
  }
  // Totales por equipo (Poisson individual sobre carreras esperadas de cada uno)
  const teamOver = (lambda, line) => { let o = 0; for (let k = 0; k <= 30; k++) if (k > line) o += _pois(k, lambda); return o; };
  const nrfi = _pois(0, rH / 9) * _pois(0, rA / 9), pc = (x) => clamp(x * 100, 0, 100);
  // F5 (primeras 5 entradas): ~5/9 de las carreras totales
  const f5H = rH * 5 / 9, f5A = rA * 5 / 9;
  const f5Over = (line) => { const Mf = _scoreMatrix(f5H, f5A, 12); let o = 0; for (let h = 0; h < Mf.length; h++) for (let a = 0; a < Mf.length; a++) if (h + a > line) o += Mf[h][a]; return o; };
  let f5Win = 0; { const Mf = _scoreMatrix(f5H, f5A, 12); for (let h = 0; h < Mf.length; h++) for (let a = 0; a < Mf.length; a++) { if (h > a) f5Win += Mf[h][a]; else if (h === a) f5Win += Mf[h][a] / 2; } }
  return {
    sport: "mlb", expected: (rH + rA).toFixed(2), expLabel: "carreras esperadas", mostLikely: `${Math.round(rH)}-${Math.round(rA)}`,
    runsHome: rH.toFixed(1), runsAway: rA.toFixed(1),
    probs: {
      local: pc(pH), visitante: pc(pA),
      over75: pc(ov[7.5]), over85: pc(ov[8.5]), under85: pc(1 - ov[8.5]), over95: pc(ov[9.5]), under95: pc(1 - ov[9.5]),
      nrfi: pc(nrfi), yrfi: pc(1 - nrfi),
      runlineHome: pc(rlHome), runlineAway: pc(rlAway),
      teamHomeOver45: pc(teamOver(rH, 4.5)), teamHomeUnder45: pc(1 - teamOver(rH, 4.5)),
      teamAwayOver45: pc(teamOver(rA, 4.5)), teamAwayUnder45: pc(1 - teamOver(rA, 4.5)),
      f5Local: pc(f5Win), f5Visit: pc(1 - f5Win), f5Over45: pc(f5Over(4.5)), f5Under45: pc(1 - f5Over(4.5)),
    },
  };
}
function freeAnalyzeNBA(d) {
  const lg = 113;
  let pH = ((toNum(d.homeGF) || lg) + (toNum(d.awayGA) || lg)) / 2, pA = ((toNum(d.awayGF) || lg) + (toNum(d.homeGA) || lg)) / 2;
  if (toNum(d.offRtgHome) > 0) pH = (pH + toNum(d.offRtgHome)) / 2;
  if (toNum(d.offRtgAway) > 0) pA = (pA + toNum(d.offRtgAway)) / 2;
  pH += 2.5;
  if (d.restHome !== "" && d.restHome != null && toNum(d.restHome) === 0) pH -= 3;
  if (d.restAway !== "" && d.restAway != null && toNum(d.restAway) === 0) pA -= 3;
  pH = clamp(pH, 80, 150); pA = clamp(pA, 80, 150);
  const sdTeam = 11, sdDiff = sdTeam * Math.sqrt(2), sdTotal = sdTeam * Math.sqrt(2);
  const diff = pH - pA, tot = pH + pA;
  const pWin = _normCdf(diff / sdDiff);
  // Over/Under puntos totales: línea = total esperado redondeado a .5
  const totalLine = Math.round(tot) + 0.5;
  const pOver = 1 - _normCdf((totalLine - tot) / sdTotal);
  // Spread / hándicap: prob de que el local cubra un hándicap dado
  const spreadLine = Math.round(diff * 2) / 2; // hándicap "justo" ≈ diferencia esperada
  const coverHome = (line) => _normCdf((diff - line) / sdDiff); // local -line cubre si gana por más de line
  // Totales por equipo
  const teamOver = (mean, line) => 1 - _normCdf((line - mean) / sdTeam);
  // Primera mitad ≈ 0.5 del total (con su propia varianza)
  const halfTot = tot / 2, halfDiff = diff / 2;
  const pHalfOver = 1 - _normCdf((Math.round(halfTot) + 0.5 - halfTot) / (sdTotal / Math.sqrt(2)));
  const pHalfHome = _normCdf(halfDiff / (sdDiff / Math.sqrt(2)));
  const pc = (x) => clamp(x * 100, 0, 100);
  return {
    sport: "nba", expected: tot.toFixed(1), expLabel: "puntos esperados", mostLikely: `${Math.round(pH)}-${Math.round(pA)}`, spread: diff.toFixed(1),
    ptsHome: pH.toFixed(1), ptsAway: pA.toFixed(1), totalLine, spreadLine,
    probs: {
      local: pc(pWin), visitante: pc(1 - pWin),
      over: pc(pOver), under: pc(1 - pOver), overTotal: totalLine.toFixed(1),
      coverHome: pc(coverHome(spreadLine)), coverAway: pc(1 - coverHome(spreadLine)),
      teamHomeOver: pc(teamOver(pH, Math.round(pH) + 0.5)), teamHomeUnder: pc(1 - teamOver(pH, Math.round(pH) + 0.5)), teamHomeLine: (Math.round(pH) + 0.5).toFixed(1),
      teamAwayOver: pc(teamOver(pA, Math.round(pA) + 0.5)), teamAwayUnder: pc(1 - teamOver(pA, Math.round(pA) + 0.5)), teamAwayLine: (Math.round(pA) + 0.5).toFixed(1),
      halfOver: pc(pHalfOver), halfUnder: pc(1 - pHalfOver), halfTotalLine: (Math.round(halfTot) + 0.5).toFixed(1),
      halfLocal: pc(pHalfHome), halfVisit: pc(1 - pHalfHome),
    },
  };
}
// ── PROMEDIO PONDERADO (forma reciente: lo nuevo pesa más) ────────────────
// Recibe array de valores [más reciente ... más antiguo]; pesos 5,4,3,2,1
function weightedAvg(values) {
  const nums = values.map(toNum).filter((v, i) => values[i] !== "" && values[i] != null && !isNaN(toNum(values[i])));
  // Mantener el orden: usamos solo los que tienen dato real
  const filled = values.map(v => (v === "" || v == null) ? null : toNum(v)).filter(v => v !== null);
  if (!filled.length) return null;
  let num = 0, den = 0;
  filled.forEach((v, i) => { const w = filled.length - i; num += v * w; den += w; });
  return den ? num / den : null;
}
// Convierte 5 partidos {gf,ga} en promedio ponderado a favor / en contra
function formAverages(arr) {
  const gf = weightedAvg(arr.map(p => p.gf));
  const ga = weightedAvg(arr.map(p => p.ga));
  return { gf, ga, count: arr.filter(p => (p.gf !== "" && p.gf != null) || (p.ga !== "" && p.ga != null)).length };
}
// Promedio ponderado de un campo cualquiera dentro de los partidos
function formField(arr, key) { return weightedAvg(arr.map(p => p[key])); }
// MLB: suma de innings de un partido (devuelve total carreras de ese partido)
function sumInnings(match, prefix) {
  let any = false, total = 0;
  for (let i = 1; i <= 9; i++) { const v = match[`${prefix}${i}`]; if (v !== "" && v != null) { any = true; total += toNum(v); } }
  return any ? total : null;
}
// MLB: promedio ponderado de carreras por inning específico (across 5 partidos)
function inningAverage(arr, prefix, inning) { return weightedAvg(arr.map(p => p[`${prefix}${inning}`])); }
// NBA: suma de cuartos de un partido
function sumQuarters(match, prefix) {
  let any = false, total = 0;
  for (let q = 1; q <= 4; q++) { const v = match[`${prefix}q${q}`]; if (v !== "" && v != null) { any = true; total += toNum(v); } }
  return any ? total : null;
}
function quarterAverage(arr, prefix, q) { return weightedAvg(arr.map(p => p[`${prefix}q${q}`])); }

// ── FIABILIDAD POR MERCADO (semáforo) ─────────────────────────────────────
// alto = los promedios predicen bien · medio = aceptable · bajo = mucho ruido
function marketReliability(mercado) {
  const m = (mercado || "").toLowerCase();
  // ALTO: totales de goles/carreras/puntos y over/under principales
  if (m.includes("over") && (m.includes("gol") || m.includes("carrera") || m.includes("pts") || m.includes("punto"))) return "alto";
  if (m.includes("under") && (m.includes("gol") || m.includes("carrera") || m.includes("pts") || m.includes("punto"))) return "alto";
  if (m.includes("over 1.5") || m.includes("over 2.5")) return "alto";
  if (m.includes("total local") || m.includes("total visit")) return "alto";
  // MEDIO: ganador, doble oportunidad, btts, run line, corners, F5
  if (m.includes("gana") || m.includes("moneyline") || m.includes("doble") || m.includes("ambos marcan") || m.includes("run line") || m.includes("corner") || m.includes("f5") || m.includes("spread") || m.includes("nrfi")) return "medio";
  // BAJO: tarjetas, primera mitad, mercados muy dependientes del contexto
  if (m.includes("tarjeta") || m.includes("1ª mitad") || m.includes("mitad")) return "bajo";
  return "medio";
}
const RELIABILITY_META = {
  alto: { label: "Fiabilidad alta", color: "#34d399", dot: "🟢", txt: "Los promedios predicen bien este mercado." },
  medio: { label: "Fiabilidad media", color: "#fbbf24", dot: "🟡", txt: "Aceptable, pero confírmalo con contexto." },
  bajo: { label: "Fiabilidad baja", color: "#f87171", dot: "🔴", txt: "Depende mucho de árbitro/contexto. Cuidado." },
};

function freeAnalyze(sport, d) {
  if (sport === "mlb") return freeAnalyzeMLB(d);
  if (sport === "nba") return freeAnalyzeNBA(d);
  return freeAnalyzeFutbol(d);
}
// ── AVISOS DE CRITERIO (reglas de los prompts, ahora basadas en números) ──
function freeAlerts(sport, d, an) {
  const alerts = [];
  const p = an.probs;
  if (sport === "mlb") {
    const eraRival = toNum(d.pitcherAwayERA); // ERA del pitcher que enfrenta al local
    const eraRivalHome = toNum(d.pitcherHomeERA);
    // Favorito claro: una prob ML muy alta
    const favHome = p.local >= 62, favAway = p.visitante >= 62;
    if ((eraRival >= 5.0 || eraRivalHome >= 5.0)) {
      alerts.push({ tipo: "warn", txt: "⚠️ Hay un abridor con ERA alto (≥5.00): el rival anotará mucho. Evita Under del total completo; considera Over o Run Line del equipo fuerte." });
    }
    if (favHome || favAway) {
      const fuerte = favHome ? (d.local || "Local") : (d.visitante || "Visitante");
      alerts.push({ tipo: "info", txt: `⭐ Favorito claro: ${fuerte}. En MLB el F5 (primeras 5 entradas) suele ser el mercado más predecible cuando el abridor fuerte es claro.` });
    }
    // Contradicción: favorito fuerte + Under con value
    if ((favHome || favAway) && p.under85 >= 55) {
      alerts.push({ tipo: "warn", txt: "🔄 Cuidado con la contradicción: si recomiendas al favorito fuerte, el Under del total es arriesgado — un equipo dominante suele anotar mucho." });
    }
  }
  if (sport === "nba") {
    const sp = Math.abs(toNum(an.spread));
    if (sp >= 8) {
      const fuerte = toNum(an.spread) > 0 ? (d.local || "Local") : (d.visitante || "Visitante");
      alerts.push({ tipo: "info", txt: `⭐ Favorito claro (spread ${sp.toFixed(1)}): ${fuerte}. Los partidos desequilibrados tienden a tener MÁS puntos, no menos — el Over suele tener valor.` });
    }
    if (d.restHome !== "" && toNum(d.restHome) === 0) alerts.push({ tipo: "warn", txt: "😴 Local en back-to-back: su rendimiento y ritmo bajan. Considera Under de su total de equipo." });
    if (d.restAway !== "" && toNum(d.restAway) === 0) alerts.push({ tipo: "warn", txt: "😴 Visitante en back-to-back: su rendimiento y ritmo bajan." });
  }
  if (sport === "futbol") {
    if (p.local >= 65 && p.btts >= 55) alerts.push({ tipo: "warn", txt: "🔄 Local muy favorito pero BTTS alto: si esperas goleada con portería a cero, BTTS Sí se contradice." });
    if (toNum(d.injuriesHome) >= 3) alerts.push({ tipo: "warn", txt: "🩹 El local tiene 3+ bajas clave: su ataque esperado baja bastante." });
    if (toNum(d.injuriesAway) >= 3) alerts.push({ tipo: "warn", txt: "🩹 El visitante tiene 3+ bajas clave: su ataque esperado baja bastante." });
  }
  return alerts;
}

// Genera picks SIN cuotas: calcula probabilidad de cada mercado, puntúa por
// probabilidad + fiabilidad, y devuelve los mejores (mínimo 10, hasta 15).
function freeGenPicks(an) {
  const picks = [];
  const add = (key, mercado, prob) => {
    if (prob == null || !Number.isFinite(prob)) return;
    const conf = clamp(prob, 0, 100), t = freeConfTier(conf), rel = marketReliability(mercado);
    // Score: probabilidad + bonus por fiabilidad (alto +8, medio +3, bajo 0)
    const relBonus = rel === "alto" ? 8 : rel === "medio" ? 3 : 0;
    const score = conf + relBonus;
    picks.push({
      id: makeId(), key, mercado, probReal: conf,
      confianza: conf, tier: t.tier, tierColor: t.color, tierLabel: t.label,
      reliability: rel, relMeta: RELIABILITY_META[rel], score,
      odd: "", // se llena después en la UI
    });
  };
  const p = an.probs;
  if (an.sport === "futbol") {
    add("local", "Gana Local (1)", p.local); add("draw", "Empate (X)", p.empate); add("visit", "Gana Visitante (2)", p.visitante);
    add("dc1x", "Doble oport. 1X", p.dobleLocal); add("dcx2", "Doble oport. X2", p.dobleVisit);
    add("btts", "Ambos marcan (Sí)", p.btts); add("bttsNo", "Ambos marcan (No)", p.bttsNo);
    add("over15", "Over 1.5 goles", p.over15); add("over25", "Over 2.5 goles", p.over25); add("over35", "Over 3.5 goles", p.over35);
    add("under25", "Under 2.5 goles", p.under25);
    if (an.cornersOU) {
      if (an.cornersOU[8.5]) { add("co85", "Over 8.5 corners", an.cornersOU[8.5].over); add("cu85", "Under 8.5 corners", an.cornersOU[8.5].under); }
      if (an.cornersOU[9.5]) { add("co95", "Over 9.5 corners", an.cornersOU[9.5].over); add("cu95", "Under 9.5 corners", an.cornersOU[9.5].under); }
      if (an.cornersOU[10.5]) add("co105", "Over 10.5 corners", an.cornersOU[10.5].over);
    }
    if (an.cardsOU) {
      if (an.cardsOU[3.5]) { add("to35", "Over 3.5 tarjetas", an.cardsOU[3.5].over); add("tu35", "Under 3.5 tarjetas", an.cardsOU[3.5].under); }
      if (an.cardsOU[4.5]) { add("to45", "Over 4.5 tarjetas", an.cardsOU[4.5].over); add("tu45", "Under 4.5 tarjetas", an.cardsOU[4.5].under); }
      if (an.cardsOU[5.5]) add("to55", "Over 5.5 tarjetas", an.cardsOU[5.5].over);
    }
  } else if (an.sport === "mlb") {
    add("local", "Moneyline Local", p.local); add("visit", "Moneyline Visitante", p.visitante);
    add("rlHome", "Run Line Local -1.5", p.runlineHome); add("rlAway", "Run Line Visitante -1.5", p.runlineAway);
    add("over75", "Over 7.5 carreras", p.over75); add("over85", "Over 8.5 carreras", p.over85); add("under85", "Under 8.5 carreras", p.under85);
    add("thOver", "Total Local Over 4.5", p.teamHomeOver45); add("taOver", "Total Visit. Over 4.5", p.teamAwayOver45);
    add("f5Local", "F5 Gana Local", p.f5Local); add("f5Visit", "F5 Gana Visitante", p.f5Visit);
    add("f5Over", "F5 Over 4.5", p.f5Over45); add("f5Under", "F5 Under 4.5", p.f5Under45);
    add("nrfi", "NRFI (1er inning)", p.nrfi);
  } else {
    add("local", "Moneyline Local", p.local); add("visit", "Moneyline Visitante", p.visitante);
    add("spHome", `Spread Local ${an.spreadLine <= 0 ? "+" : "-"}${Math.abs(an.spreadLine)}`, p.coverHome);
    add("spAway", `Spread Visit. ${an.spreadLine >= 0 ? "+" : "-"}${Math.abs(an.spreadLine)}`, p.coverAway);
    add("over", `Over ${p.overTotal} pts`, p.over); add("under", `Under ${p.overTotal} pts`, p.under);
    add("thOver", `Total Local Over ${p.teamHomeLine}`, p.teamHomeOver); add("taOver", `Total Visit. Over ${p.teamAwayLine}`, p.teamAwayOver);
    add("halfOver", `1ª Mitad Over ${p.halfTotalLine}`, p.halfOver); add("halfUnder", `1ª Mitad Under ${p.halfTotalLine}`, p.halfUnder);
    add("halfLocal", "1ª Mitad Gana Local", p.halfLocal); add("halfVisit", "1ª Mitad Gana Visitante", p.halfVisit);
  }
  // Ordenar por score y quedarnos con los mejores 10-15
  picks.sort((a, b) => b.score - a.score);
  // Mínimo 10; hasta 15 solo si su confianza es decente (>=60)
  let top = picks.slice(0, 10);
  for (let i = 10; i < picks.length && top.length < 15; i++) {
    if (picks[i].confianza >= 60) top.push(picks[i]);
  }
  return top;
}

// Recalcula value/EV/Kelly de un pick cuando el usuario mete la cuota
function freePickWithOdd(pick, odd, bank) {
  const o = toNum(odd);
  if (!o || o <= 1) return { ...pick, odd, value: null, hasOdd: false };
  const ev = freeEvaluate(pick.probReal, o);
  return {
    ...pick, odd, hasOdd: true,
    value: ev.value, ev: ev.ev, roi: ev.roi, color: ev.color, valueLabel: ev.label, hasValue: ev.hasValue, implied: ev.implied,
    kelly: bank ? freeKelly(pick.probReal, o, bank) : null,
  };
}

// ── STATS DE APUESTAS INDIVIDUALES (ROI, Yield, Win Rate, profit por deporte) ──
function historialStats(bets) {
  const s = bets.filter(b => b.estado === "ganada" || b.estado === "perdida");
  const totalStake = s.reduce((acc, b) => acc + toNum(b.stake), 0);
  let profit = 0, wins = 0; const porDeporte = {};
  s.forEach(b => {
    const st = toNum(b.stake) || 10, o = toNum(b.cuota);
    const pr = b.estado === "ganada" ? st * (o - 1) : -st;
    profit += pr; if (b.estado === "ganada") wins++;
    const sp = b.deporte || "otro"; porDeporte[sp] = (porDeporte[sp] || 0) + pr;
  });
  const stakeBase = totalStake || (s.length * 10);
  return {
    totalBets: s.length, wins, losses: s.length - wins,
    winRate: s.length ? (wins / s.length) * 100 : 0,
    roi: stakeBase ? (profit / stakeBase) * 100 : 0,
    yield: s.length ? (profit / s.length) : 0,
    profit, totalStake: stakeBase, porDeporte,
  };
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
const emptyBet = () => ({ id: makeId(), fecha: new Date().toISOString().slice(0,10), partido: "", pick: "", mercado: "", stake: "", cuota: "", estado: "pendiente", notas: "", deporte: "" });
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

MERCADOS DISPONIBLES (usa nombre exacto de Hondubet):
— RESULTADO —
- "Moneyline" → ganador del partido
- "Run line" → hándicap de carreras ±1.5
- "Margen de victoria" → por cuántas carreras gana
- "Ganador (incl. extra innings)" → ganador incluyendo extras

— CARRERAS / TOTALES —
- "Total de carreras" → Over/Under total del partido ⭐ PRIORITARIO
- "Total de carreras por equipo" → carreras de UN equipo Over/Under
- "Par/Impar de carreras" → par o impar total carreras
- "Carreras por inning" → carreras en inning específico
- "Anota en la 1ª entrada" → sí/no anota en primer inning (NRFI/YRFI)
- "Equipo que anota primero" → quién anota la primera carrera

— F5 (PRIMERAS 5 ENTRADAS) —
- "Innings 1 a 5 - Ganador" → ganador F5 ⭐ MUY PREDECIBLE
- "Innings 1 a 5 - Total" → Over/Under carreras F5
- "Hándicap F5" → ventaja en primeras 5 entradas
- "Ganador de la 1ª entrada" → quién gana el primer inning

— PROPS DE LANZADOR —
- "Ponches del lanzador" → strikeouts Over/Under
- "Outs registrados por el lanzador" → outs lanzados Over/Under
- "Hits del bateador" → hits de un bateador específico
- "Jonrones" → jugador conecta HR sí/no
- "Carreras impulsadas (RBI)" → RBIs de un bateador
- "Bases totales" → bases totales de un bateador

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

MERCADOS DISPONIBLES (usa nombre exacto de Hondubet):
— RESULTADO —
- "Moneyline" → ganador directo
- "Spread / hándicap de puntos" → ventaja/desventaja puntos
- "Margen de victoria" → por cuántos puntos gana
- "Totales del partido" → Over/Under puntos totales ⭐ PRIORITARIO
- "Mitad/Final" → combinado resultado mitad y final
- "Habrá prórroga" → si va a overtime

— POR CUARTO / MITAD —
- "Ganador del cuarto" → Q1, Q2, Q3, Q4
- "Totales por cuarto" → Over/Under por cuarto ⭐
- "Total por mitad" → Over/Under 1ª o 2ª mitad
- "Hándicap por cuarto / mitad" → ventaja en cuarto o mitad
- "Ganador de cada mitad" → quién gana 1ª y 2ª mitad
- "Equipo que anota primero" → primer canasto del partido
- "Par / impar de puntos" → par o impar total

— TOTALES POR EQUIPO —
- "Total de puntos por equipo" → Over/Under de UN equipo
- "Triples anotados por equipo" → triples local o visitante
- "Total de triples del partido" → triples totales Over/Under
- "Total de asistencias" → asistencias totales
- "Robos / tapones" → total robos o tapones

— PROPS DE JUGADOR —
- "Puntos del jugador" → Over/Under puntos jugador específico
- "Rebotes del jugador" → Over/Under rebotes
- "Asistencias del jugador" → Over/Under asistencias
- "Triples anotados" → triples de un jugador Over/Under
- "Dobles-dobles / triples-dobles" → logra doble-doble sí/no
- "Combinadas P+R+A" → puntos+rebotes+asistencias combinados
- "Robos / tapones del jugador" → Over/Under robos o tapones

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

MERCADOS DISPONIBLES (usa nombre exacto de Hondubet):
— RESULTADO —
- "1x2" → resultado final (1=local, X=empate, 2=visitante)
- "Doble oportunidad" → 1X, X2 o 12
- "Empate no apuesta" → si hay empate se devuelve la apuesta
- "Hándicap asiático" → ventaja/desventaja (ej: ${local} -1.5)
- "Hándicap europeo" → hándicap de 3 vías
- "Margen de victoria" → por cuántos goles gana
- "1ª mitad - 1x2" → resultado al descanso
- "1ª mitad / doble oportunidad" → doble oportunidad 1er tiempo
- "Mitad/Final" → combinado resultado descanso y final

— GOLES —
- "Total de goles" → Over/Under total del partido (ej: Over 2.5) ⭐ PRIORITARIO
- "1ª mitad - total" → Over/Under goles 1er tiempo
- "2ª mitad - total" → Over/Under goles 2do tiempo
- "Ambos equipos marcan" → GG (sí) / NG (no)
- "Ambos equipos marcan 1ª mitad" → BTTS primer tiempo
- "Goles por equipo" → Over/Under goles de UN equipo específico
- "Par/Impar de goles" → si el total es par o impar
- "Rango de goles" → 0-1 goles, 2-3 goles, 4+ goles
- "Equipo que marca primero" → quién anota primero
- "Total de goles exacto" → número exacto de goles
- "Marcador exacto" ⛔ NO SUGERIR — probabilidad real <10%

— CORNERS —
- "Total tiros de esquina" → Over/Under corners totales (ej: Over 9.5)
- "Hándicap de córners" → ventaja de corners entre equipos
- "Primer córner" → quién saca el primer corner
- "1ª mitad - total tiros de esquina" → corners 1er tiempo
- "Total tiros de esquina Par/Impar" → par o impar corners

— TARJETAS —
- "Total de tarjetas" → Over/Under tarjetas totales
- "1ª mitad - total tarjetas" → tarjetas 1er tiempo
- "Jugador con tarjeta" → jugador específico recibe tarjeta

— JUGADORES —
- "Goleador del torneo / jugador en anotar" → jugador anota en el partido
- "Primer gol" → quién marca primero
- "Último gol" → quién marca último
- "Goleador en cualquier momento" → jugador anota en cualquier momento
- "Disparos a puerta" → tiros a puerta de un jugador o equipo
- "Asistencias del jugador" → jugador da asistencia

— ESPECIALES —
- "Portería a cero" → equipo no recibe gol
- "Penalti en el encuentro" → habrá penalti sí/no
- "Mitad con más goles" → qué mitad tiene más goles
- "Ganador de cada mitad" → quién gana cada mitad

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

  // ── MODO FREE (sin créditos) ─────────────────────────────────────────────
  const [freeMode, setFreeMode] = useState(false);
  const emptyFreeData = () => ({
    local: "", visitante: "", liga: "",
    homeGF: "", homeGA: "", awayGF: "", awayGA: "", leagueAvg: "",
    injuriesHome: "", injuriesAway: "", restHome: "", restAway: "",
    pitcherHomeERA: "", pitcherAwayERA: "", offRtgHome: "", offRtgAway: "",
    cornersHomeFor: "", cornersHomeAgainst: "", cornersAwayFor: "", cornersAwayAgainst: "",
    cardsHomeFor: "", cardsHomeAgainst: "", cardsAwayFor: "", cardsAwayAgainst: "",
    oddLocal: "", oddDraw: "", oddVisit: "",
    oddDc1x: "", oddDcx2: "", oddBtts: "", oddBttsNo: "",
    oddOver15: "", oddOver25: "", oddOver35: "", oddUnder25: "",
    oddOver75: "", oddOver85: "", oddUnder85: "", oddNrfi: "",
    oddRlHome: "", oddRlAway: "", oddTeamHomeOver: "", oddTeamAwayOver: "",
    oddF5Local: "", oddF5Visit: "", oddF5Over: "", oddF5Under: "",
    oddSpreadHome: "", oddSpreadAway: "", oddOver: "", oddUnder: "",
    oddHalfOver: "", oddHalfUnder: "", oddHalfLocal: "", oddHalfVisit: "",
    oddCornersOver85: "", oddCornersUnder85: "", oddCornersOver95: "", oddCornersUnder95: "", oddCornersOver105: "",
    oddCardsOver35: "", oddCardsUnder35: "", oddCardsOver45: "", oddCardsUnder45: "", oddCardsOver55: "",
  });
  const [freeData, setFreeData] = useState(emptyFreeData);
  const [freeResult, setFreeResult] = useState(null);
  const [pickOdds, setPickOdds] = useState({}); // { pickId: "1.85" }
  const [freeSaved, setFreeSaved] = useState(() => loadState("free_saved_v1", []));
  const setFD = (k, v) => setFreeData(d => ({ ...d, [k]: v }));

  // Modo de entrada de forma: "manual" (un promedio) o "partidos" (últimos 5 ponderados)
  const [freeInputMode, setFreeInputMode] = useState("manual");
  // Cada partido es un objeto vacío; los campos se rellenan según deporte
  const emptyMatches = () => Array.from({ length: 5 }, () => ({}));
  const [homeMatches, setHomeMatches] = useState(emptyMatches);
  const [awayMatches, setAwayMatches] = useState(emptyMatches);
  const setMatchVal = (side, idx, key, val) => {
    const setter = side === "home" ? setHomeMatches : setAwayMatches;
    setter(prev => prev.map((m, i) => i === idx ? { ...m, [key]: val } : m));
  };
  // Calcula gf/ga por partido según deporte (fútbol: directo; mlb: suma innings; nba: suma cuartos)
  const matchGoals = (m) => {
    if (activeSport === "mlb") return { gf: sumInnings(m, "for"), ga: sumInnings(m, "ag") };
    if (activeSport === "nba") return { gf: sumQuarters(m, "for"), ga: sumQuarters(m, "ag") };
    return { gf: (m.gf === "" || m.gf == null) ? null : toNum(m.gf), ga: (m.ga === "" || m.ga == null) ? null : toNum(m.ga) };
  };
  // Promedio ponderado de gf/ga normalizado para cualquier deporte
  const teamForm = (arr) => {
    const gfArr = arr.map(m => { const g = matchGoals(m).gf; return g == null ? "" : g; });
    const gaArr = arr.map(m => { const g = matchGoals(m).ga; return g == null ? "" : g; });
    const gf = weightedAvg(gfArr), ga = weightedAvg(gaArr);
    const count = arr.filter(m => { const g = matchGoals(m); return g.gf != null || g.ga != null; }).length;
    return { gf, ga, count };
  };

  const runFreeAnalysis = () => {
    if (!freeData.local.trim() || !freeData.visitante.trim()) { showToast("Ingresa ambos equipos", "error"); return; }
    let data = { ...freeData };
    if (freeInputMode === "partidos") {
      const hf = teamForm(homeMatches), af = teamForm(awayMatches);
      if (hf.gf != null) data.homeGF = String(hf.gf.toFixed(2));
      if (hf.ga != null) data.homeGA = String(hf.ga.toFixed(2));
      if (af.gf != null) data.awayGF = String(af.gf.toFixed(2));
      if (af.ga != null) data.awayGA = String(af.ga.toFixed(2));
      // Fútbol: corners y tarjetas ponderados desde los partidos
      if (activeSport === "futbol") {
        const set = (k, v) => { if (v != null) data[k] = String(v.toFixed(2)); };
        set("cornersHomeFor", formField(homeMatches, "cf")); set("cornersHomeAgainst", formField(homeMatches, "ca"));
        set("cornersAwayFor", formField(awayMatches, "cf")); set("cornersAwayAgainst", formField(awayMatches, "ca"));
        set("cardsHomeFor", formField(homeMatches, "tf")); set("cardsHomeAgainst", formField(homeMatches, "ta"));
        set("cardsAwayFor", formField(awayMatches, "tf")); set("cardsAwayAgainst", formField(awayMatches, "ta"));
      }
      if (hf.count < 3 && af.count < 3) showToast("Ingresa al menos 3 partidos para mejor precisión", "info");
    }
    const an = freeAnalyze(activeSport, data);
    const picks = freeGenPicks(an);
    const alerts = freeAlerts(activeSport, data, an);
    setPickOdds({}); // limpiar cuotas previas
    setFreeResult({ analysis: an, picks, alerts, usedData: data });
    showToast(`✅ ${picks.length} mejores picks por estadística`, "success");
  };

  // Guardar análisis FREE (equipos + modo)
  const saveFreeAnalysis = () => {
    if (!freeResult) return;
    const entry = {
      id: makeId(),
      fecha: new Date().toISOString(),
      partido: `${freeData.local} vs ${freeData.visitante}`,
      liga: freeData.liga || "",
      deporte: activeSport,
      modo: "FREE",
      expected: freeResult.analysis.expected,
      expLabel: freeResult.analysis.expLabel,
      picks: freeResult.picks.map(pk => {
        const odd = pickOdds[pk.id] || "";
        const withOdd = odd ? freePickWithOdd(pk, odd, toNum(bankroll.inicial) || 0) : pk;
        return { mercado: pk.mercado, probReal: pk.probReal, tier: pk.tier, reliability: pk.reliability, odd, value: withOdd.value ?? null, roi: withOdd.roi ?? null };
      }),
    };
    setFreeSaved(prev => [entry, ...prev]);
    showToast("💾 Análisis guardado", "success");
  };

  useEffect(() => { saveState(BK, bankroll); }, [bankroll]);
  useEffect(() => { saveState(HK, historial); }, [historial]);
  useEffect(() => { saveState(RK, reviews); }, [reviews]);
  useEffect(() => { saveState(JK, jornadas); }, [jornadas]);
  useEffect(() => { saveState(FK, favoritos); }, [favoritos]);
  useEffect(() => { saveState("daily_loss_limit_v1", dailyLossLimit); }, [dailyLossLimit]);
  useEffect(() => { saveState("free_saved_v1", freeSaved); }, [freeSaved]);

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
        if (Array.isArray(data.freeSaved)) setFreeSaved(data.freeSaved);
        if (data.aiResult) { setAiResult(data.aiResult); setAiStatus("done"); }
        else { setAiResult(null); setAiStatus("idle"); }
        setActiveTab("analisis");
        showToast("✅ Datos importados correctamente", "success");
      } catch { showToast("❌ Archivo inválido", "error"); }
    };
    reader.readAsText(file);
  };

  const exportData = () => {
    const data = { match, picks, bankroll, historial, reviews, jornadas, favoritos, freeSaved, aiResult, activeSport, exportedAt: new Date().toISOString() };
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
    ...(freeMode ? [{ id: "free", label: "🆓 FREE" }] : []),
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
              <button onClick={() => { setFreeMode(v => { const nv = !v; if (nv) setActiveTab("free"); return nv; }); }}
                style={{ fontSize: isMobile ? 14 : 11, padding: isMobile ? "5px 7px" : "4px 10px", borderRadius: 20, border: `1px solid ${freeMode ? "rgba(52,211,153,.5)" : "rgba(255,255,255,.08)"}`, background: freeMode ? "rgba(52,211,153,.12)" : "transparent", color: freeMode ? "#34d399" : "#475569", cursor: "pointer", fontWeight: 700 }}>
                {isMobile ? "🆓" : `🆓 ${freeMode ? "FREE ON" : "Modo FREE"}`}
              </button>
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

      {/* Free mode banner */}
      {freeMode && (
        <div style={{ background: "linear-gradient(90deg, rgba(52,211,153,.1), rgba(16,185,129,.05), rgba(52,211,153,.1))", borderBottom: "1px solid rgba(52,211,153,.15)", padding: "7px 16px", textAlign: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#34d399" }}>🆓 MODO FREE — Análisis 100% local con modelos matemáticos · Sin gastar créditos · Tú ingresas los datos en la pestaña "🆓 FREE"</span>
        </div>
      )}

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

            {/* ── RESUMEN DE APUESTAS INDIVIDUALES (incluye FREE) ──────────────── */}
            {(() => {
              const indiv = historial.filter(b => b.pick && (b.estado === "ganada" || b.estado === "perdida" || b.estado === "pendiente"));
              if (!indiv.length) return null;
              const st = historialStats(indiv);
              const pendientes = indiv.filter(b => b.estado === "pendiente");
              const cardStat = (label, val, color) => (
                <div style={{ flex: "1 1 90px", textAlign: "center", background: "rgba(15,23,42,.6)", borderRadius: 12, padding: "10px 8px" }}>
                  <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color }}>{val}</div>
                </div>
              );
              return (
                <div style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(52,211,153,.18)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#34d399", textTransform: "uppercase" }}>🎯 Tus picks individuales (FREE + manuales)</div>
                    <span style={{ fontSize: 10, color: "#475569" }}>{st.totalBets} resueltas · {pendientes.length} pendientes</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {cardStat("Win Rate", fmtPct(st.winRate), st.winRate >= 55 ? "#34d399" : st.winRate >= 45 ? "#fbbf24" : "#f87171")}
                    {cardStat("ROI", `${st.roi >= 0 ? "+" : ""}${st.roi.toFixed(1)}%`, st.roi >= 0 ? "#34d399" : "#f87171")}
                    {cardStat("Yield", `${st.yield >= 0 ? "+" : ""}$${fmtMoney(st.yield)}`, st.yield >= 0 ? "#34d399" : "#f87171")}
                    {cardStat("Profit", `${st.profit >= 0 ? "+" : ""}$${fmtMoney(st.profit)}`, st.profit >= 0 ? "#34d399" : "#f87171")}
                    {cardStat("Aciertos", `${st.wins}/${st.totalBets}`, "#a5b4fc")}
                  </div>
                  {/* Profit por deporte */}
                  {Object.keys(st.porDeporte).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                      {Object.entries(st.porDeporte).map(([sp, pr]) => (
                        <span key={sp} style={{ fontSize: 10, background: pr >= 0 ? "rgba(52,211,153,.1)" : "rgba(239,68,68,.1)", color: pr >= 0 ? "#6ee7b7" : "#f87171", padding: "3px 9px", borderRadius: 7, fontWeight: 700 }}>
                          {SPORTS[sp]?.emoji || "🎲"} {SPORTS[sp]?.label?.split(" ")[1] || sp}: {pr >= 0 ? "+" : ""}${fmtMoney(pr)}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Lista de apuestas individuales con marcado de resultado */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {indiv.slice(0, 30).map(b => (
                      <div key={b.id} style={{ background: "rgba(2,8,23,.4)", borderRadius: 10, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#e0e7ff" }}>{b.pick} <span style={{ fontSize: 10, color: "#475569" }}>@ {b.cuota}</span></div>
                          <div style={{ fontSize: 10, color: "#475569" }}>{b.partido} · {SPORTS[b.deporte]?.emoji || ""}</div>
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          {["ganada", "perdida"].map(r => (
                            <button key={r} onClick={() => setHistorial(prev => prev.map(x => x.id === b.id ? { ...x, estado: x.estado === r ? "pendiente" : r } : x))}
                              style={{ fontSize: 10, padding: "4px 8px", borderRadius: 7, border: `1px solid ${b.estado === r ? (r === "ganada" ? "rgba(52,211,153,.5)" : "rgba(239,68,68,.5)") : "rgba(255,255,255,.08)"}`, background: b.estado === r ? (r === "ganada" ? "rgba(52,211,153,.15)" : "rgba(239,68,68,.15)") : "transparent", color: b.estado === r ? (r === "ganada" ? "#34d399" : "#f87171") : "#475569", cursor: "pointer", fontWeight: 800 }}>
                              {r === "ganada" ? "✓" : "✗"}
                            </button>
                          ))}
                          <button onClick={() => { if (confirm("¿Eliminar?")) setHistorial(prev => prev.filter(x => x.id !== b.id)); }} style={{ fontSize: 11, color: "#334155", background: "none", border: "none", cursor: "pointer" }}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

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
            {historial.filter(t => t.picks && t.picks.length).length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#334155" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
                <div style={{ fontWeight: 700, color: "#475569" }}>Sin tickets combinados guardados</div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Tus picks individuales aparecen en el resumen de arriba.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {historial.filter(t => t.picks && t.picks.length).map(ticket => (
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

        {/* ── TAB: FREE (MOTOR LOCAL SIN CRÉDITOS) ─────────────────────────── */}
        {activeTab === "free" && freeMode && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#34d399", textTransform: "uppercase", marginBottom: 2 }}>Motor local · 0 créditos</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", margin: 0 }}>🆓 Análisis FREE — {sport.label}</h2>
              <p style={{ fontSize: 13, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>
                Ingresa los 10 datos críticos y el motor calcula probabilidad real, value (EV), confianza A+/A/B/C/D y stake Kelly — todo con matemáticas, sin internet ni IA. Modelo: {activeSport === "futbol" ? "Poisson sobre goles esperados" : activeSport === "mlb" ? "carreras esperadas + ERA de abridores" : "puntos esperados + diferencia de rating"}.
              </p>
            </div>

            {/* Accesos rápidos FREE */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
              <button onClick={() => setActiveTab("bankroll")} style={{ fontSize: 11, padding: "7px 13px", borderRadius: 10, border: "1px solid rgba(52,211,153,.25)", background: "rgba(52,211,153,.07)", color: "#6ee7b7", cursor: "pointer", fontWeight: 700 }}>💼 Bankroll (para Kelly)</button>
              <button onClick={() => setActiveTab("historial")} style={{ fontSize: 11, padding: "7px 13px", borderRadius: 10, border: "1px solid rgba(56,189,248,.25)", background: "rgba(56,189,248,.07)", color: "#7dd3fc", cursor: "pointer", fontWeight: 700 }}>📚 Historial (ROI/Win Rate)</button>
              <button onClick={() => setActiveTab("ticket")} style={{ fontSize: 11, padding: "7px 13px", borderRadius: 10, border: "1px solid rgba(99,102,241,.25)", background: "rgba(99,102,241,.07)", color: "#a5b4fc", cursor: "pointer", fontWeight: 700 }}>🧾 Ticket</button>
              <button onClick={exportData} style={{ fontSize: 11, padding: "7px 13px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontWeight: 700 }}>⬇ Exportar todo</button>
              <button onClick={() => importRef.current?.click()} style={{ fontSize: 11, padding: "7px 13px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontWeight: 700 }}>📂 Importar</button>
            </div>

            {/* Equipos */}
            <div style={{ background: "rgba(30,27,75,.35)", border: "1px solid rgba(52,211,153,.15)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#34d399", marginBottom: 12 }}>① Partido</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <div><label style={labelStyle}>🏠 Local</label><input value={freeData.local} onChange={e => setFD("local", e.target.value)} placeholder={activeSport === "mlb" ? "Yankees" : activeSport === "nba" ? "Lakers" : "Real Madrid"} style={inputStyle} /></div>
                <div><label style={labelStyle}>✈️ Visitante</label><input value={freeData.visitante} onChange={e => setFD("visitante", e.target.value)} placeholder={activeSport === "mlb" ? "Dodgers" : activeSport === "nba" ? "Celtics" : "Barcelona"} style={inputStyle} /></div>
                <div><label style={labelStyle}>🏆 Liga (opcional)</label><input value={freeData.liga} onChange={e => setFD("liga", e.target.value)} placeholder="La Liga" style={inputStyle} /></div>
              </div>
            </div>

            {/* Datos críticos por deporte */}
            <div style={{ background: "rgba(30,27,75,.35)", border: "1px solid rgba(52,211,153,.15)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#34d399" }}>② Forma reciente</div>
                <div style={{ display: "flex", gap: 4, background: "rgba(15,23,42,.6)", borderRadius: 10, padding: 3 }}>
                  <button onClick={() => setFreeInputMode("manual")} style={{ fontSize: 11, padding: "5px 11px", borderRadius: 8, border: "none", background: freeInputMode === "manual" ? "rgba(52,211,153,.18)" : "transparent", color: freeInputMode === "manual" ? "#34d399" : "#64748b", cursor: "pointer", fontWeight: 700 }}>Promedio a mano</button>
                  <button onClick={() => setFreeInputMode("partidos")} style={{ fontSize: 11, padding: "5px 11px", borderRadius: 8, border: "none", background: freeInputMode === "partidos" ? "rgba(52,211,153,.18)" : "transparent", color: freeInputMode === "partidos" ? "#34d399" : "#64748b", cursor: "pointer", fontWeight: 700 }}>Últimos 5 partidos</button>
                </div>
              </div>

              {freeInputMode === "manual" ? (
                <>
                  <p style={{ fontSize: 11, color: "#475569", margin: "0 0 12px" }}>Promedio POR PARTIDO. Ej: si en 5 partidos anotó 8 goles, pon 1.6.</p>
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                    <div><label style={labelStyle}>🏠 {activeSport === "mlb" ? "Carreras anotadas" : activeSport === "nba" ? "Puntos anotados" : "Goles a favor"}</label><input type="number" value={freeData.homeGF} onChange={e => setFD("homeGF", e.target.value)} placeholder={activeSport === "nba" ? "114" : activeSport === "mlb" ? "4.8" : "1.8"} style={inputStyle} /></div>
                    <div><label style={labelStyle}>🏠 {activeSport === "mlb" ? "Carreras recibidas" : activeSport === "nba" ? "Puntos recibidos" : "Goles en contra"}</label><input type="number" value={freeData.homeGA} onChange={e => setFD("homeGA", e.target.value)} placeholder={activeSport === "nba" ? "108" : activeSport === "mlb" ? "3.9" : "0.9"} style={inputStyle} /></div>
                    <div><label style={labelStyle}>✈️ {activeSport === "mlb" ? "Carreras anotadas" : activeSport === "nba" ? "Puntos anotados" : "Goles a favor"}</label><input type="number" value={freeData.awayGF} onChange={e => setFD("awayGF", e.target.value)} placeholder={activeSport === "nba" ? "110" : activeSport === "mlb" ? "4.2" : "1.3"} style={inputStyle} /></div>
                    <div><label style={labelStyle}>✈️ {activeSport === "mlb" ? "Carreras recibidas" : activeSport === "nba" ? "Puntos recibidos" : "Goles en contra"}</label><input type="number" value={freeData.awayGA} onChange={e => setFD("awayGA", e.target.value)} placeholder={activeSport === "nba" ? "112" : activeSport === "mlb" ? "4.5" : "1.4"} style={inputStyle} /></div>
                    {activeSport === "futbol" && <div><label style={labelStyle}>📊 Media liga (opcional)</label><input type="number" value={freeData.leagueAvg} onChange={e => setFD("leagueAvg", e.target.value)} placeholder="1.35" style={inputStyle} /></div>}
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 11, color: "#475569", margin: "0 0 12px", lineHeight: 1.5 }}>
                    Del más reciente (P1 ⭐) al más antiguo (P5). El motor pondera: <b style={{ color: "#6ee7b7" }}>P1 pesa 5×, P5 pesa 1×</b>.
                    {activeSport === "futbol" && " Cada partido: goles, corners y tarjetas (a favor / en contra)."}
                    {activeSport === "mlb" && " Carreras por inning (1-9). El total se suma solo."}
                    {activeSport === "nba" && " Puntos por cuarto (Q1-Q4). El total se suma solo."}
                  </p>
                  {[{ side: "home", label: `🏠 ${freeData.local || "Local"}`, arr: homeMatches }, { side: "away", label: `✈️ ${freeData.visitante || "Visitante"}`, arr: awayMatches }].map(team => (
                    <div key={team.side} style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#7dd3fc", marginBottom: 8 }}>{team.label}</div>

                      {/* FÚTBOL: goles + corners + tarjetas por partido */}
                      {activeSport === "futbol" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "28px repeat(6, 1fr)", gap: 5, alignItems: "center", fontSize: 8, color: "#475569", fontWeight: 800, textTransform: "uppercase" }}>
                            <div></div><div>⚽ GF</div><div>⚽ GC</div><div>⛳ CF</div><div>⛳ CC</div><div>🟨 TF</div><div>🟨 TC</div>
                          </div>
                          {team.arr.map((m, i) => (
                            <div key={i} style={{ display: "grid", gridTemplateColumns: "28px repeat(6, 1fr)", gap: 5, alignItems: "center" }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: i === 0 ? "#34d399" : "#64748b" }}>P{i + 1}</div>
                              {["gf", "ga", "cf", "ca", "tf", "ta"].map(k => (
                                <input key={k} type="number" value={m[k] || ""} onChange={e => setMatchVal(team.side, i, k, e.target.value)} placeholder="0" style={{ ...inputStyle, padding: "6px 4px", fontSize: 12, textAlign: "center" }} />
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* MLB: 9 innings por lado */}
                      {activeSport === "mlb" && (
                        <div style={{ overflowX: "auto" }}>
                          {[{ pfx: "for", lab: "Anotó", col: "#34d399" }, { pfx: "ag", lab: "Recibió", col: "#f87171" }].map(row => (
                            <div key={row.pfx} style={{ marginBottom: 6 }}>
                              <div style={{ fontSize: 9, fontWeight: 800, color: row.col, marginBottom: 3 }}>{row.lab} (carreras por inning)</div>
                              <div style={{ display: "grid", gridTemplateColumns: "28px repeat(9, 1fr)", gap: 4, alignItems: "center", minWidth: 420 }}>
                                <div style={{ fontSize: 8, color: "#475569", fontWeight: 800 }}></div>
                                {[1,2,3,4,5,6,7,8,9].map(n => <div key={n} style={{ fontSize: 8, color: "#475569", fontWeight: 800, textAlign: "center" }}>{n}</div>)}
                                {team.arr.map((m, i) => (
                                  <Fragment key={i}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: i === 0 ? "#34d399" : "#64748b" }}>P{i + 1}</div>
                                    {[1,2,3,4,5,6,7,8,9].map(n => (
                                      <input key={n} type="number" value={m[`${row.pfx}${n}`] || ""} onChange={e => setMatchVal(team.side, i, `${row.pfx}${n}`, e.target.value)} placeholder="0" style={{ ...inputStyle, padding: "5px 2px", fontSize: 11, textAlign: "center" }} />
                                    ))}
                                  </Fragment>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* NBA: 4 cuartos por lado */}
                      {activeSport === "nba" && (
                        <div>
                          {[{ pfx: "for", lab: "Anotó", col: "#34d399" }, { pfx: "ag", lab: "Recibió", col: "#f87171" }].map(row => (
                            <div key={row.pfx} style={{ marginBottom: 6 }}>
                              <div style={{ fontSize: 9, fontWeight: 800, color: row.col, marginBottom: 3 }}>{row.lab} (puntos por cuarto)</div>
                              <div style={{ display: "grid", gridTemplateColumns: "28px repeat(4, 1fr)", gap: 5, alignItems: "center" }}>
                                <div></div>
                                {[1,2,3,4].map(q => <div key={q} style={{ fontSize: 9, color: "#475569", fontWeight: 800, textAlign: "center" }}>Q{q}</div>)}
                                {team.arr.map((m, i) => (
                                  <Fragment key={i}>
                                    <div style={{ fontSize: 10, fontWeight: 800, color: i === 0 ? "#34d399" : "#64748b" }}>P{i + 1}</div>
                                    {[1,2,3,4].map(q => (
                                      <input key={q} type="number" value={m[`${row.pfx}q${q}`] || ""} onChange={e => setMatchVal(team.side, i, `${row.pfx}q${q}`, e.target.value)} placeholder="28" style={{ ...inputStyle, padding: "6px 4px", fontSize: 12, textAlign: "center" }} />
                                    ))}
                                  </Fragment>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {(() => {
                        const f = teamForm(team.arr);
                        if (f.gf == null && f.ga == null) return null;
                        return <div style={{ fontSize: 10, color: "#6ee7b7", marginTop: 8, background: "rgba(52,211,153,.06)", padding: "6px 10px", borderRadius: 8 }}>📊 Promedio ponderado → {activeSport === "mlb" ? "carreras" : activeSport === "nba" ? "puntos" : "goles"} a favor: <b>{f.gf != null ? f.gf.toFixed(2) : "—"}</b> · en contra: <b>{f.ga != null ? f.ga.toFixed(2) : "—"}</b></div>;
                      })()}
                    </div>
                  ))}
                  {activeSport === "futbol" && <div style={{ maxWidth: 200 }}><label style={labelStyle}>📊 Media liga (opcional)</label><input type="number" value={freeData.leagueAvg} onChange={e => setFD("leagueAvg", e.target.value)} placeholder="1.35" style={inputStyle} /></div>}
                </>
              )}
            </div>

            {/* Lesiones, fatiga y avanzados */}
            <div style={{ background: "rgba(30,27,75,.35)", border: "1px solid rgba(52,211,153,.15)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#34d399", marginBottom: 12 }}>③ Lesiones, descanso {activeSport === "mlb" ? "y ERA pitchers" : activeSport === "nba" ? "y rating" : "y avanzados"}</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <div><label style={labelStyle}>🏠 Bajas clave (nº)</label><input type="number" value={freeData.injuriesHome} onChange={e => setFD("injuriesHome", e.target.value)} placeholder="0" style={inputStyle} /></div>
                <div><label style={labelStyle}>✈️ Bajas clave (nº)</label><input type="number" value={freeData.injuriesAway} onChange={e => setFD("injuriesAway", e.target.value)} placeholder="2" style={inputStyle} /></div>
                <div><label style={labelStyle}>🏠 Días descanso</label><input type="number" value={freeData.restHome} onChange={e => setFD("restHome", e.target.value)} placeholder={activeSport === "nba" ? "0 = back-to-back" : "3"} style={inputStyle} /></div>
                <div><label style={labelStyle}>✈️ Días descanso</label><input type="number" value={freeData.restAway} onChange={e => setFD("restAway", e.target.value)} placeholder="3" style={inputStyle} /></div>
                {activeSport === "mlb" && <>
                  <div><label style={labelStyle}>🏠 ERA abridor</label><input type="number" value={freeData.pitcherHomeERA} onChange={e => setFD("pitcherHomeERA", e.target.value)} placeholder="3.20" style={inputStyle} /></div>
                  <div><label style={labelStyle}>✈️ ERA abridor</label><input type="number" value={freeData.pitcherAwayERA} onChange={e => setFD("pitcherAwayERA", e.target.value)} placeholder="4.80" style={inputStyle} /></div>
                </>}
                {activeSport === "nba" && <>
                  <div><label style={labelStyle}>🏠 Off. Rating (opc)</label><input type="number" value={freeData.offRtgHome} onChange={e => setFD("offRtgHome", e.target.value)} placeholder="116" style={inputStyle} /></div>
                  <div><label style={labelStyle}>✈️ Off. Rating (opc)</label><input type="number" value={freeData.offRtgAway} onChange={e => setFD("offRtgAway", e.target.value)} placeholder="112" style={inputStyle} /></div>
                </>}
              </div>
            </div>

            {/* Corners y tarjetas (solo fútbol, solo en modo manual) */}
            {activeSport === "futbol" && freeInputMode === "manual" && (
              <div style={{ background: "rgba(30,27,75,.35)", border: "1px solid rgba(52,211,153,.15)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#34d399", marginBottom: 4 }}>③·b Corners y tarjetas (promedio últimos 5, opcional)</div>
                <p style={{ fontSize: 11, color: "#475569", margin: "0 0 12px" }}>"A favor" = los que genera el equipo. "En contra" = los que le genera el rival. Déjalos vacíos si no quieres esos mercados.</p>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#7dd3fc", margin: "0 0 8px" }}>⛳ Corners</div>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 14 }}>
                  <div><label style={labelStyle}>🏠 Corners a favor</label><input type="number" value={freeData.cornersHomeFor} onChange={e => setFD("cornersHomeFor", e.target.value)} placeholder="5.4" style={inputStyle} /></div>
                  <div><label style={labelStyle}>🏠 Corners en contra</label><input type="number" value={freeData.cornersHomeAgainst} onChange={e => setFD("cornersHomeAgainst", e.target.value)} placeholder="4.2" style={inputStyle} /></div>
                  <div><label style={labelStyle}>✈️ Corners a favor</label><input type="number" value={freeData.cornersAwayFor} onChange={e => setFD("cornersAwayFor", e.target.value)} placeholder="4.8" style={inputStyle} /></div>
                  <div><label style={labelStyle}>✈️ Corners en contra</label><input type="number" value={freeData.cornersAwayAgainst} onChange={e => setFD("cornersAwayAgainst", e.target.value)} placeholder="5.1" style={inputStyle} /></div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#fcd34d", margin: "0 0 8px" }}>🟨 Tarjetas</div>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                  <div><label style={labelStyle}>🏠 Tarjetas a favor</label><input type="number" value={freeData.cardsHomeFor} onChange={e => setFD("cardsHomeFor", e.target.value)} placeholder="2.0" style={inputStyle} /></div>
                  <div><label style={labelStyle}>🏠 Tarjetas en contra</label><input type="number" value={freeData.cardsHomeAgainst} onChange={e => setFD("cardsHomeAgainst", e.target.value)} placeholder="1.8" style={inputStyle} /></div>
                  <div><label style={labelStyle}>✈️ Tarjetas a favor</label><input type="number" value={freeData.cardsAwayFor} onChange={e => setFD("cardsAwayFor", e.target.value)} placeholder="2.4" style={inputStyle} /></div>
                  <div><label style={labelStyle}>✈️ Tarjetas en contra</label><input type="number" value={freeData.cardsAwayAgainst} onChange={e => setFD("cardsAwayAgainst", e.target.value)} placeholder="2.1" style={inputStyle} /></div>
                </div>
              </div>
            )}

            <button onClick={runFreeAnalysis} style={{ width: "100%", padding: 15, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #059669, #047857)", color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 20px rgba(5,150,105,.3)", marginBottom: 24 }}>
              🧮 Analizar y sugerir mejores picks (0 créditos)
            </button>

            {/* RESULTADOS */}
            {freeResult && (
              <div>
                {/* Probabilidades reales */}
                <div style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(52,211,153,.2)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#34d399", marginBottom: 12 }}>📊 Probabilidad Real (modelo matemático)</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                    <div style={{ flex: "1 1 100px", textAlign: "center", background: "rgba(52,211,153,.08)", borderRadius: 12, padding: "10px 8px" }}>
                      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>{freeResult.analysis.expLabel}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "#e0e7ff" }}>{freeResult.analysis.expected}</div>
                    </div>
                    <div style={{ flex: "1 1 100px", textAlign: "center", background: "rgba(52,211,153,.08)", borderRadius: 12, padding: "10px 8px" }}>
                      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>Marcador probable</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "#e0e7ff" }}>{freeResult.analysis.mostLikely}</div>
                    </div>
                    {freeResult.analysis.cornersTotal && (
                      <div style={{ flex: "1 1 100px", textAlign: "center", background: "rgba(56,189,248,.08)", borderRadius: 12, padding: "10px 8px" }}>
                        <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>⛳ Corners esp.</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: "#7dd3fc" }}>{freeResult.analysis.cornersTotal}</div>
                      </div>
                    )}
                    {freeResult.analysis.cardsTotal && (
                      <div style={{ flex: "1 1 100px", textAlign: "center", background: "rgba(251,191,36,.08)", borderRadius: 12, padding: "10px 8px" }}>
                        <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>🟨 Tarjetas esp.</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: "#fcd34d" }}>{freeResult.analysis.cardsTotal}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: activeSport === "futbol" ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
                    <div style={{ textAlign: "center", padding: "8px", background: "rgba(15,23,42,.6)", borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: "#64748b" }}>🏠 {freeData.local || "Local"}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#34d399" }}>{fmtPct(freeResult.analysis.probs.local)}</div>
                    </div>
                    {activeSport === "futbol" && <div style={{ textAlign: "center", padding: "8px", background: "rgba(15,23,42,.6)", borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: "#64748b" }}>🤝 Empate</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#fbbf24" }}>{fmtPct(freeResult.analysis.probs.empate)}</div>
                    </div>}
                    <div style={{ textAlign: "center", padding: "8px", background: "rgba(15,23,42,.6)", borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: "#64748b" }}>✈️ {freeData.visitante || "Visit."}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#60a5fa" }}>{fmtPct(freeResult.analysis.probs.visitante)}</div>
                    </div>
                  </div>
                </div>

                {/* Avisos de criterio */}
                {freeResult.alerts && freeResult.alerts.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#fbbf24", marginBottom: 8 }}>🧠 Avisos del motor</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {freeResult.alerts.map((al, i) => (
                        <div key={i} style={{ background: al.tipo === "warn" ? "rgba(239,68,68,.07)" : "rgba(99,102,241,.07)", border: `1px solid ${al.tipo === "warn" ? "rgba(239,68,68,.2)" : "rgba(99,102,241,.2)"}`, borderRadius: 12, padding: "10px 14px", fontSize: 12, color: al.tipo === "warn" ? "#fca5a5" : "#a5b4fc", lineHeight: 1.5 }}>
                          {al.txt}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Picks sugeridos por estadística */}
                <div style={{ fontSize: 13, fontWeight: 900, color: "#e0e7ff", marginBottom: 4 }}>🎯 Mejores {freeResult.picks.length} picks (por estadística + fiabilidad)</div>
                <p style={{ fontSize: 11, color: "#475569", margin: "0 0 8px", lineHeight: 1.5 }}>Ordenados por probabilidad + value. <b style={{ color: "#6ee7b7" }}>Mete la cuota</b> en cada uno que te interese: los de mejor value subirán automáticamente al inicio.</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, fontSize: 10, color: "#64748b" }}>
                  <span>🟢 Fiabilidad alta (totales)</span><span>🟡 Media (ganador, corners)</span><span>🔴 Baja (tarjetas, 1ª mitad)</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...freeResult.picks].sort((a, b) => {
                    // Mezcla probabilidad + value. Si hay cuota, value cuenta fuerte; si no, solo probabilidad.
                    const rank = (pk) => {
                      const od = pickOdds[pk.id];
                      if (od && toNum(od) > 1) {
                        const e = freePickWithOdd(pk, od, 0);
                        // 60% probabilidad + 40% value (escalado), value puede ser negativo
                        return pk.probReal * 0.6 + (e.value || 0) * 2.0;
                      }
                      return pk.probReal * 0.6; // sin cuota: solo su probabilidad (queda detrás de los que tienen value)
                    };
                    return rank(b) - rank(a);
                  }).map(pk => {
                    const oddStr = pickOdds[pk.id] || "";
                    const ev = oddStr ? freePickWithOdd(pk, oddStr, toNum(bankroll.inicial) || 0) : null;
                    const hasOdd = ev && ev.hasOdd;
                    const cVal = hasOdd ? (ev.color === "green" ? "#34d399" : ev.color === "yellow" ? "#fbbf24" : "#f87171") : "#475569";
                    return (
                      <div key={pk.id} style={{ background: "rgba(15,23,42,.55)", border: `1px solid ${hasOdd && ev.hasValue ? "rgba(52,211,153,.35)" : "rgba(255,255,255,.06)"}`, borderRadius: 14, padding: "14px 16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: pk.tierColor + "22", border: `1.5px solid ${pk.tierColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: pk.tierColor, flexShrink: 0 }}>{pk.tier}</div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: "#e0e7ff", display: "flex", alignItems: "center", gap: 6 }}>
                                {pk.mercado}
                                {pk.relMeta && <span title={pk.relMeta.txt} style={{ fontSize: 10 }}>{pk.relMeta.dot}</span>}
                              </div>
                              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>Prob. {fmtPct(pk.probReal)} · {pk.tierLabel} · {pk.relMeta?.label}</div>
                            </div>
                          </div>
                          {/* Casilla de cuota inline */}
                          <div style={{ flexShrink: 0, width: 90 }}>
                            <label style={{ fontSize: 9, color: "#64748b", fontWeight: 700, display: "block", marginBottom: 2, textAlign: "right" }}>Cuota casa</label>
                            <input type="number" value={oddStr} onChange={e => setPickOdds(prev => ({ ...prev, [pk.id]: e.target.value }))}
                              placeholder="1.90" style={{ ...inputStyle, padding: "7px 10px", textAlign: "center", fontWeight: 800 }} />
                          </div>
                        </div>

                        {/* Value solo cuando hay cuota */}
                        {hasOdd ? (
                          <>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, background: cVal + "1a", color: cVal, padding: "3px 9px", borderRadius: 7, fontWeight: 800 }}>{ev.valueLabel} ({ev.value >= 0 ? "+" : ""}{ev.value.toFixed(1)} pts)</span>
                              <span style={{ fontSize: 10, background: "rgba(99,102,241,.1)", color: "#a5b4fc", padding: "3px 9px", borderRadius: 7, fontWeight: 700 }}>Implícita {fmtPct(ev.implied)}</span>
                              <span style={{ fontSize: 10, background: ev.roi >= 0 ? "rgba(52,211,153,.1)" : "rgba(239,68,68,.1)", color: ev.roi >= 0 ? "#6ee7b7" : "#f87171", padding: "3px 9px", borderRadius: 7, fontWeight: 700 }}>EV {ev.roi >= 0 ? "+" : ""}{ev.roi.toFixed(1)}%</span>
                              {ev.kelly && ev.kelly.tier !== "none" && <span style={{ fontSize: 10, background: "rgba(251,191,36,.1)", color: "#fcd34d", padding: "3px 9px", borderRadius: 7, fontWeight: 700 }}>💰 {ev.kelly.label}</span>}
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                              <button onClick={() => {
                                setHistorial(prev => [{ ...emptyBet(), partido: `${freeData.local} vs ${freeData.visitante}`, pick: pk.mercado, mercado: pk.mercado, cuota: toNum(oddStr).toFixed(2), stake: "10", deporte: activeSport, notas: `FREE · prob ${fmtPct(pk.probReal)} · EV ${ev.roi.toFixed(1)}%` }, ...prev]);
                                showToast("Pick agregado al historial", "success");
                              }} style={{ fontSize: 11, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(52,211,153,.3)", background: "rgba(52,211,153,.08)", color: "#34d399", cursor: "pointer", fontWeight: 700 }}>
                                ➕ Guardar en Historial
                              </button>
                              <button onClick={() => {
                                const exists = picks.some(p => p.mercado === pk.mercado && p.cuotaCasa === toNum(oddStr).toFixed(2) && p._free);
                                if (exists) { showToast("Ese pick ya está en el ticket", "info"); return; }
                                setPicks(prev => [...prev, {
                                  ...emptyPick(), id: makeId(), mercado: pk.mercado,
                                  confianza: pk.probReal, cuotaCasa: toNum(oddStr).toFixed(2),
                                  cuotaSugerida: toNum(oddStr).toFixed(2), seleccionado: true,
                                  justificacion: `FREE · prob ${fmtPct(pk.probReal)} · EV ${ev.roi.toFixed(1)}%`,
                                  value: ev.value, ev: ev.ev, roi: ev.roi, _free: true,
                                }]);
                                showToast("📥 Enviado al Ticket", "success");
                              }} style={{ fontSize: 11, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(99,102,241,.3)", background: "rgba(99,102,241,.08)", color: "#a5b4fc", cursor: "pointer", fontWeight: 700 }}>
                                🧾 Enviar al Ticket
                              </button>
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}>Mete la cuota para ver el value y EV de este pick.</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Guardar análisis */}
                <button onClick={saveFreeAnalysis} style={{ width: "100%", marginTop: 16, padding: 13, borderRadius: 12, border: "1px solid rgba(99,102,241,.4)", background: "rgba(99,102,241,.12)", color: "#a5b4fc", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>
                  💾 Guardar análisis ({freeData.local || "Local"} vs {freeData.visitante || "Visit."} · FREE)
                </button>

                {/* Análisis guardados */}
                {freeSaved.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>Análisis guardados ({freeSaved.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {freeSaved.slice(0, 10).map(s => (
                        <div key={s.id} style={{ background: "rgba(15,23,42,.5)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#e0e7ff" }}>{s.partido}</div>
                            <div style={{ fontSize: 10, color: "#475569" }}>
                              <span style={{ background: s.modo === "FREE" ? "rgba(52,211,153,.15)" : "rgba(251,191,36,.15)", color: s.modo === "FREE" ? "#34d399" : "#fbbf24", padding: "1px 6px", borderRadius: 5, fontWeight: 800 }}>{s.modo}</span>
                              {" · "}{SPORTS[s.deporte]?.label || s.deporte}{" · "}{new Date(s.fecha).toLocaleDateString()}{" · "}{s.picks.length} picks
                            </div>
                          </div>
                          <button onClick={() => { if (confirm("¿Eliminar este análisis guardado?")) setFreeSaved(prev => prev.filter(x => x.id !== s.id)); }}
                            style={{ fontSize: 12, color: "#475569", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>🗑</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 18, padding: "12px 16px", background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.15)", borderRadius: 12 }}>
                  <p style={{ fontSize: 11, color: "#64748b", margin: 0, lineHeight: 1.6 }}>
                    ℹ️ Análisis 100% local y estadístico. Estos son los picks con mejor probabilidad y fiabilidad; el value depende de la cuota que ofrezca tu casa. Cuando recargues créditos, apaga el Modo FREE y vuelve a la IA con búsqueda web.
                  </p>
                </div>
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
