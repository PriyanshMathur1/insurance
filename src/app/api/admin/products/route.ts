import { NextResponse } from "next/server";
import { requireAdminOrAdvisor } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdminOrAdvisor();
    const [health, term] = await Promise.all([prisma.healthProduct.findMany({ take: 100 }), prisma.termProduct.findMany({ take: 100 })]);
    return NextResponse.json({ health, term });
  } catch (error) {
    return jsonError(error);
  }
}
