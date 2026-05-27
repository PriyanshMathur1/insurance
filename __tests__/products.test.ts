import { describe, expect, it } from "vitest";
import { formatProductTable, NOT_FOUND } from "@/lib/products";

describe("product comparison formatting", () => {
  it("marks missing health product fields as not found in source data", () => {
    const table = formatProductTable([
      {
        insurerName: "Example Health",
        productName: "Careful Health",
        sumInsuredOptions: [],
        preExistingDiseaseWaitingPeriod: null,
        roomRentLimit: null,
        coPay: "No co-pay",
        restorationBenefit: null,
        sourceDocument: null,
      },
    ] as never, "HEALTH");

    expect(table).toContain(NOT_FOUND);
    expect(table).toContain("No co-pay");
  });

  it("marks missing term product fields as not found in source data", () => {
    const table = formatProductTable([
      {
        insurerName: "Example Life",
        productName: "Pure Term",
        sumAssuredRange: null,
        policyTerm: "10-40 years",
        criticalIllnessRider: null,
        waiverOfPremiumRider: null,
        suicideClause: null,
        sourceDocument: null,
      },
    ] as never, "TERM");

    expect(table).toContain(NOT_FOUND);
    expect(table).toContain("10-40 years");
  });
});
