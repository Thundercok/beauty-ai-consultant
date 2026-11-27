import React from "react";
import type { FaceAlignmentReading } from "../lib/beauty/cameraAssistant";

interface FaceAlignmentGuideOverlayProps {
  alignment: FaceAlignmentReading;
}

export const FaceAlignmentGuideOverlay: React.FC<FaceAlignmentGuideOverlayProps> = ({
  alignment,
}) => {
  const isAligned = alignment.status === "aligned";
  const strokeColor = isAligned ? "#34D399" : "rgba(255, 255, 255, 0.9)";
  const accentStroke = isAligned ? "#6EE7B7" : "rgba(253, 186, 116, 0.92)";

  return (
    <div
      data-testid="face-alignment-guide"
      data-alignment-status={alignment.status}
      className="pointer-events-none absolute inset-0 flex flex-col justify-between"
      aria-hidden="true"
    >
      {/* Precision SVG viewfinder mask + face detection oval + eye line + chin anchor */}
      <svg
        viewBox="0 0 360 480"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <mask id="face-guide-cutout-mask">
            <rect width="360" height="480" fill="white" />
            <ellipse cx="180" cy="221" rx="97" ry="145" fill="black" />
          </mask>
        </defs>

        {/* Subtle darkened surround outside the detection oval */}
        <rect
          width="360"
          height="480"
          fill="rgba(9, 9, 11, 0.44)"
          mask="url(#face-guide-cutout-mask)"
        />

        {/* Detection box corner registration brackets */}
        <g
          stroke={isAligned ? "#34D399" : "rgba(255,255,255,0.68)"}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        >
          {/* Top-left */}
          <path d="M 68 92 L 68 68 L 92 68" />
          {/* Top-right */}
          <path d="M 268 68 L 292 68 L 292 92" />
          {/* Bottom-left */}
          <path d="M 68 352 L 68 376 L 92 376" />
          {/* Bottom-right */}
          <path d="M 268 376 L 292 376 L 292 352" />
        </g>

        {/* Main face oval guide */}
        <ellipse
          cx="180"
          cy="221"
          rx="97"
          ry="145"
          fill="none"
          stroke={strokeColor}
          strokeWidth={isAligned ? "2.6" : "2"}
          strokeDasharray={isAligned ? undefined : "8 6"}
        />

        {/* Horizontal eye-level alignment line + eye reticle targets */}
        <line
          x1="92"
          y1="194"
          x2="268"
          y2="194"
          stroke={accentStroke}
          strokeWidth="1.4"
          strokeDasharray="4 4"
        />
        <g stroke={accentStroke} strokeWidth="1.6" fill="none">
          {/* Left eye alignment bracket */}
          <ellipse cx="144" cy="194" rx="16" ry="7.5" opacity="0.88" />
          <circle cx="144" cy="194" r="2" fill={accentStroke} />
          {/* Right eye alignment bracket */}
          <ellipse cx="216" cy="194" rx="16" ry="7.5" opacity="0.88" />
          <circle cx="216" cy="194" r="2" fill={accentStroke} />
        </g>

        {/* Vertical nose-centerline subtle tick */}
        <line
          x1="180"
          y1="184"
          x2="180"
          y2="252"
          stroke="rgba(255, 255, 255, 0.32)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />

        {/* Chin anchor curve at the bottom of the oval */}
        <path
          d="M 152 358 Q 180 374 208 358"
          fill="none"
          stroke={accentStroke}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </svg>

      {/* Crisp floating Vietnamese guide tags aligned to Eyes and Chin */}
      <div className="relative flex-1 w-full">
        <div className="absolute left-1/2 -translate-x-1/2 top-[34%] -translate-y-full">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-xs border border-white/15 text-[10px] font-medium text-white/95 whitespace-nowrap">
            Đặt ngang tầm mắt
          </span>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 top-[79%]">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-xs border border-white/15 text-[10px] font-medium text-white/95 whitespace-nowrap">
            Đặt cằm tại đây
          </span>
        </div>
      </div>

      {/* Bottom real-time alignment instruction chip */}
      <div className="relative px-4 pb-3 flex justify-center">
        <div
          className={`inline-flex flex-col items-center text-center px-3.5 py-1.5 rounded-2xl backdrop-blur-md border transition-colors ${
            isAligned
              ? "bg-emerald-950/75 border-emerald-400/45 text-emerald-100"
              : "bg-black/60 border-white/15 text-white"
          }`}
        >
          <span className="text-xs font-semibold leading-tight">{alignment.labelVi}</span>
          <span className="text-[11px] text-white/80 leading-snug mt-0.5">{alignment.hintVi}</span>
        </div>
      </div>
    </div>
  );
};
