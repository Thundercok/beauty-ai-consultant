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

function isCameraSkinPixel(r: number, g: number, b: number): boolean {
  if (r < 45 || g < 28 || b < 18) return false;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  if (maxC - minC < 10) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cr >= 131 && cr <= 178 && cb >= 75 && cb <= 132;
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
  let lumaSum = 0;
  let leftLumaSum = 0;
  let leftPx = 0;
  let rightLumaSum = 0;
  let rightPx = 0;
  let clippedBrightPx = 0;

  let skinInsideOval = 0;
  let skinOutsideOval = 0;
  let skinXSum = 0;
  let skinYSum = 0;
  let skinTotal = 0;

  for (let y = 0; y < height; y++) {
    const dyNorm = (y - cy) / ry;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      const dxNorm = (x - cx) / rx;
      const inOval = dxNorm * dxNorm + dyNorm * dyNorm <= 1.0;
      const isSkin = isCameraSkinPixel(r, g, b);

      if (inOval) {
        totalOvalPx++;
        lumaSum += luma;
        if (luma >= 244) clippedBrightPx++;
        if (x < cx) {
          leftLumaSum += luma;
          leftPx++;
        } else {
          rightLumaSum += luma;
          rightPx++;
        }
        if (isSkin) {
          skinInsideOval++;
          skinXSum += x;
          skinYSum += y;
          skinTotal++;
        }
      } else if (isSkin && Math.abs(dxNorm) < 1.55 && Math.abs(dyNorm) < 1.45) {
        skinOutsideOval++;
        skinXSum += x;
        skinYSum += y;
        skinTotal++;
      }
    }
  }

  const meanLuma = totalOvalPx > 0 ? lumaSum / totalOvalPx : 0;
  const leftLuma = leftPx > 0 ? leftLumaSum / leftPx : meanLuma;
  const rightLuma = rightPx > 0 ? rightLumaSum / rightPx : meanLuma;
  const asymmetry = Math.abs(leftLuma - rightLuma) / Math.max(meanLuma, 35);
  const clippedRatio = totalOvalPx > 0 ? clippedBrightPx / totalOvalPx : 0;
  const brightnessPct = Math.round(Math.max(0, Math.min(100, (meanLuma / 225) * 100)));

  let lighting: LightingReading;
  if (meanLuma < 68) {
    lighting = {
      level: "too_dark",
      badgeEn: "Too Dark",
      labelVi: "Quá tối",
      guidanceVi: "Hướng mặt ra nguồn sáng hoặc bật thêm đèn để đo đúng sắc da.",
      score: Math.max(10, Math.round((meanLuma / 68) * 44)),
      brightnessPct,
      source: "camera_frame",
      lux: null,
      luma: Math.round(meanLuma),
      asymmetry: Number(asymmetry.toFixed(2)),
    };
  } else if (meanLuma > 218 || clippedRatio > 0.16) {
    lighting = {
      level: "too_bright",
      badgeEn: "Too Bright",
      labelVi: "Quá sáng",
      guidanceVi: "Ánh sáng đang bị chói, hãy xoay nhẹ khỏi nguồn sáng gắt.",
      score: 52,
      brightnessPct: 100,
      source: "camera_frame",
      lux: null,
      luma: Math.round(meanLuma),
      asymmetry: Number(asymmetry.toFixed(2)),
    };
  } else if (meanLuma < 102) {
    lighting = {
      level: "slightly_dim",
      badgeEn: "Dim",
      labelVi: "Hơi tối",
      guidanceVi: "Tăng sáng thêm một chút hoặc đứng gần cửa sổ hơn.",
      score: Math.round(55 + ((meanLuma - 68) / 34) * 20),
      brightnessPct,
      source: "camera_frame",
      lux: null,
      luma: Math.round(meanLuma),
      asymmetry: Number(asymmetry.toFixed(2)),
    };
  } else if (asymmetry > 0.28) {
    lighting = {
      level: "uneven",
      badgeEn: "Uneven",
      labelVi: "Ánh sáng lệch",
      guidanceVi: "Một bên má đang bị tối bóng — xoay mặt đối diện nguồn sáng.",
      score: 68,
      brightnessPct,
      source: "camera_frame",
      lux: null,
      luma: Math.round(meanLuma),
      asymmetry: Number(asymmetry.toFixed(2)),
    };
  } else {
    lighting = {
      level: "perfect",
      badgeEn: "Perfect",
      labelVi: "Ánh sáng chuẩn",
      guidanceVi: "Ánh sáng đều — sẵn sàng chụp!",
      score: Math.min(98, Math.round(88 + (1 - asymmetry) * 10)),
      brightnessPct,
      source: "camera_frame",
      lux: null,
      luma: Math.round(meanLuma),
      asymmetry: Number(asymmetry.toFixed(2)),
    };
  }

  // Real-time alignment estimate inside the oval guide
  const skinCoverage = totalOvalPx > 0 ? skinInsideOval / totalOvalPx : 0;
  const meanSkinX = skinTotal > 0 ? skinXSum / skinTotal : cx;
  const meanSkinY = skinTotal > 0 ? skinYSum / skinTotal : cy;
  const horizontalOffset = Math.max(-1, Math.min(1, (meanSkinX - cx) / rx));
  const verticalOffset = Math.max(-1, Math.min(1, (meanSkinY - cy) / ry));
  const overflowRatio = skinInsideOval > 0 ? skinOutsideOval / skinInsideOval : 0;

  let alignment: FaceAlignmentReading;
  if (skinCoverage < 0.14) {
    alignment = {
      status: "move_closer",
      labelVi: "Đưa mặt vào gần khung",
      hintVi: "Đặt mắt ngang đường mắt và cằm sát vạch cằm phía dưới.",
      isReady: false,
      skinCoverage: Number(skinCoverage.toFixed(2)),
      verticalOffset: Number(verticalOffset.toFixed(2)),
      horizontalOffset: Number(horizontalOffset.toFixed(2)),
    };
  } else if (skinCoverage > 0.72 && overflowRatio > 0.85) {
    alignment = {
      status: "move_back",
      labelVi: "Lùi nhẹ ra xa một chút",
      hintVi: "Giữ trọn cả trán, mắt và cằm bên trong khung bầu dục.",
      isReady: false,
      skinCoverage: Number(skinCoverage.toFixed(2)),
      verticalOffset: Number(verticalOffset.toFixed(2)),
      horizontalOffset: Number(horizontalOffset.toFixed(2)),
    };
  } else if (Math.abs(horizontalOffset) > 0.28 || Math.abs(verticalOffset) > 0.28) {
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
