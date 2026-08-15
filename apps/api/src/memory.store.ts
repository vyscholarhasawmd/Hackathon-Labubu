import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import type { AnalyticsDto, PlanCode, PlanDto, ScanDto, SubscriptionDto, WasteRecordDto } from "@resort/contracts";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";

interface LocalUser { id: string; username: string; displayName: string; passwordHash: string }

const PLANS: PlanDto[] = [
  { code: "FREE", name: "Free", weeklyLimit: 10, priceCents: 0, accuracyLabel: "Target AI accuracy ~80%", features: ["10 scans per week", "Basic sorting guidance", "Recent scan history"], checkoutEnabled: true },
  { code: "PLUS", name: "Plus", weeklyLimit: 100, priceCents: 999, accuracyLabel: "Target AI accuracy ~90%", features: ["100 scans per week", "Enhanced verification", "Impact tracking"], checkoutEnabled: true },
  { code: "HOUSEHOLD", name: "Household", weeklyLimit: 250, priceCents: 1799, accuracyLabel: "Target AI accuracy >90%", features: ["250 scans per week", "Up to 4 accounts", "Optional child accounts"], checkoutEnabled: false, comingSoon: true },
];

function seedRecord(name: string, category: WasteRecordDto["category"], material: string, bin: string, daysAgo: number, grams: number): WasteRecordDto {
  return {
    id: randomUUID(), scanId: randomUUID(), identifiedName: name, category, primaryMaterial: material,
    materialLabel: material, disposalRoute: bin.toUpperCase().replaceAll(" ", "_"), binLabel: bin,
    preparationSteps: ["Empty contents", "Keep recyclable material separate"], reuseSuggestions: ["Reuse before disposal when practical."],
    environmentalImpactSummary: "Correct separation supports cleaner recovery streams.", estimatedWeightGrams: grams,
    estimatedDisposalCo2eKg: category === "BATTERY" || category === "E_WASTE" ? null : (grams / 1_000_000) * 4.65358,
    classificationConfidence: 0.9, ruleSetVersion: "DE-FEDERAL-2026.08",
    sourceUrls: ["https://www.umweltbundesamt.de/umwelttipps-fuer-den-alltag/richtiger-muelltrennung-ressourcen-schonen-umwelt"],
    createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  };
}

@Injectable()
export class MemoryStore implements OnModuleInit {
  private readonly users = new Map<string, LocalUser>();
  private readonly scans = new Map<string, ScanDto>();
  private readonly records = new Map<string, WasteRecordDto>();
  private readonly idempotency = new Map<string, string>();
  private readonly plansByUser = new Map<string, PlanCode>();
  private readonly usageByUser = new Map<string, number>();

  async onModuleInit(): Promise<void> {
    const demoId = "00000000-0000-4000-8000-000000000001";
    this.users.set(demoId, { id: demoId, username: "demo", displayName: "Emma", passwordHash: await argon2.hash("Demo12345!") });
    this.plansByUser.set(demoId, "FREE");
    this.usageByUser.set(demoId, 7);
    [
      seedRecord("Yogurt cup", "LIGHTWEIGHT_PACKAGING", "Plastic · PP 5", "Yellow bin or sack", 0, 25),
      seedRecord("Cardboard box", "PAPER_CARDBOARD", "Paper · Cardboard", "Blue paper bin", 1, 82),
      seedRecord("Olive oil bottle", "GLASS_PACKAGING", "Glass", "Glass container", 1, 310),
      seedRecord("Aluminium can", "LIGHTWEIGHT_PACKAGING", "Metal · ALU", "Yellow bin or sack", 2, 20),
      seedRecord("Banana peel", "ORGANIC", "Organic", "Bio bin", 3, 95),
      seedRecord("AA battery", "BATTERY", "Battery", "Battery collection point", 4, 24),
      seedRecord("Shampoo bottle", "LIGHTWEIGHT_PACKAGING", "Plastic · HDPE 2", "Yellow bin or sack", 5, 42),
    ].forEach((record) => this.records.set(record.id, record));
  }

  findUserByUsername(username: string): LocalUser | undefined {
    return [...this.users.values()].find((user) => user.username === username.toLowerCase());
  }

