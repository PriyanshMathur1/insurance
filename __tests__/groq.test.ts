import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getGroq, draftWithGroq } from "../src/lib/groq";
import Groq from "groq-sdk";

vi.mock("groq-sdk", () => {
  const MockGroq = vi.fn();
  return { default: MockGroq };
});

describe("groq", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getGroq", () => {
    it("should return null if GROQ_API_KEY is not set", () => {
      delete process.env.GROQ_API_KEY;
      expect(getGroq()).toBeNull();
    });

    it("should return a Groq instance if GROQ_API_KEY is set", () => {
      process.env.GROQ_API_KEY = "test-key";
      const result = getGroq();
      expect(result).toBeDefined();
      expect(Groq).toHaveBeenCalledWith({ apiKey: "test-key" });
    });
  });

  describe("draftWithGroq", () => {
    const mockArgs = {
      userQuestion: "Test question?",
      classification: {},
      citations: [],
      productMatches: [],
      fallbackAnswer: "Fallback answer",
    };

    it("should return null if getGroq returns null", async () => {
      delete process.env.GROQ_API_KEY; // This makes getGroq return null
      const result = await draftWithGroq(mockArgs);
      expect(result).toBeNull();
    });

    it("should return the chat completion content on success", async () => {
      process.env.GROQ_API_KEY = "test-key";
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: "Mocked Groq response",
            },
          },
        ],
      });

      vi.mocked(Groq).mockImplementation(function() {
        return {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        } as unknown as Groq;
      });

      const result = await draftWithGroq(mockArgs);

      expect(result).toBe("Mocked Groq response");
      expect(mockCreate).toHaveBeenCalledOnce();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe("llama-3.3-70b-versatile");
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe("system");
      expect(callArgs.messages[1].role).toBe("user");
      expect(callArgs.messages[1].content).toBe(JSON.stringify(mockArgs));
    });

    it("should use process.env.GROQ_CHAT_MODEL if set", async () => {
      process.env.GROQ_API_KEY = "test-key";
      process.env.GROQ_CHAT_MODEL = "custom-model";
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: "Mocked response",
            },
          },
        ],
      });

      vi.mocked(Groq).mockImplementation(function() {
        return {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        } as unknown as Groq;
      });

      await draftWithGroq(mockArgs);

      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockCreate.mock.calls[0][0].model).toBe("custom-model");
    });

    it("should return null and warn on error", async () => {
      process.env.GROQ_API_KEY = "test-key";
      const mockCreate = vi.fn().mockRejectedValue(new Error("API Error"));

      vi.mocked(Groq).mockImplementation(function() {
        return {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        } as unknown as Groq;
      });

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await draftWithGroq(mockArgs);

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Groq chat unavailable; using deterministic advisor fallback.",
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });

    it("should return null if choice content is missing", async () => {
      process.env.GROQ_API_KEY = "test-key";
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      });

      vi.mocked(Groq).mockImplementation(function() {
        return {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        } as unknown as Groq;
      });

      const result = await draftWithGroq(mockArgs);

      expect(result).toBeNull();
    });

    it("should return null if choice is empty", async () => {
      process.env.GROQ_API_KEY = "test-key";
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [],
      });

      vi.mocked(Groq).mockImplementation(function() {
        return {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        } as unknown as Groq;
      });

      const result = await draftWithGroq(mockArgs);

      expect(result).toBeNull();
    });
  });
});
