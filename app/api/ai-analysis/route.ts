import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { message: "ANTHROPIC_API_KEY no configurada." } },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { useWebSearch, messages, ...rest } = body;

    const requestBody: Record<string, unknown> = {
      ...rest,
      messages,
    };

    // Web search is handled entirely by Anthropic server-side
    if (useWebSearch) {
      requestBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return NextResponse.json(data, { status: resp.status });
    }
    return NextResponse.json(data);

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: { message: msg } }, { status: 500 });
  }
}
