import React, { useEffect, useRef } from "react";
import { renderChromophoreHeatmapRgba } from "../lib/beauty/chromophores";
import type { ConsultationReport, FaceLandmarksBox } from "../lib/beauty/types";
import { PortraitSkeleton } from "./AnalysisSkeleton";

export type ViewportMode = "corrected" | "original" | "roi" | "melanin" | "hemoglobin";

interface PortraitCanvasProps {
  report: ConsultationReport | null;
  mode: ViewportMode;
  showOverlay: boolean;
  box: FaceLandmarksBox;
  className?: string;
  containerClassName?: string;
}

/**
 * Minimalist, balanced facial proportion points:
 * Forehead center (10), cheekbone highlights (116, 345),
 * jaw symmetry (172, 397), chin (152), cupid's bow (0), lip corners (61, 291).
 * Intentionally omits eye/nostril outlines so the overlay feels calm & editorial.
 */
const BEAUTY_GLOW_LANDMARKS = [10, 116, 345, 172, 397, 152, 0, 61, 291];
const CHEEK_BLOOM_LANDMARKS = [116, 345];

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

export const PortraitCanvas: React.FC<PortraitCanvasProps> = ({
  report,
  mode,
  showOverlay,
  box,
  className = "",
  containerClassName = "bg-zinc-100",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    const imageData = new ImageData(new Uint8ClampedArray(displayRgba), width, height);
    ctx.putImageData(imageData, 0, 0);

    if (showOverlay) {
      ctx.save();
      const dotR = Math.max(1.8, width / 175);
      const haloR = Math.max(8, width / 38);

      if (report.neuralLandmarks && report.neuralLandmarks.length >= 468) {
        const lms = report.neuralLandmarks;

        // 1. Subtle ambient skin-sampling soft bloom over the cheeks
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

        // 2. Minimal luminous pearl dots (no wireframe mesh or eye/mouth cages)
        BEAUTY_GLOW_LANDMARKS.forEach((lmIdx) => {
          const [x, y] = lms[lmIdx];
          const isLipPoint = lmIdx === 0 || lmIdx === 61 || lmIdx === 291;
          drawSoftGlowDot(ctx, x, y, dotR, haloR, isLipPoint ? "rose" : "ivory");
        });
      } else {
        // Gentle fallback soft-glow dots around estimated face proportions
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
  }, [report, mode, showOverlay, box]);

  if (!report) {
    return <PortraitSkeleton className={className} />;
  }

  return (
    <div className={`w-full flex items-center justify-center ${containerClassName}`}>
      <canvas
        ref={canvasRef}
        className={`block max-w-full w-auto h-auto ${className}`}
        aria-label="Chân dung phân tích tông da"
      />
    </div>
  );
};
