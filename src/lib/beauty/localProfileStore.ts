import type {
  FaceShapeName,
  IlluminantName,
  OccasionType,
  SeasonName,
  SkinTextureType,
  WhiteBalanceMethod,
} from "./types";

export const PROFILE_DB_NAME = "beauty_ai_local_profile";
export const PROFILE_DB_VERSION = 1;
export const LEGACY_SAVED_PRODUCTS_KEY = "beauty_ai_saved_products_v1";
export const FALLBACK_SNAPSHOT_KEY = "beauty_ai_local_profile_v1";

export const MAX_ANALYSIS_HISTORY = 25;
export const MAX_SAVED_PALETTES = 30;

export interface AnalysisHistoryEntry {
  id: string;
  createdAt: string; // ISO timestamp
  sourceLabel: string;
  isDemo: boolean;
  season: SeasonName;
  undertone: "Warm (Golden)" | "Cool (Pink/Blue)" | "Neutral";
  skinHex: string;
  lipHex: string;
  itaDeg: number;
  itaCategory: string;
  faceShape: FaceShapeName;
  reliabilityScore: number;
  L_star: number;
  a_star: number;
  b_star: number;
  targetLipHex: string;
  targetBlushHex: string;
  targetEyeshadowHex: string;
}

export interface SavedPaletteEntry {
  id: string;
  createdAt: string;
  name: string;
  season: SeasonName;
  occasion: OccasionType;
  skinHex: string;
  lipHex: string;
  blushHex: string;
  eyeshadowHex: string;
  note?: string;
}

export interface UserBeautyPreferences {
  displayName: string;
  occasion: OccasionType;
  texture: SkinTextureType;
  wbMethod: WhiteBalanceMethod;
  catalogIlluminant: IlluminantName;
}

export const DEFAULT_USER_PREFERENCES: UserBeautyPreferences = {
  displayName: "",
  occasion: "office",
  texture: "combination",
  wbMethod: "planckian_grey_edge",
  catalogIlluminant: "D65",
};

export type StorageBackendKind = "indexeddb" | "localstorage" | "memory";

export interface LocalProfileSnapshot {
  schemaVersion: number;
  analyses: AnalysisHistoryEntry[];
  palettes: SavedPaletteEntry[];
  savedProductIds: number[];
  preferences: UserBeautyPreferences;
  onboardingCompleted: boolean;
  storageBackend: StorageBackendKind;
}

export interface KeyValueStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalProfileStore {
  loadSnapshot(): Promise<LocalProfileSnapshot>;
  addAnalysis(entry: AnalysisHistoryEntry): Promise<LocalProfileSnapshot>;
  deleteAnalysis(id: string): Promise<LocalProfileSnapshot>;
  savePalette(entry: SavedPaletteEntry): Promise<LocalProfileSnapshot>;
  deletePalette(id: string): Promise<LocalProfileSnapshot>;
  setSavedProductIds(ids: number[]): Promise<LocalProfileSnapshot>;
  setPreferences(partial: Partial<UserBeautyPreferences>): Promise<LocalProfileSnapshot>;
  setOnboardingCompleted(completed: boolean): Promise<LocalProfileSnapshot>;
  clearAll(): Promise<LocalProfileSnapshot>;
}

function createEmptySnapshot(storageBackend: StorageBackendKind): LocalProfileSnapshot {
  return {
    schemaVersion: PROFILE_DB_VERSION,
    analyses: [],
    palettes: [],
    savedProductIds: [],
    preferences: { ...DEFAULT_USER_PREFERENCES },
    onboardingCompleted: false,
    storageBackend,
  };
}

function isValidHex(val: unknown): val is string {
  return typeof val === "string" && /^#[0-9a-fA-F]{6}$/.test(val);
}

