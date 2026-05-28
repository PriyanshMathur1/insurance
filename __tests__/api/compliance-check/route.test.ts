import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/compliance-check/route";
import * as auth from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(),
}));

describe("POST /api/compliance-check", () => {
  it("should return error using jsonError when requireUser fails", async () => {
    vi.mocked(auth.requireUser).mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));
    const request = new Request("http://localhost/api/compliance-check", {
      method: "POST",
      body: JSON.stringify({ text: "test" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("should return a 500 error when request json is invalid", async () => {
    vi.mocked(auth.requireUser).mockResolvedValueOnce({ id: "user1", email: "test@example.com", name: "Test User", role: "USER", createdAt: new Date() });
    const request = new Request("http://localhost/api/compliance-check", {
      method: "POST",
      body: "invalid json",
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain("Unexpected token");
  });

  it("should return a 500 error when schema parsing fails", async () => {
    vi.mocked(auth.requireUser).mockResolvedValueOnce({ id: "user1", email: "test@example.com", name: "Test User", role: "USER", createdAt: new Date() });
    const request = new Request("http://localhost/api/compliance-check", {
      method: "POST",
      body: JSON.stringify({ invalid: "data" }), // missing required text
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toHaveProperty("error");
  });
});
