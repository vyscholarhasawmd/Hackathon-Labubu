export type CountryCode = "DE";
export type PlanCode = "FREE" | "PLUS" | "HOUSEHOLD";
export type ScanStatus = "ANALYZED" | "ACCEPTED" | "REJECTED" | "FAILED";

export type WasteCategory =
  | "LIGHTWEIGHT_PACKAGING"
  | "PAPER_CARDBOARD"
  | "GLASS_PACKAGING"
  | "ORGANIC"
  | "RESIDUAL"
  | "BATTERY"
  | "E_WASTE"
  | "LOCAL_GUIDANCE_REQUIRED";

export interface IdentificationResult {
  primaryObject: string;
  isPackaging: boolean;
  packagingType: "CUP" | "BOX" | "JAR" | "CAN" | "OTHER";
  materials: Array<{ material: string; proportion: "PRIMARY" | "SECONDARY"; confidence: number }>;
  visibleSymbols: Array<{ code: string; rawText: string | null; confidence: number }>;
  estimatedWeightGrams: number;
  weightConfidence: number;
  overallConfidence: number;
  uncertainties: string[];
  retakeAdvice: string | null;
}

export interface ScanDto {
  id: string;
  status: ScanStatus;
  provider: "MOCK" | "OPENAI";
  countryCode: CountryCode;
  createdAt: string;
  identification: IdentificationResult;
}

export interface WasteRecordDto {
  id: string;
  scanId: string;
  identifiedName: string;
  category: WasteCategory;
  primaryMaterial: string;
  materialLabel: string;
  disposalRoute: string;
  binLabel: string;
  preparationSteps: string[];
  reuseSuggestions: string[];
  environmentalImpactSummary: string;
  estimatedWeightGrams: number;
  estimatedDisposalCo2eKg: number | null;
  classificationConfidence: number;
  ruleSetVersion: string;
  sourceUrls: string[];
  createdAt: string;
}

export interface PlanDto {
  code: PlanCode;
  name: string;
  weeklyLimit: number;
  priceCents: number;
  accuracyLabel: string;
  features: string[];
  checkoutEnabled: boolean;
  comingSoon?: boolean;
}

export interface SubscriptionDto {
  plan: PlanCode;
  weeklyLimit: number;
  used: number;
  remaining: number;
  resetsAt: string;
}

export interface AnalyticsDto {
  totalAccepted: number;
  totalWeightGrams: number;
  totalDisposalCo2eKg: number;
  dailyCounts: number[];
  categories: Array<{ label: string; count: number }>;
  suggestions: Array<{ title: string; action: string }>;
}

export interface AuthResponse {
  accessToken: string;
  user: { id: string; username: string; displayName: string; countryCode: CountryCode };
}
