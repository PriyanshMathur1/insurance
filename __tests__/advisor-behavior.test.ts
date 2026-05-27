import { describe, expect, it } from "vitest";
import { deterministicAnswer, buildAdvisorResponse } from "@/lib/advisor";
import { calculateHealthCover, calculateTermCover } from "@/lib/calculators";
import { classifyQuery, isOutOfScopeQuery } from "@/lib/classifier";
import { extractProfileFields, missingHealthFields, missingTermFields } from "@/lib/profile";
import { rateAdvisorResponse } from "@/lib/quality";
import { planAdvisorResponse } from "@/lib/response-planner";

describe("advisor behavior contract", () => {
  it("returns the exact boundary for out-of-scope finance questions", async () => {
    expect(isOutOfScopeQuery("Which mutual fund should I buy?")).toBe(true);
    const result = await buildAdvisorResponse({ message: "Which mutual fund should I buy?" });
    expect(result.answer).toBe("I can help only with health insurance and term life insurance.");
    expect(result.productMatches).toEqual([]);
    expect(result.recommendedCover).toBeUndefined();
  });

  it("asks only a short set of missing health essentials", () => {
    const profile = extractProfileFields("I am 32 in Mumbai and need health insurance for spouse and one child");
    const answer = deterministicAnswer({
      message: "health recommendation",
      insuranceType: "HEALTH",
      intent: "HEALTH_ADVICE",
      extractedProfile: profile,
      citations: [],
      productMatches: [],
      computed: {
        recommendedCover: calculateHealthCover({
          city: String(profile.city),
          whoNeedsCover: Array.isArray(profile.whoNeedsCover) ? profile.whoNeedsCover : undefined,
        }).recommendedCoverRange,
        riskFlags: [],
        result: calculateHealthCover({
          city: String(profile.city),
          whoNeedsCover: Array.isArray(profile.whoNeedsCover) ? profile.whoNeedsCover : undefined,
        }),
      },
    });

    expect(answer).toContain("What I need next:");
    expect(answer).toContain("existing personal health cover");
    expect(answer).toContain("employer health cover");
    expect(answer).toContain("known pre-existing diseases");
    expect(answer).toContain("licensed insurance advisor");
    expect(answer).toContain("Next questions:");
    expect(missingHealthFields(profile).length).toBeGreaterThan(0);
  });

  it("explains term starting range before all adjustment fields are present", () => {
    const profile = extractProfileFields("I am 35, earn 12 lakh, have 2 kids and 40 lakh loan. How much term insurance should I take?");
    const answer = deterministicAnswer({
      message: "term recommendation",
      insuranceType: "TERM",
      intent: "TERM_ADVICE",
      extractedProfile: profile,
      citations: [],
      productMatches: [],
      computed: {
        recommendedCover: calculateTermCover({
          annualIncome: Number(profile.annualIncome),
          dependents: Number(profile.dependents),
          outstandingLoans: Number(profile.outstandingLoans),
        }).recommendedCoverRange,
        riskFlags: [],
        result: calculateTermCover({
          annualIncome: Number(profile.annualIncome),
          dependents: Number(profile.dependents),
          outstandingLoans: Number(profile.outstandingLoans),
        }),
      },
    });

    expect(answer).toContain("Rs 1.2-1.8 crore");
    expect(answer).toContain("existing life cover");
    expect(answer).toContain("liquid savings/assets");
    expect(answer).toContain("tobacco");
    expect(answer).toContain("Next questions:");
    expect(missingTermFields(profile)).toContain("existing life cover");
  });

  it("treats explicit zero and none answers as provided profile data", () => {
    const profile = extractProfileFields("I am 35, earn 12 lakh, have 2 kids, no loans, no existing life cover, no savings, non-smoker and retirement age 60");

    expect(profile.outstandingLoans).toBe(0);
    expect(profile.existingLifeCover).toBe(0);
    expect(profile.liquidAssets).toBe(0);
    expect(profile.tobaccoStatus).toBe("no tobacco disclosed");
    expect(missingTermFields(profile)).not.toContain("outstanding loans");
    expect(missingTermFields(profile)).not.toContain("existing life cover");
    expect(missingTermFields(profile)).not.toContain("liquid savings/assets");
    expect(missingTermFields(profile)).not.toContain("smoking/tobacco status");
  });

  it("keeps health premium budgets in rupees when no lakh unit is given", () => {
    const profile = extractProfileFields("I want health insurance. My budget is around 15000 per year.");
    const shorthandProfile = extractProfileFields("I want health insurance. Premium budget 15k.");

    expect(profile.budget).toBe(15000);
    expect(shorthandProfile.budget).toBe(15000);
  });

  it("classifies buying language as health advice", () => {
    const classification = classifyQuery("I want health insurance for myself in Mumbai");

    expect(classification.intent).toBe("HEALTH_ADVICE");
    expect(classification.needsAdvice).toBe(true);
  });

  it("uses the concept explanation section structure", () => {
    const answer = deterministicAnswer({
      message: "What is room rent limit?",
      insuranceType: "HEALTH",
      intent: "CONCEPT_EXPLANATION",
      extractedProfile: {},
      citations: [],
      productMatches: [],
      computed: {
        recommendedCover: calculateHealthCover({}).recommendedCoverRange,
        riskFlags: [],
        result: calculateHealthCover({}),
      },
    });

    expect(answer).toContain("Simple answer:");
    expect(answer).toContain("Why it matters:");
    expect(answer).toContain("Example:");
    expect(answer).toContain("What to check:");
    expect(answer).toContain("Advisor note:");
    expect(answer).toContain("room rent limit");
  });

  it("gives claims guidance without guaranteeing approval", () => {
    const classification = classifyQuery("My health claim for diabetes hospitalization was rejected");
    const answer = deterministicAnswer({
      message: "claim rejected",
      insuranceType: classification.insuranceType,
      intent: classification.intent,
      extractedProfile: extractProfileFields("diabetes hospitalization"),
      citations: [],
      productMatches: [],
      computed: {
        recommendedCover: calculateHealthCover({ preExistingDiseases: ["diabetes"] }).recommendedCoverRange,
        riskFlags: [],
        result: calculateHealthCover({ preExistingDiseases: ["diabetes"] }),
      },
    });

    expect(answer).toContain("I cannot guarantee approval");
    expect(answer).toContain("PED waiting period");
    expect(answer).toContain("disclosure status");
    expect(answer).toContain("Next questions:");
    expect(answer).not.toContain("claim will be paid");
  });

  it("plans the best response format for major query shapes", () => {
    expect(planAdvisorResponse({ insuranceType: "HEALTH", intent: "CONCEPT_EXPLANATION" }).format).toBe("concept");
    expect(planAdvisorResponse({ insuranceType: "TERM", intent: "TERM_ADVICE", missingFields: ["age"] }).format).toBe("clarifying_questions");
    expect(planAdvisorResponse({ insuranceType: "HEALTH", intent: "PRODUCT_COMPARISON" }).format).toBe("comparison");
    expect(planAdvisorResponse({ insuranceType: "CLAIMS", intent: "CLAIMS" }).format).toBe("claim_triage");
  });

  it("rates advisor responses across safety, structure, sources, and next steps", () => {
    const responsePlan = planAdvisorResponse({ insuranceType: "HEALTH", intent: "HEALTH_ADVICE" });
    const rating = rateAdvisorResponse({
      text: [
        "Quick summary:",
        "This is a suitable starting point.",
        "",
        "What I understood:",
        "Age and city were shared.",
        "",
        "Recommended cover:",
        "Use a practical health cover range.",
        "",
        "What to prioritize:",
        "Check waiting period, room rent, co-pay, and exclusions.",
        "",
        "Red flags:",
        "No major risk flags detected.",
        "",
        "Next step:",
        "Compare policy wording and speak with a licensed insurance advisor.",
        "",
        "Next questions:",
        "- Do you want balanced cover or maximum coverage?",
      ].join("\n"),
      insuranceType: "HEALTH",
      intent: "HEALTH_ADVICE",
      needsAdvice: true,
      citationsCount: 0,
      hasProductFacts: false,
      responsePlan,
    });

    expect(rating.score).toBeGreaterThanOrEqual(80);
    expect(rating.grade).toBe("excellent");
    expect(rating.reviewFlags).toEqual([]);
  });

  it("flags unsafe low-quality responses for admin review", () => {
    const rating = rateAdvisorResponse({
      text: "This is the best policy and the claim will be paid.",
      insuranceType: "HEALTH",
      intent: "HEALTH_ADVICE",
      needsAdvice: true,
      citationsCount: 0,
      hasProductFacts: true,
      responsePlan: planAdvisorResponse({ insuranceType: "HEALTH", intent: "HEALTH_ADVICE" }),
    });

    expect(rating.grade).toBe("unsafe");
    expect(rating.reviewFlags.join(" ")).toContain("unsafe guarantee");
    expect(rating.reviewFlags.length).toBeGreaterThan(0);
  });
});
