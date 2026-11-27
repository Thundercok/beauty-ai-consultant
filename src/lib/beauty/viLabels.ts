import type { FaceShapeName, MatchedProduct, SeasonClassification, SeasonName } from "./types";

export const SEASON_VI_LABELS: Record<SeasonName, { title: string; summary: string }> = {
  "Light Spring": {
    title: "Xuân Sáng",
    summary: "Da sáng, sắc ấm nhẹ. Hợp hồng san hô trong, cam đào sữa và nâu mật ong nhạt.",
  },
  "Warm Spring": {
    title: "Xuân Ấm",
    summary: "Da thiên vàng ấm tươi. Hợp đỏ san hô, cam đào ấm và nâu trà sữa.",
  },
  "Bright Spring": {
    title: "Xuân Rực",
    summary: "Da sáng tươi, đường nét rõ. Hợp đỏ dưa hấu, hồng san hô tươi và các gam trong rõ sắc.",
  },
  "Light Summer": {
    title: "Hạ Sáng",
    summary: "Da sáng hồng nhẹ. Hợp hồng phấn sữa, hồng cánh khô dịu và nâu xám nhạt.",
  },
  "Cool Summer": {
    title: "Hạ Mát",
    summary: "Da thiên hồng lạnh. Hợp hồng đất lạnh, hồng dâu dịu và phấn mắt nâu khói nhẹ.",
  },
  "Soft Summer": {
    title: "Hạ Dịu",
    summary: "Da trung tính thiên lạnh, dịu mắt. Hợp hồng cánh khô, hồng mận nhạt và nâu xám dịu.",
  },
  "Warm Autumn": {
    title: "Thu Ấm",
    summary: "Da ấm ánh vàng mật. Hợp đỏ gạch sữa, cam đào đất và nâu quế ấm.",
  },
  "Soft Autumn": {
    title: "Thu Dịu",
    summary: "Da trung tính ấm nhẹ nhàng. Hợp hồng trà sữa, hồng đất ấm và cam đào đất dịu.",
  },
  "Deep Autumn": {
    title: "Thu Sâu",
    summary: "Da ngăm ấm có chiều sâu. Hợp đỏ gạch trầm, đỏ nâu đất và nâu cà phê.",
  },
  "Bright Winter": {
    title: "Đông Rực",
    summary: "Da tông lạnh sắc nét. Hợp đỏ dâu lạnh, đỏ lạnh sáng răng và hồng mâm xôi.",
  },
  "Cool Winter": {
    title: "Đông Mát",
    summary: "Da tông lạnh rõ nét. Hợp đỏ lạnh, đỏ hồng mận và nâu xám lạnh.",
  },
  "Deep Winter": {
    title: "Đông Sâu",
    summary: "Da lạnh đậm chiều sâu. Hợp đỏ rượu vang, đỏ mận chín và nâu cà phê lạnh.",
  },
};

export const SHAPE_VI_LABELS: Record<FaceShapeName, string> = {
  Oval: "Mặt Trái Xoan",
  Round: "Mặt Tròn",
  Square: "Mặt Vuông",
  Heart: "Mặt Trái Tim",
  Oblong: "Mặt Dài",
  Diamond: "Mặt Kim Cương",
};

export const UNDERTONE_VI_LABELS: Record<SeasonClassification["undertone"], string> = {
  "Warm (Golden)": "Tông Ấm (Ánh Vàng)",
  "Cool (Pink/Blue)": "Tông Lạnh (Ánh Hồng)",
  Neutral: "Tông Trung Tính",
};

export function translateItaCategory(category: string): string {
  if (category.includes("Very Light")) return "Da rất sáng";
  if (category.includes("Light")) return "Da sáng";
  if (category.includes("Intermediate")) return "Da sáng vừa";
  if (category.includes("Tan")) return "Da trung bình ấm";
  if (category.includes("Brown")) return "Da ngăm nâu";
  return "Da nâu sẫm";
}

export const PRODUCT_TYPE_VI_LABELS: Record<string, string> = {
  lipstick: "Son môi",
  blush: "Má hồng",
  eyeshadow: "Phấn mắt",
  foundation: "Kem nền / Cushion",
  contour: "Tạo khối",
  concealer: "Che khuyết điểm",
  glasses: "Gọng kính",
};

export const TEXTURE_VI_LABELS: Record<string, string> = {
  "Juicy Tint": "Son tint bóng",
  "Dewy Balm": "Son dưỡng có màu",
  "Blur Water Tint": "Tint mịn mờ",
  "Velvet Tint": "Son kem nhung",
  "Matte Lipstick": "Son thỏi lì",
  "Lip Clay / Mud": "Son bùn mờ viền",
  "Mirror Gloss": "Son bóng kính",
  "Water Stain": "Tint nước mỏng",
  "Powder Blush": "Phấn má lì mịn",
  "Baked Powder": "Phấn má nướng mịn",
  "Matte Powder": "Phấn lì mịn",
  "Cream Blush": "Má hồng kem",
  "Liquid Blush": "Má hồng lỏng",
  "Matte Eyeshadow": "Phấn mắt lì",
  "Satin Eyeshadow": "Phấn mắt nhũ mịn",
  "Multi Palette": "Bảng phối đa năng",
  "Cushion Glow": "Cushion căng bóng",
  "Cushion Matte": "Cushion kiềm dầu lì",
  "Cushion Semi-Matte": "Cushion bán lì",
  "Cushion Dewy": "Cushion ẩm mịn",
  "Cushion Velvet": "Cushion nhung mịn",
  "Liquid Matte": "Kem nền kiềm dầu",
  "Liquid Glow": "Kem nền căng bóng",
  "Liquid Concealer": "Che khuyết điểm lỏng",
  "Cream Concealer": "Che khuyết điểm kem",
  "Powder Contour": "Phấn tạo khối",
  "Loose Powder": "Phấn phủ bột kiềm dầu",
  "Pressed Powder": "Phấn phủ nén",
  "Baked Highlighter": "Bắt sáng mịn",
  "Powder Highlighter": "Phấn bắt sáng",
  "Jelly Powder": "Phấn thạch mịn",
  "Square Acetate": "Gọng vuông nhựa nhẹ",
  "Browline Metal": "Gọng nửa viền kim loại",
  "Round-Square Metal": "Gọng tròn vuông kim loại",
  "Hexagonal Metal": "Gọng đa giác kim loại",
  "Cat-Eye Metal": "Gọng mắt mèo kim loại",
  Browline: "Gọng nửa viền",
  "Square Ultem": "Gọng vuông siêu nhẹ",
  "Cat-Eye Acetate": "Gọng mắt mèo nhựa nhẹ",
};

export function translateMatchTier(tier: MatchedProduct["matchTier"]): string {
  if (tier === "Exact Match") return "Rất hợp với bạn";
  if (tier === "Great Match") return "Hợp tự nhiên";
  return "Gợi ý thêm";
}

export function describeCctVi(cct: number | null): string {
  if (cct === null) return "Giữ nguyên ánh sáng gốc";
  if (cct < 3400) return "Đèn vàng ấm";
  if (cct < 4700) return "Ánh sáng trong nhà";
  if (cct < 5800) return "Ánh sáng ban ngày nhẹ";
  if (cct < 7200) return "Ánh sáng tự nhiên";
  return "Ánh sáng trời râm / đèn trắng";
}
