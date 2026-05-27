import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const user = await requireUser();
    const chat = await prisma.chat.create({ data: { userId: user.id, title: "New insurance chat" } });
    return NextResponse.json({ chat });
  } catch (error) {
    return jsonError(error);
  }
}
