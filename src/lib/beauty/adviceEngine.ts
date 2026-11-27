import type { FaceShapeName, SeasonName } from "./types";

export const SHAPE_CONTOUR_RULES: Record<
  FaceShapeName,
  { contour: string; blush: string; liner: string }
> = {
  Oval: {
    contour: "Chỉ cần tạo khối thật nhẹ hai bên sống mũi và sát chân tóc, giữ mặt sáng tự nhiên kiểu Hàn–Việt.",
    blush: "Tán má hồng ửng nhẹ ngay dưới bọng mắt kéo ngang nhẹ ra gò má để gương mặt trông trẻ trung, tươi tắn.",
    liner: "Kẻ viền mắt nâu mảnh sát chân mi, kéo đuôi ngắn 1–2 mm tự nhiên cho mắt trong veo.",
  },
  Round: {
    contour: "Phớt thật nhẹ phấn tạo khối nâu xám dưới gò má, góc hàm và sống mũi để mặt trông thanh thoát hơn mà không bị gắt.",
    blush: "Đánh má hồng hơi chếch nhẹ từ giữa má ra thái dương, tránh đánh tròn cục ở sát cánh mũi.",
    liner: "Kéo đuôi mắt nâu mảnh hơi dài 2–3 mm giúp ánh nhìn sắc nét và thon mặt hơn.",
  },
  Square: {
    contour: "Phớt thật mỏng phấn khối nâu xám ở hai góc hàm và thái dương cho đường nét mềm mại hơn, không vẽ nét sắc cạnh.",
    blush: "Tán má hồng bo tròn mềm ngay phần gò má hướng nhẹ ra ngoài để làm dịu góc hàm.",
    liner: "Dùng phấn mắt nâu đậm tán sát chân mi thay vì kẻ đuôi mắt quá sắc để tổng thể dịu dàng hơn.",
  },
  Heart: {
    contour: "Chấm nhẹ phấn khối ở hai bên thái dương để trán gọn hơn, giữ vùng cằm V-line thoáng sáng.",
    blush: "Đánh má hồng ngang nhẹ vùng giữa má, đặt trọng tâm hơi thấp hơn thái dương để cân đối trán và cằm.",
    liner: "Kẻ mí mảnh màu nâu tự nhiên, nhấn nhẹ mi dưới và bọng mắt giúp nửa dưới mặt hài hòa hơn.",
  },
  Oblong: {
    contour: "Phớt nhẹ phấn khối sát chân tóc trán và ngay dưới chóp cằm để rút ngắn cảm giác mặt dài.",
    blush: "Đánh má hồng tán ngang qua gò má và phớt nhẹ qua sống mũi kiểu ửng nắng để hack mặt ngắn và trẻ hơn.",
    liner: "Kẻ mắt kéo ngang nhẹ nhàng, kết hợp nhấn bọng mắt sáng để chia tỷ lệ mặt cân đối hơn.",
  },
  Diamond: {
    contour: "Phớt siêu nhẹ bên ngoài gò má cao và sát chân tóc, giữ vùng dưới mắt và giữa trán sáng mịn.",
    blush: "Đặt má hồng hơi lệch về phía trước gò má rồi tán ngang mềm giúp phần má cao trông đầy đặn, dịu mắt hơn.",
    liner: "Kẻ đường mi nâu mảnh kéo ngang nhẹ, tập trung chuốt mi cong tơi giúp gương mặt mềm mại hơn.",
  },
};

export interface SeasonPalette {
  undertone: "warm" | "cool";
  lip: string;
  lip_hex: string;
  blush: string;
  blush_hex: string;
  eye: string;
  eye_hex: string;
  contour_tone: string;
  avoid: string;
}

