import React, { useEffect, useRef } from "react";
import { renderChromophoreHeatmapRgba } from "../lib/beauty/chromophores";
import { FEATURE_POLYGONS, SKIN_LANDMARKS, computeConvexHull } from "../lib/beauty/neuralLandmarks";
import type { ConsultationReport, FaceLandmarksBox } from "../lib/beauty/types";

export type ViewportMode = "corrected" | "original" | "roi" | "melanin" | "hemoglobin";

interface PortraitCanvasProps {
  report: ConsultationReport | null;
  mode: ViewportMode;
  showOverlay: boolean;
  box: FaceLandmarksBox;
  className?: string;
}

export const PortraitCanvas: React.FC<PortraitCanvasProps> = ({
  report,
  mode,
  showOverlay,
  box,
  className = "",
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
      const lineW = Math.max(1, width / 320);
      if (report.neuralLandmarks && report.neuralLandmarks.length >= 468) {
        const lms = report.neuralLandmarks;
        const hullPts = computeConvexHull(
          SKIN_LANDMARKS.map((idx) => [lms[idx][0], lms[idx][1]] as [number, number])
        );

        // Subtle translucent hairline around face perimeter (smooth, non-creepy)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.lineWidth = lineW;
        ctx.beginPath();
        hullPts.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();

        // Soft rose lip trace only (no eyeball rings or stick-nose)
        const lipIndices = FEATURE_POLYGONS[2];
        ctx.strokeStyle = "rgba(244, 63, 94, 0.45)";
        ctx.lineWidth = lineW;
        ctx.beginPath();
        lipIndices.forEach((lmIdx, i) => {
          const [x, y] = lms[lmIdx];
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();

        // Delicate beauty-proportion micro-dots (forehead, cheekbones, jaw, chin, lip corners)
        const anchorIndices = [10, 234, 454, 172, 397, 152, 61, 291];
        const dotR = Math.max(1.8, width / 170);
        ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
        ctx.strokeStyle = "rgba(24, 24, 27, 0.45)";
        ctx.lineWidth = 0.75;
        anchorIndices.forEach((lmIdx) => {
          const [x, y] = lms[lmIdx];
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      } else {
        const cx = box.centerX * width;
        const cy = box.centerY * height;
        const rx = (box.faceWidth * width) / 2;
        const ry = (box.faceHeight * height) / 2;

        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.lineWidth = lineW;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [report, mode, showOverlay, box]);

  if (!report) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-100 border border-zinc-200 text-xs text-zinc-500 h-64 ${className}`}
      >
        Đang nhận diện khuôn mặt và phân tích màu da...
      </div>
    );
  }

  return (
    <div className="w-full bg-zinc-100 flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className={`block max-w-full w-auto h-auto ${className}`}
        aria-label="Khung phân tích khuôn mặt và màu da"
      />
    </div>
  );
};
