-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADVISOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "InsuranceType" AS ENUM ('HEALTH', 'TERM', 'MIXED', 'CLAIMS', 'GENERAL');

-- CreateEnum
CREATE TYPE "ChatIntent" AS ENUM ('HEALTH_ADVICE', 'TERM_ADVICE', 'CLAIMS', 'PRODUCT_COMPARISON', 'CONCEPT_EXPLANATION', 'PROFILE_RECOMMENDATION', 'GENERAL_EDUCATION');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'CLOSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detectedIntent" "ChatIntent" NOT NULL DEFAULT 'GENERAL_EDUCATION',
    "insuranceCategory" "InsuranceType" NOT NULL DEFAULT 'GENERAL',
    "extractedProfile" JSONB NOT NULL DEFAULT '{}',
    "complianceStatus" TEXT NOT NULL DEFAULT 'pending',
    "handoffStatus" "HandoffStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "city" TEXT,
    "age" INTEGER,
    "profileData" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthProfile" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "whoNeedsCover" TEXT[],
    "familyMemberAges" JSONB NOT NULL DEFAULT '{}',
    "existingPersonalCover" INTEGER,
    "existingEmployerCover" INTEGER,
    "preExistingDiseases" TEXT[],
    "budgetPerYear" INTEGER,
    "preference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermProfile" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "annualIncome" INTEGER,
    "dependents" INTEGER,
    "outstandingLoans" INTEGER,
    "existingLifeCover" INTEGER,
    "liquidAssets" INTEGER,
    "childrenEducationGoal" INTEGER,
    "tobaccoStatus" TEXT,
    "desiredRetirementAge" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insurer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "insuranceTypes" "InsuranceType"[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insurer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthProduct" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT,
    "insurerName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sumInsuredOptions" TEXT[],
    "entryAge" TEXT,
    "renewability" TEXT,
    "initialWaitingPeriod" TEXT,
    "preExistingDiseaseWaitingPeriod" TEXT,
    "specificDiseaseWaitingPeriod" TEXT,
    "roomRentLimit" TEXT,
    "icuLimit" TEXT,
    "coPay" TEXT,
    "deductible" TEXT,
    "restorationBenefit" TEXT,
    "noClaimBonus" TEXT,
    "majorExclusions" TEXT[],
    "claimProcess" TEXT,
    "sourceDocument" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermProduct" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT,
    "insurerName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "entryAge" TEXT,
    "maxMaturityAge" TEXT,
    "policyTerm" TEXT,
    "sumAssuredRange" TEXT,
    "premiumPaymentOptions" TEXT[],
    "payoutOptions" TEXT[],
    "deathBenefit" TEXT,
    "terminalIllnessBenefit" TEXT,
    "accidentalDeathRider" TEXT,
    "criticalIllnessRider" TEXT,
    "waiverOfPremiumRider" TEXT,
    "suicideClause" TEXT,
    "claimProcess" TEXT,
    "sourceDocument" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "insurerName" TEXT,
    "productName" TEXT,
    "insuranceType" "InsuranceType" NOT NULL,
    "documentType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "insuranceType" "InsuranceType" NOT NULL,
    "recommendedCover" TEXT,
    "reasoning" TEXT NOT NULL,
    "riskFlags" TEXT[],
    "productMatches" JSONB NOT NULL DEFAULT '[]',
    "sourceCitations" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCheck" (
    "id" TEXT NOT NULL,
    "chatId" TEXT,
    "responseText" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "issues" TEXT[],
    "revisedText" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanHandoff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "insuranceType" "InsuranceType" NOT NULL,
    "userProfileSummary" TEXT NOT NULL,
    "conversationSummary" TEXT NOT NULL,
    "recommendedCover" TEXT,
    "productsDiscussed" JSONB NOT NULL DEFAULT '[]',
    "riskFlags" TEXT[],
    "reason" TEXT NOT NULL,
    "status" "HandoffStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionLog" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dataRoot" TEXT NOT NULL,
    "filesProcessed" INTEGER NOT NULL DEFAULT 0,
    "productsLoaded" INTEGER NOT NULL DEFAULT 0,
    "documentsLoaded" INTEGER NOT NULL DEFAULT 0,
    "chunksCreated" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Chat_userId_updatedAt_idx" ON "Chat"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Chat_insuranceCategory_idx" ON "Chat"("insuranceCategory");

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_userId_key" ON "CustomerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthProfile_customerProfileId_key" ON "HealthProfile"("customerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "TermProfile_customerProfileId_key" ON "TermProfile"("customerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Insurer_name_key" ON "Insurer"("name");

-- CreateIndex
CREATE INDEX "HealthProduct_insurerName_idx" ON "HealthProduct"("insurerName");

-- CreateIndex
CREATE INDEX "HealthProduct_productName_idx" ON "HealthProduct"("productName");

-- CreateIndex
CREATE INDEX "TermProduct_insurerName_idx" ON "TermProduct"("insurerName");

-- CreateIndex
CREATE INDEX "TermProduct_productName_idx" ON "TermProduct"("productName");

-- CreateIndex
CREATE INDEX "SourceDocument_insuranceType_documentType_idx" ON "SourceDocument"("insuranceType", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_filename_checksum_key" ON "SourceDocument"("filename", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_sourceDocumentId_chunkIndex_key" ON "DocumentChunk"("sourceDocumentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "HumanHandoff_status_createdAt_idx" ON "HumanHandoff"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthProfile" ADD CONSTRAINT "HealthProfile_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermProfile" ADD CONSTRAINT "TermProfile_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthProduct" ADD CONSTRAINT "HealthProduct_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermProduct" ADD CONSTRAINT "TermProduct_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanHandoff" ADD CONSTRAINT "HumanHandoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanHandoff" ADD CONSTRAINT "HumanHandoff_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
