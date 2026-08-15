import { describe, expect, it } from "vitest";
import { RULE_SET_VERSION, RuleEngine } from "../src/rule.engine";

describe("German rule engine", () => {
  it("routes lightweight PP packaging to the yellow bin with versioned sources", () => {
    const result = new RuleEngine().classify("scan-1", {
      primaryObject: "Yogurt cup", isPackaging: true, packagingType: "CUP",
      materials: [{ material: "PP", proportion: "PRIMARY", confidence: .92 }], visibleSymbols: [{ code: "PP_5", rawText: "PP 5", confidence: .9 }],
      estimatedWeightGrams: 25, weightConfidence: .5, overallConfidence: .88, uncertainties: [], retakeAdvice: null,
      disposalRecommendation: {
        wasteTypeLabel: "Plastic packaging",
        category: "LIGHTWEIGHT_PACKAGING", confidence: .9,
        disposalRoute: "YELLOW_BIN_OR_SACK", binLabel: "Yellow bin or sack",
        reason: "The photographed PP yogurt cup is lightweight packaging.",
        disposalInstructions: ["Empty the cup", "Separate the lid if easily removable"],
        reuseSuggestion: "Reuse the clean cup where practical.",
        requiresLocalGuidance: false,
      },
    });
    expect(result.binLabel).toBe("Yellow bin or sack");
    expect(result.ruleSetVersion).toBe(RULE_SET_VERSION);
    expect(result.sourceUrls.length).toBeGreaterThan(0);
    expect(result.estimatedDisposalCo2eKg).toBeCloseTo((25 / 1_000_000) * 4.65358);
  });

  it("routes a banana peel to the bio bin before packaging rules", () => {
    const result = new RuleEngine().classify("scan-banana", {
      primaryObject: "Banana peel", isPackaging: false, packagingType: "OTHER",
      materials: [{ material: "Organic food waste", proportion: "PRIMARY", confidence: .97 }], visibleSymbols: [],
      estimatedWeightGrams: 45, weightConfidence: .6, overallConfidence: .98, uncertainties: [], retakeAdvice: null,
      disposalRecommendation: {
        wasteTypeLabel: "Organic food waste",
        category: "ORGANIC", confidence: .98,
        disposalRoute: "BIO_BIN_OR_COMPOST", binLabel: "Bio bin",
        reason: "The photographed banana peel is organic food waste suitable for the bio bin.",
        disposalInstructions: ["Remove any produce sticker", "Place the peel loose in the bio bin"],
        reuseSuggestion: "Compost it where accepted locally.",
        requiresLocalGuidance: false,
      },
    });
    expect(result.category).toBe("ORGANIC");
    expect(result.binLabel).toBe("Bio bin");
    expect(result.disposalRoute).toBe("BIO_BIN_OR_COMPOST");
    expect(result.wasteTypeLabel).toBe("Organic food waste");
    expect(result.materialLabel).toBe("Organic food waste");
    expect(result.environmentalImpactSummary).toContain("banana peel");
  });

  it("preserves the AI collection route and instructions for hazardous waste", () => {
    const result = new RuleEngine().classify("scan-paint", {
      primaryObject: "Partly full paint tin", isPackaging: false, packagingType: "CAN",
      materials: [{ material: "Paint and metal container", proportion: "PRIMARY", confidence: .91 }], visibleSymbols: [],
      estimatedWeightGrams: 900, weightConfidence: .58, overallConfidence: .93, uncertainties: [], retakeAdvice: null,
      disposalRecommendation: {
        wasteTypeLabel: "Hazardous household chemical waste",
        category: "HAZARDOUS_WASTE", confidence: .94,
        disposalRoute: "HAZARDOUS_WASTE_COLLECTION_POINT",
        binLabel: "Hazardous waste collection point",
        reason: "Liquid paint must not enter ordinary household bins or drains.",
        disposalInstructions: ["Keep the lid closed", "Take it to a municipal hazardous-waste collection point"],
        reuseSuggestion: "Offer usable leftover paint for reuse where safe.",
        requiresLocalGuidance: false,
      },
    });

    expect(result.wasteTypeLabel).toBe("Hazardous household chemical waste");
    expect(result.binLabel).toBe("Hazardous waste collection point");
    expect(result.preparationSteps).toEqual([
      "Keep the lid closed",
      "Take it to a municipal hazardous-waste collection point",
    ]);
    expect(result.estimatedDisposalCo2eKg).toBeNull();
  });

  it("requires local guidance instead of choosing a default bin when AI confidence is low", () => {
    const result = new RuleEngine().classify("scan-uncertain", {
      primaryObject: "Unclear household item", isPackaging: false, packagingType: "OTHER",
      materials: [{ material: "Unknown mixed material", proportion: "PRIMARY", confidence: .42 }], visibleSymbols: [],
      estimatedWeightGrams: 30, weightConfidence: .3, overallConfidence: .5, uncertainties: ["The object is partly obscured"], retakeAdvice: "Retake in brighter light.",
      disposalRecommendation: {
        wasteTypeLabel: "Uncertain mixed household waste",
        category: "RESIDUAL", confidence: .45,
        disposalRoute: "RESIDUAL_WASTE_BIN", binLabel: "Residual waste bin",
        reason: "The item could not be identified reliably.",
        disposalInstructions: ["Do not dispose until the material is identified"],
        reuseSuggestion: "Keep the item aside.",
        requiresLocalGuidance: false,
      },
    });

    expect(result.category).toBe("LOCAL_GUIDANCE_REQUIRED");
    expect(result.binLabel).toBe("Municipal waste guide or specialist collection point");
    expect(result.disposalRoute).toBe("CHECK_LOCAL_GUIDANCE");
    expect(result.estimatedDisposalCo2eKg).toBeNull();
  });
});
