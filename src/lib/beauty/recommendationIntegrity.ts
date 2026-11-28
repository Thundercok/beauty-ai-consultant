import type { AnalysisConfidenceResult } from "./analysisConfidence";
import type { AnalysisValidity } from "./analysisValidity";
import type {
  CatalogProduct,
  MatchedProduct,
  SeasonClassification,
  SeasonName,
} from "./types";

export type RecommendationStatus =
  | "personalized"
  | "caution"
  | "browse_only"
  | "unavailable";

export type EligibilityReasonCode =
  | "NO_ANALYSIS"
  | "INVALID_ANALYSIS"
  | "INSUFFICIENT_SKIN_EVIDENCE"
  | "LOW_ANALYSIS_QUALITY"
  | "MISSING_TARGET_COLOR"
  | "INVALID_PRODUCT_COLOR"
  | "EMPTY_CATALOG";

export interface RecommendationEligibility {
  status: RecommendationStatus;
  canBrowseCatalog: boolean;
  canComputeColorSimilarity: boolean;
  canPersonalize: boolean;
  reasonCodes: EligibilityReasonCode[];
  bannerTitleVi: string | null;
  bannerMessageVi: string | null;
}

export type CompatibilityState = "match" | "mismatch" | "unknown";

export interface ProductCompatibilityBreakdown {
  colorSimilarityAvailable: boolean;
  undertoneCompatibility: CompatibilityState;
  seasonCompatibility: CompatibilityState;
  undertoneLabelVi: string;
  seasonLabelVi: string;
}

export interface CatalogRecordValidation {
  productId: number;
  validForBrowse: boolean;
  validForColorMatch: boolean;
  errors: string[];
  warnings: string[];
}

export interface CatalogValidationSummary {
  totalRecords: number;
  validForBrowseCount: number;
  validForColorMatchCount: number;
  errorCount: number;
  warningCount: number;
  duplicateKeys: string[];
  invalidHexIds: number[];
  records: CatalogRecordValidation[];
}

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** Strict validation for 6-digit sRGB hex codes used in CIELAB / CIEDE2000 calculations. */
export function isValidHexColor(hex: string | null | undefined): hex is string {
  return typeof hex === "string" && HEX_COLOR_RE.test(hex.trim());
}

/**
 * Validates a single catalog row, distinguishing hard errors (which exclude the row
 * from color matching) from commercial/provenance warnings (which still allow browsing).
 */
export function validateCatalogRecord(product: CatalogProduct): CatalogRecordValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!product.brand || !product.brand.trim()) {
    errors.push("MISSING_BRAND");
  }
  if (!product.product_name || !product.product_name.trim()) {
    errors.push("MISSING_PRODUCT_NAME");
  }
  if (!product.product_type || !product.product_type.trim()) {
    errors.push("MISSING_PRODUCT_TYPE");
  }
  if (!isValidHexColor(product.hex_color)) {
    errors.push("INVALID_PRODUCT_COLOR");
  }

  if (!product.undertone || !product.undertone.trim()) {
    warnings.push("UNKNOWN_UNDERTONE");
  }
  if (!product.best_seasons || !product.best_seasons.trim()) {
    warnings.push("UNKNOWN_BEST_SEASONS");
  }
  if (!product.texture_type || !product.texture_type.trim()) {
    warnings.push("UNKNOWN_TEXTURE");
  }

  const validForBrowse = Boolean(
    product.brand?.trim() && product.product_name?.trim() && product.product_type?.trim()
  );
  const validForColorMatch = validForBrowse && isValidHexColor(product.hex_color);

  return {
    productId: product.id,
    validForBrowse,
    validForColorMatch,
    errors,
    warnings,
  };
}

/** Repeatable catalog integrity validator separating hard errors, duplicates, and warnings. */
export function validateCatalog(products: CatalogProduct[]): CatalogValidationSummary {
  const seenKeys = new Set<string>();
  const duplicateKeys: string[] = [];
  const invalidHexIds: number[] = [];
  const records: CatalogRecordValidation[] = [];

  let validForBrowseCount = 0;
  let validForColorMatchCount = 0;
  let errorCount = 0;
  let warningCount = 0;

  for (const product of products) {
    const rec = validateCatalogRecord(product);
    const key = [
      product.brand.trim().toLowerCase(),
      product.product_name.trim().toLowerCase(),
      product.shade_name.trim().toLowerCase(),
      product.product_type.trim().toLowerCase(),
    ].join("|");

    if (seenKeys.has(key)) {
      duplicateKeys.push(key);
      rec.warnings.push("DUPLICATE_PRODUCT_SHADE");
    } else {
      seenKeys.add(key);
    }

    if (!isValidHexColor(product.hex_color)) {
      invalidHexIds.push(product.id);
    }
    if (rec.validForBrowse) validForBrowseCount += 1;
    if (rec.validForColorMatch) validForColorMatchCount += 1;
    errorCount += rec.errors.length;
    warningCount += rec.warnings.length;
    records.push(rec);
  }

  return {
    totalRecords: products.length,
    validForBrowseCount,
    validForColorMatchCount,
    errorCount,
    warningCount,
    duplicateKeys,
    invalidHexIds,
    records,
  };
}

