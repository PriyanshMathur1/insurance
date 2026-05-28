import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  chatId: z.string(),
  insuranceType: z.enum(["HEALTH", "TERM", "MIXED", "CLAIMS", "GENERAL"]),
  reason: z.string(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const chat = await prisma.chat.findFirst({ where: { id: input.chatId, userId: user.id }, include: { messages: { orderBy: { createdAt: "desc" }, take: 8 } } });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    const handoff = await prisma.humanHandoff.create({
      data: {
        userId: user.id,
        chatId: chat.id,
        insuranceType: input.insuranceType,
        userProfileSummary: JSON.stringify(chat.extractedProfile),
        conversationSummary: chat.messages.map((message) => `${message.role}: ${message.content}`).reverse().join("\n").slice(0, 4000),
        productsDiscussed: [],
        riskFlags: [],
        reason: input.reason,
      },
    });
    await prisma.chat.update({ where: { id: chat.id }, data: { handoffStatus: "OPEN" } });
    return NextResponse.json({ handoff });
  } catch (error) {
    return jsonError(error);
  }
}
