import React, { useEffect, useRef } from "react";
import { renderChromophoreHeatmapRgba } from "../lib/beauty/chromophores";
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
      const cx = box.centerX * width;
      const cy = box.centerY * height;
      const rx = (box.faceWidth * width) / 2;
      const ry = (box.faceHeight * height) / 2;
      const lipCy = box.lipCenterY * height;
      const lipRx = (box.lipWidth * width) / 2;
      const lipRy = Math.max(4, ry * 0.11);

      ctx.save();
      ctx.strokeStyle = "rgba(14, 116, 144, 0.9)";
      ctx.lineWidth = Math.max(1.5, width / 260);
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Lip sampling ellipse
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(225, 29, 72, 0.9)";
      ctx.beginPath();
      ctx.ellipse(cx, lipCy, lipRx, lipRy, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Axis crosshair lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - ry);
      ctx.lineTo(cx, cy + ry);
      ctx.moveTo(cx - rx, cy);
      ctx.lineTo(cx + rx, cy);
      ctx.stroke();
      ctx.restore();
    }
  }, [report, mode, showOverlay, box]);

  if (!report) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-100 border border-zinc-200 text-xs text-zinc-500 ${className}`}
      >
        Loading optical sample...
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full h-auto bg-zinc-950 ${className}`}
      aria-label="Portrait colorimetry analysis canvas"
    />
  );
};
