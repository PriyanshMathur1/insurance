import type { ChatIntent, InsuranceType } from "@prisma/client";

export function handoffReason(args: {
  message: string;
  insuranceType: InsuranceType;
  intent: ChatIntent;
  riskFlags: string[];
  citationsCount: number;
}) {
  const text = args.message.toLowerCase();
  if (text.includes("expert") || text.includes("connect me") || text.includes("talk to an advisor") || text.includes("speak to an advisor")) return "User requested human expert support.";
  if (text.includes("buy") || text.includes("final") || text.includes("select")) return "User is asking for purchase or final product selection.";
  if (text.includes("diabetes") || text.includes("pre-existing") || text.includes("ped")) return "Pre-existing disease suitability needs licensed advisor review.";
  if (text.includes("senior") || text.includes("father") || text.includes("mother") || text.includes("parent")) return "Senior citizen or parent cover requires careful underwriting review.";
  if (text.includes("claim rejected") || text.includes("dispute") || args.insuranceType === "CLAIMS") return "Claim rejection or dispute should be reviewed by a human advisor.";
  if (args.citationsCount === 0 && args.intent === "PRODUCT_COMPARISON") return "Product data is incomplete for reliable comparison.";
  if (args.riskFlags.length > 0) return args.riskFlags[0];
  return null;
}
