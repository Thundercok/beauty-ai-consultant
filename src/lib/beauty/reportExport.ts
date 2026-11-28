import {
  analyzeFaceShapeFromGeometry,
  type AutoFaceShapeAnalysis,
} from "./autoFaceShapeAnalyzer";
import { computeAnalysisConfidence, type AnalysisConfidenceResult } from "./analysisConfidence";
import { buildHonestLandmarkAudit, type HonestLandmarkAuditReport, type HonestAuditIssue } from "./honestLandmarkAudit";
import { deltaEToMatchPercent } from "./virtualMakeup";
import {
  VN_SEASON_PLAIN_GUIDE,
  estimateProductPriceVn,
  evaluateVnStudentTraits,
} from "./vnBeautyGuide";
import {
  PRODUCT_TYPE_VI_LABELS,
  SEASON_VI_LABELS,
  SHAPE_VI_LABELS,
  TEXTURE_VI_LABELS,
  UNDERTONE_VI_LABELS,
  describeCctVi,
  translateItaCategory,
} from "./viLabels";
import type {
  ConsultationReport,
  FaceLandmarksBox,
  MatchedProduct,
} from "./types";

export interface ReportProductEntry {
  id: number;
  categoryVi: string;
  productType: string;
  brand: string;
  name: string;
  shade: string;
  textureVi: string;
  swatchHex: string;
  renderedHex?: string;
  matchPercent: number;
  priceRangeVi: string;
  tagsVi: string[];
}

export interface BeautyReportPayload {
  generatedAtIso: string;
  generatedDateVi: string;
  fileBaseName: string;
  skinTone: {
    seasonName: string;
    seasonViTitle: string;
    plainTitle: string;
    plainSummary: string;
    quickTip: string;
    undertoneVi: string;
    lightnessVi: string;
    skinSwatchHex: string;
    lipBaseHex: string;
    labText: string;
    itaDegText: string;
    cctText: string;
    cctDescVi: string;
    warmProbPct: number;
    hueDegText: string;
    chromaText: string;
    targetSwatches: Array<{ label: string; hex: string }>;
    avoidColorsVi: string[];
  };
  confidence: AnalysisConfidenceResult;
  asymmetry: {
    available: boolean;
    overallScore: number;
    verdictTagVi: string;
    headlineVi: string;
    summaryVi: string;
    poseSummaryVi: string;
    actionableCount: number;
    issues: HonestAuditIssue[];
  };
  faceShape: {
    primaryVi: string;
    secondaryVi: string;
    ratiosText: string;
    summaryVi: string;
    tips: Array<{ titleVi: string; detailVi: string }>;
  };
  products: ReportProductEntry[];
  executionGuide: {
    contour: string;
    blush: string;
    lip: string;
    eyes: string;
  };
}

export interface BuildBeautyReportPayloadInput {
  report: ConsultationReport;
  faceBox: FaceLandmarksBox;
  skinSwatchHex: string;
  recommendedLipsticks: MatchedProduct[];
  recommendedBlushes: MatchedProduct[];
  recommendedEyeshadows: MatchedProduct[];
  now?: Date;
}

export interface PdfJpegPageInput {
  jpegBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
}

function formatViDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toAsciiSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapProductToEntry(item: MatchedProduct): ReportProductEntry {
  const price = estimateProductPriceVn(item.brand, item.productType, item.name);
  const validDelta = typeof item.deltaE === "number" && Number.isFinite(item.deltaE) ? item.deltaE : undefined;
  const traits = evaluateVnStudentTraits({
    productType: item.productType,
    texture: item.texture,
    hex: item.hex,
    renderedHex: item.renderedHex,
    deltaE: validDelta,
  });
  const tagsVi: string[] = [];
  if (traits.bareFaceFriendly) tagsVi.push("Hợp mặt mộc");
  if (traits.teethBrightening) tagsVi.push("Sáng răng");
  if (tagsVi.length === 0) {
    tagsVi.push(TEXTURE_VI_LABELS[item.texture] ?? item.texture);
  }

  return {
    id: item.id,
    categoryVi: PRODUCT_TYPE_VI_LABELS[item.productType] ?? item.productType,
    productType: item.productType,
    brand: item.brand,
    name: item.name,
    shade: item.shade,
    textureVi: TEXTURE_VI_LABELS[item.texture] ?? item.texture,
    swatchHex: item.hex,
    renderedHex: item.renderedHex,
    matchPercent: validDelta !== undefined ? deltaEToMatchPercent(validDelta) : 0,
    priceRangeVi: price.priceRangeLabel,
    tagsVi,
  };
}

/**
 * Pure, deterministic builder that aggregates all skin tone, brutally honest asymmetry,
 * auto face shape, and curated product recommendations for PNG/PDF report rendering.
 */
