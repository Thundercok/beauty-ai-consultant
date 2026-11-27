import { hexToLab } from "./bradfordCat";
import type { SeasonName } from "./types";

export type PriceTierId = "all" | "under_200k" | "mid_200_350k" | "luxury_350k_plus";

export interface ProductPriceEstimate {
  tier: Exclude<PriceTierId, "all">;
  tierLabel: string;
  priceRangeLabel: string;
  minK: number;
  maxK: number;
}

export interface VnStudentTraits {
  bareFaceFriendly: boolean;
  teethBrightening: boolean;
  badges: string[];
}

export interface VnShopSearchLinks {
  shopeeUrl: string;
  tiktokShopUrl: string;
  hasakiUrl: string;
  queryText: string;
}

export interface VnPlainSeasonSummary {
  plainTitle: string;
  shortTag: string;
  oneLiner: string;
  studentTip: string;
}

const UNDER_200K_BRANDS = new Set([
  "Romand",
  "Peripera",
  "Black Rouge",
  "Merzy",
  "Colorkey",
  "Judydoll",
  "The Saem",
  "BBIA",
  "Cỏ Mềm Homelab",
  "Into You",
  "Canmake",
  "Cezanne",
  "Innisfree",
  "Perfect Diary",
  "Pramy",
  "Luna",
  "Kissme",
  "L'Oreal",
]);

const MID_200_350K_BRANDS = new Set([
  "Lemonade",
  "OFÉLIA",
  "M.O.I Cosmetics",
  "Gilaa",
  "3CE",
  "Clio",
  "Too Cool For School",
  "TirTir",
  "Espoir",
  "d'Alba",
  "Maybelline",
]);

const LUXURY_BRANDS = new Set([
  "NARS",
  "Dior",
  "YSL",
  "Laneige",
  "MAC",
  "Rare Beauty",
  "Estee Lauder",
  "Clinique",
  "Jung Saem Mool",
  "Armani",
  "Shiseido",
  "Shu Uemura",
  "Laura Mercier",
  "Fenty Beauty",
  "Urban Decay",
  "Gentle Monster",
  "Ray-Ban",
  "Bolon",
  "Owndays",
]);

/**
 * Estimates realistic Vietnam retail pricing (Shopee Mall / Hasaki / official local stores)
 * in thousands of VND so students can filter by budget reliably.
 */
