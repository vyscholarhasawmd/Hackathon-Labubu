import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { useResortStore } from "./store";

describe("Re-Sort mobile store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setActivePinia(createPinia());
  });

  it("starts with the Free quota and local fallback data", () => {
    const store = useResortStore();
    expect(store.subscription.weeklyLimit).toBe(10);
    expect(store.subscription.used).toBe(7);
    expect(store.history.length).toBeGreaterThan(0);
  });

  it("refreshes history and analytics after accepting a scan", async () => {
    const store = useResortStore();
    const acceptedRecord = {
      ...store.history[0]!,
      id: "accepted-record",
      scanId: "accepted-scan",
      identifiedName: "New accepted item",
      createdAt: new Date().toISOString(),
    };
    const refreshedAnalytics = {
      ...store.analytics,
      totalAccepted: store.analytics.totalAccepted + 1,
    };

    store.scan = {
      id: "accepted-scan",
      status: "ANALYZED",
      provider: "OPENAI",
      countryCode: "DE",
      createdAt: new Date().toISOString(),
      identification: {
        primaryObject: "New accepted item",
        isPackaging: true,
        packagingType: "OTHER",
        materials: [{ material: "Plastic", proportion: "PRIMARY", confidence: 0.9 }],
        visibleSymbols: [],
        estimatedWeightGrams: 30,
        weightConfidence: 0.6,
        overallConfidence: 0.9,
        uncertainties: [],
        retakeAdvice: null,
        disposalRecommendation: {
          wasteTypeLabel: "Plastic packaging",
          category: "LIGHTWEIGHT_PACKAGING",
          disposalRoute: "YELLOW_BIN_OR_SACK",
          binLabel: "Yellow bin or sack",
          confidence: 0.9,
          reason: "This plastic package belongs in the yellow bin or sack.",
          disposalInstructions: ["Empty the packaging"],
          reuseSuggestion: "Reuse it where practical.",
          requiresLocalGuidance: false,
        },
      },
    };

    vi.spyOn(api, "post").mockResolvedValue({ data: { wasteRecordId: acceptedRecord.id } });
    vi.spyOn(api, "get")
      .mockResolvedValueOnce({ data: acceptedRecord })
      .mockResolvedValueOnce({ data: { items: [acceptedRecord, ...store.history] } })
      .mockResolvedValueOnce({ data: refreshedAnalytics });

    await store.accept();

    expect(store.record?.id).toBe(acceptedRecord.id);
    expect(store.history[0]?.id).toBe(acceptedRecord.id);
    expect(store.analytics.totalAccepted).toBe(refreshedAnalytics.totalAccepted);
  });
});
