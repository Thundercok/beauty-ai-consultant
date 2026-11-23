export type IlluminantName = "D50" | "D65";
export type WhiteBalanceMethod = "planckian_grey_edge" | "planckian_sog" | "none";
export type OccasionType = "daily" | "office" | "glam";
export type SkinTextureType = "combination" | "oily" | "dry";

export type FaceShapeName = "Oval" | "Round" | "Square" | "Heart" | "Oblong" | "Diamond";

export type SeasonName =
  | "Light Spring"
  | "Warm Spring"
  | "Bright Spring"
  | "Light Summer"
  | "Cool Summer"
  | "Soft Summer"
  | "Warm Autumn"
  | "Soft Autumn"
  | "Deep Autumn"
  | "Bright Winter"
  | "Cool Winter"
  | "Deep Winter";

export interface CatalogProduct {
  id: number;
  product_name: string;
  brand: string;
  product_type: string;
  texture_type: string;
  hex_color: string;
  shade_name: string;
  undertone: string;
  best_seasons: string;
}

export interface MatchedProduct {
  id: number;
  brand: string;
  name: string;
  shade: string;
  productType: string;
  texture: string;
  hex: string;
  renderedHex?: string;
  deltaE: number;
  matchTier: "Exact Match" | "Great Match" | "Close Alternative";
  undertone: string;
  bestSeasons: string;
}

export interface FaceLandmarksBox {
  centerX: number; // normalized [0, 1]
  centerY: number; // normalized [0, 1]
  faceWidth: number; // normalized [0, 1]
  faceHeight: number; // normalized [0, 1]
  jawRatio: number; // jaw width / cheekbone width (~0.70 - 0.96)
  foreheadRatio: number; // forehead width / jaw width (~0.88 - 1.28)
  lipCenterY: number; // normalized [0, 1]
  lipWidth: number; // normalized [0, 1]
}

export interface WhiteBalanceDiagnostics {
  method: WhiteBalanceMethod;
  estimatedCctK: number | null;
  offLocusDeg: number | null;
  illuminantLinear: [number, number, number];
}

export interface SkinMetrics {
  ITA_deg: number;
  ITA_category: string;
  L_star: number;
  a_star: number;
  b_star: number;
  Melanin_index: number;
  Hemoglobin_index: number;
  sampleCount: number;
  method: string;
}

export interface LipMetrics {
  lipBaseLab: [number, number, number];
  lipBaseHex: string;
  lipBorderL: number;
  lipDarknessIndex: number;
  hasDarkLipBorder: boolean;
  coverageRequirement: string;
  recommendedTexture: string;
}

export interface SeasonClassification {
  season: SeasonName;
  secondarySeason: SeasonName;
  confidence: number;
  isBorderline: boolean;
  warmProbability: number;
  probabilities: Record<SeasonName, number>;
  undertone: "Warm (Golden)" | "Cool (Pink/Blue)" | "Neutral";
  skinHueDeg: number;
  skinChroma: number;
}

export interface FaceShapeResult {
  primary: FaceShapeName;
  secondary: FaceShapeName;
  probabilities: Record<FaceShapeName, number>;
  ratios: { r1: number; r2: number; r3: number };
}

export interface ChromophoreSummary {
  validPixels: number;
  melaninSpatialStd: number;
  hemoglobinSpatialStd: number;
  melaninDelta: Float32Array;
  hemoglobinDelta: Float32Array;
  shadingDelta: Float32Array;
  validMask: Uint8Array;
  width: number;
  height: number;
}

export interface ConsultationReport {
  whiteBalance: WhiteBalanceDiagnostics;
  faceShape: FaceShapeResult;
  skinMetrics: SkinMetrics;
  lipMetrics: LipMetrics;
  chromophores: ChromophoreSummary;
  season: SeasonClassification;
  blendedTargets: {
    lip: string;
    blush: string;
    eyeshadow: string;
  };
  advice: {
    contour: string;
    blush: string;
    lip: string;
    eyes: string;
    avoid: string[];
    targetColors: {
      lip: string;
      blush: string;
      eyeshadow: string;
    };
    executionParameters: {
      intensity: string;
      textureStyle: string;
      eyeDepth: string;
      prep: string;
      setting: string;
    };
  };
  skinMask: Uint8Array;
  correctedRgba: Uint8ClampedArray;
  originalRgba: Uint8ClampedArray;
  width: number;
  height: number;
}