export function buildBeautyReportPayload(
  input: BuildBeautyReportPayloadInput
): {
  payload: BeautyReportPayload;
  audit: HonestLandmarkAuditReport;
  faceShapeAnalysis: AutoFaceShapeAnalysis;
} {
  const {
    report,
    faceBox,
    skinSwatchHex,
    recommendedLipsticks,
    recommendedBlushes,
    recommendedEyeshadows,
    now = new Date(),
  } = input;

  const audit = buildHonestLandmarkAudit(report, faceBox);
  const confidence = computeAnalysisConfidence(report);
  const faceShapeAnalysis = analyzeFaceShapeFromGeometry({
    neuralLandmarks: report.neuralLandmarks,
    faceBox,
    width: report.width,
    height: report.height,
    undertone: report.season.undertone,
  });
  const plainGuide = VN_SEASON_PLAIN_GUIDE[report.season.season];
  const seasonVi = SEASON_VI_LABELS[report.season.season];

  const curatedProducts: ReportProductEntry[] = [];
  const seenIds = new Set<number>();
  const pushUnique = (items: MatchedProduct[], limit: number) => {
    let added = 0;
    for (const item of items) {
      if (added >= limit) break;
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      curatedProducts.push(mapProductToEntry(item));
      added += 1;
    }
  };

  pushUnique(recommendedLipsticks, 4);
  pushUnique(recommendedBlushes, 2);
  pushUnique(recommendedEyeshadows, 2);

  const actionableCount = audit.issues.filter((i) => i.severity !== "balanced").length;
  const poseSummaryVi = audit.available
    ? `Nghiêng đầu ${Math.abs(audit.pose.rollDeg).toFixed(1)}° · Xoay mặt ${Math.abs(audit.pose.yawDeg).toFixed(1)}° · Chuẩn IPD 62mm`
    : "Ước lượng theo khung khuôn mặt tiêu chuẩn";

  const seasonSlug = toAsciiSlug(seasonVi.title || report.season.season);
  const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  const payload: BeautyReportPayload = {
    generatedAtIso: now.toISOString(),
    generatedDateVi: formatViDate(now),
    fileBaseName: `beauty-ai-bao-cao-${seasonSlug}-${dateStamp}`,
    skinTone: {
      seasonName: report.season.season,
      seasonViTitle: seasonVi.title,
      plainTitle: plainGuide.plainTitle,
      plainSummary: plainGuide.oneLiner,
      quickTip: plainGuide.studentTip,
      undertoneVi: UNDERTONE_VI_LABELS[report.season.undertone] ?? report.season.undertone,
      lightnessVi: translateItaCategory(report.skinMetrics.ITA_category),
      skinSwatchHex,
      lipBaseHex: report.lipMetrics.lipBaseHex,
      labText: `${report.skinMetrics.L_star.toFixed(1)} / ${report.skinMetrics.a_star.toFixed(1)} / ${report.skinMetrics.b_star.toFixed(1)}`,
      itaDegText: `${report.skinMetrics.ITA_deg.toFixed(1)}°`,
      cctText:
        report.whiteBalance.estimatedCctK !== null
          ? `${Math.round(report.whiteBalance.estimatedCctK)}K`
          : "D65",
      cctDescVi: describeCctVi(report.whiteBalance.estimatedCctK),
      warmProbPct: Math.round(report.season.warmProbability * 100),
      hueDegText: `${report.season.skinHueDeg.toFixed(1)}°`,
      chromaText: report.season.skinChroma.toFixed(1),
      targetSwatches: [
        { label: "Son môi mục tiêu", hex: report.blendedTargets.lip },
        { label: "Phấn má mục tiêu", hex: report.blendedTargets.blush },
        { label: "Phấn mắt mục tiêu", hex: report.blendedTargets.eyeshadow },
      ],
      avoidColorsVi: report.advice.avoid.slice(0, 4),
    },
    confidence,
    asymmetry: {
      available: audit.available,
      overallScore: Math.round(audit.overallBalanceScore),
      verdictTagVi: audit.verdictTagVi,
      headlineVi: audit.brutalHeadlineVi,
      summaryVi: audit.brutalSummaryVi,
      poseSummaryVi,
      actionableCount,
      issues: audit.issues,
    },
    faceShape: {
      primaryVi: SHAPE_VI_LABELS[faceShapeAnalysis.result.primary] ?? faceShapeAnalysis.result.primary,
      secondaryVi:
        SHAPE_VI_LABELS[faceShapeAnalysis.result.secondary] ?? faceShapeAnalysis.result.secondary,
      ratiosText: `Dài/Rộng ${faceShapeAnalysis.result.ratios.r1.toFixed(2)} · Hàm/Má ${faceShapeAnalysis.result.ratios.r2.toFixed(2)} · Trán/Hàm ${faceShapeAnalysis.result.ratios.r3.toFixed(2)}`,
      summaryVi: faceShapeAnalysis.proportionSummaryVi,
      tips: faceShapeAnalysis.tips.slice(0, 3).map((t) => ({
        titleVi: `${t.focusLabelVi}: ${t.headlineVi}`,
        detailVi: t.detailVi,
      })),
    },
    products: curatedProducts,
    executionGuide: {
      contour: report.advice.contour,
      blush: report.advice.blush,
      lip: report.advice.lip,
      eyes: report.advice.eyes,
    },
  };

  return { payload, audit, faceShapeAnalysis };
}

/**
 * Decodes a base64 JPEG data URL (data:image/jpeg;base64,...) into raw Uint8Array bytes.
 */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) {
    throw new Error("Invalid data URL");
  }
  const base64 = dataUrl.slice(commaIdx + 1);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Pure, zero-dependency PDF 1.4 binary builder that wraps one or more high-DPI JPEG
 * pages into a standards-compliant A4 (595.28 x 841.89 pt) PDF document.
 *
 * Why JPEG-backed A4 PDF? Browser Canvas 2D renders Vietnamese diacritics, portraits,
 * surgical red landmark markers, and color swatches with 100% typographic fidelity at
 * 220+ DPI, avoiding broken Latin-1 glyphs in standard PDF Type1 fonts and working
 * reliably inside sandboxed iframes without window.open/window.print.
 */
