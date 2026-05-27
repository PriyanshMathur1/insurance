import type { ChatIntent, InsuranceType } from "@prisma/client";

export type AdvisorResponseFormat =
  | "boundary"
  | "concept"
  | "recommendation"
  | "comparison"
  | "claim_triage"
  | "clarifying_questions"
  | "mixed_scope";

export type ResponsePlan = {
  format: AdvisorResponseFormat;
  label: string;
  sections: string[];
  followUpQuestions: string[];
  instruction: string;
};

export function planAdvisorResponse(args: {
  insuranceType: InsuranceType;
  intent: ChatIntent;
  missingFields?: string[];
  hasProductMatches?: boolean;
}) {
  if (args.insuranceType === "GENERAL") {
    return responsePlan("boundary", "Scope boundary", ["Simple answer"], [], "Return only the exact scope boundary sentence.");
  }

  if (args.insuranceType === "MIXED") {
    return responsePlan(
      "mixed_scope",
      "Split guidance",
      ["Simple answer", "Why it matters", "What to check", "Advisor note"],
      ["Should we handle health insurance first or term insurance first?"],
      "Separate health and term insurance because their suitability logic is different.",
    );
  }

  if (args.intent === "CLAIMS") {
    return responsePlan(
      "claim_triage",
      "Claim triage",
      ["Simple answer", "Why it matters", "Example", "What to check", "Next questions", "Advisor note"],
      claimQuestions(args.insuranceType),
      "Triage the claim. Do not guarantee approval. Ask for the minimum case facts needed before case-specific guidance.",
    );
  }

  if (args.intent === "PRODUCT_COMPARISON") {
    return responsePlan(
      "comparison",
      "Source comparison",
      ["Simple answer", "Comparison table", "What to check", "Next questions", "Advisor note"],
      ["What criteria should I optimize for: low premium, balanced cover, or maximum coverage?", "Do you want to include parents or only self/spouse/children?"],
      "Use a markdown table for verified product fields. Mark missing fields as Not found in source data.",
    );
  }

  if ((args.missingFields?.length ?? 0) > 0 && args.intent !== "CONCEPT_EXPLANATION") {
    return responsePlan(
      "clarifying_questions",
      "Follow-up questions",
      ["Quick summary", "What I need next", "Why it matters", "Advisor note"],
      (args.missingFields ?? []).slice(0, 5).map((field) => `Please share ${field}.`),
      "Ask only the most important missing questions first. Do not provide final personalized advice yet.",
    );
  }

  if (args.intent === "CONCEPT_EXPLANATION") {
    return responsePlan(
      "concept",
      "Concept explainer",
      ["Simple answer", "Why it matters", "Example", "What to check", "Advisor note"],
      ["Do you want me to apply this to your own policy or profile?"],
      "Explain the concept plainly with one practical example and a checklist.",
    );
  }

  return responsePlan(
    "recommendation",
    "Personalized recommendation",
    ["Quick summary", "What I understood", "Recommended cover", "What to prioritize", "Red flags", "Next step", "Next questions"],
    recommendationQuestions(args.insuranceType),
    "Give an indicative recommendation, explain the calculation, surface red flags, and ask the next useful question.",
  );
}

function responsePlan(format: AdvisorResponseFormat, label: string, sections: string[], followUpQuestions: string[], instruction: string): ResponsePlan {
  return { format, label, sections, followUpQuestions, instruction };
}

function claimQuestions(insuranceType: InsuranceType) {
  if (insuranceType === "TERM") {
    return ["Was the policy active on the date of death?", "Was smoking, tobacco use, and medical history disclosed in the proposal form?", "What reason did the insurer give in writing?"];
  }
  return ["What was the diagnosis and hospitalization date?", "Was this condition disclosed when buying the policy?", "Is the PED or specific disease waiting period over?", "What reason did the insurer give in writing?"];
}

function recommendationQuestions(insuranceType: InsuranceType) {
  if (insuranceType === "TERM") {
    return ["Do you want the cover till age 60, 65, or another retirement age?", "Do you want plain term cover first, or should we evaluate riders separately?"];
  }
  return ["Do you want a low-premium, balanced, or maximum-coverage shortlist?", "Should parents be evaluated in a separate policy?"];
}