export function estimateProductPriceVn(
  brand: string,
  productType: string,
  productName = ""
): ProductPriceEstimate {
  const b = brand.trim();
  const t = productType.trim().toLowerCase();
  const nameLower = productName.toLowerCase();

  // Glasses always sit above 350k (even budget optical frames)
  if (t === "glasses") {
    if (b === "Gentle Monster" || b === "Ray-Ban") {
      return {
        tier: "luxury_350k_plus",
        tierLabel: "Trên 350k",
        priceRangeLabel: "~3.5tr – 6.5tr",
        minK: 3500,
        maxK: 6500,
      };
    }
    return {
      tier: "luxury_350k_plus",
      tierLabel: "Trên 350k",
      priceRangeLabel: "~1.2tr – 2.5tr",
      minK: 1200,
      maxK: 2500,
    };
  }

  // Explicitly luxury global brands
  if (LUXURY_BRANDS.has(b)) {
    if (b === "Dior" || b === "YSL" || b === "Armani" || b === "Estee Lauder") {
      return {
        tier: "luxury_350k_plus",
        tierLabel: "Trên 350k",
        priceRangeLabel: t === "lipstick" ? "~850k – 1.1tr" : "~1.1tr – 1.6tr",
        minK: t === "lipstick" ? 850 : 1100,
        maxK: t === "lipstick" ? 1100 : 1600,
      };
    }
    if (b === "NARS" || b === "MAC" || b === "Rare Beauty" || b === "Fenty Beauty" || b === "Laura Mercier") {
      return {
        tier: "luxury_350k_plus",
        tierLabel: "Trên 350k",
        priceRangeLabel: t === "lipstick" ? "~580k – 780k" : "~720k – 1.2tr",
        minK: t === "lipstick" ? 580 : 720,
        maxK: t === "lipstick" ? 780 : 1200,
      };
    }
    return {
      tier: "luxury_350k_plus",
      tierLabel: "Trên 350k",
      priceRangeLabel: t === "lipstick" ? "~480k – 680k" : "~620k – 980k",
      minK: t === "lipstick" ? 480 : 620,
      maxK: t === "lipstick" ? 680 : 980,
    };
  }

  // Specific Maybelline / Romand / Clio product-type price differences in Vietnam
  if (b === "Maybelline") {
    if (t === "lipstick" || t === "concealer") {
      return {
        tier: "under_200k",
        tierLabel: "Dưới 200k",
        priceRangeLabel: "~155k – 195k",
        minK: 155,
        maxK: 195,
      };
    }
    return {
      tier: "mid_200_350k",
      tierLabel: "200k – 350k",
      priceRangeLabel: "~215k – 295k",
      minK: 215,
      maxK: 295,
    };
  }

  if (b === "Romand") {
    if (t === "foundation" || t === "eyeshadow" || nameLower.includes("cushion") || nameLower.includes("palette")) {
      return {
        tier: "mid_200_350k",
        tierLabel: "200k – 350k",
        priceRangeLabel: "~260k – 340k",
        minK: 260,
        maxK: 340,
      };
    }
    return {
      tier: "under_200k",
      tierLabel: "Dưới 200k",
      priceRangeLabel: "~145k – 190k",
      minK: 145,
      maxK: 190,
    };
  }

  if (b === "Clio" || b === "Espoir") {
    if (t === "foundation" || nameLower.includes("cushion")) {
      return {
        tier: "luxury_350k_plus",
        tierLabel: "Trên 350k",
        priceRangeLabel: "~390k – 490k",
        minK: 390,
        maxK: 490,
      };
    }
    return {
      tier: "mid_200_350k",
      tierLabel: "200k – 350k",
      priceRangeLabel: "~245k – 335k",
      minK: 245,
      maxK: 335,
    };
  }

  if (UNDER_200K_BRANDS.has(b)) {
    if (b === "The Saem" || b === "Cỏ Mềm Homelab") {
      return {
        tier: "under_200k",
        tierLabel: "Dưới 200k",
        priceRangeLabel: "~105k – 175k",
        minK: 105,
        maxK: 175,
      };
    }
    if (b === "Black Rouge" || b === "Merzy" || b === "Colorkey" || b === "Judydoll") {
      return {
        tier: "under_200k",
        tierLabel: "Dưới 200k",
        priceRangeLabel: "~125k – 185k",
        minK: 125,
        maxK: 185,
      };
    }
    return {
      tier: "under_200k",
      tierLabel: "Dưới 200k",
      priceRangeLabel: "~135k – 195k",
      minK: 135,
      maxK: 195,
    };
  }

  if (MID_200_350K_BRANDS.has(b)) {
    if (b === "Lemonade" || b === "OFÉLIA" || b === "Gilaa" || b === "M.O.I Cosmetics") {
      return {
        tier: "mid_200_350k",
        tierLabel: "200k – 350k",
        priceRangeLabel: t === "foundation" ? "~290k – 350k" : "~210k – 295k",
        minK: t === "foundation" ? 290 : 210,
        maxK: t === "foundation" ? 350 : 295,
      };
    }
    return {
      tier: "mid_200_350k",
      tierLabel: "200k – 350k",
      priceRangeLabel: "~230k – 340k",
      minK: 230,
      maxK: 340,
    };
  }

  return {
    tier: "mid_200_350k",
    tierLabel: "200k – 350k",
    priceRangeLabel: "~220k – 320k",
    minK: 220,
    maxK: 320,
  };
}

const SHEER_BAREFACE_TEXTURES = new Set([
  "Juicy Tint",
  "Dewy Balm",
  "Blur Water Tint",
  "Water Stain",
  "Mirror Gloss",
  "Cream Blush",
  "Liquid Blush",
  "Powder Blush",
  "Baked Powder",
  "Cushion Glow",
  "Cushion Dewy",
  "Cushion Semi-Matte",
]);

/**
 * Evaluates Vietnamese college-student beauty priorities directly from colorimetry + texture:
 * 1) "Hợp mặt mộc đi học": natural wearable MLBB / sheer shades that brighten bare faces
 *    without looking heavy, ghostly pale, or garishly neon.
 * 2) "Sáng răng · Không xỉn da": lip colors with clean red/berry/brick pigment balance
 *    (avoiding yellow-heavy orange or chalky pastel tones that yellow teeth).
 */
