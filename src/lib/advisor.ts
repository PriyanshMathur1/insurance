import type { ChatIntent, InsuranceType, Message } from "@prisma/client";
import { calculateHealthCover, calculateTermCover } from "@/lib/calculators";
import { classifyQuery, isOutOfScopeQuery } from "@/lib/classifier";
import { checkCompliance } from "@/lib/compliance";
import { draftWithGroq } from "@/lib/groq";
import { handoffReason } from "@/lib/handoff";
import { getOpenAI } from "@/lib/openai";
import { extractProfileFields, missingHealthFields, missingTermFields, type ExtractedProfile } from "@/lib/profile";
import { formatProductTable, searchProducts } from "@/lib/products";
import { searchRag, type Citation } from "@/lib/rag";
import { planAdvisorResponse, type ResponsePlan } from "@/lib/response-planner";

export type AdvisorResult = {
  answer: string;
  citations: Citation[];
  insuranceType: InsuranceType;
  intent: ChatIntent;
  extractedProfile: ExtractedProfile;
  compliance: ReturnType<typeof checkCompliance>;
  recommendedCover?: string;
  riskFlags: string[];
  productMatches: unknown[];
  handoffReason: string | null;
  responsePlan: ResponsePlan;
};

export async function buildAdvisorResponse(args: {
  message: string;
  existingProfile?: ExtractedProfile;
  history?: Pick<Message, "role" | "content">[];
}): Promise<AdvisorResult> {
  const classification = classifyQuery(args.message);
  const extractedProfile = { ...(args.existingProfile ?? {}), ...extractProfileFields(args.message) };
  if (isOutOfScopeQuery(args.message)) {
    const answer = "I can help only with health insurance and term life insurance.";
    const responsePlan = planAdvisorResponse({ insuranceType: "GENERAL", intent: "GENERAL_EDUCATION" });
    const compliance = checkCompliance({
      text: answer,
      needsAdvice: false,
      insuranceType: "GENERAL",
      citationsCount: 0,
      hasProductFacts: false,
    });
    return {
      answer,
      citations: [],
      insuranceType: "GENERAL",
      intent: "GENERAL_EDUCATION",
      extractedProfile,
      compliance,
      riskFlags: [],
      productMatches: [],
      handoffReason: null,
      responsePlan,
    };
  }
  const citations = await searchRag(args.message, classification.insuranceType);
  const productMatches = await searchProducts(args.message, classification.insuranceType);
  const computed = computeRecommendation(classification.insuranceType, extractedProfile);
  const missingFields = missingFieldsFor(classification.insuranceType, extractedProfile);
  const responsePlan = planAdvisorResponse({
    insuranceType: classification.insuranceType,
    intent: classification.intent,
    missingFields,
    hasProductMatches: productMatches.length > 0,
  });
  const recommendedCover = hasEnoughForRecommendation(classification.insuranceType, extractedProfile) ? computed.recommendedCover : undefined;
  const riskFlags = computed.riskFlags;
  const deterministic = deterministicAnswer({
    message: args.message,
    insuranceType: classification.insuranceType,
    intent: classification.intent,
    extractedProfile,
    citations,
    productMatches,
    computed,
    responsePlan,
  });
  const llmAnswer = await tryLlmAnswer({
    message: args.message,
    classification,
    citations,
    productMatches,
    deterministic,
    responsePlan,
  });
  const groqAnswer = llmAnswer ? null : await draftWithGroq({
    userQuestion: args.message,
    classification,
    citations,
    productMatches,
      fallbackAnswer: deterministic,
      responsePlan,
    });
  const modelAnswer = llmAnswer ?? groqAnswer;
  const answer = modelAnswer && isStructurallySafe(modelAnswer, classification.intent, classification.insuranceType) ? modelAnswer : deterministic;
  const compliance = checkCompliance({
    text: answer,
    needsAdvice: classification.needsAdvice,
    insuranceType: classification.insuranceType,
    citationsCount: citations.length,
    hasProductFacts: productMatches.length > 0 || citations.length > 0,
  });
  const finalAnswer = compliance.revisedText ?? answer;
  const reason = handoffReason({
    message: args.message,
    insuranceType: classification.insuranceType,
    intent: classification.intent,
    riskFlags,
    citationsCount: citations.length,
  });

  return {
    answer: finalAnswer,
    citations,
    insuranceType: classification.insuranceType,
    intent: classification.intent,
    extractedProfile,
    compliance,
    recommendedCover,
    riskFlags,
    productMatches,
    handoffReason: reason,
    responsePlan,
  };
}