export function buildA4PdfFromJpegPages(pages: PdfJpegPageInput[]): Uint8Array {
  if (pages.length === 0) {
    throw new Error("At least one page is required to generate a PDF report.");
  }

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let currentOffset = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentOffset += bytes.length;
  };
  const pushStr = (str: string) => {
    pushBytes(encoder.encode(str));
  };

  // Standard ISO A4 dimensions in PDF points (72 pt = 1 inch)
  const PAGE_W_PT = 595.28;
  const PAGE_H_PT = 841.89;

  // PDF Header with binary comment hint
  pushStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  // Object allocation:
  // 1: Catalog
  // 2: Pages
  // For each page i (0..N-1):
  //   pageObjId    = 3 + i * 3
  //   contentObjId = 4 + i * 3
  //   imageObjId   = 5 + i * 3
  const totalObjects = 2 + pages.length * 3;
  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  const pageKidsRefs = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");

  // 1 0 obj: Catalog
  offsets[1] = currentOffset;
  pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // 2 0 obj: Pages
  offsets[2] = currentOffset;
  pushStr(`2 0 obj\n<< /Type /Pages /Kids [${pageKidsRefs}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((page, i) => {
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;
    const imgName = `Im${i}`;

    const safeW = Math.max(1, Math.round(page.widthPx));
    const safeH = Math.max(1, Math.round(page.heightPx));

    // Preserve image aspect ratio cleanly inside A4 page box
    const imgAspect = safeW / safeH;
    const pageAspect = PAGE_W_PT / PAGE_H_PT;
    let drawW = PAGE_W_PT;
    let drawH = PAGE_H_PT;
    let offsetX = 0;
    let offsetY = 0;

    if (imgAspect > pageAspect) {
      drawW = PAGE_W_PT;
      drawH = PAGE_W_PT / imgAspect;
      offsetY = (PAGE_H_PT - drawH) * 0.5;
    } else {
      drawH = PAGE_H_PT;
      drawW = PAGE_H_PT * imgAspect;
      offsetX = (PAGE_W_PT - drawW) * 0.5;
    }

    const contentStream = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm\n/${imgName} Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);

    // Page object
    offsets[pageObjId] = currentOffset;
    pushStr(
      `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W_PT.toFixed(2)} ${PAGE_H_PT.toFixed(2)}] ` +
        `/Resources << /XObject << /${imgName} ${imageObjId} 0 R >> /ProcSet [/PDF /ImageC] >> ` +
        `/Contents ${contentObjId} 0 R >>\n` +
        `endobj\n`
    );

    // Content stream object
    offsets[contentObjId] = currentOffset;
    pushStr(`${contentObjId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushStr("endstream\nendobj\n");

    // Image XObject (raw JPEG DCTDecode)
    offsets[imageObjId] = currentOffset;
    pushStr(
      `${imageObjId} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${safeW} /Height ${safeH} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${page.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(page.jpegBytes);
    pushStr("\nendstream\nendobj\n");
  });

  // Cross-reference table
  const xrefOffset = currentOffset;
  pushStr(`xref\n0 ${totalObjects + 1}\n`);
  pushStr("0000000000 65535 f \n");
  for (let id = 1; id <= totalObjects; id++) {
    const padded = String(offsets[id]).padStart(10, "0");
    pushStr(`${padded} 00000 n \n`);
  }

  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  // Merge chunks into a single Uint8Array
  const out = new Uint8Array(currentOffset);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// High-DPI Editorial Canvas Renderer (Browser-only)
// ---------------------------------------------------------------------------

const FONT_SANS = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const FONT_MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';

const INK_PRIMARY = "#111111";
const INK_SECONDARY = "#404040";
const INK_MUTED = "#6E6E6E";
const SURFACE_SUBTLE = "#F6F6F6";
const HAIRLINE = "#E2E2E2";
const SIGNAL_RED = "#DC2626";
const SIGNAL_RED_SOFT = "#FEF2F2";
const SIGNAL_AMBER = "#B45309";
const SIGNAL_EMERALD = "#047857";

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines?: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);

  if (maxLines && lines.length > maxLines) {
    const trimmed = lines.slice(0, maxLines);
    let last = trimmed[maxLines - 1];
    while (last.length > 4 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    trimmed[maxLines - 1] = `${last}…`;
    return trimmed;
  }
  return lines;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines?: number
): number {
  const lines = wrapTextLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * lineHeight);
  });
  return y + lines.length * lineHeight;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawPortraitWithRedMarkers(
  ctx: CanvasRenderingContext2D,
  report: ConsultationReport,
  audit: HonestLandmarkAuditReport,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  // Put corrected portrait RGBA onto an offscreen canvas first
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = report.width;
  srcCanvas.height = report.height;
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) return;

  srcCtx.putImageData(
    new ImageData(new Uint8ClampedArray(report.correctedRgba), report.width, report.height),
    0,
    0
  );

  // Compute cover + top-biased projection matching PortraitCanvas object-cover object-top
  const scale = Math.max(w / report.width, h / report.height);
  const drawW = report.width * scale;
  const drawH = report.height * scale;
  const dx = x + (w - drawW) * 0.5;
  const dy = y; // xMidYMin slice

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = "#111111";
  ctx.fillRect(x, y, w, h);
  ctx.drawImage(srcCanvas, dx, dy, drawW, drawH);

  // Map image pixel coordinates into target box coordinates
  const mapPt = (pt: { x: number; y: number }) => ({
    x: dx + pt.x * scale,
    y: dy + pt.y * scale,
  });

  if (audit.available) {
    // 1. Roll-compensated anatomical midline plumb axis
    const midTop = mapPt(audit.midlineAxis.top);
    const midBot = mapPt(audit.midlineAxis.bottom);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(midTop.x, midTop.y);
    ctx.lineTo(midBot.x, midBot.y);
    ctx.stroke();
    ctx.restore();

    // 2. Draw surgical red lines, strokes, arrows & numbered circles for actionable issues
    const defectIssues = audit.issues.filter((i) => i.severity !== "balanced");
    const markerIssues = defectIssues.length > 0 ? defectIssues.slice(0, 4) : audit.issues.slice(0, 2);

    markerIssues.forEach((issue, idx) => {
      const isDefect = issue.severity !== "balanced";
      const strokeColor = isDefect ? "#EF4444" : "rgba(255,255,255,0.8)";

      // Strokes
      for (const st of issue.strokes) {
        if (st.points.length < 2) continue;
        ctx.save();
        ctx.beginPath();
        st.points.forEach((p, pIdx) => {
          const mp = mapPt(p);
          if (pIdx === 0) ctx.moveTo(mp.x, mp.y);
          else ctx.lineTo(mp.x, mp.y);
        });
        if (st.closed) ctx.closePath();

        if (st.kind === "oil_zone") {
          ctx.fillStyle = "rgba(239, 68, 68, 0.20)";
          ctx.fill();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 1.8;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
        } else if (st.kind === "contour") {
          ctx.strokeStyle = st.weight === "strong" ? "rgba(220, 38, 38, 0.55)" : "rgba(255,255,255,0.4)";
          ctx.lineWidth = st.weight === "strong" ? 8 : 3.5;
          ctx.lineCap = "round";
          ctx.stroke();

          ctx.strokeStyle = st.weight === "strong" ? "#EF4444" : "rgba(255,255,255,0.75)";
          ctx.lineWidth = 1.8;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
        } else {
          ctx.strokeStyle = st.kind === "highlight" ? "rgba(255,255,255,0.88)" : strokeColor;
          ctx.lineWidth = 2.1;
          ctx.lineCap = "round";
          if (st.kind === "brow_fill") ctx.setLineDash([5, 4]);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Reference horizontal/axis lines
      for (const ln of issue.lines) {
        const p1 = mapPt({ x: ln.x1, y: ln.y1 });
        const p2 = mapPt({ x: ln.x2, y: ln.y2 });
        ctx.save();
        ctx.strokeStyle = ln.kind === "reference" ? strokeColor : "rgba(255,255,255,0.75)";
        ctx.lineWidth = ln.kind === "reference" ? 1.8 : 1.3;
        if (ln.kind !== "measured") ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
      }

      // Directional repair arrows
      for (const arr of issue.arrows) {
        const from = mapPt(arr.from);
        const to = mapPt(arr.to);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const headLen = 9;
        ctx.save();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();

        ctx.strokeStyle = SIGNAL_RED;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.moveTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(to.x, to.y);
        ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        ctx.restore();
      }

      // Numbered red reticle dot on the landmark anchor
      const anchor = mapPt(issue.calloutAnchor);
      ctx.save();
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 17, 0, Math.PI * 2);
      ctx.strokeStyle = isDefect ? "rgba(239, 68, 68, 0.78)" : "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = isDefect ? SIGNAL_RED : "#111111";
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#FFFFFF";
      ctx.font = `700 12px ${FONT_MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`0${idx + 1}`, anchor.x, anchor.y + 0.5);
      ctx.restore();
    });
  }

  // Subtle bottom caption scrim on portrait
  const scrimH = 62;
  const grad = ctx.createLinearGradient(x, y + h - scrimH, x, y + h);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y + h - scrimH, w, scrimH);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `600 13px ${FONT_SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const badgeText = audit.available
    ? `Ảnh chuẩn sáng D65 · ${audit.issues.filter((i) => i.severity !== "balanced").length} điểm lệch được khoanh đỏ`
    : "Ảnh chuẩn sáng D65";
  ctx.fillText(badgeText, x + 16, y + h - 18);

  ctx.restore();

  // Sharp hairline border around portrait
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
}

function drawPageMasthead(
  ctx: CanvasRenderingContext2D,
  W: number,
  margin: number,
  dateVi: string,
  pageLabel: string,
  confidenceScore: number
): number {
  let y = margin;

  // Top dark accent rule
  ctx.fillStyle = INK_PRIMARY;
  ctx.fillRect(margin, y, W - margin * 2, 3);
  y += 28;

  ctx.fillStyle = INK_PRIMARY;
  ctx.font = `700 28px ${FONT_SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Beauty AI", margin, y + 6);

  ctx.fillStyle = INK_MUTED;
  ctx.font = `500 13px ${FONT_SANS}`;
  ctx.fillText("Báo cáo phân tích tông da, cấu trúc & mỹ phẩm cá nhân", margin + 150, y + 5);

  ctx.textAlign = "right";
  ctx.font = `600 13px ${FONT_MONO}`;
  ctx.fillStyle = INK_PRIMARY;
  ctx.fillText(`${pageLabel}  ·  ${dateVi}`, W - margin, y + 4);

  ctx.font = `500 12px ${FONT_MONO}`;
  ctx.fillStyle = INK_MUTED;
  ctx.fillText(`Độ tin cậy ảnh: ${confidenceScore}%`, W - margin, y + 24);
  ctx.textAlign = "left";

  y += 38;
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(W - margin, y);
  ctx.stroke();

  return y + 28;
}

