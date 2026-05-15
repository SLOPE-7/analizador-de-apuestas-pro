import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  // Retorna info de diagnóstico
  if (!apiKey) {
    return NextResponse.json({ error: { message: "NO HAY API KEY - variable no encontrada" } }, { status: 500 });
  }

  return NextResponse.json({ 
    debug: true,
    keyLength: apiKey.length,
    keyStart: apiKey.slice(0, 15),
    keyEnd: apiKey.slice(-4)
  });
}