function hasEnoughForRecommendation(insuranceType: InsuranceType, profile: ExtractedProfile) {
  if (insuranceType === "TERM") return missingTermFields(profile).length === 0;
  if (insuranceType === "HEALTH" || insuranceType === "CLAIMS") return missingHealthFields(profile).length === 0;
  return false;
}

function missingFieldsFor(insuranceType: InsuranceType, profile: ExtractedProfile) {
  if (insuranceType === "TERM") return missingTermFields(profile);
  if (insuranceType === "HEALTH" || insuranceType === "CLAIMS") return missingHealthFields(profile);
  return [];
}

function computeRecommendation(insuranceType: InsuranceType, profile: ExtractedProfile) {
  if (insuranceType === "TERM") {
    const result = calculateTermCover({
      age: numberField(profile.age),
      annualIncome: numberField(profile.annualIncome),
      dependents: numberField(profile.dependents),
      outstandingLoans: numberField(profile.outstandingLoans),
      existingLifeCover: numberField(profile.existingLifeCover),
      liquidAssets: numberField(profile.liquidAssets),
      childrenEducationGoal: numberField(profile.childrenEducationGoal),
      desiredRetirementAge: numberField(profile.desiredRetirementAge),
    });
    return { recommendedCover: result.recommendedCoverRange, riskFlags: result.warnings, result };
  }
  if (insuranceType === "HEALTH" || insuranceType === "CLAIMS") {
    const result = calculateHealthCover({
      city: stringField(profile.city),
      whoNeedsCover: arrayField(profile.whoNeedsCover),
      existingPersonalCover: numberField(profile.existingPersonalCover),
      existingEmployerCover: numberField(profile.existingEmployerCover),
      preExistingDiseases: arrayField(profile.preExistingDiseases),
      preference: stringField(profile.preference),
    });
    return { recommendedCover: result.recommendedCoverRange, riskFlags: result.riskFlags, result };
  }
  return { recommendedCover: undefined, riskFlags: [] as string[], result: null };
}

