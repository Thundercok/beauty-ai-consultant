import test from "node:test";
import assert from "node:assert/strict";
import {
  buildA4PdfFromJpegPages,
  buildBeautyReportPayload,
  dataUrlToBytes,
} from "./reportExport";
import type { ConsultationReport, FaceLandmarksBox, MatchedProduct } from "./types";

function makeMockReport(): ConsultationReport {
  const width = 200;
  const height = 250;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 212;
    rgba[i * 4 + 1] = 176;
    rgba[i * 4 + 2] = 158;
    rgba[i * 4 + 3] = 255;
  }
  const mask = new Uint8Array(width * height);
  mask.fill(1);

  return {
    whiteBalance: {
      method: "planckian_grey_edge",
      estimatedCctK: 5600,
      offLocusDeg: 1.2,
      illuminantLinear: [1, 1, 1],
    },
    faceShape: {
      primary: "Oval",
      secondary: "Heart",
      probabilities: {
        Oval: 0.68,
        Heart: 0.16,
        Round: 0.06,
        Square: 0.04,
        Oblong: 0.04,
        Diamond: 0.02,
      },
      ratios: { r1: 1.38, r2: 0.78, r3: 1.06 },
    },
    skinMetrics: {
      ITA_deg: 39.2,
      ITA_category: "Light",
      L_star: 67.4,
      a_star: 11.2,
      b_star: 15.8,
      Melanin_index: 0.34,
      Hemoglobin_index: 0.28,
      sampleCount: 14820,
      method: "mediapipe_468",
    },
    lipMetrics: {
      lipBaseLab: [51.2, 22.4, 9.6],
      lipBaseHex: "#B86E74",
      lipBorderL: 49.5,
      lipDarknessIndex: 1.7,
      hasDarkLipBorder: false,
      coverageRequirement: "Sheer to Medium",
      recommendedTexture: "Juicy Tint",
    },
    chromophores: {
      validPixels: 14820,
      melaninSpatialStd: 0.041,
      hemoglobinSpatialStd: 0.032,
      melaninDelta: new Float32Array(width * height),
      hemoglobinDelta: new Float32Array(width * height),
      shadingDelta: new Float32Array(width * height),
      validMask: mask,
      width,
      height,
    },
    season: {
      season: "Cool Winter",
      secondarySeason: "Cool Summer",
      confidence: 0.84,
      isBorderline: false,
      warmProbability: 0.26,
      probabilities: {
        "Light Spring": 0.02,
        "Warm Spring": 0.02,
        "Bright Spring": 0.03,
        "Light Summer": 0.05,
        "Cool Summer": 0.16,
        "Soft Summer": 0.04,
        "Warm Autumn": 0.02,
        "Soft Autumn": 0.02,
        "Deep Autumn": 0.03,
        "Bright Winter": 0.12,
        "Cool Winter": 0.43,
        "Deep Winter": 0.06,
      },
      undertone: "Cool (Pink/Blue)",
      skinHueDeg: 54.6,
      skinChroma: 19.3,
    },
    blendedTargets: {
      lip: "#B83A52",
      blush: "#D98A9C",
      eyeshadow: "#8D7A84",
    },
    advice: {
      contour: "Tạo khối màu nâu xám lạnh nhẹ dọc xương hàm.",
      blush: "Tán má hồng cánh sen lạnh ở gò má cao.",
      lip: "Ưu tiên son đỏ dâu lạnh hoặc hồng mâm xôi.",
      eyes: "Tán nâu lạnh tro ở hốc mắt để tăng chiều sâu.",
      avoid: ["Cam cháy gắt", "Vàng mù tạt", "Nâu đất quá xỉn"],
      targetColors: {
        lip: "#B83A52",
        blush: "#D98A9C",
        eyeshadow: "#8D7A84",
      },
      executionParameters: {
        intensity: "Medium",
        textureStyle: "Satin-Dewy",
        eyeDepth: "Soft Cool Definition",
        prep: "Hydrating Primer",
        setting: "Translucent Powder",
      },
    },
    landmarkSource: "fallback_box",
    landmarkCount: 0,
    skinEvidence: {
      verifiedSkinPixels: 12000,
      faceRegionPixels: 13500,
      usedRegionFallback: false,
    },
    neuralLandmarks: null,
    skinMask: mask,
    faceHullMask: mask,
    correctedRgba: rgba,
    originalRgba: rgba,
    width,
    height,
  };
}

const MOCK_FACE_BOX: FaceLandmarksBox = {
  centerX: 0.5,
  centerY: 0.48,
  faceWidth: 0.44,
  faceHeight: 0.58,
  jawRatio: 0.78,
  foreheadRatio: 1.05,
  lipCenterY: 0.67,
  lipWidth: 0.16,
};

