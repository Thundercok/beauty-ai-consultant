import type { FaceShapeName, SeasonClassification } from "./types";

export type EyewearSilhouetteId =
  | "cat_eye"
  | "oval"
  | "round"
  | "rectangle"
  | "browline"
  | "aviator"
  | "geometric"
  | "wayfarer";

export interface EyewearRecommendation {
  id: EyewearSilhouetteId;
  nameVi: string;
  tagVi: string;
  reasonVi: string;
}

export interface FrameColorRecommendation {
  label: string;
  hex: string;
}

export interface FaceShapeStyleProfile {
  shape: FaceShapeName;
  headlineVi: string;
  proportionSummaryVi: string;
  eyebrowShapeVi: string;
  eyewearTopPicks: EyewearRecommendation[];
  eyewearAvoidVi: string;
  eyewearFitTipVi: string;
  frameColors: FrameColorRecommendation[];
  frameFinishNoteVi: string;
}

const SHAPE_STYLE_DATABASE: Record<
  FaceShapeName,
  Omit<FaceShapeStyleProfile, "shape" | "frameColors" | "frameFinishNoteVi">
> = {
  Oval: {
    headlineVi: "Tỷ lệ vàng hài hòa, cằm thon tự nhiên",
    proportionSummaryVi:
      "Chiều dài mặt nhỉnh hơn bề rộng gò má vừa phải, trán và hàm thuôn đều nên hợp hầu hết kiểu gọng kính và phong cách trang điểm.",
    eyebrowShapeVi: "Chân mày cong nhẹ tự nhiên theo đường xương mày, tránh kéo góc quá nhọn.",
    eyewearTopPicks: [
      {
        id: "wayfarer",
        nameVi: "Gọng vuông bo góc (Wayfarer)",
        tagVi: "Thanh lịch hằng ngày",
        reasonVi: "Thêm cấu trúc rõ nét mà không phá vỡ sự cân đối vốn có của khuôn mặt.",
      },
      {
        id: "cat_eye",
        nameVi: "Gọng mắt mèo nhẹ (Soft Cat-Eye)",
        tagVi: "Tôn nét sắc sảo",
        reasonVi: "Nâng nhẹ đuôi mắt và tạo điểm nhấn sang trọng cho vùng gò má.",
      },
      {
        id: "aviator",
        nameVi: "Gọng phi công mảnh (Aviator)",
        tagVi: "Trẻ trung phóng khoáng",
        reasonVi: "Viền kim loại mảnh khoe trọn tỷ lệ trán–cằm thanh thoát.",
      },
    ],
    eyewearAvoidVi: "Tránh gọng quá to che kín lông mày hoặc gọng quá hẹp làm mất cân đối thái dương.",
    eyewearFitTipVi: "Chọn bề ngang gọng tương đương phần rộng nhất của gò má.",
  },
  Round: {
    headlineVi: "Đường nét mềm mại, má đầy trẻ trung",
    proportionSummaryVi:
      "Chiều dài và chiều rộng khuôn mặt khá gần nhau, góc hàm tròn mềm — ưu tiên đường nét góc cạnh nhẹ để tăng cảm giác thon dài.",
    eyebrowShapeVi: "Chân mày có đỉnh góc nhẹ ở 2/3 đuôi mày để tạo chiều dọc và giúp mặt thon hơn.",
    eyewearTopPicks: [
      {
        id: "rectangle",
        nameVi: "Gọng chữ nhật thanh mảnh",
        tagVi: "Thon gọn nhất",
        reasonVi: "Đường thẳng ngang và góc vuông nhẹ tạo cấu trúc, giúp khuôn mặt trông dài và sắc nét hơn.",
      },
      {
        id: "cat_eye",
        nameVi: "Gọng mắt mèo hất nhẹ",
        tagVi: "Nâng gò má",
        reasonVi: "Góc xếch lên thái dương kéo ánh nhìn lên trên, giảm cảm giác tròn ở phần má.",
      },
      {
        id: "browline",
        nameVi: "Gọng nửa viền trên (Browline)",
        tagVi: "Nhấn ánh nhìn",
        reasonVi: "Nhấn trọng tâm vào phần viền trên giúp nửa dưới khuôn mặt thanh thoát hơn.",
      },
    ],
    eyewearAvoidVi: "Tránh gọng tròn nhỏ, gọng oval thấp hoặc mắt kính quá nhỏ làm má trông đầy hơn.",
    eyewearFitTipVi: "Ưu tiên kính có ve mũi cao giúp gọng nâng nhẹ khỏi gò má khi cười.",
  },
  Square: {
    headlineVi: "Xương hàm rõ nét, trán và hàm cân đối",
    proportionSummaryVi:
      "Trán, gò má và quai hàm có bề rộng gần bằng nhau với góc hàm rõ — ưu tiên đường cong mềm mại để cân bằng nét sắc sảo.",
    eyebrowShapeVi: "Chân mày cong tròn mềm ở phần đỉnh, đuôi mảnh tự nhiên để làm dịu góc hàm.",
    eyewearTopPicks: [
      {
        id: "round",
        nameVi: "Gọng tròn viền mảnh",
        tagVi: "Mềm hóa góc hàm",
        reasonVi: "Đường cong tròn đối lập với góc hàm vuông, mang lại tổng thể hài hòa, nhẹ nhàng.",
      },
      {
        id: "oval",
        nameVi: "Gọng bầu dục (Oval)",
        tagVi: "Cân đối tự nhiên",
        reasonVi: "Làm mềm cả vùng trán rộng lẫn đường hàm dưới mà vẫn gọn gàng khi đi làm.",
      },
      {
        id: "cat_eye",
        nameVi: "Gọng mắt mèo bo tròn",
        tagVi: "Nữ tính thanh thoát",
        reasonVi: "Tập trung điểm nhấn ở vùng mắt và làm nhẹ phần khung xương hàm.",
      },
    ],
    eyewearAvoidVi: "Tránh gọng vuông bản dày, gọng chữ nhật góc sắc cạnh hoặc viền quá thấp.",
    eyewearFitTipVi: "Chọn gọng có bề ngang nhỉnh hơn gò má 1–2 mm để tạo độ thoáng cho hai bên hàm.",
  },
  Heart: {
    headlineVi: "Trán sáng thoáng, cằm V-line nhỏ gọn",
    proportionSummaryVi:
      "Vùng trán và thái dương rộng hơn phần hàm dưới, thuôn gọn về chóp cằm — ưu tiên thiết kế nhẹ ở phần trên và cân bằng nửa dưới.",
    eyebrowShapeVi: "Chân mày cong thấp nhẹ nhàng, độ dày vừa phải để không làm trán rộng hơn.",
    eyewearTopPicks: [
      {
        id: "oval",
        nameVi: "Gọng oval viền mảnh",
        tagVi: "Cân đối trán–cằm",
        reasonVi: "Viền mảnh nhẹ nhàng giúp thu gọn cảm giác bề ngang vùng trán và tôn cằm V-line.",
      },
      {
        id: "aviator",
        nameVi: "Gọng giọt nước (Aviator)",
        tagVi: "Hài hòa nửa dưới",
        reasonVi: "Phần đáy tròng hơi mở rộng xuống dưới giúp cân bằng phần cằm thon nhỏ.",
      },
      {
        id: "round",
        nameVi: "Gọng tròn trong suốt / kim loại mảnh",
        tagVi: "Nhẹ nhàng thanh lịch",
        reasonVi: "Giảm trọng lượng thị giác ở nửa trên khuôn mặt và tạo nét mềm mại.",
      },
    ],
    eyewearAvoidVi: "Tránh gọng viền trên quá dày, mắt mèo xếch mạnh hoặc trang trí nặng ở góc thái dương.",
    eyewearFitTipVi: "Gọng trong suốt (crystal) hoặc kim loại mảnh giúp phần trán trông nhẹ và thoáng hơn.",
  },
  Oblong: {
    headlineVi: "Khuôn mặt thanh dài, đường nét gọn gàng",
    proportionSummaryVi:
      "Chiều dài khuôn mặt nổi trội hơn bề ngang — ưu tiên các đường ngang và tròng kính có chiều sâu để cân bằng tỷ lệ dọc.",
    eyebrowShapeVi: "Chân mày ngang nhẹ kiểu Hàn Quốc, hạn chế vẽ đỉnh quá cao để rút ngắn cảm giác mặt dài.",
    eyewearTopPicks: [
      {
        id: "wayfarer",
        nameVi: "Gọng bản vừa tròng sâu (Wayfarer)",
        tagVi: "Cân bằng chiều dài",
        reasonVi: "Chiều cao tròng kính lớn chia tỷ lệ dọc khuôn mặt hài hòa, tạo cảm giác đầy đặn hơn.",
      },
      {
        id: "round",
        nameVi: "Gọng tròn bản to (Oversized Round)",
        tagVi: "Trẻ trung cân đối",
        reasonVi: "Đường cong rộng theo chiều ngang giúp khuôn mặt trông mềm và cân tỷ lệ hơn.",
      },
      {
        id: "aviator",
        nameVi: "Gọng phi công cầu đôi",
        tagVi: "Tạo điểm nhấn ngang",
        reasonVi: "Thanh cầu mũi ngang giúp rút ngắn trực quan phần sống mũi và giữa mặt.",
      },
    ],
    eyewearAvoidVi: "Tránh gọng mắt kính quá nhỏ, quá dẹt hoặc gọng không viền mảnh làm mặt trông dài hơn.",
    eyewearFitTipVi: "Chọn tròng kính cao vừa phủ từ chân mày xuống gần gò má để tối ưu tỷ lệ 1/3 khuôn mặt.",
  },
  Diamond: {
    headlineVi: "Gò má cao sắc nét, trán và cằm thon gọn",
    proportionSummaryVi:
      "Gò má là điểm rộng và nổi bật nhất trong khi trán và cằm thuôn hẹp — ưu tiên gọng nhấn nhẹ vùng mắt để cân bằng phần má cao.",
    eyebrowShapeVi: "Chân mày cong mềm mại ở đỉnh, tránh kéo quá thẳng để giữ sự thanh thoát cho gò má.",
    eyewearTopPicks: [
      {
        id: "cat_eye",
        nameVi: "Gọng mắt mèo thanh mảnh",
        tagVi: "Tôn nét sang trọng",
        reasonVi: "Mở rộng nhẹ vùng trán–thái dương, cân bằng hoàn hảo với gò má cao đặc trưng.",
      },
      {
        id: "oval",
        nameVi: "Gọng oval mảnh mềm mại",
        tagVi: "Dịu góc gò má",
        reasonVi: "Bo tròn mềm quanh vùng mắt giúp làm dịu đường nét góc cạnh ở hai bên gò má.",
      },
      {
        id: "browline",
        nameVi: "Gọng Browline viền trên rõ",
        tagVi: "Cân bằng tỷ lệ trán",
        reasonVi: "Tạo độ đầy đặn cho phần trên khuôn mặt để hài hòa với cằm thon và gò má cao.",
      },
    ],
    eyewearAvoidVi: "Tránh gọng chữ nhật hẹp bề ngang hoặc gọng ôm sát gò má làm lộ phần má cao.",
    eyewearFitTipVi: "Bề ngang gọng nên rộng bằng hoặc hơn gò má một chút để tổng thể cân xứng.",
  },
};

