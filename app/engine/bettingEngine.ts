import { openai } from "@/lib/openai";

export async function generatePicks(input: any) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Eres un analista experto en apuestas deportivas. Devuelve picks claros, con probabilidades y explicación corta.",
      },
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ],
  });

  return completion.choices[0].message.content;
}