/**
 * Converts a raw CatalogProduct into an unpersonalized browse item with explicit null
 * color-match fields so guest browsing and saved-item inspection never fabricate scores.
 */
export function catalogProductToBrowseItem(product: CatalogProduct): MatchedProduct {
  return {
    id: product.id,
    brand: product.brand,
    name: product.product_name,
    shade: product.shade_name,
    productType: product.product_type,
    texture: product.texture_type || "Standard",
    hex: isValidHexColor(product.hex_color) ? product.hex_color : "#D4D4D4",
    deltaE: null,
    matchTier: null,
    isPersonalized: false,
    similarityBasis: "catalog_browse_only",
    undertone: product.undertone,
    bestSeasons: product.best_seasons,
  };
}

export interface RecommendationEligibilityInput {
  catalogCount: number;
  hasAnalysis: boolean;
  analysisValidity?: AnalysisValidity | null;
  confidence?: Pick<AnalysisConfidenceResult, "score" | "level" | "label"> | null;
  targetHex?: string | null;
}

/**
 * Centralized recommendation eligibility gate distinguishing catalog browsing,
 * personalized color matching, caution-mode matching, and unavailable states.
 */
export function evaluateRecommendationEligibility(
  input: RecommendationEligibilityInput
): RecommendationEligibility {
  const reasonCodes: EligibilityReasonCode[] = [];

  if (input.catalogCount <= 0) {
    reasonCodes.push("EMPTY_CATALOG");
    return {
      status: "unavailable",
      canBrowseCatalog: false,
      canComputeColorSimilarity: false,
      canPersonalize: false,
      reasonCodes,
      bannerTitleVi: "Chưa tải được danh mục sản phẩm",
      bannerMessageVi: "Danh mục mỹ phẩm hiện đang trống. Hãy thử tải lại trang.",
    };
  }

  if (!input.hasAnalysis) {
    reasonCodes.push("NO_ANALYSIS");
    return {
      status: "browse_only",
      canBrowseCatalog: true,
      canComputeColorSimilarity: false,
      canPersonalize: false,
      reasonCodes,
      bannerTitleVi: null,
      bannerMessageVi: null,
    };
  }

  if (input.analysisValidity?.status === "reject") {
    reasonCodes.push(
      input.analysisValidity.reason === "no_skin"
        ? "INSUFFICIENT_SKIN_EVIDENCE"
        : "INVALID_ANALYSIS"
    );
    return {
      status: "unavailable",
      canBrowseCatalog: true,
      canComputeColorSimilarity: false,
      canPersonalize: false,
      reasonCodes,
      bannerTitleVi: "Chưa đủ dữ liệu khuôn mặt để xếp hạng màu",
      bannerMessageVi:
        input.analysisValidity.message ??
        "Ảnh hiện tại chưa đủ điều kiện đo sắc da. Bạn vẫn có thể xem toàn bộ danh mục bên dưới.",
    };
  }

  if (input.targetHex !== undefined && !isValidHexColor(input.targetHex)) {
    reasonCodes.push("MISSING_TARGET_COLOR");
    return {
      status: "unavailable",
      canBrowseCatalog: true,
      canComputeColorSimilarity: false,
      canPersonalize: false,
      reasonCodes,
      bannerTitleVi: "Thiếu màu mục tiêu để so khớp",
      bannerMessageVi: "Hãy thử phân tích lại ảnh để hệ thống tính lại nhóm màu chuẩn.",
    };
  }

  const hasWarningValidity = input.analysisValidity?.status === "warn";
  const isLowConfidence = input.confidence?.level === "low";

  if (hasWarningValidity || isLowConfidence) {
    if (input.analysisValidity?.reason === "few_skin_pixels") {
      reasonCodes.push("INSUFFICIENT_SKIN_EVIDENCE");
    }
    reasonCodes.push("LOW_ANALYSIS_QUALITY");
    return {
      status: "caution",
      canBrowseCatalog: true,
      canComputeColorSimilarity: true,
      canPersonalize: true,
      reasonCodes,
      bannerTitleVi: "Kết quả xếp hạng mang tính tham khảo",
      bannerMessageVi:
        input.analysisValidity?.message ??
        "Ánh sáng hoặc vùng da trong ảnh chưa lý tưởng nên độ khớp màu có thể sai lệch. Nên chụp lại gần cửa sổ ban ngày.",
    };
  }

  return {
    status: "personalized",
    canBrowseCatalog: true,
    canComputeColorSimilarity: true,
    canPersonalize: true,
    reasonCodes: [],
    bannerTitleVi: null,
    bannerMessageVi: null,
  };
}