function drawPageFooter(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  margin: number,
  pageNote: string
): void {
  const footerY = H - margin + 6;
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(margin, footerY - 24);
  ctx.lineTo(W - margin, footerY - 24);
  ctx.stroke();

  ctx.fillStyle = INK_MUTED;
  ctx.font = `500 12px ${FONT_SANS}`;
  ctx.textAlign = "left";
  ctx.fillText("Beauty AI Consultant · Phân tích sắc tố CIELAB & 478 điểm khuôn mặt", margin, footerY);

  ctx.textAlign = "right";
  ctx.font = `500 12px ${FONT_MONO}`;
  ctx.fillText(pageNote, W - margin, footerY);
  ctx.textAlign = "left";
}

function drawSectionHeading(
  ctx: CanvasRenderingContext2D,
  indexNum: string,
  title: string,
  rightMeta: string | null,
  x: number,
  y: number,
  width: number
): number {
  ctx.font = `700 13px ${FONT_MONO}`;
  ctx.fillStyle = SIGNAL_RED;
  ctx.fillText(indexNum, x, y);

  ctx.font = `700 19px ${FONT_SANS}`;
  ctx.fillStyle = INK_PRIMARY;
  ctx.fillText(title, x + 32, y);

  if (rightMeta) {
    ctx.textAlign = "right";
    ctx.font = `500 12px ${FONT_MONO}`;
    ctx.fillStyle = INK_MUTED;
    ctx.fillText(rightMeta, x + width, y - 1);
    ctx.textAlign = "left";
  }

  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y + 12);
  ctx.lineTo(x + width, y + 12);
  ctx.stroke();

  return y + 32;
}

/**
 * Renders Page 1 of the A4 Editorial Report (1240 x 1754 px):
 * - Masthead
 * - Portrait with Surgical Red Asymmetry Markers + Personal Color / Skin Tone Verdict & Metrics
 * - Brutally Honest Asymmetry Diagnosis & Actionable Repair List
 */
