import {
  hexToLab,
  hexToRgb,
  labToRgb,
  linearChannelToSrgb,
  rgbToHex,
  srgbChannelToLinear,
} from "./bradfordCat";
import { illuminantLocusLinearRgb } from "./colorConstancy";
import type { SeasonName } from "./types";

export interface HarmonySwatch {
  role: "eyeshadow" | "blush" | "lipstick";
  roleLabel: string;
  shadeLabel: string;
  hex: string;
}

export interface ColorHarmonyPalette {
  id: "daily" | "office" | "glam";
  title: string;
  harmonyType: string;
  tip: string;
  eyeshadow: HarmonySwatch;
  blush: HarmonySwatch;
  lipstick: HarmonySwatch;
}

export interface SeasonHarmonyBundle {
  palettes: ColorHarmonyPalette[];
  avoidSwatches: Array<{ label: string; hex: string }>;
}

interface SeasonHarmonySeed {
  daily: {
    eyeLabel: string;
    blushLabel: string;
    lipLabel: string;
    eyeShift: [number, number, number];
    blushShift: [number, number, number];
    lipShift: [number, number, number];
    tip: string;
  };
  office: {
    eyeLabel: string;
    blushLabel: string;
    lipLabel: string;
    eyeShift: [number, number, number];
    blushShift: [number, number, number];
    lipShift: [number, number, number];
    tip: string;
  };
  glam: {
    eyeLabel: string;
    blushLabel: string;
    lipLabel: string;
    eyeShift: [number, number, number];
    blushShift: [number, number, number];
    lipShift: [number, number, number];
    tip: string;
  };
  avoid: Array<{ label: string; hex: string }>;
}

function shiftHexInLab(hex: string, dL: number, da: number, db: number): string {
  const [L, a, b] = hexToLab(hex);
  const clampedL = Math.max(14, Math.min(88, L + dL));
  const clampedA = Math.max(-35, Math.min(62, a + da));
  const clampedB = Math.max(-35, Math.min(62, b + db));
  return rgbToHex(labToRgb([clampedL, clampedA, clampedB]));
}

function isWarmSeason(season: SeasonName): boolean {
  return (
    season === "Light Spring" ||
    season === "Warm Spring" ||
    season === "Bright Spring" ||
    season === "Warm Autumn" ||
    season === "Soft Autumn" ||
    season === "Deep Autumn"
  );
}

function isDeepSeason(season: SeasonName): boolean {
  return season === "Deep Autumn" || season === "Deep Winter" || season === "Cool Winter";
}

function isSoftSeason(season: SeasonName): boolean {
  return season === "Soft Summer" || season === "Soft Autumn";
}

