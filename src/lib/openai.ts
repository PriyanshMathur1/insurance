import OpenAI from "openai";

export function getOpenAI() {
  if (process.env.OPENAI_DISABLED === "true") return null;
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function embedText(text: string) {
  const client = getOpenAI();
  if (!client) return null;
  try {
    const response = await client.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: text.slice(0, 8000),
    });
    return response.data[0]?.embedding ?? null;
  } catch (error) {
    console.warn("OpenAI embeddings unavailable; falling back to keyword search.", error);
    return null;
  }
}

export async function embedTexts(texts: string[]) {
  const client = getOpenAI();
  if (!client) return null;
  try {
    const response = await client.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: texts.map((text) => text.slice(0, 8000)),
    });
    return response.data.map((d) => d.embedding);
  } catch (error) {
    console.warn("OpenAI embeddings unavailable; falling back to keyword search.", error);
    return null;
  }
}

export function vectorLiteral(vector: number[]) {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(",")}]`;
}