const MOCK_PRODUCTS: MatchedProduct[] = [
  {
    id: 1,
    brand: "Romand",
    name: "Juicy Lasting Tint",
    shade: "25 Bare Grape",
    productType: "lipstick",
    texture: "Juicy Tint",
    hex: "#B8536A",
    renderedHex: "#A84861",
    deltaE: 2.1,
    matchTier: "Exact Match",
    undertone: "Cool",
    bestSeasons: "Cool Winter, Cool Summer",
  },
  {
    id: 2,
    brand: "Peripera",
    name: "Pure Blushed Sunshine Cheek",
    shade: "12 Sunny Pink",
    productType: "blush",
    texture: "Matte Powder",
    hex: "#DF9BAE",
    deltaE: 3.4,
    matchTier: "Great Match",
    undertone: "Cool",
    bestSeasons: "Cool Summer, Cool Winter",
  },
  {
    id: 3,
    brand: "Clio",
    name: "Pro Eye Palette",
    shade: "13 Picnic By The Sunset",
    productType: "eyeshadow",
    texture: "Matte / Shimmer",
    hex: "#8F7B88",
    deltaE: 3.9,
    matchTier: "Great Match",
    undertone: "Cool",
    bestSeasons: "Cool Winter",
  },
];

test("buildBeautyReportPayload aggregates skin tone, asymmetry, face shape, and curated products", () => {
  const report = makeMockReport();
  const { payload } = buildBeautyReportPayload({
    report,
    faceBox: MOCK_FACE_BOX,
    skinSwatchHex: "#D8B4A0",
    recommendedLipsticks: [MOCK_PRODUCTS[0]],
    recommendedBlushes: [MOCK_PRODUCTS[1]],
    recommendedEyeshadows: [MOCK_PRODUCTS[2]],
    now: new Date("2026-11-28T09:00:00Z"),
  });

  assert.equal(payload.generatedDateVi, "28/11/2026");
  assert.match(payload.fileBaseName, /^beauty-ai-bao-cao-[a-z0-9-]+-20261128$/);
  assert.equal(payload.skinTone.seasonName, "Cool Winter");
  assert.equal(payload.skinTone.targetSwatches.length, 3);
  assert.equal(payload.skinTone.labText, "67.4 / 11.2 / 15.8");
  assert.equal(payload.faceShape.tips.length, 3);
  assert.equal(payload.products.length, 3);
  assert.equal(payload.products[0].brand, "Romand");
  assert.equal(payload.products[0].renderedHex, "#A84861");
  assert.ok(payload.products[0].matchPercent >= 85);
});

test("buildA4PdfFromJpegPages creates valid multi-page PDF 1.4 binary with exact xref byte offsets", () => {
  const fakeJpeg1 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  const fakeJpeg2 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x11, 0x22, 0x33, 0xff, 0xd9]);

  const pdfBytes = buildA4PdfFromJpegPages([
    { jpegBytes: fakeJpeg1, widthPx: 1240, heightPx: 1754 },
    { jpegBytes: fakeJpeg2, widthPx: 1240, heightPx: 1754 },
  ]);

  const pdfLatin1 = Buffer.from(pdfBytes).toString("latin1");
  assert.ok(pdfLatin1.startsWith("%PDF-1.4\n"), "Must begin with %PDF-1.4 header");
  assert.ok(pdfLatin1.trimEnd().endsWith("%%EOF"), "Must end with %%EOF marker");
  assert.ok(pdfLatin1.includes("/Count 2"), "Must declare 2 pages in /Pages dictionary");
  assert.ok(pdfLatin1.includes("/Im0 5 0 R"), "Page 1 must reference XObject /Im0");
  assert.ok(pdfLatin1.includes("/Im1 8 0 R"), "Page 2 must reference XObject /Im1");
  assert.ok(pdfLatin1.includes(`/Length ${fakeJpeg1.length}`), "Image 1 stream length must match JPEG byte length");
  assert.ok(pdfLatin1.includes(`/Length ${fakeJpeg2.length}`), "Image 2 stream length must match JPEG byte length");

  // Verify xref table byte offsets accurately point to every object header in the binary
  const startxrefMatch = pdfLatin1.match(/startxref\n(\d+)\n%%EOF/);
  assert.ok(startxrefMatch, "Must include numeric startxref pointer");
  const xrefPos = Number(startxrefMatch[1]);
  assert.equal(pdfLatin1.slice(xrefPos, xrefPos + 4), "xref");

  const xrefLines = pdfLatin1
    .slice(xrefPos)
    .split("\n")
    .filter((line) => /^\d{10} 00000 n /.test(line));
  assert.equal(xrefLines.length, 8, "2 pages require 2 + 2*3 = 8 PDF objects");

  xrefLines.forEach((line, idx) => {
    const objId = idx + 1;
    const offset = Number(line.slice(0, 10));
    const expectedPrefix = `${objId} 0 obj\n`;
    assert.equal(
      pdfLatin1.slice(offset, offset + expectedPrefix.length),
      expectedPrefix,
      `xref entry for object ${objId} must point to exact byte offset`
    );
  });
});

test("buildA4PdfFromJpegPages rejects empty page list and dataUrlToBytes decodes base64", () => {
  assert.throws(() => buildA4PdfFromJpegPages([]));
  const decoded = dataUrlToBytes("data:image/jpeg;base64,/9j/2Q==");
  assert.deepEqual(Array.from(decoded), [0xff, 0xd8, 0xff, 0xd9]);
});
