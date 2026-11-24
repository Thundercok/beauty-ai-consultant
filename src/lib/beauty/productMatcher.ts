import { SEASON_COLOR_PALETTES } from "./adviceEngine";
import { adaptLabBradford, hexToLab, labToRgb, rgbToHex, rgbToLab } from "./bradfordCat";
import { kubelkaMunkLipBlend } from "./kubelkaMunk";
import type { CatalogProduct, IlluminantName, MatchedProduct, SeasonName } from "./types";

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

  const h1Prime = deg(Math.atan2(b1, a1Prime));
  const h2Prime = deg(Math.atan2(b2, a2Prime));

  const deltaL = l2 - l1;
  const deltaC = c2Prime - c1Prime;

  let deltaHAngle = h2Prime - h1Prime;
  if (deltaHAngle > 180) deltaHAngle -= 360;
  if (deltaHAngle < -180) deltaHAngle += 360;
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

  return Math.sqrt(termL ** 2 + termC ** 2 + termH ** 2 + rT * termC * termH);
}

export function blendTargetColorsLab(
  seasonProbabilities: Record<SeasonName, number>
): { lip: string; blush: string; eyeshadow: string } {
  const entries = (Object.keys(seasonProbabilities) as SeasonName[])
    .filter((name) => name in SEASON_COLOR_PALETTES && seasonProbabilities[name] > 0)
    .map((name) => ({ name, prob: seasonProbabilities[name] }));

  const total = entries.reduce((acc, item) => acc + item.prob, 0);
  if (total <= 0) {
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
  const filtered = products.filter((p) => p.product_type === productType);
  if (filtered.length === 0) return [];

  const targetLab = hexToLab(targetHex);
  const substrateRgb = lipBaseLab ? labToRgb(lipBaseLab) : null;

  const scored: MatchedProduct[] = filtered.map((row) => {
    let productLab = hexToLab(row.hex_color);
    if (catalogIlluminant === "D50") {
      productLab = adaptLabBradford(productLab, "D50", "D65");
    }

    let candidateLab = productLab;
    let renderedHex: string | undefined;

    if (substrateRgb && productType === "lipstick") {
      const productRgb = labToRgb(productLab);
      const renderedRgb = kubelkaMunkLipBlend(substrateRgb, productRgb, {
        textureType: row.texture_type || "standard",
      });
      candidateLab = rgbToLab(renderedRgb);
      renderedHex = rgbToHex(renderedRgb);
    }

    const deltaE = ciede2000(targetLab, candidateLab);
    const matchTier: MatchedProduct["matchTier"] =
      deltaE < 1.0 ? "Exact Match" : deltaE < 2.0 ? "Great Match" : "Close Alternative";

    return {
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
      undertone: row.undertone,
      bestSeasons: row.best_seasons,
    };
  });

  scored.sort((a, b) => a.deltaE - b.deltaE);
  return scored.slice(0, topK);
}

export interface TrendingProductItem extends MatchedProduct {
  hotReason: string;
  popularityScore: number;
  isPopular: boolean;
}

export const POPULARITY_HIGHLIGHT_THRESHOLD = 15.0;

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
  return items.map((item) => {
    const colorFitScore = Math.max(0, 12 - item.deltaE);
    const seasonsList = item.bestSeasons
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const matchesUserSeason = item.bestSeasons.includes(userSeason);
    const isUniversal = item.bestSeasons === "All Seasons" || seasonsList.length >= 3;
    const isPopularBrand = POPULAR_HOT_BRANDS.has(item.brand);
    const isCultLine =
      CULT_FAVORITE_PATTERN.test(item.name) || CULT_FAVORITE_PATTERN.test(item.shade);

    const popularityScore = Number(
      (
        colorFitScore +
        (matchesUserSeason ? 5.0 : 0) +
        (isUniversal ? 2.5 : 0) +
        (isPopularBrand ? 2.5 : 0) +
        (isCultLine ? 1.5 : 0)
      ).toFixed(2)
    );

    let hotReason = "Được ưa chuộng";
    if (matchesUserSeason && item.deltaE <= 4.5) {
      hotReason = "Hợp mùa sắc cao";
    } else if (VN_LOCAL_BRANDS.has(item.brand)) {
      hotReason = "Phổ biến tại VN";
    } else if (isUniversal) {
      hotReason = "Hợp nhiều tông da";
    } else if (isCultLine) {
      hotReason = "Dòng bán chạy";
    }

    return {
      ...item,
      hotReason,
      popularityScore,
      isPopular: popularityScore >= POPULARITY_HIGHLIGHT_THRESHOLD,
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
