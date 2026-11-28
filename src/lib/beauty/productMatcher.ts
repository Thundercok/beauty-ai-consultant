import { SEASON_COLOR_PALETTES } from "./adviceEngine";
import { adaptLabBradford, hexToLab, labToRgb, rgbToHex, rgbToLab } from "./bradfordCat";
import { kubelkaMunkLipBlend } from "./kubelkaMunk";
import { isValidHexColor, validateCatalogRecord } from "./recommendationIntegrity";
import type { CatalogProduct, IlluminantName, MatchedProduct, SeasonName } from "./types";

/**
 * Documented CIEDE2000 (ΔE₀₀, kL = kC = kH = 1) perceptual color-similarity thresholds.
 * These measure ONLY colorimetric distance between target and candidate sRGB / Kubelka–Munk
 * colors under D65 — NEVER statistical probability of real-world cosmetic suitability.
 */
export const CIEDE2000_SIMILARITY_THRESHOLDS = {
  /** ΔE₀₀ < 1.0: Imperceptible / near-identical under controlled D65 viewing (~1 JND). */
  EXACT_MAX: 1.0,
  /** 1.0 ≤ ΔE₀₀ < 2.0: Barely perceptible difference on close side-by-side inspection. */
  GREAT_MAX: 2.0,
  /** 2.0 ≤ ΔE₀₀ < 5.0: Noticeable difference, still within the same close shade neighborhood. */
  CLOSE_MAX: 5.0,
} as const;

/**
 * Product categories that have a scientifically meaningful colorimetric target
 * (seasonal lip/blush/eye palette target or measured facial skin shade).
 * Categories outside this set (e.g. glasses frames, black mascara/eyeliner, setting spray,
 * contour/highlighter) must NOT be scored by comparing their swatch HEX to bare skin HEX.
 */
export const COLORIMETRIC_MATCH_PRODUCT_TYPES = new Set([
  "lipstick",
  "blush",
  "eyeshadow",
  "foundation",
  "concealer",
  "powder",
]);

export function isColorimetricMatchProductType(productType: string | null | undefined): boolean {
  return typeof productType === "string" && COLORIMETRIC_MATCH_PRODUCT_TYPES.has(productType.trim());
}

export function classifyColorSimilarityTier(
  deltaE: number | null | undefined
): MatchedProduct["matchTier"] {
  if (typeof deltaE !== "number" || !Number.isFinite(deltaE) || deltaE < 0) return null;
  if (deltaE < CIEDE2000_SIMILARITY_THRESHOLDS.EXACT_MAX) return "Exact Match";
  if (deltaE < CIEDE2000_SIMILARITY_THRESHOLDS.GREAT_MAX) return "Great Match";
  if (deltaE < CIEDE2000_SIMILARITY_THRESHOLDS.CLOSE_MAX) return "Close Alternative";
  return "Distant Shade";
}

export interface ColorSimilarityDescription {
  tier: MatchedProduct["matchTier"];
  deltaE: number | null;
  deltaELabel: string | null;
  thresholdBand: "< 1.0" | "1.0–2.0" | "2.0–5.0" | "≥ 5.0" | null;
  isWithinCloseThreshold: boolean;
}

/**
 * Maps a CIEDE2000 ΔE₀₀ value directly to its documented perceptual threshold band
 * without rescaling into an uncalibrated suitability probability percentage.
 */
export function describeColorSimilarity(
  deltaE: number | null | undefined
): ColorSimilarityDescription {
  const tier = classifyColorSimilarityTier(deltaE);
  if (tier === null || typeof deltaE !== "number" || !Number.isFinite(deltaE)) {
    return {
      tier: null,
      deltaE: null,
      deltaELabel: null,
      thresholdBand: null,
      isWithinCloseThreshold: false,
    };
  }
  const rounded = Number(deltaE.toFixed(2));
  const thresholdBand =
    tier === "Exact Match"
      ? "< 1.0"
      : tier === "Great Match"
        ? "1.0–2.0"
        : tier === "Close Alternative"
          ? "2.0–5.0"
          : "≥ 5.0";
  return {
    tier,
    deltaE: rounded,
    deltaELabel: `ΔE₀₀ ${rounded.toFixed(1)}`,
    thresholdBand,
    isWithinCloseThreshold: deltaE < CIEDE2000_SIMILARITY_THRESHOLDS.CLOSE_MAX,
  };
}