export function renderReportPage1Canvas(
  report: ConsultationReport,
  payload: BeautyReportPayload,
  audit: HonestLandmarkAuditReport
): HTMLCanvasElement {
  const W = 1240;
  const H = 1754;
  const M = 64;
  const contentW = W - M * 2;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Pure white optical studio paper
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  let y = drawPageMasthead(
    ctx,
    W,
    M,
    payload.generatedDateVi,
    "TRANG 01 / 02",
    payload.confidence.score
  );

  // --- SECTION 01: Portrait + Skin Tone & Personal Color ---
  const heroTop = y;
  const portraitW = 432;
  const portraitH = 540; // Exact 4:5 portrait ratio — zero face cropping!
  drawPortraitWithRedMarkers(ctx, report, audit, M, heroTop, portraitW, portraitH);

  // Right column: Skin tone & Personal color editorial dossier
  const rx = M + portraitW + 38;
  const rw = contentW - portraitW - 38;
  let ry = heroTop + 14;

  ctx.font = `700 12px ${FONT_MONO}`;
  ctx.fillStyle = SIGNAL_RED;
  ctx.fillText("01 · KẾT LUẬN TÔNG DA & MÙA CÁ NHÂN", rx, ry);
  ry += 28;

  // Skin swatch + Plain Title
  ctx.fillStyle = payload.skinTone.skinSwatchHex;
  ctx.beginPath();
  ctx.arc(rx + 15, ry - 4, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = INK_PRIMARY;
  ctx.font = `700 24px ${FONT_SANS}`;
  ry = drawWrappedText(ctx, payload.skinTone.plainTitle, rx + 42, ry + 2, rw - 42, 31, 2);

  ry += 6;
  ctx.font = `600 14px ${FONT_SANS}`;
  ctx.fillStyle = INK_SECONDARY;
  ctx.fillText(
    `${payload.skinTone.seasonViTitle} (${payload.skinTone.seasonName})  ·  ${payload.skinTone.undertoneVi}`,
    rx,
    ry
  );
  ry += 22;

  ctx.font = `400 14px ${FONT_SANS}`;
  ctx.fillStyle = INK_SECONDARY;
  ry = drawWrappedText(ctx, payload.skinTone.plainSummary, rx, ry, rw, 21, 3);
  ry += 10;

  // Quick tip subtle box
  ctx.fillStyle = SURFACE_SUBTLE;
  ctx.fillRect(rx, ry, rw, 62);
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(rx, ry, rw, 62);
  ctx.fillStyle = INK_PRIMARY;
  ctx.font = `600 12px ${FONT_SANS}`;
  ctx.fillText("Mẹo lên tông nhanh:", rx + 14, ry + 22);
  ctx.fillStyle = INK_SECONDARY;
  ctx.font = `400 12.5px ${FONT_SANS}`;
  drawWrappedText(ctx, payload.skinTone.quickTip, rx + 14, ry + 41, rw - 28, 17, 2);
  ry += 78;

  // 4-Column Tabular Colorimetry Strip
  const metrics = [
    { k: "CIELAB (L*/a*/b*)", v: payload.skinTone.labText },
    { k: "Độ sáng ITA°", v: `${payload.skinTone.itaDegText} · ${payload.skinTone.lightnessVi}` },
    { k: "Ánh sáng gốc", v: `${payload.skinTone.cctText} · ${payload.skinTone.cctDescVi}` },
    { k: "Sắc ấm / Hue", v: `${payload.skinTone.warmProbPct}% · ${payload.skinTone.hueDegText}` },
  ];

  const colW = (rw - 12) / 2;
  metrics.forEach((m, idx) => {
    const cx = rx + (idx % 2) * (colW + 12);
    const cy = ry + Math.floor(idx / 2) * 52;
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + colW, cy);
    ctx.stroke();

    ctx.fillStyle = INK_MUTED;
    ctx.font = `500 11px ${FONT_SANS}`;
    ctx.fillText(m.k, cx, cy + 18);

    ctx.fillStyle = INK_PRIMARY;
    ctx.font = `600 13px ${FONT_MONO}`;
    const trimmedVal = wrapTextLines(ctx, m.v, colW - 4, 1)[0] ?? m.v;
    ctx.fillText(trimmedVal, cx, cy + 37);
  });
  ry += 116;

  // Recommended Target Swatches (Lip, Blush, Eyeshadow)
  ctx.fillStyle = INK_MUTED;
  ctx.font = `600 11.5px ${FONT_SANS}`;
  ctx.fillText("BẢNG MÀU MỤC TIÊU CHUẨN TÔNG DA", rx, ry);
  ry += 14;

  const swatchW = (rw - 20) / 3;
  payload.skinTone.targetSwatches.forEach((sw, idx) => {
    const sx = rx + idx * (swatchW + 10);
    ctx.fillStyle = sw.hex;
    ctx.fillRect(sx, ry, swatchW, 38);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, ry, swatchW, 38);

    ctx.fillStyle = INK_PRIMARY;
    ctx.font = `600 12px ${FONT_SANS}`;
    ctx.fillText(sw.label, sx, ry + 56);
    ctx.fillStyle = INK_MUTED;
    ctx.font = `500 11.5px ${FONT_MONO}`;
    ctx.fillText(sw.hex.toUpperCase(), sx, ry + 73);
  });

  ry += 94;
  if (payload.skinTone.avoidColorsVi.length > 0) {
    ctx.fillStyle = SIGNAL_RED;
    ctx.font = `600 12px ${FONT_SANS}`;
    ctx.fillText("Nên tránh: ", rx, ry);
    const avoidLabelW = ctx.measureText("Nên tránh: ").width;
    ctx.fillStyle = INK_SECONDARY;
    ctx.font = `400 12.5px ${FONT_SANS}`;
    drawWrappedText(
      ctx,
      payload.skinTone.avoidColorsVi.join("  ·  "),
      rx + avoidLabelW,
      ry,
      rw - avoidLabelW,
      18,
      2
    );
  }

  // --- SECTION 02: Brutally Honest Asymmetry & Landmark Audit ---
  y = heroTop + portraitH + 46;
  y = drawSectionHeading(
    ctx,
    "02",
    "Phân tích Bất đối xứng thẳng thắn & Cách sửa thực tế",
    payload.asymmetry.poseSummaryVi,
    M,
    y,
    contentW
  );

  // Score Summary Strip
  const stripH = 92;
  ctx.fillStyle = SURFACE_SUBTLE;
  ctx.fillRect(M, y, contentW, stripH);
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(M, y, contentW, stripH);

  const scoreColor =
    payload.asymmetry.overallScore >= 85
      ? INK_PRIMARY
      : payload.asymmetry.overallScore >= 72
        ? SIGNAL_AMBER
        : SIGNAL_RED;

  ctx.fillStyle = scoreColor;
  ctx.font = `700 36px ${FONT_MONO}`;
  ctx.fillText(`${payload.asymmetry.overallScore}`, M + 20, y + 48);
  ctx.fillStyle = INK_MUTED;
  ctx.font = `600 13.5px ${FONT_MONO}`;
  ctx.fillText("/100", M + 76, y + 48);

  // Cleanly clamped verdict tag inside its own 200px score column (zero overflow past divider)
  ctx.fillStyle = scoreColor;
  ctx.font = `700 10.5px ${FONT_SANS}`;
  const shortVerdict = wrapTextLines(
    ctx,
    payload.asymmetry.verdictTagVi.toUpperCase(),
    196,
    2
  );
  shortVerdict.forEach((ln, lIdx) => {
    ctx.fillText(ln, M + 20, y + 68 + lIdx * 14);
  });

  // Vertical hairline divider at M + 230
  const dividerX = M + 230;
  ctx.strokeStyle = HAIRLINE;
  ctx.beginPath();
  ctx.moveTo(dividerX, y + 14);
  ctx.lineTo(dividerX, y + stripH - 14);
  ctx.stroke();

  const summaryX = dividerX + 22;
  const summaryW = contentW - (summaryX - M) - 20;
  ctx.fillStyle = INK_PRIMARY;
  ctx.font = `700 15.5px ${FONT_SANS}`;
  drawWrappedText(ctx, payload.asymmetry.headlineVi, summaryX, y + 32, summaryW, 21, 1);

  ctx.fillStyle = INK_SECONDARY;
  ctx.font = `400 12.8px ${FONT_SANS}`;
  drawWrappedText(ctx, payload.asymmetry.summaryVi, summaryX, y + 55, summaryW, 18, 2);

  y += stripH + 18;

  // Diagnostic rows (2-column sharp architectural grid for up to 6 zones)
  const issuesToShow = payload.asymmetry.issues.slice(0, 6);
  const cardGap = 18;
  const cardW = (contentW - cardGap) / 2;
  const cardH = 206;

  issuesToShow.forEach((issue, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = M + col * (cardW + cardGap);
    const cy = y + row * (cardH + 14);
    const isFixFirst = issue.severity === "fix_first";
    const isMinor = issue.severity === "minor_tweak";

    ctx.fillStyle = isFixFirst ? SIGNAL_RED_SOFT : "#FFFFFF";
    ctx.fillRect(cx, cy, cardW, cardH);

    ctx.strokeStyle = isFixFirst ? "#FCA5A5" : HAIRLINE;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx, cy, cardW, cardH);

    // Top thin status rule (3px)
    ctx.fillStyle = isFixFirst ? SIGNAL_RED : isMinor ? SIGNAL_AMBER : SIGNAL_EMERALD;
    ctx.fillRect(cx, cy, cardW, 3);

    // Row 1: Number + Zone Label (left) + Concise Severity Tag ONLY (right) — zero collision!
    const numStr = `0${idx + 1}`;
    ctx.fillStyle = isFixFirst ? SIGNAL_RED : isMinor ? SIGNAL_AMBER : INK_MUTED;
    ctx.font = `700 13px ${FONT_MONO}`;
    ctx.fillText(numStr, cx + 16, cy + 27);

    ctx.fillStyle = INK_PRIMARY;
    ctx.font = `700 14.5px ${FONT_SANS}`;
    const maxTitleW = cardW - 146;
    const clampedTitle = wrapTextLines(ctx, issue.zoneLabelVi, maxTitleW, 1)[0] ?? issue.zoneLabelVi;
    ctx.fillText(clampedTitle, cx + 44, cy + 27);

    ctx.textAlign = "right";
    ctx.fillStyle = isFixFirst ? SIGNAL_RED : isMinor ? SIGNAL_AMBER : SIGNAL_EMERALD;
    ctx.font = `700 10.5px ${FONT_MONO}`;
    ctx.fillText(issue.severityTagVi.toUpperCase(), cx + cardW - 16, cy + 26);
    ctx.textAlign = "left";

    // Row 2: Dedicated full-width mono telemetry line for measuredDeltaVi
    ctx.fillStyle = isFixFirst ? "#991B1B" : isMinor ? "#92400E" : "#3F3F46";
    ctx.font = `600 11.5px ${FONT_MONO}`;
    const clampedDelta =
      wrapTextLines(ctx, issue.measuredDeltaVi, cardW - 32, 1)[0] ?? issue.measuredDeltaVi;
    ctx.fillText(clampedDelta, cx + 16, cy + 48);

    // Row 3: Brutal diagnosis line
    ctx.fillStyle = INK_PRIMARY;
    ctx.font = `600 12.5px ${FONT_SANS}`;
    const afterDiagY = drawWrappedText(
      ctx,
      issue.brutalCalloutVi,
      cx + 16,
      cy + 71,
      cardW - 32,
      18,
      2
    );

    // Row 4: Actionable repair steps
    const repairText = issue.fixStepsVi.slice(0, 2).join(" • ");
    ctx.fillStyle = INK_SECONDARY;
    ctx.font = `400 12px ${FONT_SANS}`;
    drawWrappedText(
      ctx,
      `Cách sửa: ${repairText}`,
      cx + 16,
      Math.max(afterDiagY + 6, cy + 111),
      cardW - 32,
      17.5,
      3
    );

    // Bottom short repair anchor cue
    ctx.strokeStyle = isFixFirst ? "#FECACA" : "#EFEFEF";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 16, cy + cardH - 30);
    ctx.lineTo(cx + cardW - 16, cy + cardH - 30);
    ctx.stroke();

    ctx.fillStyle = INK_MUTED;
    ctx.font = `600 11px ${FONT_MONO}`;
    const clampedCue =
      wrapTextLines(ctx, `Mục tiêu: ${issue.stickerFixVi}`, cardW - 32, 1)[0] ??
      issue.stickerFixVi;
    ctx.fillText(clampedCue, cx + 16, cy + cardH - 12);
  });

  drawPageFooter(ctx, W, H, M, "Trang 01 / 02 · Tông da & Chẩn đoán bất đối xứng");
  return canvas;
}

