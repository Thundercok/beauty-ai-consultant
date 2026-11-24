import type { FaceShapeName, MatchedProduct, SeasonClassification, SeasonName } from "./types";

export const SEASON_VI_LABELS: Record<SeasonName, { title: string; summary: string }> = {
  "Light Spring": {
    title: "Xuân Sáng (Light Spring)",
    summary: "Da sáng, sắc ấm nhẹ. Hợp san hô hồng, cam đào tươi và nâu mật ong nhạt.",
  },
  "Warm Spring": {
    title: "Xuân Ấm (Warm Spring)",
    summary: "Da thiên vàng ấm rõ. Hợp đỏ san hô, cam đào ấm và vàng champagne.",
  },
  "Bright Spring": {
    title: "Xuân Rực (Bright Spring)",
    summary: "Da sáng tươi, độ tương phản cao. Hợp hồng dưa hấu, cam tươi và tông sạch rõ nét.",
  },
  "Light Summer": {
    title: "Hạ Sáng (Light Summer)",
    summary: "Da sáng hồng nhẹ. Hợp hồng cánh sen dịu, baby pink và taupe sáng.",
  },
  "Cool Summer": {
    title: "Hạ Mát (Cool Summer)",
    summary: "Da thiên hồng/lạnh. Hợp hồng mauve, hồng đất lạnh và khói tím dịu.",
  },
  "Soft Summer": {
    title: "Hạ Dịu (Soft Summer)",
    summary: "Da trung tính thiên lạnh, độ bão hòa dịu. Hợp hồng mận khô, dusty rose.",
  },
  "Warm Autumn": {
    title: "Thu Ấm (Warm Autumn)",
    summary: "Da ấm ánh vàng mật. Hợp đỏ gạch, cam đất terracotta và nâu đồng ấm.",
  },
  "Soft Autumn": {
    title: "Thu Dịu (Soft Autumn)",
    summary: "Da trung tính ấm nhẹ nhàng. Hợp nude rose trầm, cam đào đất dịu.",
  },
  "Deep Autumn": {
    title: "Thu Sâu (Deep Autumn)",
    summary: "Da trầm ấm có chiều sâu. Hợp đỏ gạch trầm, nâu quế và espresso.",
  },
  "Bright Winter": {
    title: "Đông Rực (Bright Winter)",
    summary: "Da tương phản sắc nét, undertone lạnh. Hợp đỏ berry trong, hồng mâm xôi.",
  },
  "Cool Winter": {
    title: "Đông Mát (Cool Winter)",
    summary: "Da lạnh rõ nét. Hợp đỏ ruby lạnh, cranberry và xám khói lạnh.",
  },
  "Deep Winter": {
    title: "Đông Sâu (Deep Winter)",
    summary: "Da sắc lạnh đậm chiều sâu. Hợp đỏ rượu vang, mận chín và nâu lạnh.",
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
  "Lip Clay / Mud": "Son bùn che phủ cao",
  "Mirror Gloss": "Son bóng gương",
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
  "Liquid Matte": "Kem nền lì",
  "Liquid Glow": "Kem nền căng bóng",
  "Liquid Concealer": "Che khuyết điểm lỏng",
  "Cream Concealer": "Che khuyết điểm kem",
  "Powder Contour": "Phấn tạo khối",
  "Loose Powder": "Phấn phủ bột",
  "Pressed Powder": "Phấn phủ nén",
  "Baked Highlighter": "Bắt sáng nướng",
  "Powder Highlighter": "Phấn bắt sáng",
  "Jelly Powder": "Phấn thạch mịn",
  "Square Acetate": "Gọng vuông Acetate",
  "Browline Metal": "Gọng nửa viền kim loại",
  "Round-Square Metal": "Gọng tròn vuông kim loại",
  "Hexagonal Metal": "Gọng đa giác kim loại",
  "Cat-Eye Metal": "Gọng mắt mèo kim loại",
  Browline: "Gọng nửa viền",
  "Square Ultem": "Gọng vuông nhẹ Ultem",
  "Cat-Eye Acetate": "Gọng mắt mèo Acetate",
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
