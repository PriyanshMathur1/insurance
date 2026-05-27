import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { parse } from "papaparse";
import { Prisma, PrismaClient, type InsuranceType } from "@prisma/client";
import { embedText, vectorLiteral } from "../src/lib/openai";

const prisma = new PrismaClient();
const defaultRoot = process.env.DATA_ROOT ?? "/data/raw";
const embedOnIngest = process.env.EMBED_ON_INGEST === "true";

type ProcessedSourceDocument = {
  source_id: string;
  insurance_type?: string;
  insurer_name?: string;
  product_name?: string;
  document_type?: string;
  title?: string;
  file_path?: string;
  cleaned_text?: string;
  status?: string;
};

type ProcessedDocumentChunk = {
  chunk_id?: string;
  source_id: string;
  insurance_type?: string;
  insurer_name?: string;
  product_name?: string;
  document_type?: string;
  section_title?: string;
  chunk_text?: string;
  chunk_index?: number;
  topics?: string[];
};

type ProcessedInsurer = {
  insurer_id?: string;
  insurer_name?: string;
  insurance_types?: string[];
  source_references?: string[];
};

async function walk(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : Promise.resolve([full]);
    }));
    return nested.flat();
  } catch {
    return [];
  }
}

function inferInsuranceType(file: string): InsuranceType {
  const lowered = file.toLowerCase();
  if (lowered.includes("/term/")) return "TERM";
  if (lowered.includes("/health/")) return "HEALTH";
  if (lowered.includes("/claims/")) return "CLAIMS";
  return "GENERAL";
}

function normalizeInsuranceType(value?: string): InsuranceType {
  const lowered = value?.toLowerCase() ?? "";
  if (lowered.includes("term") || lowered.includes("life")) return "TERM";
  if (lowered.includes("health") || lowered.includes("medical")) return "HEALTH";
  if (lowered.includes("claim")) return "CLAIMS";
  return "GENERAL";
}

function inferDocumentType(file: string) {
  const lowered = file.toLowerCase();
  if (lowered.includes("policy_wordings")) return "policy_wording";
  if (lowered.includes("brochures")) return "brochure";
  if (lowered.includes("claims")) return "claims";
  if (lowered.includes("irdai")) return "regulator";
  if (lowered.includes("riders")) return "rider";
  return "source";
}

function chunkText(text: string, max = 1400) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += max) chunks.push(text.slice(i, i + max));
  return chunks.filter((chunk) => chunk.trim().length > 20);
}

async function loadStructuredJson(file: string) {
  const text = await fs.readFile(file, "utf8");
  const json = JSON.parse(text);
  const records = Array.isArray(json) ? json : Object.values(json).flat();
  let count = 0;
  for (const raw of records as Array<Record<string, unknown>>) {
    const productName = String(raw.productName ?? raw.product_name ?? raw.name ?? "");
    const insurerName = String(raw.insurerName ?? raw.insurer_name ?? raw.insurer ?? "");
    if (!productName || !insurerName) continue;
    if (file.toLowerCase().includes("term")) {
      await prisma.termProduct.create({
        data: {
          insurerName,
          productName,
          entryAge: stringOrNull(raw.entryAge),
          maxMaturityAge: stringOrNull(raw.maxMaturityAge),
          policyTerm: stringOrNull(raw.policyTerm),
          sumAssuredRange: stringOrNull(raw.sumAssuredRange),
          premiumPaymentOptions: arrayOf(raw.premiumPaymentOptions),
          payoutOptions: arrayOf(raw.payoutOptions),
          deathBenefit: stringOrNull(raw.deathBenefit),
          terminalIllnessBenefit: stringOrNull(raw.terminalIllnessBenefit),
          accidentalDeathRider: stringOrNull(raw.accidentalDeathRider),
          criticalIllnessRider: stringOrNull(raw.criticalIllnessRider),
          waiverOfPremiumRider: stringOrNull(raw.waiverOfPremiumRider),
          suicideClause: stringOrNull(raw.suicideClause),
          claimProcess: stringOrNull(raw.claimProcess),
          sourceDocument: path.basename(file),
          metadata: raw as Prisma.InputJsonObject,
        },
      });
    } else {
      await prisma.healthProduct.create({
        data: {
          insurerName,
          productName,
          sumInsuredOptions: arrayOf(raw.sumInsuredOptions),
          entryAge: stringOrNull(raw.entryAge),
          renewability: stringOrNull(raw.renewability),
          initialWaitingPeriod: stringOrNull(raw.initialWaitingPeriod),
          preExistingDiseaseWaitingPeriod: stringOrNull(raw.preExistingDiseaseWaitingPeriod),
          specificDiseaseWaitingPeriod: stringOrNull(raw.specificDiseaseWaitingPeriod),
          roomRentLimit: stringOrNull(raw.roomRentLimit),
          icuLimit: stringOrNull(raw.icuLimit),
          coPay: stringOrNull(raw.coPay),
          deductible: stringOrNull(raw.deductible),
          restorationBenefit: stringOrNull(raw.restorationBenefit),
          noClaimBonus: stringOrNull(raw.noClaimBonus),
          majorExclusions: arrayOf(raw.majorExclusions),
          claimProcess: stringOrNull(raw.claimProcess),
          sourceDocument: path.basename(file),
          metadata: raw as Prisma.InputJsonObject,
        },
      });
    }
    count += 1;
  }
  return count;
}

