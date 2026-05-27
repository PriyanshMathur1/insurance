import { prisma } from "@/lib/prisma";
import type { InsuranceType } from "@prisma/client";

export const NOT_FOUND = "Not found in source data";

export async function searchProducts(query: string, insuranceType: InsuranceType) {
  const terms = query.split(/\s+/).filter((word) => word.length > 2);
  const where = {
    OR: terms.flatMap((term) => [
      { insurerName: { contains: term, mode: "insensitive" as const } },
      { productName: { contains: term, mode: "insensitive" as const } },
    ]),
  };
  if (insuranceType === "TERM") {
    return prisma.termProduct.findMany({ where, take: 8, orderBy: { updatedAt: "desc" } });
  }
  return prisma.healthProduct.findMany({ where, take: 8, orderBy: { updatedAt: "desc" } });
}

export function formatProductTable(products: Awaited<ReturnType<typeof searchProducts>>, insuranceType: InsuranceType) {
  if (!products.length) return "Verified product matches are missing from the database.";
  if (insuranceType === "TERM") {
    const rows = products.map((product) => {
      const item = product as {
        insurerName: string;
        productName: string;
        sumAssuredRange: string | null;
        policyTerm: string | null;
        criticalIllnessRider: string | null;
        waiverOfPremiumRider: string | null;
        suicideClause: string | null;
        sourceDocument: string | null;
      };
      return `| ${item.insurerName} | ${item.productName} | ${found(item.sumAssuredRange)} | ${found(item.policyTerm)} | ${found(item.criticalIllnessRider)} | ${found(item.waiverOfPremiumRider)} | ${found(item.suicideClause)} | ${found(item.sourceDocument)} |`;
    });
    return ["| Insurer | Product | Sum assured | Policy term | CI rider | WOP rider | Suicide clause | Source |", "|---|---|---|---|---|---|---|---|", ...rows].join("\n");
  }

  const rows = products.map((product) => {
    const item = product as {
      insurerName: string;
      productName: string;
      sumInsuredOptions: string[];
      preExistingDiseaseWaitingPeriod: string | null;
      roomRentLimit: string | null;
      coPay: string | null;
      restorationBenefit: string | null;
      sourceDocument: string | null;
    };
    return `| ${item.insurerName} | ${item.productName} | ${item.sumInsuredOptions.join(", ") || NOT_FOUND} | ${found(item.preExistingDiseaseWaitingPeriod)} | ${found(item.roomRentLimit)} | ${found(item.coPay)} | ${found(item.restorationBenefit)} | ${found(item.sourceDocument)} |`;
  });
  return ["| Insurer | Product | Sum insured | PED waiting | Room rent | Co-pay | Restoration | Source |", "|---|---|---|---|---|---|---|---|", ...rows].join("\n");
}

function found(value: string | null | undefined) {
  return value?.trim() ? value : NOT_FOUND;
}
