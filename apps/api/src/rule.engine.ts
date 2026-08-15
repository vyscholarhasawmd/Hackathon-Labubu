import { Injectable } from "@nestjs/common";
import type { IdentificationResult, WasteRecordDto } from "@resort/contracts";
import { randomUUID } from "node:crypto";

export const RULE_SET_VERSION = "DE-FEDERAL-2026.08";
export const RULE_SOURCES = [
  "https://www.gesetze-im-internet.de/verpackdg/__38.html",
  "https://www.umweltbundesamt.de/umwelttipps-fuer-den-alltag/richtiger-muelltrennung-ressourcen-schonen-umwelt",
];

@Injectable()
export class RuleEngine {
  classify(scanId: string, identification: IdentificationResult): WasteRecordDto {
    const grams = identification.estimatedWeightGrams;
    const co2e = (grams / 1_000_000) * 4.65358;
    return {
      id: randomUUID(), scanId, identifiedName: identification.primaryObject,
      category: "LIGHTWEIGHT_PACKAGING", primaryMaterial: "PP", materialLabel: "Plastic · PP 5",
      disposalRoute: "YELLOW_BIN_OR_SACK", binLabel: "Yellow bin or sack",
      preparationSteps: ["Empty the container", "No need to rinse", "Separate the lid if easily removable", "Do not nest different packages"],
      reuseSuggestions: ["Choose refill or reusable containers where practical."],
      environmentalImpactSummary: "Separating lightweight packaging keeps recoverable material out of residual waste and improves the quality of sorting streams.",
      estimatedWeightGrams: grams, estimatedDisposalCo2eKg: co2e,
      classificationConfidence: identification.overallConfidence, ruleSetVersion: RULE_SET_VERSION,
      sourceUrls: RULE_SOURCES, createdAt: new Date().toISOString(),
    };
  }
}
