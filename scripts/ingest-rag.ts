/**
 * ingest-rag.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Feeds the Ditto RAG pipeline output (6 JSONL files) directly into the
 * Insurance AI's Prisma database (SourceDocument + DocumentChunk + Insurer +
 * HealthProduct).
 *
 * Run:
 *   OPENAI_DISABLED=false npm run ingest:rag        ← with embeddings (recommended)
 *   npm run ingest:rag                               ← keyword-search only
 *
 * Safe to re-run — all upserts use skipDuplicates / checksum deduplication.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { Prisma, PrismaClient } from "@prisma/client";
import { embedText, vectorLiteral } from "../src/lib/openai";

// ── Config ────────────────────────────────────────────────────────────────────
const RAG_DIR = path.resolve(
  process.env.RAG_DIR ??
    "/Users/priyansh/Desktop/Code/priyansh-insurance/data/rag"
);
const EMBED = process.env.OPENAI_DISABLED !== "true";
const EMBED_BATCH = 20;   // chunks per embedding batch
const EMBED_CONCURRENCY = 3;
const EMBED_DELAY_MS = 120; // ms between batches (rate-limit safety)

const prisma = new PrismaClient();

// ── Insurance type normalisation ──────────────────────────────────────────────
function toInsuranceType(value: string | undefined) {
  const v = (value ?? "").toLowerCase();
  if (v === "term") return "TERM" as const;
  if (v === "health") return "HEALTH" as const;
  if (v === "claims") return "CLAIMS" as const;
  return "GENERAL" as const;
}

// ── Content-type → documentType ───────────────────────────────────────────────
function toDocumentType(contentType: string): string {
  const map: Record<string, string> = {
    comparison:       "comparison",
    faq:              "faq",
    review:           "review",
    cashless_claim:   "claims",
    reimbursement:    "claims",
    hospitalization:  "claims",
    grievance:        "claims",
    claims_process:   "claims",
    policy_feature:   "policy_feature",
    customer_support: "support",
  };
  return map[contentType] ?? "source";
}

// ── JSONL reader ──────────────────────────────────────────────────────────────
async function* readJsonl<T>(file: string): AsyncGenerator<T> {
  if (!fs.existsSync(file)) {
    console.warn(`  ⚠  File not found, skipping: ${file}`);
    return;
  }
  const rl = readline.createInterface({
    input: fs.createReadStream(file, "utf8"),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed) as T;
    } catch {
      // skip malformed lines
    }
  }
}

// ── Checksum ──────────────────────────────────────────────────────────────────
function checksum(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// ── Embedding with batching & rate-limit protection ───────────────────────────
async function embedBatch(items: Array<{ id: string; content: string }>) {
  if (!EMBED) return;

  let currentIndex = 0;

  const workers = Array.from({ length: EMBED_CONCURRENCY }, async () => {
    let processedInCurrentBatch = 0;
    while (currentIndex < items.length) {
      const item = items[currentIndex++];
      if (!item) continue;

      const vec = await embedText(item.content);
      if (vec) {
        await prisma.$executeRawUnsafe(
          `UPDATE "DocumentChunk" SET "embedding" = $1::vector WHERE "id" = $2`,
          vectorLiteral(vec),
          item.id
        );
      }

      processedInCurrentBatch++;
      // Apply delay after every EMBED_BATCH items processed by this worker
      if (processedInCurrentBatch >= EMBED_BATCH && currentIndex < items.length) {
        processedInCurrentBatch = 0;
        await new Promise((r) => setTimeout(r, EMBED_DELAY_MS));
      }
    }
  });

  await Promise.all(workers);
}

// In-memory cache of existing source documents and chunks to avoid 50,000 DB roundtrips.
const docCache = new Map<string, { id: string; checksum: string }>(); // filename -> { id, checksum }
const chunkCache = new Map<string, string>(); // `${sourceDocumentId}_${chunkIndex}` -> chunkId

// ── Upsert helpers ────────────────────────────────────────────────────────────
async function upsertSourceDoc(args: {
  title: string;
  filename: string;
  sourceType: string;
  insurerName?: string;
  productName?: string;
  insuranceType: "HEALTH" | "TERM" | "CLAIMS" | "GENERAL" | "MIXED";
  documentType: string;
  content: string;
  metadata?: Prisma.InputJsonObject;
}) {
  const cs = checksum(args.content);
  const cached = docCache.get(args.filename);
  if (cached && cached.checksum === cs) {
    return cached.id;
  }

  // Delete old version with same filename (content changed)
  if (cached && cached.checksum !== cs) {
    await prisma.sourceDocument.deleteMany({
      where: { filename: args.filename, checksum: { not: cs } },
    });
    docCache.delete(args.filename);
  }

  const doc = await prisma.sourceDocument.create({
    data: {
      title: args.title,
      filename: args.filename,
      sourceType: args.sourceType,
      insurerName: args.insurerName ?? null,
      productName: args.productName ?? null,
      insuranceType: args.insuranceType,
      documentType: args.documentType,
      content: args.content,
      checksum: cs,
      metadata: args.metadata ?? {},
    },
  });
  docCache.set(args.filename, { id: doc.id, checksum: cs });
  return doc.id;
}

async function upsertChunk(args: {
  sourceDocumentId: string;
  chunkIndex: number;
  content: string;
  metadata?: Prisma.InputJsonObject;
}): Promise<string> {
  const cacheKey = `${args.sourceDocumentId}_${args.chunkIndex}`;
  const cachedId = chunkCache.get(cacheKey);
  if (cachedId) return cachedId;

  const chunk = await prisma.documentChunk.create({
    data: {
      sourceDocumentId: args.sourceDocumentId,
      chunkIndex: args.chunkIndex,
      content: args.content,
      metadata: args.metadata ?? {},
    },
  });
  chunkCache.set(cacheKey, chunk.id);
  return chunk.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Insurer profiles → Insurer table + HealthProduct table
// ─────────────────────────────────────────────────────────────────────────────
async function ingestInsurerProfiles() {
  console.log("\n📋 Step 1: Insurer profiles");
  const file = path.join(RAG_DIR, "insurer_profiles.jsonl");
  let insurers = 0;
  let products = 0;

  for await (const rec of readJsonl<Record<string, any>>(file)) {
    const name: string = rec.insurance_company ?? "";
    if (!name) continue;

    const insType = toInsuranceType(rec.insurance_type);
    const meta = rec.metadata ?? {};

    // Upsert into Insurer
    await prisma.insurer.upsert({
      where: { name },
      update: {
        aliases: [],
        insuranceTypes: insType === "HEALTH"
          ? ["HEALTH"]
          : insType === "TERM"
            ? ["TERM"]
            : ["HEALTH", "TERM"],
        metadata: meta as Prisma.InputJsonObject,
      },
      create: {
        name,
        aliases: [],
        insuranceTypes: insType === "HEALTH"
          ? ["HEALTH"]
          : insType === "TERM"
            ? ["TERM"]
            : ["HEALTH", "TERM"],
        metadata: meta as Prisma.InputJsonObject,
      },
    });
    insurers++;

    // Also create a HealthProduct entry with CSR/ICR/hospital stats
    if (insType === "HEALTH") {
      await prisma.healthProduct.upsert({
        where: {
          // Use findFirst + conditional upsert workaround since there's no
          // unique constraint on insurerName+productName
          id: (
            await prisma.healthProduct.findFirst({
              where: { insurerName: name, productName: `${name} — Overview` },
              select: { id: true },
            })
          )?.id ?? "nonexistent",
        },
        update: {
          metadata: meta as Prisma.InputJsonObject,
        },
        create: {
          insurerName: name,
          productName: `${name} — Overview`,
          sumInsuredOptions: [],
          sourceDocument: "insurer_profiles.jsonl",
          metadata: {
            claim_settlement_ratio: meta.claim_settlement_ratio ?? "",
            network_hospitals: meta.network_hospitals ?? "",
            incurred_claim_ratio: meta.incurred_claim_ratio ?? "",
            source: meta.source ?? "",
          } as Prisma.InputJsonObject,
        },
      });
      products++;
    }
  }

  console.log(`   ✓ ${insurers} insurers  |  ${products} health product overviews`);
  return { insurers, products };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: FAQ / Glossary dataset
// ─────────────────────────────────────────────────────────────────────────────
async function ingestFaqs() {
  console.log("\n❓ Step 2: FAQ / Glossary dataset");
  const file = path.join(RAG_DIR, "faq_dataset.jsonl");
  let docs = 0;
  let chunks = 0;
  const toEmbed: Array<{ id: string; content: string }> = [];

  for await (const rec of readJsonl<Record<string, any>>(file)) {
    const content: string = rec.content ?? `Q: ${rec.question}\n\nA: ${rec.answer}`;
    const title: string = rec.title ?? rec.question ?? "FAQ";
    const filename = `rag/faq/${rec.id ?? checksum(content).slice(0, 12)}`;
    const insType = toInsuranceType(rec.insurance_type);
    const meta = {
      content_type: rec.content_type ?? "faq",
      category: rec.category ?? "glossary",
      tags: rec.tags ?? [],
      source: rec.metadata?.source ?? "",
      priority_score: rec.metadata?.priority_score ?? 8,
    };

    const docId = await upsertSourceDoc({
      title,
      filename,
      sourceType: "rag_faq",
      insurerName: rec.insurance_company || undefined,
      insuranceType: insType,
      documentType: "faq",
      content,
      metadata: meta as Prisma.InputJsonObject,
    });
    docs++;

    const chunkId = await upsertChunk({
      sourceDocumentId: docId,
      chunkIndex: 0,
      content,
      metadata: meta as Prisma.InputJsonObject,
    });
    chunks++;
    toEmbed.push({ id: chunkId, content });
  }

  console.log(`   ✓ ${docs} docs  |  ${chunks} chunks  |  embedding ${EMBED ? "enabled" : "skipped"}`);
  if (EMBED) {
    process.stdout.write("   ↻ Generating embeddings ...");
    await embedBatch(toEmbed);
    console.log(" done");
  }
  return { docs, chunks };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: Claims process dataset
// ─────────────────────────────────────────────────────────────────────────────
async function ingestClaims() {
  console.log("\n⚕️  Step 3: Claims process dataset");
  const file = path.join(RAG_DIR, "claims_process_dataset.jsonl");
  let docs = 0;
  let chunks = 0;
  const toEmbed: Array<{ id: string; content: string }> = [];

  for await (const rec of readJsonl<Record<string, any>>(file)) {
    const content: string = rec.content ?? "";
    if (content.length < 50) continue;
    const title: string = rec.title ?? "Claims Process";
    const filename = `rag/claims/${rec.id ?? checksum(content).slice(0, 12)}`;
    const insType = toInsuranceType(rec.insurance_type);
    const meta = {
      content_type: rec.content_type,
      tags: rec.tags ?? [],
      source: rec.metadata?.source ?? "",
      priority_score: rec.metadata?.priority_score ?? 9,
    };

    const docId = await upsertSourceDoc({
      title,
      filename,
      sourceType: "rag_claims",
      insurerName: rec.insurance_company || undefined,
      insuranceType: insType,
      documentType: toDocumentType(rec.content_type),
      content,
      metadata: meta as Prisma.InputJsonObject,
    });
    docs++;

    const chunkId = await upsertChunk({
      sourceDocumentId: docId,
      chunkIndex: 0,
      content,
      metadata: meta as Prisma.InputJsonObject,
    });
    chunks++;
    toEmbed.push({ id: chunkId, content });
  }

  console.log(`   ✓ ${docs} docs  |  ${chunks} chunks`);
  if (EMBED && toEmbed.length) {
    process.stdout.write("   ↻ Generating embeddings ...");
    await embedBatch(toEmbed);
    console.log(" done");
  }
  return { docs, chunks };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Review sentiment dataset (grouped by insurer)
// ─────────────────────────────────────────────────────────────────────────────
async function ingestReviews() {
  console.log("\n⭐ Step 4: Review sentiment dataset");
  const file = path.join(RAG_DIR, "review_sentiment_dataset.jsonl");

  // Group reviews by insurer
  const byInsurer = new Map<string, Array<Record<string, any>>>();
  for await (const rec of readJsonl<Record<string, any>>(file)) {
    const insurer = rec.insurance_company ?? "General";
    if (!byInsurer.has(insurer)) byInsurer.set(insurer, []);
    byInsurer.get(insurer)!.push(rec);
  }

  let docs = 0;
  let chunks = 0;
  const toEmbed: Array<{ id: string; content: string }> = [];

  for (const [insurer, reviews] of byInsurer) {
    const insType = toInsuranceType(reviews[0]?.insurance_type);
    const docFilename = `rag/reviews/${insurer.toLowerCase().replace(/\s+/g, "-")}`;
    const docContent = reviews.map((r) => r.content ?? "").join("\n\n---\n\n");
    const docTitle = `${insurer} — Customer Reviews (${reviews.length})`;

    const docId = await upsertSourceDoc({
      title: docTitle,
      filename: docFilename,
      sourceType: "rag_reviews",
      insurerName: insurer,
      insuranceType: insType,
      documentType: "review",
      content: docContent,
      metadata: {
        insurer,
        total_reviews: reviews.length,
        positive: reviews.filter((r) => r.metadata?.review_sentiment === "positive").length,
        negative: reviews.filter((r) => r.metadata?.review_sentiment === "negative").length,
        neutral: reviews.filter((r) => r.metadata?.review_sentiment === "neutral").length,
        claim_settlement_ratio: reviews[0]?.metadata?.claim_settlement_ratio ?? "",
        network_hospitals: reviews[0]?.metadata?.network_hospitals ?? "",
        incurred_claim_ratio: reviews[0]?.metadata?.incurred_claim_ratio ?? "",
      } as Prisma.InputJsonObject,
    });
    docs++;

    // Each review = its own chunk
    for (const [i, rev] of reviews.entries()) {
      const reviewText = rev.content ?? "";
      if (reviewText.length < 15) continue;
      const chunkId = await upsertChunk({
        sourceDocumentId: docId,
        chunkIndex: i,
        content: reviewText,
        metadata: {
          reviewer_name: rev.reviewer_name ?? "",
          sentiment: rev.metadata?.review_sentiment ?? "neutral",
          topics: rev.metadata?.topics ?? [],
          tags: rev.tags ?? [],
        } as Prisma.InputJsonObject,
      });
      chunks++;
      toEmbed.push({ id: chunkId, content: reviewText });
    }
  }

  console.log(`   ✓ ${docs} docs  |  ${chunks} chunks  |  ${byInsurer.size} insurers`);
  if (EMBED && toEmbed.length) {
    process.stdout.write("   ↻ Generating embeddings ...");
    await embedBatch(toEmbed);
    console.log(" done");
  }
  return { docs, chunks };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5: Comparison dataset
// ─────────────────────────────────────────────────────────────────────────────
async function ingestComparisons() {
  console.log("\n🔄 Step 5: Comparison dataset (7,305 records)");
  const file = path.join(RAG_DIR, "comparison_dataset.jsonl");
  let docs = 0;
  let chunks = 0;
  let skipped = 0;

  const docsToCreate: Array<any> = [];
  const chunksToCreate: Array<any> = [];
  const toEmbed: Array<{ id: string; content: string }> = [];

  for await (const rec of readJsonl<Record<string, any>>(file)) {
    const content: string = rec.content ?? "";
    if (content.length < 100) { skipped++; continue; }

    const planA: string = rec.plan_a ?? "";
    const planB: string = rec.plan_b ?? "";
    const title: string = rec.title ?? `${planA} vs ${planB}`;
    const filename = `rag/compare/${rec.id ?? checksum(content).slice(0, 12)}`;
    const insType = toInsuranceType(rec.insurance_type);
    const meta = {
      content_type: "comparison",
      plan_a: planA,
      plan_b: planB,
      conclusion: rec.conclusion ?? "",
      tags: rec.tags ?? [],
      source: rec.metadata?.source ?? "",
      priority_score: rec.metadata?.priority_score ?? 8,
      features_compared: rec.features_compared ?? {},
    };

    const docContent = content.slice(0, 4000);
    const cs = checksum(docContent);

    let docId: string;
    const cachedDoc = docCache.get(filename);

    if (cachedDoc && cachedDoc.checksum === cs) {
      docId = cachedDoc.id;
    } else {
      if (cachedDoc && cachedDoc.checksum !== cs) {
        await prisma.sourceDocument.deleteMany({
          where: { filename, checksum: { not: cs } },
        });
        docCache.delete(filename);
      }

      docId = `cmp_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      docsToCreate.push({
        id: docId,
        title,
        filename,
        sourceType: "rag_comparison",
        insurerName: rec.insurance_company || null,
        productName: `${planA} vs ${planB}`,
        insuranceType: insType,
        documentType: "comparison",
        content: docContent,
        checksum: cs,
        metadata: meta,
      });
      docCache.set(filename, { id: docId, checksum: cs });
    }
    docs++;

    const chunkContent = content.slice(0, 2500);
    const cacheKey = `${docId}_0`;
    let chunkId = chunkCache.get(cacheKey);

    if (!chunkId) {
      chunkId = `chk_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      chunksToCreate.push({
        id: chunkId,
        sourceDocumentId: docId,
        chunkIndex: 0,
        content: chunkContent,
        metadata: meta,
      });
      chunkCache.set(cacheKey, chunkId);
    }
    chunks++;
    toEmbed.push({ id: chunkId, content: chunkContent });
  }

  if (docsToCreate.length) {
    console.log(`   … Bulk inserting ${docsToCreate.length} new source documents...`);
    for (let i = 0; i < docsToCreate.length; i += 1000) {
      await prisma.sourceDocument.createMany({
        data: docsToCreate.slice(i, i + 1000),
        skipDuplicates: true,
      });
    }
  }

  if (chunksToCreate.length) {
    console.log(`   … Bulk inserting ${chunksToCreate.length} new chunks...`);
    for (let i = 0; i < chunksToCreate.length; i += 1000) {
      await prisma.documentChunk.createMany({
        data: chunksToCreate.slice(i, i + 1000),
        skipDuplicates: true,
      });
    }
  }

  if (EMBED && toEmbed.length) {
    const newlyCreatedIds = new Set(chunksToCreate.map(c => c.id));
    const newlyCreatedToEmbed = toEmbed.filter(item => newlyCreatedIds.has(item.id));

    if (newlyCreatedToEmbed.length) {
      process.stdout.write(`   ↻ Embedding final ${newlyCreatedToEmbed.length} comparisons ...`);
      await embedBatch(newlyCreatedToEmbed);
      console.log(" done");
    }
  }

  console.log(`   ✓ ${docs} docs  |  ${chunks} chunks  |  ${skipped} skipped (too short)`);
  return { docs, chunks };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6: Main cleaned RAG chunks (bulk — 19,008 records)
// Groups by source URL → one SourceDocument per URL, N chunks each
// ─────────────────────────────────────────────────────────────────────────────
async function ingestRagChunks() {
  console.log("\n🧠 Step 6: Main RAG chunks (19,008 records — grouped by source URL)");
  const file = path.join(RAG_DIR, "cleaned_rag_chunks.jsonl");

  const byUrl = new Map<string, Array<Record<string, any>>>();
  for await (const rec of readJsonl<Record<string, any>>(file)) {
    const url: string = rec.metadata?.source ?? rec.id ?? "unknown";
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url)!.push(rec);
  }

  console.log(`   Grouped into ${byUrl.size} source documents`);

  let docs = 0;
  let chunks = 0;
  let skipped = 0;

  const docsToCreate: Array<any> = [];
  const chunksToCreate: Array<any> = [];
  const toEmbed: Array<{ id: string; content: string }> = [];

  for (const [url, recs] of byUrl) {
    recs.sort((a, b) => (a.metadata?.chunk_index ?? 0) - (b.metadata?.chunk_index ?? 0));

    const first = recs[0];
    if (!first) continue;

    const insType = toInsuranceType(first.insurance_type);
    const docType = toDocumentType(first.content_type ?? "policy_feature");
    const title: string = first.title ?? url;
    const insurer: string = first.insurance_company ?? "";
    const filename = `rag/chunks/${encodeURIComponent(url.replace("https://joinditto.in/", ""))}`;

    const fullContent = recs.map((r) => r.content ?? "").join("\n\n").slice(0, 8000);
    if (fullContent.length < 80) { skipped++; continue; }

    const cs = checksum(fullContent);

    let docId: string;
    const cachedDoc = docCache.get(filename);

    if (cachedDoc && cachedDoc.checksum === cs) {
      docId = cachedDoc.id;
    } else {
      if (cachedDoc && cachedDoc.checksum !== cs) {
        await prisma.sourceDocument.deleteMany({
          where: { filename, checksum: { not: cs } },
        });
        docCache.delete(filename);
      }

      docId = `doc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      docsToCreate.push({
        id: docId,
        title,
        filename,
        sourceType: "rag_chunk",
        insurerName: insurer || null,
        productName: null,
        insuranceType: insType,
        documentType: docType,
        content: fullContent,
        checksum: cs,
        metadata: {
          content_type: first.content_type,
          insurance_type: first.insurance_type,
          category: first.category,
          tags: first.tags ?? [],
          claim_settlement_ratio: first.metadata?.claim_settlement_ratio ?? "",
          network_hospitals: first.metadata?.network_hospitals ?? "",
          incurred_claim_ratio: first.metadata?.incurred_claim_ratio ?? "",
          source: url,
          priority_score: first.metadata?.priority_score ?? 5,
          chunk_count: recs.length,
        },
      });
      docCache.set(filename, { id: docId, checksum: cs });
    }
    docs++;

    for (const [i, rec] of recs.entries()) {
      const chunkContent: string = rec.content ?? "";
      if (chunkContent.length < 80) { skipped++; continue; }

      const cacheKey = `${docId}_${i}`;
      let chunkId = chunkCache.get(cacheKey);

      if (!chunkId) {
        chunkId = `chk_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
        chunksToCreate.push({
          id: chunkId,
          sourceDocumentId: docId,
          chunkIndex: i,
          content: chunkContent,
          metadata: {
            content_type: rec.content_type,
            tags: rec.tags ?? [],
            priority_score: rec.metadata?.priority_score ?? 5,
            claim_settlement_ratio: rec.metadata?.claim_settlement_ratio ?? "",
            network_hospitals: rec.metadata?.network_hospitals ?? "",
            incurred_claim_ratio: rec.metadata?.incurred_claim_ratio ?? "",
            review_sentiment: rec.metadata?.review_sentiment ?? "",
          },
        });
        chunkCache.set(cacheKey, chunkId);
      }
      chunks++;
      toEmbed.push({ id: chunkId, content: chunkContent });
    }
  }

  if (docsToCreate.length) {
    console.log(`   … Bulk inserting ${docsToCreate.length} new source documents...`);
    for (let i = 0; i < docsToCreate.length; i += 1000) {
      await prisma.sourceDocument.createMany({
        data: docsToCreate.slice(i, i + 1000),
        skipDuplicates: true,
      });
    }
  }

  if (chunksToCreate.length) {
    console.log(`   … Bulk inserting ${chunksToCreate.length} new chunks...`);
    for (let i = 0; i < chunksToCreate.length; i += 1000) {
      await prisma.documentChunk.createMany({
        data: chunksToCreate.slice(i, i + 1000),
        skipDuplicates: true,
      });
    }
  }

  if (EMBED && toEmbed.length) {
    const newlyCreatedIds = new Set(chunksToCreate.map(c => c.id));
    const newlyCreatedToEmbed = toEmbed.filter(item => newlyCreatedIds.has(item.id));

    if (newlyCreatedToEmbed.length) {
      process.stdout.write(`   ↻ Embedding final ${newlyCreatedToEmbed.length} chunks ...`);
      await embedBatch(newlyCreatedToEmbed);
      console.log(" done");
    }
  }

  console.log(`   ✓ ${docs} source docs  |  ${chunks} chunks  |  ${skipped} skipped`);
  return { docs, chunks };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const startedAt = Date.now();

  console.log("═".repeat(64));
  console.log("🚀 Ditto RAG → Insurance AI Ingest");
  console.log(`   RAG_DIR  : ${RAG_DIR}`);
  console.log(`   Embeddings: ${EMBED ? "ENABLED (OpenAI text-embedding-3-small)" : "DISABLED (keyword search only)"}`);
  console.log("═".repeat(64));

  const totals = {
    insurers: 0,
    healthProducts: 0,
    docs: 0,
    chunks: 0,
  };

  try {
    console.log("   Loading existing database records into memory cache...");
    const existingDocs = await prisma.sourceDocument.findMany({
      select: { id: true, filename: true, checksum: true }
    });
    for (const d of existingDocs) {
      docCache.set(d.filename, { id: d.id, checksum: d.checksum });
    }

    const existingChunks = await prisma.documentChunk.findMany({
      select: { id: true, sourceDocumentId: true, chunkIndex: true }
    });
    for (const c of existingChunks) {
      chunkCache.set(`${c.sourceDocumentId}_${c.chunkIndex}`, c.id);
    }
    console.log(`   Cached ${docCache.size} source documents and ${chunkCache.size} chunks.`);

    const s1 = await ingestInsurerProfiles();
    totals.insurers    += s1.insurers;
    totals.healthProducts += s1.products;

    const s2 = await ingestFaqs();
    totals.docs   += s2.docs;
    totals.chunks += s2.chunks;

    const s3 = await ingestClaims();
    totals.docs   += s3.docs;
    totals.chunks += s3.chunks;

    const s4 = await ingestReviews();
    totals.docs   += s4.docs;
    totals.chunks += s4.chunks;

    const s5 = await ingestComparisons();
    totals.docs   += s5.docs;
    totals.chunks += s5.chunks;

    const s6 = await ingestRagChunks();
    totals.docs   += s6.docs;
    totals.chunks += s6.chunks;

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    await prisma.ingestionLog.create({
      data: {
        status: "completed",
        dataRoot: RAG_DIR,
        filesProcessed: 6,
        productsLoaded: totals.insurers + totals.healthProducts,
        documentsLoaded: totals.docs,
        chunksCreated: totals.chunks,
        errors: [],
      },
    });

    console.log("\n" + "═".repeat(64));
    console.log("✅ INGEST COMPLETE");
    console.log("═".repeat(64));
    console.log(`   Insurers loaded      : ${totals.insurers}`);
    console.log(`   Health products      : ${totals.healthProducts}`);
    console.log(`   Source documents     : ${totals.docs}`);
    console.log(`   Document chunks      : ${totals.chunks}`);
    console.log(`   Embeddings           : ${EMBED ? "✓ generated" : "✗ skipped (keyword search only)"}`);
    console.log(`   Elapsed              : ${elapsed}s`);
    console.log("═".repeat(64));
  } catch (err) {
    console.error("\n❌ Ingest failed:", err);
    await prisma.ingestionLog.create({
      data: {
        status: "failed",
        dataRoot: RAG_DIR,
        filesProcessed: 0,
        productsLoaded: 0,
        documentsLoaded: totals.docs,
        chunksCreated: totals.chunks,
        errors: [String(err)],
      },
    });
    process.exit(1);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
