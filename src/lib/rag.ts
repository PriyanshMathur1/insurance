import { prisma } from "@/lib/prisma";
import { embedText, vectorLiteral } from "@/lib/openai";
import type { InsuranceType } from "@prisma/client";

export type Citation = {
  title: string;
  filename: string;
  documentType: string;
  insurerName?: string | null;
  productName?: string | null;
  snippet: string;
  // Enriched from RAG pipeline metadata
  contentType?: string;
  reviewSentiment?: string;
  claimSettlementRatio?: string;
  networkHospitals?: string;
  incurredClaimRatio?: string;
  tags?: string[];
  priorityScore?: number;
};

/**
 * Search the RAG knowledge base for chunks relevant to `query`.
 *
 * Strategy:
 *  1. Try OpenAI vector similarity search (pgvector cosine distance).
 *  2. Fall back to full-text keyword search if embeddings are unavailable.
 *
 * Optional `contentTypes` filter narrows results to specific content types
 * stored in chunk metadata (e.g. ["faq", "claims_process", "comparison"]).
 */
export async function searchRag(
  query: string,
  insuranceType?: InsuranceType,
  limit = 8,
  contentTypes?: string[],
): Promise<Citation[]> {
  const embedding = await embedText(query);

  if (embedding) {
    // ── Vector search path ──────────────────────────────────────────────────
    const vector = vectorLiteral(embedding);

    // Build optional filters
    const typeFilter =
      insuranceType && insuranceType !== "MIXED"
        ? `AND s."insuranceType"::text = '${insuranceType}'`
        : "";

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        title: string;
        filename: string;
        documentType: string;
        insurerName: string | null;
        productName: string | null;
        content: string;
        metadata: unknown;
      }>
    >(
      `SELECT s."title", s."filename", s."documentType",
              s."insurerName", s."productName",
              c."content", c."metadata"
       FROM "DocumentChunk" c
       JOIN "SourceDocument" s ON s."id" = c."sourceDocumentId"
       WHERE ($1::text IS NULL OR s."insuranceType"::text = $1)
       ORDER BY c."embedding" <=> $2::vector
       LIMIT $3`,
      insuranceType && insuranceType !== "MIXED" ? insuranceType : null,
      vector,
      limit,
    );

    const results = rows.map(toCitation);
    return contentTypes ? filterByContentType(results, contentTypes) : results;
  }

  // ── Keyword search fallback ─────────────────────────────────────────────────
  const terms = query
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 8);

  const chunks = await prisma.documentChunk.findMany({
    where: {
      sourceDocument:
        insuranceType && insuranceType !== "MIXED"
          ? { insuranceType }
          : undefined,
      OR: terms.map((term) => ({
        content: { contains: term, mode: "insensitive" as const },
      })),
    },
    include: { sourceDocument: true },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  const results = chunks.map((chunk) =>
    toCitation({
      title: chunk.sourceDocument.title,
      filename: chunk.sourceDocument.filename,
      documentType: chunk.sourceDocument.documentType,
      insurerName: chunk.sourceDocument.insurerName,
      productName: chunk.sourceDocument.productName,
      content: chunk.content,
      metadata: chunk.metadata,
    }),
  );

  return contentTypes ? filterByContentType(results, contentTypes) : results;
}

function filterByContentType(citations: Citation[], types: string[]): Citation[] {
  return citations.filter(
    (c) => !c.contentType || types.includes(c.contentType),
  );
}

function toCitation(row: {
  title: string;
  filename: string;
  documentType: string;
  insurerName?: string | null;
  productName?: string | null;
  content: string;
  metadata?: unknown;
}): Citation {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    title: row.title,
    filename: row.filename,
    documentType: row.documentType,
    insurerName: row.insurerName,
    productName: row.productName,
    snippet: row.content.slice(0, 300),
    // Enriched RAG fields
    contentType:           (meta.content_type as string)            ?? undefined,
    reviewSentiment:       (meta.sentiment as string)               ??
                           (meta.review_sentiment as string)        ?? undefined,
    claimSettlementRatio:  (meta.claim_settlement_ratio as string)  ?? undefined,
    networkHospitals:      (meta.network_hospitals as string)       ?? undefined,
    incurredClaimRatio:    (meta.incurred_claim_ratio as string)    ?? undefined,
    tags:                  Array.isArray(meta.tags) ? (meta.tags as string[]) : undefined,
    priorityScore:         typeof meta.priority_score === "number"
                             ? (meta.priority_score as number)
                             : undefined,
  };
}
