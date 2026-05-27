import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const schema = z.object({ title: z.string().min(1).max(120) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = schema.parse(await request.json());
    const existing = await prisma.chat.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    const chat = await prisma.chat.update({ where: { id }, data: { title: input.title } });
    return NextResponse.json({ chat });
  } catch (error) {
    return jsonError(error);
  }
}
