import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    console.log("🔑 API KEY:", !!apiKey);

    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY no configurada" },
        { status: 500 }
      );
    }

    let body;

    try {
      body = await req.json();
    } catch (err) {
      console.log("❌ ERROR PARSEANDO JSON:", err);
      return NextResponse.json(
        { error: "Body inválido o no es JSON" },
        { status: 400 }
      );
    }

    console.log("🔥 BODY:", body);

    const prompt = body?.prompt;

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt no enviado desde el frontend" },
        { status: 400 }
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.log("❌ ANTHROPIC ERROR:", data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.log("❌ ERROR GENERAL:", err);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}