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
};

export async function searchRag(query: string, insuranceType?: InsuranceType, limit = 5): Promise<Citation[]> {
  const embedding = await embedText(query);
  if (embedding) {
    const vector = vectorLiteral(embedding);
    const rows = await prisma.$queryRawUnsafe<Array<{
      title: string;
      filename: string;
      documentType: string;
      insurerName: string | null;
      productName: string | null;
      content: string;
    }>>(
      `SELECT s."title", s."filename", s."documentType", s."insurerName", s."productName", c."content"
       FROM "DocumentChunk" c
       JOIN "SourceDocument" s ON s."id" = c."sourceDocumentId"
       WHERE ($1::text IS NULL OR s."insuranceType"::text = $1)
       ORDER BY c."embedding" <=> $2::vector
       LIMIT $3`,
      insuranceType && insuranceType !== "MIXED" ? insuranceType : null,
      vector,
      limit,
    );
    return rows.map(toCitation);
  }

  const terms = query.split(/\s+/).filter((word) => word.length > 3).slice(0, 8);
  const chunks = await prisma.documentChunk.findMany({
    where: {
      sourceDocument: insuranceType && insuranceType !== "MIXED" ? { insuranceType } : undefined,
      OR: terms.map((term) => ({ content: { contains: term, mode: "insensitive" } })),
    },
    include: { sourceDocument: true },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  return chunks.map((chunk) =>
    toCitation({
      title: chunk.sourceDocument.title,
      filename: chunk.sourceDocument.filename,
      documentType: chunk.sourceDocument.documentType,
      insurerName: chunk.sourceDocument.insurerName,
      productName: chunk.sourceDocument.productName,
      content: chunk.content,
    }),
  );
}

function toCitation(row: {
  title: string;
  filename: string;
  documentType: string;
  insurerName?: string | null;
  productName?: string | null;
  content: string;
}): Citation {
  return {
    title: row.title,
    filename: row.filename,
    documentType: row.documentType,
    insurerName: row.insurerName,
    productName: row.productName,
    snippet: row.content.slice(0, 280),
  };
}
