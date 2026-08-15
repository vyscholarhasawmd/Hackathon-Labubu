import { defineStore } from "pinia";
import type { AnalyticsDto, ScanDto, SubscriptionDto, WasteRecordDto } from "@resort/contracts";
import { api, ensureDemoSession } from "./api";

const localScan: ScanDto = {
  id: "local-demo-scan", status: "ANALYZED", provider: "MOCK", countryCode: "DE", createdAt: new Date().toISOString(),
  identification: { primaryObject: "Yogurt cup", isPackaging: true, packagingType: "CUP", materials: [{ material: "PP", proportion: "PRIMARY", confidence: .91 }], visibleSymbols: [{ code: "PP_5", rawText: "PP 5", confidence: .86 }], estimatedWeightGrams: 25, weightConfidence: .58, overallConfidence: .88, uncertainties: [], retakeAdvice: null },
};

const localRecord: WasteRecordDto = {
  id: "local-demo-record", scanId: localScan.id, identifiedName: "Yogurt cup", category: "LIGHTWEIGHT_PACKAGING", primaryMaterial: "PP", materialLabel: "Plastic · PP 5", disposalRoute: "YELLOW_BIN_OR_SACK", binLabel: "Yellow bin or sack",
  preparationSteps: ["Empty the container", "No need to rinse", "Separate the lid if easily removable", "Do not nest different packages"], reuseSuggestions: ["Reuse this cup for small-item storage, or choose a reusable container next time."], environmentalImpactSummary: "Separating lightweight packaging keeps recoverable material out of residual waste and improves sorting quality.", estimatedWeightGrams: 25, estimatedDisposalCo2eKg: .000116, classificationConfidence: .88, ruleSetVersion: "DE-FEDERAL-2026.08", sourceUrls: ["https://www.umweltbundesamt.de/umwelttipps-fuer-den-alltag/richtiger-muelltrennung-ressourcen-schonen-umwelt"], createdAt: new Date().toISOString(),
};

const localHistory = [localRecord, { ...localRecord, id: "paper", identifiedName: "Cardboard box", category: "PAPER_CARDBOARD" as const, materialLabel: "Paper · Cardboard", binLabel: "Blue paper bin", estimatedWeightGrams: 82 }, { ...localRecord, id: "glass", identifiedName: "Olive oil bottle", category: "GLASS_PACKAGING" as const, materialLabel: "Glass", binLabel: "Glass container", estimatedWeightGrams: 310 }];

export const useResortStore = defineStore("resort", {
  state: () => ({
    apiOnline: true, initialized: false, previewUrl: "" as string, file: null as File | null,
    scan: null as ScanDto | null, record: null as WasteRecordDto | null,
    subscription: { plan: "FREE", weeklyLimit: 10, used: 7, remaining: 3, resetsAt: new Date().toISOString() } as SubscriptionDto,
    history: localHistory as WasteRecordDto[],
    analytics: { totalAccepted: 7, totalWeightGrams: 598, totalDisposalCo2eKg: .003, dailyCounts: [3,5,4,2,4,6,3], categories: [{label:"Plastic",count:4},{label:"Paper",count:2},{label:"Metal",count:1},{label:"Glass",count:0}], suggestions: [{title:"Refill before replacing",action:"Try one reusable packaging swap."}] } as AnalyticsDto,
  }),
  actions: {
    async initialize() {
      if (this.initialized) return;
      try {
        await ensureDemoSession();
        const [subscription, records, analytics] = await Promise.all([api.get<SubscriptionDto>("/subscriptions/current"), api.get<{items:WasteRecordDto[]}>("/waste-records"), api.get<AnalyticsDto>("/analytics/summary")]);
        this.subscription = subscription.data; this.history = records.data.items; this.analytics = analytics.data; this.apiOnline = true;
      } catch { this.apiOnline = false; }
      this.initialized = true;
    },
    selectFile(file: File) {
      if (this.previewUrl.startsWith("blob:")) URL.revokeObjectURL(this.previewUrl);
      this.file = file; this.previewUrl = URL.createObjectURL(file);
    },
    async analyze() {
      if (!this.file) throw new Error("Choose a photo first");
      try {
        const form = new FormData(); form.append("image", this.file); form.append("countryCode", "DE");
        const response = await api.post<ScanDto>("/scans", form, { headers: { "Idempotency-Key": crypto.randomUUID() } });
        this.scan = response.data; this.subscription.used += 1; this.subscription.remaining = Math.max(0, this.subscription.remaining - 1);
      } catch { this.scan = localScan; this.apiOnline = false; }
      return this.scan;
    },
    async accept() {
      if (!this.scan) this.scan = localScan;
      try {
        const decision = await api.post<{wasteRecordId:string}>(`/scans/${this.scan.id}/decision`, { decision: "ACCEPT" });
        this.record = (await api.get<WasteRecordDto>(`/waste-records/${decision.data.wasteRecordId}`)).data;
      } catch { this.record = localRecord; }
      return this.record;
    },
    async reject() {
      if (this.scan && this.apiOnline) await api.post(`/scans/${this.scan.id}/decision`, { decision: "REJECT" }).catch(() => undefined);
    },
    async updateWeight(grams: number) {
      if (!this.record) return;
      try { this.record = (await api.patch<WasteRecordDto>(`/waste-records/${this.record.id}/weight`, { grams })).data; }
      catch { this.record.estimatedWeightGrams = grams; this.record.estimatedDisposalCo2eKg = (grams / 1_000_000) * 4.65358; }
    },
    async upgradePlus() {
      try { const { data } = await api.post<{subscription:SubscriptionDto}>("/subscriptions/fake-checkout", { planCode: "PLUS", paymentMethodToken: "tok_demo_visa" }); this.subscription = data.subscription; }
      catch { this.subscription = { ...this.subscription, plan: "PLUS", weeklyLimit: 100, remaining: 100 - this.subscription.used }; }
    },
  },
});
