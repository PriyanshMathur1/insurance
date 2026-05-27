import Groq from "groq-sdk";

export function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

export async function draftWithGroq(args: {
  userQuestion: string;
  classification: unknown;
  citations: unknown[];
  productMatches: unknown[];
  fallbackAnswer: string;
}) {
  const client = getGroq();
  if (!client) return null;

  try {
    const response = await client.chat.completions.create({
      model: process.env.GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are Priyansh Insurance, a structured Indian insurance advisor. Answer only health insurance and term life insurance questions. Use provided sources and product data only. Never invent premiums, benefits, waiting periods, exclusions, riders, or claim data. Separate educational explanation from personalized recommendation. Include citations labels where product or regulatory facts appear. Mention licensed advisor review for final purchase decisions.",
        },
        {
          role: "user",
          content: JSON.stringify(args),
        },
      ],
    });
    return response.choices[0]?.message.content ?? null;
  } catch (error) {
    console.warn("Groq chat unavailable; using deterministic advisor fallback.", error);
    return null;
  }
}
