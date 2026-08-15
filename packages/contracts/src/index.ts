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
<<<<<<< ours
  | "LOCAL_GUIDANCE_REQUIRED";

=======
  | "TEXTILE"
  | "HAZARDOUS_WASTE"
  | "MEDICAL_SHARPS"
  | "MEDICINE"
  | "BULKY_WASTE"
  | "CONSTRUCTION_WASTE"
  | "DEPOSIT_RETURN"
  | "REUSE_DONATE"
  | "LOCAL_GUIDANCE_REQUIRED";

export interface DisposalRecommendation {
  wasteTypeLabel: string;
  category: WasteCategory;
  disposalRoute: string;
  binLabel: string;
  confidence: number;
  reason: string;
  disposalInstructions: string[];
  reuseSuggestion: string;
  requiresLocalGuidance: boolean;
}

>>>>>>> theirs
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
<<<<<<< ours
=======
  disposalRecommendation: DisposalRecommendation;
>>>>>>> theirs
}

export interface ScanDto {
  id: string;
  status: ScanStatus;
  provider: "MOCK" | "OPENAI";
  countryCode: CountryCode;
  createdAt: string;
  identification: IdentificationResult;
}

<<<<<<< ours
=======
export interface CountryDto {
  code: string;
  name: string;
  enabled: boolean;
  label?: string;
  ruleSetVersion?: string;
  sourceUrls?: string[];
}

>>>>>>> theirs
export interface WasteRecordDto {
  id: string;
  scanId: string;
  identifiedName: string;
<<<<<<< ours
=======
  wasteTypeLabel: string;
>>>>>>> theirs
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