export function deterministicAnswer(args: {
  message: string;
  insuranceType: InsuranceType;
  intent: ChatIntent;
  extractedProfile: ExtractedProfile;
  citations: Citation[];
  productMatches: unknown[];
  computed: ReturnType<typeof computeRecommendation>;
  responsePlan?: ResponsePlan;
}) {
  if (args.insuranceType === "MIXED") {
    return [
      "Simple answer:",
      "I can help with both health insurance and term life insurance, but it is better to handle them separately because the logic is different.",
      "",
      "Why it matters:",
      "Health insurance pays hospital bills. Term insurance protects your family's income if you die during the policy term.",
      "",
      "What to check:",
      "- For health insurance: age, city, who needs cover, existing personal and employer cover, pre-existing diseases, budget, and coverage preference.",
      "- For term insurance: age, annual income, dependents, loans, existing life cover, liquid assets, tobacco status, and retirement age.",
      "",
      "Advisor note:",
      "Share either your health-insurance details or term-insurance details first, and I will keep the advice focused. Final purchase decisions should be confirmed with a licensed insurance advisor.",
      "",
      "Next questions:",
      "- Should we handle health insurance first or term insurance first?",
    ].join("\n");
  }

  const sourceLine = args.citations.length
    ? `\n\nSources used: ${args.citations.map((source, index) => `[${index + 1}] ${source.title}`).join(", ")}.`
    : `\n\n${missingVerifiedDataText()}`;

  if (args.intent === "PRODUCT_COMPARISON") {
    return [
      "Simple answer:",
      "Here is the comparison from the structured product database. I am not calling anything the best unless you give clear criteria such as budget, city, PED history, family members, and trade-offs.",
      "",
      formatProductTable(args.productMatches as Awaited<ReturnType<typeof searchProducts>>, args.insuranceType),
      "",
      "What to check:",
      comparisonChecklist(args.insuranceType),
      "",
      "Next questions:",
      "- What criteria should I optimize for: low premium, balanced cover, or maximum coverage?",
      "- Who should be covered: self, spouse, children, or parents?",
      "",
      "Advisor note:",
      "This looks useful only to the extent the uploaded source data is complete. Verify the policy wording, brochure, prospectus, premium chart, and claim process document before purchase. Final purchase decisions should be confirmed with a licensed insurance advisor.",
      sourceLine,
    ].join("\n");
  }

  if (args.intent === "CLAIMS") {
    return claimGuidance(args.insuranceType, sourceLine);
  }

  if (args.intent === "CONCEPT_EXPLANATION") {
    return conceptExplanation(args.insuranceType, args.message, sourceLine);
  }

  if (args.insuranceType === "TERM") {
    const missing = missingTermFields(args.extractedProfile);
    if (missing.length) {
      return [
        "Quick summary:",
        "In term insurance, the biggest mistake is buying too little cover. A starting estimate is annual income x 10-15, then adjusted for loans, goals, existing cover, and liquid assets.",
        "",
        "What I need next:",
        `Please share ${missing.slice(0, 5).join(", ")}.`,
        "",
        "Example:",
        "If your income is Rs 12 lakh, a starting range is Rs 1.2-1.8 crore. Then we adjust for loans, existing cover, and family savings.",
        "",
        "Advisor note:",
        "Disclose medical history and tobacco use honestly. Non-disclosure can cause claim rejection. Final purchase decisions should be confirmed with a licensed insurance advisor.",
        "",
        "Next questions:",
        ...missing.slice(0, 3).map((field) => `- Please share ${field}.`),
        sourceLine,
      ].join("\n");
    }
    return [
      "Quick summary:",
      "This cover range looks suitable on paper, subject to insurer eligibility, medical underwriting, and truthful disclosure.",
      "",
      "What I understood:",
      termProfileSummary(args.extractedProfile),
      "",
      "Recommended cover:",
      `Indicative range: **${args.computed.recommendedCover}**. The formula is annual income x 10-15, plus loans and major future goals, minus existing life cover and liquid assets.`,
      "",
      "What to prioritize:",
      "- Correct cover amount matters more than fancy riders.",
      `- Buy cover until retirement age or the income-dependency period. ${suggestedPolicyDuration(args.computed.result) ? `Detected duration: ${suggestedPolicyDuration(args.computed.result)}.` : ""}`,
      "- Riders are optional, not mandatory. Compare standalone critical illness or accident cover before adding them blindly.",
      "- Term insurance is protection, not investment.",
      "",
      "Red flags:",
      "- Disclose smoking, tobacco use, and medical history honestly.",
      "- Check suicide clause, exclusions, claim documents, nominee details, and policy lapse rules.",
      "- Non-disclosure can cause claim rejection.",
      "",
      "Next step:",
      "Compare eligible policies using policy wording, brochure, premium illustration, claim process document, and medical underwriting rules. Final purchase decisions should be confirmed with a licensed insurance advisor.",
      "",
      "Next questions:",
      "- Do you want the cover till age 60, 65, or another retirement age?",
      "- Should we evaluate riders separately after fixing the base cover?",
      sourceLine,
    ].join("\n");
  }

  if (args.insuranceType === "HEALTH" || args.insuranceType === "CLAIMS") {
    const missing = missingHealthFields(args.extractedProfile);
    if (missing.length) {
      return [
        "Quick summary:",
        "I can suggest a suitable health cover range, but I need a few basics first. Cheapest is not always best in health insurance.",
        "",
        "What I need next:",
        `Please share ${missing.slice(0, 5).join(", ")}.`,
        "",
        "Why it matters:",
        "The right cover changes by city, family size, existing employer cover, and pre-existing diseases.",
        "",
        "Advisor note:",
        "When we compare plans, we will check room rent limit, co-pay, deductible, PED waiting period, specific disease waiting period, restoration benefit, network hospitals, major exclusions, and claim process. Final purchase decisions should be confirmed with a licensed insurance advisor.",
        "",
        "Next questions:",
        ...missing.slice(0, 3).map((field) => `- Please share ${field}.`),
        sourceLine,
      ].join("\n");
    }
    return [
      "Quick summary:",
      "Based on the information shared, this is a practical starting cover range. The final choice should depend on policy wording, hospital network, and claim conditions.",
      "",
      "What I understood:",
      healthProfileSummary(args.extractedProfile),
      "",
      "Recommended cover:",
      `Indicative range: **${args.computed.recommendedCover}**. ${args.computed.result?.reasoning}`,
      "",
      "What to prioritize:",
      "- Room rent limit, co-pay, deductible, PED waiting period, and specific disease waiting period.",
      "- Restoration benefit, no claim bonus, network hospitals, major exclusions, and claim process.",
      "- For parents or senior citizens, usually evaluate a separate policy.",
      "- Employer cover is useful, but it can disappear when you change jobs.",
      "",
      "Red flags:",
      args.computed.riskFlags.length ? args.computed.riskFlags.map((flag) => `- ${flag}`).join("\n") : "- No major risk flags detected from the current message.",
      "",
      "Next step:",
      "Shortlist plans only after checking policy wording, brochure, prospectus, premium chart, and claim process document. Final purchase decisions should be confirmed with a licensed insurance advisor.",
      "",
      "Next questions:",
      "- Do you want low premium, balanced cover, or maximum coverage?",
      "- Should parents be evaluated in a separate policy?",
      sourceLine,
    ].join("\n");
  }

  return [
    "Simple answer:",
    "I can help with Indian health insurance and term life insurance. Let’s simplify this within that scope.",
    "",
    "Why it matters:",
    args.citations[0]?.snippet ?? missingVerifiedDataText(),
    "",
    "Example:",
    "For health insurance, we may discuss waiting periods or room rent limits. For term insurance, we may discuss cover amount or medical disclosure.",
    "",
    "What to check:",
    "- Whether your question is about health insurance or term life insurance.",
    "- Whether you need a concept explanation, claim guidance, cover calculation, or product comparison.",
    "",
    "Advisor note:",
    "Final purchase decisions should be confirmed with a licensed insurance advisor.",
    sourceLine,
  ].join("\n\n");
}

