import { PrismaClient, type InsuranceType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);
  const adminHash = await bcrypt.hash("admin12345", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@priyanshinsurance.local" },
    update: {},
    create: { email: "demo@priyanshinsurance.local", name: "Demo User", passwordHash },
  });

  await prisma.user.upsert({
    where: { email: "advisor@priyanshinsurance.local" },
    update: { role: "ADMIN" },
    create: { email: "advisor@priyanshinsurance.local", name: "Advisor Admin", passwordHash: adminHash, role: "ADMIN" },
  });

  const insurers = ["HDFC ERGO", "Star Health", "Care Health", "ICICI Prudential", "HDFC Life", "Max Life"];
  for (const name of insurers) {
    await prisma.insurer.upsert({
      where: { name },
      update: {},
      create: {
        name,
        aliases: [],
        insuranceTypes: name.includes("Life") || name.includes("Prudential") || name.includes("Max") ? ["TERM"] : ["HEALTH"],
      },
    });
  }

  await prisma.healthProduct.createMany({
    skipDuplicates: true,
    data: [
      {
        insurerName: "HDFC ERGO",
        productName: "Mock Optima Secure",
        sumInsuredOptions: ["10 lakh", "15 lakh", "25 lakh"],
        entryAge: "Adult 18+",
        renewability: "Lifelong",
        initialWaitingPeriod: "30 days",
        preExistingDiseaseWaitingPeriod: "36 months",
        specificDiseaseWaitingPeriod: "24 months",
        roomRentLimit: "No standard room rent sub-limit in mock data",
        icuLimit: "No standard ICU sub-limit in mock data",
        coPay: "Data missing",
        deductible: "Optional",
        restorationBenefit: "Available",
        noClaimBonus: "Available",
        majorExclusions: ["Non-disclosure", "standard permanent exclusions"],
        claimProcess: "Cashless or reimbursement as per network and documents",
        sourceDocument: "mock-health-products.md",
      },
      {
        insurerName: "Star Health",
        productName: "Mock Family Health Optima",
        sumInsuredOptions: ["5 lakh", "10 lakh", "20 lakh"],
        entryAge: "Adult 18+",
        renewability: "Lifelong",
        initialWaitingPeriod: "30 days",
        preExistingDiseaseWaitingPeriod: "48 months",
        specificDiseaseWaitingPeriod: "24 months",
        roomRentLimit: "Data missing",
        icuLimit: "Data missing",
        coPay: "May apply for senior ages in mock data",
        deductible: "Data missing",
        restorationBenefit: "Available",
        noClaimBonus: "Available",
        majorExclusions: ["Non-disclosure", "waiting-period conditions"],
        claimProcess: "Insurer or TPA claim process",
        sourceDocument: "mock-health-products.md",
      },
      {
        insurerName: "Care Health",
        productName: "Mock Care Supreme",
        sumInsuredOptions: ["7 lakh", "10 lakh", "25 lakh"],
        entryAge: "Adult 18+",
        renewability: "Lifelong",
        initialWaitingPeriod: "30 days",
        preExistingDiseaseWaitingPeriod: "36 months",
        specificDiseaseWaitingPeriod: "24 months",
        roomRentLimit: "Single private room in mock data",
        icuLimit: "Data missing",
        coPay: "Data missing",
        deductible: "Optional",
        restorationBenefit: "Available",
        noClaimBonus: "Available",
        majorExclusions: ["Non-disclosure", "cosmetic treatment unless medically necessary"],
        claimProcess: "Cashless or reimbursement",
        sourceDocument: "mock-health-products.md",
      },
    ],
  });

  await prisma.termProduct.createMany({
    skipDuplicates: true,
    data: [
      {
        insurerName: "HDFC Life",
        productName: "Mock Click 2 Protect",
        entryAge: "18-65",
        maxMaturityAge: "85",
        policyTerm: "5-40 years",
        sumAssuredRange: "50 lakh and above",
        premiumPaymentOptions: ["regular", "limited"],
        payoutOptions: ["lump sum", "monthly income"],
        deathBenefit: "Sum assured on death as per option",
        terminalIllnessBenefit: "Available in mock data",
        accidentalDeathRider: "Optional",
        criticalIllnessRider: "Optional",
        waiverOfPremiumRider: "Optional",
        suicideClause: "As per policy wording; usually limited benefit in first year",
        claimProcess: "Submit claim form, death certificate, policy documents, and insurer requirements",
        sourceDocument: "mock-term-products.md",
      },
      {
        insurerName: "ICICI Prudential",
        productName: "Mock iProtect Smart",
        entryAge: "18-65",
        maxMaturityAge: "85",
        policyTerm: "5-40 years",
        sumAssuredRange: "50 lakh and above",
        premiumPaymentOptions: ["regular", "limited", "single"],
        payoutOptions: ["lump sum", "income", "increasing income"],
        deathBenefit: "Sum assured on death as per option",
        terminalIllnessBenefit: "Available in mock data",
        accidentalDeathRider: "Optional",
        criticalIllnessRider: "Optional",
        waiverOfPremiumRider: "Optional",
        suicideClause: "As per policy wording; usually limited benefit in first year",
        claimProcess: "Insurer claim process and documentation required",
        sourceDocument: "mock-term-products.md",
      },
      {
        insurerName: "Max Life",
        productName: "Mock Smart Secure Plus",
        entryAge: "18-60",
        maxMaturityAge: "85",
        policyTerm: "10-45 years",
        sumAssuredRange: "25 lakh and above",
        premiumPaymentOptions: ["regular", "limited"],
        payoutOptions: ["lump sum", "monthly income"],
        deathBenefit: "Sum assured on death as per option",
        terminalIllnessBenefit: "Data missing",
        accidentalDeathRider: "Optional",
        criticalIllnessRider: "Optional",
        waiverOfPremiumRider: "Optional",
        suicideClause: "As per policy wording; usually limited benefit in first year",
        claimProcess: "Insurer claim process and documentation required",
        sourceDocument: "mock-term-products.md",
      },
    ],
  });

  const docs: Array<{ title: string; filename: string; insuranceType: InsuranceType; documentType: string; content: string }> = [
    {
      title: "Mock Health Policy Wording Notes",
      filename: "mock-health-policy-wording.md",
      insuranceType: "HEALTH",
      documentType: "policy_wording",
      content: "Mock data: Health insurance policies commonly include an initial waiting period, pre-existing disease waiting period, specific disease waiting period, room rent terms, exclusions, cashless and reimbursement claim process. Verify exact terms from source documents.",
    },
    {
      title: "Mock Term Policy Wording Notes",
      filename: "mock-term-policy-wording.md",
      insuranceType: "TERM",
      documentType: "policy_wording",
      content: "Mock data: Term insurance claim outcomes depend on truthful medical and tobacco disclosure, policy exclusions, suicide clause wording, and documentation. Riders may include critical illness, accidental death benefit, and waiver of premium.",
    },
    {
      title: "Mock IRDAI Consumer Education Notes",
      filename: "mock-irdai-consumer-notes.md",
      insuranceType: "GENERAL",
      documentType: "regulator",
      content: "Mock data: Consumers should read policy wordings, exclusions, waiting periods, claim procedures, and grievance escalation routes. Product suitability should be reviewed before final purchase.",
    },
  ];

  for (const doc of docs) {
    const source = await prisma.sourceDocument.upsert({
      where: { filename_checksum: { filename: doc.filename, checksum: `seed-${doc.filename}` } },
      update: { content: doc.content },
      create: { ...doc, checksum: `seed-${doc.filename}`, sourceType: "mock" },
    });
    await prisma.documentChunk.upsert({
      where: { sourceDocumentId_chunkIndex: { sourceDocumentId: source.id, chunkIndex: 0 } },
      update: { content: doc.content },
      create: { sourceDocumentId: source.id, chunkIndex: 0, content: doc.content },
    });
  }

  const chat = await prisma.chat.create({
    data: {
      userId: user.id,
      title: "Family health cover",
      insuranceCategory: "HEALTH",
      detectedIntent: "HEALTH_ADVICE",
      messages: {
        create: [
          { role: "USER", userId: user.id, content: "Which health insurance is good for my family in Mumbai?" },
          { role: "ASSISTANT", content: "For a Mumbai family floater, start by evaluating 15-25 lakh cover, waiting periods, room rent, co-pay, restoration, exclusions, and claim process. Final purchase decisions should be confirmed with a licensed insurance advisor." },
        ],
      },
    },
  });

  await prisma.chat.create({
    data: {
      userId: user.id,
      title: "Term cover estimate",
      insuranceCategory: "TERM",
      detectedIntent: "TERM_ADVICE",
      messages: {
        create: [
          { role: "USER", userId: user.id, content: "I earn 15 lakh and have 2 kids, what term cover do I need?" },
          { role: "ASSISTANT", content: "Indicatively, term cover starts around annual income x 10-15 plus loans and goals, less existing cover and liquid assets. Share loans and existing cover for a sharper estimate." },
        ],
      },
    },
  });

  await prisma.humanHandoff.create({
    data: {
      userId: user.id,
      chatId: chat.id,
      insuranceType: "HEALTH",
      userProfileSummary: "Demo user evaluating family health insurance.",
      conversationSummary: "Asked for family health cover options in Mumbai.",
      recommendedCover: "15-25 lakh",
      productsDiscussed: [],
      riskFlags: ["Demo handoff"],
      reason: "Seed handoff for advisor dashboard review.",
    },
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
