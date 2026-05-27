import { NextResponse } from "next/server";
import { requireAdminOrAdvisor } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireAdminOrAdvisor();
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const chats = await prisma.chat.findMany({
      where: q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : undefined,
      include: { user: { select: { email: true, name: true } }, messages: { take: 1, orderBy: { createdAt: "desc" } }, recommendations: { take: 1, orderBy: { createdAt: "desc" } }, complianceChecks: { take: 1, orderBy: { createdAt: "desc" } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ chats });
  } catch (error) {
    return jsonError(error);
  }
}