  getUser(id: string): LocalUser {
    const user = this.users.get(id);
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async register(username: string, password: string): Promise<LocalUser> {
    if (this.findUserByUsername(username)) throw new ConflictException("Username is not available");
    const user: LocalUser = { id: randomUUID(), username: username.toLowerCase(), displayName: username, passwordHash: await argon2.hash(password) };
    this.users.set(user.id, user); this.plansByUser.set(user.id, "FREE"); this.usageByUser.set(user.id, 0);
    return user;
  }

  getPlans(): PlanDto[] { return PLANS; }

  subscription(userId: string): SubscriptionDto {
    const plan = this.plansByUser.get(userId) ?? "FREE";
    const definition = PLANS.find((item) => item.code === plan) ?? PLANS[0]!;
    const used = this.usageByUser.get(userId) ?? 0;
    const reset = new Date(); reset.setDate(reset.getDate() + ((8 - reset.getDay()) % 7 || 7)); reset.setHours(0, 0, 0, 0);
    return { plan, weeklyLimit: definition.weeklyLimit, used, remaining: Math.max(0, definition.weeklyLimit - used), resetsAt: reset.toISOString() };
  }

  reserveScan(userId: string): void {
    const subscription = this.subscription(userId);
    if (subscription.remaining <= 0) throw new HttpException("You have reached your weekly scan limit.", HttpStatus.TOO_MANY_REQUESTS);
    this.usageByUser.set(userId, subscription.used + 1);
  }

  createScan(userId: string, key: string): ScanDto {
    const existingId = this.idempotency.get(`${userId}:${key}`);
    if (existingId) return this.getScan(existingId);
    this.reserveScan(userId);
    const scan: ScanDto = {
      id: randomUUID(), status: "ANALYZED", provider: "MOCK", countryCode: "DE", createdAt: new Date().toISOString(),
      identification: {
        primaryObject: "Yogurt cup", isPackaging: true, packagingType: "CUP",
        materials: [{ material: "PP", proportion: "PRIMARY", confidence: 0.91 }],
        visibleSymbols: [{ code: "PP_5", rawText: "PP 5", confidence: 0.86 }],
        estimatedWeightGrams: 25, weightConfidence: 0.58, overallConfidence: 0.88, uncertainties: [], retakeAdvice: null,
      },
    };
    this.scans.set(scan.id, scan); this.idempotency.set(`${userId}:${key}`, scan.id);
    return scan;
  }

  getScan(id: string): ScanDto {
    const scan = this.scans.get(id);
    if (!scan) throw new NotFoundException("Scan not found");
    return scan;
  }

  decideScan(id: string, status: "ACCEPTED" | "REJECTED"): ScanDto {
    const scan = this.getScan(id);
    if (scan.status !== "ANALYZED") throw new ConflictException("SCAN_ALREADY_DECIDED");
    scan.status = status; this.scans.set(id, scan); return scan;
  }

  addRecord(record: WasteRecordDto): WasteRecordDto { this.records.set(record.id, record); return record; }
  getRecord(id: string): WasteRecordDto { const record = this.records.get(id); if (!record) throw new NotFoundException("Waste record not found"); return record; }
  listRecords(): WasteRecordDto[] { return [...this.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  deleteRecord(id: string): void { if (!this.records.delete(id)) throw new NotFoundException("Waste record not found"); }
  updateWeight(id: string, grams: number): WasteRecordDto { const record = this.getRecord(id); record.estimatedWeightGrams = grams; record.estimatedDisposalCo2eKg = (grams / 1_000_000) * 4.65358; return record; }

  analytics(): AnalyticsDto {
    const records = this.listRecords();
    const categories = new Map<string, number>(); records.forEach((record) => categories.set(record.category, (categories.get(record.category) ?? 0) + 1));
    return {
      totalAccepted: records.length,
      totalWeightGrams: records.reduce((sum, record) => sum + record.estimatedWeightGrams, 0),
      totalDisposalCo2eKg: records.reduce((sum, record) => sum + (record.estimatedDisposalCo2eKg ?? 0), 0),
      dailyCounts: [3, 5, 4, 2, 4, 6, 3],
      categories: [...categories].map(([label, count]) => ({ label, count })),
      suggestions: [
        { title: "Refill before replacing", action: "Try one reusable packaging swap on your next shop." },
        { title: "Keep paper clean and dry", action: "Separate food residue to preserve paper quality." },
      ],
    };
  }

  upgrade(userId: string, plan: PlanCode): SubscriptionDto { this.plansByUser.set(userId, plan); return this.subscription(userId); }
}
