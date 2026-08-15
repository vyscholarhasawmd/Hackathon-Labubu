import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import type { AnalyticsDto, CountryDto, IdentificationResult, PaymentTransactionDto, PlanCode, PlanDto, ScanDto, SubscriptionDto, WasteCategory, WasteRecordDto } from "@resort/contracts";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { DataStore, type CarbonFactor, type MediaRecord, type RecordFilters, type RecordInput, type RefreshSessionInput, type ScanReservation, type StoredUser } from "./data.store";
import { currentWeek, dateKey } from "./time";

const RULE_VERSION = "DE-FEDERAL-2026.08.12-v2";
const RULE_EFFECTIVE = "2026-08-12";
const SOURCE_URLS = [
  "https://www.bundesregierung.de/breg-de/aktuelles/verpackungsrecht-gesetz-2406776",
  "https://www.gesetze-im-internet.de/krwg/__20.html",
  "https://www.umweltbundesamt.de/umwelttipps-fuer-den-alltag/richtiger-muelltrennung-ressourcen-schonen-umwelt",
];

const PLANS: PlanDto[] = [
  { code: "FREE", name: "Free", weeklyLimit: 10, priceCents: 0, accuracyLabel: "Target AI accuracy ~80%", qualityTier: "BASIC", features: ["Basic sorting guidance", "Recent scan history"], checkoutEnabled: true },
  { code: "PLUS", name: "Plus", weeklyLimit: 100, priceCents: 999, accuracyLabel: "Target AI accuracy ~90%", qualityTier: "ENHANCED", features: ["Enhanced image detail and verification", "Full history and impact insights"], checkoutEnabled: true },
  { code: "HOUSEHOLD", name: "Household", weeklyLimit: 250, priceCents: 1799, accuracyLabel: "Target AI accuracy >90%", qualityTier: "HOUSEHOLD_PREVIEW", features: ["Up to 4 accounts", "Optional child accounts"], checkoutEnabled: false, comingSoon: true },
];

interface OwnedScan { ownerId: string; value: ScanDto }
interface OwnedRecord { ownerId: string; value: WasteRecordDto }
interface RefreshSession { userId: string; expiresAt: Date; revoked: boolean }

function seedRecord(ownerId: string, name: string, category: WasteCategory, material: string, bin: string, route: string, daysAgo: number, grams: number): OwnedRecord {
  const now = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const carbon = ["BATTERY", "E_WASTE", "HAZARDOUS_WASTE", "LOCAL_GUIDANCE_REQUIRED"].includes(category) ? null : (grams / 1_000_000) * (category === "ORGANIC" ? 9.00687 : 4.65358);
  return { ownerId, value: {
    id: randomUUID(), scanId: randomUUID(), identifiedName: name, wasteTypeLabel: category.replaceAll("_", " ").toLowerCase(), category,
    primaryMaterial: material, materialLabel: material, disposalRoute: route, binLabel: bin,
    preparationSteps: ["Follow the item-specific preparation guidance"], reuseSuggestions: ["Reuse before disposal where practical."],
    environmentalImpactSummary: `Correctly separating this ${name.toLowerCase()} keeps recoverable material out of mixed waste.`,
    estimatedWeightGrams: grams, weightSource: "AI_ESTIMATE", weightConfidence: 0.65, estimatedDisposalCo2eKg: carbon,
    carbonMethodologyVersion: carbon === null ? null : "DESNZ-2026-WASTE-PROXY-v1",
    carbonBoundary: carbon === null ? null : "Collection/delivery or treatment proxy; not a full product life-cycle assessment",
    classificationConfidence: 0.9, requiresLocalGuidance: category === "ORGANIC", localWarning: category === "ORGANIC" ? "Local collection rules may differ. Check your municipality’s Abfall-ABC or recycling center guidance." : null,
    ruleSetVersion: RULE_VERSION, ruleSetEffectiveFrom: RULE_EFFECTIVE, sourceUrls: SOURCE_URLS, analysisProvider:"MOCK", analysisModel:null,
    createdAt: now, updatedAt: now, thumbnailUrl: null,
  }};
}

@Injectable()
export class MemoryStore extends DataStore implements OnModuleInit {
  private readonly users = new Map<string, StoredUser>();
  private readonly scans = new Map<string, OwnedScan>();
  private readonly records = new Map<string, OwnedRecord>();
  private readonly refreshSessions = new Map<string, RefreshSession>();
  private readonly idempotency = new Map<string, string>();
  private readonly plansByUser = new Map<string, PlanCode>();
  private readonly usageByUserWeek = new Map<string, number>();
  private readonly media = new Map<string, { ownerId: string; value: MediaRecord }>();
  private readonly paymentRows = new Map<string, Array<PaymentTransactionDto>>();

