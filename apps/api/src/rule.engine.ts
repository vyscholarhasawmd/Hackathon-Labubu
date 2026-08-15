import { Injectable } from "@nestjs/common";
import type {
  DisposalRecommendation,
  IdentificationResult,
  WasteCategory,
  WasteRecordDto,
} from "@resort/contracts";
import { randomUUID } from "node:crypto";

export const RULE_SET_VERSION = "DE-OPENAI-DISPOSAL-2026.08.3";
export const RULE_SOURCES = [
  "https://www.umweltbundesamt.de/umwelttipps-fuer-den-alltag/richtiger-muelltrennung-ressourcen-schonen-umwelt",
  "https://www.umweltbundesamt.de/themen/abfaelle-im-haushalt",
  "https://www.gesetze-im-internet.de/verpackdg/__38.html",
];

const NO_CARBON_PROXY = new Set<WasteCategory>([
  "BATTERY",
  "E_WASTE",
  "HAZARDOUS_WASTE",
  "MEDICAL_SHARPS",
  "MEDICINE",
  "BULKY_WASTE",
  "CONSTRUCTION_WASTE",
  "DEPOSIT_RETURN",
  "REUSE_DONATE",
  "LOCAL_GUIDANCE_REQUIRED",
]);

const localGuidanceRecommendation = (
  identification: IdentificationResult,
  reason: string,
): DisposalRecommendation => ({
  wasteTypeLabel: identification.disposalRecommendation.wasteTypeLabel
    || "Uncertain waste item",
  category: "LOCAL_GUIDANCE_REQUIRED",
  disposalRoute: "CHECK_LOCAL_GUIDANCE",
  binLabel: "Municipal waste guide or specialist collection point",
  confidence: Math.min(
    identification.disposalRecommendation.confidence,
    identification.overallConfidence,
  ),
  reason,
  disposalInstructions: [
    "Keep the item out of household bins until its route is confirmed",
    "Retake a clear photo of the whole item and any labels if possible",
    "Check the municipality's waste A-Z guide or recycling centre",
  ],
  reuseSuggestion: "Keep the item safely aside until disposal is confirmed.",
  requiresLocalGuidance: true,
});

const safeRecommendation = (
  identification: IdentificationResult,
): DisposalRecommendation => {
  const recommendation = identification.disposalRecommendation;

  if (recommendation.requiresLocalGuidance) {
    return localGuidanceRecommendation(identification, recommendation.reason);
  }

  if (
    recommendation.confidence < 0.65
    || identification.overallConfidence < 0.55
  ) {
    return localGuidanceRecommendation(
      identification,
      "AI confidence is too low to recommend an ordinary bin safely.",
    );
  }

  return recommendation;
};

@Injectable()
export class RuleEngine {
  classify(scanId: string, identification: IdentificationResult): WasteRecordDto {
    const recommendation = safeRecommendation(identification);
    const primaryMaterial = identification.materials.find((item) => item.proportion === "PRIMARY")?.material
      ?? identification.materials[0]?.material
      ?? "Unknown material";
    const visibleSymbol = identification.visibleSymbols[0]?.rawText
      ?? identification.visibleSymbols[0]?.code;
    const materialLabel = [primaryMaterial, visibleSymbol].filter(Boolean).join(" · ");
    const grams = Math.max(0, identification.estimatedWeightGrams);

    return {
      id: randomUUID(),
      scanId,
      identifiedName: identification.primaryObject,
      wasteTypeLabel: recommendation.wasteTypeLabel,
      category: recommendation.category,
      primaryMaterial,
      materialLabel,
      disposalRoute: recommendation.disposalRoute,
      binLabel: recommendation.binLabel,
      preparationSteps: recommendation.disposalInstructions,
      reuseSuggestions: [recommendation.reuseSuggestion],
      environmentalImpactSummary: recommendation.reason,
      estimatedWeightGrams: grams,
      estimatedDisposalCo2eKg: NO_CARBON_PROXY.has(recommendation.category)
        ? null
        : (grams / 1_000_000) * 4.65358,
      classificationConfidence: Math.min(
        identification.overallConfidence,
        recommendation.confidence,
      ),
      ruleSetVersion: RULE_SET_VERSION,
      sourceUrls: RULE_SOURCES,
      createdAt: new Date().toISOString(),
    };
  }
}
