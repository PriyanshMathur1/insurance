import type { ChatIntent, InsuranceType } from "@prisma/client";

export type Classification = {
  insuranceType: InsuranceType;
  intent: ChatIntent;
  needsAdvice: boolean;
};

const healthWords = ["health", "family floater", "waiting period", "ped", "diabetes", "hospital", "room rent", "corporate cover", "claim rejection", "tpa"];
const termWords = ["term", "life cover", "sum assured", "suicide", "rider", "waiver", "income", "dependents", "death benefit", "tobacco"];
const claimsWords = ["claim", "rejected", "dispute", "ombudsman", "cashless", "reimbursement"];
const compareWords = ["compare", "vs", "versus", "lower", "show plans", "which plans"];
const recommendationWords = ["should i", "how much", "recommend", "good for", "need", "take", "buy", "select", "want", "find", "looking for"];
const outOfScopeWords = ["mutual fund", "stock", "loan", "tax planning", "motor insurance", "car insurance", "bike insurance", "travel insurance", "ulip", "investment"];

export function classifyQuery(input: string): Classification {
  const text = input.toLowerCase();
  const hasHealth = healthWords.some((word) => text.includes(word));
  const hasTerm = termWords.some((word) => text.includes(word));
  const hasClaims = claimsWords.some((word) => text.includes(word));
  const hasCompare = compareWords.some((word) => text.includes(word));
  const hasRecommendation = recommendationWords.some((word) => text.includes(word));

  let insuranceType: InsuranceType = "GENERAL";
  if (hasClaims) insuranceType = "CLAIMS";
  if (hasHealth) insuranceType = "HEALTH";
  if (hasTerm) insuranceType = "TERM";
  if (hasHealth && hasTerm) insuranceType = "MIXED";

  let intent: ChatIntent = "GENERAL_EDUCATION";
  if (hasCompare) intent = "PRODUCT_COMPARISON";
  else if (hasClaims) intent = "CLAIMS";
  else if (hasRecommendation && hasHealth) intent = "HEALTH_ADVICE";
  else if (hasRecommendation && hasTerm) intent = "TERM_ADVICE";
  else if (hasRecommendation) intent = "PROFILE_RECOMMENDATION";
  else intent = "CONCEPT_EXPLANATION";

  return { insuranceType, intent, needsAdvice: hasRecommendation || hasCompare || hasClaims };
}

const genericInsuranceWords = ["insurance", "policy", "premium", "cover", "plan"];

export function isOutOfScopeQuery(input: string) {
  const text = input.toLowerCase();

  if (outOfScopeWords.some((word) => text.includes(word))) return true;

  const hasInScopeSignal = healthWords.some((word) => text.includes(word)) ||
                           termWords.some((word) => text.includes(word)) ||
                           claimsWords.some((word) => text.includes(word)) ||
                           genericInsuranceWords.some((word) => text.includes(word));
  if (hasInScopeSignal) return false;

  const isProfileAnswer = /^\s*(yes|no|none|\d+|mumbai|delhi|bangalore|chennai|kolkata|pune|hyderabad|ahmedabad)\s*$/i.test(text) || /\b(lakh|crore|k|yr|years?|old)\b/i.test(text);
  if (isProfileAnswer) return false;

  const isQuestion = text.includes("?") || /^(who|what|where|when|why|how|which)\b/.test(text.trim());
  if (isQuestion) return true;

  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount >= 3) return true;

  return false;
}
