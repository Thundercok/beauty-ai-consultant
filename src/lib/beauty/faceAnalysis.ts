import { getAsianAdvice } from "./adviceEngine";
import type {
  FaceShapeName,
  FaceShapeResult,
  OccasionType,
  SeasonClassification,
  SeasonName,
  SkinMetrics,
  SkinTextureType,
} from "./types";

export const SEASON_GAUSSIAN_PROTOTYPES: Record<SeasonName, [number, number, number]> = {
  "Light Spring": [72.0, 60.0, 20.0],
  "Warm Spring": [64.0, 64.0, 25.0],
  "Bright Spring": [67.0, 58.0, 27.0],
  "Light Summer": [72.0, 46.0, 16.0],
  "Cool Summer": [63.0, 43.0, 17.0],
  "Soft Summer": [60.0, 49.0, 14.0],
  "Warm Autumn": [57.0, 65.0, 23.0],
  "Soft Autumn": [60.0, 58.0, 16.0],
  "Deep Autumn": [46.0, 60.0, 21.0],
  "Bright Winter": [66.0, 44.0, 24.0],
  "Cool Winter": [56.0, 41.0, 20.0],
  "Deep Winter": [45.0, 44.0, 19.0],
};

const SEASON_SIGMA: [number, number, number] = [9.0, 8.0, 6.0];

const WARM_SEASONS = new Set<SeasonName>([
  "Light Spring",
  "Warm Spring",
  "Bright Spring",
  "Warm Autumn",
  "Soft Autumn",
  "Deep Autumn",
]);

const SHAPE_PARAMETERS: Record<FaceShapeName, { mean: [number, number, number]; std: [number, number, number] }> = {
  Oval: { mean: [1.2, 0.8, 1.0], std: [0.08, 0.05, 0.08] },
  Round: { mean: [1.02, 0.9, 1.0], std: [0.06, 0.05, 0.08] },
  Square: { mean: [1.08, 0.94, 1.0], std: [0.06, 0.04, 0.08] },
  Heart: { mean: [1.18, 0.7, 1.25], std: [0.08, 0.06, 0.1] },
  Oblong: { mean: [1.4, 0.85, 1.0], std: [0.1, 0.06, 0.08] },
  Diamond: { mean: [1.18, 0.72, 0.92], std: [0.08, 0.06, 0.08] },
};

export function classifyFaceShapeFromRatios(r1: number, r2: number, r3: number): FaceShapeResult {
  const ratios: [number, number, number] = [r1, r2, r3];
  const scores = {} as Record<FaceShapeName, number>;
  let total = 1e-12;

  (Object.keys(SHAPE_PARAMETERS) as FaceShapeName[]).forEach((shape) => {
    const { mean, std } = SHAPE_PARAMETERS[shape];
    const z2 =
      ((ratios[0] - mean[0]) / std[0]) ** 2 +
      ((ratios[1] - mean[1]) / std[1]) ** 2 +
      ((ratios[2] - mean[2]) / std[2]) ** 2;
    const score = Math.exp(-0.5 * z2);
    scores[shape] = score;
    total += score;
  });

  const probabilities = {} as Record<FaceShapeName, number>;
  (Object.keys(scores) as FaceShapeName[]).forEach((shape) => {
    probabilities[shape] = scores[shape] / total;
  });

  const ranked = (Object.keys(probabilities) as FaceShapeName[]).sort(
    (a, b) => probabilities[b] - probabilities[a]
  );

  return {
    primary: ranked[0],
    secondary: ranked[1],
    probabilities,
    ratios: { r1, r2, r3 },
  };
}

export function classifyItaCategory(lStar: number, bStar: number): { itaDeg: number; category: string } {
  const itaDeg = (Math.atan((lStar - 50) / (bStar + 1e-5)) * 180) / Math.PI;
  let category: string;
  if (itaDeg > 55) category = "Very Light (Fitzpatrick I)";
  else if (itaDeg > 41) category = "Light (Fitzpatrick II)";
  else if (itaDeg > 28) category = "Intermediate (Fitzpatrick III)";
  else if (itaDeg > 10) category = "Tan (Fitzpatrick IV)";
  else if (itaDeg > -30) category = "Brown (Fitzpatrick V)";
  else category = "Dark (Fitzpatrick VI)";
  return { itaDeg, category };
}

