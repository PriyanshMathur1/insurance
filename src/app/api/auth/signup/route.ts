import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().optional() });

export async function POST(request: Request) {
  try {
    // Basic IP-based rate limit
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`signup_ip_${ip}`, 5, 60 * 1000)) { // 5 requests per minute
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

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
