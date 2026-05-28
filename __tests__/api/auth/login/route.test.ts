import { describe, it, expect, vi } from "vitest";
import { POST } from "../../../../src/app/api/auth/login/route";

// We don't want to actually test DB here, just rate limiting response.
vi.mock("../../../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../../../src/lib/auth", () => ({
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
}));

describe("POST /api/auth/login", () => {
  // Simple mock of a Next Request
  const createRequest = (ip: string, email: string) => {
    return new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ email, password: "password123" }),
    });
  };

  it("should return 429 if IP rate limit is exceeded", async () => {
    const ip = `ip_${Date.now()}`;
    const email = `test_${Date.now()}@test.com`;

    // Send 10 requests, they should go through or fail validation/auth (we mock findUnique anyway, so they will fail with 401)
    for (let i = 0; i < 10; i++) {
      await POST(createRequest(ip, email));
    }

    // 11th request should hit rate limit
    const response = await POST(createRequest(ip, email));

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toBe("Too many requests");
  });

  it("should return 429 if email rate limit is exceeded from different IPs", async () => {
    const email = `target_${Date.now()}@test.com`;

    // Send 5 requests from different IPs
    for (let i = 0; i < 5; i++) {
      await POST(createRequest(`diff_ip_${i}`, email));
    }

    // 6th request for same email should hit rate limit
    const response = await POST(createRequest(`diff_ip_6`, email));

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toBe("Too many attempts for this email, please try again later.");
  });
});