export function classifySeason(lStar: number, aStar: number, bStar: number): SeasonClassification {
  const hueDeg = (Math.atan2(bStar, Math.max(aStar, 1e-5)) * 180) / Math.PI;
  const chroma = Math.hypot(aStar, bStar);
  const features: [number, number, number] = [lStar, hueDeg, chroma];

  const logScores = {} as Record<SeasonName, number>;
  let maxLog = -Infinity;
  (Object.keys(SEASON_GAUSSIAN_PROTOTYPES) as SeasonName[]).forEach((name) => {
    const proto = SEASON_GAUSSIAN_PROTOTYPES[name];
    const logVal =
      -0.5 *
      (((features[0] - proto[0]) / SEASON_SIGMA[0]) ** 2 +
        ((features[1] - proto[1]) / SEASON_SIGMA[1]) ** 2 +
        ((features[2] - proto[2]) / SEASON_SIGMA[2]) ** 2);
    logScores[name] = logVal;
    if (logVal > maxLog) maxLog = logVal;
  });

  const expScores = {} as Record<SeasonName, number>;
  let total = 1e-12;
  (Object.keys(logScores) as SeasonName[]).forEach((name) => {
    const val = Math.exp(logScores[name] - maxLog);
    expScores[name] = val;
    total += val;
  });

  const probabilities = {} as Record<SeasonName, number>;
  (Object.keys(expScores) as SeasonName[]).forEach((name) => {
    probabilities[name] = expScores[name] / total;
  });

  const ranked = (Object.keys(probabilities) as SeasonName[]).sort(
    (a, b) => probabilities[b] - probabilities[a]
  );
  const primary = ranked[0];
  const secondary = ranked[1];

  let warmProb = 0;
  WARM_SEASONS.forEach((name) => {
    warmProb += probabilities[name];
  });

  let undertone: SeasonClassification["undertone"] = "Neutral";
  if (warmProb >= 0.6) undertone = "Warm (Golden)";
  else if (warmProb <= 0.4) undertone = "Cool (Pink/Blue)";

  return {
    season: primary,
    secondarySeason: secondary,
    confidence: Number(probabilities[primary].toFixed(4)),
    isBorderline: probabilities[primary] < 0.45,
    warmProbability: Number(warmProb.toFixed(4)),
    probabilities,
    undertone,
    skinHueDeg: Number(hueDeg.toFixed(2)),
    skinChroma: Number(chroma.toFixed(2)),
  };
}

export const OCCASION_MODIFIERS: Record<
  OccasionType,
  { intensity: string; textureStyle: string; eyeDepth: string }
> = {
  daily: {
    intensity: "Tự nhiên trong trẻo (0.4)",
    textureStyle: "Glasting Water Tint / Dewy Balm",
    eyeDepth: "Nhấn nhẹ mi & phấn nhạt",
  },
  office: {
    intensity: "Thanh lịch chỉn chu (0.6)",
    textureStyle: "Blur Water Tint / Satin",
    eyeDepth: "Tạo hốc mắt nhẹ tự nhiên",
  },
  glam: {
    intensity: "Nổi bật cuốn hút (1.0)",
    textureStyle: "Hazy Lip Clay / Glossy Layering",
    eyeDepth: "Nhấn nhũ mịn & eyeliner đuôi dài",
  },
};

export const TEXTURE_MODIFIERS: Record<SkinTextureType, { prep: string; setting: string }> = {
  oily: {
    prep: "Kem lót kiềm dầu Niacinamide Matte Primer",
    setting: "Phấn phủ Translucent Bake Powder vùng T-zone",
  },
  dry: {
    prep: "Xịt khoáng cấp ẩm Hyaluronic Mist",
    setting: "Xịt khóa nền bóng Dewy Glow Setting Spray",
  },
  combination: {
    prep: "Kem lót kiềm dầu vùng T-Zone",
    setting: "Phấn phủ nhẹ vùng T-Zone",
  },
};

export function resolveGlowupProfile(
  shape: FaceShapeName,
  season: SeasonName,
  occasion: OccasionType,
  texture: SkinTextureType
) {
  const baseAdvice = getAsianAdvice(shape, season);
  return {
    ...baseAdvice,
    executionParameters: {
      ...OCCASION_MODIFIERS[occasion],
      ...TEXTURE_MODIFIERS[texture],
    },
  };
}

export function buildSkinMetrics(
  lStar: number,
  aStar: number,
  bStar: number,
  melaninIndex: number,
  hemoglobinIndex: number,
  sampleCount: number,
  method: string
): SkinMetrics {
  const { itaDeg, category } = classifyItaCategory(lStar, bStar);
  return {
    ITA_deg: Number(itaDeg.toFixed(2)),
    ITA_category: category,
    L_star: Number(lStar.toFixed(2)),
    a_star: Number(aStar.toFixed(2)),
    b_star: Number(bStar.toFixed(2)),
    Melanin_index: Number(melaninIndex.toFixed(2)),
    Hemoglobin_index: Number(hemoglobinIndex.toFixed(2)),
    sampleCount,
    method,
  };
}