export function evaluateVnStudentTraits(input: {
  productType: string;
  texture: string;
  hex: string;
  renderedHex?: string;
  deltaE?: number;
}): VnStudentTraits {
  const effectiveHex = input.renderedHex ?? input.hex;
  const [L, a, b] = hexToLab(effectiveHex);
  const chroma = Math.hypot(a, b);
  const t = input.productType.toLowerCase();

  let bareFaceFriendly = false;
  let teethBrightening = false;

  if (t === "lipstick") {
    const isSheerTexture = SHEER_BAREFACE_TEXTURES.has(input.texture);
    // Natural MLBB / rosy / soft brick-coral range: neither goth-dark nor chalky pale nor neon
    const isNaturalDepth = L >= 36 && L <= 68;
    const isBalancedChroma = chroma >= 14 && chroma <= 52 && b <= 32;
    const isGoodMatch = input.deltaE === undefined || input.deltaE <= 14;
    bareFaceFriendly =
      isNaturalDepth && isBalancedChroma && isGoodMatch && (isSheerTexture || (L >= 40 && L <= 60));

    // Teeth brightening: red/berry/clean-brick shades with clear redness (a* >= 24),
    // controlled yellowness relative to redness (b* <= a* * 0.62 and b* <= 24), and crisp contrast (L* <= 56)
    teethBrightening = a >= 24 && L >= 24 && L <= 56 && b <= 24 && b <= a * 0.62;
  } else if (t === "blush") {
    // Soft translucent East-Asian blush (peach milk, soft baby pink, muted rose)
    bareFaceFriendly = L >= 54 && L <= 82 && chroma >= 12 && chroma <= 42;
    teethBrightening = false;
  } else if (t === "foundation") {
    bareFaceFriendly =
      input.texture.includes("Cushion") || input.texture.includes("Glow") || input.texture.includes("Semi-Matte");
  } else if (t === "eyeshadow") {
    bareFaceFriendly = L >= 46 && L <= 78 && chroma <= 26;
  }

  const badges: string[] = [];
  if (bareFaceFriendly) badges.push("Hợp mặt mộc đi học");
  if (teethBrightening) badges.push("Sáng răng · Không xỉn da");

  return {
    bareFaceFriendly,
    teethBrightening,
    badges,
  };
}

/**
 * Generates safe external search URLs for popular Vietnamese shopping platforms.
 * Intended for standard <a target="_blank" rel="noopener noreferrer"> links (no window.open).
 */
export function buildVnShopLinks(
  brand: string,
  productName: string,
  shadeName?: string
): VnShopSearchLinks {
  const parts = [brand.trim(), productName.trim(), shadeName?.trim() ?? ""].filter(Boolean);
  const queryText = parts.join(" ");
  const encoded = encodeURIComponent(queryText);

  return {
    shopeeUrl: `https://shopee.vn/search?keyword=${encoded}`,
    tiktokShopUrl: `https://www.tiktok.com/search?q=${encoded}`,
    hasakiUrl: `https://hasaki.vn/catalogsearch/result/?q=${encoded}`,
    queryText,
  };
}

/**
 * Natural, jargon-free Vietnamese summaries written specifically for Vietnamese Gen-Z /
 * college students (no Western bronzer/heavy-contour language, no raw hex codes).
 */
