import type { InsuranceType } from "@prisma/client";

export type ComplianceInput = {
  text: string;
  needsAdvice: boolean;
  insuranceType: InsuranceType;
  citationsCount: number;
  hasProductFacts: boolean;
};

export function checkCompliance(input: ComplianceInput) {
  const issues: string[] = [];
  const lowered = input.text.toLowerCase();
  if (input.hasProductFacts && input.citationsCount === 0) issues.push("Product or regulatory facts need citations.");
  if (input.needsAdvice && !lowered.includes("licensed insurance advisor")) issues.push("Advice needs licensed advisor disclaimer.");
  if (lowered.includes("best policy") && !lowered.includes("criteria")) issues.push("Avoid best-policy language without criteria.");
  if ((input.insuranceType === "HEALTH" || lowered.includes("health")) && !lowered.includes("waiting period")) issues.push("Health advice should mention waiting periods.");
  if ((input.insuranceType === "TERM" || lowered.includes("term")) && !lowered.includes("medical")) issues.push("Term advice should warn about truthful medical disclosure.");
  if (lowered.includes("guaranteed claim") || lowered.includes("claim will be paid")) issues.push("Avoid guaranteed claim language.");
  if (lowered.includes("guaranteed return")) issues.push("Avoid guaranteed return language.");
  return {
    passed: issues.length === 0,
    issues,
    revisedText: issues.length ? reviseForCompliance(input.text, issues, input.insuranceType) : input.text,
  };
}

function reviseForCompliance(text: string, issues: string[], insuranceType: InsuranceType) {
  const additions = [
    issues.some((issue) => issue.includes("licensed advisor")) ? "Final purchase decisions should be confirmed with a licensed insurance advisor." : "",
    issues.some((issue) => issue.includes("waiting periods")) ? "For health insurance, check initial, specific disease, and pre-existing disease waiting periods before buying." : "",
    issues.some((issue) => issue.includes("medical")) ? "For term insurance, disclose medical history and tobacco use truthfully because non-disclosure can affect claims." : "",
    issues.some((issue) => issue.includes("citations")) ? "Verified source data is missing for some product-specific facts; treat those parts as unavailable until ingestion provides citations." : "",
    insuranceType === "CLAIMS" ? "For claim disputes, preserve written communication and consider advisor or ombudsman review." : "",
  ].filter(Boolean);
  return `${text}\n\n${additions.join("\n")}`;
}
