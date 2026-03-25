export function optimizarParlay(partidos: { equipo: string }[]) {
  const sugerencias: string[] = [];

  partidos.forEach((p) => {
    if (p.equipo === "Manchester United") {
      sugerencias.push(`Quita ${p.equipo}, es equipo trampa`);
    } else if (p.equipo === "Arsenal") {
      sugerencias.push(`${p.equipo}: mejor usar goles o BTTS`);
    } else if (p.equipo === "Manchester City") {
      sugerencias.push(`${p.equipo}: buena base para la apuesta`);
    }
  });

  return sugerencias;
}