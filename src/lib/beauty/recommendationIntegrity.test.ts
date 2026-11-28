import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseProductCatalogCsv } from "./productCatalog";
import { matchProducts } from "./productMatcher";
import {
  buildRecommendationTransparency,
  catalogProductToBrowseItem,
  evaluateProductCompatibility,
  evaluateRecommendationEligibility,
  getProductDataProvenance,
  isValidHexColor,
  validateCatalog,
} from "./recommendationIntegrity";
import type { CatalogProduct } from "./types";

const SAMPLE_PRODUCTS: CatalogProduct[] = [
  {
    id: 1,
    product_name: "Juicy Lasting Tint",
    brand: "Romand",
    product_type: "lipstick",
    texture_type: "Juicy Tint",
    hex_color: "#B84C5E",
    shade_name: "25 Bare Grape",
    undertone: "Cool",
    best_seasons: "Cool Summer, Bright Winter",
  },
  {
    id: 2,
    product_name: "Broken Hex Shade",
    brand: "TestBrand",
    product_type: "lipstick",
    texture_type: "Velvet Tint",
    hex_color: "NOT_A_HEX",
    shade_name: "Invalid",
    undertone: "",
    best_seasons: "",
  },
];

test("guest browsing yields browse_only with NO fabricated deltaE or matchTier", () => {
  const eligibility = evaluateRecommendationEligibility({
    catalogCount: SAMPLE_PRODUCTS.length,
    hasAnalysis: false,
  });

  assert.equal(eligibility.status, "browse_only");
  assert.equal(eligibility.canBrowseCatalog, true);
  assert.equal(eligibility.canPersonalize, false);
  assert.ok(eligibility.reasonCodes.includes("NO_ANALYSIS"));

  const browseItem = catalogProductToBrowseItem(SAMPLE_PRODUCTS[0]);
  assert.equal(browseItem.deltaE, null);
  assert.equal(browseItem.matchTier, null);
  assert.equal(browseItem.isPersonalized, false);
});

test("rejected analysis blocks personalization while preserving catalog browsing", () => {
  const eligibility = evaluateRecommendationEligibility({
    catalogCount: SAMPLE_PRODUCTS.length,
    hasAnalysis: true,
    analysisValidity: {
      status: "reject",
      reason: "no_skin",
      message: "Không đo được vùng da",
    },
  });

  assert.equal(eligibility.status, "unavailable");
  assert.equal(eligibility.canBrowseCatalog, true);
  assert.equal(eligibility.canPersonalize, false);
  assert.ok(eligibility.reasonCodes.includes("INSUFFICIENT_SKIN_EVIDENCE"));
});

test("low-quality or warning analysis enters caution mode with honest explanation", () => {
  const eligibility = evaluateRecommendationEligibility({
    catalogCount: SAMPLE_PRODUCTS.length,
    hasAnalysis: true,
    analysisValidity: {
      status: "warn",
      reason: "few_skin_pixels",
      message: "Vùng da đo được quá nhỏ",
    },
    targetHex: "#B84C5E",
  });

  assert.equal(eligibility.status, "caution");
  assert.equal(eligibility.canPersonalize, true);
  assert.ok(eligibility.reasonCodes.includes("LOW_ANALYSIS_QUALITY"));
  assert.ok(eligibility.bannerMessageVi && eligibility.bannerMessageVi.length > 0);
});

test("empty catalog returns EMPTY_CATALOG unavailable state", () => {
  const eligibility = evaluateRecommendationEligibility({
    catalogCount: 0,
    hasAnalysis: true,
    targetHex: "#B84C5E",
  });

  assert.equal(eligibility.status, "unavailable");
  assert.equal(eligibility.canBrowseCatalog, false);
  assert.ok(eligibility.reasonCodes.includes("EMPTY_CATALOG"));
});

