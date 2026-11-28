export type LightingLevel = "too_dark" | "slightly_dim" | "perfect" | "uneven" | "too_bright";

export type LightingSource = "ambient_sensor" | "camera_frame" | "standby";

export interface LightingReading {
  level: LightingLevel;
  badgeEn: string;
  labelVi: string;
  guidanceVi: string;
  score: number; // 0..100 normalized lighting quality
  brightnessPct: number; // 0..100 visual meter level
  source: LightingSource;
  lux: number | null;
  luma: number | null;
  asymmetry: number; // 0..1 left-right lighting imbalance
}

export type AlignmentStatus = "aligned" | "move_closer" | "move_back" | "center_face" | "standby";

export interface FaceAlignmentReading {
  status: AlignmentStatus;
  labelVi: string;
  hintVi: string;
  isReady: boolean;
  skinCoverage: number; // 0..1 fraction of face oval with skin-like pixels
  verticalOffset: number; // -1 (too high) .. +1 (too low)
  horizontalOffset: number; // -1 (too left) .. +1 (too right)
}

/**
 * Classifies ambient lux readings from the Web Generic Sensor API (`AmbientLightSensor`).
 * Daylight near a window typically ranges between 200 and 1,500 lux.
 */
export function evaluateAmbientLux(lux: number): LightingReading {
  const safeLux = Number.isFinite(lux) ? Math.max(0, lux) : 0;
  const brightnessPct = Math.round(Math.min(100, (Math.log10(safeLux + 1) / 3.5) * 100));

  if (safeLux < 55) {
    return {
      level: "too_dark",
      badgeEn: "Too Dark",
      labelVi: "Quá tối",
      guidanceVi: "Hướng mặt về phía cửa sổ hoặc bật thêm nguồn sáng phía trước.",
      score: Math.max(12, Math.round((safeLux / 55) * 42)),
      brightnessPct,
      source: "ambient_sensor",
      lux: Math.round(safeLux),
      luma: null,
      asymmetry: 0,
    };
  }

  if (safeLux < 140) {
    return {
      level: "slightly_dim",
      badgeEn: "Dim",
      labelVi: "Hơi thiếu sáng",
      guidanceVi: "Tiến gần nguồn sáng hơn một chút để màu da hiển thị chính xác.",
      score: Math.round(52 + ((safeLux - 55) / 85) * 24),
      brightnessPct,
      source: "ambient_sensor",
      lux: Math.round(safeLux),
      luma: null,
      asymmetry: 0,
    };
  }

  if (safeLux > 2800) {
    return {
      level: "too_bright",
      badgeEn: "Too Bright",
      labelVi: "Quá chói",
      guidanceVi: "Tránh ánh nắng gắt chiếu trực tiếp làm cháy sáng vùng má.",
      score: 54,
      brightnessPct: 100,
      source: "ambient_sensor",
      lux: Math.round(safeLux),
      luma: null,
      asymmetry: 0,
    };
  }

  return {
    level: "perfect",
    badgeEn: "Perfect",
    labelVi: "Ánh sáng chuẩn",
    guidanceVi: "Ánh sáng đều và rõ — giữ thẳng mặt để chụp.",
    score: 95,
    brightnessPct: Math.max(55, Math.min(88, brightnessPct)),
    source: "ambient_sensor",
    lux: Math.round(safeLux),
    luma: null,
    asymmetry: 0,
  };
}

export interface CoverCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Computes the centered source crop rectangle equivalent to CSS `object-cover`
 * so sampled camera pixels align 1:1 with the displayed viewfinder and oval guide.
 */
export function computeCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): CoverCropRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(0, sourceWidth), sh: Math.max(0, sourceHeight) };
  }
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    const sw = sourceHeight * targetAspect;
    return {
      sx: (sourceWidth - sw) / 2,
      sy: 0,
      sw,
      sh: sourceHeight,
    };
  }
  const sh = sourceWidth / targetAspect;
  return {
    sx: 0,
    sy: (sourceHeight - sh) / 2,
    sw: sourceWidth,
    sh,
  };
}

