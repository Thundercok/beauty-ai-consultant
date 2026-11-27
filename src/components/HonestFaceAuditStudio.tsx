import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Camera,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Sparkles,
  Target,
} from "lucide-react";
import { LipCompareSliderPortrait, type SliderSideSpec } from "./LipCompareSliderPortrait";
import type { DemoPortraitPreset } from "./PhotoPickerSheet";
import { PortraitCanvas } from "./PortraitCanvas";
import {
  buildHonestLandmarkAudit,
  computePerimeterCalloutSlots,
  type HonestAuditIssue,
  type HonestAuditZoneId,
  type Point2D,
} from "../lib/beauty/honestLandmarkAudit";
import type { VirtualMakeupOptions } from "../lib/beauty/virtualMakeup";
import type {
  ConsultationReport,
  FaceLandmarksBox,
  MatchedProduct,
} from "../lib/beauty/types";

type StudioViewMode = "cues" | "slider" | "makeup";
type MakeupStrength = "natural" | "defined";

interface HonestFaceAuditStudioProps {
  report: ConsultationReport;
  faceBox: FaceLandmarksBox;
  topLipstick: MatchedProduct | null;
  topBlush: MatchedProduct | null;
  topEyeshadow: MatchedProduct | null;
  demoPresets: DemoPortraitPreset[];
  activeDemoId: string | null;
  onSelectDemo: (preset: DemoPortraitPreset) => void;
  onOpenPhotoPicker: () => void;
}

const ZONE_SHORT_LABELS: Record<HonestAuditZoneId, string> = {
  brows: "Chân mày",
  contour_jaw: "Khối hàm",
  shine_oil: "Bóng dầu",
  nose: "Mũi",
  eyes: "Mắt",
  thirds_lips: "3 tầng & Môi",
};

const ZONE_FILTER_ORDER: HonestAuditZoneId[] = [
  "brows",
  "contour_jaw",
  "shine_oil",
  "nose",
  "eyes",
  "thirds_lips",
];

function buildPolylinePath(points: Point2D[], closed = false): string {
  if (points.length === 0) return "";
  const base = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  return closed ? `${base} Z` : base;
}

