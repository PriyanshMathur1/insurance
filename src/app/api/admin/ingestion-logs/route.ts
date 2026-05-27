import { NextResponse } from "next/server";
import { requireAdminOrAdvisor } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdminOrAdvisor();
    const logs = await prisma.ingestionLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return NextResponse.json({ logs });
  } catch (error) {
    return jsonError(error);
  }
}
