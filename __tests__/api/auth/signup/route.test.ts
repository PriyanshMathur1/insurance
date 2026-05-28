import { describe, it, expect, vi } from "vitest";
import { POST } from "../../../../src/app/api/auth/signup/route";

vi.mock("../../../../src/lib/prisma", () => ({
  prisma: {
    user: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../../../src/lib/auth", () => ({
  hashPassword: vi.fn(),
  createSession: vi.fn(),
}));

describe("POST /api/auth/signup", () => {
  const createRequest = (ip: string, email: string) => {
    return new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: {
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ email, password: "password123", name: "Test User" }),
    });
  };

  it("should return 429 if IP rate limit is exceeded", async () => {
    const ip = `signup_ip_${Date.now()}`;
    const email = `newuser_${Date.now()}@test.com`;

    // Send 5 requests
    for (let i = 0; i < 5; i++) {
      await POST(createRequest(ip, email));
    }

    // 6th request should hit rate limit
    const response = await POST(createRequest(ip, email));

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toBe("Too many requests");
  });
});
