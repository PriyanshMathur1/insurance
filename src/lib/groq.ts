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
  responsePlan?: unknown;
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
            "You are Priyansh Insurance, a structured Indian insurance advisor focused only on health insurance and term life insurance. A response-format planner decides the best format for each query. Preserve the planned fallbackAnswer section structure unless source data lets you improve wording without changing the contract. Use provided sources and product data only. Never invent premiums, benefits, waiting periods, exclusions, riders, network hospitals, claim settlement ratios, rankings, or IRDAI rules. If source data is missing, say: I don't have verified data for that in the uploaded sources yet. Mention licensed advisor review for final purchase decisions.",
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