export const VN_SEASON_PLAIN_GUIDE: Record<SeasonName, VnPlainSeasonSummary> = {
  "Light Spring": {
    plainTitle: "Da sáng tông ấm trong trẻo",
    shortTag: "Xuân Sáng",
    oneLiner:
      "Da bạn hợp nhất với những gam đào sữa, hồng san hô trong và son tint bóng mỏng nhẹ giúp mặt tươi tắn ngay cả khi để mặt mộc đi học.",
    studentTip: "Ưu tiên kem chống nắng nâng tông nhẹ + son tint bóng lòng môi cam đào là đủ rạng rỡ cả ngày.",
  },
  "Warm Spring": {
    plainTitle: "Da sáng ấm rạng rỡ",
    shortTag: "Xuân Ấm",
    oneLiner:
      "Làn da ánh vàng ấm rất bắt sáng với đỏ san hô, cam đào tươi và phấn mắt nâu trà sữa — tránh son hồng cánh sen lạnh dễ làm da bị tái.",
    studentTip: "Đánh lòng môi đỏ san hô hoặc hồng đào ấm kết hợp má đào phớt ngang giúp mặt tươi và trẻ hơn rõ.",
  },
  "Bright Spring": {
    plainTitle: "Da sáng tươi, hợp màu trong rõ nét",
    shortTag: "Xuân Rực",
    oneLiner:
      "Gương mặt bạn nổi bật nhất với những màu son trong, tươi như đỏ dưa hấu, hồng san hô rõ sắc — tránh các màu đất quá đục làm mặt kém tươi.",
    studentTip: "Chỉ cần son bóng kính màu đỏ dâu ấm hoặc san hô tươi là gương mặt sáng bừng mà không cần kẻ mắt cầu kỳ.",
  },
  "Light Summer": {
    plainTitle: "Da sáng tông lạnh dịu nhẹ",
    shortTag: "Hạ Sáng",
    oneLiner:
      "Da bạn hợp kiểu trang điểm trong veo Hàn Quốc với hồng phấn sữa, hồng cánh khô dịu và phấn mắt nâu xám nhạt.",
    studentTip: "Đi học để mặt mộc quẹt nhẹ son dưỡng hoặc tint bóng màu hồng sữa/hồng đào lạnh cực kỳ tự nhiên.",
  },
  "Cool Summer": {
    plainTitle: "Da tông lạnh ánh hồng thanh thoát",
    shortTag: "Hạ Mát",
    oneLiner:
      "Bạn hợp các gam hồng đất lạnh, hồng dâu dịu và đỏ mận nhẹ giúp da sáng hẳn và răng trắng hơn — nên tránh cam cháy hoặc nâu cam gắt.",
    studentTip: "Chọn má hồng phấn lạnh tán nhẹ dưới bọng mắt và son hồng đất lạnh sẽ rất trong trẻo và tôn da.",
  },
  "Soft Summer": {
    plainTitle: "Da trung tính thiên lạnh dịu mắt",
    shortTag: "Hạ Dịu",
    oneLiner:
      "Sắc da nhẹ nhàng hợp nhất với hồng cánh khô, hồng đất trầm dịu và phấn mắt nâu khói nhạt — tránh màu quá chói làm lấn át đường nét.",
    studentTip: "Son kem nhung hoặc tint mịn mờ màu hồng cánh khô tán mờ viền môi là lựa chọn an toàn nhất khi đi học.",
  },
  "Warm Autumn": {
    plainTitle: "Da ấm ánh mật ong tự nhiên",
    shortTag: "Thu Ấm",
    oneLiner:
      "Da bạn cực kỳ tôn sắc với đỏ gạch, đỏ cam đất và má hồng đào đất — tránh hồng phấn quá lạnh hoặc tím sữa dễ làm da xỉn màu.",
    studentTip: "Son đỏ gạch sữa hoặc hồng đất ấm đánh lòng môi vừa hợp mặt mộc vừa giúp gương mặt có sức sống cả ngày.",
  },
  "Soft Autumn": {
    plainTitle: "Da trung tính ấm nhẹ nhàng",
    shortTag: "Thu Dịu",
    oneLiner:
      "Gam hồng đất ấm, cam đào đất và nâu trà sữa giúp da trông mịn màng, tự nhiên hơn hẳn — tránh son màu neon hoặc quá tối.",
    studentTip: "Kiểu trang điểm tối giản với cushion bán lì kiềm dầu và son hồng trà sữa rất hợp phong cách đi học hằng ngày.",
  },
  "Deep Autumn": {
    plainTitle: "Da ngăm ấm khỏe khoắn, có chiều sâu",
    shortTag: "Thu Sâu",
    oneLiner:
      "Làn da ấm sâu cực kỳ cuốn hút với đỏ nâu đất, đỏ gạch trầm và nâu cà phê — tránh các màu hồng phấn quá nhạt làm lộ viền môi và xỉn da.",
    studentTip: "Son đỏ nâu hoặc đỏ gạch tán mờ viền vừa giúp răng trắng sáng rõ rệt vừa hợp da ngăm tự nhiên của người Việt.",
  },
  "Bright Winter": {
    plainTitle: "Da tông lạnh sắc nét, hợp màu tươi",
    shortTag: "Đông Rực",
    oneLiner:
      "Gương mặt bạn rất sáng và nổi bật với đỏ dâu lạnh, đỏ lạnh tươi và hồng mâm xôi — tránh son cam đất mờ hoặc vàng be dễ làm da trông mệt mỏi.",
    studentTip: "Chỉ cần một lớp son tint bóng đỏ dâu hoặc đỏ lạnh tán lòng môi là da bật tông và răng trắng sáng hẳn lên.",
  },
  "Cool Winter": {
    plainTitle: "Da tông lạnh rõ nét, sáng bật tông",
    shortTag: "Đông Mát",
    oneLiner:
      "Bạn cực kỳ hợp đỏ lạnh, đỏ hồng mận và má hồng lạnh phớt nhẹ giúp da trông trắng hồng tự nhiên — nên tránh cam cháy và vàng nâu.",
    studentTip: "Son đỏ lạnh hoặc hồng dâu lạnh đánh mỏng lòng môi cực hợp mặt mộc đi học và làm răng sáng rất rõ.",
  },
  "Deep Winter": {
    plainTitle: "Da lạnh có chiều sâu, đường nét rõ",
    shortTag: "Đông Sâu",
    oneLiner:
      "Sắc da tương phản rõ hợp nhất với đỏ rượu vang, đỏ mận lạnh và nâu xám lạnh — tránh các màu cam đào nhạt hoặc hồng phấn bợt.",
    studentTip: "Đi học tán thật mỏng son đỏ mận/đỏ rượu ở lòng môi sẽ ra hiệu ứng hồng dâu tự nhiên mà cực kỳ tôn da.",
  },
};
