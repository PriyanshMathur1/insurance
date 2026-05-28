export type ExtractedProfile = Record<string, string | number | string[] | undefined>;

function firstNumber(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : undefined;
}

function moneyField(text: string, pattern: RegExp, defaultSmallUnit: "lakh" | "rupees" = "lakh") {
  const match = text.match(pattern);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  const unit = match[2]?.toLowerCase();
  if (unit?.startsWith("cr")) return value * 10000000;
  if (unit === "k" || unit?.startsWith("thousand")) return value * 1000;
  if (unit?.startsWith("lakh") || unit?.startsWith("lac") || unit === "l") return value * 100000;
  if (defaultSmallUnit === "rupees") return value;
  if (value < 100000) return value * 100000;
  return value;
}

type FieldExtractor = {
  field: string;
  extract: (text: string) => any;
};

const PROFILE_EXTRACTORS: FieldExtractor[] = [
  { field: "age", extract: (t) => firstNumber(t, /(?:age|i am|i'm)\D{0,8}(\d{2})/) },
  { field: "annualIncome", extract: (t) => moneyField(t, /(?:earn|income|salary)\D{0,10}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/) },
  { field: "dependents", extract: (t) => firstNumber(t, /(\d+)\s+(?:kids|children|dependents)/) },
  { field: "outstandingLoans", extract: (t) => /\b(no|zero)\s+(?:loan|loans|debt)\b/.test(t) ? 0 : moneyField(t, /(?:loan|loans|debt)\D{0,10}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/) },
  { field: "existingLifeCover", extract: (t) => /\b(no|zero)\s+(?:existing life cover|life cover)\b/.test(t) ? 0 : moneyField(t, /(?:existing life cover|life cover already|current life cover)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/) },
  { field: "liquidAssets", extract: (t) => /\b(no|zero)\s+(?:liquid assets|savings|fd|fixed deposit)\b/.test(t) ? 0 : moneyField(t, /(?:liquid assets|savings|fd|fixed deposit)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/) },
  { field: "childrenEducationGoal", extract: (t) => moneyField(t, /(?:education goal|child education|children education)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/) },
  { field: "existingPersonalCover", extract: (t) => /\b(no|zero)\s+(?:personal cover|own cover|existing health cover)\b/.test(t) ? 0 : moneyField(t, /(?:personal cover|own cover|existing health cover)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/) },
  { field: "existingEmployerCover", extract: (t) => /\b(no|zero)\s+(?:employer cover|corporate cover|office cover|company cover)\b/.test(t) ? 0 : moneyField(t, /(?:employer cover|corporate cover|office cover|company cover)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/) },
  { field: "budget", extract: (t) => moneyField(t, /(?:budget|premium)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l|k|thousand)?/, "rupees") },
  { field: "preExistingDiseases", extract: (t) => /\b(no|none|no known)\s+(?:pre-existing|ped|disease|diseases|medical condition)/.test(t) ? ["none disclosed"] : t.includes("diabetes") ? ["diabetes"] : undefined },
  { field: "tobaccoStatus", extract: (t) => (t.includes("non-smoker") || t.includes("non smoker") || t.includes("no tobacco") || t.includes("don't smoke") || t.includes("do not smoke")) ? "no tobacco disclosed" : (t.includes("smok") || t.includes("tobacco")) ? "needs confirmation" : undefined },
  { field: "city", extract: (t) => t.match(/\b(mumbai|delhi|bengaluru|bangalore|chennai|hyderabad|pune|kolkata|ahmedabad|jaipur|lucknow|indore|surat)\b/)?.[1] },
  { field: "whoNeedsCover", extract: (t) => {
      const members = [
        t.includes("spouse") || t.includes("wife") || t.includes("husband") ? "spouse" : "",
        t.includes("child") || t.includes("kid") ? "children" : "",
        t.includes("parent") || t.includes("father") || t.includes("mother") ? "parents" : "",
        t.includes("family") ? "family" : "",
        t.includes("self") || t.includes("myself") || t.includes("for me") ? "self" : "",
      ].filter(Boolean);
      return members.length ? Array.from(new Set(members)) : undefined;
    }
  },
  { field: "preference", extract: (t) => t.includes("maximum coverage") || t.includes("max coverage") ? "maximum coverage" : t.includes("balanced") ? "balanced" : (t.includes("low premium") || t.includes("cheap")) ? "low premium" : undefined },
  { field: "desiredRetirementAge", extract: (t) => firstNumber(t, /(?:retire|retirement)\D{0,12}(\d{2})/) },
];

export function extractProfileFields(text: string): ExtractedProfile {
  const lowered = text.toLowerCase();
  const fields: ExtractedProfile = {};

  for (const extractor of PROFILE_EXTRACTORS) {
    const value = extractor.extract(lowered);
    if (value !== undefined) {
      fields[extractor.field] = value;
    }
  }

  return fields;
}

export function missingHealthFields(profile: ExtractedProfile) {
  const missing = [];
  if (!isPresent(profile.age)) missing.push("age");
  if (!isPresent(profile.city)) missing.push("city");
  if (!isPresent(profile.whoNeedsCover)) missing.push("who needs cover");
  if (!isPresent(profile.existingPersonalCover)) missing.push("existing personal health cover");
  if (!isPresent(profile.existingEmployerCover)) missing.push("employer health cover");
  if (!isPresent(profile.preExistingDiseases)) missing.push("known pre-existing diseases");
  if (!isPresent(profile.budget)) missing.push("budget");
  if (!isPresent(profile.preference)) missing.push("preference: low premium, balanced, or maximum coverage");
  return missing;
}

export function missingTermFields(profile: ExtractedProfile) {
  const missing = [];
  if (!isPresent(profile.age)) missing.push("age");
  if (!isPresent(profile.annualIncome)) missing.push("annual income");
  if (!isPresent(profile.dependents)) missing.push("number of dependents");
  if (!isPresent(profile.outstandingLoans)) missing.push("outstanding loans");
  if (!isPresent(profile.existingLifeCover)) missing.push("existing life cover");
  if (!isPresent(profile.liquidAssets)) missing.push("liquid savings/assets");
  if (!isPresent(profile.tobaccoStatus)) missing.push("smoking/tobacco status");
  if (!isPresent(profile.desiredRetirementAge)) missing.push("desired retirement age or policy duration");
  return missing;
}

function isPresent(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "";
}
