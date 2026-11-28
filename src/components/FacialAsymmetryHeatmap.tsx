import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Eye, EyeOff } from "lucide-react";
import { PortraitCanvas } from "./PortraitCanvas";
import {
  buildFacialAsymmetryHeatmap,
  heatToRgba,
  type AsymmetryHeatZone,
  type HeatmapZoneId,
} from "../lib/beauty/asymmetryHeatmap";
import type { ConsultationReport, FaceLandmarksBox } from "../lib/beauty/types";

interface FacialAsymmetryHeatmapProps {
  report: ConsultationReport;
  faceBox: FaceLandmarksBox;
  onOpenPhotoPicker: () => void;
}

type HeatOpacityPreset = "soft" | "medium" | "strong";

const HEAT_OPACITY_VALUES: Record<HeatOpacityPreset, number> = {
  soft: 0.45,
  medium: 0.72,
  strong: 0.92,
};

// Precomputed 256-entry perceptual RGBA lookup table from heatToRgba
const HEAT_LUT: Uint8ClampedArray = (() => {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b, a] = heatToRgba(i / 255);
    lut[i * 4] = r;
    lut[i * 4 + 1] = g;
    lut[i * 4 + 2] = b;
    lut[i * 4 + 3] = a;
  }
  return lut;
})();

function projectPointToCoverFramePct(
  pt: { x: number; y: number },
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number
): { leftPct: number; topPct: number } {
  if (imgW <= 0 || imgH <= 0 || frameW <= 0 || frameH <= 0) {
    return { leftPct: 50, topPct: 50 };
  }
  // Matches `object-cover object-top` / SVG `xMidYMin slice`
  const scale = Math.max(frameW / imgW, frameH / imgH);
  const drawW = imgW * scale;
  const offsetX = (frameW - drawW) * 0.5;
  const px = offsetX + pt.x * scale;
  const py = pt.y * scale;
  return {
    leftPct: Math.max(4, Math.min(96, (px / frameW) * 100)),
    topPct: Math.max(6, Math.min(94, (py / frameH) * 100)),
  };
}