function buildArrowHeadPath(from: Point2D, to: Point2D, headSize: number): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 6;
  const x1 = to.x - headSize * Math.cos(angle - spread);
  const y1 = to.y - headSize * Math.sin(angle - spread);
  const x2 = to.x - headSize * Math.cos(angle + spread);
  const y2 = to.y - headSize * Math.sin(angle + spread);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${to.x.toFixed(1)} ${to.y.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/**
 * Projects raw image pixel coordinates into exact rendered container pixel coordinates
 * matching object-cover + object-top (SVG preserveAspectRatio="xMidYMin slice").
 */
function projectImagePointToFramePx(
  pt: Point2D,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number
): Point2D {
  if (imgW <= 0 || imgH <= 0 || frameW <= 0 || frameH <= 0) {
    return { x: frameW * 0.5, y: frameH * 0.5 };
  }
  const scale = Math.max(frameW / imgW, frameH / imgH);
  const renderedW = imgW * scale;
  const offsetX = (frameW - renderedW) * 0.5;
  return {
    x: pt.x * scale + offsetX,
    y: pt.y * scale,
  };
}

export const HonestFaceAuditStudio: React.FC<HonestFaceAuditStudioProps> = ({
  report,
  faceBox,
  topLipstick,
  topBlush,
  topEyeshadow,
  demoPresets,
  activeDemoId,
  onSelectDemo,
  onOpenPhotoPicker,
}) => {
  const svgUid = useId().replace(/:/g, "");
  const portraitFrameRef = useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>({ w: 460, h: 520 });

  const audit = useMemo(() => buildHonestLandmarkAudit(report, faceBox), [report, faceBox]);

  const [viewMode, setViewMode] = useState<StudioViewMode>("cues");
  const [photoLighting, setPhotoLighting] = useState<"original" | "corrected">("original");
  const [focusedZone, setFocusedZone] = useState<HonestAuditZoneId | "all">("all");
  const [showRedMarkers, setShowRedMarkers] = useState(true);
  const [showCuesOnMakeup, setShowCuesOnMakeup] = useState(false);
  const [splitPct, setSplitPct] = useState(50);

  const [makeupStrength, setMakeupStrength] = useState<MakeupStrength>("natural");
  const [layers, setLayers] = useState({
    brow: true,
    contour: true,
    eyeshadow: true,
    blush: true,
    lip: true,
  });

  useEffect(() => {
    const el = portraitFrameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setFrameSize({ w: rect.width, h: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode]);

  const strengthMult = makeupStrength === "defined" ? 1.48 : 1.05;

  const bareMakeup: VirtualMakeupOptions = useMemo(
    () => ({
      lipEnabled: false,
      blushEnabled: false,
      browEnabled: false,
      contourEnabled: false,
      eyeshadowEnabled: false,
    }),
    []
  );

  const realCorrectiveMakeup: VirtualMakeupOptions = useMemo(() => {
    const plan = audit.realMakeupPlan;
    return {
      faceShape: report.faceShape.primary,
      browEnabled: layers.brow,
      browHex: plan.browHex,
      browIntensity: Math.min(0.55, 0.36 * strengthMult),
      browLiftSide: plan.browLiftSide,
      browLiftPx: plan.browLiftPx * (makeupStrength === "defined" ? 1.2 : 1.0),
      contourEnabled: layers.contour,
      contourHex: plan.contourHex,
      highlightHex: plan.highlightHex,
      contourIntensity: Math.min(0.54, 0.33 * strengthMult),
      widerJawSide: plan.widerJawSide,
      noseContourStrength: Math.min(0.45, plan.noseContourStrength * strengthMult),
      eyeshadowEnabled: layers.eyeshadow,
      eyeshadowHex: topEyeshadow?.hex ?? plan.eyeshadowHex,
      eyeshadowIntensity: Math.min(0.46, 0.28 * strengthMult),
      droopingEyeSide: plan.droopingEyeSide,
      blushEnabled: layers.blush,
      blushHex: topBlush?.hex ?? "#D98A8C",
      blushIntensity: Math.min(0.42, 0.25 * strengthMult),
      blushLiftSide: plan.lowerCheekSide,
      lipEnabled: layers.lip,
      lipHex: topLipstick?.hex ?? "#B6535E",
      lipTexture: topLipstick?.texture ?? "Velvet Lip",
      lipThickness: makeupStrength === "defined" ? 1.15 : 0.82,
    };
  }, [
    audit.realMakeupPlan,
    layers,
    strengthMult,
    makeupStrength,
    report.faceShape.primary,
    topLipstick,
    topBlush,
    topEyeshadow,
  ]);

  const activeLayerCount = Object.values(layers).filter(Boolean).length;

  const sliderLeftSide: SliderSideSpec = useMemo(
    () => ({
      prefix: "Ảnh gốc",
      label: "Mặt mộc",
      footerCaption: "Trước · Mặt mộc",
      swatchHex: report.lipMetrics.lipBaseHex,
      makeup: bareMakeup,
    }),
    [report.lipMetrics.lipBaseHex, bareMakeup]
  );

  const sliderRightSide: SliderSideSpec = useMemo(
    () => ({
      prefix: "Real Makeup",
      label: `${activeLayerCount} lớp chỉnh`,
      footerCaption:
        makeupStrength === "defined" ? "Sau · Makeup rõ nét" : "Sau · Makeup tự nhiên",
      swatchHex: topLipstick?.renderedHex ?? topLipstick?.hex ?? "#B6535E",
      makeup: realCorrectiveMakeup,
      isSelected: true,
    }),
    [activeLayerCount, makeupStrength, topLipstick, realCorrectiveMakeup]
  );

  // In overview ("all"), only draw surgical red overlays for actual non-balanced asymmetries
  const visibleIssues = useMemo(() => {
    if (!audit.available) return [];
    if (focusedZone === "all") {
      return audit.issues.filter((i) => i.severity !== "balanced");
    }
    return audit.issues.filter((i) => i.id === focusedZone);
  }, [audit.available, audit.issues, focusedZone]);

  const midlineX = (audit.midlineAxis.top.x + audit.midlineAxis.bottom.x) * 0.5;
  const calloutSlots = useMemo(() => {
    if (!audit.available) return [];
    return computePerimeterCalloutSlots(
      audit.issues,
      audit.width,
      audit.height,
      midlineX,
      focusedZone
    );
  }, [audit.available, audit.issues, audit.width, audit.height, midlineX, focusedZone]);

  const actionableCount = useMemo(
    () => audit.issues.filter((i) => i.severity !== "balanced").length,
    [audit.issues]
  );

  const handleToggleLayer = (key: keyof typeof layers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePreviewIssueFix = (issue: HonestAuditIssue) => {
    setFocusedZone(issue.id);
    setLayers((prev) => ({ ...prev, [issue.primaryMakeupLayer]: true }));
    setViewMode("slider");
    setSplitPct(50);
  };

  const handleSelectMarkerZone = (zoneId: HonestAuditZoneId) => {
    setFocusedZone((prev) => (prev === zoneId ? "all" : zoneId));
  };

  const blurId = `honest-blur-${svgUid}`;
  const shadowId = `honest-shadow-${svgUid}`;
  const redHatchId = `oil-hatch-red-${svgUid}`;
  const strokeUnit = Math.max(1.2, audit.width * 0.0034);
  const arrowHead = Math.max(4.6, audit.width * 0.0155);
  const dashUnit = Math.max(4, audit.width * 0.013);

  const showOverlayNow =
    audit.available && (viewMode === "cues" || (viewMode === "makeup" && showCuesOnMakeup));

  const renderSurgicalRedOverlaySvg = () => {
    if (!showOverlayNow) return null;

    return (
      <svg
        data-testid="honest-visual-cues-svg"
        data-focused-zone={focusedZone}
        viewBox={`0 0 ${audit.width} ${audit.height}`}
        preserveAspectRatio="xMidYMin slice"
        className="absolute inset-0 z-10 w-full h-full pointer-events-none select-none"
        aria-hidden="true"
      >
        <defs>
          <filter id={blurId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={Math.max(1.6, audit.width * 0.007)} />
          </filter>
          <filter id={shadowId} x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow
              dx="0"
              dy="1"
              stdDeviation="1.2"
              floodColor="#000000"
              floodOpacity="0.82"
            />
          </filter>
          <pattern
            id={redHatchId}
            width={Math.max(5, audit.width * 0.016)}
            height={Math.max(5, audit.width * 0.016)}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2={Math.max(5, audit.width * 0.016)}
              stroke="rgba(239, 68, 68, 0.42)"
              strokeWidth={Math.max(0.85, strokeUnit * 0.65)}
            />
          </pattern>
        </defs>

        {/* Precision Roll-Compensated Anatomical Midline Plumb Axis */}
        <line
          x1={audit.midlineAxis.top.x}
          y1={audit.midlineAxis.top.y}
          x2={audit.midlineAxis.bottom.x}
          y2={audit.midlineAxis.bottom.y}
          stroke="rgba(255,255,255,0.48)"
          strokeWidth={strokeUnit * 0.72}
          strokeDasharray={`${dashUnit} ${dashUnit * 0.9}`}
          filter={`url(#${shadowId})`}
        />

        {visibleIssues.map((issue) => {
          const isDefect = issue.severity !== "balanced";
          const signalStroke = isDefect ? "#EF4444" : "rgba(255,255,255,0.78)";
          const signalCore = isDefect ? "#DC2626" : "rgba(255,255,255,0.65)";

          return (
            <g key={issue.id} data-cue-zone={issue.id} data-severity={issue.severity}>
              {/* Geometric Contour / Oily Specular / Brow / Eye / Highlight Strokes */}
              {issue.strokes.map((st, sIdx) => {
                const d = buildPolylinePath(st.points, Boolean(st.closed));
                if (!d) return null;

                if (st.kind === "oil_zone") {
                  return (
                    <g key={`st-${sIdx}`} data-oil-zone="true">
                      <path
                        d={d}
                        fill={`url(#${redHatchId})`}
                        fillOpacity={st.weight === "strong" ? 0.95 : 0.65}
                        stroke={signalStroke}
                        strokeOpacity={0.95}
                        strokeWidth={strokeUnit * (st.weight === "strong" ? 1.3 : 1.0)}
                        strokeDasharray={`${dashUnit * 0.55} ${dashUnit * 0.42}`}
                        strokeLinejoin="round"
                        filter={`url(#${shadowId})`}
                      />
                    </g>
                  );
                }

                if (st.kind === "contour") {
                  const isStrong = st.weight === "strong";
                  return (
                    <g key={`st-${sIdx}`}>
                      <path
                        d={d}
                        fill="none"
                        stroke={isStrong ? "#DC2626" : "rgba(255,255,255,0.35)"}
                        strokeOpacity={isStrong ? 0.42 : 0.25}
                        strokeWidth={isStrong ? strokeUnit * 5.6 : strokeUnit * 2.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter={`url(#${blurId})`}
                      />
                      <path
                        d={d}
                        fill="none"
                        stroke={isStrong ? "#EF4444" : "rgba(255,255,255,0.58)"}
                        strokeWidth={strokeUnit * (isStrong ? 1.25 : 0.8)}
                        strokeDasharray={`${dashUnit * 0.65} ${dashUnit * 0.55}`}
                        strokeLinecap="round"
                        filter={`url(#${shadowId})`}
                      />
                    </g>
                  );
                }

                if (st.kind === "highlight") {
                  return (
                    <path
                      key={`st-${sIdx}`}
                      d={d}
                      fill="none"
                      stroke="rgba(255,255,255,0.88)"
                      strokeWidth={strokeUnit * 1.15}
                      strokeLinecap="round"
                      filter={`url(#${shadowId})`}
                    />
                  );
                }

                if (st.kind === "brow_fill") {
                  return (
                    <path
                      key={`st-${sIdx}`}
                      d={d}
                      fill="none"
                      stroke={signalStroke}
                      strokeWidth={strokeUnit * 1.45}
                      strokeDasharray={`${dashUnit * 0.55} ${dashUnit * 0.4}`}
                      strokeLinecap="round"
                      filter={`url(#${shadowId})`}
                    />
                  );
                }

                return (
                  <path
                    key={`st-${sIdx}`}
                    d={d}
                    fill="none"
                    stroke={signalStroke}
                    strokeWidth={strokeUnit * 1.3}
                    strokeLinecap="round"
                    filter={`url(#${shadowId})`}
                  />
                );
              })}

              {/* Calibrated Horizontal Reference & Axis Lines */}
              {issue.lines.map((ln, lIdx) => (
                <line
                  key={`ln-${lIdx}`}
                  x1={ln.x1}
                  y1={ln.y1}
                  x2={ln.x2}
                  y2={ln.y2}
                  stroke={
                    ln.kind === "reference"
                      ? signalStroke
                      : ln.kind === "measured"
                        ? "rgba(255, 255, 255, 0.85)"
                        : "rgba(255, 255, 255, 0.42)"
                  }
                  strokeWidth={strokeUnit * (ln.kind === "reference" ? 1.05 : 0.82)}
                  strokeDasharray={
                    ln.kind === "measured" ? undefined : `${dashUnit * 0.65} ${dashUnit * 0.55}`
                  }
                  filter={`url(#${shadowId})`}
                />
              ))}

              {/* Signal Red Directional Repair Vectors */}
              {issue.arrows.map((arr, aIdx) => (
                <g key={`arr-${aIdx}`} filter={`url(#${shadowId})`}>
                  <line
                    x1={arr.from.x}
                    y1={arr.from.y}
                    x2={arr.to.x}
                    y2={arr.to.y}
                    stroke="#FFFFFF"
                    strokeWidth={strokeUnit * 2.25}
                    strokeLinecap="round"
                    opacity={0.75}
                  />
                  <line
                    x1={arr.from.x}
                    y1={arr.from.y}
                    x2={arr.to.x}
                    y2={arr.to.y}
                    stroke={signalCore}
                    strokeWidth={strokeUnit * 1.45}
                    strokeLinecap="round"
                  />
                  <path
                    d={buildArrowHeadPath(arr.from, arr.to, arrowHead)}
                    fill="none"
                    stroke={signalCore}
                    strokeWidth={strokeUnit * 1.55}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    );
  };

  /**
   * Renders numbered crimson-red surgical markers (01, 02, 03) directly on asymmetric
   * facial landmarks, linked via pixel-exact red orthogonal leader lines to sharp-edged,
   * actionable repair callout tags tucked cleanly into left/right portrait margins.
   */
  const renderRedMarkerCallouts = () => {
    if (!showOverlayNow || !showRedMarkers || calloutSlots.length === 0) return null;

    const isCompact = frameSize.w < 390;
    const stickerMaxW = isCompact ? 116 : 168;
    const edgeInset = isCompact ? 6 : 12;

    return (
      <div
        data-testid="honest-callout-stickers"
        className="absolute inset-0 z-15 pointer-events-none select-none"
      >
        {/* Pixel-Exact Red Leader Lines & Numbered Target Reticles */}
        <svg
          data-testid="honest-red-markers"
          width={frameSize.w}
          height={frameSize.h}
          viewBox={`0 0 ${frameSize.w} ${frameSize.h}`}
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          {calloutSlots.map((slot) => {
            const anchorPx = projectImagePointToFramePx(
              slot.issue.calloutAnchor,
              audit.width,
              audit.height,
              frameSize.w,
              frameSize.h
            );
            const stickerCenterY = slot.stickerYNorm * frameSize.h;
            const stickerInnerEdgeX =
              slot.side === "left"
                ? Math.min(anchorPx.x - 12, edgeInset + stickerMaxW)
                : Math.max(anchorPx.x + 12, frameSize.w - edgeInset - stickerMaxW);
            const elbowX =
              slot.side === "left"
                ? Math.max(stickerInnerEdgeX + 8, (anchorPx.x + stickerInnerEdgeX) * 0.5)
                : Math.min(stickerInnerEdgeX - 8, (anchorPx.x + stickerInnerEdgeX) * 0.5);

            const isDefect = slot.issue.severity !== "balanced";
            const lineHex = isDefect ? "#EF4444" : "#E5E5E5";
            const badgeFill = isDefect ? "#DC2626" : "#111111";

            return (
              <g key={`leader-${slot.issue.id}`} data-red-marker={isDefect ? "true" : "false"}>
                {/* High-contrast dark backing for universal readability on light/dark skin */}
                <polyline
                  points={`${anchorPx.x.toFixed(1)},${anchorPx.y.toFixed(1)} ${elbowX.toFixed(1)},${stickerCenterY.toFixed(1)} ${stickerInnerEdgeX.toFixed(1)},${stickerCenterY.toFixed(1)}`}
                  fill="none"
                  stroke="rgba(0,0,0,0.72)"
                  strokeWidth="2.8"
                  strokeLinejoin="miter"
                />
                <polyline
                  points={`${anchorPx.x.toFixed(1)},${anchorPx.y.toFixed(1)} ${elbowX.toFixed(1)},${stickerCenterY.toFixed(1)} ${stickerInnerEdgeX.toFixed(1)},${stickerCenterY.toFixed(1)}`}
                  fill="none"
                  stroke={lineHex}
                  strokeWidth="1.4"
                  strokeLinejoin="miter"
                />

                {/* Outer surgical reticle halo */}
                <circle
                  cx={anchorPx.x}
                  cy={anchorPx.y}
                  r="11"
                  fill="none"
                  stroke={lineHex}
                  strokeWidth="1"
                  strokeOpacity="0.65"
                />
                {/* Crisp numbered crimson marker directly over the detected landmark */}
                <circle
                  cx={anchorPx.x}
                  cy={anchorPx.y}
                  r="8"
                  fill={badgeFill}
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
                <text
                  x={anchorPx.x}
                  y={anchorPx.y + 3}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="8.5"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {slot.markerIndex}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Sharp-Edged Architectural Repair Advice Tags in Left/Right Perimeter Margins */}
        {calloutSlots.map((slot) => {
          const isActive = focusedZone === slot.issue.id;
          const isDefect = slot.issue.severity !== "balanced";

          return (
            <button
              key={`sticker-${slot.issue.id}`}
              type="button"
              data-testid={`callout-sticker-${slot.issue.id}`}
              onClick={() => handleSelectMarkerZone(slot.issue.id)}
              style={{
                top: `${(slot.stickerYNorm * 100).toFixed(2)}%`,
                maxWidth: `${stickerMaxW}px`,
                ...(slot.side === "left" ? { left: `${edgeInset}px` } : { right: `${edgeInset}px` }),
              }}
              className={`pointer-events-auto absolute -translate-y-1/2 rounded-[3px] px-2 py-1.5 sm:px-2.5 text-left transition-colors duration-150 cursor-pointer border-t-2 border-x border-b ${
                isActive
                  ? "bg-[#111111]/96 border-t-[#EF4444] border-x-white/30 border-b-white/30 shadow-lg"
                  : isDefect
                    ? "bg-[#111111]/88 hover:bg-[#111111]/96 border-t-[#DC2626] border-x-white/15 border-b-white/15 shadow-md"
                    : "bg-[#111111]/84 hover:bg-[#111111]/94 border-t-white/60 border-x-white/15 border-b-white/15 shadow-md"
              }`}
            >
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span
                  className={`font-mono tabular-nums text-[9px] sm:text-[10px] font-bold shrink-0 ${
                    isDefect ? "text-[#F87171]" : "text-white/65"
                  }`}
                >
                  0{slot.markerIndex}
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold text-white leading-tight line-clamp-2">
                  {slot.issue.stickerTitleVi}
                </span>
              </div>
              <div className="text-[9px] sm:text-[10px] text-white/80 leading-snug mt-0.5 line-clamp-2">
                {slot.issue.stickerFixVi}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const scoreColorClass =
    audit.overallBalanceScore >= 85
      ? "text-[#111111]"
      : audit.overallBalanceScore >= 72
        ? "text-[#B45309]"
        : "text-[#DC2626]";

  const scoreBarClass =
    audit.overallBalanceScore >= 85
      ? "bg-[#111111]"
      : audit.overallBalanceScore >= 72
        ? "bg-[#D97706]"
        : "bg-[#DC2626]";

  return (
    <section
      data-testid="honest-face-audit-studio"
      aria-label="Phân tích thẳng thắn điểm lệch khuôn mặt và mô phỏng Real Makeup"
      className="border border-[#E5E5E5] bg-white"
    >
      {/* Unified Studio Top Toolbar (Integrated 1px Hairline Row) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-[#E5E5E5] bg-[#FAFAFA]">
        <div
          role="tablist"
          aria-label="Chế độ xem phân tích thẳng thắn trên ảnh thật"
          className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-0.5 bg-[#EFEFEF] rounded-[4px] w-full sm:w-auto"
        >
          {(
            [
              { id: "cues", label: "Ảnh gốc + Dấu đỏ", testId: "honest-mode-cues", icon: Target },
              {
                id: "slider",
                label: "Trượt Trước / Sau",
                testId: "honest-mode-slider",
                icon: SlidersHorizontal,
              },
              { id: "makeup", label: "Real Makeup", testId: "honest-mode-makeup", icon: Sparkles },
            ] as const
          ).map(({ id, label, testId, icon: Icon }) => {
            const active = viewMode === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                data-testid={testId}
                aria-selected={active}
                onClick={() => setViewMode(id)}
                className={`min-h-[34px] px-2.5 sm:px-3.5 py-1 rounded-[3px] text-[11px] sm:text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? "bg-white text-[#111111] font-semibold shadow-2xs"
                    : "text-[#666666] hover:text-[#111111]"
                }`}
              >
                <Icon className="hidden sm:inline-block w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5">
          <div
            role="group"
            aria-label="Chế độ ánh sáng ảnh thật"
            className="inline-grid grid-cols-2 gap-0.5 p-0.5 bg-[#EFEFEF] rounded-[4px]"
          >
            {(
              [
                { id: "original", label: "Ảnh gốc" },
                { id: "corrected", label: "Chuẩn sáng" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPhotoLighting(opt.id)}
                className={`min-h-[30px] px-2.5 rounded-[3px] text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  photoLighting === opt.id
                    ? "bg-white text-[#111111] font-semibold shadow-2xs"
                    : "text-[#666666] hover:text-[#111111]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onOpenPhotoPicker}
            className="min-h-[34px] px-3 rounded-[4px] border border-[#D4D4D4] bg-white hover:bg-[#111111] hover:text-white hover:border-[#111111] text-xs font-semibold text-[#111111] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Đổi ảnh thật</span>
          </button>
        </div>
      </div>

      {/* Unified Architectural 2-Column Split Studio (Zero Nested Cards-in-Cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:divide-x divide-[#E5E5E5] items-start">
        {/* Left Column: Portrait Canvas + Integrated Filter Bar + Integrated Real-Model Strip */}
        <div className="lg:col-span-5 lg:sticky lg:top-[60px] divide-y divide-[#E5E5E5]">
          {viewMode === "slider" ? (
            <div className="p-0">
              <LipCompareSliderPortrait
                report={report}
                box={faceBox}
                leftSide={sliderLeftSide}
                rightSide={sliderRightSide}
                zoomToLips={false}
                splitPct={splitPct}
                onSplitPctChange={setSplitPct}
                portraitMode={photoLighting}
                ariaLabel="Thanh trượt so sánh ảnh gốc mặt mộc và Real Makeup chỉnh lệch"
                hintText="Kéo so mặt mộc · Real Makeup"
                testId="honest-real-makeup-slider"
              />
            </div>
          ) : (
            <div
              ref={portraitFrameRef}
              className="relative h-[420px] sm:h-[470px] lg:h-[530px] w-full overflow-hidden bg-[#111111] select-none"
            >
              <PortraitCanvas
                report={report}
                mode={photoLighting}
                showOverlay={false}
                box={faceBox}
                virtualMakeup={viewMode === "makeup" ? realCorrectiveMakeup : bareMakeup}
                fit="cover"
                containerClassName="h-full w-full bg-[#111111]"
              />

              {renderSurgicalRedOverlaySvg()}
              {renderRedMarkerCallouts()}

              {/* Top Overlay Strip: Concise Context + Red Marker Visibility Toggle */}
              <div className="absolute top-3 inset-x-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
                <div className="px-2.5 py-1 rounded-[2px] bg-[#111111]/82 border border-white/15 text-[11px] font-medium text-white truncate">
                  {viewMode === "cues"
                    ? focusedZone === "all"
                      ? actionableCount > 0
                        ? `Ảnh gốc · ${actionableCount} điểm lệch cần sửa`
                        : "Ảnh gốc · Không phát hiện điểm lệch rõ"
                      : `Đang soi · ${ZONE_SHORT_LABELS[focusedZone]}`
                    : `Real Makeup · ${activeLayerCount}/5 lớp`}
                </div>

                {viewMode === "cues" ? (
                  <button
                    type="button"
                    data-testid="toggle-fix-stickers-btn"
                    aria-pressed={showRedMarkers}
                    onClick={() => setShowRedMarkers((v) => !v)}
                    className={`pointer-events-auto min-h-[30px] px-2.5 rounded-[2px] border text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                      showRedMarkers
                        ? "bg-white text-[#111111] border-white"
                        : "bg-[#111111]/80 text-white border-white/25 hover:bg-[#111111]"
                    }`}
                  >
                    {showRedMarkers ? (
                      <>
                        <EyeOff className="w-3 h-3 shrink-0" />
                        <span>Ẩn dấu đỏ</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3 shrink-0" />
                        <span>Hiện dấu đỏ</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCuesOnMakeup((v) => !v)}
                    className="pointer-events-auto min-h-[30px] px-2.5 rounded-[2px] bg-[#111111]/80 hover:bg-[#111111] border border-white/20 text-[11px] font-medium text-white inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    {showCuesOnMakeup ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ẩn nét gióng</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Hiện nét gióng</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Measured Bottom Contrast Scrim Legend */}
              {viewMode === "cues" && audit.available && (
                <div className="absolute inset-x-0 bottom-0 z-20 pt-10 pb-3 px-3.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none flex items-center justify-between gap-3 text-[10px] sm:text-[11px] text-white/90">
                  <span>Dấu đỏ: điểm lệch &amp; hướng sửa trực tiếp</span>
                  <span className="font-mono tabular-nums text-white/75 shrink-0">
                    IPD {audit.pose.ipdPx.toFixed(0)}px
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Integrated Zone Filter OR Real Makeup Layer Strip */}
          <div className="px-4 py-3.5 space-y-2.5 bg-white">
            {viewMode === "cues" ? (
              <>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-[#111111]">Lọc vùng đo trên ảnh</span>
                  <span className="text-[#737373]">Chạm từng vùng để cô lập nét đo</span>
                </div>
                <div
                  role="group"
                  aria-label="Lọc chỉ dẫn hình ảnh theo vùng khuôn mặt"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <button
                    type="button"
                    data-testid="cue-filter-all"
                    onClick={() => setFocusedZone("all")}
                    className={`min-h-[32px] px-2.5 rounded-[3px] text-[11px] font-medium border whitespace-nowrap transition-colors cursor-pointer ${
                      focusedZone === "all"
                        ? "bg-[#111111] text-white border-[#111111] font-semibold"
                        : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#111111] hover:text-[#111111]"
                    }`}
                  >
                    Tất cả điểm lệch ({actionableCount})
                  </button>
                  {ZONE_FILTER_ORDER.map((zoneId) => {
                    const active = focusedZone === zoneId;
                    const issueObj = audit.issues.find((i) => i.id === zoneId);
                    const isDefect = issueObj && issueObj.severity !== "balanced";
                    return (
                      <button
                        key={zoneId}
                        type="button"
                        data-testid={`cue-filter-${zoneId}`}
                        onClick={() => setFocusedZone(zoneId)}
                        className={`min-h-[32px] px-2.5 rounded-[3px] text-[11px] font-medium border whitespace-nowrap transition-colors cursor-pointer ${
                          active
                            ? "bg-[#DC2626] text-white border-[#DC2626] font-semibold"
                            : isDefect
                              ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA] hover:border-[#DC2626]"
                              : "bg-white text-[#737373] border-[#E5E5E5] hover:text-[#111111] hover:border-[#A3A3A3]"
                        }`}
                      >
                        {ZONE_SHORT_LABELS[zoneId]}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#111111]">
                    Lớp Real Makeup chỉnh lệch
                  </span>
                  <div
                    role="group"
                    aria-label="Mức độ trang điểm"
                    className="inline-grid grid-cols-2 gap-0.5 p-0.5 bg-[#EFEFEF] rounded-[4px]"
                  >
                    {(
                      [
                        { id: "natural", label: "Đi học nhẹ" },
                        { id: "defined", label: "Rõ nét" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`real-makeup-strength-${opt.id}`}
                        onClick={() => setMakeupStrength(opt.id)}
                        className={`min-h-[28px] px-2.5 rounded-[3px] text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          makeupStrength === opt.id
                            ? "bg-white text-[#111111] font-semibold shadow-2xs"
                            : "text-[#666666] hover:text-[#111111]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: "brow", label: "Chân mày" },
                      { key: "contour", label: "Khối & Sáng" },
                      { key: "eyeshadow", label: "Phấn mắt" },
                      { key: "blush", label: "Má hồng" },
                      { key: "lip", label: "Son môi" },
                    ] as const
                  ).map(({ key, label }) => {
                    const active = layers[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        data-testid={`real-layer-${key}`}
                        aria-pressed={active}
                        onClick={() => handleToggleLayer(key)}
                        className={`min-h-[32px] px-2.5 rounded-[3px] text-[11px] font-medium border whitespace-nowrap transition-colors cursor-pointer ${
                          active
                            ? "bg-[#111111] text-white border-[#111111] font-semibold"
                            : "bg-white text-[#666666] border-[#E5E5E5] hover:text-[#111111]"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Integrated Real Bare-Skin Photographic Model Strip */}
          <div className="px-4 py-3.5 space-y-2.5 bg-[#FAFAFA]">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-[#111111]">Mẫu ảnh thật mặt mộc</span>
              <button
                type="button"
                onClick={onOpenPhotoPicker}
                className="font-semibold text-[#DC2626] hover:text-[#991B1B] whitespace-nowrap cursor-pointer"
              >
                Tải ảnh của bạn
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {demoPresets.map((preset) => {
                const isSelected = activeDemoId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`real-model-${preset.id}`}
                    onClick={() => onSelectDemo(preset)}
                    className={`flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 p-1.5 rounded-[4px] border text-center sm:text-left transition-colors cursor-pointer min-w-0 ${
                      isSelected
                        ? "border-[#111111] bg-white ring-1 ring-[#111111]"
                        : "border-[#E5E5E5] bg-white hover:border-[#A3A3A3]"
                    }`}
                  >
                    <img
                      src={preset.url}
                      alt={preset.label}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 sm:w-8 sm:h-8 rounded-[2px] object-cover object-top shrink-0 bg-[#EFEFEF]"
                    />
                    <div className="min-w-0 w-full">
                      <div className="text-[11px] font-semibold text-[#111111] leading-tight line-clamp-2 sm:truncate">
                        {preset.label}
                      </div>
                      <div className="hidden sm:block text-[10px] text-[#737373] truncate">
                        {preset.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Editorial Brutally Honest Diagnostic Report */}
        <div className="lg:col-span-7 flex flex-col">
          {/* Top Verdict & 3D Pose Telemetry Header */}
          <div className="p-5 sm:p-7 space-y-4 border-b border-[#E5E5E5]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs text-[#737373]">
                Phản hồi thẳng thắn · Đo từ {report.landmarkCount} điểm chuẩn
              </span>
              {audit.available && (
                <div className={`text-sm font-bold font-mono tabular-nums ${scoreColorClass}`}>
                  {audit.overallBalanceScore}/100 · {audit.verdictTagVi}
                </div>
              )}
            </div>

            {audit.available && (
              <div className="h-[3px] w-full bg-[#EFEFEF] overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${scoreBarClass}`}
                  style={{ width: `${Math.max(10, audit.overallBalanceScore)}%` }}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <h2
                data-testid="honest-face-headline"
                className="text-xl sm:text-[24px] font-bold tracking-[-0.025em] text-[#111111] leading-snug"
              >
                {audit.brutalHeadlineVi}
              </h2>
              <p className="text-xs sm:text-sm text-[#525252] leading-relaxed">
                {audit.brutalSummaryVi}
              </p>
            </div>

            {audit.available && (
              <div className="grid grid-cols-3 gap-3 pt-3.5 border-t border-[#EAEAEA] text-xs">
                <div>
                  <div className="text-[11px] text-[#737373]">3 tầng mặt</div>
                  <div className="font-mono tabular-nums font-semibold text-[#111111] mt-0.5">
                    {audit.facialThirds.upperPct} / {audit.facialThirds.middlePct} /{" "}
                    {audit.facialThirds.lowerPct}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#737373]">Bù nghiêng · Xoay</div>
                  <div className="font-mono tabular-nums font-semibold text-[#111111] mt-0.5">
                    {Math.abs(audit.pose.rollDeg).toFixed(1)}° · {Math.abs(audit.pose.yawDeg).toFixed(1)}°
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#737373]">Hiệu chuẩn IPD</div>
                  <div className="font-mono tabular-nums font-semibold text-[#111111] mt-0.5">
                    1px ≈ {audit.pose.mmPerPx.toFixed(2)}mm
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Issue-by-Issue Brutally Honest Audit Rows */}
          {audit.available ? (
            <div data-testid="honest-landmark-issues" className="divide-y divide-[#EAEAEA]">
              {audit.issues.map((issue, idx) => {
                const isFocused = focusedZone === issue.id;
                const isDefect = issue.severity !== "balanced";
                const markerSlot = calloutSlots.find((s) => s.issue.id === issue.id);
                const severityTextClass =
                  issue.severity === "fix_first"
                    ? "text-[#DC2626]"
                    : issue.severity === "minor_tweak"
                      ? "text-[#B45309]"
                      : "text-[#737373]";

                return (
                  <article
                    key={issue.id}
                    data-testid={`honest-issue-${issue.id}`}
                    className={`px-5 sm:px-7 py-5 transition-colors ${
                      isFocused ? "bg-[#FAFAFA]" : "bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setFocusedZone(isFocused ? "all" : issue.id);
                          setViewMode("cues");
                        }}
                        className="text-left min-w-0 flex-1 group cursor-pointer"
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                          <span
                            className={`font-mono tabular-nums text-xs font-bold ${
                              markerSlot && isDefect
                                ? "text-[#DC2626]"
                                : isDefect
                                  ? "text-[#111111]"
                                  : "text-[#A3A3A3]"
                            }`}
                          >
                            0{markerSlot ? markerSlot.markerIndex : idx + 1}
                          </span>
                          <h3 className="text-sm font-bold text-[#111111] group-hover:text-[#DC2626] transition-colors">
                            {issue.zoneLabelVi}
                          </h3>
                          <span className="text-[#D4D4D4]" aria-hidden="true">
                            ·
                          </span>
                          <span className={`text-xs font-semibold ${severityTextClass}`}>
                            {issue.severityTagVi}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[#666666] mt-1">
                          {issue.measuredDeltaVi}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePreviewIssueFix(issue)}
                        className={`min-h-[32px] px-3 rounded-[3px] text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          isDefect
                            ? "border border-[#111111] bg-[#111111] hover:bg-[#DC2626] hover:border-[#DC2626] text-white"
                            : "border border-[#E5E5E5] bg-white hover:border-[#111111] text-[#525252] hover:text-[#111111]"
                        }`}
                      >
                        {isDefect ? "Thử sửa Makeup" : "Xem trên ảnh"}
                      </button>
                    </div>

                    <p className="text-xs sm:text-[13px] text-[#262626] leading-relaxed mt-2.5">
                      {issue.brutalCalloutVi}
                    </p>

                    <ul className="mt-2.5 space-y-1.5">
                      {issue.fixStepsVi.map((step, sIdx) => (
                        <li
                          key={sIdx}
                          className="flex items-start gap-2.5 text-xs text-[#525252] leading-relaxed"
                        >
                          <span className="font-mono tabular-nums text-[11px] font-semibold text-[#DC2626] pt-0.5 shrink-0">
                            →
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-xs text-[#525252] leading-relaxed">
              Chọn một mẫu ảnh thật bên trái hoặc bấm &ldquo;Đổi ảnh thật&rdquo; để chụp chính diện
              rõ ánh sáng.
            </div>
          )}

          {/* Honest Measurement Calibration Footnote */}
          <div className="px-5 sm:px-7 py-4 border-t border-[#E5E5E5] bg-[#FAFAFA] text-[11px] text-[#737373] leading-relaxed mt-auto">
            {audit.limitationNoteVi}
          </div>
        </div>
      </div>
    </section>
  );
};
