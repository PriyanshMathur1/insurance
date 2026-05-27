import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { buildAdvisorResponse } from "@/lib/advisor";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const schema = z.object({ message: z.string().min(1).max(8000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = schema.parse(await request.json());
    const chat = await prisma.chat.findFirst({ where: { id, userId: user.id }, include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } } });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

    await prisma.message.create({ data: { chatId: id, userId: user.id, role: "USER", content: input.message } });
    const advisor = await buildAdvisorResponse({
      message: input.message,
      existingProfile: typeof chat.extractedProfile === "object" && chat.extractedProfile ? (chat.extractedProfile as Record<string, string | number | string[]>) : {},
      history: chat.messages,
    });

    const assistant = await prisma.message.create({
      data: { chatId: id, role: "ASSISTANT", content: advisor.answer, citations: advisor.citations, metadata: { compliance: advisor.compliance } },
    });

    if (advisor.recommendedCover || advisor.productMatches.length) {
      await prisma.recommendation.create({
        data: {
          chatId: id,
          insuranceType: advisor.insuranceType,
          recommendedCover: advisor.recommendedCover,
          reasoning: advisor.answer.slice(0, 2000),
          riskFlags: advisor.riskFlags,
          productMatches: advisor.productMatches as Prisma.InputJsonValue,
          sourceCitations: advisor.citations as Prisma.InputJsonValue,
        },
      });
    }

    await prisma.complianceCheck.create({
      data: {
        chatId: id,
        responseText: advisor.answer,
        passed: advisor.compliance.passed,
        issues: advisor.compliance.issues,
        revisedText: advisor.compliance.revisedText,
      },
    });

    if (advisor.handoffReason) {
      const existingOpen = await prisma.humanHandoff.findFirst({ where: { chatId: id, status: "OPEN" } });
      if (!existingOpen) {
        await prisma.humanHandoff.create({
          data: {
            userId: user.id,
            chatId: id,
            insuranceType: advisor.insuranceType,
            userProfileSummary: JSON.stringify(advisor.extractedProfile),
            conversationSummary: input.message,
            recommendedCover: advisor.recommendedCover,
            productsDiscussed: advisor.productMatches as Prisma.InputJsonValue,
            riskFlags: advisor.riskFlags,
            reason: advisor.handoffReason,
          },
        });
      }
    }

    const title = chat.title === "New insurance chat" ? input.message.slice(0, 60) : chat.title;
    await prisma.chat.update({
      where: { id },
      data: {
        title,
        detectedIntent: advisor.intent,
        insuranceCategory: advisor.insuranceType,
        extractedProfile: advisor.extractedProfile,
        complianceStatus: advisor.compliance.passed ? "passed" : "revised",
        handoffStatus: advisor.handoffReason ? "OPEN" : chat.handoffStatus,
      },
    });

    return NextResponse.json({ message: assistant, advisor });
  } catch (error) {
    return jsonError(error);
  }
}
