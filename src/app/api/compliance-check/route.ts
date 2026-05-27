import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { checkCompliance } from "@/lib/compliance";
import { jsonError } from "@/lib/http";

const schema = z.object({
  text: z.string(),
  needsAdvice: z.boolean().default(true),
  insuranceType: z.enum(["HEALTH", "TERM", "MIXED", "CLAIMS", "GENERAL"]).default("GENERAL"),
  citationsCount: z.number().default(0),
  hasProductFacts: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    await requireUser();
    return NextResponse.json({ result: checkCompliance(schema.parse(await request.json())) });
  } catch (error) {
    return jsonError(error);
  }
}
