import React, { useEffect, useMemo, useRef } from "react";
import { renderChromophoreHeatmapRgba } from "../lib/beauty/chromophores";
import {
  FACE_MESH_CONTOURS,
  classifyMeshLandmarkZone,
  type MeshPointZone,
} from "../lib/beauty/faceMeshOverlay";
import {
  applyVirtualMakeupToRgba,
  computeLipAlphaMask,
  type VirtualMakeupOptions,
} from "../lib/beauty/virtualMakeup";
import type { ConsultationReport, FaceLandmarksBox } from "../lib/beauty/types";
import { PortraitSkeleton } from "./AnalysisSkeleton";

export type ViewportMode = "corrected" | "original" | "roi" | "melanin" | "hemoglobin";

interface PortraitCanvasProps {
  report: ConsultationReport | null;
  mode: ViewportMode;
  showOverlay: boolean;
  meshPreview?: boolean;
  box: FaceLandmarksBox;
  virtualMakeup?: VirtualMakeupOptions;
  zoomToLips?: boolean;
  fit?: "contain" | "cover";
  className?: string;
  containerClassName?: string;
}

const BEAUTY_GLOW_LANDMARKS = [10, 116, 345, 172, 397, 152, 0, 61, 291];
const CHEEK_BLOOM_LANDMARKS = [116, 345];

const CONTOUR_STROKE_STYLES: Record<Exclude<MeshPointZone, "face">, string> = {
  oval: "rgba(255, 255, 255, 0.58)",
  eye: "rgba(125, 211, 252, 0.82)",
  brow: "rgba(186, 230, 253, 0.68)",
  nose: "rgba(254, 243, 199, 0.65)",
  lip: "rgba(253, 164, 175, 0.88)",
  iris: "rgba(52, 211, 153, 0.92)",
};

const POINT_FILL_STYLES: Record<MeshPointZone, string> = {
  oval: "rgba(255, 255, 255, 0.94)",
  eye: "rgba(125, 211, 252, 0.98)",
  brow: "rgba(186, 230, 253, 0.92)",
  nose: "rgba(254, 243, 199, 0.94)",
  lip: "rgba(251, 113, 133, 0.98)",
  iris: "rgba(52, 211, 153, 0.98)",
  face: "rgba(240, 249, 255, 0.86)",
};

