"use client";
import React, { useState, useMemo, useEffect } from "react";

type TeamSide = "local" | "visitante" | "h2h" | "ambos";

type Indicator = {
  id: string;
  team: TeamSide;
  market: string;
  line: string;
  record: string;
};

type Match = {
  local: string;
  visitante: string;
  oddLocal: string;
  oddDraw: string;
  oddVisit: string;
};



const MARKET_OPTIONS = [
  { label: "Sin derrotas", value: "sin_derrotas" },
  { label: "Sin victorias", value: "sin_victorias" },
  { label: "Más de 2.5 goles", value: "over_2_5", line: "2.5" },
  { label: "Más de 1.5 goles", value: "over_1_5", line: "1.5" },
  { label: "Menos de 2.5 goles", value: "under_2_5", line: "2.5" },
  { label: "Menos de 4.5 goles", value: "under_4_5", line: "4.5" },
  { label: "Más de 5.5 corners", value: "over_5_5", line: "5.5" },
  { label: "Más de 6.5 corners", value: "over_6_5", line: "6.5" },
  { label: "Menos de 10.5 corners", value: "under_10_5", line: "10.5" },
  { label: "Menos de 14.5 corners", value: "under_14_5", line: "14.5" },
  { label: "Ambos marcan", value: "btts", line: "SI" },
  { label: "Más de 2.5 tarjetas", value: "over_2_5_cards", line: "2.5" },
  { label: "Más de 4.5 tarjetas", value: "over_4_5_cards", line: "4.5" },
  { label: "Menos de 6.5 tarjetas", value: "under_6_5_cards", line: "6.5" },
  { label: "Menos de 4.5 tarjetas", value: "under_4_5_cards", line: "4.5" },
  { label: "Ninguna portería a cero", value: "no_clean" },
  { label: "Ganador", value: "ganador" },
  { label: "Empate", value: "empate" },
];

function parseRecord(rec: string) {
  const [a, b] = rec.split("/").map(Number);
  if (!a || !b) return 0;
  return (a / b) * 100;
}

function getTier(score: number) {
  if (score >= 85) return "🔒 Seguro";
  if (score >= 70) return "✅ Fuerte";
  if (score >= 60) return "⚠️ Opcional";
  return "❌ Descartar";
}

function impliedProb(odd: number) {
  return 100 / odd;
}

