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
  if (/\b(no|zero)\s+(?:loan|loans|debt)\b/.test(lowered)) fields.outstandingLoans = 0;
  if (/\b(no|zero)\s+(?:existing life cover|life cover)\b/.test(lowered)) fields.existingLifeCover = 0;
  if (/\b(no|zero)\s+(?:liquid assets|savings|fd|fixed deposit)\b/.test(lowered)) fields.liquidAssets = 0;
  if (/\b(no|zero)\s+(?:personal cover|own cover|existing health cover)\b/.test(lowered)) fields.existingPersonalCover = 0;
  if (/\b(no|zero)\s+(?:employer cover|corporate cover|office cover|company cover)\b/.test(lowered)) fields.existingEmployerCover = 0;
  if (lowered.includes("diabetes")) fields.preExistingDiseases = ["diabetes"];
  if (/\b(no|none|no known)\s+(?:pre-existing|ped|disease|diseases|medical condition)/.test(lowered)) fields.preExistingDiseases = ["none disclosed"];
  if (lowered.includes("non-smoker") || lowered.includes("non smoker") || lowered.includes("no tobacco") || lowered.includes("don't smoke") || lowered.includes("do not smoke")) fields.tobaccoStatus = "no tobacco disclosed";
  else if (lowered.includes("smok") || lowered.includes("tobacco")) fields.tobaccoStatus = "needs confirmation";
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
