import type { IlluminantName } from "./types";

/** CIE 1931 2° standard illuminant whitepoints (ASTM E308 / Lindbloom). */
export const WHITEPOINTS: Record<IlluminantName, [number, number, number]> = {
  D50: [0.96422, 1.0, 0.82521],
  D65: [0.95047, 1.0, 1.08883],
};

/** Lam (1985) / Lindbloom Bradford cone-response matrix (XYZ -> LMS). */
export const BRADFORD_MATRIX: number[][] = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];

/** Inverse of BRADFORD_MATRIX (LMS -> XYZ; max residual vs I < 1e-7). */
export const BRADFORD_INV_MATRIX: number[][] = [
  [0.9869929, -0.1470543, 0.1599627],
  [0.4323053, 0.5183603, 0.0492912],
  [-0.0085287, 0.0400428, 0.9684867],
];

/** IEC 61966-2-1 / Lindbloom linear sRGB -> CIE XYZ (D65 reference white). */
export const SRGB_TO_XYZ_MATRIX: number[][] = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];

export const XYZ_TO_SRGB_MATRIX: number[][] = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];

export function mat3Vec(m: number[][], v: [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function mat3Mul(a: number[][], b: number[][]): number[][] {
  const out: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return out;
}

export function srgbChannelToLinear(c255: number): number {
  const c = Math.min(1, Math.max(0, c255 / 255));
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb(lin: number): number {
  const c = Math.min(1, Math.max(0, lin));
  const srgb = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, srgb * 255));
}

export function srgbToLinearRgb(rgb: [number, number, number]): [number, number, number] {
  return [
    srgbChannelToLinear(rgb[0]),
    srgbChannelToLinear(rgb[1]),
    srgbChannelToLinear(rgb[2]),
  ];
}

export function linearToSrgbRgb(lin: [number, number, number]): [number, number, number] {
  return [
    linearChannelToSrgb(lin[0]),
    linearChannelToSrgb(lin[1]),
    linearChannelToSrgb(lin[2]),
  ];
}

export function adaptXyzBradford(
  xyz: [number, number, number],
  sourceIlluminant: IlluminantName = "D50",
  targetIlluminant: IlluminantName = "D65"
): [number, number, number] {
  if (sourceIlluminant === targetIlluminant) return [...xyz];
  const srcLms = mat3Vec(BRADFORD_MATRIX, WHITEPOINTS[sourceIlluminant]);
  const dstLms = mat3Vec(BRADFORD_MATRIX, WHITEPOINTS[targetIlluminant]);
  const scale: number[][] = [
    [dstLms[0] / srcLms[0], 0, 0],
    [0, dstLms[1] / srcLms[1], 0],
    [0, 0, dstLms[2] / srcLms[2]],
  ];
  const transform = mat3Mul(BRADFORD_INV_MATRIX, mat3Mul(scale, BRADFORD_MATRIX));
  return mat3Vec(transform, xyz);
}

export function labToXyz(
  lab: [number, number, number],
  illuminant: IlluminantName = "D65"
): [number, number, number] {
  const [lStar, aStar, bStar] = lab;
  const fy = (lStar + 16) / 116;
  const fx = fy + aStar / 500;
  const fz = fy - bStar / 200;
  const delta = 6 / 29;
  const fInv = (t: number) => (t > delta ? t ** 3 : 3 * delta ** 2 * (t - 4 / 29));
  const wp = WHITEPOINTS[illuminant];
  return [fInv(fx) * wp[0], fInv(fy) * wp[1], fInv(fz) * wp[2]];
}

export function xyzToLab(
  xyz: [number, number, number],
  illuminant: IlluminantName = "D65"
): [number, number, number] {
  const wp = WHITEPOINTS[illuminant];
  const delta = 6 / 29;
  const deltaCubed = delta ** 3;
  const f = (val: number) => {
    const n = val;
    return n > deltaCubed ? Math.cbrt(Math.max(0, n)) : n / (3 * delta ** 2) + 4 / 29;
  };
  const fx = f(xyz[0] / wp[0]);
  const fy = f(xyz[1] / wp[1]);
  const fz = f(xyz[2] / wp[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function adaptLabBradford(
  lab: [number, number, number],
  sourceIlluminant: IlluminantName = "D50",
  targetIlluminant: IlluminantName = "D65"
): [number, number, number] {
  const xyz = labToXyz(lab, sourceIlluminant);
  const adapted = adaptXyzBradford(xyz, sourceIlluminant, targetIlluminant);
  return xyzToLab(adapted, targetIlluminant);
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length !== 6) {
    return [180, 140, 130];
  }
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return [180, 140, 130];
  }
  return [r, g, b];
}

export function rgbToHex(rgb: [number, number, number]): string {
  const r = Math.min(255, Math.max(0, Math.round(rgb[0])));
  const g = Math.min(255, Math.max(0, Math.round(rgb[1])));
  const b = Math.min(255, Math.max(0, Math.round(rgb[2])));
  return `#${r.toString(16).padStart(2, "0").toUpperCase()}${g
    .toString(16)
    .padStart(2, "0")
    .toUpperCase()}${b.toString(16).padStart(2, "0").toUpperCase()}`;
}

export function rgbToLab(rgb: [number, number, number]): [number, number, number] {
  const lin = srgbToLinearRgb(rgb);
  const xyz = mat3Vec(SRGB_TO_XYZ_MATRIX, lin);
  return xyzToLab(xyz, "D65");
}

export function labToRgb(lab: [number, number, number]): [number, number, number] {
  const xyz = labToXyz(lab, "D65");
  const lin = mat3Vec(XYZ_TO_SRGB_MATRIX, xyz);
  return linearToSrgbRgb(lin);
}

export function hexToLab(hex: string): [number, number, number] {
  return rgbToLab(hexToRgb(hex));
}