export const SEASON_COLOR_PALETTES: Record<SeasonName, SeasonPalette> = {
  "Light Spring": {
    undertone: "warm",
    lip: "hồng san hô trong hoặc cam đào sữa",
    lip_hex: "#D9786D",
    blush: "cam đào sữa sáng",
    blush_hex: "#F0ACA1",
    eye: "be nhũ nhẹ, cam đào nhạt và nâu mật ong sáng",
    eye_hex: "#D7AE87",
    contour_tone: "nâu sữa nhạt không ánh cam",
    avoid: "son mận quá tối hoặc màu xám lạnh làm mặt kém tươi",
  },
  "Warm Spring": {
    undertone: "warm",
    lip: "đỏ san hô tươi hoặc hồng đào ấm",
    lip_hex: "#D65F52",
    blush: "hồng đào ấm",
    blush_hex: "#EE9B82",
    eye: "nhũ vàng nhẹ, nâu trà sữa và cam đào dịu",
    eye_hex: "#C9925E",
    contour_tone: "nâu nhạt tự nhiên",
    avoid: "hồng cánh sen lạnh, xám đậm và đỏ tím quá tối",
  },
  "Bright Spring": {
    undertone: "warm",
    lip: "đỏ dưa hấu trong hoặc san hô tươi rõ màu",
    lip_hex: "#E05F61",
    blush: "hồng san hô tươi",
    blush_hex: "#F28C7D",
    eye: "trắng ngà sáng, nhũ vàng mịn và nâu ấm sạch",
    eye_hex: "#D99A54",
    contour_tone: "nâu sáng tự nhiên",
    avoid: "màu đất quá xỉn, màu bợt nhạt hoặc son nâu tím",
  },
  "Light Summer": {
    undertone: "cool",
    lip: "hồng cánh sen dịu hoặc hồng phấn sữa",
    lip_hex: "#C77886",
    blush: "hồng phấn sữa lạnh",
    blush_hex: "#E7A7B5",
    eye: "nâu xám nhạt, hồng phấn sương và nhũ ngọc trai",
    eye_hex: "#B5A3B4",
    contour_tone: "nâu xám lạnh thật nhạt",
    avoid: "cam gạch gắt, vàng nghệ và nâu quá đậm",
  },
  "Cool Summer": {
    undertone: "cool",
    lip: "hồng đất lạnh hoặc hồng dâu dịu",
    lip_hex: "#B76D83",
    blush: "hồng phấn lạnh pha tím nhẹ",
    blush_hex: "#D791A4",
    eye: "nâu xám hồng, hồng khói dịu và nhũ bạc mịn",
    eye_hex: "#9C8691",
    contour_tone: "nâu xám lạnh không ánh cam",
    avoid: "cam neon, vàng cam gắt và phấn khối ánh cam đỏ",
  },
  "Soft Summer": {
    undertone: "cool",
    lip: "hồng cánh khô hoặc hồng mận nhạt",
    lip_hex: "#A96E7A",
    blush: "hồng cánh khô dịu",
    blush_hex: "#CE919D",
    eye: "nâu hồng dịu, nâu xám khói và tím khói nhạt",
    eye_hex: "#8F777B",
    contour_tone: "nâu xám dịu tự nhiên",
    avoid: "màu quá chói gắt, đen tuyền nặng nề hoặc cam tươi",
  },
  "Warm Autumn": {
    undertone: "warm",
    lip: "đỏ gạch sữa hoặc hồng cam đất",
    lip_hex: "#B85D4C",
    blush: "cam đào đất dịu",
    blush_hex: "#D98769",
    eye: "nâu trà sữa ấm, nâu quế và nhũ đồng nhẹ",
    eye_hex: "#9A6C43",
    contour_tone: "nâu ấm trung tính",
    avoid: "hồng phấn quá lạnh, nhũ bạc lạnh và hồng cánh sen chói",
  },
  "Soft Autumn": {
    undertone: "warm",
    lip: "hồng đất ấm hoặc hồng trà sữa trầm",
    lip_hex: "#B77A6B",
    blush: "đào đất dịu nhẹ",
    blush_hex: "#D8A08A",
    eye: "nâu sữa, be ấm và nâu hạt dẻ nhạt",
    eye_hex: "#9B8370",
    contour_tone: "nâu be trung tính nhẹ",
    avoid: "màu chói gắt, màu quá tương phản hoặc hồng tím lạnh",
  },
  "Deep Autumn": {
    undertone: "warm",
    lip: "đỏ gạch trầm hoặc đỏ nâu đất",
    lip_hex: "#933F37",
    blush: "cam đất ấm nhẹ",
    blush_hex: "#B96652",
    eye: "nâu cà phê, nâu đồng mịn và nâu đất đậm",
    eye_hex: "#66422D",
    contour_tone: "nâu đất tự nhiên không quá đỏ",
    avoid: "hồng phấn nhợt nhạt, màu sữa bợt hoặc nhũ bạc sáng",
  },
  "Bright Winter": {
    undertone: "cool",
    lip: "đỏ dâu lạnh trong hoặc đỏ lạnh tươi",
    lip_hex: "#B94055",
    blush: "hồng dâu lạnh phớt nhẹ",
    blush_hex: "#D8657A",
    eye: "nâu xám lạnh sạch, nhũ ánh ngọc trai và mận khói nhẹ",
    eye_hex: "#5D4B58",
    contour_tone: "nâu xám lạnh sạch",
    avoid: "be vàng xỉn, cam đất mờ và các màu nâu đục",
  },
  "Cool Winter": {
    undertone: "cool",
    lip: "đỏ lạnh sáng răng hoặc đỏ hồng mận",
    lip_hex: "#A63F58",
    blush: "hồng lạnh trong veo",
    blush_hex: "#CC6F86",
    eye: "xám khói dịu, hồng lạnh và nhũ ngọc trai sáng",
    eye_hex: "#4C4655",
    contour_tone: "nâu xám lạnh không ánh cam",
    avoid: "đỏ cam chói, vàng nghệ và phấn khối nâu cam",
  },
  "Deep Winter": {
    undertone: "cool",
    lip: "đỏ rượu vang hoặc đỏ mận lạnh",
    lip_hex: "#7D3549",
    blush: "hồng rượu trầm tán thật mỏng",
    blush_hex: "#A95D73",
    eye: "nâu cà phê lạnh, tím mận khói và xám than nhẹ",
    eye_hex: "#493B43",
    contour_tone: "nâu xám lạnh có chiều sâu",
    avoid: "hồng phấn bợt, cam đào nhạt và vàng sáng",
  },
};

