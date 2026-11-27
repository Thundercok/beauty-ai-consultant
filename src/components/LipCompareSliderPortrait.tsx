import React, { useCallback, useEffect, useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";
import {
  clampSplitPercent,
  computeCompareBadgeVisibility,
  computeSplitPercentFromPointer,
} from "../lib/beauty/beforeAfterSlider";
import type { VirtualMakeupOptions } from "../lib/beauty/virtualMakeup";
import type { ConsultationReport, FaceLandmarksBox, MatchedProduct } from "../lib/beauty/types";
import { PortraitCanvas } from "./PortraitCanvas";

interface LipCompareSliderPortraitProps {
  report: ConsultationReport;
  box: FaceLandmarksBox;
  productA: MatchedProduct;
  productB: MatchedProduct;
  swatchHexA: string;
  swatchHexB: string;
  makeupA: VirtualMakeupOptions;
  makeupB: VirtualMakeupOptions;
  activeSlot: "A" | "B";
  onActiveSlotChange: (slot: "A" | "B") => void;
  zoomToLips: boolean;
  splitPct: number;
  onSplitPctChange: (pct: number) => void;
}

/**
 * High-precision 2-shade lipstick comparison slider directly over the user's face & lips.
 * Left curtain renders Màu A, right base renders Màu B, using GPU-composited clip-path
 * for buttery 60/120fps dragging with zero React re-renders during pointer movement.
 */
export const LipCompareSliderPortrait: React.FC<LipCompareSliderPortraitProps> = ({
  report,
  box,
  productA,
  productB,
  swatchHexA,
  swatchHexB,
  makeupA,
  makeupB,
  activeSlot,
  onActiveSlotChange,
  zoomToLips,
  splitPct,
  onSplitPctChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clipLayerRef = useRef<HTMLDivElement | null>(null);
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const leftBadgeRef = useRef<HTMLButtonElement | null>(null);
  const rightBadgeRef = useRef<HTMLButtonElement | null>(null);

  const draggingRef = useRef(false);
  const liveSplitRef = useRef(splitPct);
  const pendingSplitRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastCommittedRef = useRef(splitPct);

  const [isDragging, setIsDragging] = useState(false);

  const applyVisualSplit = useCallback((pct: number) => {
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
        `${rounded}% Màu A, ${100 - rounded}% Màu B`
      );
    }
    const { showBeforeBadge, showAfterBadge } = computeCompareBadgeVisibility(clamped);
    if (leftBadgeRef.current) {
      leftBadgeRef.current.style.opacity = showBeforeBadge ? "1" : "0";
    }
    if (rightBadgeRef.current) {
      rightBadgeRef.current.style.opacity = showAfterBadge ? "1" : "0";
    }
  }, []);

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

  return (
    <div
      ref={containerRef}
      data-testid="lip-compare-slider"
      data-split-pct={roundedPct}
      data-dragging={isDragging ? "true" : "false"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={commitDragEnd}
      onPointerCancel={commitDragEnd}
      onDoubleClick={handleDoubleClick}
      className="relative h-[365px] sm:h-[445px] lg:h-[495px] w-full rounded-3xl overflow-hidden border border-zinc-200/85 bg-zinc-950 select-none touch-pan-y cursor-ew-resize shadow-xs"
    >
      {/* Right Base Layer: Màu B */}
      <div className="absolute inset-0">
        <PortraitCanvas
          report={report}
          mode="corrected"
          showOverlay={false}
          box={box}
          virtualMakeup={makeupB}
          zoomToLips={zoomToLips}
          fit="cover"
          containerClassName="h-full w-full bg-zinc-950"
        />
      </div>

      {/* Left Clipped Layer: Màu A */}
      <div
        ref={clipLayerRef}
        className={`absolute inset-0 will-change-[clip-path] ${motionTimingClass}`}
        style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
      >
        <PortraitCanvas
          report={report}
          mode="corrected"
          showOverlay={false}
          box={box}
          virtualMakeup={makeupA}
          zoomToLips={zoomToLips}
          fit="cover"
          containerClassName="h-full w-full bg-zinc-950"
        />
      </div>

      {/* Top Interactive Shade Badges (Tap A or B to edit that slot) */}
      <button
        ref={leftBadgeRef}
        type="button"
        onClick={() => onActiveSlotChange("A")}
        style={{ opacity: showBeforeBadge ? 1 : 0 }}
        className={`absolute top-3 left-3 z-20 max-w-[44%] min-h-[34px] px-2.5 py-1 rounded-full backdrop-blur-md border text-left inline-flex items-center gap-1.5 transition-all duration-150 cursor-pointer ${
          activeSlot === "A"
            ? "bg-white text-zinc-900 border-white shadow-sm"
            : "bg-black/60 text-white border-white/20 hover:bg-black/75"
        }`}
      >
        <span
          className="w-3 h-3 rounded-full ring-1 ring-black/15 shrink-0"
          style={{ backgroundColor: swatchHexA }}
          aria-hidden="true"
        />
        <span className="text-[11px] font-semibold truncate">
          A · {productA.shade}
        </span>
      </button>

      <button
        ref={rightBadgeRef}
        type="button"
        onClick={() => onActiveSlotChange("B")}
        style={{ opacity: showAfterBadge ? 1 : 0 }}
        className={`absolute top-3 right-3 z-20 max-w-[44%] min-h-[34px] px-2.5 py-1 rounded-full backdrop-blur-md border text-left inline-flex items-center gap-1.5 transition-all duration-150 cursor-pointer ${
          activeSlot === "B"
            ? "bg-white text-zinc-900 border-white shadow-sm"
            : "bg-black/60 text-white border-white/20 hover:bg-black/75"
        }`}
      >
        <span
          className="w-3 h-3 rounded-full ring-1 ring-black/15 shrink-0"
          style={{ backgroundColor: swatchHexB }}
          aria-hidden="true"
        />
        <span className="text-[11px] font-semibold truncate">
          B · {productB.shade}
        </span>
      </button>

      {/* Vertical Split Divider & Tactile Drag Handle */}
      <div
        ref={dividerRef}
        role="slider"
        tabIndex={0}
        aria-label="Thanh trượt so sánh Màu A và Màu B trực tiếp trên môi"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={roundedPct}
        aria-valuetext={`${roundedPct}% Màu A, ${100 - roundedPct}% Màu B`}
        onKeyDown={handleKeyDown}
        style={{ left: `${splitPct}%` }}
        className={`absolute top-0 bottom-0 z-20 -translate-x-1/2 w-10 flex items-center justify-center focus:outline-none group ${motionTimingClass}`}
      >
        <div
          className={`w-[2px] h-full transition-colors ${
            isDragging
              ? "bg-white shadow-[0_0_12px_rgba(0,0,0,0.65)]"
              : "bg-white/95 shadow-[0_0_8px_rgba(0,0,0,0.45)]"
          }`}
        />

        <div
          className={`absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-zinc-900 border border-zinc-200 flex items-center justify-center transition-transform duration-150 ${
            isDragging
              ? "scale-110 shadow-[0_6px_22px_rgba(0,0,0,0.4)] ring-4 ring-white/30"
              : "shadow-[0_3px_14px_rgba(0,0,0,0.32)] group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-rose-500/40"
          }`}
        >
          <MoveHorizontal className="w-4 h-4 stroke-[2.4]" />
        </div>
      </div>

      {/* Bottom Hint Scrim */}
      <div className="absolute inset-x-0 bottom-0 z-10 pt-12 pb-3 px-4 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none flex items-end justify-between gap-2 text-[11px] text-white/90">
        <span className="truncate">
          <strong className="font-semibold text-white">A:</strong> {productA.brand}
        </span>
        <span className="text-white/75 shrink-0">Kéo qua lại trên môi</span>
        <span className="truncate text-right">
          <strong className="font-semibold text-white">B:</strong> {productB.brand}
        </span>
      </div>
    </div>
  );
};