function missingVerifiedDataText() {
  return "I don't have verified data for that in the uploaded sources yet. Please upload or ingest the policy wording, brochure, prospectus, premium chart, claim process document, or IRDAI/source document.";
}

function comparisonChecklist(insuranceType: InsuranceType) {
  if (insuranceType === "TERM") {
    return [
      "- Entry age, max maturity age, policy term, and sum assured range.",
      "- Premium payment options, payout options, death benefit, terminal illness benefit, and riders.",
      "- Suicide clause, claim process, and medical underwriting.",
    ].join("\n");
  }
  return [
    "- Sum insured, room rent limit, co-pay, deductible, and PED waiting period.",
    "- Specific disease waiting period, restoration benefit, no claim bonus, and network hospitals.",
    "- Major exclusions and claim process.",
  ].join("\n");
}

function claimGuidance(insuranceType: InsuranceType, sourceLine: string) {
  const isTerm = insuranceType === "TERM";
  return [
    "Simple answer:",
    "I can help you understand likely claim issues, but I cannot guarantee approval. Claim outcomes depend on the policy wording, disclosures, waiting periods, and documents.",
    "",
    "Why it matters:",
    isTerm
      ? "Term claims often run into problems when there is non-disclosure of smoking, tobacco use, medical history, policy lapse, suicide clause issues, or nominee/document gaps."
      : "Health claims often run into problems because of PED waiting periods, specific disease waiting periods, non-disclosure, room rent limits, co-pay, exclusions, missing documents, or non-medically necessary hospitalization.",
    "",
    "Example:",
    isTerm
      ? "If tobacco use was not disclosed in the proposal form, the insurer may investigate before deciding the claim."
      : "If diabetes was present before buying the policy and the PED waiting period is still active, the insurer may question a related hospitalization claim.",
    "",
    "What to check:",
    isTerm
      ? "- Policy status and premium payment history.\n- Proposal form disclosures for smoking, tobacco, and medical history.\n- Cause and date of death, nominee documents, and suicide clause.\n- Claim form, death certificate, medical records, and insurer queries."
      : "- Policy type, diagnosis, hospitalization dates, and discharge summary.\n- PED waiting period and specific disease waiting period status.\n- Whether the condition was disclosed at purchase.\n- Room rent limit, co-pay, exclusions, and missing documents.",
    "",
    "Next questions:",
    isTerm
      ? "- Was the policy active on the date of death?\n- Was smoking, tobacco use, and medical history disclosed in the proposal form?\n- What reason did the insurer give in writing?"
      : "- What was the diagnosis and hospitalization date?\n- Was this condition disclosed when buying the policy?\n- Is the PED or specific disease waiting period over?\n- What reason did the insurer give in writing?",
    "",
    "Advisor note:",
    "Share the policy type, event or diagnosis, waiting-period status, disclosure status, and hospitalization or nominee details. For disputes, preserve written communication and consider a licensed advisor, insurer grievance team, or ombudsman review.",
    sourceLine,
  ].join("\n");
}

