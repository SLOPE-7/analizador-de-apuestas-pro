import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.API_FOOTBALL_KEY!;
const BASE_URL = "https://v3.football.api-sports.io";
const headers = { "x-apisports-key": API_KEY };

export async function POST(req: NextRequest) {
  const { localTeam } = await req.json();

  const teamRes = await fetch(`${BASE_URL}/teams?search=${encodeURIComponent(localTeam)}`, { headers });
  const teamData = await teamRes.json();
  const team = teamData?.response?.[0]?.team;

  if (!team) {
    return NextResponse.json({
      local: { matches: [] },
      visitante: { matches: [] },
      debug: { error: "Equipo no encontrado", raw: teamData }
    });
  }

  const fixRes = await fetch(`${BASE_URL}/fixtures?team=${team.id}&season=2025&last=10`, { headers });
  const fixData = await fixRes.json();

  return NextResponse.json({
    local: { matches: [] },
    visitante: { matches: [] },
    debug: {
      team,
      totalFixtures: fixData?.response?.length ?? 0,
      statuses: fixData?.response?.slice(0, 5).map((f: {fixture: {status: {short: string}; date: string}}) => ({
        status: f.fixture.status.short,
        date: f.fixture.date,
      })),
      errors: fixData?.errors,
      paging: fixData?.paging,
    }
  });
}