/**
 * Renders Page 2 of the A4 Editorial Report (1240 x 1754 px):
 * - Masthead
 * - Section 03: Automatic Face Shape & 3 Contour/Highlight Tips
 * - Section 04: Curated Product Recommendations (Dual swatches + Match % + Price)
 * - Section 05: Daily Makeup Execution Cheat-Sheet
 */
export function renderReportPage2Canvas(
  payload: BeautyReportPayload
): HTMLCanvasElement {
  const W = 1240;
  const H = 1754;
  const M = 64;
  const contentW = W - M * 2;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  let y = drawPageMasthead(
    ctx,
    W,
    M,
    payload.generatedDateVi,
    "TRANG 02 / 02",
    payload.confidence.score
  );

  // --- SECTION 03: Auto Face Shape & 3 Contour / Highlight Tips ---
  y = drawSectionHeading(
    ctx,
    "03",
    `Phân tích Dáng mặt: ${payload.faceShape.primaryVi}`,
    payload.faceShape.ratiosText,
    M,
    y,
    contentW
  );

  ctx.fillStyle = INK_SECONDARY;
  ctx.font = `400 14px ${FONT_SANS}`;
  y = drawWrappedText(ctx, payload.faceShape.summaryVi, M, y + 2, contentW, 21, 2);
  y += 16;

  // 3-Column Contour/Highlight Tips
  const tipGap = 18;
  const tipW = (contentW - tipGap * 2) / 3;
  const tipH = 192;

  payload.faceShape.tips.forEach((tip, idx) => {
    const tx = M + idx * (tipW + tipGap);
    ctx.fillStyle = SURFACE_SUBTLE;
    ctx.fillRect(tx, y, tipW, tipH);
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(tx, y, tipW, tipH);

    ctx.fillStyle = INK_PRIMARY;
    ctx.font = `700 12px ${FONT_MONO}`;
    ctx.fillText(`MẸO 0${idx + 1}`, tx + 18, y + 28);

    ctx.fillStyle = INK_PRIMARY;
    ctx.font = `700 14.5px ${FONT_SANS}`;
    const afterTitleY = drawWrappedText(ctx, tip.titleVi, tx + 18, y + 54, tipW - 36, 20, 2);

    ctx.fillStyle = INK_SECONDARY;
    ctx.font = `400 12.5px ${FONT_SANS}`;
    drawWrappedText(ctx, tip.detailVi, tx + 18, afterTitleY + 8, tipW - 36, 18.5, 5);
  });

  y += tipH + 46;

  // --- SECTION 04: Curated Product Recommendations ---
  y = drawSectionHeading(
    ctx,
    "04",
    "Gợi ý Mỹ phẩm chuẩn tông da & ngân sách sinh viên",
    `${payload.products.length} sản phẩm khớp CIELAB ΔE thấp nhất`,
    M,
    y,
    contentW
  );

  const prodGap = 16;
  const prodW = (contentW - prodGap) / 2;
  const prodH = 148;
  const productsToShow = payload.products.slice(0, 8);

  if (productsToShow.length === 0) {
    ctx.fillStyle = SURFACE_SUBTLE;
    ctx.fillRect(M, y, contentW, 90);
    ctx.strokeStyle = HAIRLINE;
    ctx.strokeRect(M, y, contentW, 90);
    ctx.fillStyle = INK_MUTED;
    ctx.font = `500 14px ${FONT_SANS}`;
    ctx.fillText("Chưa có dữ liệu sản phẩm phù hợp để hiển thị trong báo cáo.", M + 20, y + 50);
    y += 116;
  } else {
    productsToShow.forEach((prod, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const px = M + col * (prodW + prodGap);
      const py = y + row * (prodH + 14);

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(px, py, prodW, prodH);
      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(px, py, prodW, prodH);

      // Left swatch block (dual tube + rendered-on-lip for lipsticks)
      const swW = 92;
      if (prod.productType === "lipstick" && prod.renderedHex) {
        ctx.fillStyle = prod.swatchHex;
        ctx.fillRect(px, py, swW, prodH * 0.5);
        ctx.fillStyle = prod.renderedHex;
        ctx.fillRect(px, py + prodH * 0.5, swW, prodH * 0.5);

        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(px, py + prodH * 0.5 - 18, swW, 18);
        ctx.fillRect(px, py + prodH - 18, swW, 18);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `600 9.5px ${FONT_SANS}`;
        ctx.fillText("Màu thỏi", px + 8, py + prodH * 0.5 - 5);
        ctx.fillText("Lên môi bạn", px + 8, py + prodH - 5);
      } else {
        ctx.fillStyle = prod.swatchHex;
        ctx.fillRect(px, py, swW, prodH);
        ctx.fillStyle = "rgba(0,0,0,0.42)";
        ctx.fillRect(px, py + prodH - 20, swW, 20);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `600 10px ${FONT_MONO}`;
        ctx.fillText(prod.swatchHex.toUpperCase(), px + 8, py + prodH - 6);
      }

      // Vertical hairline separating swatch and text
      ctx.strokeStyle = HAIRLINE;
      ctx.beginPath();
      ctx.moveTo(px + swW, py);
      ctx.lineTo(px + swW, py + prodH);
      ctx.stroke();

      // Right details
      const tx = px + swW + 16;
      const tw = prodW - swW - 30;

      ctx.fillStyle = INK_MUTED;
      ctx.font = `600 11px ${FONT_SANS}`;
      ctx.fillText(`${prod.brand}  ·  ${prod.categoryVi}`, tx, py + 24);

      ctx.textAlign = "right";
      ctx.fillStyle = prod.matchPercent >= 90 ? SIGNAL_EMERALD : INK_PRIMARY;
      ctx.font = `700 12.5px ${FONT_MONO}`;
      ctx.fillText(`${prod.matchPercent}% hợp`, px + prodW - 14, py + 24);
      ctx.textAlign = "left";

      ctx.fillStyle = INK_PRIMARY;
      ctx.font = `700 14.5px ${FONT_SANS}`;
      const afterNameY = drawWrappedText(ctx, prod.name, tx, py + 47, tw, 19, 2);

      ctx.fillStyle = INK_SECONDARY;
      ctx.font = `500 12.5px ${FONT_SANS}`;
      const shadeLine = wrapTextLines(ctx, `Màu: ${prod.shade}`, tw, 1)[0] ?? prod.shade;
      ctx.fillText(shadeLine, tx, Math.min(afterNameY + 4, py + 92));

      // Footer row: Price + Student suitability traits
      ctx.fillStyle = INK_PRIMARY;
      ctx.font = `700 12.5px ${FONT_MONO}`;
      ctx.fillText(prod.priceRangeVi, tx, py + prodH - 16);

      ctx.textAlign = "right";
      ctx.fillStyle = SIGNAL_RED;
      ctx.font = `600 11.5px ${FONT_SANS}`;
      ctx.fillText(prod.tagsVi.join(" · "), px + prodW - 14, py + prodH - 16);
      ctx.textAlign = "left";
    });

    const rowsUsed = Math.ceil(productsToShow.length / 2);
    y += rowsUsed * (prodH + 14) + 28;
  }

  // --- SECTION 05: Execution Cheat-Sheet (if space permits) ---
  if (y < H - 250) {
    y = drawSectionHeading(
      ctx,
      "05",
      "Tóm tắt kỹ thuật trang điểm áp dụng hằng ngày",
      "Chuẩn theo cấu trúc mặt & tông da",
      M,
      y,
      contentW
    );

    const execItems = [
      { label: "Tạo khối (Contour)", text: payload.executionGuide.contour },
      { label: "Phấn má (Blush)", text: payload.executionGuide.blush },
      { label: "Son môi (Lip)", text: payload.executionGuide.lip },
      { label: "Mắt (Eyes)", text: payload.executionGuide.eyes },
    ];

    const colW = (contentW - 24) / 2;
    const rowH = Math.min(92, Math.floor((H - M - 40 - y) / 2));

    execItems.forEach((item, idx) => {
      const ex = M + (idx % 2) * (colW + 24);
      const ey = y + Math.floor(idx / 2) * rowH;

      ctx.fillStyle = INK_PRIMARY;
      ctx.font = `700 13px ${FONT_SANS}`;
      ctx.fillText(item.label, ex, ey + 14);

      ctx.fillStyle = INK_SECONDARY;
      ctx.font = `400 12px ${FONT_SANS}`;
      drawWrappedText(ctx, item.text, ex, ey + 34, colW, 17, 3);
    });
  }

  drawPageFooter(ctx, W, H, M, "Trang 02 / 02 · Dáng mặt & Gợi ý mỹ phẩm");
  return canvas;
}

