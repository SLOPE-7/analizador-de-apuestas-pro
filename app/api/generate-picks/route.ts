import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un analista experto en apuestas deportivas. Devuelve SOLO JSON válido con: context, pronostico y picks (array con label, confidence, reasoning).",
        },
        {
          role: "user",
          content: JSON.stringify(body),
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");

    return NextResponse.json({ result });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Error en OpenAI" },
      { status: 500 }
    );
  }
}