export function composeAdvice(
  shapeRule: { contour: string; blush: string; liner: string },
  palette: SeasonPalette
) {
  return {
    contour: `${shapeRule.contour} Chọn phấn khối tông ${palette.contour_tone}.`,
    blush: `Chọn má hồng tông ${palette.blush}. ${shapeRule.blush}`,
    lip: `Hợp nhất là son màu ${palette.lip}; đi học tán mỏng lòng môi mờ viền sẽ rất tự nhiên, đi chơi có thể chồng thêm lớp bóng nhẹ.`,
    eyes: `Phối phấn mắt tông ${palette.eye}. ${shapeRule.liner}`,
    avoid: [
      `Hạn chế ${palette.avoid}`,
      "Tạo khối quá đậm hoặc có ánh cam gắt kiểu Tây làm mặt bị già",
      "Đánh nền quá dày dễ mốc hoặc xuống tông trong thời tiết nóng ẩm",
    ],
    targetColors: {
      lip: palette.lip_hex,
      blush: palette.blush_hex,
      eyeshadow: palette.eye_hex,
    },
  };
}

export function getAsianAdvice(shape: FaceShapeName, season: SeasonName) {
  return composeAdvice(SHAPE_CONTOUR_RULES[shape], SEASON_COLOR_PALETTES[season]);
}