  async onModuleInit(): Promise<void> {
    if (this.users.size) return;
    const demoId = "00000000-0000-4000-8000-000000000001";
    this.users.set(demoId, { id: demoId, username: "demo", displayName: "Emma", countryCode: "DE", timezone: "Europe/Berlin", passwordHash: await argon2.hash("Demo12345!") });
    this.plansByUser.set(demoId, "FREE");
    this.usageByUserWeek.set(`${demoId}:${currentWeek().weekStart}`, 7);
    [
      seedRecord(demoId, "Yogurt cup", "LIGHTWEIGHT_PACKAGING", "Plastic · PP 5", "Yellow bin or sack", "YELLOW_BIN_OR_SACK", 0, 25),
      seedRecord(demoId, "Cardboard box", "PAPER_CARDBOARD", "Paper · Cardboard", "Blue paper bin", "PAPER_BIN", 1, 82),
      seedRecord(demoId, "Olive oil bottle", "GLASS_PACKAGING", "Glass", "Glass collection container", "GLASS_COLLECTION_CONTAINER", 1, 310),
      seedRecord(demoId, "Aluminium can", "LIGHTWEIGHT_PACKAGING", "Metal · ALU", "Yellow bin or sack", "YELLOW_BIN_OR_SACK", 2, 20),
      seedRecord(demoId, "Banana peel", "ORGANIC", "Organic", "Bio bin", "BIO_BIN_OR_COMPOST", 3, 95),
      seedRecord(demoId, "AA battery", "BATTERY", "Battery", "Battery collection point", "BATTERY_COLLECTION_POINT", 4, 24),
      seedRecord(demoId, "Shampoo bottle", "LIGHTWEIGHT_PACKAGING", "Plastic · HDPE 2", "Yellow bin or sack", "YELLOW_BIN_OR_SACK", 5, 42),
    ].forEach((record) => this.records.set(record.value.id, record));
  }

  async findUserByUsername(username: string): Promise<StoredUser | undefined> { return [...this.users.values()].find((user) => user.username === username.toLowerCase()); }
  async getUser(id: string): Promise<StoredUser> { const user = this.users.get(id); if (!user) throw new NotFoundException("User not found"); return user; }
  async register(username: string, passwordHash: string): Promise<StoredUser> {
    if (await this.findUserByUsername(username)) throw new ConflictException("Username is not available");
    const user: StoredUser = { id: randomUUID(), username: username.toLowerCase(), displayName: username, countryCode: "DE", timezone: "Europe/Berlin", passwordHash };
    this.users.set(user.id, user); this.plansByUser.set(user.id, "FREE"); return user;
  }
  async createRefreshSession(input: RefreshSessionInput): Promise<void> { this.refreshSessions.set(input.tokenHash, { userId: input.userId, expiresAt: input.expiresAt, revoked: false }); }
  async rotateRefreshSession(currentHash: string, nextHash: string, nextExpiresAt: Date): Promise<StoredUser> {
    const current = this.refreshSessions.get(currentHash);
    if (!current || current.revoked || current.expiresAt <= new Date()) throw new NotFoundException("Session not found");
    current.revoked = true; this.refreshSessions.set(currentHash, current);
    this.refreshSessions.set(nextHash, { userId: current.userId, expiresAt: nextExpiresAt, revoked: false });
    return this.getUser(current.userId);
  }
  async revokeRefreshSession(tokenHash: string): Promise<void> { const session = this.refreshSessions.get(tokenHash); if (session) { session.revoked = true; this.refreshSessions.set(tokenHash, session); } }

  async countries(): Promise<CountryDto[]> { return [{ code: "DE", name: "Germany", enabled: true, ruleSetVersion: RULE_VERSION, ruleSetEffectiveFrom: RULE_EFFECTIVE, sourceUrls: SOURCE_URLS }, { code: "AT", name: "Austria", enabled: false, label: "Coming soon" }, { code: "FR", name: "France", enabled: false, label: "Coming soon" }, { code: "NL", name: "Netherlands", enabled: false, label: "Coming soon" }]; }
  async plans(): Promise<PlanDto[]> { return PLANS; }
  async subscription(userId: string): Promise<SubscriptionDto> {
    const plan = this.plansByUser.get(userId) ?? "FREE";
    const definition = PLANS.find((item) => item.code === plan) ?? PLANS[0]!;
    const week = currentWeek(); const used = this.usageByUserWeek.get(`${userId}:${week.weekStart}`) ?? 0;
    return { plan, weeklyLimit: definition.weeklyLimit, used, remaining: Math.max(0, definition.weeklyLimit - used), weekStart: week.weekStart, resetsAt: week.resetsAt };
  }

