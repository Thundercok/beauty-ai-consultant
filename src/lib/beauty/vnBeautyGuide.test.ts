import test from "node:test";
import assert from "node:assert/strict";
import {
  VN_SEASON_PLAIN_GUIDE,
  buildVnShopLinks,
  estimateProductPriceVn,
  evaluateVnStudentTraits,
} from "./vnBeautyGuide";
import type { SeasonName } from "./types";

const ALL_SEASONS: SeasonName[] = [
  "Light Spring",
  "Warm Spring",
  "Bright Spring",
  "Light Summer",
  "Cool Summer",
  "Soft Summer",
  "Warm Autumn",
  "Soft Autumn",
  "Deep Autumn",
  "Bright Winter",
  "Cool Winter",
  "Deep Winter",
];

test("estimateProductPriceVn assigns realistic Vietnamese student budget tiers", () => {
  const romandLip = estimateProductPriceVn("Romand", "lipstick", "Juicy Lasting Tint");
  assert.equal(romandLip.tier, "under_200k");
  assert.ok(romandLip.maxK <= 200);

  const blackRouge = estimateProductPriceVn("Black Rouge", "lipstick", "Air Fit Velvet Tint");
  assert.equal(blackRouge.tier, "under_200k");

  const lemonadeLip = estimateProductPriceVn("Lemonade", "lipstick", "Perfect Couple Lip");
  assert.equal(lemonadeLip.tier, "mid_200_350k");
  assert.ok(lemonadeLip.minK >= 200 && lemonadeLip.maxK <= 350);

  const ofeliaBlush = estimateProductPriceVn("OFÉLIA", "blush", "Lolli Liquid Blush");
  assert.equal(ofeliaBlush.tier, "mid_200_350k");

  const yslLip = estimateProductPriceVn("YSL", "lipstick", "Rouge Pur Couture");
  assert.equal(yslLip.tier, "luxury_350k_plus");
  assert.ok(yslLip.minK > 350);

  const clioCushion = estimateProductPriceVn("Clio", "foundation", "Kill Cover Cushion");
  assert.equal(clioCushion.tier, "luxury_350k_plus");
});

test("evaluateVnStudentTraits identifies bare-face school shades and teeth-brightening reds accurately", () => {
  // Natural sheer rose-coral tint -> bare-face friendly
  const bareFaceTint = evaluateVnStudentTraits({
    productType: "lipstick",
    texture: "Juicy Tint",
    hex: "#C96A72",
    deltaE: 5.0,
  });
  assert.equal(bareFaceTint.bareFaceFriendly, true);
  assert.ok(bareFaceTint.badges.includes("Hợp mặt mộc đi học"));

  // Cool blue-based ruby red -> teeth brightening
  const coolRuby = evaluateVnStudentTraits({
    productType: "lipstick",
    texture: "Velvet Tint",
    hex: "#A8243E",
    deltaE: 4.5,
  });
  assert.equal(coolRuby.teethBrightening, true);
  assert.ok(coolRuby.badges.includes("Sáng răng · Không xỉn da"));

  // Bright yellow-orange neon -> NOT teeth brightening
  const neonOrange = evaluateVnStudentTraits({
    productType: "lipstick",
    texture: "Matte Lipstick",
    hex: "#FF7B29",
    deltaE: 12.0,
  });
  assert.equal(neonOrange.teethBrightening, false);
});

test("buildVnShopLinks encodes Vietnamese query cleanly for Shopee, TikTok Shop, and Hasaki", () => {
  const links = buildVnShopLinks("Romand", "Juicy Lasting Tint", "25 Bare Grape");
  assert.ok(links.shopeeUrl.startsWith("https://shopee.vn/search?keyword="));
  assert.ok(links.tiktokShopUrl.startsWith("https://www.tiktok.com/search?q="));
  assert.ok(links.hasakiUrl.startsWith("https://hasaki.vn/catalogsearch/result/?q="));
  assert.ok(links.shopeeUrl.includes("Romand"));
  assert.ok(links.shopeeUrl.includes("Bare%20Grape"));
});

test("VN_SEASON_PLAIN_GUIDE covers all 12 seasons without raw hex codes or Western jargon", () => {
  const forbiddenRe = /#[0-9A-Fa-f]{6}|taupe|bronzer|mauve|terracotta|burgundy|dusty|muted|raspberry|cranberry/i;
  for (const season of ALL_SEASONS) {
    const entry = VN_SEASON_PLAIN_GUIDE[season];
    assert.ok(entry.plainTitle.length > 6);
    assert.ok(entry.oneLiner.length > 20);
    assert.ok(entry.studentTip.length > 15);
    assert.doesNotMatch(entry.plainTitle, forbiddenRe, `${season} plainTitle contains jargon`);
    assert.doesNotMatch(entry.oneLiner, forbiddenRe, `${season} oneLiner contains jargon`);
    assert.doesNotMatch(entry.studentTip, forbiddenRe, `${season} studentTip contains jargon`);
  }
});