function getSeasonSeed(season: SeasonName): SeasonHarmonySeed {
  const warm = isWarmSeason(season);
  const deep = isDeepSeason(season);
  const soft = isSoftSeason(season);

  if (warm && !deep && !soft) {
    return {
      daily: {
        eyeLabel: "Nâu mật ong nhạt",
        blushLabel: "Cam đào sữa",
        lipLabel: "Hồng san hô trong",
        eyeShift: [6, -1, 4],
        blushShift: [5, -3, 3],
        lipShift: [4, -4, 4],
        tip: "Đi học chỉ cần phớt mắt nâu sáng, má đào sữa nhẹ dưới mắt và đánh lòng môi san hô trong veo là đủ tươi tắn.",
      },
      office: {
        eyeLabel: "Nâu trà sữa ấm",
        blushLabel: "Hồng đào dịu",
        lipLabel: "Đỏ san hô trầm",
        eyeShift: [-3, 1, 2],
        blushShift: [-2, 2, -1],
        lipShift: [-4, 4, -2],
        tip: "Đi chơi hoặc hẹn hò chọn mắt trà sữa phối son đỏ san hô trầm giúp mặt sáng bừng và rất tôn da.",
      },
      glam: {
        eyeLabel: "Nâu đồng ánh nhũ",
        blushLabel: "Cam đất nhẹ",
        lipLabel: "Đỏ cam tươi",
        eyeShift: [-14, 4, 5],
        blushShift: [-6, 4, 6],
        lipShift: [-7, 14, 9],
        tip: "Nhấn nhẹ nhũ mịn bầu mắt cùng son đỏ cam tươi giúp gương mặt rạng rỡ khi chụp ảnh dưới đèn tối.",
      },
      avoid: [
        { label: "Hồng cánh sen lạnh", hex: "#D65DB1" },
        { label: "Tím khói xám", hex: "#6B6782" },
        { label: "Xám bạc đậm", hex: "#5C636E" },
      ],
    };
  }

  if (warm) {
    return {
      daily: {
        eyeLabel: "Be ấm nhẹ nhàng",
        blushLabel: "Đào đất dịu",
        lipLabel: "Hồng đất ấm",
        eyeShift: [7, -1, 2],
        blushShift: [4, -3, 2],
        lipShift: [4, -3, 2],
        tip: "Combo tông đất dịu rất hợp mặt mộc đi học, giúp da đều màu và trông tự nhiên như không trang điểm.",
      },
      office: {
        eyeLabel: "Nâu quế mịn",
        blushLabel: "Cam đất nhạt",
        lipLabel: "Đỏ gạch sữa",
        eyeShift: [-4, 3, 4],
        blushShift: [-2, 3, 4],
        lipShift: [-5, 6, 4],
        tip: "Má cam đất tán thật mỏng cùng son đỏ gạch sữa cực kỳ nịnh da vàng ấm và giúp răng trông trắng hơn.",
      },
      glam: {
        eyeLabel: "Nâu cà phê đậm",
        blushLabel: "Cam đất trầm",
        lipLabel: "Đỏ nâu rượu ấm",
        eyeShift: [-15, 4, 3],
        blushShift: [-7, 5, 5],
        lipShift: [-12, 10, 3],
        tip: "Nhấn đuôi mắt nâu cà phê phối cùng son đỏ nâu trầm tán mờ viền cực kỳ sang và cuốn hút buổi tối.",
      },
      avoid: [
        { label: "Hồng phấn chói", hex: "#FF70A6" },
        { label: "Xanh dương lạnh", hex: "#5B8DEF" },
        { label: "Tím sữa nhạt", hex: "#9E89C9" },
      ],
    };
  }

  if (!deep) {
    return {
      daily: {
        eyeLabel: "Nâu hồng sương",
        blushLabel: "Hồng phấn sữa",
        lipLabel: "Hồng cánh khô",
        eyeShift: [6, 1, -3],
        blushShift: [5, -2, -3],
        lipShift: [4, -3, -3],
        tip: "Tông hồng dịu kiểu Hàn cực hợp để mặt mộc đi học, giúp da sáng hồng tự nhiên mà không bị sến.",
      },
      office: {
        eyeLabel: "Nâu lạnh khói nhẹ",
        blushLabel: "Hồng đất lạnh",
        lipLabel: "Hồng mận nhạt",
        eyeShift: [-3, 1, -4],
        blushShift: [-3, 3, -4],
        lipShift: [-5, 5, -5],
        tip: "Mắt nâu lạnh nhẹ kết hợp má hồng đất lạnh và môi hồng mận dịu tạo vẻ trong trẻo, rất dễ chụp ảnh đẹp.",
      },
      glam: {
        eyeLabel: "Khói tím mận nhẹ",
        blushLabel: "Hồng dâu phớt",
        lipLabel: "Đỏ mâm xôi lạnh",
        eyeShift: [-14, 5, -7],
        blushShift: [-6, 7, -5],
        lipShift: [-10, 14, -7],
        tip: "Chấm nhẹ má hồng dâu rồi nhấn vào đôi môi đỏ mâm xôi lạnh — vừa sáng da vừa làm răng trắng rõ rệt.",
      },
      avoid: [
        { label: "Cam cháy gắt", hex: "#D9602B" },
        { label: "Vàng nghệ đậm", hex: "#C79628" },
        { label: "Nâu cam gạch", hex: "#A85532" },
      ],
    };
  }

  // Deep / Cool / Bright Winter
  return {
    daily: {
      eyeLabel: "Nâu xám lạnh nhạt",
      blushLabel: "Hồng lạnh trong",
      lipLabel: "Hồng dâu mỏng",
      eyeShift: [7, 0, -4],
      blushShift: [5, -2, -4],
      lipShift: [6, -3, -4],
      tip: "Tán son hồng dâu mỏng lòng môi cùng má hồng lạnh nhẹ giữ vẻ trong trẻo, hợp đi học hằng ngày.",
    },
    office: {
      eyeLabel: "Nâu xám khói mịn",
      blushLabel: "Hồng mận dịu",
      lipLabel: "Đỏ hoa hồng lạnh",
      eyeShift: [-3, 2, -5],
      blushShift: [-3, 4, -5],
      lipShift: [-4, 7, -6],
      tip: "Phối mắt nâu xám lạnh nhẹ và son đỏ hoa hồng giúp bật tông da và sáng răng rất rõ khi đi chơi.",
    },
    glam: {
      eyeLabel: "Khói xám ánh bạc",
      blushLabel: "Hồng rượu phớt",
      lipLabel: "Đỏ lạnh / Rượu vang",
      eyeShift: [-16, 2, -6],
      blushShift: [-7, 6, -6],
      lipShift: [-12, 13, -7],
      tip: "Điểm nhấn chính là đôi môi đỏ lạnh hoặc đỏ rượu vang căng mọng, giữ nền mỏng và má phớt nhẹ cho sang.",
    },
    avoid: [
      { label: "Cam đất mờ", hex: "#C87D55" },
      { label: "Vàng kem ấm", hex: "#D9B978" },
      { label: "Nâu vàng cát", hex: "#B0895A" },
    ],
  };
}

