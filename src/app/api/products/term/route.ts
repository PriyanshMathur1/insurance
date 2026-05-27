import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireUser();
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const products = await prisma.termProduct.findMany({
      where: q ? { OR: [{ insurerName: { contains: q, mode: "insensitive" } }, { productName: { contains: q, mode: "insensitive" } }] } : undefined,
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ products });
  } catch (error) {
    return jsonError(error);
  }
}
