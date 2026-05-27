import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { calculateTermCover } from "@/lib/calculators";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await requireUser();
    return NextResponse.json({ result: calculateTermCover(await request.json()) });
  } catch (error) {
    return jsonError(error);
  }
}
