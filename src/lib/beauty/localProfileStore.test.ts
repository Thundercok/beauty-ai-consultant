import test from "node:test";
import assert from "node:assert/strict";
import {
  createLocalProfileStore,
  FALLBACK_SNAPSHOT_KEY,
  LEGACY_SAVED_PRODUCTS_KEY,
  MAX_ANALYSIS_HISTORY,
  type AnalysisHistoryEntry,
  type KeyValueStorageLike,
  type SavedPaletteEntry,
} from "./localProfileStore";

function createMockStorage(initial?: Record<string, string>): KeyValueStorageLike & {
  dump: () => Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    dump: () => Object.fromEntries(map.entries()),
  };
}

function makeSampleAnalysis(id: string, createdAt = "2026-11-28T10:00:00.000Z"): AnalysisHistoryEntry {
  return {
    id,
    createdAt,
    sourceLabel: "selfie.jpg",
    isDemo: false,
    season: "Bright Winter",
    undertone: "Cool (Pink/Blue)",
    skinHex: "#E3C2B0",
    lipHex: "#BA6F75",
    itaDeg: 41.8,
    itaCategory: "Light (Fitzpatrick II)",
    faceShape: "Oval",
    reliabilityScore: 88,
    L_star: 66.4,
    a_star: 15.2,
    b_star: 17.8,
    targetLipHex: "#BE5663",
    targetBlushHex: "#DC7F8A",
    targetEyeshadowHex: "#866C6A",
  };
}

function makeSamplePalette(id: string): SavedPaletteEntry {
  return {
    id,
    createdAt: "2026-11-28T10:05:00.000Z",
    name: "Đi chơi · Đông Rực",
    season: "Bright Winter",
    occasion: "office",
    skinHex: "#E3C2B0",
    lipHex: "#BE5663",
    blushHex: "#DC7F8A",
    eyeshadowHex: "#866C6A",
  };
}

test("localProfileStore persists analyses, palettes, favorites, preferences, and deletes cleanly across reloads", async () => {
  const storage = createMockStorage({
    [LEGACY_SAVED_PRODUCTS_KEY]: JSON.stringify([12, 45]),
  });

  const storeA = createLocalProfileStore({ indexedDB: null, storage });
  const initial = await storeA.loadSnapshot();
  assert.equal(initial.storageBackend, "localstorage");
  assert.deepEqual(initial.savedProductIds, [12, 45]);
  assert.equal(initial.onboardingCompleted, false);

  await storeA.addAnalysis(makeSampleAnalysis("a-1", "2026-11-28T09:00:00.000Z"));
  await storeA.addAnalysis(makeSampleAnalysis("a-2", "2026-11-28T10:00:00.000Z"));
  await storeA.savePalette(makeSamplePalette("p-1"));
  await storeA.setSavedProductIds([12, 45, 88]);
  await storeA.setPreferences({ displayName: "Minh Anh", occasion: "daily", texture: "oily" });
  await storeA.setOnboardingCompleted(true);

  // Simulate full browser reload with a brand-new store instance sharing the same storage
  const storeB = createLocalProfileStore({ indexedDB: null, storage });
  const reloaded = await storeB.loadSnapshot();
  assert.equal(reloaded.analyses.length, 2);
  assert.equal(reloaded.analyses[0].id, "a-2"); // newest first
  assert.equal(reloaded.palettes.length, 1);
  assert.equal(reloaded.palettes[0].name, "Đi chơi · Đông Rực");
  assert.deepEqual(reloaded.savedProductIds, [12, 45, 88]);
  assert.equal(reloaded.preferences.displayName, "Minh Anh");
  assert.equal(reloaded.preferences.occasion, "daily");
  assert.equal(reloaded.preferences.texture, "oily");
  assert.equal(reloaded.onboardingCompleted, true);

  // Individual deletes
  const afterDelA = await storeB.deleteAnalysis("a-1");
  assert.equal(afterDelA.analyses.length, 1);
  const afterDelP = await storeB.deletePalette("p-1");
  assert.equal(afterDelP.palettes.length, 0);

  // Clear all data wipes storage cleanly
  const cleared = await storeB.clearAll();
  assert.equal(cleared.analyses.length, 0);
  assert.equal(cleared.palettes.length, 0);
  assert.equal(cleared.savedProductIds.length, 0);
  assert.equal(cleared.onboardingCompleted, false);
  assert.equal(storage.getItem(FALLBACK_SNAPSHOT_KEY), null);
  assert.equal(storage.getItem(LEGACY_SAVED_PRODUCTS_KEY), null);
});

test("localProfileStore recovers gracefully from corrupted JSON records and enforces history cap", async () => {
  const storage = createMockStorage({
    [FALLBACK_SNAPSHOT_KEY]: "{not-valid-json!!!",
    [LEGACY_SAVED_PRODUCTS_KEY]: "[7, \"bad\", -2, 19]",
  });

  const store = createLocalProfileStore({ indexedDB: null, storage });
  const snap = await store.loadSnapshot();
  assert.deepEqual(snap.savedProductIds, [7, 19]);
  assert.equal(snap.analyses.length, 0);

  // Add more than MAX_ANALYSIS_HISTORY entries
  for (let i = 0; i < MAX_ANALYSIS_HISTORY + 5; i++) {
    const ts = new Date(Date.UTC(2026, 10, 1, 0, i, 0)).toISOString();
    await store.addAnalysis(makeSampleAnalysis(`run-${i}`, ts));
  }
  const capped = await store.loadSnapshot();
  assert.equal(capped.analyses.length, MAX_ANALYSIS_HISTORY);
});

test("localProfileStore degrades cleanly to in-memory session when both IndexedDB and localStorage fail", async () => {
  const throwingStorage: KeyValueStorageLike = {
    getItem: () => {
      throw new Error("SecurityError: storage disabled");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };

  const store = createLocalProfileStore({ indexedDB: null, storage: throwingStorage });
  const snap = await store.addAnalysis(makeSampleAnalysis("mem-1"));
  assert.equal(snap.storageBackend, "memory");
  assert.equal(snap.analyses.length, 1);

  const cleared = await store.clearAll();
  assert.equal(cleared.analyses.length, 0);
});
