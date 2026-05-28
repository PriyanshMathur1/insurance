import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/handoff/route";
import * as auth from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chat: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    humanHandoff: {
      create: vi.fn(),
    },
  },
}));

describe("POST /api/handoff error paths", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return a 500 response when requireUser throws an error (e.g. auth failure)", async () => {
    // Mock requireUser to throw an error
    vi.spyOn(auth, "requireUser").mockRejectedValue(new Error("Authentication required"));

    const request = new Request("http://localhost/api/handoff", {
      method: "POST",
      body: JSON.stringify({
        chatId: "chat-123",
        insuranceType: "HEALTH",
        reason: "Need help",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Authentication required" });
  });

  it("should return a 500 response on invalid JSON request payload causing Zod validation error", async () => {
    // Mock requireUser to succeed
    vi.spyOn(auth, "requireUser").mockResolvedValue({ id: "user-123" } as any);

    const request = new Request("http://localhost/api/handoff", {
      method: "POST",
      body: JSON.stringify({
        invalidField: "invalid",
        // missing required fields chatId, insuranceType, reason
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe("string");
  });

  it("should return a 404 response when chat is not found", async () => {
    // Mock requireUser to succeed
    vi.spyOn(auth, "requireUser").mockResolvedValue({ id: "user-123" } as any);

    // Using import for prisma would be better but we can test this by importing it or using dynamic mock
    // For now we can just let it use the mock we setup at top level which returns undefined by default for findFirst
    const { prisma } = await import("@/lib/prisma");
    (prisma.chat.findFirst as any).mockResolvedValue(null);

    const request = new Request("http://localhost/api/handoff", {
      method: "POST",
      body: JSON.stringify({
        chatId: "missing-chat-123",
        insuranceType: "HEALTH",
        reason: "Need help",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: "Chat not found" });
  });
});