function drawFullFaceMesh478(
  ctx: CanvasRenderingContext2D,
  landmarks: Array<[number, number, number]>,
  width: number
): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const baseLine = Math.max(0.85, width / 400);

  // 1. Subtle anatomical feature contours so alignment on eyes, brows, nose, lips & jawline is immediate
  for (const contour of FACE_MESH_CONTOURS) {
    const valid = contour.indices.every((idx) => idx < landmarks.length);
    if (!valid || contour.indices.length < 2) continue;

    ctx.beginPath();
    contour.indices.forEach((idx, step) => {
      const [x, y] = landmarks[idx];
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (contour.closed) ctx.closePath();

    ctx.strokeStyle = "rgba(9, 9, 11, 0.32)";
    ctx.lineWidth = baseLine + 0.9;
    ctx.stroke();

    ctx.strokeStyle = CONTOUR_STROKE_STYLES[contour.zone];
    ctx.lineWidth = contour.zone === "lip" || contour.zone === "iris" ? baseLine * 1.15 : baseLine;
    ctx.stroke();
  }

  // 2. Plot every detected landmark point (all 478 points: 468 face mesh + 10 iris)
  const faceDotR = Math.max(1.05, width / 345);
  const featureDotR = Math.max(1.25, width / 295);
  const irisDotR = Math.max(1.45, width / 260);

  for (let i = 0; i < landmarks.length; i++) {
    const [x, y] = landmarks[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const zone = classifyMeshLandmarkZone(i);
    const radius = zone === "iris" ? irisDotR : zone === "face" ? faceDotR : featureDotR;

    // Subtle dark halo for crisp contrast on fair highlights and warm skin tones
    ctx.fillStyle = "rgba(9, 9, 11, 0.45)";
    ctx.beginPath();
    ctx.arc(x, y, radius + 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = POINT_FILL_STYLES[zone];
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFallbackMeshGuide(
  ctx: CanvasRenderingContext2D,
  box: FaceLandmarksBox,
  width: number,
  height: number
): void {
  const cx = box.centerX * width;
  const cy = box.centerY * height;
  const rx = (box.faceWidth * width) / 2;
  const ry = (box.faceHeight * height) / 2;
  const lipY = box.lipCenterY * height;
  const lipHalfW = (box.lipWidth * width) / 2;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = Math.max(1.2, width / 300);
  ctx.setLineDash([5, 4]);

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Lip guide
  ctx.strokeStyle = "rgba(253, 164, 175, 0.95)";
  ctx.beginPath();
  ctx.ellipse(cx, lipY, lipHalfW, Math.max(5, ry * 0.12), 0, 0, Math.PI * 2);
  ctx.stroke();

  // Eye line guide
  ctx.strokeStyle = "rgba(125, 211, 252, 0.85)";
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.55, cy - ry * 0.12);
  ctx.lineTo(cx + rx * 0.55, cy - ry * 0.12);
  ctx.stroke();

  ctx.restore();
}

function drawSoftGlowDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dotRadius: number,
  haloRadius: number,
  tint: "ivory" | "rose"
): void {
  const halo = ctx.createRadialGradient(x, y, 0, x, y, haloRadius);
  if (tint === "rose") {
    halo.addColorStop(0, "rgba(255, 241, 242, 0.72)");
    halo.addColorStop(0.45, "rgba(253, 164, 175, 0.28)");
    halo.addColorStop(1, "rgba(253, 164, 175, 0)");
  } else {
    halo.addColorStop(0, "rgba(255, 252, 248, 0.78)");
    halo.addColorStop(0.45, "rgba(255, 237, 213, 0.26)");
    halo.addColorStop(1, "rgba(255, 237, 213, 0)");
  }

  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.shadowBlur = Math.max(4, dotRadius * 3);
  ctx.shadowColor =
    tint === "rose" ? "rgba(251, 113, 133, 0.65)" : "rgba(255, 247, 237, 0.9)";
  ctx.fillStyle = tint === "rose" ? "rgba(255, 245, 246, 0.95)" : "rgba(255, 255, 255, 0.94)";
  ctx.beginPath();
  ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const PortraitCanvas: React.FC<PortraitCanvasProps> = React.memo(({
  report,
  mode,
  showOverlay,
  meshPreview = false,
  box,
  virtualMakeup,
  zoomToLips = false,
  fit = "contain",
  className = "",
  containerClassName = "bg-zinc-100",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Cache feathered lip mask once per portrait so slider drags & shade taps run in <1ms
  const cachedLipMask = useMemo(() => {
    if (!report) return null;
    return computeLipAlphaMask(report.width, report.height, report.neuralLandmarks, box);
  }, [report, box]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !report) return;
    const { width, height } = report;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let displayRgba: Uint8ClampedArray;
    if (mode === "original") {
      displayRgba = report.originalRgba;
    } else if (mode === "melanin") {
      displayRgba = renderChromophoreHeatmapRgba(
        report.originalRgba,
        report.chromophores,
        "melanin"
      );
    } else if (mode === "hemoglobin") {
      displayRgba = renderChromophoreHeatmapRgba(
        report.originalRgba,
        report.chromophores,
        "hemoglobin"
      );
    } else if (mode === "roi") {
      displayRgba = new Uint8ClampedArray(report.correctedRgba);
      for (let i = 0; i < report.skinMask.length; i++) {
        const idx = i * 4;
        if (report.skinMask[i]) {
          displayRgba[idx] = Math.round(displayRgba[idx] * 0.65 + 14 * 0.35);
          displayRgba[idx + 1] = Math.round(displayRgba[idx + 1] * 0.65 + 165 * 0.35);
          displayRgba[idx + 2] = Math.round(displayRgba[idx + 2] * 0.65 + 233 * 0.35);
        } else {
          displayRgba[idx] = Math.round(displayRgba[idx] * 0.45);
          displayRgba[idx + 1] = Math.round(displayRgba[idx + 1] * 0.45);
          displayRgba[idx + 2] = Math.round(displayRgba[idx + 2] * 0.45);
        }
      }
    } else {
      displayRgba = report.correctedRgba;
    }

    if (
      (mode === "corrected" || mode === "original") &&
      virtualMakeup &&
      (virtualMakeup.lipEnabled || virtualMakeup.blushEnabled)
    ) {
      displayRgba = applyVirtualMakeupToRgba(
        displayRgba,
        width,
        height,
        report.neuralLandmarks,
        report.skinMask,
        box,
        {
          ...virtualMakeup,
          precomputedLipMask: cachedLipMask ?? undefined,
        }
      );
    }

    const imageData = new ImageData(new Uint8ClampedArray(displayRgba), width, height);
    ctx.putImageData(imageData, 0, 0);

    if (meshPreview) {
      if (report.neuralLandmarks && report.neuralLandmarks.length >= 468) {
        drawFullFaceMesh478(ctx, report.neuralLandmarks, width);
      } else {
        drawFallbackMeshGuide(ctx, box, width, height);
      }
    } else if (showOverlay) {
      ctx.save();
      const dotR = Math.max(1.8, width / 175);
      const haloR = Math.max(8, width / 38);

      if (report.neuralLandmarks && report.neuralLandmarks.length >= 468) {
        const lms = report.neuralLandmarks;

        const bloomR = Math.max(18, width * 0.08);
        CHEEK_BLOOM_LANDMARKS.forEach((lmIdx) => {
          const [x, y] = lms[lmIdx];
          const bloom = ctx.createRadialGradient(x, y, 0, x, y, bloomR);
          bloom.addColorStop(0, "rgba(255, 248, 240, 0.2)");
          bloom.addColorStop(0.55, "rgba(255, 241, 242, 0.08)");
          bloom.addColorStop(1, "rgba(255, 241, 242, 0)");
          ctx.fillStyle = bloom;
          ctx.beginPath();
          ctx.arc(x, y, bloomR, 0, Math.PI * 2);
          ctx.fill();
        });

        BEAUTY_GLOW_LANDMARKS.forEach((lmIdx) => {
          const [x, y] = lms[lmIdx];
          const isLipPoint = lmIdx === 0 || lmIdx === 61 || lmIdx === 291;
          drawSoftGlowDot(ctx, x, y, dotR, haloR, isLipPoint ? "rose" : "ivory");
        });
      } else {
        const cx = box.centerX * width;
        const cy = box.centerY * height;
        const rx = (box.faceWidth * width) / 2;
        const ry = (box.faceHeight * height) / 2;

        const fallbackPts: Array<[number, number, "ivory" | "rose"]> = [
          [cx, cy - ry * 0.72, "ivory"],
          [cx - rx * 0.62, cy - ry * 0.05, "ivory"],
          [cx + rx * 0.62, cy - ry * 0.05, "ivory"],
          [cx, cy + ry * 0.84, "ivory"],
          [cx, box.lipCenterY * height, "rose"],
        ];
        fallbackPts.forEach(([px, py, tint]) => {
          drawSoftGlowDot(ctx, px, py, dotR, haloR, tint);
        });
      }

      ctx.restore();
    }
  }, [report, mode, showOverlay, meshPreview, box, virtualMakeup, cachedLipMask]);

  if (!report) {
    return <PortraitSkeleton className={className} />;
  }

  const originX = `${Math.round((cachedLipMask?.centerXNorm ?? 0.5) * 100)}%`;
  const originY = `${Math.round((cachedLipMask?.centerYNorm ?? 0.58) * 100)}%`;
  const renderedMeshPoints = meshPreview ? (report.neuralLandmarks?.length ?? 0) : 0;

  return (
    <div className={`w-full flex items-center justify-center overflow-hidden ${containerClassName}`}>
      <canvas
        ref={canvasRef}
        data-testid="portrait-canvas"
        data-mesh-active={meshPreview ? "true" : "false"}
        data-mesh-points={renderedMeshPoints}
        style={
          zoomToLips
            ? {
                transformOrigin: `${originX} ${originY}`,
                transform: "scale(1.65)",
              }
            : {
                transformOrigin: `${originX} ${originY}`,
                transform: "scale(1)",
              }
        }
        className={
          fit === "cover"
            ? `block w-full h-full object-cover object-top transition-transform duration-300 ease-out will-change-transform ${className}`
            : `block max-w-full w-auto h-auto transition-transform duration-300 ease-out will-change-transform ${className}`
        }
        aria-label="Chân dung phân tích tông da và thử son"
      />
    </div>
  );
});
PortraitCanvas.displayName = "PortraitCanvas";
