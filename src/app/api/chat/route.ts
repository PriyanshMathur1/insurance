import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const chats = await prisma.chat.findMany({
      where: { userId: user.id, title: query ? { contains: query, mode: "insensitive" } : undefined },
      select: {
        id: true,
        title: true,
        insuranceCategory: true,
        detectedIntent: true,
        handoffStatus: true,
        updatedAt: true,
        messages: { take: 1, orderBy: { createdAt: "desc" }, select: { content: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ chats });
  } catch (error) {
    return jsonError(error);
  }
}
