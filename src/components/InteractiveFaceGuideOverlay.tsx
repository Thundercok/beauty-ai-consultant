import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  FACE_GUIDE_ZONE_ORDER,
  projectImagePointToCoverPercent,
  type FaceGuideGeometry,
  type FaceGuideIntensity,
  type FaceGuideZoneContent,
  type FaceGuideZoneId,
} from "../lib/beauty/faceGuideMap";

interface InteractiveFaceGuideOverlayProps {
  geometry: FaceGuideGeometry;
  zones: Record<FaceGuideZoneId, FaceGuideZoneContent>;
  activeLayers: readonly FaceGuideZoneId[];
  showPins: boolean;
  intensity?: FaceGuideIntensity;
  onTapPin: (zone: FaceGuideZoneId) => void;
}

export const InteractiveFaceGuideOverlay: React.FC<InteractiveFaceGuideOverlayProps> = ({
  geometry,
  zones,
  activeLayers,
  showPins,
  intensity = "crisp",
  onTapPin,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const filterUid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setFrameSize({ w: rect.width, h: rect.height });
      }
    };

    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const projectedPins = useMemo(() => {
    const w = frameSize.w || geometry.width;
    const h = frameSize.h || geometry.height;
    return FACE_GUIDE_ZONE_ORDER.map((id) => {
      const raw = geometry.pins[id];
      const pos = projectImagePointToCoverPercent(
        raw.x,
        raw.y,
        geometry.width,
        geometry.height,
        w,
        h
      );
      return { id, pos, zone: zones[id] };
    });
  }, [frameSize, geometry, zones]);

  const hasActiveLayers = activeLayers.length > 0;
  if (!showPins && !hasActiveLayers) {
    return null;
  }

  const isSoft = intensity === "soft";
  const opacityScale = isSoft ? 0.82 : 1;

  const softBlurStd = Math.max(1.5, geometry.width * 0.0075);
  const blushBlurStd = Math.max(3.2, geometry.width * 0.015);
  const dotGlowStd = Math.max(1.4, geometry.width * 0.006);
  const dashUnit = Math.max(4, geometry.width * 0.014);
  const microDash = Math.max(2.6, geometry.width * 0.008);
  const guideThinStroke = Math.max(1.1, geometry.width * 0.0032);
  const arrowStrokeW = Math.max(1.3, geometry.width * 0.0038);
  const arrowHeadSize = Math.max(3.4, geometry.width * 0.011);

  const softBlurId = `fg-soft-${filterUid}`;
  const blushBlurId = `fg-blush-${filterUid}`;
  const dotGlowId = `fg-glow-${filterUid}`;
  const hairShadowId = `fg-hair-${filterUid}`;
  const blushGradId = `fg-blush-grad-${filterUid}`;
  const blushColor = zones.cheek_jaw.swatchColor;

  return (
    <div
      ref={containerRef}
      data-testid="face-guide-overlay"
      data-active-layers={activeLayers.join(",") || "none"}
      data-intensity={intensity}
      className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden"
    >
      {/* Multi-Layer Translucent Xiaohongshu Makeup & Hair Blueprint (100% locked to object-cover object-top) */}
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        preserveAspectRatio="xMidYMin slice"
        className="w-full h-full block transition-opacity duration-200 ease-out"
        style={{ opacity: hasActiveLayers ? 1 : 0 }}
        aria-hidden="true"
      >
        <defs>
          <filter id={softBlurId} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation={softBlurStd} />
          </filter>
          <filter id={blushBlurId} x="-45%" y="-45%" width="190%" height="190%">
            <feGaussianBlur stdDeviation={blushBlurStd} />
          </filter>
          <filter id={dotGlowId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation={dotGlowStd} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={hairShadowId} x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow
              dx="0"
              dy="1"
              stdDeviation="1.35"
              floodColor="#09090B"
              floodOpacity="0.62"
            />
          </filter>
          <radialGradient id={blushGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={blushColor} stopOpacity="0.88" />
            <stop offset="58%" stopColor={blushColor} stopOpacity="0.46" />
            <stop offset="100%" stopColor={blushColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        {activeLayers.map((layerId) => {
          const visual = geometry.visuals[layerId];
          if (!visual) return null;

          return (
            <g key={layerId} data-layer={layerId}>
              {/* Soft Radial Cloud Blush + Delicate Dotted Boundary */}
              {visual.blobs.map((blob, idx) => (
                <g key={`blob-${idx}`}>
                  <ellipse
                    cx={blob.cx}
                    cy={blob.cy}
                    rx={blob.rx}
                    ry={blob.ry}
                    fill={blob.softRadial ? `url(#${blushGradId})` : blob.fill}
                    fillOpacity={blob.opacity * opacityScale}
                    transform={`rotate(${blob.rotateDeg} ${blob.cx} ${blob.cy})`}
                    filter={`url(#${blushBlurId})`}
                  />
                  {!isSoft && blob.outlineColor && (
                    <ellipse
                      cx={blob.cx}
                      cy={blob.cy}
                      rx={blob.rx * 0.88}
                      ry={blob.ry * 0.88}
                      fill="none"
                      stroke={blob.outlineColor}
                      strokeWidth={guideThinStroke}
                      strokeOpacity={0.76}
                      strokeDasharray={`${microDash.toFixed(1)} ${(microDash * 1.15).toFixed(1)}`}
                      transform={`rotate(${blob.rotateDeg} ${blob.cx} ${blob.cy})`}
                      filter={`url(#${hairShadowId})`}
                    />
                  )}
                </g>
              ))}

              {/* Translucent Lip Tint Fill */}
              {visual.polygons.map((poly, idx) => (
                <polygon
                  key={`poly-${idx}`}
                  points={poly.points}
                  fill={poly.fill}
                  fillOpacity={poly.opacity * opacityScale}
                  filter={`url(#${softBlurId})`}
                />
              ))}

              {/* Contour, Eyeshadow, Outer-V, Brow Arch, Eyeliner, & Hair Framing Paths */}
              {visual.strokes.map((st, idx) => {
                if (isSoft && layerId === "eyes" && st.dashed) {
                  return null;
                }
                const strokeOpacity =
                  st.opacity * (st.dashed && isSoft ? 0.72 : opacityScale);
                return (
                  <g key={`stroke-${idx}`}>
                    <path
                      d={st.d}
                      fill="none"
                      stroke={st.stroke}
                      strokeWidth={st.strokeWidth}
                      strokeOpacity={strokeOpacity}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={
                        st.dashed
                          ? `${dashUnit.toFixed(1)} ${(dashUnit * 0.85).toFixed(1)}`
                          : undefined
                      }
                      filter={
                        st.blur
                          ? `url(#${softBlurId})`
                          : st.dashed
                            ? `url(#${hairShadowId})`
                            : undefined
                      }
                    />
                    {!isSoft && st.crispOutline && (
                      <path
                        d={st.d}
                        fill="none"
                        stroke={st.crispOutline}
                        strokeWidth={guideThinStroke}
                        strokeOpacity={0.68}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={`${microDash.toFixed(1)} ${(microDash * 1.15).toFixed(1)}`}
                        filter={`url(#${hairShadowId})`}
                      />
                    )}
                  </g>
                );
              })}

              {/* Directional Curved Brush-Sweep Arrows (Shown in Crisp Blueprint Mode) */}
              {!isSoft &&
                visual.arrows.map((arrow, idx) => (
                  <g key={`arrow-${idx}`} filter={`url(#${hairShadowId})`} opacity={arrow.opacity}>
                    <path
                      d={arrow.d}
                      fill="none"
                      stroke={arrow.stroke}
                      strokeWidth={arrowStrokeW}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={`M ${(-arrowHeadSize).toFixed(1)} ${(-arrowHeadSize * 0.65).toFixed(1)} L 0 0 L ${(-arrowHeadSize).toFixed(1)} ${(arrowHeadSize * 0.65).toFixed(1)}`}
                      fill="none"
                      stroke={arrow.stroke}
                      strokeWidth={arrowStrokeW}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      transform={`translate(${arrow.tipX.toFixed(1)} ${arrow.tipY.toFixed(1)}) rotate(${arrow.angleDeg})`}
                    />
                  </g>
                ))}

              {/* Pearl Highlight & Accent Points (Supports Tapered Vertical Nose-Bridge Oval) */}
              {visual.dots.map((dot, idx) =>
                dot.ry ? (
                  <ellipse
                    key={`dot-${idx}`}
                    cx={dot.x}
                    cy={dot.y}
                    rx={dot.r}
                    ry={dot.ry}
                    fill={dot.fill}
                    fillOpacity={dot.opacity * (isSoft ? 0.88 : 1)}
                    filter={dot.glow ? `url(#${dotGlowId})` : undefined}
                  />
                ) : (
                  <circle
                    key={`dot-${idx}`}
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.r}
                    fill={dot.fill}
                    fillOpacity={dot.opacity * (isSoft ? 0.88 : 1)}
                    filter={dot.glow ? `url(#${dotGlowId})` : undefined}
                  />
                )
              )}
            </g>
          );
        })}
      </svg>

      {/* Idle Interactive Anchor Pins: Cleanly Disappear When Visual Routine Layers Are Active */}
      {showPins &&
        !hasActiveLayers &&
        projectedPins.map(({ id, pos, zone }) => {
          if (!pos.visible) return null;
          const labelOnLeft = pos.leftPct > 68;

          return (
            <button
              key={id}
              type="button"
              data-testid={`face-pin-${id}`}
              aria-label={`Bật chỉ dẫn ${zone.shortLabel} trên mặt`}
              onClick={() => onTapPin(id)}
              style={{ left: `${pos.leftPct}%`, top: `${pos.topPct}%` }}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full"
            >
              <span className="block w-3.5 h-3.5 rounded-full bg-white/95 ring-2 ring-zinc-900/45 shadow-[0_2px_8px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-out group-hover:scale-125" />
              <span
                className={`pointer-events-none absolute top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md bg-zinc-950/65 backdrop-blur-sm text-[10px] font-semibold tracking-tight text-white whitespace-nowrap shadow-xs ${
                  labelOnLeft ? "right-8" : "left-8"
                }`}
              >
                {zone.pinLabel}
              </span>
            </button>
          );
        })}
    </div>
  );
};