  async findScanByIdempotency(userId: string, key: string): Promise<ScanDto | undefined> { const id = this.idempotency.get(`${userId}:${key}`); return id ? (await this.getScan(userId, id)) : undefined; }
  async beginScan(userId: string, key: string, countryCode: "DE", provider: "MOCK" | "OPENAI", model: string | null, promptVersion: string): Promise<ScanReservation> {
    const existing = await this.findScanByIdempotency(userId, key); if (existing) return { scan: existing, existing: true };
    const subscription = await this.subscription(userId);
    if (!subscription.remaining) throw new HttpException({ code: "WEEKLY_SCAN_LIMIT_REACHED", message: "You have reached your weekly scan limit.", details: subscription }, HttpStatus.TOO_MANY_REQUESTS);
    this.usageByUserWeek.set(`${userId}:${subscription.weekStart}`, subscription.used + 1);
    const scan: ScanDto = { id: randomUUID(), status: "PROCESSING", provider, model, promptVersion, countryCode, createdAt: new Date().toISOString(), identification: null, errorCode: null, thumbnailUrl: null };
    this.scans.set(scan.id, { ownerId: userId, value: scan }); this.idempotency.set(`${userId}:${key}`, scan.id);
    return { scan, existing: false };
  }
  async completeScan(userId: string, scanId: string, identification: IdentificationResult): Promise<ScanDto> { const scan = await this.getScan(userId, scanId); scan.identification = identification; scan.status = "ANALYZED"; return scan; }
  async failScan(userId: string, scanId: string, errorCode: string): Promise<void> { const scan = await this.getScan(userId, scanId); if (scan.status !== "PROCESSING") return; scan.status = "FAILED"; scan.errorCode = errorCode; const subscription = await this.subscription(userId); this.usageByUserWeek.set(`${userId}:${subscription.weekStart}`, Math.max(0, subscription.used - 1)); }
  async getScan(userId: string, scanId: string): Promise<ScanDto> { const scan = this.scans.get(scanId); if (!scan || scan.ownerId !== userId) throw new NotFoundException("Scan not found"); return scan.value; }
  async saveMedia(userId: string, scanId: string, input: Omit<MediaRecord, "id">): Promise<void> { await this.getScan(userId, scanId); this.media.set(scanId, { ownerId: userId, value: { id: randomUUID(), storageKey: input.storageKey, mimeType: input.mimeType } }); }
  async getMedia(userId: string, scanId: string): Promise<MediaRecord> { const media = this.media.get(scanId); if (!media || media.ownerId !== userId) throw new NotFoundException("Image not found"); return media.value; }
  async rejectScan(userId: string, scanId: string): Promise<void> { const scan = await this.getScan(userId, scanId); if (scan.status !== "ANALYZED") throw new ConflictException("SCAN_ALREADY_DECIDED"); scan.status = "REJECTED"; }
  async acceptScan(userId: string, scanId: string, input: RecordInput): Promise<WasteRecordDto> {
    const scan = await this.getScan(userId, scanId); if (scan.status !== "ANALYZED") throw new ConflictException("SCAN_ALREADY_DECIDED");
    const now = new Date().toISOString(); const record: WasteRecordDto = { ...input, id: randomUUID(), createdAt: now, updatedAt: now, thumbnailUrl: this.media.has(scanId) ? `/api/v1/scans/${scanId}/thumbnail` : null,analysisProvider:scan.provider,analysisModel:scan.model };
    this.records.set(record.id, { ownerId: userId, value: record }); scan.status = "ACCEPTED"; return record;
  }