function normalizeUndertoneBucket(raw: string | null | undefined): "warm" | "cool" | "neutral" | "unknown" {
  if (!raw || !raw.trim()) return "unknown";
  const u = raw.toLowerCase();
  if (u.includes("neutral") || u.includes("trung") || u.includes("all")) return "neutral";
  if (u.includes("warm") || u.includes("ấm") || u.includes("golden")) return "warm";
  if (u.includes("cool") || u.includes("lạnh") || u.includes("pink")) return "cool";
  return "unknown";
}

/**
 * Evaluates undertone and seasonal compatibility separately from CIEDE2000 color distance.
 * Missing product metadata stays explicitly "unknown" — never silently marked compatible.
 */
export function evaluateProductCompatibility(
  product: Pick<MatchedProduct, "undertone" | "bestSeasons" | "deltaE" | "isPersonalized">,
  userSeason: SeasonName | null,
  userUndertone: SeasonClassification["undertone"] | null
): ProductCompatibilityBreakdown {
  const colorSimilarityAvailable = Boolean(
    product.isPersonalized !== false &&
      typeof product.deltaE === "number" &&
      Number.isFinite(product.deltaE)
  );

  // 1. Undertone dimension
  const prodTone = normalizeUndertoneBucket(product.undertone);
  const userTone = normalizeUndertoneBucket(userUndertone);
  let undertoneCompatibility: CompatibilityState = "unknown";
  let undertoneLabelVi = "Chưa có dữ liệu tông";

  if (prodTone !== "unknown" && userTone !== "unknown") {
    if (prodTone === userTone || prodTone === "neutral" || userTone === "neutral") {
      undertoneCompatibility = "match";
      undertoneLabelVi = "Cùng hướng tông da";
    } else {
      undertoneCompatibility = "mismatch";
      undertoneLabelVi = "Khác tông da chính";
    }
  } else if (prodTone !== "unknown") {
    undertoneLabelVi = product.undertone;
  }

  // 2. Seasonal palette dimension
  const seasonsRaw = (product.bestSeasons ?? "").trim();
  let seasonCompatibility: CompatibilityState = "unknown";
  let seasonLabelVi = "Chưa rõ nhóm mùa";

  if (seasonsRaw && userSeason) {
    if (seasonsRaw.toLowerCase() === "all seasons") {
      seasonCompatibility = "match";
      seasonLabelVi = "Dễ dùng cho nhiều mùa";
    } else {
      const list = seasonsRaw.split(",").map((s) => s.trim().toLowerCase());
      if (list.includes(userSeason.toLowerCase())) {
        seasonCompatibility = "match";
        seasonLabelVi = "Khớp mùa màu của bạn";
      } else {
        seasonCompatibility = "mismatch";
        seasonLabelVi = "Thuộc nhóm mùa khác";
      }
    }
  } else if (seasonsRaw) {
    seasonLabelVi = seasonsRaw;
  }

  return {
    colorSimilarityAvailable,
    undertoneCompatibility,
    seasonCompatibility,
    undertoneLabelVi,
    seasonLabelVi,
  };
}

export interface ProductDataProvenance {
  dataSource: "bundled_csv_catalog";
  colorSource: "catalog_csv_hex" | "invalid_hex";
  colorSourceLabelVi: string;
  imageSource: "swatch_only";
  priceSource: "estimated_vn_tier";
  priceStatusLabelVi: string;
  availabilityStatus: "unverified_search_link";
  availabilityLabelVi: string;
  verificationStatus: "unverified_commercial";
  verifiedAt: null;
  missingFieldsVi: string[];
}

/**
 * Explicit data-quality and provenance record for a catalog item.
 * Prevents UI layers from implying verified live pricing, stock, or official SKU URLs.
 */