export const FacialAsymmetryHeatmap: React.FC<FacialAsymmetryHeatmapProps> = ({
  report,
  faceBox,
  onOpenPhotoPicker,
}) => {
  const heatmap = useMemo(
    () => buildFacialAsymmetryHeatmap(report.neuralLandmarks),
    [report.neuralLandmarks]
  );

  const [photoMode, setPhotoMode] = useState<"corrected" | "original">("corrected");
  const [heatStrength, setHeatStrength] = useState<HeatOpacityPreset>("medium");
  const [showMidline, setShowMidline] = useState(true);
  const [hoveredZoneId, setHoveredZoneId] = useState<HeatmapZoneId | null>(null);
  const [pinnedZoneId, setPinnedZoneId] = useState<HeatmapZoneId | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>({ w: 400, h: 500 });

  // Reset pinned zone when switching portraits so the top variance zone is focused
  useEffect(() => {
    setHoveredZoneId(null);
    setPinnedZoneId(heatmap.zones[0]?.id ?? null);
  }, [report.width, report.height, report.landmarkCount, heatmap.zones]);

  // Measure frame container for clamped hover tooltip positioning
  useEffect(() => {
    const el = frameRef.current;
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
  }, []);

  const activeZoneId: HeatmapZoneId | null =
    hoveredZoneId ?? pinnedZoneId ?? heatmap.zones[0]?.id ?? null;

  const activeZone: AsymmetryHeatZone | null = useMemo(
    () => heatmap.zones.find((z) => z.id === activeZoneId) ?? heatmap.zones[0] ?? null,
    [heatmap.zones, activeZoneId]
  );

  const hoveredZone: AsymmetryHeatZone | null = useMemo(
    () => (hoveredZoneId ? heatmap.zones.find((z) => z.id === hoveredZoneId) ?? null : null),
    [heatmap.zones, hoveredZoneId]
  );

  // Paint smooth non-saturating Gaussian thermal field directly onto the aligned canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmap.available || report.width <= 0 || report.height <= 0) return;

    // Fast continuous Gaussian kernel grid (max 220px side, bilinearly upscaled smoothly by CSS)
    const maxDim = 220;
    const scale = Math.min(1, maxDim / Math.max(report.width, report.height));
    const cw = Math.max(1, Math.round(report.width * scale));
    const ch = Math.max(1, Math.round(report.height * scale));
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const out = ctx.createImageData(cw, ch);
    const oData = out.data;

    // Tight Gaussian sigma so each anatomical cluster blooms locally without saturating the whole face
    const baseSigma = Math.max(7, heatmap.faceWidthPx * 0.088 * scale);

    // Precompute emitters: zone-level heat scaled per landmark so balanced areas stay subtle
    const emitters = heatmap.points.map((pt) => {
      const isFocused = hoveredZoneId ? pt.zoneId === hoveredZoneId : false;
      const sigma = baseSigma * (isFocused ? 1.15 : 1.0);
      const strength = Math.min(
        1,
        Math.max(0.06, pt.heat * (isFocused ? 1.15 : 0.96))
      );
      return {
        x: pt.x * scale,
        y: pt.y * scale,
        invTwoSigmaSq: 1 / (2 * sigma * sigma),
        cutoffSq: (sigma * 3.1) * (sigma * 3.1),
        strength,
      };
    });

    // Smooth-max (probabilistic union: 1 - prod(1 - contribution)) prevents flat 255 clipping
    // while smoothly merging neighboring landmarks in the same high-variance cluster
    const field = new Float32Array(cw * ch);

    for (let e = 0; e < emitters.length; e++) {
      const em = emitters[e];
      const rad = Math.ceil(Math.sqrt(em.cutoffSq));
      const x0 = Math.max(0, Math.floor(em.x - rad));
      const x1 = Math.min(cw - 1, Math.ceil(em.x + rad));
      const y0 = Math.max(0, Math.floor(em.y - rad));
      const y1 = Math.min(ch - 1, Math.ceil(em.y + rad));

      // Scale individual landmark amplitude so a 5-point cluster peaks cleanly at its true heat value
      const amp = em.strength * 0.56;

      for (let py = y0; py <= y1; py++) {
        const dy = py - em.y;
        const dySq = dy * dy;
        const rowOff = py * cw;
        for (let px = x0; px <= x1; px++) {
          const dx = px - em.x;
          const dSq = dx * dx + dySq;
          if (dSq >= em.cutoffSq) continue;
          const g = Math.exp(-dSq * em.invTwoSigmaSq);
          const contrib = amp * g;
          const idx = rowOff + px;
          // Smooth union: stays strictly in [0, 1] with lush gradients and zero flat saturation
          field[idx] = 1 - (1 - field[idx]) * (1 - contrib);
        }
      }
    }

    for (let i = 0; i < field.length; i++) {
      const val = field[i];
      if (val <= 0.015) continue;
      const lutIdx = Math.min(255, Math.round(val * 255)) * 4;
      const pIdx = i * 4;
      oData[pIdx] = HEAT_LUT[lutIdx];
      oData[pIdx + 1] = HEAT_LUT[lutIdx + 1];
      oData[pIdx + 2] = HEAT_LUT[lutIdx + 2];
      oData[pIdx + 3] = HEAT_LUT[lutIdx + 3];
    }

    ctx.clearRect(0, 0, cw, ch);
    ctx.putImageData(out, 0, 0);
  }, [heatmap, report.width, report.height, hoveredZoneId]);

  const tooltipPos = useMemo(() => {
    if (!hoveredZone) return null;
    return projectPointToCoverFramePct(
      hoveredZone.hotspotPx,
      report.width,
      report.height,
      frameSize.w,
      frameSize.h
    );
  }, [hoveredZone, report.width, report.height, frameSize.w, frameSize.h]);

  if (!heatmap.available) {
    return (
      <section
        data-testid="asymmetry-heatmap-empty"
        className="bg-white border border-[#E5E5E5] p-6 sm:p-8 text-center space-y-3"
      >
        <h2 className="text-base font-bold text-[#111111]">Chưa dựng được bản đồ độ lệch</h2>
        <p className="text-xs sm:text-sm text-[#666666] max-w-md mx-auto leading-relaxed">
          {heatmap.noteVi}
        </p>
        <button
          type="button"
          onClick={onOpenPhotoPicker}
          className="min-h-[38px] px-4 py-1.5 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Chọn ảnh chính diện khác</span>
        </button>
      </section>
    );
  }

  return (
    <section
      data-testid="asymmetry-heatmap-section"
      aria-label="Bản đồ nhiệt độ lệch khuôn mặt"
      className="border border-[#E5E5E5] bg-white"
    >
      {/* Top Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 sm:px-6 py-3 border-b border-[#E5E5E5] bg-[#FAFAFA]">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Chọn ảnh hiển thị"
            className="inline-grid grid-cols-2 gap-0.5 p-0.5 bg-[#EFEFEF] rounded-[4px]"
          >
            {(
              [
                ["corrected", "Chuẩn sáng"],
                ["original", "Ảnh gốc"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPhotoMode(id)}
                className={`min-h-[30px] px-2.5 rounded-[3px] text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  photoMode === id
                    ? "bg-white text-[#111111] font-semibold shadow-2xs"
                    : "text-[#666666] hover:text-[#111111]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Độ đậm lớp nhiệt"
            className="inline-flex items-center gap-0.5 p-0.5 bg-[#EFEFEF] rounded-[4px]"
          >
            {(
              [
                ["soft", "Nhẹ"],
                ["medium", "Vừa"],
                ["strong", "Rõ"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`heatmap-strength-${id}`}
                aria-pressed={heatStrength === id}
                onClick={() => setHeatStrength(id)}
                className={`min-h-[30px] px-2.5 rounded-[3px] text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  heatStrength === id
                    ? "bg-white text-[#111111] font-semibold shadow-2xs"
                    : "text-[#666666] hover:text-[#111111]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={showMidline}
            onClick={() => setShowMidline((v) => !v)}
            className={`min-h-[32px] px-2.5 rounded-[4px] border text-[11px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              showMidline
                ? "bg-[#111111] text-white border-[#111111]"
                : "bg-white text-[#525252] border-[#D4D4D4] hover:border-[#111111]"
            }`}
          >
            {showMidline ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Trục giữa</span>
          </button>

          <button
            type="button"
            onClick={onOpenPhotoPicker}
            className="min-h-[32px] px-3 rounded-[4px] border border-[#D4D4D4] bg-white hover:border-[#111111] text-[11px] font-semibold text-[#111111] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Đổi ảnh</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Split: Portrait Heatmap + Interactive Repair Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:divide-x divide-[#E5E5E5] items-start">
        {/* Left: Portrait + Canvas Thermal Heatmap + Interactive SVG Hotspots */}
        <div className="lg:col-span-5 lg:sticky lg:top-[60px] divide-y divide-[#E5E5E5]">
          <div className="w-full bg-[#F5F5F5] sm:py-4 lg:p-0 lg:bg-[#111111]">
            <div
              ref={frameRef}
              data-testid="asymmetry-heatmap-frame"
              onMouseLeave={() => setHoveredZoneId(null)}
              className="relative aspect-[4/5] w-full max-w-[460px] mx-auto lg:max-w-none overflow-hidden bg-[#111111] sm:border sm:border-[#E5E5E5] lg:border-0 select-none"
            >
              <PortraitCanvas
                report={report}
                mode={photoMode}
                showOverlay={false}
                box={faceBox}
                fit="cover"
                containerClassName="h-full w-full bg-[#111111]"
              />

              {/* Pixel-aligned Smooth Gaussian Thermal Heatmap Canvas */}
              <canvas
                ref={canvasRef}
                data-testid="asymmetry-heatmap-canvas"
                aria-hidden="true"
                style={{ opacity: HEAT_OPACITY_VALUES[heatStrength] }}
                className="absolute inset-0 w-full h-full object-cover object-top pointer-events-none transition-opacity duration-200"
              />

              {/* Aligned Interactive SVG Overlay for Midline + Hoverable High-Variance Zones */}
              <svg
                data-testid="asymmetry-heatmap-svg"
                viewBox={`0 0 ${report.width} ${report.height}`}
                preserveAspectRatio="xMidYMin slice"
                className="absolute inset-0 w-full h-full z-10"
              >
                {/* Optional Roll-Compensated Midline Axis */}
                {showMidline && (
                  <line
                    x1={heatmap.midline.top.x}
                    y1={heatmap.midline.top.y - heatmap.faceWidthPx * 0.08}
                    x2={heatmap.midline.bottom.x}
                    y2={heatmap.midline.bottom.y + heatmap.faceWidthPx * 0.06}
                    stroke="rgba(255,255,255,0.62)"
                    strokeWidth={Math.max(1.2, report.width * 0.0022)}
                    strokeDasharray={`${Math.max(4, report.width * 0.008)} ${Math.max(4, report.width * 0.008)}`}
                    className="pointer-events-none"
                  />
                )}

                {/* Active zone bilateral comparison tether */}
                {activeZone && (
                  <g className="pointer-events-none">
                    <line
                      x1={activeZone.hotspotPx.x}
                      y1={activeZone.hotspotPx.y}
                      x2={activeZone.partnerPx.x}
                      y2={activeZone.partnerPx.y}
                      stroke="#FFFFFF"
                      strokeOpacity="0.85"
                      strokeWidth={Math.max(1.4, report.width * 0.0025)}
                      strokeDasharray={`${Math.max(3, report.width * 0.006)} ${Math.max(3, report.width * 0.006)}`}
                    />
                    <circle
                      cx={activeZone.partnerPx.x}
                      cy={activeZone.partnerPx.y}
                      r={Math.max(4, heatmap.faceWidthPx * 0.02)}
                      fill="rgba(17,17,17,0.75)"
                      stroke="#FFFFFF"
                      strokeWidth={Math.max(1.4, report.width * 0.0024)}
                    />
                  </g>
                )}

                {/* Interactive Zone Hotspots (Hover / Focus / Tap) */}
                {heatmap.zones.map((zone) => {
                  const isActive = activeZone?.id === zone.id;
                  const isHigh = zone.severity !== "balanced";
                  const strokeHex =
                    zone.severity === "notable"
                      ? "#EF4444"
                      : zone.severity === "mild"
                        ? "#F59E0B"
                        : "#E5E5E5";
                  const rOuter = Math.max(14, zone.haloRadiusPx * (isActive ? 0.62 : 0.48));
                  const rDot = Math.max(4.5, heatmap.faceWidthPx * (isActive ? 0.028 : 0.021));

                  return (
                    <g
                      key={zone.id}
                      role="button"
                      tabIndex={0}
                      data-testid={`heatmap-zone-hotspot-${zone.id}`}
                      data-severity={zone.severity}
                      aria-label={`${zone.labelVi}: ${zone.severityLabelVi}, lệch ${zone.combinedDeltaPct.toFixed(1)}%`}
                      onMouseEnter={() => setHoveredZoneId(zone.id)}
                      onFocus={() => setHoveredZoneId(zone.id)}
                      onBlur={() => setHoveredZoneId((cur) => (cur === zone.id ? null : cur))}
                      onClick={() => setPinnedZoneId(zone.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setPinnedZoneId(zone.id);
                        }
                      }}
                      className="cursor-pointer focus:outline-none"
                    >
                      {/* Generous invisible hit area for effortless hover & mobile tap */}
                      <circle
                        cx={zone.hotspotPx.x}
                        cy={zone.hotspotPx.y}
                        r={Math.max(22, zone.haloRadiusPx * 0.85)}
                        fill="rgba(0,0,0,0.001)"
                      />
                      {/* Crisp variance ring */}
                      <circle
                        cx={zone.hotspotPx.x}
                        cy={zone.hotspotPx.y}
                        r={rOuter}
                        fill={isActive ? "rgba(220,38,38,0.12)" : "none"}
                        stroke={isActive ? "#FFFFFF" : strokeHex}
                        strokeWidth={Math.max(1.5, report.width * (isActive ? 0.0036 : 0.0024))}
                        strokeOpacity={isActive ? 0.95 : isHigh ? 0.85 : 0.4}
                      />
                      {/* Center point */}
                      <circle
                        cx={zone.hotspotPx.x}
                        cy={zone.hotspotPx.y}
                        r={rDot}
                        fill={isHigh ? strokeHex : "#111111"}
                        stroke="#FFFFFF"
                        strokeWidth={Math.max(1.5, report.width * 0.0026)}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Anchored Floating Hover Tooltip (visible on hover/focus, clamped cleanly away from face center) */}
              {hoveredZone && tooltipPos && (
                <div
                  data-testid="heatmap-hover-tooltip"
                  role="tooltip"
                  style={{
                    left: `${Math.max(22, Math.min(78, tooltipPos.leftPct))}%`,
                    top:
                      tooltipPos.topPct <= 60
                        ? `${Math.max(18, tooltipPos.topPct - 8)}%`
                        : `${Math.min(92, tooltipPos.topPct + 9)}%`,
                    transform:
                      tooltipPos.topPct <= 60
                        ? "translate(-50%, -100%)"
                        : "translate(-50%, 0%)",
                  }}
                  className="pointer-events-none absolute z-20 w-[232px] max-w-[82%] bg-[#111111]/95 text-white border border-white/20 rounded-[4px] px-3 py-2.5 shadow-xl space-y-1"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-white">{hoveredZone.labelVi}</span>
                    <span
                      className={`font-mono tabular-nums text-[11px] font-bold ${
                        hoveredZone.severity === "notable"
                          ? "text-[#F87171]"
                          : hoveredZone.severity === "mild"
                            ? "text-[#FBBF24]"
                            : "text-white/70"
                      }`}
                    >
                      Δ {hoveredZone.combinedDeltaPct.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-white/85 leading-snug">
                    {hoveredZone.repairAdviceVi}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Thermal Scale Legend Bar */}
          <div className="px-4 py-3 bg-white flex items-center justify-between gap-3 text-[11px] text-[#525252]">
            <span className="font-medium text-[#111111] shrink-0">Mức độ lệch</span>
            <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[230px]">
              <span className="shrink-0 text-[#737373]">Đều</span>
              <span
                aria-hidden="true"
                className="h-2 flex-1 rounded-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(59,130,246,0.5) 0%, #F59E0B 48%, #EA580C 74%, #DC2626 100%)",
                }}
              />
              <span className="shrink-0 font-semibold text-[#DC2626]">Lệch rõ</span>
            </div>
          </div>
        </div>

        {/* Right: Active Zone Repair Inspector + Ranked 6-Zone Breakdown */}
        <div className="lg:col-span-7 flex flex-col divide-y divide-[#E5E5E5]">
          {/* Summary Header with High-Contrast Display-Sans Score */}
          <div className="px-5 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="metric-label">Bản đồ độ lệch theo vùng</div>
              <h2 className="text-lg sm:text-xl font-bold tracking-[-0.03em] text-[#0A0A0A] leading-tight">
                {heatmap.highVarianceZones.length > 0
                  ? `${heatmap.highVarianceZones.length} vùng cần chú ý khi trang điểm`
                  : "Gương mặt cân đối tự nhiên"}
              </h2>
              <p className="text-xs text-[#666666] leading-relaxed">{heatmap.noteVi}</p>
            </div>

            <div className="flex items-end gap-5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#EFEFEF]">
              <div>
                <div className="metric-label">Độ cân đối</div>
                <div className="metric-display text-[32px] sm:text-[36px] font-bold text-[#0A0A0A] mt-1">
                  {heatmap.overallScore.toFixed(1)}
                  <span className="text-base font-medium text-[#737373] ml-0.5">%</span>
                </div>
              </div>
              {Math.abs(heatmap.headTiltDeg) >= 1 && (
                <div className="pl-5 border-l border-[#E5E5E5]">
                  <div className="metric-label">Nghiêng đầu</div>
                  <div className="metric-display-sm text-xl sm:text-2xl font-bold text-[#0A0A0A] mt-1">
                    {Math.abs(heatmap.headTiltDeg).toFixed(1)}°
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Focused Repair Advice Panel (updates live on hover or click) */}
          {activeZone && (
            <div
              data-testid="heatmap-repair-inspector"
              data-active-zone={activeZone.id}
              className="px-5 sm:px-6 py-5 bg-[#FAFAFA] space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="space-y-1">
                  <div className="metric-label">Vùng đang xem</div>
                  <div className="flex items-baseline gap-2.5">
                    <h3 className="text-lg sm:text-xl font-bold text-[#0A0A0A] tracking-[-0.025em]">
                      {activeZone.labelVi}
                    </h3>
                    <span
                      className={`text-xs font-semibold ${
                        activeZone.severity === "notable"
                          ? "text-[#DC2626]"
                          : activeZone.severity === "mild"
                            ? "text-[#B45309]"
                            : "text-[#525252]"
                      }`}
                    >
                      {activeZone.severityLabelVi}
                    </span>
                  </div>
                </div>

                <div className="flex items-end gap-5 shrink-0">
                  <div>
                    <div className="metric-label">Lệch cao</div>
                    <div className="metric-display-sm text-xl font-bold text-[#0A0A0A] mt-0.5">
                      {activeZone.verticalDiffPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="pl-5 border-l border-[#E5E5E5]">
                    <div className="metric-label">Lệch ngang</div>
                    <div className="metric-display-sm text-xl font-bold text-[#0A0A0A] mt-0.5">
                      {activeZone.horizontalDiffPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs sm:text-[13px] text-[#333333] leading-relaxed">
                {activeZone.summaryVi}
              </p>

              <div className="pt-3 border-t border-[#E5E5E5] space-y-1">
                <div className="metric-label">Cách chỉnh khi trang điểm</div>
                <p
                  data-testid="heatmap-repair-advice"
                  className="text-sm font-semibold text-[#0A0A0A] leading-relaxed"
                >
                  {activeZone.repairAdviceVi}
                </p>
                <p className="text-xs text-[#525252] leading-relaxed">
                  {activeZone.repairStepVi}
                </p>
              </div>
            </div>
          )}

          {/* Ranked 6-Zone Interactive List (Bidirectional Hover Sync) */}
          <div className="divide-y divide-[#EFEFEF]">
            {heatmap.zones.map((zone) => {
              const isSelected = activeZone?.id === zone.id;
              const barColor =
                zone.severity === "notable"
                  ? "bg-[#DC2626]"
                  : zone.severity === "mild"
                    ? "bg-[#F59E0B]"
                    : "bg-[#A3A3A3]";

              return (
                <button
                  key={zone.id}
                  type="button"
                  data-testid={`heatmap-zone-row-${zone.id}`}
                  aria-pressed={isSelected}
                  onMouseEnter={() => setHoveredZoneId(zone.id)}
                  onMouseLeave={() => setHoveredZoneId((cur) => (cur === zone.id ? null : cur))}
                  onFocus={() => setHoveredZoneId(zone.id)}
                  onBlur={() => setHoveredZoneId((cur) => (cur === zone.id ? null : cur))}
                  onClick={() => setPinnedZoneId(zone.id)}
                  className={`w-full text-left px-5 sm:px-6 py-3.5 transition-colors cursor-pointer ${
                    isSelected ? "bg-[#F5F5F5]" : "bg-white hover:bg-[#FAFAFA]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-1.5 h-4 rounded-[1px] shrink-0 ${barColor}`}
                        aria-hidden="true"
                      />
                      <span className="text-[13px] font-semibold text-[#0A0A0A] truncate">
                        {zone.labelVi}
                      </span>
                      <span className="text-[11px] text-[#737373] truncate hidden sm:inline">
                        {zone.severityLabelVi}
                      </span>
                    </div>

                    <div className="flex items-center gap-3.5 shrink-0">
                      <span className="font-display tabular-nums text-[15px] font-bold text-[#0A0A0A]">
                        {zone.combinedDeltaPct.toFixed(1)}%
                      </span>
                      <span className="w-16 h-1.5 bg-[#EAEAEA] overflow-hidden inline-block">
                        <span
                          className={`block h-full ${barColor}`}
                          style={{ width: `${Math.max(10, Math.round(zone.heat * 100))}%` }}
                        />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
