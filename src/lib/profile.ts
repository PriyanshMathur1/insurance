export type ExtractedProfile = Record<string, string | number | string[] | undefined>;

function firstNumber(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : undefined;
}

function moneyField(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  const unit = match[2]?.toLowerCase();
  if (unit?.startsWith("cr")) return value * 10000000;
  if (unit?.startsWith("lakh") || unit === "l" || value < 100000) return value * 100000;
  return value;
}

export function extractProfileFields(text: string): ExtractedProfile {
  const lowered = text.toLowerCase();
  const fields: ExtractedProfile = {};
  fields.age = firstNumber(lowered, /(?:age|i am|i'm)\D{0,8}(\d{2})/);
  fields.annualIncome = moneyField(lowered, /(?:earn|income|salary)\D{0,10}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/);
  fields.dependents = firstNumber(lowered, /(\d+)\s+(?:kids|children|dependents)/);
  fields.outstandingLoans = moneyField(lowered, /(?:loan|loans|debt)\D{0,10}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/);
  fields.existingLifeCover = moneyField(lowered, /(?:existing life cover|life cover already|current life cover)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/);
  fields.liquidAssets = moneyField(lowered, /(?:liquid assets|savings|fd|fixed deposit)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/);
  fields.childrenEducationGoal = moneyField(lowered, /(?:education goal|child education|children education)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/);
  fields.existingPersonalCover = moneyField(lowered, /(?:personal cover|own cover|existing health cover)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/);
  fields.existingEmployerCover = moneyField(lowered, /(?:employer cover|corporate cover|office cover|company cover)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/);
  fields.budget = moneyField(lowered, /(?:budget|premium)\D{0,12}(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/);
  if (lowered.includes("diabetes")) fields.preExistingDiseases = ["diabetes"];
  if (lowered.includes("smok") || lowered.includes("tobacco")) fields.tobaccoStatus = "needs confirmation";
  const cityMatch = lowered.match(/\b(mumbai|delhi|bengaluru|bangalore|chennai|hyderabad|pune|kolkata|ahmedabad|jaipur|lucknow|indore|surat)\b/);
  if (cityMatch) fields.city = cityMatch[1];
  const members = [
    lowered.includes("spouse") || lowered.includes("wife") || lowered.includes("husband") ? "spouse" : "",
    lowered.includes("child") || lowered.includes("kid") ? "children" : "",
    lowered.includes("parent") || lowered.includes("father") || lowered.includes("mother") ? "parents" : "",
    lowered.includes("family") ? "family" : "",
    lowered.includes("self") || lowered.includes("myself") || lowered.includes("for me") ? "self" : "",
  ].filter(Boolean);
  if (members.length) fields.whoNeedsCover = Array.from(new Set(members));
  if (lowered.includes("low premium") || lowered.includes("cheap")) fields.preference = "low premium";
  if (lowered.includes("balanced")) fields.preference = "balanced";
  if (lowered.includes("maximum coverage") || lowered.includes("max coverage")) fields.preference = "maximum coverage";
  const retirementAge = firstNumber(lowered, /(?:retire|retirement)\D{0,12}(\d{2})/);
  if (retirementAge) fields.desiredRetirementAge = retirementAge;
  return fields;
}

export function missingHealthFields(profile: ExtractedProfile) {
  const missing = [];
  if (!profile.age) missing.push("age");
  if (!profile.city) missing.push("city");
  if (!profile.whoNeedsCover) missing.push("who needs cover");
  if (!profile.existingPersonalCover) missing.push("existing personal health cover");
  if (!profile.existingEmployerCover) missing.push("employer health cover");
  if (!profile.preExistingDiseases) missing.push("known pre-existing diseases");
  if (!profile.budget) missing.push("budget");
  if (!profile.preference) missing.push("preference: low premium, balanced, or maximum coverage");
  return missing;
}

export function missingTermFields(profile: ExtractedProfile) {
  const missing = [];
  if (!profile.age) missing.push("age");
  if (!profile.annualIncome) missing.push("annual income");
  if (!profile.dependents) missing.push("number of dependents");
  if (!profile.outstandingLoans) missing.push("outstanding loans");
  if (!profile.existingLifeCover) missing.push("existing life cover");
  if (!profile.liquidAssets) missing.push("liquid savings/assets");
  if (!profile.tobaccoStatus) missing.push("smoking/tobacco status");
  if (!profile.desiredRetirementAge) missing.push("desired retirement age or policy duration");
  return missing;
}
