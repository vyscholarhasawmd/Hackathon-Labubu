import { describe, expect, it } from "vitest";
import { RuleEngine } from "../src/rule.engine";

describe("German rule engine", () => {
  it("routes lightweight PP packaging to the yellow bin with versioned sources", () => {
    const result = new RuleEngine().classify("scan-1", {
      primaryObject: "Yogurt cup", isPackaging: true, packagingType: "CUP",
      materials: [{ material: "PP", proportion: "PRIMARY", confidence: .92 }], visibleSymbols: [{ code: "PP_5", rawText: "PP 5", confidence: .9 }],
      estimatedWeightGrams: 25, weightConfidence: .5, overallConfidence: .88, uncertainties: [], retakeAdvice: null,
    });
    expect(result.binLabel).toBe("Yellow bin or sack");
    expect(result.ruleSetVersion).toBe("DE-FEDERAL-2026.08");
    expect(result.sourceUrls.length).toBeGreaterThan(0);
    expect(result.estimatedDisposalCo2eKg).toBeCloseTo((25 / 1_000_000) * 4.65358);
  });
});
