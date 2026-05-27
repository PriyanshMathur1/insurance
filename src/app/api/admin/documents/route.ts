import { NextResponse } from "next/server";
import { requireAdminOrAdvisor } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdminOrAdvisor();
    const documents = await prisma.sourceDocument.findMany({ include: { _count: { select: { chunks: true } } }, orderBy: { updatedAt: "desc" }, take: 100 });
    return NextResponse.json({ documents });
  } catch (error) {
    return jsonError(error);
  }
}
