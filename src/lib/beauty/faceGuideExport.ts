import {
  type FaceGuideGeometry,
  type FaceGuideIntensity,
  type FaceGuideZoneContent,
  type FaceGuideZoneId,
} from "./faceGuideMap";

export function buildFaceGuideExportCaption(
  zones: Record<FaceGuideZoneId, FaceGuideZoneContent>,
  activeLayers: readonly FaceGuideZoneId[]
): string {
  if (activeLayers.length === 0) {
    return "Sơ đồ trang điểm cá nhân hóa";
  }
  const labels = activeLayers.map((id) => zones[id]?.shortLabel).filter(Boolean);
  return `Sơ đồ: ${labels.join(" · ")}`;
}

function parsePointsAttr(points: string): Array<[number, number]> {
  return points
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [xs, ys] = pair.split(",");
      return [Number(xs), Number(ys)] as [number, number];
    })
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

/**
 * Renders the user's portrait pixels + active interactive makeup guide layers onto an offscreen
 * 2D canvas (zero SVG CORS taint) and returns a downloadable PNG data URL.
 */
export function exportFaceGuidePngDataUrl(params: {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  geometry: FaceGuideGeometry;
  zones: Record<FaceGuideZoneId, FaceGuideZoneContent>;
  activeLayers: readonly FaceGuideZoneId[];
  intensity: FaceGuideIntensity;
  subtitleVi?: string;
}): string | null {
  if (typeof document === "undefined") return null;
  const { rgba, width, height, geometry, zones, activeLayers, intensity, subtitleVi } = params;
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // 1. Paint base portrait pixels
  const imgData = ctx.createImageData(width, height);
  imgData.data.set(rgba.subarray(0, width * height * 4));
  ctx.putImageData(imgData, 0, 0);

  const isSoft = intensity === "soft";
  const opacityScale = isSoft ? 0.82 : 1;
  const softBlurPx = Math.max(2, width * 0.0085);
  const blushBlurPx = Math.max(4, width * 0.016);
  const dotGlowPx = Math.max(2, width * 0.007);
  const dashUnit = Math.max(4, width * 0.014);
  const microDash = Math.max(2.6, width * 0.008);
  const guideThinStroke = Math.max(1.1, width * 0.0032);
  const arrowStrokeW = Math.max(1.3, width * 0.0038);
  const arrowHeadSize = Math.max(3.4, width * 0.011);

  const scaleX = width / Math.max(1, geometry.width);
  const scaleY = height / Math.max(1, geometry.height);

  ctx.save();
  ctx.scale(scaleX, scaleY);

  for (const layerId of activeLayers) {
    const visual = geometry.visuals[layerId];
    if (!visual) continue;

    // 2a. Soft radial cloud blush + optional dotted boundary
    for (const blob of visual.blobs) {
      ctx.save();
      ctx.translate(blob.cx, blob.cy);
      ctx.rotate((blob.rotateDeg * Math.PI) / 180);
      ctx.scale(1, blob.ry / Math.max(0.001, blob.rx));
      ctx.filter = `blur(${blushBlurPx.toFixed(1)}px)`;
      ctx.globalAlpha = Math.min(1, blob.opacity * opacityScale);

      if (blob.softRadial) {
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, blob.rx);
        grad.addColorStop(0, hexToRgba(blob.fill, 0.88));
        grad.addColorStop(0.58, hexToRgba(blob.fill, 0.46));
        grad.addColorStop(1, hexToRgba(blob.fill, 0));
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = blob.fill;
      }
      ctx.beginPath();
      ctx.arc(0, 0, blob.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (!isSoft && blob.outlineColor) {
        ctx.save();
        ctx.translate(blob.cx, blob.cy);
        ctx.rotate((blob.rotateDeg * Math.PI) / 180);
        ctx.strokeStyle = blob.outlineColor;
        ctx.globalAlpha = 0.78;
        ctx.lineWidth = guideThinStroke;
        ctx.setLineDash([microDash, microDash * 1.15]);
        ctx.shadowColor = "rgba(9,9,11,0.55)";
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, blob.rx * 0.88, blob.ry * 0.88, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2b. Lip tint polygons
    for (const poly of visual.polygons) {
      const pts = parsePointsAttr(poly.points);
      if (pts.length < 3) continue;
      ctx.save();
      ctx.filter = `blur(${softBlurPx.toFixed(1)}px)`;
      ctx.fillStyle = poly.fill;
      ctx.globalAlpha = Math.min(1, poly.opacity * opacityScale);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 2c. Contour, eyeshadow, liner, brow arch & hair framing strokes
    for (const st of visual.strokes) {
      if (isSoft && layerId === "eyes" && st.dashed) continue;
      if (typeof Path2D === "undefined") continue;
      const path = new Path2D(st.d);

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = st.stroke;
      ctx.lineWidth = st.strokeWidth;
      ctx.globalAlpha = Math.min(1, st.opacity * (st.dashed && isSoft ? 0.72 : opacityScale));
      if (st.dashed) {
        ctx.setLineDash([dashUnit, dashUnit * 0.85]);
        ctx.shadowColor = "rgba(9,9,11,0.55)";
        ctx.shadowBlur = 2.5;
      } else if (st.blur) {
        ctx.filter = `blur(${softBlurPx.toFixed(1)}px)`;
      }
      ctx.stroke(path);
      ctx.restore();

      if (!isSoft && st.crispOutline) {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = st.crispOutline;
        ctx.lineWidth = guideThinStroke;
        ctx.globalAlpha = 0.68;
        ctx.setLineDash([microDash, microDash * 1.15]);
        ctx.shadowColor = "rgba(9,9,11,0.55)";
        ctx.shadowBlur = 2;
        ctx.stroke(path);
        ctx.restore();
      }
    }

    // 2d. Directional brush-sweep arrows (crisp blueprint mode only)
    if (!isSoft && typeof Path2D !== "undefined") {
      for (const arrow of visual.arrows) {
        const path = new Path2D(arrow.d);
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = arrow.stroke;
        ctx.lineWidth = arrowStrokeW;
        ctx.globalAlpha = arrow.opacity;
        ctx.shadowColor = "rgba(9,9,11,0.6)";
        ctx.shadowBlur = 2.5;
        ctx.stroke(path);

        ctx.translate(arrow.tipX, arrow.tipY);
        ctx.rotate((arrow.angleDeg * Math.PI) / 180);
        ctx.beginPath();
        ctx.moveTo(-arrowHeadSize, -arrowHeadSize * 0.65);
        ctx.lineTo(0, 0);
        ctx.lineTo(-arrowHeadSize, arrowHeadSize * 0.65);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2e. Pearl highlight & accent points
    for (const dot of visual.dots) {
      ctx.save();
      ctx.fillStyle = dot.fill;
      ctx.globalAlpha = Math.min(1, dot.opacity * (isSoft ? 0.88 : 1));
      if (dot.glow) {
        ctx.shadowColor = dot.fill;
        ctx.shadowBlur = dotGlowPx * 2.2;
      }
      ctx.beginPath();
      if (dot.ry) {
        ctx.ellipse(dot.x, dot.y, dot.r, dot.ry, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();

  // 3. Clean editorial caption bar at the bottom of the exported PNG
  const barH = Math.max(44, Math.round(height * 0.12));
  const scrim = ctx.createLinearGradient(0, height - barH * 1.4, 0, height);
  scrim.addColorStop(0, "rgba(9,9,11,0)");
  scrim.addColorStop(0.55, "rgba(9,9,11,0.68)");
  scrim.addColorStop(1, "rgba(9,9,11,0.88)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, height - barH * 1.4, width, barH * 1.4);

  const caption = buildFaceGuideExportCaption(zones, activeLayers);
  const padX = Math.max(14, Math.round(width * 0.04));
  const mainFontPx = Math.max(12, Math.round(width * 0.032));
  const subFontPx = Math.max(10, Math.round(width * 0.024));

  ctx.save();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 ${mainFontPx}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "bottom";
  ctx.fillText(
    caption,
    padX,
    subtitleVi ? height - Math.round(padX * 0.9) - subFontPx - 4 : height - Math.round(padX * 0.85),
    width - padX * 2
  );

  if (subtitleVi) {
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = `500 ${subFontPx}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(subtitleVi, padX, height - Math.round(padX * 0.85), width - padX * 2);
  }
  ctx.restore();

  return canvas.toDataURL("image/png");
}