function conceptExplanation(insuranceType: InsuranceType, message: string, sourceLine: string) {
  const isTerm = insuranceType === "TERM";
  const isRoomRent = message.toLowerCase().includes("room rent");
  return [
    "Simple answer:",
    isTerm
      ? "Term insurance pays a fixed amount to your nominee if you die during the policy term. It is protection, not investment."
      : isRoomRent
        ? "A room rent limit caps the hospital room category or daily room cost your health policy will fully pay for."
        : "Health insurance helps pay hospitalization costs, but every policy has conditions such as waiting periods, exclusions, co-pay, deductibles, and room rent limits.",
    "",
    "Why it matters:",
    isTerm
      ? "The right cover amount and honest medical disclosure matter more than fancy riders."
      : "Small clauses can change the final claim amount. This is where people usually make mistakes.",
    "",
    "Example:",
    isTerm
      ? "If your income is Rs 12 lakh, a starting term cover range is Rs 1.2-1.8 crore before adjusting for loans, goals, existing cover, and liquid assets."
      : "If a policy allows only a shared room and you choose a higher room category, related hospital charges may be proportionately reduced depending on the policy wording.",
    "",
    "What to check:",
    isTerm
      ? "- Cover amount, policy duration, premium payment term, payout option, suicide clause, medical underwriting, tobacco disclosure, and optional riders."
      : "- Room rent limit, co-pay, deductible, PED waiting period, specific disease waiting period, restoration benefit, network hospitals, major exclusions, and claim process.",
    "",
    "Advisor note:",
    isTerm
      ? "Disclose medical history and tobacco use truthfully. Final purchase decisions should be confirmed with a licensed insurance advisor."
      : "This looks simple, but policy wording decides the claim outcome. Final purchase decisions should be confirmed with a licensed insurance advisor.",
    sourceLine,
  ].join("\n");
}

function healthProfileSummary(profile: ExtractedProfile) {
  return [
    `- Age: ${profile.age ?? "not shared"}`,
    `- City: ${profile.city ?? "not shared"}`,
    `- Cover for: ${Array.isArray(profile.whoNeedsCover) ? profile.whoNeedsCover.join(", ") : "not shared"}`,
    `- Existing personal cover: ${formatMoney(profile.existingPersonalCover)}`,
    `- Employer cover: ${formatMoney(profile.existingEmployerCover)}`,
    `- Pre-existing diseases: ${Array.isArray(profile.preExistingDiseases) ? profile.preExistingDiseases.join(", ") : "not shared"}`,
  ].join("\n");
}