const FRAME_COLORS_BY_UNDERTONE: Record<
  SeasonClassification["undertone"],
  { colors: FrameColorRecommendation[]; noteVi: string }
> = {
  "Warm (Golden)": {
    colors: [
      { label: "Vàng Champagne", hex: "#D6B27A" },
      { label: "Đồi mồi ấm", hex: "#7C4C2B" },
      { label: "Vàng hồng", hex: "#D29B8B" },
      { label: "Nâu hổ phách", hex: "#A86C3D" },
    ],
    noteVi: "Da tông ấm hợp kim loại vàng nhạt, vàng hồng và nhựa đồi mồi nâu mật ong.",
  },
  "Cool (Pink/Blue)": {
    colors: [
      { label: "Bạc ánh kim", hex: "#C7CDD4" },
      { label: "Xám Titan", hex: "#6B7280" },
      { label: "Đen bóng", hex: "#1F2024" },
      { label: "Hồng khói trong", hex: "#D6B2BC" },
    ],
    noteVi: "Da tông lạnh sáng bật nhất với gọng bạc, xám titan, đen bóng hoặc nhựa hồng khói trong.",
  },
  Neutral: {
    colors: [
      { label: "Vàng nhạt trung tính", hex: "#CEB999" },
      { label: "Nâu xám nhạt", hex: "#8B7D72" },
      { label: "Bạc mờ", hex: "#B9C0C7" },
      { label: "Nhựa trong suốt", hex: "#E5E7EB" },
    ],
    noteVi: "Da trung tính dễ đeo cả kim loại vàng nhạt, bạc mờ lẫn gọng nhựa trong suốt thanh lịch.",
  },
};

export function buildFaceShapeStyleProfile(
  shape: FaceShapeName,
  undertone: SeasonClassification["undertone"]
): FaceShapeStyleProfile {
  const base = SHAPE_STYLE_DATABASE[shape];
  const palette = FRAME_COLORS_BY_UNDERTONE[undertone];
  return {
    shape,
    ...base,
    frameColors: palette.colors,
    frameFinishNoteVi: palette.noteVi,
  };
}