test("matchProducts excludes invalid HEX records instead of producing NaN or fabricated scores", () => {
  assert.equal(isValidHexColor("#B84C5E"), true);
  assert.equal(isValidHexColor("NOT_A_HEX"), false);

  const matched = matchProducts("#B84C5E", SAMPLE_PRODUCTS, {
    productType: "lipstick",
    topK: 10,
  });

  assert.equal(matched.length, 1);
  assert.equal(matched[0].id, 1);
  assert.equal(matched[0].isPersonalized, true);
  assert.equal(typeof matched[0].deltaE, "number");
  assert.ok(Number.isFinite(matched[0].deltaE));

  // Invalid target hex returns empty matches rather than NaN
  const invalidTargetMatches = matchProducts("INVALID", SAMPLE_PRODUCTS, {
    productType: "lipstick",
  });
  assert.equal(invalidTargetMatches.length, 0);
});

test("missing undertone or season attributes remain explicitly unknown, never compatible", () => {
  const incomplete = catalogProductToBrowseItem(SAMPLE_PRODUCTS[1]);
  const compat = evaluateProductCompatibility(incomplete, "Bright Winter", "Cool (Pink/Blue)");

  assert.equal(compat.colorSimilarityAvailable, false);
  assert.equal(compat.undertoneCompatibility, "unknown");
  assert.equal(compat.seasonCompatibility, "unknown");
});

test("bundled product_database.csv passes strict catalog validation with zero invalid HEX or duplicates", () => {
  const csvPath = path.resolve(process.cwd(), "data/product_database.csv");
  const raw = fs.readFileSync(csvPath, "utf8");
  const products = parseProductCatalogCsv(raw);
  const summary = validateCatalog(products);

  assert.equal(summary.totalRecords, 217);
  assert.equal(summary.errorCount, 0);
  assert.equal(summary.invalidHexIds.length, 0);
  assert.equal(summary.duplicateKeys.length, 0);
  assert.equal(summary.validForColorMatchCount, 217);
});

test("getProductDataProvenance explicitly discloses unverified commercial metadata and missing fields", () => {
  const validItem = catalogProductToBrowseItem(SAMPLE_PRODUCTS[0]);
  const prov = getProductDataProvenance(validItem);

  assert.equal(prov.dataSource, "bundled_csv_catalog");
  assert.equal(prov.colorSource, "catalog_csv_hex");
  assert.equal(prov.priceSource, "estimated_vn_tier");
  assert.equal(prov.availabilityStatus, "unverified_search_link");
  assert.equal(prov.verificationStatus, "unverified_commercial");
  assert.equal(prov.verifiedAt, null);
  assert.ok(prov.missingFieldsVi.length >= 3);

  const missingMeta = getProductDataProvenance({
    hex: "INVALID",
    undertone: "",
    bestSeasons: "",
    texture: "Standard",
  });
  assert.equal(missingMeta.colorSource, "invalid_hex");
  assert.ok(missingMeta.missingFieldsVi.length >= 6);
});

test("buildRecommendationTransparency distinguishes personalized color similarity from catalog browse", () => {
  const browseItem = catalogProductToBrowseItem(SAMPLE_PRODUCTS[0]);
  const browseInfo = buildRecommendationTransparency({
    product: browseItem,
    userSeason: null,
    userUndertone: null,
  });
  assert.equal(browseInfo.mode, "catalog_browse");
  assert.ok(browseInfo.signalsUsedVi.length > 0);
  assert.ok(browseInfo.limitationsVi.length > 0);

  const matched = matchProducts("#B84C5E", SAMPLE_PRODUCTS, {
    productType: "lipstick",
    topK: 1,
  })[0];
  const personalizedInfo = buildRecommendationTransparency({
    product: matched,
    userSeason: "Bright Winter",
    userUndertone: "Cool (Pink/Blue)",
  });
  assert.equal(personalizedInfo.mode, "personalized");
  assert.ok(personalizedInfo.whyRecommendedVi.includes("khoảng cách màu") || personalizedInfo.whyRecommendedVi.includes("độ gần màu"));
});