export function getProductDataProvenance(
  product: Pick<MatchedProduct, "hex" | "undertone" | "bestSeasons" | "texture">
): ProductDataProvenance {
  const validHex = isValidHexColor(product.hex);
  const missingFieldsVi: string[] = [
    "Giá bán trực tiếp từ nhà bán lẻ",
    "Tình trạng tồn kho thời gian thực",
    "Ảnh sản phẩm chính thức",
  ];
  if (!product.undertone || !product.undertone.trim()) {
    missingFieldsVi.push("Thông tin tông màu (undertone)");
  }
  if (!product.bestSeasons || !product.bestSeasons.trim()) {
    missingFieldsVi.push("Nhóm mùa gợi ý");
  }
  if (!product.texture || !product.texture.trim() || product.texture === "Standard") {
    missingFieldsVi.push("Chất liệu / kết cấu chi tiết");
  }

  return {
    dataSource: "bundled_csv_catalog",
    colorSource: validHex ? "catalog_csv_hex" : "invalid_hex",
    colorSourceLabelVi: validHex
      ? "Mã màu tĩnh từ danh mục sản phẩm (chưa đo quang phổ thực tế)"
      : "Mã màu không hợp lệ",
    imageSource: "swatch_only",
    priceSource: "estimated_vn_tier",
    priceStatusLabelVi: "Giá ước tính theo phân khúc phổ biến tại VN (chưa đồng bộ sàn)",
    availabilityStatus: "unverified_search_link",
    availabilityLabelVi: "Liên kết tìm kiếm từ khóa — chưa xác thực còn hàng hay gian hàng chính hãng",
    verificationStatus: "unverified_commercial",
    verifiedAt: null,
    missingFieldsVi,
  };
}

export interface RecommendationTransparency {
  mode: "personalized" | "caution" | "catalog_browse";
  modeLabelVi: string;
  whyRecommendedVi: string;
  signalsUsedVi: string[];
  limitationsVi: string[];
  provenanceSummaryVi: string;
}

/**
 * Builds plain-language Vietnamese transparency notes explaining why a product appears,
 * which signals influenced it, and where HEX-based color similarity ends.
 */
export function buildRecommendationTransparency(input: {
  product: Pick<
    MatchedProduct,
    "productType" | "hex" | "renderedHex" | "deltaE" | "isPersonalized" | "undertone" | "bestSeasons" | "texture"
  >;
  userSeason: SeasonName | null;
  userUndertone: SeasonClassification["undertone"] | null;
  isCaution?: boolean;
}): RecommendationTransparency {
  const { product, userSeason, userUndertone, isCaution = false } = input;
  const hasScore = Boolean(
    product.isPersonalized !== false &&
      typeof product.deltaE === "number" &&
      Number.isFinite(product.deltaE) &&
      userSeason
  );
  const provenance = getProductDataProvenance(product);
  const isLip = product.productType === "lipstick";

  const mode = !hasScore ? "catalog_browse" : isCaution ? "caution" : "personalized";
  const modeLabelVi =
    mode === "personalized"
      ? "Gợi ý theo ảnh vừa đo"
      : mode === "caution"
        ? "Gợi ý tham khảo (độ rõ ảnh thấp)"
        : "Danh mục chung (chưa cá nhân hóa)";

  const signalsUsedVi: string[] = [];
  if (hasScore) {
    signalsUsedVi.push(
      isLip && product.renderedHex
        ? "Độ gần màu CIEDE2000 giữa sắc son ước lượng trên nền môi mộc và màu mục tiêu từ ảnh"
        : "Độ gần màu CIEDE2000 giữa mã màu danh mục và bảng màu gợi ý từ ảnh"
    );
    if (userUndertone) {
      signalsUsedVi.push("Đối chiếu hướng tông da ước lượng từ ảnh");
    }
  } else {
    signalsUsedVi.push("Thông tin phân loại danh mục tĩnh (hãng, dòng sản phẩm, tông màu)");
  }

  const whyRecommendedVi = hasScore
    ? isLip
      ? "Xếp hạng dựa trên độ gần màu giữa sắc son mô phỏng trên nền môi trong ảnh và nhóm màu gợi ý. Đây là thước đo khoảng cách màu sắc, không phải xác suất chắc chắn hợp trên mọi làn da."
      : "Xếp hạng dựa trên độ gần màu giữa mã màu danh mục và nhóm màu từ ảnh hiện tại. Đây là độ tương đồng màu sắc tham khảo, không thay thế việc thử trực tiếp."
    : "Đang hiển thị từ danh mục chung vì chưa có kết quả đo sắc da hợp lệ cho sản phẩm này.";

  const limitationsVi: string[] = [
    "Ánh sáng chụp, tự động cân bằng trắng của camera và màu màn hình đều có thể làm lệch màu nhận diện.",
    isLip
      ? "Sắc tố môi thật, độ che phủ của chất son, độ bóng/lì và hiện tượng xuống tông (oxy hóa) không phản ánh hết qua mã màu tĩnh."
      : "Độ lên màu thực tế còn phụ thuộc nền da, độ che phủ, độ bóng/lì và hiện tượng xuống tông sau vài giờ.",
  ];

  const provenanceSummaryVi = `${provenance.colorSourceLabelVi}. ${provenance.priceStatusLabelVi}.`;

  return {
    mode,
    modeLabelVi,
    whyRecommendedVi,
    signalsUsedVi,
    limitationsVi,
    provenanceSummaryVi,
  };
}

