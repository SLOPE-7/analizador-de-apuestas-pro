import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  return NextResponse.json({
    debug: true,
    keyExists: !!apiKey,
    keyLength: apiKey?.length ?? 0,
    keyStart: apiKey?.slice(0, 20) ?? "VACIA",
  });
}