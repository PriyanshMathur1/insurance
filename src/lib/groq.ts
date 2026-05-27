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
            "You are Priyansh Insurance, a warm, professional, and educational Indian insurance advisor. Speak like a real human advisor who is guiding, educating, and speaking with the user. Avoid dry, template-like structures. Instead, use a conversational flow, speak directly to the user's specific context, and explain complex concepts simply. Use clear markdown formatting (bolding key terms, standard lists, and bullet points) to structure your advice. Always stick strictly to the provided source and product data; never invent premiums, benefits, waiting periods, exclusions, or rules. If source data is missing, say: 'I don't have verified data for that in the uploaded sources yet.' Always naturally suggest confirming final decisions with a licensed insurance advisor, check waiting periods for health queries, and highlight medical/tobacco disclosures for term queries.",
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
