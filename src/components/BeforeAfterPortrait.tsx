import React, { useCallback, useEffect, useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";
import {
  clampSplitPercent,
  computeCompareBadgeVisibility,
  computeSplitPercentFromPointer,
} from "../lib/beauty/beforeAfterSlider";
import type { ConsultationReport, FaceLandmarksBox } from "../lib/beauty/types";
import { PortraitCanvas } from "./PortraitCanvas";

interface BeforeAfterPortraitProps {
  report: ConsultationReport;
  box: FaceLandmarksBox;
  showMeshPreview: boolean;
  splitPct: number;
  onSplitPctChange: (pct: number) => void;
}

export const BeforeAfterPortrait: React.FC<BeforeAfterPortraitProps> = ({
  report,
  box,
  showMeshPreview,
  splitPct,
  onSplitPctChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clipLayerRef = useRef<HTMLDivElement | null>(null);
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const leftBadgeRef = useRef<HTMLDivElement | null>(null);
  const rightBadgeRef = useRef<HTMLDivElement | null>(null);
  const dragBadgeRef = useRef<HTMLDivElement | null>(null);

  const draggingRef = useRef(false);
  const liveSplitRef = useRef(splitPct);
  const pendingSplitRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastCommittedRef = useRef(splitPct);

  const [isDragging, setIsDragging] = useState(false);
  const [introOffset, setIntroOffset] = useState<number | null>(null);

  // Apply GPU-composited clip-path & handle position directly to DOM (60/120fps zero React re-render during drag)
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
        `${rounded}% ảnh gốc, ${100 - rounded}% ảnh chuẩn sáng`
      );
    }
    if (dragBadgeRef.current) {
      dragBadgeRef.current.textContent = `${rounded}%`;
    }
    const { showBeforeBadge, showAfterBadge } = computeCompareBadgeVisibility(clamped);
    if (leftBadgeRef.current) {
      leftBadgeRef.current.style.opacity = showBeforeBadge ? "1" : "0";
    }
    if (rightBadgeRef.current) {
      rightBadgeRef.current.style.opacity = showAfterBadge ? "1" : "0";
    }
  }, []);

  // Subtle one-time reveal sweep when a new photo loads so users immediately notice the live curtain
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setIntroOffset(null);
      return;
    }
    setIntroOffset(36);
    const raf1 = window.requestAnimationFrame(() => {
      const raf2 = window.requestAnimationFrame(() => {
        setIntroOffset(null);
      });
      rafIdRef.current = raf2;
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [report.originalRgba]);

  // Keep DOM synchronized whenever controlled splitPct or introOffset changes outside an active drag
  const displayedSplit = introOffset ?? splitPct;
  useEffect(() => {
    if (!draggingRef.current) {
      applyVisualSplit(displayedSplit);
      lastCommittedRef.current = displayedSplit;
    }
  }, [displayedSplit, applyVisualSplit]);

  // Cleanup any queued rAF on unmount
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
    // Ignore clicks on floating overlay buttons above the canvas
    if ((e.target as HTMLElement).closest("button")) return;
    setIntroOffset(null);
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

  const roundedPct = Math.round(displayedSplit);
  const { showBeforeBadge, showAfterBadge } = computeCompareBadgeVisibility(displayedSplit);

  // Smooth ease-out glide on click/preset/intro; instant zero-lag tracking while actively dragging
  const motionTimingClass = isDragging
    ? "transition-none"
    : introOffset !== null
      ? "transition-[clip-path,left] duration-500 ease-out"
      : "transition-[clip-path,left] duration-200 ease-out";

  return (
    <div
      ref={containerRef}
      data-testid="before-after-portrait"
      data-split-pct={roundedPct}
      data-dragging={isDragging ? "true" : "false"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={commitDragEnd}
      onPointerCancel={commitDragEnd}
      onDoubleClick={handleDoubleClick}
      className="relative h-full w-full select-none touch-pan-y cursor-ew-resize overflow-hidden bg-zinc-950"
    >
      {/* Base Layer (Right Side): Color-Balanced / Daylight Studio Result (After) */}
      <div className="absolute inset-0">
        <PortraitCanvas
          report={report}
          mode="corrected"
          showOverlay={false}
          meshPreview={showMeshPreview}
          box={box}
          fit="cover"
          containerClassName="h-full w-full bg-zinc-950"
        />
      </div>

      {/* Top Clipped Layer (Left Side): Original Raw Photo under Ambient Lamp (Before) */}
      <div
        ref={clipLayerRef}
        className={`absolute inset-0 will-change-[clip-path] ${motionTimingClass}`}
        style={{ clipPath: `inset(0 ${100 - displayedSplit}% 0 0)` }}
      >
        <PortraitCanvas
          report={report}
          mode="original"
          showOverlay={false}
          meshPreview={showMeshPreview}
          box={box}
          fit="cover"
          containerClassName="h-full w-full bg-zinc-950"
        />
      </div>

      {/* Contextual Before / After Corner Badges */}
      <div
        ref={leftBadgeRef}
        aria-hidden="true"
        style={{ opacity: showBeforeBadge ? 1 : 0 }}
        className="pointer-events-none absolute top-14 left-3 z-10 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs border border-white/15 text-[10px] font-semibold tracking-wide text-amber-100 transition-opacity duration-150"
      >
        Trước · Ảnh gốc
      </div>
      <div
        ref={rightBadgeRef}
        aria-hidden="true"
        style={{ opacity: showAfterBadge ? 1 : 0 }}
        className="pointer-events-none absolute top-14 right-3 z-10 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs border border-emerald-300/25 text-[10px] font-semibold tracking-wide text-emerald-200 transition-opacity duration-150"
      >
        Sau · Chuẩn sáng
      </div>

      {/* Vertical Split Curtain Hairline + Accessible Tactile Drag Handle */}
      <div
        ref={dividerRef}
        role="slider"
        tabIndex={0}
        aria-label="Kéo mượt để so sánh ảnh gốc và ảnh đã khử ánh sáng đèn"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={roundedPct}
        aria-valuetext={`${roundedPct}% ảnh gốc, ${100 - roundedPct}% ảnh chuẩn sáng`}
        onKeyDown={handleKeyDown}
        style={{ left: `${displayedSplit}%` }}
        className={`absolute inset-y-0 z-10 -translate-x-1/2 w-11 flex items-center justify-center touch-none focus:outline-none group will-change-[left] ${motionTimingClass}`}
      >
        {/* Crisp luminous vertical divider line */}
        <div
          aria-hidden="true"
          className={`h-full w-[2px] bg-white transition-shadow duration-150 ${
            isDragging
              ? "shadow-[0_0_16px_rgba(255,255,255,0.85),0_0_8px_rgba(0,0,0,0.65)]"
              : "shadow-[0_0_10px_rgba(0,0,0,0.65)]"
          }`}
        />

        {/* Live % pill shown cleanly above handle only while dragging */}
        <div
          ref={dragBadgeRef}
          aria-hidden="true"
          className={`pointer-events-none absolute top-[35%] -translate-y-full px-2 py-0.5 rounded-full bg-zinc-900/85 backdrop-blur-xs border border-white/20 text-[10px] font-mono tabular-nums font-semibold text-white shadow-md transition-opacity duration-150 ${
            isDragging ? "opacity-100" : "opacity-0"
          }`}
        >
          {roundedPct}%
        </div>

        {/* Circular tactile grab handle */}
        <div
          aria-hidden="true"
          className={`absolute top-[44%] -translate-y-1/2 w-10 h-10 rounded-full bg-white text-zinc-900 flex items-center justify-center transition-transform duration-150 ${
            isDragging
              ? "scale-105 shadow-[0_6px_22px_rgba(0,0,0,0.45)] ring-4 ring-white/40"
              : "shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-2 ring-black/10 group-hover:scale-105"
          } group-focus-visible:ring-4 group-focus-visible:ring-rose-500`}
        >
          <MoveHorizontal className="w-4 h-4" strokeWidth={2.35} />
        </div>
      </div>
    </div>
  );
};
