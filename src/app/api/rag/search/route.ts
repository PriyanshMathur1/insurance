import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { searchRag } from "@/lib/rag";

const schema = z.object({ query: z.string(), insuranceType: z.enum(["HEALTH", "TERM", "MIXED", "CLAIMS", "GENERAL"]).optional() });

export async function POST(request: Request) {
  try {
    await requireUser();
    const input = schema.parse(await request.json());
    return NextResponse.json({ results: await searchRag(input.query, input.insuranceType) });
  } catch (error) {
    return jsonError(error);
  }
}