/**
 * Generates both A4 pages as high-resolution canvases + preview data URLs + ready-to-save
 * PNG (stitched HD editorial poster) and binary A4 PDF.
 */
export interface GeneratedBeautyReportBundle {
  fileBaseName: string;
  page1DataUrl: string;
  page2DataUrl: string;
  posterPngDataUrl: string;
  pdfBytes: Uint8Array;
}

export function generateBeautyReportBundle(
  input: BuildBeautyReportPayloadInput
): GeneratedBeautyReportBundle {
  const { payload, audit } = buildBeautyReportPayload(input);
  const page1Canvas = renderReportPage1Canvas(input.report, payload, audit);
  const page2Canvas = renderReportPage2Canvas(payload);

  const page1DataUrl = page1Canvas.toDataURL("image/png");
  const page2DataUrl = page2Canvas.toDataURL("image/png");

  // Build crisp 2-page A4 PDF embedding high-quality JPEG streams (92% quality at 1240x1754)
  const p1Jpeg = dataUrlToBytes(page1Canvas.toDataURL("image/jpeg", 0.92));
  const p2Jpeg = dataUrlToBytes(page2Canvas.toDataURL("image/jpeg", 0.92));
  const pdfBytes = buildA4PdfFromJpegPages([
    { jpegBytes: p1Jpeg, widthPx: page1Canvas.width, heightPx: page1Canvas.height },
    { jpegBytes: p2Jpeg, widthPx: page2Canvas.width, heightPx: page2Canvas.height },
  ]);

  // Build unified HD vertical editorial poster PNG (both pages seamlessly stacked with crisp divider)
  const posterCanvas = document.createElement("canvas");
  posterCanvas.width = page1Canvas.width;
  posterCanvas.height = page1Canvas.height + page2Canvas.height;
  const pCtx = posterCanvas.getContext("2d");
  if (pCtx) {
    pCtx.fillStyle = "#FFFFFF";
    pCtx.fillRect(0, 0, posterCanvas.width, posterCanvas.height);
    pCtx.drawImage(page1Canvas, 0, 0);
    pCtx.drawImage(page2Canvas, 0, page1Canvas.height);
    pCtx.fillStyle = HAIRLINE;
    pCtx.fillRect(64, page1Canvas.height - 1, posterCanvas.width - 128, 2);
  }
  const posterPngDataUrl = posterCanvas.toDataURL("image/png");

  // Keep drawRoundedRect exported/used cleanly without unused warning
  void drawRoundedRect;

  return {
    fileBaseName: payload.fileBaseName,
    page1DataUrl,
    page2DataUrl,
    posterPngDataUrl,
    pdfBytes,
  };
}