function sanitizeAnalysis(raw: unknown): AnalysisHistoryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.createdAt !== "string") return null;
  if (typeof r.season !== "string" || typeof r.faceShape !== "string") return null;
  if (!isValidHex(r.skinHex) || !isValidHex(r.lipHex)) return null;
  return {
    id: r.id,
    createdAt: r.createdAt,
    sourceLabel: typeof r.sourceLabel === "string" ? r.sourceLabel.slice(0, 120) : "Ảnh chân dung",
    isDemo: Boolean(r.isDemo),
    season: r.season as SeasonName,
    undertone:
      r.undertone === "Warm (Golden)" || r.undertone === "Cool (Pink/Blue)" || r.undertone === "Neutral"
        ? r.undertone
        : "Neutral",
    skinHex: r.skinHex,
    lipHex: r.lipHex,
    itaDeg: typeof r.itaDeg === "number" && Number.isFinite(r.itaDeg) ? r.itaDeg : 35,
    itaCategory: typeof r.itaCategory === "string" ? r.itaCategory : "",
    faceShape: r.faceShape as FaceShapeName,
    reliabilityScore:
      typeof r.reliabilityScore === "number" && Number.isFinite(r.reliabilityScore)
        ? Math.max(0, Math.min(100, Math.round(r.reliabilityScore)))
        : 70,
    L_star: typeof r.L_star === "number" && Number.isFinite(r.L_star) ? r.L_star : 60,
    a_star: typeof r.a_star === "number" && Number.isFinite(r.a_star) ? r.a_star : 12,
    b_star: typeof r.b_star === "number" && Number.isFinite(r.b_star) ? r.b_star : 16,
    targetLipHex: isValidHex(r.targetLipHex) ? r.targetLipHex : "#B84A58",
    targetBlushHex: isValidHex(r.targetBlushHex) ? r.targetBlushHex : "#D98A95",
    targetEyeshadowHex: isValidHex(r.targetEyeshadowHex) ? r.targetEyeshadowHex : "#8A6F69",
  };
}

function sanitizePalette(raw: unknown): SavedPaletteEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  if (!isValidHex(r.lipHex) || !isValidHex(r.blushHex) || !isValidHex(r.eyeshadowHex)) return null;
  return {
    id: r.id,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    name: r.name.slice(0, 100),
    season: (typeof r.season === "string" ? r.season : "Bright Winter") as SeasonName,
    occasion:
      r.occasion === "daily" || r.occasion === "office" || r.occasion === "glam"
        ? r.occasion
        : "office",
    skinHex: isValidHex(r.skinHex) ? r.skinHex : "#DFC1AF",
    lipHex: r.lipHex,
    blushHex: r.blushHex,
    eyeshadowHex: r.eyeshadowHex,
    note: typeof r.note === "string" ? r.note.slice(0, 160) : undefined,
  };
}

function sanitizePreferences(raw: unknown): UserBeautyPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_USER_PREFERENCES };
  const r = raw as Record<string, unknown>;
  return {
    displayName: typeof r.displayName === "string" ? r.displayName.slice(0, 40) : "",
    occasion:
      r.occasion === "daily" || r.occasion === "office" || r.occasion === "glam"
        ? r.occasion
        : DEFAULT_USER_PREFERENCES.occasion,
    texture:
      r.texture === "combination" || r.texture === "oily" || r.texture === "dry"
        ? r.texture
        : DEFAULT_USER_PREFERENCES.texture,
    wbMethod:
      r.wbMethod === "planckian_grey_edge" ||
      r.wbMethod === "planckian_sog" ||
      r.wbMethod === "none"
        ? r.wbMethod
        : DEFAULT_USER_PREFERENCES.wbMethod,
    catalogIlluminant:
      r.catalogIlluminant === "D65" || r.catalogIlluminant === "D50"
        ? r.catalogIlluminant
        : DEFAULT_USER_PREFERENCES.catalogIlluminant,
  };
}

function sanitizeIdArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(raw.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0))
  );
}

function sanitizeSnapshot(raw: unknown, backend: StorageBackendKind): LocalProfileSnapshot {
  if (!raw || typeof raw !== "object") return createEmptySnapshot(backend);
  const obj = raw as Record<string, unknown>;
  const analyses = Array.isArray(obj.analyses)
    ? obj.analyses
        .map(sanitizeAnalysis)
        .filter((x): x is AnalysisHistoryEntry => x !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_ANALYSIS_HISTORY)
    : [];
  const palettes = Array.isArray(obj.palettes)
    ? obj.palettes
        .map(sanitizePalette)
        .filter((x): x is SavedPaletteEntry => x !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_SAVED_PALETTES)
    : [];
  return {
    schemaVersion: PROFILE_DB_VERSION,
    analyses,
    palettes,
    savedProductIds: sanitizeIdArray(obj.savedProductIds),
    preferences: sanitizePreferences(obj.preferences),
    onboardingCompleted: Boolean(obj.onboardingCompleted),
    storageBackend: backend,
  };
}

function readLegacySavedProductIds(storage: KeyValueStorageLike | null): number[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LEGACY_SAVED_PRODUCTS_KEY);
    if (!raw) return [];
    return sanitizeIdArray(JSON.parse(raw));
  } catch {
    return [];
  }
}

