export type HealthInput = {
  city?: string;
  whoNeedsCover?: string[];
  familyMemberAges?: Record<string, number>;
  existingPersonalCover?: number;
  existingEmployerCover?: number;
  preExistingDiseases?: string[];
  preference?: string;
};

export type TermInput = {
  age?: number;
  annualIncome?: number;
  dependents?: number;
  outstandingLoans?: number;
  existingLifeCover?: number;
  liquidAssets?: number;
  childrenEducationGoal?: number;
  desiredRetirementAge?: number;
};

const metros = ["mumbai", "delhi", "bengaluru", "bangalore", "chennai", "hyderabad", "pune", "kolkata", "gurgaon", "noida"];

export function calculateHealthCover(input: HealthInput) {
  const isMetro = metros.some((city) => input.city?.toLowerCase().includes(city));
  const members = input.whoNeedsCover ?? [];
  const coversParents = members.some((member) => ["parent", "parents", "father", "mother"].includes(member.toLowerCase()));
  const isFamily = members.length > 1 || members.some((member) => ["spouse", "children", "family"].includes(member.toLowerCase()));
  const baseRange = isMetro
    ? isFamily ? [15, 25] : [10, 15]
    : isFamily ? [10, 15] : [5, 10];
  const personalCover = Math.max(0, (input.existingPersonalCover ?? 0) / 100000);
  const adjustedRange = [Math.max(0, baseRange[0] - personalCover), Math.max(0, baseRange[1] - personalCover)];
  const riskFlags = [
    ...(coversParents ? ["Parents or senior citizens should usually be evaluated for a separate policy, with co-pay, room rent, disease-wise sub-limits, PED waiting period, and claim conditions checked carefully."] : []),
    ...((input.existingEmployerCover ?? 0) > 0 ? ["Employer cover is useful but should not be the only long-term cover."] : []),
    ...((input.preExistingDiseases?.length ?? 0) > 0 ? ["Pre-existing disease disclosure and waiting periods need advisor review."] : []),
  ];

  return {
    recommendedCoverRange: `${adjustedRange[0]}-${adjustedRange[1]} lakh`,
    baseCoverRange: `${baseRange[0]}-${baseRange[1]} lakh`,
    reasoning: `${isMetro ? "Metro" : "Tier 2/3 or non-metro"} ${isFamily ? "family floater" : "individual"} guideline applied, then existing suitable personal cover was considered.`,
    riskFlags,
    importantFeatures: ["room rent limit", "co-pay", "deductible", "PED waiting period", "specific disease waiting period", "restoration benefit", "network hospitals", "major exclusions", "claim process"],
  };
}

export function calculateTermCover(input: TermInput) {
  const income = input.annualIncome ?? 0;
  const baseLow = income * 10;
  const baseHigh = income * 15;
  const additions = (input.outstandingLoans ?? 0) + (input.childrenEducationGoal ?? 0);
  const deductions = (input.existingLifeCover ?? 0) + (input.liquidAssets ?? 0);
  const low = Math.max(0, baseLow + additions - deductions);
  const high = Math.max(0, baseHigh + additions - deductions);
  const duration = input.age && input.desiredRetirementAge ? Math.max(5, input.desiredRetirementAge - input.age) : undefined;

  return {
    recommendedCoverRange: `${Math.round(low / 100000)}-${Math.round(high / 100000)} lakh`,
    underinsuranceGap: Math.max(0, low),
    suggestedPolicyDuration: duration ? `${duration} years` : "Usually until planned retirement age, subject to insurer eligibility.",
    reasoning: "Annual income x 10-15 plus loans and goals, less existing life cover and liquid family assets.",
    riderSuggestions: ["critical illness rider", "accidental death benefit rider", "waiver of premium rider"],
    warnings: ["Declare tobacco and medical history truthfully.", "Review suicide clause, exclusions, and claim documentation in the policy wording."],
  };
}
