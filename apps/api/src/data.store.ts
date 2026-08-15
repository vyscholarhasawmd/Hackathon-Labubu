import type {
  AnalyticsDto,
  CountryCode,
  CountryDto,
  IdentificationResult,
  PaginatedWasteRecordsDto,
  PaymentTransactionDto,
  PlanDto,
  ScanDto,
  SubscriptionDto,
  UserDto,
  WasteCategory,
  WasteRecordDto,
} from "@resort/contracts";

export interface StoredUser extends UserDto { passwordHash: string }
export interface ScanReservation { scan: ScanDto; existing: boolean }
export interface MediaRecord { id: string; storageKey: string; mimeType: string }
export interface CarbonFactor {
  id: string;
  kgCo2ePerTonne: number;
  methodologyVersion: string;
  boundary: string;
}
export type RecordInput = Omit<WasteRecordDto, "id" | "createdAt" | "updatedAt" | "thumbnailUrl" | "analysisProvider" | "analysisModel">;
export interface RecordFilters {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  category?: WasteCategory;
  route?: string;
}
export interface RefreshSessionInput { userId: string; tokenHash: string; expiresAt: Date }

export abstract class DataStore {
  abstract findUserByUsername(username: string): Promise<StoredUser | undefined>;
  abstract getUser(id: string): Promise<StoredUser>;
  abstract register(username: string, passwordHash: string): Promise<StoredUser>;
  abstract createRefreshSession(input: RefreshSessionInput): Promise<void>;
  abstract rotateRefreshSession(currentHash: string, nextHash: string, nextExpiresAt: Date): Promise<StoredUser>;
  abstract revokeRefreshSession(tokenHash: string): Promise<void>;

  abstract countries(): Promise<CountryDto[]>;
  abstract plans(): Promise<PlanDto[]>;
  abstract subscription(userId: string): Promise<SubscriptionDto>;

  abstract findScanByIdempotency(userId: string, key: string): Promise<ScanDto | undefined>;
  abstract beginScan(userId: string, key: string, countryCode: CountryCode, provider: "MOCK" | "OPENAI", model: string | null, promptVersion: string): Promise<ScanReservation>;
  abstract completeScan(userId: string, scanId: string, identification: IdentificationResult, latencyMs: number): Promise<ScanDto>;
  abstract failScan(userId: string, scanId: string, errorCode: string): Promise<void>;
  abstract getScan(userId: string, scanId: string): Promise<ScanDto>;
  abstract saveMedia(userId: string, scanId: string, input: Omit<MediaRecord, "id"> & { byteSize: number; width: number; height: number; sha256: string; deleteAfter: Date }): Promise<void>;
  abstract getMedia(userId: string, scanId: string): Promise<MediaRecord>;
  abstract rejectScan(userId: string, scanId: string, reasonCode?: string, comment?: string): Promise<void>;
  abstract acceptScan(userId: string, scanId: string, record: RecordInput): Promise<WasteRecordDto>;

  abstract listRecords(userId: string, filters: RecordFilters): Promise<PaginatedWasteRecordsDto>;
  abstract getRecord(userId: string, recordId: string): Promise<WasteRecordDto>;
  abstract updateWeight(userId: string, recordId: string, grams: number): Promise<WasteRecordDto>;
  abstract deleteRecord(userId: string, recordId: string): Promise<string | null>;
  abstract carbonFactor(category: WasteCategory, route: string): Promise<CarbonFactor | null>;
  abstract analytics(userId: string, from?: string, to?: string): Promise<AnalyticsDto>;

  abstract checkout(userId: string, planCode: "PLUS" | "HOUSEHOLD", paymentToken: "tok_demo_visa" | "tok_demo_declined"): Promise<{ subscription: SubscriptionDto; transaction: PaymentTransactionDto }>;
  abstract switchToFree(userId: string): Promise<SubscriptionDto>;
  abstract transactions(userId: string): Promise<PaymentTransactionDto[]>;
  abstract readiness(): Promise<{ database: "ok" | "unavailable"; ruleSetVersion: string | null }>;
}