async function loadProcessedProducts(file: string) {
  const text = await fs.readFile(file, "utf8");
  if (text.trim() === "[]") return 0;
  return loadStructuredJson(file);
}

async function loadProcessedInsurers(file: string) {
  const records = JSON.parse(await fs.readFile(file, "utf8")) as ProcessedInsurer[];
  const data = records.flatMap((raw) => {
    const name = raw.insurer_name?.trim();
    if (!name || name.length < 2) return [];
    return [{
      name,
      aliases: [],
      insuranceTypes: raw.insurance_types?.map(normalizeInsuranceType).filter(uniqueInsuranceType) ?? [],
      metadata: raw as Prisma.InputJsonObject,
    }];
  });

  let count = 0;
  for (let index = 0; index < data.length; index += 250) {
    const batch = data.slice(index, index + 250);
    await prisma.insurer.createMany({ data: batch, skipDuplicates: true });
    count += batch.length;
    console.log(`processed insurers: ${count}`);
  }
  return count;
}

async function loadProcessedSourceDocuments(file: string) {
  const sourceIdToDocumentId = new Map<string, string>();
  let count = 0;
  let batch: Array<ProcessedSourceDocument & { source_id: string; cleaned_text: string; filename: string; checksum: string }> = [];

  for await (const raw of readLenientJsonArray<ProcessedSourceDocument>(file)) {
    if (!raw.source_id || !raw.cleaned_text) continue;
    const filename = raw.file_path ? `${raw.file_path}#${raw.source_id}` : raw.source_id;
    const checksum = crypto.createHash("sha256").update(`${raw.source_id}:${raw.cleaned_text}`).digest("hex");
    batch.push({ ...raw, source_id: raw.source_id, cleaned_text: raw.cleaned_text, filename, checksum });

    if (batch.length >= 100) {
      await flushProcessedSourceBatch(batch, sourceIdToDocumentId);
      count += batch.length;
      console.log(`processed source documents: ${count}`);
      batch = [];
    }
  }

  if (batch.length) {
    await flushProcessedSourceBatch(batch, sourceIdToDocumentId);
    count += batch.length;
    console.log(`processed source documents: ${count}`);
  }

  return { count, sourceIdToDocumentId };
}

async function flushProcessedSourceBatch(
  batch: Array<ProcessedSourceDocument & { source_id: string; cleaned_text: string; filename: string; checksum: string }>,
  sourceIdToDocumentId: Map<string, string>,
) {
  await prisma.sourceDocument.createMany({
    skipDuplicates: true,
    data: batch.map((raw) => ({
        title: raw.title ?? raw.source_id,
        filename: raw.filename,
        sourceType: "processed_scrapegraph",
        insurerName: raw.insurer_name,
        productName: raw.product_name,
        insuranceType: normalizeInsuranceType(raw.insurance_type),
        documentType: raw.document_type ?? "processed_document",
        content: raw.cleaned_text,
        checksum: raw.checksum,
        metadata: raw as Prisma.InputJsonObject,
    })),
  });

  const rows = await prisma.sourceDocument.findMany({
    where: {
      OR: batch.map((raw) => ({ filename: raw.filename, checksum: raw.checksum })),
    },
    select: { id: true, filename: true },
  });
  const filenameToSourceId = new Map(batch.map((raw) => [raw.filename, raw.source_id]));
  for (const row of rows) {
    const sourceId = filenameToSourceId.get(row.filename);
    if (sourceId) sourceIdToDocumentId.set(sourceId, row.id);
  }
}

