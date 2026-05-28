import { NextResponse } from "next/server";
import { requireAdminOrAdvisor } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { rateAdvisorResponse, type AdvisorQualityRating } from "@/lib/quality";
import { planAdvisorResponse, type ResponsePlan } from "@/lib/response-planner";

type StoredQualityMetadata = {
  quality?: AdvisorQualityRating;
  responsePlan?: ResponsePlan;
};

export async function GET() {
  try {
    await requireAdminOrAdvisor();
    const checks = await prisma.complianceCheck.findMany({
      include: {
        chat: {
          select: {
            id: true,
            title: true,
            insuranceCategory: true,
            detectedIntent: true,
            user: { select: { email: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const reviews = checks.map((check) => {
      const insuranceType = check.chat?.insuranceCategory ?? "GENERAL";
      const intent = check.chat?.detectedIntent ?? "GENERAL_EDUCATION";
      const metadata = metadataObject(check.metadata);
      const responsePlan = metadata.responsePlan ?? planAdvisorResponse({ insuranceType, intent });
      const quality = metadata.quality ?? rateAdvisorResponse({
        text: check.revisedText ?? check.responseText,
        insuranceType,
        intent,
        needsAdvice: intent !== "GENERAL_EDUCATION",
        citationsCount: 0,
        hasProductFacts: false,
        responsePlan,
      });
      return {
        id: check.id,
        chatId: check.chatId,
        chatTitle: check.chat?.title ?? "Standalone check",
        userEmail: check.chat?.user.email ?? null,
        insuranceType,
        intent,
        passed: check.passed,
        issues: check.issues,
        createdAt: check.createdAt,
        excerpt: (check.revisedText ?? check.responseText).slice(0, 360),
        quality,
      };
    });

    const averageScore = reviews.length ? Math.round(reviews.reduce((total, review) => total + review.quality.score, 0) / reviews.length) : 0;
    const gradeCounts = reviews.reduce<Record<AdvisorQualityRating["grade"], number>>((counts, review) => {
      counts[review.quality.grade] += 1;
      return counts;
    }, { excellent: 0, good: 0, needs_review: 0, unsafe: 0 });

    const dimensionsByKey = reviews.reduce((acc, review) => {
      for (const dimension of review.quality.dimensions) {
        if (!acc[dimension.key]) acc[dimension.key] = [];
        acc[dimension.key].push(dimension);
      }
      return acc;
    }, {} as Record<string, typeof reviews[0]["quality"]["dimensions"]>);

    const dimensionAverages = ["scope", "sources", "safety", "structure", "personalization", "nextStep"].map((key) => {
      const matching = dimensionsByKey[key] ?? [];
      const first = matching[0];
      return {
        key,
        label: first?.label ?? key,
        score: matching.length ? Math.round((matching.reduce((total, item) => total + item.score / item.max, 0) / matching.length) * 100) : 0,
        failing: matching.filter((item) => !item.passed).length,
      };
    });
    const topFlags = reviews
      .flatMap((review) => review.quality.reviewFlags)
      .reduce<Record<string, number>>((counts, flag) => {
        counts[flag] = (counts[flag] ?? 0) + 1;
        return counts;
      }, {});

    return NextResponse.json({
      summary: {
        totalReviewed: reviews.length,
        averageScore,
        gradeCounts,
        needsReview: reviews.filter((review) => review.quality.grade === "needs_review" || review.quality.grade === "unsafe").length,
        dimensionAverages,
        topFlags: Object.entries(topFlags).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([flag, count]) => ({ flag, count })),
      },
      reviews,
    });
  } catch (error) {
    return jsonError(error);
  }
}

function metadataObject(value: unknown): StoredQualityMetadata {
  return typeof value === "object" && value ? value as StoredQualityMetadata : {};
}