function termProfileSummary(profile: ExtractedProfile) {
  return [
    `- Age: ${profile.age ?? "not shared"}`,
    `- Annual income: ${formatMoney(profile.annualIncome)}`,
    `- Dependents: ${profile.dependents ?? "not shared"}`,
    `- Outstanding loans: ${formatMoney(profile.outstandingLoans)}`,
    `- Existing life cover: ${formatMoney(profile.existingLifeCover)}`,
    `- Liquid assets: ${formatMoney(profile.liquidAssets)}`,
    `- Tobacco status: ${profile.tobaccoStatus ?? "not shared"}`,
  ].join("\n");
}

function formatMoney(value: unknown) {
  if (typeof value !== "number") return "not shared";
  if (value >= 10000000) return `Rs ${(value / 10000000).toFixed(value % 10000000 === 0 ? 0 : 1)} crore`;
  return `Rs ${Math.round(value / 100000)} lakh`;
}

function suggestedPolicyDuration(result: unknown) {
  if (typeof result === "object" && result && "suggestedPolicyDuration" in result && typeof result.suggestedPolicyDuration === "string") {
    return result.suggestedPolicyDuration;
  }
  return "";
}

function isStructurallySafe(answer: string, intent: ChatIntent, insuranceType: InsuranceType) {
  const lowered = answer.toLowerCase();
  if (lowered.includes("guaranteed claim") || lowered.includes("claim will be paid") || lowered.includes("guaranteed return")) return false;
  if (!lowered.includes("licensed insurance advisor")) return false;
  if (intent === "CLAIMS") return includesAll(answer, ["Simple answer:", "Why it matters:", "Example:", "What to check:", "Advisor note:"]) && lowered.includes("cannot guarantee");
  if (intent === "PRODUCT_COMPARISON") return lowered.includes("not found in source data") || lowered.includes("verified") || lowered.includes("source");
  if (intent === "CONCEPT_EXPLANATION") return includesAll(answer, ["Simple answer:", "Why it matters:", "Example:", "What to check:", "Advisor note:"]);
  if (insuranceType === "HEALTH" || intent === "HEALTH_ADVICE") return includesAll(answer, ["Quick summary:", "What to prioritize:", "Red flags:", "Next step:"]) || lowered.includes("what i need next:");
  if (insuranceType === "TERM" || intent === "TERM_ADVICE") return lowered.includes("medical") && (includesAll(answer, ["Quick summary:", "What to prioritize:", "Red flags:", "Next step:"]) || lowered.includes("what i need next:"));
  return true;
}

function includesAll(text: string, needles: string[]) {
  return needles.every((needle) => text.includes(needle));
}

async function tryLlmAnswer(args: {
  message: string;
  classification: ReturnType<typeof classifyQuery>;
  citations: Citation[];
  productMatches: unknown[];
  deterministic: string;
  responsePlan: ResponsePlan;
}) {
  const client = getOpenAI();
  if (!client) return null;
  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are Priyansh Insurance, a structured Indian insurance advisor focused only on health insurance and term life insurance. A response-format planner decides the best format for each query. Preserve the planned section structure unless source data lets you improve wording without changing the contract. Use provided sources and product data only. Never invent premiums, benefits, waiting periods, exclusions, riders, network hospitals, claim settlement ratios, rankings, or IRDAI rules. If source data is missing, say: I don't have verified data for that in the uploaded sources yet. Mention licensed advisor review for final purchase decisions.",
        },
        {
          role: "user",
          content: JSON.stringify({
            userQuestion: args.message,
            classification: args.classification,
            sourceSnippets: args.citations,
            productMatches: args.productMatches,
            responsePlan: args.responsePlan,
            fallbackAnswer: args.deterministic,
          }),
        },
      ],
    });
    return response.choices[0]?.message.content ?? null;
  } catch (error) {
    console.warn("OpenAI chat unavailable; using deterministic advisor fallback.", error);
    return null;
  }
}

function numberField(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function arrayField(value: unknown) {
  return Array.isArray(value) ? value.map(String) : undefined;
}
