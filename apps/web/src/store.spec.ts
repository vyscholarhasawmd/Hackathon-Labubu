import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useResortStore } from "./store";

describe("Re-Sort mobile store", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("starts with the Free quota and local fallback data", () => {
    const store = useResortStore();
    expect(store.subscription.weeklyLimit).toBe(10);
    expect(store.subscription.used).toBe(7);
    expect(store.history.length).toBeGreaterThan(0);
  });
});
