import { linearChannelToSrgb, srgbChannelToLinear } from "./bradfordCat";

export interface TextureKsConfig {
  scattering: number;
  thickness: number;
  kmType: string;
}

export const TEXTURE_KS_MAP: Record<string, TextureKsConfig> = {
  "Juicy Tint": { scattering: 0.45, thickness: 0.55, kmType: "translucent" },
  "Dewy Balm": { scattering: 0.6, thickness: 0.72, kmType: "sheer" },
  "Lip Clay / Mud": { scattering: 1.3, thickness: 1.6, kmType: "opaque" },
  "Blur Water Tint": { scattering: 0.78, thickness: 0.92, kmType: "satin" },
  "Matte Lipstick": { scattering: 1.1, thickness: 1.25, kmType: "opaque" },
  "Velvet Tint": { scattering: 0.95, thickness: 1.05, kmType: "satin" },
  "Mirror Gloss": { scattering: 0.42, thickness: 0.5, kmType: "translucent" },
  "Water Stain": { scattering: 0.5, thickness: 0.65, kmType: "translucent" },
};

export const DEFAULT_KS: TextureKsConfig = {
  scattering: 0.72,
  thickness: 0.9,
  kmType: "standard",
};

export function pigmentKsFromRgb(
  productRgb: [number, number, number],
  scattering: number
): { k: [number, number, number]; s: [number, number, number] } {
  const k: [number, number, number] = [0, 0, 0];
  const s: [number, number, number] = [scattering, scattering, scattering];
  for (let i = 0; i < 3; i++) {
    const reflectance = Math.min(0.9999, Math.max(1e-4, srgbChannelToLinear(productRgb[i])));
    const kOverS = (1 - reflectance) ** 2 / (2 * reflectance);
    k[i] = kOverS * scattering;
  }
  return { k, s };
}

/**
 * 3-channel linear-sRGB single-constant Kubelka–Munk two-flux lip-layer approximation.
 *
 * Scientific limitations (documented for audit transparency):
 * - Operates on 3 linear sRGB channels rather than full spectral reflectance R(λ) (400–700 nm),
 *   so metamerism and narrow-band pigment absorption differences are not captured.
 * - Assumes wavelength-independent scattering S(λ) = constant per texture class.
 * - Omits Saunderson front-surface Fresnel specular (k1) and internal diffuse (k2) corrections.
 * - `TEXTURE_KS_MAP` scattering and thickness constants are uncalibrated visual heuristics,
 *   not spectrophotometer measurements of individual commercial formulations.
 *
 * Numerical stability:
 * Uses the exact hyperbolic identity layerR = tanh(x) / (a*tanh(x) + b) and
 * layerT = b*sech(x) / (a*tanh(x) + b) to eliminate IEEE-754 Infinity/Infinity -> NaN overflow
 * for very dark pigments or high optical depth (x > 709), converging smoothly to R_inf = 1/(a+b).
 */
export function kubelkaMunkLipBlend(
  substrateRgb: [number, number, number],
  productRgb: [number, number, number],
  options?: {
    thickness?: number;
    textureType?: string;
    scatteringOverride?: number;
  }
): [number, number, number] {
  const config = TEXTURE_KS_MAP[options?.textureType ?? "standard"] ?? DEFAULT_KS;
  const scattering = options?.scatteringOverride ?? config.scattering;
  const thickness = options?.thickness ?? config.thickness;

  if (thickness <= 0) {
    return [...substrateRgb];
  }

  const { k, s } = pigmentKsFromRgb(productRgb, scattering);
  const out: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < 3; i++) {
    const substrate = Math.min(0.9999, Math.max(1e-4, srgbChannelToLinear(substrateRgb[i])));
    const a = 1 + k[i] / s[i];
    const b = Math.sqrt(Math.max(a * a - 1, 1e-12));
    const opticalDepth = b * s[i] * thickness;
    const tanhOd = Math.tanh(opticalDepth);
    const sechOd = opticalDepth > 700 ? 0 : 1 / Math.cosh(opticalDepth);
    const denom = Math.max(a * tanhOd + b, 1e-12);
    const layerR = tanhOd / denom;
    const layerT = (b * sechOd) / denom;
    const renderedReflectance =
      layerR + (layerT * layerT * substrate) / Math.max(1 - layerR * substrate, 1e-8);
    out[i] = linearChannelToSrgb(renderedReflectance);
  }

  return out;
}
