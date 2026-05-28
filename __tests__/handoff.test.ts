import { describe, expect, it } from "vitest";
import { handoffReason } from "@/lib/handoff";

describe("handoffReason", () => {
  const baseArgs = {
    message: "",
    insuranceType: "HEALTH" as const,
    intent: "HEALTH_ADVICE" as const,
    riskFlags: [],
    citationsCount: 1,
  };

  it("returns expert support reason when user asks for an advisor", () => {
    const messages = ["I need an expert", "please connect me", "i want to talk to an advisor", "speak to an advisor please"];
    for (const message of messages) {
      expect(handoffReason({ ...baseArgs, message })).toBe("User requested human expert support.");
    }
  });

  it("returns purchase reason when user asks to buy or select", () => {
    const messages = ["I want to buy this", "my final choice is this", "select this policy"];
    for (const message of messages) {
      expect(handoffReason({ ...baseArgs, message })).toBe("User is asking for purchase or final product selection.");
    }
  });

  it("returns pre-existing disease reason when user mentions conditions like diabetes or ped", () => {
    const messages = ["I have diabetes", "what about pre-existing conditions", "my ped is covered?"];
    for (const message of messages) {
      expect(handoffReason({ ...baseArgs, message })).toBe("Pre-existing disease suitability needs licensed advisor review.");
    }
  });

  it("returns senior citizen reason when user mentions senior or parents", () => {
    const messages = ["policy for a senior citizen", "for my father", "mother needs insurance", "my parent"];
    for (const message of messages) {
      expect(handoffReason({ ...baseArgs, message })).toBe("Senior citizen or parent cover requires careful underwriting review.");
    }
  });

  it("returns claim rejection reason when user mentions claims or type is CLAIMS", () => {
    const messages = ["my claim rejected", "i have a dispute"];
    for (const message of messages) {
      expect(handoffReason({ ...baseArgs, message })).toBe("Claim rejection or dispute should be reviewed by a human advisor.");
    }

    expect(handoffReason({ ...baseArgs, message: "hello", insuranceType: "CLAIMS" as const })).toBe("Claim rejection or dispute should be reviewed by a human advisor.");
  });

  it("returns incomplete product data reason when product comparison lacks citations", () => {
    expect(handoffReason({ ...baseArgs, citationsCount: 0, intent: "PRODUCT_COMPARISON" as const })).toBe("Product data is incomplete for reliable comparison.");
  });

  it("returns the first risk flag if there are risk flags", () => {
    expect(handoffReason({ ...baseArgs, riskFlags: ["High Risk Area", "Smoker"] })).toBe("High Risk Area");
  });

  it("returns null when no conditions match", () => {
    expect(handoffReason({ ...baseArgs, message: "What is term insurance?" })).toBeNull();
  });
});