function isCameraSkinPixel(r: number, g: number, b: number): boolean {
  if (r < 36 || g < 22 || b < 14) return false;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  if (maxC - minC < 7) return false;
  if (r < b) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cr >= 127 && cr <= 182 && cb >= 72 && cb <= 135;
}

/**
 * Analyzes a downsampled RGBA camera frame inside the central face alignment oval
 * to compute both real-time lighting quality and face-positioning feedback.
 */
export function analyzeCameraFrame(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): { lighting: LightingReading; alignment: FaceAlignmentReading } {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    return {
      lighting: {
        level: "slightly_dim",
        badgeEn: "Checking",
        labelVi: "Đang đo ánh sáng",
        guidanceVi: "Đưa khuôn mặt vào khung hình để kiểm tra độ sáng.",
        score: 50,
        brightnessPct: 50,
        source: "standby",
        lux: null,
        luma: null,
        asymmetry: 0,
      },
      alignment: {
        status: "standby",
        labelVi: "Đặt mặt vào khung bầu dục",
        hintVi: "Căn mắt ngang vạch đứt nét và cằm chạm vạch dưới.",
        isReady: false,
        skinCoverage: 0,
        verticalOffset: 0,
        horizontalOffset: 0,
      },
    };
  }

  // Oval guide geometry matches FaceAlignmentGuideOverlay SVG (center 50%, 46%, rx 27%, ry 33%)
  const cx = width * 0.5;
  const cy = height * 0.46;
  const rx = width * 0.27;
  const ry = height * 0.33;

  let totalOvalPx = 0;
  let ovalLumaSum = 0;
  let coreLeftLumaSum = 0;
  let coreLeftPx = 0;
  let coreRightLumaSum = 0;
  let coreRightPx = 0;
  let ovalClippedBrightPx = 0;

  // Skin-weighted metrics inside the face oval prevent dark hair or dim room corners
  // from causing false "Dim" or "Uneven" lighting warnings.
  let skinInsideOval = 0;
  let skinLumaSum = 0;
  let skinLeftLumaSum = 0;
  let skinLeftPx = 0;
  let skinRightLumaSum = 0;
  let skinRightPx = 0;
  let skinClippedBrightPx = 0;

  // Centroid inside the face oval (excluding neck/shirt pixels below the chin line)
  let inOvalSkinXSum = 0;
  let inOvalSkinYSum = 0;
  let inOvalSkinCount = 0;

  // Wider search window (still excluding below-chin neck/shirt area) used only when the
  // face has not yet entered the oval so we can still give directional centering hints.
  let wideSkinXSum = 0;
  let wideSkinYSum = 0;
  let wideSkinCount = 0;
  let sideTopOverflowSkin = 0;

  for (let y = 0; y < height; y++) {
    const dyNorm = (y - cy) / ry;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      const dxNorm = (x - cx) / rx;
      const normDist2 = dxNorm * dxNorm + dyNorm * dyNorm;
      const inOval = normDist2 <= 1.0;
      const isSkin = isCameraSkinPixel(r, g, b);

      if (inOval) {
        totalOvalPx++;
        ovalLumaSum += luma;
        if (luma >= 246) ovalClippedBrightPx++;
        if (normDist2 <= 0.65) {
          if (x < cx) {
            coreLeftLumaSum += luma;
            coreLeftPx++;
          } else {
            coreRightLumaSum += luma;
            coreRightPx++;
          }
        }
        if (isSkin) {
          skinInsideOval++;
          skinLumaSum += luma;
          if (luma >= 246) skinClippedBrightPx++;
          if (x < cx) {
            skinLeftLumaSum += luma;
            skinLeftPx++;
          } else {
            skinRightLumaSum += luma;
            skinRightPx++;
          }
          inOvalSkinXSum += x;
          inOvalSkinYSum += y;
          inOvalSkinCount++;
          wideSkinXSum += x;
          wideSkinYSum += y;
          wideSkinCount++;
        }
      } else if (isSkin && Math.abs(dxNorm) < 1.55 && dyNorm > -1.35 && dyNorm <= 0.98) {
        // Only count skin around the sides/top of the face — exclude neck & shirt below chin
        sideTopOverflowSkin++;
        wideSkinXSum += x;
        wideSkinYSum += y;
        wideSkinCount++;
      }
    }
  }

  const skinCoverage = totalOvalPx > 0 ? skinInsideOval / totalOvalPx : 0;
  const hasFaceSkinForMetering = skinCoverage >= 0.1;

  const meanOvalLuma = totalOvalPx > 0 ? ovalLumaSum / totalOvalPx : 0;
  const effectiveLuma = hasFaceSkinForMetering ? skinLumaSum / skinInsideOval : meanOvalLuma;

  const useSkinSideSplit = skinLeftPx >= 12 && skinRightPx >= 12;
  const leftLuma = useSkinSideSplit
    ? skinLeftLumaSum / skinLeftPx
    : coreLeftPx > 0
      ? coreLeftLumaSum / coreLeftPx
      : effectiveLuma;
  const rightLuma = useSkinSideSplit
    ? skinRightLumaSum / skinRightPx
    : coreRightPx > 0
      ? coreRightLumaSum / coreRightPx
      : effectiveLuma;

  const asymmetry = Math.abs(leftLuma - rightLuma) / Math.max(effectiveLuma, 35);
  const clippedRatio = hasFaceSkinForMetering
    ? skinClippedBrightPx / skinInsideOval
    : totalOvalPx > 0
      ? ovalClippedBrightPx / totalOvalPx
      : 0;
  const brightnessPct = Math.round(Math.max(0, Math.min(100, (effectiveLuma / 225) * 100)));

  let lighting: LightingReading;
  if (effectiveLuma < 56) {
    lighting = {
      level: "too_dark",
      badgeEn: "Too Dark",
      labelVi: "Quá tối",
      guidanceVi: "Hướng mặt ra nguồn sáng hoặc bật thêm đèn để đo đúng sắc da.",
      score: Math.max(10, Math.round((effectiveLuma / 56) * 44)),
      brightnessPct,
      source: "camera_frame",
      lux: null,
      luma: Math.round(effectiveLuma),
      asymmetry: Number(asymmetry.toFixed(2)),
    };
  } else if (effectiveLuma > 224 || clippedRatio > 0.22) {
    lighting = {
      level: "too_bright",
      badgeEn: "Too Bright",
      labelVi: "Quá sáng",
      guidanceVi: "Ánh sáng đang bị chói, hãy xoay nhẹ khỏi nguồn sáng gắt.",
      score: 52,
      brightnessPct: 100,
      source: "camera_frame",
      lux: null,
      luma: Math.round(effectiveLuma),
      asymmetry: Number(asymmetry.toFixed(2)),
    };
  } else if (effectiveLuma < 84) {
    lighting = {
      level: "slightly_dim",
      badgeEn: "Dim",
      labelVi: "Hơi tối",
      guidanceVi: "Tăng sáng thêm một chút hoặc đứng gần cửa sổ hơn.",
      score: Math.round(58 + ((effectiveLuma - 56) / 28) * 20),
      brightnessPct,
      source: "camera_frame",
      lux: null,
      luma: Math.round(effectiveLuma),
      asymmetry: Number(asymmetry.toFixed(2)),
    };
  } else if (asymmetry > 0.44) {
    lighting = {
      level: "uneven",
      badgeEn: "Uneven",
      labelVi: "Ánh sáng lệch mạnh",
      guidanceVi: "Một bên mặt đang tối hẳn — xoay nhẹ về phía nguồn sáng.",
      score: 68,
      brightnessPct,
      source: "camera_frame",
      lux: null,
      luma: Math.round(effectiveLuma),
      asymmetry: Number(asymmetry.toFixed(2)),
    };
  } else {
    lighting = {
      level: "perfect",
      badgeEn: "Perfect",
      labelVi: "Ánh sáng chuẩn",
      guidanceVi: "Ánh sáng đều — sẵn sàng chụp!",
      score: Math.min(98, Math.round(88 + Math.max(0, 1 - asymmetry) * 10)),
      brightnessPct,
      source: "camera_frame",
      lux: null,
      luma: Math.round(effectiveLuma),
      asymmetry: Number(asymmetry.toFixed(2)),
    };
  }

  // Real-time alignment estimate inside the oval guide.
  // When face skin is already well inside the oval, use the in-oval skin centroid so
  // background warmth or clothing never pulls the alignment guide off-center.
  // Hair naturally covers the upper ~20% of the oval, so skin centroid sits slightly below `cy`.
  const useInOvalCentroid = skinCoverage >= 0.16 && inOvalSkinCount > 0;
  const meanSkinX = useInOvalCentroid
    ? inOvalSkinXSum / inOvalSkinCount
    : wideSkinCount > 0
      ? wideSkinXSum / wideSkinCount
      : cx;
  const meanSkinY = useInOvalCentroid
    ? inOvalSkinYSum / inOvalSkinCount
    : wideSkinCount > 0
      ? wideSkinYSum / wideSkinCount
      : cy;

  const targetCy = cy + ry * 0.1;
  const horizontalOffset = Math.max(-1, Math.min(1, (meanSkinX - cx) / rx));
  const verticalOffset = Math.max(-1, Math.min(1, (meanSkinY - targetCy) / ry));
  const sideTopOverflowRatio = skinInsideOval > 0 ? sideTopOverflowSkin / skinInsideOval : 0;

  let alignment: FaceAlignmentReading;
  if (skinCoverage < 0.11) {
    alignment = {
      status: "move_closer",
      labelVi: "Đưa mặt vào gần khung",
      hintVi: "Đặt mắt ngang đường mắt và cằm sát vạch cằm phía dưới.",
      isReady: false,
      skinCoverage: Number(skinCoverage.toFixed(2)),
      verticalOffset: Number(verticalOffset.toFixed(2)),
      horizontalOffset: Number(horizontalOffset.toFixed(2)),
    };
  } else if (skinCoverage > 0.85 && sideTopOverflowRatio > 1.05) {
    alignment = {
      status: "move_back",
      labelVi: "Lùi nhẹ ra xa một chút",
      hintVi: "Giữ trọn cả trán, mắt và cằm bên trong khung bầu dục.",
      isReady: false,
      skinCoverage: Number(skinCoverage.toFixed(2)),
      verticalOffset: Number(verticalOffset.toFixed(2)),
      horizontalOffset: Number(horizontalOffset.toFixed(2)),
    };
  } else if (Math.abs(horizontalOffset) > 0.36 || Math.abs(verticalOffset) > 0.38) {
    const dirHint =
      Math.abs(horizontalOffset) >= Math.abs(verticalOffset)
        ? horizontalOffset > 0
          ? "Dịch mặt nhẹ sang trái để vào giữa khung."
          : "Dịch mặt nhẹ sang phải để vào giữa khung."
        : verticalOffset > 0
          ? "Nâng cằm lên nhẹ ngang vạch cằm."
          : "Hạ mặt xuống nhẹ để mắt ngang đường dẫn.";

    alignment = {
      status: "center_face",
      labelVi: "Căn giữa mắt & cằm",
      hintVi: dirHint,
      isReady: false,
      skinCoverage: Number(skinCoverage.toFixed(2)),
      verticalOffset: Number(verticalOffset.toFixed(2)),
      horizontalOffset: Number(horizontalOffset.toFixed(2)),
    };
  } else {
    alignment = {
      status: "aligned",
      labelVi: "Vị trí mắt & cằm đã khớp",
      hintVi: "Giữ thẳng mặt, thả lỏng và nhấn nút chụp.",
      isReady: true,
      skinCoverage: Number(skinCoverage.toFixed(2)),
      verticalOffset: Number(verticalOffset.toFixed(2)),
      horizontalOffset: Number(horizontalOffset.toFixed(2)),
    };
  }

  return { lighting, alignment };
}
