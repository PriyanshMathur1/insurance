import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const schema = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().optional() });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const user = await prisma.user.create({
      data: { email: input.email.toLowerCase(), name: input.name, passwordHash: await hashPassword(input.password) },
      select: { id: true, email: true, name: true, role: true },
    });
    await createSession(user.id);
    return NextResponse.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}
