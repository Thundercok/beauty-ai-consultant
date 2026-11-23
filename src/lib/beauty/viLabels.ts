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
  if (category.includes("Very Light")) return "Da rất sáng (Loại I)";
  if (category.includes("Light")) return "Da sáng (Loại II)";
  if (category.includes("Intermediate")) return "Da sáng vừa (Loại III)";
  if (category.includes("Tan")) return "Da trung bình ấm / ngăm nhẹ (Loại IV)";
  if (category.includes("Brown")) return "Da ngăm nâu (Loại V)";
  return "Da nâu sẫm (Loại VI)";
}

export function translateMatchTier(tier: MatchedProduct["matchTier"]): string {
  if (tier === "Exact Match") return "Chuẩn màu nhất";
  if (tier === "Great Match") return "Rất hợp";
  return "Gợi ý gần hợp";
}

export function describeCctVi(cct: number | null): string {
  if (cct === null) return "Chưa bật cân bằng ánh sáng";
  if (cct < 3400) return "Đèn vàng ấm (nhà hàng / phòng ngủ)";
  if (cct < 4700) return "Ánh sáng trung tính trong nhà";
  if (cct < 5800) return "Ánh sáng ban ngày nhẹ";
  if (cct < 7200) return "Ánh sáng tự nhiên chuẩn (D65)";
  return "Ánh sáng trời râm / đèn trắng lạnh";
}
