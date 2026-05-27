import type { ChatIntent, InsuranceType } from "@prisma/client";
import type { ResponsePlan } from "@/lib/response-planner";

export type QualityDimension = {
  key: "scope" | "sources" | "safety" | "structure" | "personalization" | "nextStep";
  label: string;
  score: number;
  max: number;
  passed: boolean;
  notes: string[];
};

export type AdvisorQualityRating = {
  score: number;
  grade: "excellent" | "good" | "needs_review" | "unsafe";
  summary: string;
  dimensions: QualityDimension[];
  reviewFlags: string[];
};

export function rateAdvisorResponse(input: {
  text: string;
  insuranceType: InsuranceType;
  intent: ChatIntent;
  needsAdvice: boolean;
  citationsCount: number;
  hasProductFacts: boolean;
  responsePlan?: ResponsePlan;
}) {
  const dimensions = [
    scopeDimension(input),
    sourceDimension(input),
    safetyDimension(input),
    structureDimension(input),
    personalizationDimension(input),
    nextStepDimension(input),
  ];
  const score = Math.round((dimensions.reduce((total, item) => total + item.score, 0) / dimensions.reduce((total, item) => total + item.max, 0)) * 100);
  const reviewFlags = dimensions.flatMap((item) => item.passed ? [] : item.notes.map((note) => `${item.label}: ${note}`));
  return {
    score,
    grade: gradeFor(score, reviewFlags),
    summary: summaryFor(score, reviewFlags),
    dimensions,
    reviewFlags,
  } satisfies AdvisorQualityRating;
}

function scopeDimension(input: { text: string; insuranceType: InsuranceType }) {
  const lowered = input.text.toLowerCase();
  const notes: string[] = [];
  if (input.insuranceType === "GENERAL" && input.text.trim() !== "I can help only with health insurance and term life insurance.") {
    notes.push("out-of-scope answer should use the exact boundary sentence");
  }
  if (/\b(mutual fund|stock|ulip|travel insurance|motor insurance|car insurance|loan advice)\b/.test(lowered) && input.insuranceType !== "GENERAL") {
    notes.push("possible out-of-scope content appears in the answer");
  }
  return dimension("scope", "Scope control", notes.length ? 0 : 15, 15, notes);
}

function sourceDimension(input: { text: string; citationsCount: number; hasProductFacts: boolean; intent: ChatIntent }) {
  const lowered = input.text.toLowerCase();
  const notes: string[] = [];
  if (input.hasProductFacts && input.citationsCount === 0) notes.push("product or regulatory facts need citations");
  if (input.intent === "PRODUCT_COMPARISON" && !lowered.includes("not found in source data") && !lowered.includes("source")) notes.push("comparison should show source gaps explicitly");
  if (input.hasProductFacts && input.citationsCount === 0 && /premium|claim settlement|network hospital|rider|exclusion|waiting period/i.test(input.text) && !lowered.includes("i don't have verified data")) {
    notes.push("missing-source caveat is absent for source-sensitive claims");
  }
  return dimension("sources", "Source honesty", notes.length ? Math.max(0, 15 - notes.length * 6) : 15, 15, notes);
}

function safetyDimension(input: { text: string; insuranceType: InsuranceType; needsAdvice: boolean }) {
  const lowered = input.text.toLowerCase();
  const notes: string[] = [];
  if (lowered.includes("guaranteed claim") || lowered.includes("claim will be paid") || lowered.includes("guaranteed return")) notes.push("unsafe guarantee language is present");
  if (input.needsAdvice && !lowered.includes("licensed insurance advisor")) notes.push("licensed advisor review is missing");
  if ((input.insuranceType === "TERM" || lowered.includes("term insurance")) && !lowered.includes("medical")) notes.push("term guidance should mention truthful medical disclosure");
  if ((input.insuranceType === "HEALTH" || lowered.includes("health insurance")) && !lowered.includes("waiting period")) notes.push("health guidance should mention waiting periods");
  return dimension("safety", "Safety guardrails", notes.length ? Math.max(0, 25 - notes.length * 7) : 25, 25, notes);
}

function structureDimension(input: { text: string; responsePlan?: ResponsePlan }) {
  const notes: string[] = [];
  const requiredSections = input.responsePlan?.sections ?? [];
  for (const section of requiredSections) {
    if (!input.text.includes(`${section}:`)) notes.push(`missing ${section} section`);
  }
  if (input.text.length > 1200 && !/\n- |\|---\|/.test(input.text)) notes.push("long answer should use bullets or tables");
  return dimension("structure", "Readable structure", notes.length ? Math.max(0, 20 - notes.length * 4) : 20, 20, notes);
}

function personalizationDimension(input: { text: string; intent: ChatIntent }) {
  const lowered = input.text.toLowerCase();
  const notes: string[] = [];
  const isAdvice = input.intent === "HEALTH_ADVICE" || input.intent === "TERM_ADVICE" || input.intent === "PROFILE_RECOMMENDATION";
  if (isAdvice && !lowered.includes("what i understood") && !lowered.includes("what i need next")) notes.push("personal advice should summarize profile or ask missing essentials");
  if (isAdvice && lowered.includes("best policy for everyone")) notes.push("overgeneralized recommendation language");
  return dimension("personalization", "Personalization", notes.length ? 5 : 10, 10, notes);
}

function nextStepDimension(input: { text: string; intent: ChatIntent }) {
  const lowered = input.text.toLowerCase();
  const notes: string[] = [];
  if (!lowered.includes("next question") && !lowered.includes("next step") && !lowered.includes("what i need next")) notes.push("answer should guide the next user action");
  if (input.intent === "CLAIMS" && !lowered.includes("what reason did the insurer give")) notes.push("claim triage should ask for insurer's written reason");
  return dimension("nextStep", "Next-step usefulness", notes.length ? Math.max(0, 15 - notes.length * 6) : 15, 15, notes);
}

function dimension(key: QualityDimension["key"], label: string, score: number, max: number, notes: string[]) {
  return { key, label, score, max, passed: notes.length === 0, notes } satisfies QualityDimension;
}

function gradeFor(score: number, reviewFlags: string[]): AdvisorQualityRating["grade"] {
  if (reviewFlags.some((flag) => flag.toLowerCase().includes("unsafe guarantee"))) return "unsafe";
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  return "needs_review";
}

function summaryFor(score: number, reviewFlags: string[]) {
  if (!reviewFlags.length) return "Strong answer. It follows the advisor format and safety rules.";
  if (score >= 70) return "Usable answer with a few review points.";
  return "Needs advisor review before relying on this response.";
}
