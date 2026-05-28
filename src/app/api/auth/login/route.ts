import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: Request) {
  try {
    // Basic IP-based rate limit
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`login_ip_${ip}`, 10, 60 * 1000)) { // 10 requests per minute
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const input = schema.parse(await request.json());

    // Email-based rate limit (to prevent brute forcing an account)
    if (!checkRateLimit(`login_email_${input.email.toLowerCase()}`, 5, 5 * 60 * 1000)) { // 5 requests per 5 minutes
      return NextResponse.json({ error: "Too many attempts for this email, please try again later." }, { status: 429 });
    }
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    return jsonError(error);
  }
}
