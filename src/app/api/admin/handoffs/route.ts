import { NextResponse } from "next/server";
import { requireAdminOrAdvisor } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdminOrAdvisor();
    const handoffs = await prisma.humanHandoff.findMany({ include: { user: { select: { email: true, name: true } }, chat: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({ handoffs });
  } catch (error) {
    return jsonError(error);
  }
}
