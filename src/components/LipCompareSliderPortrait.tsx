import React, { useCallback, useEffect, useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";
import {
  clampSplitPercent,
  computeCompareBadgeVisibility,
  computeSplitPercentFromPointer,
} from "../lib/beauty/beforeAfterSlider";
import type { VirtualMakeupOptions } from "../lib/beauty/virtualMakeup";
import type { ConsultationReport, FaceLandmarksBox } from "../lib/beauty/types";
import { PortraitCanvas } from "./PortraitCanvas";

export interface SliderSideSpec {
  /** Short prefix shown in top floating tag (e.g. "Không son", "Có son", "A", "B") */
  prefix: string;
  /** Secondary shade/state text next to prefix */
  label: string;
  /** Concise footer caption (e.g. "Môi mộc tự nhiên" or "A · Rom&nd") */
  footerCaption: string;
  /** Swatch circle color */
  swatchHex: string;
  /** Virtual makeup rendering configuration for this side */
  makeup: VirtualMakeupOptions;
  /** Highlighted when this side is the active editable slot (optional) */
  isSelected?: boolean;
  /** Click handler on the top tag (optional, e.g. pick slot A or B) */
  onSelect?: () => void;
}

interface LipCompareSliderPortraitProps {
  report: ConsultationReport;
  box: FaceLandmarksBox;
  leftSide: SliderSideSpec;
  rightSide: SliderSideSpec;
  zoomToLips: boolean;
  splitPct: number;
  onSplitPctChange: (pct: number) => void;
  ariaLabel?: string;
  hintText?: string;
  testId?: string;
  portraitMode?: "corrected" | "original";
}

/**
 * High-precision interactive split slider directly over the user's face & lips.
 * Supports both:
 *  - "Không son / Có son" (bare natural lips left vs selected lipstick right)
 *  - "Chọn so sánh" (Lipstick A left vs Lipstick B right)
 * Uses GPU-composited clip-path + rAF throttling for 60/120fps dragging with zero
 * React re-renders during active pointer movement.
 */
export const LipCompareSliderPortrait: React.FC<LipCompareSliderPortraitProps> = ({
  report,
  box,
  leftSide,
  rightSide,
  zoomToLips,
  splitPct,
  onSplitPctChange,
  ariaLabel = "Thanh trượt so sánh trực tiếp trên môi",
  hintText = "Kéo qua lại trên môi",
  testId = "lip-compare-slider",
  portraitMode = "corrected",
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clipLayerRef = useRef<HTMLDivElement | null>(null);
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const leftBadgeRef = useRef<HTMLElement | null>(null);
  const rightBadgeRef = useRef<HTMLElement | null>(null);

  const draggingRef = useRef(false);
  const liveSplitRef = useRef(splitPct);
  const pendingSplitRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastCommittedRef = useRef(splitPct);

  const [isDragging, setIsDragging] = useState(false);

  const leftTagName = leftSide.prefix;
  const rightTagName = rightSide.prefix;

  const applyVisualSplit = useCallback(
    (pct: number) => {
      const clamped = clampSplitPercent(pct);
      liveSplitRef.current = clamped;
      const rounded = Math.round(clamped);

      if (containerRef.current) {
        containerRef.current.dataset.splitPct = String(rounded);
      }
      if (clipLayerRef.current) {
        clipLayerRef.current.style.clipPath = `inset(0 ${100 - clamped}% 0 0)`;
      }
      if (dividerRef.current) {
        dividerRef.current.style.left = `${clamped}%`;
        dividerRef.current.setAttribute("aria-valuenow", String(rounded));
        dividerRef.current.setAttribute(
          "aria-valuetext",
          `${rounded}% ${leftTagName}, ${100 - rounded}% ${rightTagName}`
        );
      }
      const { showBeforeBadge, showAfterBadge } = computeCompareBadgeVisibility(clamped);
      if (leftBadgeRef.current) {
        leftBadgeRef.current.style.opacity = showBeforeBadge ? "1" : "0";
      }
      if (rightBadgeRef.current) {
        rightBadgeRef.current.style.opacity = showAfterBadge ? "1" : "0";
      }
    },
    [leftTagName, rightTagName]
  );

  useEffect(() => {
    if (!draggingRef.current) {
      applyVisualSplit(splitPct);
      lastCommittedRef.current = splitPct;
    }
  }, [splitPct, applyVisualSplit]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const scheduleDragVisual = useCallback(
    (nextPct: number) => {
      pendingSplitRef.current = nextPct;
      if (rafIdRef.current !== null) return;
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (pendingSplitRef.current === null) return;
        const pct = pendingSplitRef.current;
        pendingSplitRef.current = null;
        applyVisualSplit(pct);
      });
    },
    [applyVisualSplit]
  );

  const getPctFromEvent = (clientX: number): number => {
    const el = containerRef.current;
    if (!el) return liveSplitRef.current;
    const rect = el.getBoundingClientRect();
    return computeSplitPercentFromPointer(clientX, rect.left, rect.width);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    draggingRef.current = true;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    const nextPct = getPctFromEvent(e.clientX);
    applyVisualSplit(nextPct);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const nextPct = getPctFromEvent(e.clientX);
    scheduleDragVisual(nextPct);
  };

  const commitDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const finalPct = pendingSplitRef.current ?? liveSplitRef.current;
    pendingSplitRef.current = null;
    applyVisualSplit(finalPct);
    const rounded = Math.round(finalPct);
    if (rounded !== Math.round(lastCommittedRef.current)) {
      lastCommittedRef.current = rounded;
      onSplitPctChange(rounded);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    onSplitPctChange(50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 5;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSplitPctChange(clampSplitPercent(splitPct - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onSplitPctChange(clampSplitPercent(splitPct + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      onSplitPctChange(0);
    } else if (e.key === "End") {
      e.preventDefault();
      onSplitPctChange(100);
    }
  };

  const roundedPct = Math.round(splitPct);
  const { showBeforeBadge, showAfterBadge } = computeCompareBadgeVisibility(splitPct);
  const motionTimingClass = isDragging
    ? "transition-none"
    : "transition-[clip-path,left] duration-200 ease-out";

  const renderCornerTag = (
    side: SliderSideSpec,
    positionClass: string,
    visible: boolean,
    refCb: (el: HTMLElement | null) => void
  ) => {
    const baseClasses = `absolute top-3.5 ${positionClass} z-20 max-w-[44%] min-h-[32px] px-2.5 py-1 rounded-[3px] backdrop-blur-md border text-left inline-flex items-center gap-2 transition-all duration-150 ${
      side.isSelected
        ? "bg-white/95 text-[#111111] border-white shadow-[0_4px_14px_rgba(0,0,0,0.22)]"
        : "bg-[#111111]/78 text-white border-white/15"
    }`;

    const content = (
      <>
        <span
          className="w-3 h-3 rounded-full ring-1 ring-black/15 shrink-0"
          style={{ backgroundColor: side.swatchHex }}
          aria-hidden="true"
        />
        <span className="text-[11px] font-semibold truncate">
          {side.label ? `${side.prefix} · ${side.label}` : side.prefix}
        </span>
      </>
    );

    if (side.onSelect) {
      return (
        <button
          ref={refCb}
          type="button"
          onClick={side.onSelect}
          style={{ opacity: visible ? 1 : 0 }}
          className={`${baseClasses} cursor-pointer hover:brightness-105`}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        ref={refCb}
        style={{ opacity: visible ? 1 : 0 }}
        className={`${baseClasses} pointer-events-none`}
      >
        {content}
      </div>
    );
  };

  return (
    <div className="w-full bg-[#F5F5F5] sm:py-4 md:p-0 md:bg-[#111111] border border-[#E5E5E5] overflow-hidden">
      <div
        ref={containerRef}
        data-testid={testId}
        data-split-pct={roundedPct}
        data-dragging={isDragging ? "true" : "false"}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={commitDragEnd}
        onPointerCancel={commitDragEnd}
        onDoubleClick={handleDoubleClick}
        className="relative aspect-[4/5] w-full max-w-[460px] mx-auto md:max-w-none overflow-hidden bg-[#111111] sm:border sm:border-[#E5E5E5] md:border-0 select-none touch-pan-y cursor-ew-resize"
      >
      {/* Right Base Layer */}
      <div className="absolute inset-0">
        <PortraitCanvas
          report={report}
          mode={portraitMode}
          showOverlay={false}
          box={box}
          virtualMakeup={rightSide.makeup}
          zoomToLips={zoomToLips}
          fit="cover"
          containerClassName="h-full w-full bg-zinc-950"
        />
      </div>

      {/* Left Clipped Layer */}
      <div
        ref={clipLayerRef}
        className={`absolute inset-0 will-change-[clip-path] ${motionTimingClass}`}
        style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
      >
        <PortraitCanvas
          report={report}
          mode={portraitMode}
          showOverlay={false}
          box={box}
          virtualMakeup={leftSide.makeup}
          zoomToLips={zoomToLips}
          fit="cover"
          containerClassName="h-full w-full bg-zinc-950"
        />
      </div>

      {/* Top Corner Labels */}
      {renderCornerTag(leftSide, "left-3.5", showBeforeBadge, (el) => {
        leftBadgeRef.current = el;
      })}
      {renderCornerTag(rightSide, "right-3.5", showAfterBadge, (el) => {
        rightBadgeRef.current = el;
      })}

      {/* Hairline Vertical Split Divider & Sculpted Drag Handle */}
      <div
        ref={dividerRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={roundedPct}
        aria-valuetext={`${roundedPct}% ${leftTagName}, ${100 - roundedPct}% ${rightTagName}`}
        onKeyDown={handleKeyDown}
        style={{ left: `${splitPct}%` }}
        className={`absolute top-0 bottom-0 z-20 -translate-x-1/2 w-11 flex items-center justify-center focus:outline-none group ${motionTimingClass}`}
      >
        <div
          className={`w-[1.5px] h-full transition-colors ${
            isDragging
              ? "bg-white shadow-[0_0_12px_rgba(0,0,0,0.7)]"
              : "bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.45)]"
          }`}
        />

        <div
          className={`absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 backdrop-blur-md text-zinc-900 border border-black/10 flex items-center justify-center transition-transform duration-150 ${
            isDragging
              ? "scale-110 shadow-[0_8px_24px_rgba(0,0,0,0.38)] ring-4 ring-white/30"
              : "shadow-[0_4px_16px_rgba(0,0,0,0.28)] group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-rose-500/35"
          }`}
        >
          <MoveHorizontal className="w-4 h-4 stroke-[2.2]" />
        </div>
      </div>

      {/* Measured Bottom Scrim */}
      <div className="absolute inset-x-0 bottom-0 z-10 pt-14 pb-3.5 px-4 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none flex items-end justify-between gap-2 text-[11px] text-white/90">
        <span className="truncate font-medium">{leftSide.footerCaption}</span>
        <span className="hidden sm:inline text-white/70 shrink-0 text-[10px] tracking-wide">
          {hintText}
        </span>
        <span className="truncate text-right font-medium">{rightSide.footerCaption}</span>
      </div>
      </div>
    </div>
  );
};