async function loadProcessedDocumentChunks(file: string, sourceIdToDocumentId: Map<string, string>) {
  let count = 0;
  let missingSources = 0;
  let batch: Array<{
    sourceDocumentId: string;
    chunkIndex: number;
    content: string;
    metadata: Prisma.InputJsonObject;
  }> = [];

  for await (const raw of readLenientJsonArray<ProcessedDocumentChunk>(file)) {
    if (!raw.source_id || !raw.chunk_text) continue;
    const sourceDocumentId = sourceIdToDocumentId.get(raw.source_id);
    if (!sourceDocumentId) {
      missingSources += 1;
      continue;
    }
    const chunkIndex = typeof raw.chunk_index === "number" ? raw.chunk_index : count;
    batch.push({
      sourceDocumentId,
      chunkIndex,
      content: raw.chunk_text,
      metadata: raw as Prisma.InputJsonObject,
    });

    if (batch.length >= 500) {
      await flushProcessedChunkBatch(batch);
      count += batch.length;
      console.log(`processed document chunks: ${count}`);
      batch = [];
    }
  }

  if (batch.length) {
    await flushProcessedChunkBatch(batch);
    count += batch.length;
    console.log(`processed document chunks: ${count}`);
  }
  return { count, missingSources };
}

async function flushProcessedChunkBatch(batch: Array<{
  sourceDocumentId: string;
  chunkIndex: number;
  content: string;
  metadata: Prisma.InputJsonObject;
}>) {
  await prisma.documentChunk.createMany({
    skipDuplicates: true,
    data: batch,
  });

  if (!embedOnIngest) return;

  for (const item of batch) {
    const row = await prisma.documentChunk.findUnique({
      where: {
        sourceDocumentId_chunkIndex: {
          sourceDocumentId: item.sourceDocumentId,
          chunkIndex: item.chunkIndex,
        },
      },
      select: { id: true },
    });
    if (!row) continue;
    const embedding = await embedText(item.content);
    if (embedding) {
      await prisma.$executeRawUnsafe(`UPDATE "DocumentChunk" SET "embedding" = $1::vector WHERE "id" = $2`, vectorLiteral(embedding), row.id);
    }
  }
}

async function ingestProcessedBundle(dataRoot: string) {
  const files = {
    sourceDocuments: path.join(dataRoot, "source_documents.json"),
    documentChunks: path.join(dataRoot, "document_chunks.json"),
    insurers: path.join(dataRoot, "insurers.json"),
    healthProducts: path.join(dataRoot, "health_products.json"),
    termProducts: path.join(dataRoot, "term_products.json"),
    cleaningReport: path.join(dataRoot, "cleaning_report.json"),
  };

  let productsLoaded = 0;
  let documentsLoaded = 0;
  let chunksCreated = 0;
  const errors: string[] = [];

  try {
    await loadProcessedInsurers(files.insurers);
  } catch (error) {
    errors.push(`${files.insurers}: ${errorMessage(error)}`);
  }

  for (const productFile of [files.healthProducts, files.termProducts]) {
    try {
      productsLoaded += await loadProcessedProducts(productFile);
    } catch (error) {
      errors.push(`${productFile}: ${errorMessage(error)}`);
    }
  }

  let sourceIdToDocumentId = new Map<string, string>();
  try {
    const result = await loadProcessedSourceDocuments(files.sourceDocuments);
    documentsLoaded = result.count;
    sourceIdToDocumentId = result.sourceIdToDocumentId;
  } catch (error) {
    errors.push(`${files.sourceDocuments}: ${errorMessage(error)}`);
  }

  try {
    const result = await loadProcessedDocumentChunks(files.documentChunks, sourceIdToDocumentId);
    chunksCreated = result.count;
    if (result.missingSources) errors.push(`document_chunks_missing_sources:${result.missingSources}`);
  } catch (error) {
    errors.push(`${files.documentChunks}: ${errorMessage(error)}`);
  }

  try {
    const cleaningReport = JSON.parse(await fs.readFile(files.cleaningReport, "utf8"));
    await prisma.ingestionLog.create({
      data: {
        status: errors.length ? "completed_with_errors" : "completed",
        dataRoot,
        filesProcessed: Object.keys(files).length,
        productsLoaded,
        documentsLoaded,
        chunksCreated,
        errors,
      },
    });
    console.log({ mode: "processed", productsLoaded, documentsLoaded, chunksCreated, cleaningReport: summarizeCleaningReport(cleaningReport), errors });
  } catch (error) {
    errors.push(`${files.cleaningReport}: ${errorMessage(error)}`);
    await prisma.ingestionLog.create({
      data: {
        status: "completed_with_errors",
        dataRoot,
        filesProcessed: Object.keys(files).length,
        productsLoaded,
        documentsLoaded,
        chunksCreated,
        errors,
      },
    });
    console.log({ mode: "processed", productsLoaded, documentsLoaded, chunksCreated, errors });
  }
}