/**
 * Exact CIEDE2000 color-difference formula (Sharma, Wu & Dalal 2005, kL = kC = kH = 1).
 * Includes explicit IEEE-754 Eq. (7) and Eq. (10) guards for achromatic / negative-zero pairs.
 */
export function ciede2000(
  targetLab: [number, number, number],
  candidateLab: [number, number, number]
): number {
  const [l1, a1, b1] = targetLab;
  const [l2, a2, b2] = candidateLab;

  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));

  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;
  const c1Prime = Math.hypot(a1Prime, b1);
  const c2Prime = Math.hypot(a2Prime, b2);

  const deg = (rad: number) => (((rad * 180) / Math.PI) % 360 + 360) % 360;
  const rad = (degVal: number) => (degVal * Math.PI) / 180;

  // Sharma et al. Eq. (7): h' = 0 when a' = 0 and b = 0 (guards IEEE-754 atan2(-0, -0) = -π)
  const h1Prime = a1Prime === 0 && b1 === 0 ? 0 : deg(Math.atan2(b1, a1Prime));
  const h2Prime = a2Prime === 0 && b2 === 0 ? 0 : deg(Math.atan2(b2, a2Prime));

  const deltaL = l2 - l1;
  const deltaC = c2Prime - c1Prime;

  // Sharma et al. Eq. (10): Δh' = 0 whenever C1' * C2' = 0
  let deltaHAngle = 0;
  if (c1Prime * c2Prime !== 0) {
    deltaHAngle = h2Prime - h1Prime;
    if (deltaHAngle > 180) deltaHAngle -= 360;
    if (deltaHAngle < -180) deltaHAngle += 360;
  }
  const deltaH = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(rad(deltaHAngle / 2));

  const lBar = (l1 + l2) / 2;
  const cBarPrime = (c1Prime + c2Prime) / 2;
  const hueSum = h1Prime + h2Prime;
  const hueDiff = Math.abs(h1Prime - h2Prime);

  let hBar: number;
  if (c1Prime * c2Prime === 0) {
    hBar = hueSum;
  } else if (hueDiff <= 180) {
    hBar = hueSum / 2;
  } else if (hueSum < 360) {
    hBar = (hueSum + 360) / 2;
  } else {
    hBar = (hueSum - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos(rad(hBar - 30)) +
    0.24 * Math.cos(rad(2 * hBar)) +
    0.32 * Math.cos(rad(3 * hBar + 6)) -
    0.2 * Math.cos(rad(4 * hBar - 63));

  const deltaTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const cBarPrime7 = cBarPrime ** 7;
  const rC = 2 * Math.sqrt(cBarPrime7 / (cBarPrime7 + 25 ** 7));
  const lBarMinus50Sq = (lBar - 50) ** 2;
  const sL = 1 + (0.015 * lBarMinus50Sq) / Math.sqrt(20 + lBarMinus50Sq);
  const sC = 1 + 0.045 * cBarPrime;
  const sH = 1 + 0.015 * cBarPrime * t;
  const rT = -Math.sin(rad(2 * deltaTheta)) * rC;

  const termL = deltaL / sL;
  const termC = deltaC / sC;
  const termH = deltaH / sH;

  return Math.sqrt(Math.max(0, termL ** 2 + termC ** 2 + termH ** 2 + rT * termC * termH));
}

export function blendTargetColorsLab(
  seasonProbabilities: Record<SeasonName, number>
): { lip: string; blush: string; eyeshadow: string } {
  const entries = (Object.keys(seasonProbabilities) as SeasonName[])
    .filter(
      (name) =>
        name in SEASON_COLOR_PALETTES &&
        Number.isFinite(seasonProbabilities[name]) &&
        seasonProbabilities[name] > 0
    )
    .map((name) => ({ name, prob: seasonProbabilities[name] }));

  const total = entries.reduce((acc, item) => acc + item.prob, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return { lip: "#B76D83", blush: "#D791A4", eyeshadow: "#9C8691" };
  }

  const blendSlot = (key: "lip_hex" | "blush_hex" | "eye_hex") => {
    const weighted: [number, number, number] = [0, 0, 0];
    for (const item of entries) {
      const lab = hexToLab(SEASON_COLOR_PALETTES[item.name][key]);
      const w = item.prob / total;
      weighted[0] += w * lab[0];
      weighted[1] += w * lab[1];
      weighted[2] += w * lab[2];
    }
    return rgbToHex(labToRgb(weighted));
  };

  return {
    lip: blendSlot("lip_hex"),
    blush: blendSlot("blush_hex"),
    eyeshadow: blendSlot("eye_hex"),
  };
}

export function matchProducts(
  targetHex: string,
  products: CatalogProduct[],
  options: {
    productType: string;
    lipBaseLab?: [number, number, number];
    topK?: number;
    catalogIlluminant?: IlluminantName;
  }
): MatchedProduct[] {
  const { productType, lipBaseLab, topK = 6, catalogIlluminant = "D65" } = options;
  if (!isValidHexColor(targetHex)) return [];

  // Requirement 4: Enforce complete record validation (brand, product_name, product_type, valid HEX)
  // so malformed or incomplete catalog rows cannot silently pollute color-similarity rankings.
  const validated = products
    .filter((p) => p.product_type === productType)
    .map((row) => ({ row, validation: validateCatalogRecord(row) }))
    .filter(({ validation }) => validation.validForColorMatch);

  if (validated.length === 0) return [];

  const targetLab = hexToLab(targetHex);
  const validLipBaseLab =
    Array.isArray(lipBaseLab) &&
    lipBaseLab.length === 3 &&
    lipBaseLab.every((v) => typeof v === "number" && Number.isFinite(v))
      ? lipBaseLab
      : null;
  const substrateRgb = validLipBaseLab ? labToRgb(validLipBaseLab) : null;

  const scored: MatchedProduct[] = [];
  for (const { row, validation } of validated) {
    let productLab = hexToLab(row.hex_color);
    // When catalog swatches are tagged as D50-referenced (ICC PCS studio workflow),
    // adapt from D50 -> D65 via Bradford CAT before D65 comparison / lip blending.
    if (catalogIlluminant === "D50") {
      productLab = adaptLabBradford(productLab, "D50", "D65");
    }

    let candidateLab = productLab;
    let renderedHex: string | undefined;
    let similarityBasis: MatchedProduct["similarityBasis"] = "ciede2000_d65_swatch";

    if (substrateRgb && productType === "lipstick") {
      const productRgb = labToRgb(productLab);
      const renderedRgb = kubelkaMunkLipBlend(substrateRgb, productRgb, {
        textureType: row.texture_type || "standard",
      });
      candidateLab = rgbToLab(renderedRgb);
      renderedHex = rgbToHex(renderedRgb);
      similarityBasis = "ciede2000_d65_kubelka_munk_lip";
    }

    const deltaE = ciede2000(targetLab, candidateLab);
    if (!Number.isFinite(deltaE)) continue;

    const matchTier = classifyColorSimilarityTier(deltaE);

    scored.push({
      id: row.id,
      brand: row.brand,
      name: row.product_name,
      shade: row.shade_name,
      productType: row.product_type,
      texture: row.texture_type || "Standard",
      hex: row.hex_color,
      renderedHex,
      deltaE: Number(deltaE.toFixed(2)),
      matchTier,
      isPersonalized: true,
      similarityBasis,
      missingMetadataFields: validation.warnings.length > 0 ? validation.warnings : undefined,
      undertone: row.undertone,
      bestSeasons: row.best_seasons,
    });
  }

  scored.sort((a, b) => (a.deltaE ?? Infinity) - (b.deltaE ?? Infinity));
  return scored.slice(0, topK);
}

export interface TrendingProductItem extends MatchedProduct {
  hotReason: string;
  /** Editorial ranking heuristic (color proximity + metadata tags + curated familiarity; NOT live sales or suitability probability). */
  popularityScore: number;
  isPopular: boolean;
}

export const POPULARITY_HIGHLIGHT_THRESHOLD = 15.0;

/**
 * Documented heuristic weights for editorial curation in `scoreMatchedProductsPopularity`.
 * Transparently separates CIEDE2000 color proximity from static catalog metadata & familiarity;
 * none of these terms represent verified retail sales volume or statistical suitability probability.
 */
export const EDITORIAL_CURATION_WEIGHTS = {
  COLOR_FIT_MAX: 12.0,
  SEASON_TAG_MATCH: 5.0,
  MULTI_SEASON_TAG: 2.5,
  CURATED_BRAND_FAMILIARITY: 2.5,
  CURATED_LINE_FAMILIARITY: 1.5,
} as const;

const POPULAR_HOT_BRANDS = new Set([
  "Lemonade",
  "OFÉLIA",
  "M.O.I Cosmetics",
  "Cỏ Mềm Homelab",
  "Gilaa",
  "Black Rouge",
  "Merzy",
  "Romand",
  "Clio",
  "3CE",
  "Dior",
  "YSL",
  "NARS",
  "Maybelline",
]);

const VN_LOCAL_BRANDS = new Set([
  "Lemonade",
  "OFÉLIA",
  "M.O.I Cosmetics",
  "Cỏ Mềm Homelab",
  "Gilaa",
]);

const CULT_FAVORITE_PATTERN =
  /Quốc Dân|Huyền Thoại|Juicy|Lolli|Air Fit|Lip Glow|Perfect Couple|Neo Cushion|Velvet Lip Tint|Baby Skin/i;

export function scoreMatchedProductsPopularity(
  items: MatchedProduct[],
  userSeason: SeasonName
): TrendingProductItem[] {
  const targetSeasonLower = userSeason.trim().toLowerCase();

  return items.map((item) => {
    const validDelta =
      item.isPersonalized !== false &&
      typeof item.deltaE === "number" &&
      Number.isFinite(item.deltaE) &&
      item.deltaE >= 0
        ? item.deltaE
        : null;

    // Requirement 4: Missing / unpersonalized color-distance records must NEVER receive
    // static metadata or brand boosts that let them outrank valid CIEDE2000 matches.
    if (validDelta === null) {
      return {
        ...item,
        hotReason: "Chưa đo độ gần màu",
        popularityScore: 0,
        isPopular: false,
      };
    }

    const isWithinCloseThreshold = validDelta < CIEDE2000_SIMILARITY_THRESHOLDS.CLOSE_MAX;
    const colorFitScore = Math.max(0, EDITORIAL_CURATION_WEIGHTS.COLOR_FIT_MAX - validDelta);

    const rawSeasons = (item.bestSeasons ?? "").trim();
    const seasonsList = rawSeasons
      ? rawSeasons
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const matchesUserSeason = seasonsList.some((s) => s.toLowerCase() === targetSeasonLower);
    const isUniversal =
      rawSeasons.toLowerCase() === "all seasons" || seasonsList.length >= 3;
    const isPopularBrand = POPULAR_HOT_BRANDS.has(item.brand);
    const isCultLine =
      CULT_FAVORITE_PATTERN.test(item.name) || CULT_FAVORITE_PATTERN.test(item.shade);

    // Requirement 1: Static brand/line/tag curation must never override CIEDE2000 color proximity
    // by promoting a "Distant Shade" (ΔE₀₀ ≥ 5.0) above close colorimetric matches or marking it popular.
    const metadataScale = isWithinCloseThreshold ? 1.0 : 0.25;
    const rawMetadataBonus =
      (matchesUserSeason ? EDITORIAL_CURATION_WEIGHTS.SEASON_TAG_MATCH : 0) +
      (isUniversal ? EDITORIAL_CURATION_WEIGHTS.MULTI_SEASON_TAG : 0) +
      (isPopularBrand ? EDITORIAL_CURATION_WEIGHTS.CURATED_BRAND_FAMILIARITY : 0) +
      (isCultLine ? EDITORIAL_CURATION_WEIGHTS.CURATED_LINE_FAMILIARITY : 0);

    const popularityScore = Number((colorFitScore + rawMetadataBonus * metadataScale).toFixed(2));

    let hotReason = "Gợi ý danh mục";
    if (matchesUserSeason && isWithinCloseThreshold) {
      hotReason = "Gần màu & trùng mùa";
    } else if (VN_LOCAL_BRANDS.has(item.brand)) {
      hotReason = "Thương hiệu nội địa VN";
    } else if (isUniversal) {
      hotReason = "Gắn nhãn nhiều mùa";
    } else if (isCultLine) {
      hotReason = "Dòng quen thuộc";
    }

    return {
      ...item,
      hotReason,
      popularityScore,
      isPopular: isWithinCloseThreshold && popularityScore >= POPULARITY_HIGHLIGHT_THRESHOLD,
    };
  });
}

export function selectTrendingProducts(
  products: CatalogProduct[],
  options: {
    blendedTargets: { lip: string; blush: string; eyeshadow: string };
    skinHex: string;
    lipBaseLab: [number, number, number];
    userSeason: SeasonName;
    catalogIlluminant?: IlluminantName;
    limit?: number;
  }
): TrendingProductItem[] {
  const {
    blendedTargets,
    skinHex,
    lipBaseLab,
    userSeason,
    catalogIlluminant = "D65",
    limit = 6,
  } = options;

  const makeupTypes = ["lipstick", "blush", "eyeshadow", "foundation", "concealer"];
  const allMatched: MatchedProduct[] = [];

  for (const type of makeupTypes) {
    const targetHex =
      type === "lipstick"
        ? blendedTargets.lip
        : type === "blush"
          ? blendedTargets.blush
          : type === "eyeshadow"
            ? blendedTargets.eyeshadow
            : skinHex;

    allMatched.push(
      ...matchProducts(targetHex, products, {
        productType: type,
        lipBaseLab: type === "lipstick" ? lipBaseLab : undefined,
        topK: 80,
        catalogIlluminant,
      })
    );
  }

  const scored = scoreMatchedProductsPopularity(allMatched, userSeason);
  scored.sort((a, b) => b.popularityScore - a.popularityScore);

  const selected: TrendingProductItem[] = [];
  const brandCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();

  for (const item of scored) {
    if (selected.length >= limit) break;
    const bCount = brandCounts.get(item.brand) ?? 0;
    const tCount = typeCounts.get(item.productType) ?? 0;
    if (bCount >= 1 || tCount >= 2) continue;
    selected.push(item);
    brandCounts.set(item.brand, bCount + 1);
    typeCounts.set(item.productType, tCount + 1);
  }

  // Fill remaining slots if strict brand diversity left fewer than `limit`
  if (selected.length < limit) {
    const pickedIds = new Set(selected.map((s) => s.id));
    for (const item of scored) {
      if (selected.length >= limit) break;
      if (pickedIds.has(item.id)) continue;
      selected.push(item);
      pickedIds.add(item.id);
    }
  }

  return selected;
}
