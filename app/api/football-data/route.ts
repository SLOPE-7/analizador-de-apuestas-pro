// app/api/football-data/route.ts
// API de api-sports.io (api-football.com) — NO RapidAPI

import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.API_FOOTBALL_KEY!;
const BASE_URL = "https://v3.football.api-sports.io";

const headers = {
  "x-apisports-key": API_KEY,
};

type MatchStat = {
  fixtureId: number;
  date: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  cornersFor: number;
  cornersAgainst: number;
  cardsFor: number;
  cardsAgainst: number;
  shotsTotal: number;
  shotsOnTarget: number;
  fouls: number;
  btts: boolean;
  result: "G" | "E" | "P";
};

type FixtureResponse = {
  fixture: { id: number; date: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
};

// Busca el equipo por nombre
async function searchTeam(name: string): Promise<{ id: number; name: string } | null> {
  const res = await fetch(`${BASE_URL}/teams?search=${encodeURIComponent(name)}`, { headers });
  const data = await res.json();
  
  // Debug: retorna toda la respuesta para ver qué llega
  if (!data?.response?.length) {
    throw new Error(`Sin resultados para "${name}". Respuesta API: ${JSON.stringify(data).slice(0, 300)}`);
  }
  
  const team = data.response[0].team;
  return { id: team.id, name: team.name };
}

// Obtiene stat específica de un array de estadísticas
function getStat(stats: Array<{ type: string; value: string | number | null }>, type: string): number {
  const found = stats.find((s) => s.type === type);
  return Number(found?.value ?? 0) || 0;
}

// Obtiene los últimos partidos como local o visitante
async function getLastMatches(
  teamId: number,
  condition: "home" | "away",
  count: number,
  season: number
): Promise<MatchStat[]> {
  const res = await fetch(
    `${BASE_URL}/fixtures?team=${teamId}&season=${season}&status=FT&last=${count * 3}`,
    { headers }
  );
  const data = await res.json();
  const fixtures: FixtureResponse[] = data?.response ?? [];

  // Filtra solo los partidos en la condición correcta
  const filtered = fixtures.filter((f) =>
    condition === "home" ? f.teams.home.id === teamId : f.teams.away.id === teamId
  );

  const result: MatchStat[] = [];

  for (const f of filtered.slice(0, count)) {
    const fixtureId = f.fixture.id;
    const isHome = f.teams.home.id === teamId;

    // Estadísticas del equipo en ese partido
    const statsRes = await fetch(
      `${BASE_URL}/fixtures/statistics?fixture=${fixtureId}&team=${teamId}`,
      { headers }
    );
    const statsData = await statsRes.json();
    const stats = statsData?.response?.[0]?.statistics ?? [];

    const goalsFor = isHome ? (f.goals.home ?? 0) : (f.goals.away ?? 0);
    const goalsAgainst = isHome ? (f.goals.away ?? 0) : (f.goals.home ?? 0);

    result.push({
      fixtureId,
      date: f.fixture.date,
      opponent: isHome ? f.teams.away.name : f.teams.home.name,
      goalsFor,
      goalsAgainst,
      cornersFor: getStat(stats, "Corner Kicks"),
      cornersAgainst: 0,
      cardsFor: getStat(stats, "Yellow Cards") + getStat(stats, "Red Cards"),
      cardsAgainst: 0,
      shotsTotal: getStat(stats, "Total Shots"),
      shotsOnTarget: getStat(stats, "Shots on Goal"),
      fouls: getStat(stats, "Fouls"),
      btts: goalsFor > 0 && goalsAgainst > 0,
      result: goalsFor > goalsAgainst ? "G" : goalsFor < goalsAgainst ? "P" : "E",
    });
  }

  return result;
}

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        { error: "API_FOOTBALL_KEY no configurada en variables de entorno" },
        { status: 500 }
      );
    }

    const { localTeam, visitTeam, matchCount = 5, season = 2024 } = await req.json();

    if (!localTeam || !visitTeam) {
      return NextResponse.json(
        { error: "Se requieren localTeam y visitTeam" },
        { status: 400 }
      );
    }

    // Buscar equipos en paralelo
    const [localInfo, visitInfo] = await Promise.all([
      searchTeam(localTeam),
      searchTeam(visitTeam),
    ]);

    if (!localInfo) {
      return NextResponse.json(
        { error: `Equipo no encontrado: ${localTeam}` },
        { status: 404 }
      );
    }
    if (!visitInfo) {
      return NextResponse.json(
        { error: `Equipo no encontrado: ${visitTeam}` },
        { status: 404 }
      );
    }

    // Obtener partidos en paralelo
    const [localMatches, visitMatches] = await Promise.all([
      getLastMatches(localInfo.id, "home", matchCount, season),
      getLastMatches(visitInfo.id, "away", matchCount, season),
    ]);

    return NextResponse.json({
      local: {
        team: localInfo,
        condition: "home",
        matches: localMatches,
      },
      visitante: {
        team: visitInfo,
        condition: "away",
        matches: visitMatches,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