async function ingestDocument(file: string) {
  const content = await fs.readFile(file, "utf8");
  const checksum = crypto.createHash("sha256").update(content).digest("hex");
  const source = await prisma.sourceDocument.upsert({
    where: { filename_checksum: { filename: file, checksum } },
    update: { content },
    create: {
      title: path.basename(file),
      filename: file,
      sourceType: path.extname(file).slice(1),
      insuranceType: inferInsuranceType(file),
      documentType: inferDocumentType(file),
      content,
      checksum,
    },
  });
  const chunks = chunkText(content);
  let created = 0;
  for (const [index, chunk] of chunks.entries()) {
    const row = await prisma.documentChunk.upsert({
      where: { sourceDocumentId_chunkIndex: { sourceDocumentId: source.id, chunkIndex: index } },
      update: { content: chunk },
      create: { sourceDocumentId: source.id, chunkIndex: index, content: chunk },
    });
    if (embedOnIngest) {
      const embedding = await embedText(chunk);
      if (embedding) {
        await prisma.$executeRawUnsafe(`UPDATE "DocumentChunk" SET "embedding" = $1::vector WHERE "id" = $2`, vectorLiteral(embedding), row.id);
      }
    }
    created += 1;
  }
  return created;
}

async function main() {
  const dataRoot = process.argv[2] ?? defaultRoot;
  if (await looksLikeProcessedBundle(dataRoot)) {
    await ingestProcessedBundle(dataRoot);
    return;
  }

  const files = await walk(dataRoot);
  let productsLoaded = 0;
  let documentsLoaded = 0;
  let chunksCreated = 0;
  const errors: string[] = [];

  for (const file of files) {
    try {
      const ext = path.extname(file).toLowerCase();
      if (file.includes("/structured/") && ext === ".json") {
        productsLoaded += await loadStructuredJson(file);
      } else if (ext === ".csv") {
        const parsed = parse(await fs.readFile(file, "utf8"), { header: true });
        const temp = file.replace(/\.csv$/i, ".json");
        await fs.writeFile(temp, JSON.stringify(parsed.data), "utf8");
        productsLoaded += await loadStructuredJson(temp);
        await fs.unlink(temp);
      } else if ([".md", ".txt", ".json"].includes(ext)) {
        chunksCreated += await ingestDocument(file);
        documentsLoaded += 1;
      }
    } catch (error) {
      errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await prisma.ingestionLog.create({
    data: {
      status: errors.length ? "completed_with_errors" : "completed",
      dataRoot,
      filesProcessed: files.length,
      productsLoaded,
      documentsLoaded,
      chunksCreated,
      errors,
    },
  });
  console.log({ filesProcessed: files.length, productsLoaded, documentsLoaded, chunksCreated, errors });
}

function stringOrNull(value: unknown) {
  return value == null ? null : String(value);
}

function arrayOf(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.includes(",")) return value.split(",").map((item) => item.trim());
  if (typeof value === "string" && value.length) return [value];
  return [];
}

async function looksLikeProcessedBundle(dataRoot: string) {
  const required = ["source_documents.json", "document_chunks.json", "insurers.json", "health_products.json", "term_products.json", "cleaning_report.json"];
  const checks = await Promise.all(required.map(async (file) => {
    try {
      await fs.access(path.join(dataRoot, file));
      return true;
    } catch {
      return false;
    }
  }));
  return checks.every(Boolean);
}

async function* readLenientJsonArray<T>(file: string): AsyncGenerator<T> {
  const text = await fs.readFile(file, "utf8");
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const slice = text.slice(start, index + 1);
        yield JSON.parse(slice) as T;
        start = -1;
      }
    }
  }
}

function summarizeCleaningReport(report: Record<string, unknown>) {
  return {
    totalLinesRead: report.total_lines_read,
    productsDetected: report.products_detected,
    warnings: report.warnings,
  };
}

function uniqueInsuranceType(value: InsuranceType, index: number, values: InsuranceType[]) {
  return values.indexOf(value) === index;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
