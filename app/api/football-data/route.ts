// app/api/football-data/route.ts
// Conecta con API-Football (rapidapi.com) para obtener estadísticas automáticas
// Necesitas: RAPIDAPI_KEY en tus variables de entorno (Vercel + .env.local)

import { NextRequest, NextResponse } from "next/server";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY!;
const BASE_URL = "https://api-football-v1.p.rapidapi.com/v3";

const headers = {
  "X-RapidAPI-Key": RAPIDAPI_KEY,
  "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
};

// Busca el ID del equipo por nombre
async function searchTeam(name: string): Promise<{ id: number; name: string; logo: string } | null> {
  const res = await fetch(`${BASE_URL}/teams?search=${encodeURIComponent(name)}`, { headers });
  const data = await res.json();
  const team = data?.response?.[0]?.team;
  if (!team) return null;
  return { id: team.id, name: team.name, logo: team.logo };
}

// Obtiene los últimos N partidos de un equipo (local o visitante)
async function getLastMatches(
  teamId: number,
  condition: "home" | "away",
  count: number,
  season: number
): Promise<MatchStat[]> {
  const res = await fetch(
    `${BASE_URL}/fixtures?team=${teamId}&season=${season}&status=FT&last=${count * 2}`,
    { headers }
  );
  const data = await res.json();
  const fixtures = data?.response ?? [];

  const filtered = fixtures.filter((f: FixtureResponse) => {
    if (condition === "home") return f.teams.home.id === teamId;
    return f.teams.away.id === teamId;
  });

  const result: MatchStat[] = [];

  for (const f of filtered.slice(0, count)) {
    const fixtureId = f.fixture.id;
    const isHome = f.teams.home.id === teamId;

    // Obtener estadísticas del partido
    const statsRes = await fetch(`${BASE_URL}/fixtures/statistics?fixture=${fixtureId}&team=${teamId}`, { headers });
    const statsData = await statsRes.json();
    const stats = statsData?.response?.[0]?.statistics ?? [];

    const getStat = (type: string): number => {
      const found = stats.find((s: { type: string; value: string | number | null }) => s.type === type);
      return Number(found?.value ?? 0) || 0;
    };

    const goalsFor = isHome ? f.goals.home : f.goals.away;
    const goalsAgainst = isHome ? f.goals.away : f.goals.home;

    result.push({
      fixtureId,
      date: f.fixture.date,
      opponent: isHome ? f.teams.away.name : f.teams.home.name,
      goalsFor: goalsFor ?? 0,
      goalsAgainst: goalsAgainst ?? 0,
      cornersFor: getStat("Corner Kicks"),
      cornersAgainst: 0, // Se calcula por diferencia si se obtienen stats del rival
      cardsFor: getStat("Yellow Cards") + getStat("Red Cards"),
      cardsAgainst: 0,
      shotsTotal: getStat("Total Shots"),
      shotsOnTarget: getStat("Shots on Goal"),
      fouls: getStat("Fouls"),
      btts: (goalsFor ?? 0) > 0 && (goalsAgainst ?? 0) > 0,
      result: (goalsFor ?? 0) > (goalsAgainst ?? 0) ? "G" : (goalsFor ?? 0) < (goalsAgainst ?? 0) ? "P" : "E",
    });
  }

  return result;
}

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
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
};

export async function POST(req: NextRequest) {
  try {
    if (!RAPIDAPI_KEY) {
      return NextResponse.json(
        { error: "RAPIDAPI_KEY no configurada en variables de entorno" },
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

    // Buscar IDs de ambos equipos en paralelo
    const [localInfo, visitInfo] = await Promise.all([
      searchTeam(localTeam),
      searchTeam(visitTeam),
    ]);

    if (!localInfo) {
      return NextResponse.json({ error: `Equipo no encontrado: ${localTeam}` }, { status: 404 });
    }
    if (!visitInfo) {
      return NextResponse.json({ error: `Equipo no encontrado: ${visitTeam}` }, { status: 404 });
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
