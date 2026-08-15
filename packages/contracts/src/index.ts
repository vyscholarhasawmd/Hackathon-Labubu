export type CountryCode = "DE";
export type PlanCode = "FREE" | "PLUS" | "HOUSEHOLD";
export type QualityTier = "BASIC" | "ENHANCED" | "HOUSEHOLD_PREVIEW";
export type ScanStatus = "PROCESSING" | "ANALYZED" | "ACCEPTED" | "REJECTED" | "FAILED";
export type WeightSource = "AI_ESTIMATE" | "CATEGORY_DEFAULT" | "USER";

export type WasteCategory =
  | "LIGHTWEIGHT_PACKAGING"
  | "PAPER_CARDBOARD"
  | "GLASS_PACKAGING"
  | "ORGANIC"
  | "RESIDUAL"
  | "BATTERY"
  | "E_WASTE"
  | "TEXTILE"
  | "HAZARDOUS_WASTE"
  | "MEDICAL_SHARPS"
  | "MEDICINE"
  | "BULKY_WASTE"
  | "CONSTRUCTION_WASTE"
  | "DEPOSIT_RETURN"
  | "REUSE_DONATE"
  | "LOCAL_GUIDANCE_REQUIRED";

export type HazardSignal =
  | "BATTERY"
  | "PRESSURIZED"
  | "FLAMMABLE"
  | "CORROSIVE"
  | "TOXIC"
  | "SHARP"
  | "MEDICINE"
  | "ELECTRONIC"
  | "NONE";

export interface IdentificationResult {
  primaryObject: string;
  isPackaging: boolean;
  packagingType: "CUP" | "BOX" | "JAR" | "BOTTLE" | "CAN" | "BAG" | "OTHER";
  packagingState: "EMPTY" | "PARTLY_FULL" | "FULL" | "UNKNOWN";
  materials: Array<{ material: string; proportion: "PRIMARY" | "SECONDARY"; confidence: number }>;
  visibleSymbols: Array<{ code: string; rawText: string | null; confidence: number }>;
  hazardSignals: HazardSignal[];
  estimatedWeightGrams: number | null;
  weightConfidence: number;
  overallConfidence: number;
  uncertainties: string[];
  retakeAdvice: string | null;
}

export interface ScanDto {
  id: string;
  status: ScanStatus;
  provider: "MOCK" | "OPENAI";
  model: string | null;
  promptVersion: string;
  countryCode: CountryCode;
  createdAt: string;
  identification: IdentificationResult | null;
  errorCode: string | null;
  thumbnailUrl: string | null;
}

export interface CountryDto {
  code: string;
  name: string;
  enabled: boolean;
  label?: string;
  ruleSetVersion?: string;
  ruleSetEffectiveFrom?: string;
  sourceUrls?: string[];
}

export interface WasteRecordDto {
  id: string;
  scanId: string;
  identifiedName: string;
  wasteTypeLabel: string;
  category: WasteCategory;
  primaryMaterial: string;
  materialLabel: string;
  disposalRoute: string;
  binLabel: string;
  preparationSteps: string[];
  reuseSuggestions: string[];
  environmentalImpactSummary: string;
  estimatedWeightGrams: number;
  weightSource: WeightSource;
  weightConfidence: number | null;
  estimatedDisposalCo2eKg: number | null;
  carbonMethodologyVersion: string | null;
  carbonBoundary: string | null;
  classificationConfidence: number;
  requiresLocalGuidance: boolean;
  localWarning: string | null;
  ruleSetVersion: string;
  ruleSetEffectiveFrom: string;
  sourceUrls: string[];
  analysisProvider: "MOCK" | "OPENAI";
  analysisModel: string | null;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string | null;
}

export interface PlanDto {
  code: PlanCode;
  name: string;
  weeklyLimit: number;
  priceCents: number;
  accuracyLabel: string;
  qualityTier: QualityTier;
  features: string[];
  checkoutEnabled: boolean;
  comingSoon?: boolean;
}

export interface SubscriptionDto {
  plan: PlanCode;
  weeklyLimit: number;
  used: number;
  remaining: number;
  weekStart: string;
  resetsAt: string;
}

export interface AnalyticsDto {
  totalAccepted: number;
  totalWeightGrams: number;
  totalDisposalCo2eKg: number;
  recordsWithoutCarbonFactor: number;
  daily: Array<{ date: string; count: number; weightGrams: number; disposalCo2eKg: number }>;
  dailyCounts: number[];
  categories: Array<{ category: WasteCategory | "BIN"; label: string; count: number; weightGrams: number }>;
  suggestions: Array<{ code: string; title: string; action: string; evidence: string }>;
}

export interface UserDto {
  id: string;
  username: string;
  displayName: string;
  countryCode: CountryCode;
  timezone: string;
}

export interface AuthResponse {
  accessToken: string;
  user: UserDto;
}

export interface PaymentTransactionDto {
  id: string;
  planCode: PlanCode;
  amountCents: number;
  currency: "EUR";
  status: "SUCCEEDED" | "DECLINED";
  provider: "FAKE";
  providerReference: string;
  failureCode: string | null;
  createdAt: string;
}

export interface PaginatedWasteRecordsDto {
  items: WasteRecordDto[];
  page: number;
  pageSize: number;
  total: number;
}
