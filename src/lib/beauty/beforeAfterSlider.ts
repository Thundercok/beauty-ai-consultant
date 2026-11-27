export function clampSplitPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
}

export function computeSplitPercentFromPointer(
  clientX: number,
  rectLeft: number,
  rectWidth: number
): number {
  if (!Number.isFinite(rectWidth) || rectWidth <= 0) return 50;
  const raw = ((clientX - rectLeft) / rectWidth) * 100;
  return clampSplitPercent(raw);
}

export function formatBeforeLightingBadge(cctK: number | null): string {
  if (cctK === null || !Number.isFinite(cctK)) {
    return "Trước · Ảnh gốc";
  }
  const rounded = Math.round(cctK / 100) * 100;
  if (cctK < 5000) {
    return `Trước · Đèn vàng ~${rounded}K`;
  }
  if (cctK > 6800) {
    return `Trước · Đèn lạnh ~${rounded}K`;
  }
  return `Trước · Gốc ~${rounded}K`;
}

export function computeCompareBadgeVisibility(splitPct: number): {
  showBeforeBadge: boolean;
  showAfterBadge: boolean;
} {
  const pct = clampSplitPercent(splitPct);
  return {
    showBeforeBadge: pct >= 16,
    showAfterBadge: pct <= 84,
  };
}