/**
 * Generates 3 season-adapted complementary makeup palettes (eyeshadow, blush, lipstick)
 * anchored to the user's measured Lab-blended target colors.
 */
export function buildSeasonColorHarmonies(
  season: SeasonName,
  blendedTargets: { lip: string; blush: string; eyeshadow: string }
): SeasonHarmonyBundle {
  const seed = getSeasonSeed(season);

  const palettes: ColorHarmonyPalette[] = [
    {
      id: "daily",
      title: "Nhẹ nhàng đi học",
      harmonyType: "Trong trẻo · Hợp mặt mộc",
      tip: seed.daily.tip,
      eyeshadow: {
        role: "eyeshadow",
        roleLabel: "Phấn mắt",
        shadeLabel: seed.daily.eyeLabel,
        hex: shiftHexInLab(blendedTargets.eyeshadow, ...seed.daily.eyeShift),
      },
      blush: {
        role: "blush",
        roleLabel: "Má hồng",
        shadeLabel: seed.daily.blushLabel,
        hex: shiftHexInLab(blendedTargets.blush, ...seed.daily.blushShift),
      },
      lipstick: {
        role: "lipstick",
        roleLabel: "Son môi",
        shadeLabel: seed.daily.lipLabel,
        hex: shiftHexInLab(blendedTargets.lip, ...seed.daily.lipShift),
      },
    },
    {
      id: "office",
      title: "Tươi tắn đi chơi",
      harmonyType: "Hài hòa · Bật tông da",
      tip: seed.office.tip,
      eyeshadow: {
        role: "eyeshadow",
        roleLabel: "Phấn mắt",
        shadeLabel: seed.office.eyeLabel,
        hex: shiftHexInLab(blendedTargets.eyeshadow, ...seed.office.eyeShift),
      },
      blush: {
        role: "blush",
        roleLabel: "Má hồng",
        shadeLabel: seed.office.blushLabel,
        hex: shiftHexInLab(blendedTargets.blush, ...seed.office.blushShift),
      },
      lipstick: {
        role: "lipstick",
        roleLabel: "Son môi",
        shadeLabel: seed.office.lipLabel,
        hex: shiftHexInLab(blendedTargets.lip, ...seed.office.lipShift),
      },
    },
    {
      id: "glam",
      title: "Nổi bật đi tiệc",
      harmonyType: "Sắc nét · Tôn sáng răng",
      tip: seed.glam.tip,
      eyeshadow: {
        role: "eyeshadow",
        roleLabel: "Phấn mắt",
        shadeLabel: seed.glam.eyeLabel,
        hex: shiftHexInLab(blendedTargets.eyeshadow, ...seed.glam.eyeShift),
      },
      blush: {
        role: "blush",
        roleLabel: "Má hồng",
        shadeLabel: seed.glam.blushLabel,
        hex: shiftHexInLab(blendedTargets.blush, ...seed.glam.blushShift),
      },
      lipstick: {
        role: "lipstick",
        roleLabel: "Son môi",
        shadeLabel: seed.glam.lipLabel,
        hex: shiftHexInLab(blendedTargets.lip, ...seed.glam.lipShift),
      },
    },
  ];

  return {
    palettes,
    avoidSwatches: seed.avoid,
  };
}

