import { describe, expect, it } from "vitest";
import { jsonError } from "@/lib/http";
import { NextResponse } from "next/server";

describe("jsonError", () => {
  it("handles Response instances", async () => {
    const originalResponse = new Response("Bad Request", { status: 400 });
    const result = jsonError(originalResponse);

    expect(result).toBeInstanceOf(NextResponse);
    expect(result.status).toBe(400);
    const text = await result.text();
    expect(text).toBe("Bad Request");
  });

  it("handles Error instances", async () => {
    const error = new Error("Custom error message");
    const result = jsonError(error);

    expect(result).toBeInstanceOf(NextResponse);
    expect(result.status).toBe(500);

    const json = await result.json();
    expect(json).toEqual({ error: "Custom error message" });
  });

  it("handles unknown types", async () => {
    const result = jsonError("Some random string");

    expect(result).toBeInstanceOf(NextResponse);
    expect(result.status).toBe(500);

    const json = await result.json();
    expect(json).toEqual({ error: "Unexpected error" });
  });
});