function openIndexedDb(idbFactory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idbFactory.open(PROFILE_DB_NAME, PROFILE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("analyses")) {
        db.createObjectStore("analyses", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("palettes")) {
        db.createObjectStore("palettes", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open error"));
  });
}

function idbGetAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB getAll(${storeName}) failed`));
  });
}

function idbGetMeta<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readonly");
    const req = tx.objectStore("meta").get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB getMeta(${key}) failed`));
  });
}

function idbWriteSnapshot(db: IDBDatabase, snap: LocalProfileSnapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["analyses", "palettes", "meta"], "readwrite");
    const analysesStore = tx.objectStore("analyses");
    const palettesStore = tx.objectStore("palettes");
    const metaStore = tx.objectStore("meta");

    analysesStore.clear();
    for (const item of snap.analyses) {
      analysesStore.put(item);
    }

    palettesStore.clear();
    for (const pal of snap.palettes) {
      palettesStore.put(pal);
    }

    metaStore.put(snap.savedProductIds, "savedProductIds");
    metaStore.put(snap.preferences, "preferences");
    metaStore.put(snap.onboardingCompleted, "onboardingCompleted");
    metaStore.put(PROFILE_DB_VERSION, "schemaVersion");

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write transaction aborted"));
  });
}

export function createLocalProfileStore(options?: {
  indexedDB?: IDBFactory | null;
  storage?: KeyValueStorageLike | null;
}): LocalProfileStore {
  const idbFactory =
    options && "indexedDB" in options
      ? options.indexedDB
      : typeof window !== "undefined" && "indexedDB" in window
        ? window.indexedDB
        : null;

  const kvStorage: KeyValueStorageLike | null =
    options && "storage" in options
      ? options.storage ?? null
      : typeof window !== "undefined"
        ? (() => {
            try {
              return window.localStorage;
            } catch {
              return null;
            }
          })()
        : null;

  let memorySnapshot: LocalProfileSnapshot = createEmptySnapshot(
    idbFactory ? "indexeddb" : kvStorage ? "localstorage" : "memory"
  );
  let dbPromise: Promise<IDBDatabase | null> | null = null;

  const getDb = async (): Promise<IDBDatabase | null> => {
    if (!idbFactory) return null;
    if (!dbPromise) {
      dbPromise = openIndexedDb(idbFactory).catch(() => null);
    }
    return dbPromise;
  };

  const persistSnapshot = async (snap: LocalProfileSnapshot): Promise<LocalProfileSnapshot> => {
    const db = await getDb();
    if (db) {
      try {
        await idbWriteSnapshot(db, snap);
        const committed: LocalProfileSnapshot = { ...snap, storageBackend: "indexeddb" };
        memorySnapshot = committed;
        // Keep legacy saved-product mirror synced for safety while avoiding quota errors
        try {
          kvStorage?.setItem(LEGACY_SAVED_PRODUCTS_KEY, JSON.stringify(committed.savedProductIds));
        } catch {
          // Ignore secondary mirror write failure
        }
        return committed;
      } catch {
        // Fall through to localStorage / memory on quota or private-mode IDB errors
      }
    }

    if (kvStorage) {
      try {
        const committed: LocalProfileSnapshot = { ...snap, storageBackend: "localstorage" };
        kvStorage.setItem(FALLBACK_SNAPSHOT_KEY, JSON.stringify(committed));
        kvStorage.setItem(LEGACY_SAVED_PRODUCTS_KEY, JSON.stringify(committed.savedProductIds));
        memorySnapshot = committed;
        return committed;
      } catch {
        // QuotaExceededError or disabled storage -> degrade cleanly to in-memory session state
      }
    }

    const memCommitted: LocalProfileSnapshot = { ...snap, storageBackend: "memory" };
    memorySnapshot = memCommitted;
    return memCommitted;
  };

  const loadSnapshot = async (): Promise<LocalProfileSnapshot> => {
    const legacyIds = readLegacySavedProductIds(kvStorage);
    const db = await getDb();

    if (db) {
      try {
        const [analyses, palettes, savedIds, preferences, onboardingCompleted] = await Promise.all([
          idbGetAll<unknown>(db, "analyses"),
          idbGetAll<unknown>(db, "palettes"),
          idbGetMeta<unknown>(db, "savedProductIds"),
          idbGetMeta<unknown>(db, "preferences"),
          idbGetMeta<unknown>(db, "onboardingCompleted"),
        ]);

        const mergedIds = Array.from(
          new Set([...sanitizeIdArray(savedIds), ...legacyIds])
        );
        const snap = sanitizeSnapshot(
          {
            analyses,
            palettes,
            savedProductIds: mergedIds,
            preferences,
            onboardingCompleted,
          },
          "indexeddb"
        );
        memorySnapshot = snap;
        // Persist migrated legacy IDs if needed
        if (legacyIds.length > 0 && sanitizeIdArray(savedIds).length === 0) {
          await persistSnapshot(snap);
        }
        return snap;
      } catch {
        // Fall back cleanly if IDB read fails
      }
    }

    if (kvStorage) {
      try {
        const raw = kvStorage.getItem(FALLBACK_SNAPSHOT_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const base = sanitizeSnapshot(parsed, "localstorage");
        const mergedIds = Array.from(new Set([...base.savedProductIds, ...legacyIds]));
        const snap: LocalProfileSnapshot = {
          ...base,
          savedProductIds: mergedIds,
          storageBackend: "localstorage",
        };
        memorySnapshot = snap;
        return snap;
      } catch {
        // Corrupted JSON in localStorage -> reset gracefully to clean snapshot with legacy IDs if readable
        const recovered: LocalProfileSnapshot = {
          ...createEmptySnapshot("localstorage"),
          savedProductIds: legacyIds,
        };
        memorySnapshot = recovered;
        return recovered;
      }
    }

    memorySnapshot = { ...memorySnapshot, storageBackend: "memory" };
    return memorySnapshot;
  };

  return {
    loadSnapshot,

    async addAnalysis(entry: AnalysisHistoryEntry): Promise<LocalProfileSnapshot> {
      const current = await loadSnapshot();
      const sanitized = sanitizeAnalysis(entry);
      if (!sanitized) return current;
      const nextAnalyses = [
        sanitized,
        ...current.analyses.filter((item) => item.id !== sanitized.id),
      ].slice(0, MAX_ANALYSIS_HISTORY);
      return persistSnapshot({ ...current, analyses: nextAnalyses });
    },

    async deleteAnalysis(id: string): Promise<LocalProfileSnapshot> {
      const current = await loadSnapshot();
      const nextAnalyses = current.analyses.filter((item) => item.id !== id);
      return persistSnapshot({ ...current, analyses: nextAnalyses });
    },

    async savePalette(entry: SavedPaletteEntry): Promise<LocalProfileSnapshot> {
      const current = await loadSnapshot();
      const sanitized = sanitizePalette(entry);
      if (!sanitized) return current;
      const nextPalettes = [
        sanitized,
        ...current.palettes.filter((p) => p.id !== sanitized.id),
      ].slice(0, MAX_SAVED_PALETTES);
      return persistSnapshot({ ...current, palettes: nextPalettes });
    },

    async deletePalette(id: string): Promise<LocalProfileSnapshot> {
      const current = await loadSnapshot();
      const nextPalettes = current.palettes.filter((p) => p.id !== id);
      return persistSnapshot({ ...current, palettes: nextPalettes });
    },

    async setSavedProductIds(ids: number[]): Promise<LocalProfileSnapshot> {
      const current = await loadSnapshot();
      return persistSnapshot({ ...current, savedProductIds: sanitizeIdArray(ids) });
    },

    async setPreferences(partial: Partial<UserBeautyPreferences>): Promise<LocalProfileSnapshot> {
      const current = await loadSnapshot();
      const merged = sanitizePreferences({ ...current.preferences, ...partial });
      return persistSnapshot({ ...current, preferences: merged });
    },

    async setOnboardingCompleted(completed: boolean): Promise<LocalProfileSnapshot> {
      const current = await loadSnapshot();
      return persistSnapshot({ ...current, onboardingCompleted: Boolean(completed) });
    },

    async clearAll(): Promise<LocalProfileSnapshot> {
      const db = await getDb();
      const empty = createEmptySnapshot(
        db ? "indexeddb" : kvStorage ? "localstorage" : "memory"
      );
      if (db) {
        try {
          await idbWriteSnapshot(db, empty);
        } catch {
          // Ignore error and still clear kvStorage & memory
        }
      }
      if (kvStorage) {
        try {
          kvStorage.removeItem(FALLBACK_SNAPSHOT_KEY);
          kvStorage.removeItem(LEGACY_SAVED_PRODUCTS_KEY);
        } catch {
          // Ignore storage removal errors
        }
      }
      memorySnapshot = empty;
      return empty;
    },
  };
}

export const defaultLocalProfileStore = createLocalProfileStore();
