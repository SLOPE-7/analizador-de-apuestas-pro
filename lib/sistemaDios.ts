export function analizarParlay(partidos: { equipo: string }[]) {
  let riesgo = 0;
  let tieneTrampa = false;
  let tieneBase = false;

  partidos.forEach((p) => {
    if (p.equipo === "Manchester City") {
      riesgo += 1;
      tieneBase = true;
    } else if (p.equipo === "Arsenal") {
      riesgo += 2;
    } else if (p.equipo === "Manchester United") {
      riesgo += 3;
      tieneTrampa = true;
    }
  });

  let veredicto = "MUY SEGURA";

  if (riesgo >= 10) veredicto = "PARLAY MUERTA";
  else if (riesgo >= 7) veredicto = "RIESGO ALTO";
  else if (riesgo >= 4) veredicto = "JUGABLE";

  const malaCombinacion = tieneBase && tieneTrampa;

  return {
    riesgo,
    veredicto,
    tieneTrampa,
    malaCombinacion,
  };
}