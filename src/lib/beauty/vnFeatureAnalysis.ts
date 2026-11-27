import { rgbToLab } from "./bradfordCat";
import type {
  ConsultationReport,
  FaceShapeResult,
  SeasonClassification,
  SkinTextureType,
} from "./types";

export type ConcernCategoryId = "nose" | "eyes" | "face_fullness" | "skin_blemish" | "undereye";

export type ConcernSeverity = "notable" | "mild" | "balanced";

export interface FacialConcernItem {
  id: ConcernCategoryId;
  areaLabel: string;
  detectedLabel: string;
  severity: ConcernSeverity;
  summaryVi: string;
  makeupFixVi: string;
  avoidVi: string;
  /** True when automatically flagged as worth addressing from facial landmarks/pixels */
  autoDetected: boolean;
}

export interface VnFeatureAnalysisResult {
  items: FacialConcernItem[];
  highlightedIds: ConcernCategoryId[];
  metrics: {
    alarToFaceRatio: number;
    eyeAspectRatio: number;
    canthusTiltDeg: number;
    fullnessIndex: number;
    redSpotPercent: number;
    melaninUnevenness: number;
    underEyeDarknessDelta: number;
    tZoneShinePercent: number;
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sampleMeanLabAndLuma(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  mask?: Uint8Array
): { meanL: number; meanA: number; meanB: number; count: number; brightRatio: number } {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(width - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(height - 1, Math.ceil(cy + ry));

  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  let brightCount = 0;
  let count = 0;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const idx = y * width + x;
      if (mask && mask[idx] === 0) continue;
      const p = idx * 4;
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      const [L, a, bVal] = rgbToLab([r, g, b]);
      sumL += L;
      sumA += a;
      sumB += bVal;
      if (L > 84 && Math.max(r, g, b) > 225) {
        brightCount++;
      }
      count++;
    }
  }

  if (count === 0) {
    return { meanL: 62, meanA: 12, meanB: 16, count: 0, brightRatio: 0 };
  }

  return {
    meanL: sumL / count,
    meanA: sumA / count,
    meanB: sumB / count,
    count,
    brightRatio: brightCount / count,
  };
}

function dist2D(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export interface FeatureAnalysisInput {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  skinMask: Uint8Array;
  neuralLandmarks: Array<[number, number, number]> | null;
  faceShape: FaceShapeResult;
  skinL: number;
  skinA: number;
  melaninSpatialStd: number;
  hemoglobinSpatialStd: number;
  hemoglobinDelta: Float32Array;
}

/**
 * Pure facial feature & skin concern analyzer tailored to Vietnamese / East-Asian makeup needs:
 * - Nose bridge height & alar width ("mũi tẹt / cánh mũi tròn")
 * - Eye shape & eyelid fold ("mắt một mí / mí lót / đuôi mắt cụp")
 * - Cheek & jawline fullness ("mặt tròn bầu bĩnh / má đầy / hàm đầy")
 * - Real skin surface blemishes & redness ("mụn đỏ / thâm mụn / vùng chữ T đổ dầu")
 * - Under-eye dark circles ("quầng thâm dưới mắt")
 *
 * Uses tactful, constructive Vietnamese beauty phrasing with concrete 2-step Asian makeup fixes.
 */
export function analyzeVnFacialFeatures(input: FeatureAnalysisInput): VnFeatureAnalysisResult {
  const {
    rgba,
    width,
    height,
    skinMask,
    neuralLandmarks: lm,
    faceShape,
    skinL,
    skinA,
    melaninSpatialStd,
    hemoglobinSpatialStd,
    hemoglobinDelta,
  } = input;

  const hasNeural = Boolean(lm && lm.length >= 468);

  // 1. Nose geometry & bridge luminance definition
  let alarToFaceRatio = 0.255;
  let bridgeContrast = 3.2;
  let noseTipDepthDelta = 0.08;

  if (hasNeural && lm) {
    const faceWidthPx = Math.max(12, dist2D(lm[234], lm[454]));
    const alarWidthPx = dist2D(lm[48], lm[278]);
    alarToFaceRatio = alarWidthPx / faceWidthPx;

    // Sample bridge center (197/6) vs left/right nasal sidewalls (114/343)
    const bridgePt = lm[197];
    const leftSidePt = lm[114];
    const rightSidePt = lm[343];
    const rSample = Math.max(2, Math.round(faceWidthPx * 0.028));

    const centerSample = sampleMeanLabAndLuma(rgba, width, height, bridgePt[0], bridgePt[1], rSample, rSample);
    const leftSample = sampleMeanLabAndLuma(rgba, width, height, leftSidePt[0], leftSidePt[1], rSample, rSample);
    const rightSample = sampleMeanLabAndLuma(rgba, width, height, rightSidePt[0], rightSidePt[1], rSample, rSample);

    bridgeContrast = centerSample.meanL - (leftSample.meanL + rightSample.meanL) / 2;

    // MediaPipe z is more negative closer to camera; compare bridge (6) & tip (1) vs cheek base
    const cheekZ = (lm[50][2] + lm[280][2]) / 2;
    noseTipDepthDelta = cheekZ - lm[6][2];
  }

  const isWideAlar = alarToFaceRatio >= 0.258;
  const isLowBridge = bridgeContrast < 3.4 || noseTipDepthDelta < 0.055;
  const noseSeverity: ConcernSeverity =
    isWideAlar && isLowBridge ? "notable" : isWideAlar || isLowBridge ? "mild" : "balanced";

  const noseItem: FacialConcernItem =
    noseSeverity === "notable"
      ? {
          id: "nose",
          areaLabel: "Dáng mũi",
          detectedLabel: "Sống mũi hơi thấp · Cánh mũi hơi tròn",
          severity: "notable",
          summaryVi:
            "Đầu mũi và cánh mũi hơi đầy, sống mũi chưa rõ khối nên dễ bị chìm khi chụp ảnh thẳng hoặc thiếu sáng.",
          makeupFixVi:
            "Dùng phấn khối nâu xám nhạt tạo hình chữ C nối từ đầu chân mày xuống hốc mắt và 1/3 sống mũi; tán thêm chữ V thật nhỏ ở đầu mũi. Chấm bắt sáng mịn ngay giữa sống mũi và chóp mũi (không kéo 1 đường thẳng dài).",
          avoidVi:
            "Tránh kẻ hai đường khối nâu sậm kéo thẳng từ đầu mày xuống tận cánh mũi — rất dễ bị lộ vệt giả và làm mũi trông cứng.",
          autoDetected: true,
        }
      : noseSeverity === "mild"
        ? {
            id: "nose",
            areaLabel: "Dáng mũi",
            detectedLabel: isWideAlar ? "Cánh mũi hơi đầy nhẹ" : "Sống mũi mềm, ít góc cạnh",
            severity: "mild",
            summaryVi:
              isWideAlar
                ? "Tỉ lệ cánh mũi hơi rộng nhẹ so với bề ngang mặt — chỉ cần thu gọn phần đầu mũi là gương mặt thanh thoát ngay."
                : "Sống mũi khá thanh nhưng độ nổi khối giữa hai mắt hơi nhẹ, hợp kiểu tạo khối tự nhiên kiểu Hàn/Trung.",
            makeupFixVi:
              "Phớt nhẹ khối nâu xám ở hai bên hốc mắt và viền dưới đầu mũi để đầu mũi gọn hơn, rồi chấm xíu nhũ mịn ngay sống mũi giữa hai mắt.",
            avoidVi:
              "Tránh dùng phấn tạo khối ánh cam đất cho vùng mũi vì dễ làm mũi bị xỉn và mất tự nhiên.",
            autoDetected: true,
          }
        : {
            id: "nose",
            areaLabel: "Dáng mũi",
            detectedLabel: "Sống mũi cân đối, rõ nét",
            severity: "balanced",
            summaryVi:
              "Tỉ lệ cánh mũi và độ nổi khối sống mũi hài hòa với tổng thể gương mặt, hầu như không cần đánh khối nặng.",
            makeupFixVi:
              "Chỉ cần chấm một chút bắt sáng ánh ngọc trai mịn ở giữa sống mũi hoặc chóp mũi khi đi tiệc là đủ bắt sáng đẹp.",
            avoidVi: "Không cần tạo khối hai bên sống mũi hằng ngày để giữ vẻ tự nhiên.",
            autoDetected: false,
          };

  // 2. Eye shape & eyelid fold (Monolid / Hooded / Downturned)
  let eyeAspectRatio = 0.27;
  let lidCreaseContrast = 4.2;
  let canthusTiltDeg = 1.5;

  if (hasNeural && lm) {
    const leftW = Math.max(4, dist2D(lm[33], lm[133]));
    const leftH = dist2D(lm[159], lm[145]);
    const rightW = Math.max(4, dist2D(lm[263], lm[362]));
    const rightH = dist2D(lm[386], lm[374]);
    eyeAspectRatio = ((leftH / leftW) + (rightH / rightW)) / 2;

    // Positive tilt = outer corner higher than inner corner; negative = slightly downturned ("mắt cụp")
    const leftTilt = Math.atan2(lm[133][1] - lm[33][1], Math.abs(lm[133][0] - lm[33][0]) + 1e-4);
    const rightTilt = Math.atan2(lm[362][1] - lm[263][1], Math.abs(lm[263][0] - lm[362][0]) + 1e-4);
    canthusTiltDeg = (((leftTilt + rightTilt) / 2) * 180) / Math.PI;

    // Check luminance dip right above upper eyelid (crease region) vs upper brow bone
    const rEye = Math.max(2, Math.round(((leftW + rightW) / 2) * 0.14));
    const lCreaseY = lm[159][1] - leftH * 0.45;
    const lUpperY = lm[159][1] - leftH * 1.1;
    const rCreaseY = lm[386][1] - rightH * 0.45;
    const rUpperY = lm[386][1] - rightH * 1.1;

    const lCrease = sampleMeanLabAndLuma(rgba, width, height, lm[159][0], lCreaseY, rEye, Math.max(1, rEye * 0.6));
    const lUpper = sampleMeanLabAndLuma(rgba, width, height, lm[159][0], lUpperY, rEye, Math.max(1, rEye * 0.6));
    const rCrease = sampleMeanLabAndLuma(rgba, width, height, lm[386][0], rCreaseY, rEye, Math.max(1, rEye * 0.6));
    const rUpper = sampleMeanLabAndLuma(rgba, width, height, lm[386][0], rUpperY, rEye, Math.max(1, rEye * 0.6));

    lidCreaseContrast = ((lUpper.meanL - lCrease.meanL) + (rUpper.meanL - rCrease.meanL)) / 2;
  }

  const isMonolidOrHooded = eyeAspectRatio < 0.285 || lidCreaseContrast < 4.5;
  const isDownturned = canthusTiltDeg < -1.5;
  const eyeSeverity: ConcernSeverity =
    eyeAspectRatio < 0.255 || (isMonolidOrHooded && isDownturned)
      ? "notable"
      : isMonolidOrHooded || isDownturned
        ? "mild"
        : "balanced";

  const eyeItem: FacialConcernItem =
    eyeSeverity === "notable"
      ? {
          id: "eyes",
          areaLabel: "Dáng mắt & mí mắt",
          detectedLabel: isDownturned
            ? "Mắt một mí / mí lót · Đuôi mắt hơi cụp"
            : "Mắt một mí / mí lót tự nhiên",
          severity: "notable",
          summaryVi:
            "Nếp mí mỏng hoặc dễ bị ẩn khi mở mắt — kiểu mắt rất phổ biến ở người Việt, chỉ cần đổi cách đánh mắt là to tròn và có chiều sâu ngay.",
          makeupFixVi:
            "Mở mắt thẳng nhìn gương rồi tán phấn lỳ màu nâu trà sữa/hồng đất loang cao hơn viền mí 2–3mm để khi mở mắt vẫn thấy màu. Kẻ eyeliner nâu sát chân mi ở nửa đuôi mắt, kéo mảnh chếch lên nhẹ thay vì kẻ dày toàn mắt; kẹp mi thật cong và chuốt mascara tơi.",
          avoidVi:
            "Tránh kẻ đường eyeliner đen dày hết bầu mắt (dễ bị nuốt sạch nếp mí và làm mắt trông nhỏ hơn) và tránh phấn nhũ hạt to phủ đầy bầu mắt trên.",
          autoDetected: true,
        }
      : eyeSeverity === "mild"
        ? {
            id: "eyes",
            areaLabel: "Dáng mắt & mí mắt",
            detectedLabel: isDownturned ? "Mí mảnh · Đuôi mắt hơi cụp nhẹ" : "Mí lót tự nhiên",
            severity: "mild",
            summaryVi:
              isDownturned
                ? "Đuôi mắt hơi xuôi nhẹ tạo cảm giác hiền nhưng đôi khi trông hơi buồn nếu đánh mắt quá rủ."
                : "Mí mắt gọn nhẹ, hợp phong cách mắt trong trẻo nhấn đuôi và bọng mắt cười kiểu Hàn/Douyin.",
            makeupFixVi:
              "Nhấn phấn nâu nhạt vào 1/3 đuôi mắt dưới nối nhẹ ra ngoài, vẽ đường eyeliner mảnh kéo ngang hoặc hơi hất nhẹ ở đuôi và chấm chút nhũ mịn giữa bầu mắt.",
            avoidVi: "Tránh đánh phấn mắt quá tối màu sát hốc mắt dễ làm ánh nhìn bị mệt.",
            autoDetected: true,
          }
        : {
            id: "eyes",
            areaLabel: "Dáng mắt & mí mắt",
            detectedLabel: "Mắt hai mí rõ, độ mở mắt tốt",
            severity: "balanced",
            summaryVi:
              "Khung mắt và nếp mí rõ nét sẵn, rất dễ trang điểm nhanh đi học mà không cần nhiều bước cầu kỳ.",
            makeupFixVi:
              "Chỉ cần kẹp mi cong, chuốt mascara nâu hoặc đen tơi và phớt một lớp phấn mắt lì tông nhạt là đôi mắt đã rất có hồn.",
            avoidVi: "Tránh gắn mi giả quá dày hằng ngày để không che mất nếp mí đẹp tự nhiên.",
            autoDetected: false,
          };

  // 3. Facial Fullness / Round Cheeks / Jawline Definition (tactfully addressing "béo / mặt tròn / má phúng phính")
  // Lower r1 (shorter/wider face) + higher r2 (wider lower jaw/cheeks) => rounder, fuller lower face
  const r1 = faceShape.ratios.r1;
  const r2 = faceShape.ratios.r2;
  let lowerCheekWidthRatio = r2;
  if (hasNeural && lm) {
    const cheekSpan = Math.max(10, dist2D(lm[234], lm[454]));
    const lowerCheekSpan = dist2D(lm[172], lm[397]);
    lowerCheekWidthRatio = lowerCheekSpan / cheekSpan;
  }

  // Fullness index in [0, 1]: higher => fuller/rounder cheeks & jawline
  const widthComponent = clamp((1.24 - r1) / 0.28, 0, 1);
  const jawComponent = clamp((lowerCheekWidthRatio - 0.76) / 0.18, 0, 1);
  const fullnessIndex = Number((widthComponent * 0.55 + jawComponent * 0.45).toFixed(2));

  const isRoundOrFullFace =
    faceShape.primary === "Round" || faceShape.primary === "Square" || fullnessIndex >= 0.55;
  const fullnessSeverity: ConcernSeverity =
    fullnessIndex >= 0.65 || faceShape.primary === "Round"
      ? "notable"
      : isRoundOrFullFace || fullnessIndex >= 0.42
        ? "mild"
        : "balanced";

  const fullnessItem: FacialConcernItem =
    fullnessSeverity === "notable"
      ? {
          id: "face_fullness",
          areaLabel: "Độ gọn má & viền hàm",
          detectedLabel: "Má bầu bĩnh · Đường hàm tròn đầy",
          severity: "notable",
          summaryVi:
            "Vùng má và viền hàm có độ đầy đặn phúc hậu (mặt tròn/má bánh bao) — tạo cảm giác trẻ lâu nhưng chụp camera thường dễ thấy mặt hơi to nếu tán má sai vị trí.",
          makeupFixVi:
            "Dùng cọ bông phớt phấn khối nâu xám thật mỏng từ mang tai trượt nhẹ dọc rìa dưới xương hàm vào cằm để tạo hiệu ứng mặt V-line tự nhiên. Tán má hồng dạng xéo nhẹ hướng lên thái dương và để tóc mái bay ôm nhẹ hai bên gò má.",
          avoidVi:
            "Tránh đánh má hồng tròn vo giữa bầu má (làm mặt trông bầu hơn) và tránh đánh sọc khối đậm ngay hõm má kiểu Âu Mỹ vì dễ làm mặt bị già và lộ vệt.",
          autoDetected: true,
        }
      : fullnessSeverity === "mild"
        ? {
            id: "face_fullness",
            areaLabel: "Độ gọn má & viền hàm",
            detectedLabel: "Viền hàm hơi đầy nhẹ · Nét mặt mềm mại",
            severity: "mild",
            summaryVi:
              "Tổng thể gương mặt cân đối, phần má dưới/góc hàm hơi đầy nhẹ nên chỉ cần nhấn gọn ở rìa mặt khi chụp ảnh.",
            makeupFixVi:
              "Phớt siêu nhẹ phấn khối sát chân tóc hai bên thái dương và dưới góc hàm; đặt điểm sáng nhẹ ở đầu cằm để gương mặt trông thanh và dài hơn.",
            avoidVi:
              "Tránh chọn kiểu tóc ép sát đỉnh đầu hoặc cắt mái bằng quá dày làm bề ngang mặt rộng hơn.",
            autoDetected: true,
          }
        : {
            id: "face_fullness",
            areaLabel: "Độ gọn má & viền hàm",
            detectedLabel: "Đường hàm thon gọn, tỉ lệ hài hòa",
            severity: "balanced",
            summaryVi:
              "Tỉ lệ bề ngang gò má và đường viền hàm khá gọn, dễ hợp nhiều kiểu đánh má hồng và kiểu tóc khác nhau.",
            makeupFixVi:
              "Đánh má hồng tán ngang nhẹ qua sống mũi kiểu trẻ trung hoặc tập trung ở phần má cao để giữ gương mặt tươi tắn đầy sức sống.",
            avoidVi: "Không nên tạo khối hóp má sâu kẻo làm gương mặt trông hốc hác.",
            autoDetected: false,
          };

  // 4. Real Skin Surface Check: Red Blemishes / Acne / Post-Acne Dark Spots / T-Zone Oiliness
  let validSkinCount = 0;
  let redSpotCount = 0;
  for (let i = 0; i < skinMask.length; i++) {
    if (skinMask[i] === 0) continue;
    validSkinCount++;
    const p = i * 4;
    const [L, a] = rgbToLab([rgba[p], rgba[p + 1], rgba[p + 2]]);
    const hemoBoost = hemoglobinDelta[i] ?? 0;
    // Localized erythema / red acne spot heuristic: markedly redder than baseline skin + higher hemoglobin delta
    if ((a > skinA + 4.2 && L < skinL + 6) || (hemoBoost > 0.14 && a > skinA + 2.8)) {
      redSpotCount++;
    }
  }

  const redSpotPercent =
    validSkinCount > 0 ? Number(((redSpotCount / validSkinCount) * 100).toFixed(1)) : 0;

  // Estimate T-zone shine on forehead & nose bridge
  let tZoneShinePercent = 0;
  if (hasNeural && lm) {
    const faceW = Math.max(12, dist2D(lm[234], lm[454]));
    const forehead = sampleMeanLabAndLuma(
      rgba,
      width,
      height,
      lm[10][0],
      lm[10][1] + faceW * 0.08,
      faceW * 0.16,
      faceW * 0.08,
      skinMask
    );
    const nose = sampleMeanLabAndLuma(
      rgba,
      width,
      height,
      lm[6][0],
      lm[197][1],
      faceW * 0.06,
      faceW * 0.12,
      skinMask
    );
    tZoneShinePercent = Number((((forehead.brightRatio + nose.brightRatio) / 2) * 100).toFixed(1));
  }

  const hasRedBlemishes = redSpotPercent >= 3.2 || hemoglobinSpatialStd >= 0.095;
  const hasUnevenTone = melaninSpatialStd >= 0.095;
  const hasOilyTZone = tZoneShinePercent >= 8.0;

  const skinSeverity: ConcernSeverity =
    redSpotPercent >= 6.5 || (hasRedBlemishes && hasUnevenTone)
      ? "notable"
      : hasRedBlemishes || hasUnevenTone || hasOilyTZone
        ? "mild"
        : "balanced";

  const skinDetectedParts: string[] = [];
  if (hasRedBlemishes) skinDetectedParts.push("Nốt mụn đỏ / ửng đỏ nhẹ");
  if (hasUnevenTone) skinDetectedParts.push("Thâm mụn / nền da chưa đều màu");
  if (hasOilyTZone) skinDetectedParts.push("Vùng chữ T hơi bóng dầu");

  const skinItem: FacialConcernItem =
    skinSeverity === "notable"
      ? {
          id: "skin_blemish",
          areaLabel: "Bề mặt da & mụn thâm",
          detectedLabel: skinDetectedParts.slice(0, 2).join(" · ") || "Có nốt mụn đỏ & thâm nhẹ",
          severity: "notable",
          summaryVi:
            "Bề mặt da có vài vùng ửng đỏ hoặc vết thâm không đều màu — rất thường gặp ở da sinh viên thức khuya hay thời tiết nóng ẩm VN.",
          makeupFixVi:
            "Chấm một ít triệt sắc màu xanh lá nhạt đúng lên nốt mụn đỏ, chờ 15 giây rồi dặm kem che khuyết điểm tiệp da bằng cọ đầu nhỏ. Cả mặt chỉ dặm 1 lớp cushion bán lì thật mỏng + phủ phấn bột kiềm dầu vùng chữ T để nền không bị mốc hay bí da.",
          avoidVi:
            "Tuyệt đối tránh chồng nhiều lớp kem nền dày lên nốt mụn (dễ cakey, mốc nền và bít lỗ chân lông gây thêm mụn) và tránh dùng phấn má có nhũ to phủ lên vùng da có mụn ẩn.",
          autoDetected: true,
        }
      : skinSeverity === "mild"
        ? {
            id: "skin_blemish",
            areaLabel: "Bề mặt da & mụn thâm",
            detectedLabel: skinDetectedParts.slice(0, 2).join(" · ") || "Da hơi không đều màu nhẹ",
            severity: "mild",
            summaryVi:
              "Nền da nhìn chung khá ổn, chỉ có vài điểm ửng đỏ, vết thâm nhỏ hoặc hơi bóng dầu nhẹ vùng mũi–trán.",
            makeupFixVi:
              "Dùng chống nắng nâng tông nhẹ hoặc cushion mỏng che cục bộ các nốt thâm bằng kem che khuyết điểm đầu cọ mảnh, rồi dặm nhẹ giấy thấm dầu/phấn phủ không màu ở vùng mũi.",
            avoidVi:
              "Tránh chọn nền quá sáng hơn tông da thật trên 1.5 tông vì càng làm lộ rõ các vết thâm và nốt mụn nhỏ.",
            autoDetected: true,
          }
        : {
            id: "skin_blemish",
            areaLabel: "Bề mặt da & mụn thâm",
            detectedLabel: "Bề mặt da đều màu, ít khuyết điểm",
            severity: "balanced",
            summaryVi:
              "Độ đều màu da khá tốt, ít vùng ửng đỏ cục bộ — lợi thế lớn để đánh lớp nền mỏng nhẹ tự nhiên đi học.",
            makeupFixVi:
              "Chỉ cần kem chống nắng ráo mịn kèm một lớp cushion mỏng hoặc phấn phủ nhẹ là đủ trong trẻo suốt cả ngày.",
            avoidVi: "Không cần dùng kem nền độ che phủ cao hằng ngày để da luôn thông thoáng.",
            autoDetected: false,
          };

  // 5. Under-Eye Dark Circles ("Quầng thâm mắt" — classic Vietnamese student late-night issue)
  let underEyeDarknessDelta = 2.0;
  if (hasNeural && lm) {
    const faceW = Math.max(12, dist2D(lm[234], lm[454]));
    const rPatch = Math.max(2, Math.round(faceW * 0.04));

    const lEyeUnder = sampleMeanLabAndLuma(
      rgba,
      width,
      height,
      lm[145][0],
      lm[145][1] + faceW * 0.055,
      rPatch,
      Math.max(2, rPatch * 0.65)
    );
    const rEyeUnder = sampleMeanLabAndLuma(
      rgba,
      width,
      height,
      lm[374][0],
      lm[374][1] + faceW * 0.055,
      rPatch,
      Math.max(2, rPatch * 0.65)
    );
    const lCheek = sampleMeanLabAndLuma(rgba, width, height, lm[50][0], lm[50][1], rPatch, rPatch);
    const rCheek = sampleMeanLabAndLuma(rgba, width, height, lm[280][0], lm[280][1], rPatch, rPatch);

    const underL = (lEyeUnder.meanL + rEyeUnder.meanL) / 2;
    const cheekL = (lCheek.meanL + rCheek.meanL) / 2;
    underEyeDarknessDelta = Number(Math.max(0, cheekL - underL).toFixed(1));
  }

  const underEyeSeverity: ConcernSeverity =
    underEyeDarknessDelta >= 7.5
      ? "notable"
      : underEyeDarknessDelta >= 4.2
        ? "mild"
        : "balanced";

  const underEyeItem: FacialConcernItem =
    underEyeSeverity === "notable"
      ? {
          id: "undereye",
          areaLabel: "Vùng dưới mắt",
          detectedLabel: "Có quầng thâm mắt khá rõ",
          severity: "notable",
          summaryVi:
            "Vùng da dưới mắt sậm hơn gò má — thường do chạy deadline thức khuya hoặc hốc mắt hơi sâu, dễ làm gương mặt trông mệt.",
          makeupFixVi:
            "Dưỡng ẩm mỏng vùng mắt, chấm một lượng siêu nhỏ triệt sắc màu đào/cam nhạt đúng vào rãnh thâm (không tán sát hàng mi dưới), rồi dặm nhẹ che khuyết điểm tiệp da và khóa bằng phấn phủ mịn.",
          avoidVi:
            "Tránh dùng kem che khuyết điểm quá sáng đánh trực tiếp lên quầng thâm vì sẽ bị ánh xám xịt và đọng rãnh cười.",
          autoDetected: true,
        }
      : underEyeSeverity === "mild"
        ? {
            id: "undereye",
            areaLabel: "Vùng dưới mắt",
            detectedLabel: "Quầng thâm mắt nhẹ",
            severity: "mild",
            summaryVi:
              "Vùng dưới mắt hơi tối nhẹ so với gò má, chỉ cần làm sáng nhẹ ở rãnh lệ là ánh nhìn tươi tỉnh hẳn.",
            makeupFixVi:
              "Chấm 2 chấm nhỏ kem che khuyết điểm tông đào sáng ngay hốc mắt trong và rãnh lệ, tán mỏng bằng đầu ngón tay ấm để tệp da tự nhiên.",
            avoidVi: "Tránh dặm quá nhiều phấn phủ dày dưới mắt dễ lộ nếp nhăn mảnh.",
            autoDetected: true,
          }
        : {
            id: "undereye",
            areaLabel: "Vùng dưới mắt",
            detectedLabel: "Vùng dưới mắt tươi sáng",
            severity: "balanced",
            summaryVi:
              "Vùng da dưới mắt khá sáng và đồng đều với gò má, không cần bước triệt sắc cầu kỳ.",
            makeupFixVi:
              "Chỉ cần tán dư lượng cushion còn lại trên bông mút lướt qua vùng dưới mắt là đủ mịn đều.",
            avoidVi: "Không cần chồng thêm che khuyết điểm dày dưới mắt.",
            autoDetected: false,
          };

  const items: FacialConcernItem[] = [noseItem, eyeItem, fullnessItem, skinItem, underEyeItem];
  const highlightedIds = items.filter((item) => item.autoDetected).map((item) => item.id);

  return {
    items,
    highlightedIds,
    metrics: {
      alarToFaceRatio: Number(alarToFaceRatio.toFixed(3)),
      eyeAspectRatio: Number(eyeAspectRatio.toFixed(3)),
      canthusTiltDeg: Number(canthusTiltDeg.toFixed(1)),
      fullnessIndex,
      redSpotPercent,
      melaninUnevenness: Number(melaninSpatialStd.toFixed(3)),
      underEyeDarknessDelta,
      tZoneShinePercent,
    },
  };
}

export function analyzeVnFacialFeaturesFromReport(
  report: ConsultationReport
): VnFeatureAnalysisResult {
  return analyzeVnFacialFeatures({
    rgba: report.correctedRgba,
    width: report.width,
    height: report.height,
    skinMask: report.skinMask,
    neuralLandmarks: report.neuralLandmarks,
    faceShape: report.faceShape,
    skinL: report.skinMetrics.L_star,
    skinA: report.skinMetrics.a_star,
    melaninSpatialStd: report.chromophores.melaninSpatialStd,
    hemoglobinSpatialStd: report.chromophores.hemoglobinSpatialStd,
    hemoglobinDelta: report.chromophores.hemoglobinDelta,
  });
}

export interface PersonalizedMakeupGuideItem {
  id: ConcernCategoryId;
  /** Short everyday Vietnamese label (e.g. "Mũi tẹt", "Mắt một mí", "Da mụn") */
  quickTabLabel: string;
  titleVi: string;
  detectedStatusVi: string;
  severity: ConcernSeverity;
  autoDetected: boolean;
  stepsVi: [string, string, string];
  shadePickVi: string;
  avoidVi: string;
}

export interface PersonalizedMakeupGuide {
  summaryLineVi: string;
  detectedCount: number;
  items: PersonalizedMakeupGuideItem[];
}

function getUndertonePaletteCues(undertone: SeasonClassification["undertone"]) {
  if (undertone === "Warm (Golden)") {
    return {
      contourTone: "nâu be xám dịu (không ánh cam gắt)",
      eyeBaseTone: "nâu trà sữa hoặc cam đào nhạt",
      blushTone: "cam đào sữa hoặc hồng san hô nhạt",
      highlightTone: "bắt sáng ánh kem ngọc trai mịn",
    };
  }
  if (undertone === "Cool (Pink/Blue)") {
    return {
      contourTone: "nâu xám tro lạnh",
      eyeBaseTone: "hồng đất lạnh hoặc nâu lạnh khói nhẹ",
      blushTone: "hồng phấn lạnh hoặc hồng mận sữa",
      highlightTone: "bắt sáng ánh bạc hồng mịn",
    };
  }
  return {
    contourTone: "nâu xám trung tính nhạt",
    eyeBaseTone: "nâu hạt dẻ nhạt hoặc hồng trà sữa",
    blushTone: "hồng đào đất dịu",
    highlightTone: "bắt sáng ánh ngọc trai tự nhiên",
  };
}

function getSkinBaseCue(texture: SkinTextureType): string {
  if (texture === "oily") {
    return "Kem nền gốc nước không chứa dầu, hạn chế bít tắc lỗ chân lông (non-comedogenic) hoặc cushion bán lì mỏng nhẹ + phấn bột khoáng kiềm dầu vùng chữ T";
  }
  if (texture === "dry") {
    return "Kem dưỡng ẩm dịu nhẹ không hương liệu + nền lỏng gốc nước mỏng, hạn chế bít tắc (non-comedogenic) + xịt khóa nền cấp ẩm";
  }
  return "Kem nền lỏng gốc nước mỏng nhẹ, hạn chế bít tắc lỗ chân lông (non-comedogenic) tiệp da + dặm phấn bột khoáng kiềm dầu riêng ở mũi và trán";
}

export interface VnHighlightContourPlan {
  faceShapeVi: string;
  goalVi: string;
  highlightZonesVi: string;
  contourZonesVi: string;
  productToneVi: string;
}

const FACE_SHAPE_VI_LABELS: Record<FaceShapeResult["primary"], string> = {
  Oval: "Trái xoan",
  Round: "Mặt tròn",
  Square: "Mặt vuông",
  Heart: "Mặt trái tim",
  Oblong: "Mặt dài",
  Diamond: "Mặt kim cương",
};

/**
 * Generates natural, Vietnamese student-friendly Highlight & Contour placement
 * combining detected face shape geometry and undertone (zero heavy Western bronzing).
 */
export function buildVnHighlightContourPlan(
  faceShape: FaceShapeResult,
  undertone: SeasonClassification["undertone"]
): VnHighlightContourPlan {
  const cues = getUndertonePaletteCues(undertone);
  const faceShapeVi = FACE_SHAPE_VI_LABELS[faceShape.primary] ?? "Trái xoan";
  const highlightLabel =
    cues.highlightTone.charAt(0).toUpperCase() + cues.highlightTone.slice(1);
  const productToneVi = `${highlightLabel} · Phấn khối ${cues.contourTone}`;

  switch (faceShape.primary) {
    case "Round":
      return {
        faceShapeVi,
        goalVi: "Tạo cảm giác mặt thon dài, sáng gọn trục giữa khi đi học hằng ngày",
        highlightZonesVi:
          "Chấm nhẹ giữa trán, 2 điểm tách rời ở sống & đầu mũi, và đầu cằm để kéo dài trục dọc — tránh quét bắt sáng lan sang hai bên má.",
        contourZonesVi:
          "Phớt cực mỏng từ dưới mang tai trượt dọc rìa dưới xương hàm vào cằm, cộng thêm nét chữ C nhạt nối đầu chân mày xuống sống mũi.",
        productToneVi,
      };
    case "Square":
      return {
        faceShapeVi,
        goalVi: "Làm mềm góc hàm và giữ ánh nhìn tập trung vào vùng mắt – mũi tươi tắn",
        highlightZonesVi:
          "Đặt bắt sáng mịn ở tam giác sáng dưới mắt, giữa sống mũi và trung tâm cằm để gương mặt trông thanh thoát, dịu nét hơn.",
        contourZonesVi:
          "Dùng cọ bông mềm phớt nhẹ ở hai góc xương hàm dưới và rìa trán hai bên thái dương, tán mờ đều tay để không lộ vệt khối.",
        productToneVi,
      };
    case "Heart":
      return {
        faceShapeVi,
        goalVi: "Cân bằng phần trán rộng với chiếc cằm nhỏ gọn tự nhiên kiểu Hàn – Việt",
        highlightZonesVi:
          "Bắt sáng nhẹ ở sống mũi ngang mắt, rãnh cười vùng giữa má và một chấm thật nhỏ ở viền cằm dưới.",
        contourZonesVi:
          "Phớt mỏng sát chân tóc hai bên thái dương và đầu chân mày xuống hốc mắt; không cần đánh khối mạnh ở cằm.",
        productToneVi,
      };
    case "Oblong":
      return {
        faceShapeVi,
        goalVi: "Rút gọn chiều dài mặt nhẹ nhàng, tạo cảm giác má đầy đặn trẻ trung",
        highlightZonesVi:
          "Chấm bắt sáng ngang trên đỉnh gò má (tán hướng ngang nhẹ ra ngoài) và sống mũi ngang mắt — hạn chế bắt sáng ở đầu cằm và đỉnh trán.",
        contourZonesVi:
          "Phớt cực nhạt sát chân tóc giữa trán và ngay rìa dưới đầu cằm để tỷ lệ gương mặt trông cân đối, bầu bĩnh đáng yêu hơn.",
        productToneVi,
      };
    case "Diamond":
      return {
        faceShapeVi,
        goalVi: "Làm dịu độ nhô gò má và tạo độ đầy hài hòa cho trán – hàm",
        highlightZonesVi:
          "Tập trung làm sáng nhẹ giữa trán, vùng tam giác dưới mắt và trung tâm cằm để cân đối với phần gò má.",
        contourZonesVi:
          "Phớt rất mỏng ngay rìa ngoài gò má hướng về mang tai và sống mũi đầu mày, giữ nét mềm mại tự nhiên.",
        productToneVi,
      };
    case "Oval":
    default:
      return {
        faceShapeVi,
        goalVi: "Tôn sẵn tỉ lệ hài hòa với lớp sáng – khối mỏng trong veo đi học",
        highlightZonesVi:
          "Chấm nhẹ ở đầu mắt, 2 điểm tách rời trên sống & đầu mũi và viền môi trên (nhân trung) giúp mặt bắt sáng tự nhiên dưới đèn lớp học.",
        contourZonesVi:
          "Chỉ cần phớt thật nhẹ hình chữ C nối đầu mày xuống 1/3 sống mũi và quét lướt dưới viền hàm nếu muốn gương mặt ăn ảnh hơn.",
        productToneVi,
      };
  }
}

/**
 * Builds a concrete, step-by-step Vietnamese makeup guide for the 5 most common
 * facial & skin concerns ("da mụn", "mắt một mí/mí lót", "mũi tẹt", "mặt tròn", "quầng thâm"),
 * dynamically adapted to the user's analyzed facial features, undertone, and skin type.
 */
export function buildPersonalizedMakeupGuide(
  analysis: VnFeatureAnalysisResult,
  undertone: SeasonClassification["undertone"],
  texture: SkinTextureType
): PersonalizedMakeupGuide {
  const byId = Object.fromEntries(analysis.items.map((item) => [item.id, item])) as Record<
    ConcernCategoryId,
    FacialConcernItem
  >;
  const cues = getUndertonePaletteCues(undertone);
  const baseCue = getSkinBaseCue(texture);

  const nose = byId.nose;
  const eyes = byId.eyes;
  const skin = byId.skin_blemish;
  const fullness = byId.face_fullness;
  const undereye = byId.undereye;

  const items: PersonalizedMakeupGuideItem[] = [
    {
      id: "skin_blemish",
      quickTabLabel: "Da mụn",
      titleVi: "Hướng dẫn trang điểm cho da mụn",
      detectedStatusVi: skin.detectedLabel,
      severity: skin.severity,
      autoDetected: skin.autoDetected,
      stepsVi: [
        `Chọn nền thoáng, hạn chế bít tắc lỗ chân lông: Ưu tiên ${baseCue.toLowerCase()}, dặm duy nhất 1 lớp thật mỏng bằng bông mút ẩm sạch (vỗ nhẹ, không kéo miết dày cả mặt).`,
        "Che khuyết điểm mụn tự nhiên: Chấm lượng siêu nhỏ triệt sắc xanh lá nhạt đúng lên nốt mụn đỏ (hoặc đào nhạt cho thâm nâu), đợi 15 giây rồi dùng cọ đầu nhỏ dặm kem che khuyết điểm tiệp màu da quanh viền nốt mụn — không đè mạnh lên đỉnh mụn sưng.",
        "Khóa nền nhẹ & giữ thoáng da đi học: Phủ thật mỏng phấn bột khoáng không màu ở vùng chữ T để kiềm dầu, tránh tán phấn má nhũ to lên vùng mụn ẩn, và tẩy trang dịu nhẹ thật kỹ cuối ngày.",
      ],
      shadePickVi: baseCue,
      avoidVi:
        "Tránh chồng nhiều lớp nền đặc chứa dầu nặng, dùng mút bẩn hoặc chà miết mạnh lên nốt mụn vì dễ gây bít tắc lỗ chân lông và mốc nền.",
    },
    {
      id: "eyes",
      quickTabLabel: "Mắt một mí / mí lót",
      titleVi: "Trang điểm mắt một mí/mí lót",
      detectedStatusVi: eyes.detectedLabel,
      severity: eyes.severity,
      autoDetected: eyes.autoDetected,
      stepsVi: [
        `Tán phấn mắt tạo chiều sâu khi mở mắt: Mở mắt nhìn thẳng gương rồi dùng cọ bông tán phấn lì màu ${cues.eyeBaseTone} loang cao hơn đường mí 2–3mm để khi mở mắt màu vẫn hiện tự nhiên, không bị nuốt mí.`,
        "Kẻ eyeliner mảnh kiểu sinh viên Việt: Chỉ dùng chì hoặc gel nâu mảnh viền sát chân mi trong và kéo đuôi ngang hoặc hơi chếch nhẹ ~3mm ở 1/3 đuôi mắt ngoài giúp mắt to dài thanh thoát.",
        "Kẹp mi cong gốc & nhấn đuôi mắt dưới: Bấm mi cong sát gốc rồi chuốt mascara tơi cả mi trên lẫn mi dưới, phớt thêm chút phấn nâu nhạt vào 1/3 đuôi mắt dưới cho ánh nhìn sâu, trong trẻo đi học hằng ngày.",
      ],
      shadePickVi: `Phấn mắt lì ${cues.eyeBaseTone} · Chì/gel kẻ mắt nâu mảnh`,
      avoidVi:
        "Tránh kẻ eyeliner đen dày cả bầu mí (dễ làm hẹp mí và khiến mắt trông dữ) hoặc tán phấn nhũ hạt to khắp bầu mắt gây cảm giác mí bị sưng.",
    },
    {
      id: "nose",
      quickTabLabel: "Mũi tẹt",
      titleVi:
        nose.severity === "balanced"
          ? "Tạo khối mũi thanh gọn tự nhiên"
          : "Khắc phục mũi tẹt & cánh mũi tròn",
      detectedStatusVi: nose.detectedLabel,
      severity: nose.severity,
      autoDetected: nose.autoDetected,
      stepsVi: [
        `Đặt khối đầu mày thanh gọn: Dùng cọ vát nhỏ lấy phấn khối ${cues.contourTone}, đặt nhẹ hình chữ C nối từ đầu chân mày xuống hốc mắt và 1/3 sống mũi.`,
        "Thu gọn đầu & cánh mũi: Vẽ chữ V thật nhỏ ngay viền dưới chóp mũi rồi tán mờ nhẹ sang hai bên cánh mũi để đầu mũi trông gọn và cao hơn.",
        `Chấm bắt sáng tách 2 điểm: Chấm 1 điểm ${cues.highlightTone} ngay giữa sống mũi (ngang mắt) và 1 chấm nhỏ ở đầu mũi — không kéo 1 vạch dài dễ lộ phấn.`,
      ],
      shadePickVi: `Phấn khối ${cues.contourTone} · ${cues.highlightTone}`,
      avoidVi: nose.avoidVi,
    },
    {
      id: "face_fullness",
      quickTabLabel: "Mặt tròn",
      titleVi:
        fullness.severity === "balanced"
          ? "Giữ nét hàm gọn & má tươi tắn"
          : "Thu gọn má bầu bĩnh & viền hàm",
      detectedStatusVi: fullness.detectedLabel,
      severity: fullness.severity,
      autoDetected: fullness.autoDetected,
      stepsVi: [
        `Tạo bóng gọn viền hàm: Dùng cọ bông mềm phớt phấn khối ${cues.contourTone} thật mỏng từ dưới mang tai trượt dọc rìa dưới xương hàm vào cằm.`,
        `Đánh má hồng nâng mặt: Tán má hồng màu ${cues.blushTone} theo hướng xéo nhẹ từ gò má cao kéo lên thái dương giúp nâng cơ và thu hẹp chiều ngang mặt.`,
        "Kéo dài trục giữa nhẹ nhàng: Chấm bắt sáng mịn ở giữa trán và đầu cằm để gương mặt trông thanh thoát hơn.",
      ],
      shadePickVi: `Má hồng ${cues.blushTone} · Khối ${cues.contourTone}`,
      avoidVi: fullness.avoidVi,
    },
    {
      id: "undereye",
      quickTabLabel: "Quầng thâm",
      titleVi:
        undereye.severity === "balanced"
          ? "Làm sáng nhẹ vùng dưới mắt"
          : "Che quầng thâm mắt không bị xám",
      detectedStatusVi: undereye.detectedLabel,
      severity: undereye.severity,
      autoDetected: undereye.autoDetected,
      stepsVi: [
        "Cấp ẩm mỏng trước khi che: Thoa lớp kem dưỡng mắt mỏng để vùng da dưới mắt đủ ẩm, hạn chế đọng kem vào rãnh cười.",
        "Triệt sắc đúng rãnh tối: Chấm 2 chấm nhỏ triệt sắc tông đào nhạt vào rãnh thâm tối nhất (cách hàng mi dưới ~3mm), vỗ nhẹ bằng đầu ngón áp út.",
        "Khóa nhẹ không mốc: Phủ thêm 1 chấm nhỏ che khuyết điểm tiệp da rồi dặm phấn phủ hạt mịn thật mỏng bằng cọ nhỏ để giữ bền màu.",
      ],
      shadePickVi: "Triệt sắc màu đào nhạt · Che khuyết điểm lỏng mỏng",
      avoidVi: undereye.avoidVi,
    },
  ];

  const detectedCount = items.filter((item) => item.autoDetected).length;
  const detectedNames = items
    .filter((item) => item.autoDetected)
    .map((item) => item.quickTabLabel.toLowerCase());

  const summaryLineVi =
    detectedNames.length > 0
      ? `Từ ảnh của bạn, nên chú ý: ${detectedNames.join(", ")} — kèm sẵn hướng dẫn trang điểm cho da mụn & mắt một mí/mí lót theo tông da của bạn.`
      : "Tỉ lệ nét mặt và da bạn khá hài hòa — xem sẵn mẹo trang điểm tự nhiên cho da mụn, mắt một mí/mí lót hoặc chọn nhanh từng mục bên dưới.";

  return {
    summaryLineVi,
    detectedCount,
    items,
  };
}