/**
 * Applies a realistic physical indoor lighting color cast (e.g., 3100K warm cafe lamp
 * or 7800K cool fluorescent office light) to a daylight demo portrait in linear sRGB
 * (exact forward camera illuminant formation I_c = R_c * E_c) so users immediately
 * see Beauty AI's illumination-invariant white balance working in real time.
 */
export function simulateIndoorLightingRgba(
  daylightRgba: Uint8ClampedArray,
  targetCctK: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(daylightRgba.length);
  const srcWhite = illuminantLocusLinearRgb(6500);
  const dstWhite = illuminantLocusLinearRgb(targetCctK);

  // Normalize gains so the maximum channel gain doesn't blow out skin highlights
  const rawGainR = dstWhite[0] / Math.max(1e-4, srcWhite[0]);
  const rawGainG = dstWhite[1] / Math.max(1e-4, srcWhite[1]);
  const rawGainB = dstWhite[2] / Math.max(1e-4, srcWhite[2]);
  const maxGain = Math.max(rawGainR, rawGainG, rawGainB);
  const exposure = targetCctK < 4500 ? 0.94 : 0.96;

  const gainR = (rawGainR / maxGain) * exposure;
  const gainG = (rawGainG / maxGain) * exposure;
  const gainB = (rawGainB / maxGain) * exposure;

  for (let i = 0; i < daylightRgba.length; i += 4) {
    const rLin = srgbChannelToLinear(daylightRgba[i]) * gainR;
    const gLin = srgbChannelToLinear(daylightRgba[i + 1]) * gainG;
    const bLin = srgbChannelToLinear(daylightRgba[i + 2]) * gainB;

    out[i] = Math.round(linearChannelToSrgb(rLin));
    out[i + 1] = Math.round(linearChannelToSrgb(gLin));
    out[i + 2] = Math.round(linearChannelToSrgb(bLin));
    out[i + 3] = daylightRgba[i + 3];
  }

  return out;
}

/**
 * Finds the catalog item whose rendered/swatch color is closest in CIELAB to a target hex.
 */
export function findClosestByHex<T extends { hex: string; renderedHex?: string }>(
  items: T[],
  targetHex: string
): T | null {
  if (items.length === 0) return null;
  const [tL, ta, tb] = hexToLab(targetHex);
  let best = items[0];
  let bestDist = Infinity;
  for (const item of items) {
    const [L, a, b] = hexToLab(item.renderedHex ?? item.hex);
    const d = (L - tL) ** 2 + (a - ta) ** 2 + (b - tb) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best;
}

export function hexDistanceApprox(hexA: string, hexB: string): number {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}
