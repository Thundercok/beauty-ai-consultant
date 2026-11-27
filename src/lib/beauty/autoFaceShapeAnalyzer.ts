import { classifyFaceShapeFromRatios } from "./faceAnalysis";
import { SHAPE_VI_LABELS } from "./viLabels";
import type {
  FaceLandmarksBox,
  FaceShapeName,
  FaceShapeResult,
  SeasonClassification,
} from "./types";

export interface AutoFaceShapeMakeupTip {
  id: "contour" | "highlight" | "blush_brow";
  focusLabelVi: string;
  headlineVi: string;
  detailVi: string;
}

export interface AutoFaceShapeAnalysis {
  result: FaceShapeResult;
  shapeLabelVi: string;
  secondaryLabelVi: string;
  confidencePct: number;
  source: "neural" | "faceBox";
  sourceLabelVi: string;
  proportionSummaryVi: string;
  tips: [AutoFaceShapeMakeupTip, AutoFaceShapeMakeupTip, AutoFaceShapeMakeupTip];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dist2D(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function getContourTonePhraseVi(undertone: SeasonClassification["undertone"]): string {
  if (undertone === "Cool (Pink/Blue)") return "phấn khối nâu xám lạnh nhạt";
  if (undertone === "Warm (Golden)") return "phấn khối nâu cacao ấm nhạt";
  return "phấn khối nâu trung tính mịn lì";
}

function getHighlightTonePhraseVi(undertone: SeasonClassification["undertone"]): string {
  if (undertone === "Cool (Pink/Blue)") return "bắt sáng ánh ngọc trai trắng hồng mịn";
  if (undertone === "Warm (Golden)") return "bắt sáng ánh champagne vàng kem mịn";
  return "bắt sáng ánh kem sữa tự nhiên";
}

function getBlushTonePhraseVi(undertone: SeasonClassification["undertone"]): string {
  if (undertone === "Cool (Pink/Blue)") return "má hồng phấn lạnh hoặc hồng dâu sữa";
  if (undertone === "Warm (Golden)") return "má hồng đào sữa hoặc cam san hô nhạt";
  return "má hồng đất nhạt hoặc hồng đào dịu";
}

function buildStudentMakeupTips(
  shape: FaceShapeName,
  undertone: SeasonClassification["undertone"]
): [AutoFaceShapeMakeupTip, AutoFaceShapeMakeupTip, AutoFaceShapeMakeupTip] {
  const contourTone = getContourTonePhraseVi(undertone);
  const highlightTone = getHighlightTonePhraseVi(undertone);
  const blushTone = getBlushTonePhraseVi(undertone);

  switch (shape) {
    case "Round":
      return [
        {
          id: "contour",
          focusLabelVi: "Tạo khối (Contour)",
          headlineVi: "Phớt khối dọc rìa xương hàm & tạo chữ C đầu mày – sống mũi",
          detailVi: `Dùng cọ bông mềm phớt thật mỏng ${contourTone} dọc viền dưới xương hàm vào gần cằm (không đánh hốc má sâu kiểu Âu Mỹ) giúp gương mặt thon gọn tự nhiên dưới ánh đèn lớp học.`,
        },
        {
          id: "highlight",
          focusLabelVi: "Bắt sáng (Highlight)",
          headlineVi: "Chấm sáng trục dọc: giữa trán, 2 điểm mũi & chóp cằm",
          detailVi: `Dặm nhẹ ${highlightTone} ở chính giữa trán, tách 2 điểm sống mũi – đầu mũi và một chấm nhỏ ở chóp cằm để kéo dài chiều dọc gương mặt trông thanh thoát hơn.`,
        },
        {
          id: "blush_brow",
          focusLabelVi: "Má hồng & chân mày cân nét",
          headlineVi: "Tán má hồng xéo lên thái dương & kẻ mày có đỉnh cong nhẹ",
          detailVi: `Quét ${blushTone} theo chiều xéo từ gò má cao lên thái dương, kết hợp chân mày có đỉnh cong nhẹ ở 2/3 đuôi để tạo cấu trúc và giảm cảm giác bầu má.`,
        },
      ];
    case "Square":
      return [
        {
          id: "contour",
          focusLabelVi: "Tạo khối (Contour)",
          headlineVi: "Làm dịu 2 góc xương hàm dưới & sát chân tóc thái dương",
          detailVi: `Dùng ${contourTone} phớt nhẹ tay theo chuyển động xoay tròn ngay 2 góc hàm vuông và hai bên trán để đường viền mặt mềm mại mà không bị lộ vệt phấn khi nhìn gần.`,
        },
        {
          id: "highlight",
          focusLabelVi: "Bắt sáng (Highlight)",
          headlineVi: "Thu ánh nhìn vào vùng trung tâm trán, mũi & giữa cằm",
          detailVi: `Chấm mỏng ${highlightTone} ở vùng tam giác dưới mắt, sống mũi và chính giữa đầu cằm giúp gương mặt sáng bừng, thanh tú và bớt góc cạnh.`,
        },
        {
          id: "blush_brow",
          focusLabelVi: "Má hồng & chân mày cân nét",
          headlineVi: "Đánh má hồng tán tròn mềm trên bầu má & chân mày cong dịu",
          detailVi: `Dặm ${blushTone} tán tròn mềm hơi cao trên bầu má và kẻ chân mày cong nhẹ bằng bột tán nâu nhạt thay vì vẽ góc sắc, mang lại nét nữ tính chuẩn sinh viên.`,
        },
      ];
    case "Heart":
      return [
        {
          id: "contour",
          focusLabelVi: "Tạo khối (Contour)",
          headlineVi: "Thu gọn nhẹ hai bên thái dương & chạm siêu mỏng đầu cằm",
          detailVi: `Phớt thật mỏng ${contourTone} dọc hai bên thái dương sát chân tóc để cân bằng bề ngang trán; chỉ phớt lướt dưới chóp cằm nếu cằm hơi nhọn.`,
        },
        {
          id: "highlight",
          focusLabelVi: "Bắt sáng (Highlight)",
          headlineVi: "Bắt sáng nửa dưới gò má, sống mũi & đỉnh môi trên",
          detailVi: `Dặm nhẹ ${highlightTone} ở vùng dưới bầu mắt lan nhẹ xuống giữa má và nhân trung, giúp nửa dưới khuôn mặt đầy đặn và hài hòa hơn với vầng trán thoáng.`,
        },
        {
          id: "blush_brow",
          focusLabelVi: "Má hồng & chân mày cân nét",
          headlineVi: "Tán má hồng bầu dục hơi thấp & giữ dáng mày cong thấp mềm",
          detailVi: `Phớt ${blushTone} ở vùng giữa bầu má hơi thấp và giữ chân mày cong thấp độ dày vừa phải, tránh vẽ đỉnh mày quá cao khiến trán trông rộng hơn.`,
        },
      ];
    case "Oblong":
      return [
        {
          id: "contour",
          focusLabelVi: "Tạo khối (Contour)",
          headlineVi: "Phớt khối sát chân tóc đỉnh trán & ngay rìa dưới chóp cằm",
          detailVi: `Dùng ${contourTone} phớt mỏng sát đường chân tóc giữa trán và ngay dưới cằm (không tạo khối hai bên má) để rút gọn chiều dài trục dọc một cách tự nhiên.`,
        },
        {
          id: "highlight",
          focusLabelVi: "Bắt sáng (Highlight)",
          headlineVi: "Bắt sáng ngang vùng bầu má & chấm gọn đầu mũi",
          detailVi: `Chấm nhẹ ${highlightTone} ở vùng bầu má hướng ngang ra ngoài thay vì kéo vệt dài dọc trán – cằm, tạo hiệu ứng gương mặt đầy đặn và trẻ trung hơn.`,
        },
        {
          id: "blush_brow",
          focusLabelVi: "Má hồng & chân mày cân nét",
          headlineVi: "Tán má hồng ngang qua bầu má & kẻ chân mày ngang Hàn Quốc",
          detailVi: `Quét ${blushTone} theo chiều ngang nhẹ qua hai bầu má kết hợp dáng mày ngang mềm kiểu Hàn giúp chia cân đối tỷ lệ mặt dài cực hiệu quả khi đi học.`,
        },
      ];
    case "Diamond":
      return [
        {
          id: "contour",
          focusLabelVi: "Tạo khối (Contour)",
          headlineVi: "Phớt khối siêu mỏng ngay rìa ngoài đỉnh gò má hướng về tai",
          detailVi: `Dùng ${contourTone} chạm thật nhẹ ở rìa ngoài gò má hướng về phía mang tai để dịu độ nhô của xương gò má mà không làm hóp phần má dưới.`,
        },
        {
          id: "highlight",
          focusLabelVi: "Bắt sáng (Highlight)",
          headlineVi: "Làm sáng mở rộng vùng giữa trán, hai bên cằm & sống mũi",
          detailVi: `Dặm ${highlightTone} ở trung tâm trán và vùng cằm giúp tạo cảm giác trán – cằm thoáng đầy hơn, cân xứng hoàn hảo với gò má cao sắc nét.`,
        },
        {
          id: "blush_brow",
          focusLabelVi: "Má hồng & chân mày cân nét",
          headlineVi: "Dặm má hồng ngay dưới đỉnh gò má & kẻ đuôi mày thoáng nhẹ",
          detailVi: `Tán ${blushTone} hơi lùi vào bầu má dưới đỉnh gò má và giữ dáng mày cong mềm kéo đuôi vừa phải giúp nửa trên gương mặt thanh thoát, nhẹ nhàng.`,
        },
      ];
    case "Oval":
    default:
      return [
        {
          id: "contour",
          focusLabelVi: "Tạo khối (Contour)",
          headlineVi: "Tạo khối chữ C mảnh ở mũi & phớt lướt siêu nhẹ viền hàm",
          detailVi: `Mặt trái xoan đã có tỷ lệ rất hài hòa, chỉ cần phớt mỏng ${contourTone} hình chữ C từ đầu mày xuống 1/3 sống mũi và quét lướt rìa hàm để gương mặt có chiều sâu khi chụp ảnh.`,
        },
        {
          id: "highlight",
          focusLabelVi: "Bắt sáng (Highlight)",
          headlineVi: "Chấm sáng 2 điểm tách rời trên sống mũi, đầu mắt & chóp cằm",
          detailVi: `Dặm một lượng thật nhỏ ${highlightTone} vào giữa sống mũi, chóp mũi, khóe mắt trong và đỉnh môi trên giúp da căng bóng trong veo chuẩn phong cách sinh viên.`,
        },
        {
          id: "blush_brow",
          focusLabelVi: "Má hồng & chân mày cân nét",
          headlineVi: "Tán má hồng nâng nhẹ trên bầu má & chải mày theo dáng gốc",
          detailVi: `Phớt ${blushTone} mỏng nhẹ trên bầu má tán hướng lên thái dương và dùng gel/chì nâu nhạt chải gọn theo đúng đường xương mày tự nhiên sẵn có.`,
        },
      ];
  }
}

const SHAPE_PROPORTION_SUMMARY_VI: Record<FaceShapeName, string> = {
  Oval: "Chiều dài khuôn mặt nhỉnh hơn bề ngang gò má vừa phải, trán và xương hàm thuôn đều cân đối.",
  Round: "Chiều dài và chiều rộng gò má gần tương đương nhau với đường viền hàm tròn đầy, trẻ trung.",
  Square: "Bề rộng trán, gò má và góc xương hàm khá tương đồng, tạo cấu trúc gương mặt rõ nét.",
  Heart: "Vùng trán và thái dương thoáng rộng hơn phần xương hàm, thuôn nhỏ dần về chóp cằm V-line.",
  Oblong: "Chiều dài trục dọc nổi trội hơn bề ngang gò má, đường nét gương mặt thanh mảnh.",
  Diamond: "Gò má là điểm rộng nổi bật nhất trong khi vùng trán và phần cằm thuôn gọn thanh tú.",
};

/**
 * Automatically computes geometric facial ratios directly from MediaPipe `neuralLandmarks`
 * (when available) or falls back cleanly to `faceBox` proportions, classifies the user's face shape,
 * and returns 3 tailored Vietnamese student makeup tips.
 */
export function analyzeFaceShapeFromGeometry(params: {
  neuralLandmarks: Array<[number, number, number]> | null;
  faceBox: FaceLandmarksBox;
  width: number;
  height: number;
  undertone: SeasonClassification["undertone"];
}): AutoFaceShapeAnalysis {
  const { neuralLandmarks, faceBox, width, height, undertone } = params;
  const hasNeural = Boolean(neuralLandmarks && neuralLandmarks.length >= 468);

  let r1: number;
  let r2: number;
  let r3: number;
  let source: "neural" | "faceBox";

  if (hasNeural && neuralLandmarks) {
    const faceLength = dist2D(neuralLandmarks[10], neuralLandmarks[152]);
    const cheekWidth = Math.max(1e-3, dist2D(neuralLandmarks[234], neuralLandmarks[454]));
    const jawWidth = Math.max(1e-3, dist2D(neuralLandmarks[172], neuralLandmarks[397]));
    const foreheadWidth = Math.max(1e-3, dist2D(neuralLandmarks[54], neuralLandmarks[284]));

    r1 = clamp(faceLength / cheekWidth, 0.82, 1.75);
    r2 = clamp(jawWidth / cheekWidth, 0.55, 1.12);
    r3 = clamp(foreheadWidth / jawWidth, 0.72, 1.55);
    source = "neural";
  } else {
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    const boxW = Math.max(1e-3, faceBox.faceWidth * safeW);
    const boxH = Math.max(1e-3, faceBox.faceHeight * safeH);

    r1 = clamp(boxH / boxW, 0.82, 1.75);
    r2 = clamp(faceBox.jawRatio, 0.55, 1.12);
    r3 = clamp(faceBox.foreheadRatio / Math.max(0.55, faceBox.jawRatio), 0.72, 1.55);
    source = "faceBox";
  }

  const result = classifyFaceShapeFromRatios(
    Number(r1.toFixed(3)),
    Number(r2.toFixed(3)),
    Number(r3.toFixed(3))
  );

  const primaryProb = result.probabilities[result.primary] ?? 0;
  const confidencePct = Math.round(clamp(primaryProb * 100, 1, 99));

  return {
    result,
    shapeLabelVi: SHAPE_VI_LABELS[result.primary],
    secondaryLabelVi: SHAPE_VI_LABELS[result.secondary],
    confidencePct,
    source,
    sourceLabelVi:
      source === "neural"
        ? `Tự động đo từ ${neuralLandmarks?.length ?? 468} điểm chuẩn khuôn mặt`
        : "Tự động tính từ khung tỷ lệ khuôn mặt (faceBox)",
    proportionSummaryVi: SHAPE_PROPORTION_SUMMARY_VI[result.primary],
    tips: buildStudentMakeupTips(result.primary, undertone),
  };
}