export default function Page() {
  const [match, setMatch] = useState<Match>({
    local: "",
    visitante: "",
    oddLocal: "",
    oddDraw: "",
    oddVisit: "",
  });

  const [indicators, setIndicators] = useState<Indicator[]>([]);

  const addIndicator = () => {
    setIndicators((prev) => [
      ...prev,
      { id: Math.random().toString(), team: "ambos", market: "", line: "", record: "" },
    ]);
  };

  const updateIndicator = (id: string, field: keyof Indicator, value: string) => {
    setIndicators((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
  };

  const removeIndicator = (id: string) => {
    setIndicators((prev) => prev.filter((i) => i.id !== id));
  };

  const results = useMemo(() => {
    const grouped: Record<string, number[]> = {};

    indicators.forEach((i) => {
      const key = `${i.market}_${i.line}`;
      const pct = parseRecord(i.record);
      if (!grouped[key]) grouped[key] = [];
      if (pct > 0) grouped[key].push(pct);
    });

    return Object.entries(grouped).map(([key, values]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      return {
        market: key,
        confidence: avg,
        tier: getTier(avg),
        count: values.length,
      };
    }).sort((a, b) => b.confidence - a.confidence);
  }, [indicators]);

  const analysis = useMemo(() => {
    if (!results.length) return null;

    const best = results[0];
    const odd = Number(match.oddLocal || 2);
    const implied = impliedProb(odd);

    const value = best.confidence - implied;

    let decision = "⚠️ Evaluar";
    if (best.confidence >= 75 && value > 5) decision = "🔥 JUGAR";
    if (best.confidence < 60) decision = "❌ NO JUGAR";

    return {
      best,
      value: value.toFixed(1),
      implied: implied.toFixed(1),
      decision,
    };
  }, [results, match]);

  useEffect(() => {
    const saved = localStorage.getItem("simpleApp");
    if (saved) {
      const data = JSON.parse(saved);
      setMatch(data.match);
      setIndicators(data.indicators);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("simpleApp", JSON.stringify({ match, indicators }));
  }, [match, indicators]);


const clearAll = () => {
  if (!confirm("¿Seguro que quieres borrar todo?")) return;

  setMatch({
    local: "",
    visitante: "",
    oddLocal: "",
    oddDraw: "",
    oddVisit: "",
  });

  setIndicators([]);
};

const saveManual = () => {
  localStorage.setItem("simpleApp", JSON.stringify({ match, indicators }));
  alert("✅ Partido guardado");
};

  return (
    <div className="p-4 max-w-5xl mx-auto text-white">
      <h1 className="text-2xl font-bold mb-4">🔥 Analizador Pro H2H</h1>

<div className="flex gap-2 mb-4">
  <button
    onClick={saveManual}
    className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded"
  >
    💾 Guardar
  </button>

  <button
    onClick={clearAll}
    className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded"
  >
    🧹 Limpiar
  </button>
</div>


      {/* MATCH */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <input placeholder="Local" value={match.local}
          onChange={(e) => setMatch({ ...match, local: e.target.value })}
          className="p-2 bg-gray-800 border border-gray-600 rounded" />
        <input placeholder="Visitante" value={match.visitante}
          onChange={(e) => setMatch({ ...match, visitante: e.target.value })}
          className="p-2 bg-gray-800 border border-gray-600 rounded" />
        <input placeholder="Cuota Local" value={match.oddLocal}
          onChange={(e) => setMatch({ ...match, oddLocal: e.target.value })}
          className="p-2 bg-gray-800 border border-gray-600 rounded" />
        <input placeholder="Empate" value={match.oddDraw}
          onChange={(e) => setMatch({ ...match, oddDraw: e.target.value })}
          className="p-2 bg-gray-800 border border-gray-600 rounded" />
        <input placeholder="Cuota Visitante" value={match.oddVisit}
          onChange={(e) => setMatch({ ...match, oddVisit: e.target.value })}
          className="p-2 bg-gray-800 border border-gray-600 rounded" />
      </div>

      {/* INDICATORS */}
      <h2 className="text-xl mb-2">Indicadores</h2>

      {indicators.map((i) => (
        <div key={i.id} className="grid grid-cols-5 gap-2 mb-2 bg-gray-900 p-3 rounded border border-gray-700">

          <select value={i.team}
            onChange={(e) => updateIndicator(i.id, "team", e.target.value)}
            className="bg-gray-800 p-2 rounded">
            <option value="local">🏠 Local</option>
            <option value="visitante">✈️ Visitante</option>
            <option value="h2h">🤝 H2H</option>
            <option value="ambos">🔥 Ambos</option>
          </select>

          <select
            onChange={(e) => {
              const selected = MARKET_OPTIONS.find(m => m.value === e.target.value);
              updateIndicator(i.id, "market", selected?.label || "");
              if (selected?.line) updateIndicator(i.id, "line", selected.line);
            }}
            className="bg-gray-800 p-2 rounded">
            <option>Mercado</option>
            {MARKET_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <input value={i.line} placeholder="Línea"
            onChange={(e) => updateIndicator(i.id, "line", e.target.value)}
            className="bg-gray-800 p-2 rounded" />

          <input value={i.record} placeholder="5/6"
            onChange={(e) => updateIndicator(i.id, "record", e.target.value)}
            className="bg-gray-800 p-2 rounded" />

          <button onClick={() => removeIndicator(i.id)} className="bg-red-500 rounded">
            ✖
          </button>
        </div>
      ))}

      <button onClick={addIndicator} className="bg-blue-500 px-3 py-1 mt-2">
        + Agregar indicador
      </button>

      {/* PICKS */}
      <div className="mt-6">
        <h2 className="text-xl mb-2">📊 Picks</h2>

        {results.map((r, idx) => (
          <div key={idx} className="border p-2 mb-2 rounded bg-gray-900">
            <div className="font-bold">{r.market}</div>
            <div>Confianza: {r.confidence.toFixed(1)}%</div>
            <div>Señales: {r.count}</div>
            <div>{r.tier}</div>
          </div>
        ))}
      </div>

      {/* ANALISIS */}
      {analysis && (
        <div className="mt-6 p-4 bg-gray-800 rounded border border-yellow-500">
          <h2 className="text-xl mb-2">🧠 Análisis Inteligente</h2>

          <div>Mejor Pick: {analysis.best.market}</div>
          <div>Confianza: {analysis.best.confidence.toFixed(1)}%</div>
          <div>Probabilidad casa: {analysis.implied}%</div>
          <div>Value: +{analysis.value}%</div>

          <div className="mt-2 text-lg font-bold">
            {analysis.decision}
          </div>
        </div>
      )}
    </div>
  );
}