  async listRecords(userId: string, filters: RecordFilters) {
    let rows = [...this.records.values()].filter((row) => row.ownerId === userId).map((row) => row.value);
    if (filters.from) rows = rows.filter((row) => row.createdAt >= filters.from!);
    if (filters.to) rows = rows.filter((row) => row.createdAt <= filters.to!);
    if (filters.category) rows = rows.filter((row) => row.category === filters.category);
    if (filters.route) rows = rows.filter((row) => row.disposalRoute === filters.route);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = rows.length; const start = (filters.page - 1) * filters.pageSize;
    return { items: rows.slice(start, start + filters.pageSize), page: filters.page, pageSize: filters.pageSize, total };
  }
  async getRecord(userId: string, recordId: string): Promise<WasteRecordDto> { const row = this.records.get(recordId); if (!row || row.ownerId !== userId) throw new NotFoundException("Waste record not found"); return row.value; }
  async updateWeight(userId: string, recordId: string, grams: number): Promise<WasteRecordDto> { const record = await this.getRecord(userId, recordId); const factor = await this.carbonFactor(record.category, record.disposalRoute); record.estimatedWeightGrams = grams; record.weightSource = "USER"; record.estimatedDisposalCo2eKg = factor ? (grams / 1_000_000) * factor.kgCo2ePerTonne : null; record.updatedAt = new Date().toISOString(); return record; }
  async deleteRecord(userId: string, recordId: string): Promise<string | null> { const record = await this.getRecord(userId, recordId); this.records.delete(recordId); const media = this.media.get(record.scanId); this.media.delete(record.scanId); return media?.value.storageKey ?? null; }
  async carbonFactor(category: WasteCategory, _route: string): Promise<CarbonFactor | null> { const value = category === "ORGANIC" ? 9.00687 : ["LIGHTWEIGHT_PACKAGING", "PAPER_CARDBOARD", "GLASS_PACKAGING", "DEPOSIT_RETURN", "RESIDUAL"].includes(category) ? 4.65358 : null; return value === null ? null : { id: `mock-${category}`, kgCo2ePerTonne: value, methodologyVersion: "DESNZ-2026-WASTE-PROXY-v1", boundary: "Collection/delivery or treatment proxy; not a full product life-cycle assessment" }; }
  async analytics(userId: string, from?: string, to?: string): Promise<AnalyticsDto> {
    const week = currentWeek(); const start = from ?? week.dates[0]!; const end = to ?? `${week.dates[6]}T23:59:59.999Z`;
    const records = [...this.records.values()].filter((row) => row.ownerId === userId && row.value.createdAt >= start && row.value.createdAt <= end).map((row) => row.value);
    const bins = new Map<string, { count: number; weight: number }>(); records.forEach((record) => { const current = bins.get(record.binLabel) ?? { count: 0, weight: 0 }; current.count += 1; current.weight += record.estimatedWeightGrams; bins.set(record.binLabel, current); });
    const daily = week.dates.map((date) => { const rows = records.filter((record) => dateKey(new Date(record.createdAt)) === date); return { date, count: rows.length, weightGrams: rows.reduce((sum, row) => sum + row.estimatedWeightGrams, 0), disposalCo2eKg: rows.reduce((sum, row) => sum + (row.estimatedDisposalCo2eKg ?? 0), 0) }; });
    const suggestions = records.some((row) => row.category === "BATTERY" || row.category === "E_WASTE")
      ? [{ code: "SAFE_RETURN", title: "Return special items together", action: "Keep batteries and e-waste dry and take them to an approved collection point.", evidence: "Your accepted records include a battery or electronic item." }]
      : [{ code: "REFILL", title: "Refill before replacing", action: "Try one reusable packaging swap on your next shop.", evidence: `${records.filter((row) => row.category === "LIGHTWEIGHT_PACKAGING").length} lightweight packages this period.` }];
    return { totalAccepted: records.length, totalWeightGrams: records.reduce((sum, row) => sum + row.estimatedWeightGrams, 0), totalDisposalCo2eKg: records.reduce((sum, row) => sum + (row.estimatedDisposalCo2eKg ?? 0), 0), recordsWithoutCarbonFactor: records.filter((row) => row.estimatedDisposalCo2eKg === null).length, daily, dailyCounts: daily.map((row) => row.count), categories: [...bins].map(([label, value]) => ({ category: "BIN" as const, label, count: value.count, weightGrams: value.weight })).sort((a, b) => b.count - a.count), suggestions };
  }

  async checkout(userId: string, planCode: "PLUS" | "HOUSEHOLD", paymentToken: "tok_demo_visa" | "tok_demo_declined") {
    if (planCode === "HOUSEHOLD") throw new HttpException("PLAN_NOT_AVAILABLE", HttpStatus.CONFLICT);
    const status = paymentToken === "tok_demo_declined" ? "DECLINED" : "SUCCEEDED"; const transaction: PaymentTransactionDto = { id: randomUUID(), planCode, amountCents: 999, currency: "EUR", status, provider: "FAKE", providerReference: `fake_${randomUUID()}`, failureCode: status === "DECLINED" ? "FAKE_PAYMENT_DECLINED" : null, createdAt: new Date().toISOString() };
    const rows = this.paymentRows.get(userId) ?? []; rows.unshift(transaction); this.paymentRows.set(userId, rows);
    if (status === "DECLINED") throw new HttpException({ code: "FAKE_PAYMENT_DECLINED", message: "The demo payment was declined." }, HttpStatus.PAYMENT_REQUIRED);
    this.plansByUser.set(userId, "PLUS"); return { subscription: await this.subscription(userId), transaction };
  }
  async switchToFree(userId: string): Promise<SubscriptionDto> { this.plansByUser.set(userId, "FREE"); return this.subscription(userId); }
  async transactions(userId: string): Promise<PaymentTransactionDto[]> { return this.paymentRows.get(userId) ?? []; }
  async readiness() { return { database: "ok" as const, ruleSetVersion: RULE_VERSION }; }
}
