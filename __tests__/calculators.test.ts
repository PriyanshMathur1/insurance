import { describe, expect, it } from "vitest";
import { calculateHealthCover, calculateTermCover } from "@/lib/calculators";
import { classifyQuery } from "@/lib/classifier";
import { checkCompliance } from "@/lib/compliance";

describe("insurance advisor logic", () => {
  it("calculates metro family health cover ranges", () => {
    const result = calculateHealthCover({ city: "Mumbai", whoNeedsCover: ["self", "spouse", "children"], existingEmployerCover: 500000 });
    expect(result.recommendedCoverRange).toBe("15-25 lakh");
    expect(result.riskFlags.join(" ")).toContain("Employer cover");
  });

  it("calculates term cover using income, loans, and deductions", () => {
    const result = calculateTermCover({ annualIncome: 1500000, outstandingLoans: 2000000, existingLifeCover: 1000000, liquidAssets: 500000 });
    expect(result.recommendedCoverRange).toBe("155-230 lakh");
  });

  it("classifies term recommendation queries", () => {
    const result = classifyQuery("I earn 15 lakh and have 2 kids, how much term insurance should I take?");
    expect(result.insuranceType).toBe("TERM");
    expect(result.intent).toBe("TERM_ADVICE");
  });

  it("revises advice that misses compliance guardrails", () => {
    const result = checkCompliance({ text: "This is the best policy.", needsAdvice: true, insuranceType: "HEALTH", citationsCount: 0, hasProductFacts: true });
    expect(result.passed).toBe(false);
    expect(result.revisedText).toContain("licensed insurance advisor");
    expect(result.revisedText).toContain("waiting periods");
  });
});
