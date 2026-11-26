import React from "react";

interface TopProgressBarProps {
  /** Normalized progress value in [0, 1]. */
  progress: number;
  /** Whether the progress bar should be visible (fades out smoothly when false). */
  visible: boolean;
  /** Accessible description of the current image processing stage. */
  label?: string;
}

export const TopProgressBar: React.FC<TopProgressBarProps> = ({
  progress,
  visible,
  label = "Đang xử lý ảnh chân dung",
}) => {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-hidden={!visible}
      data-testid="top-progress-bar"
      data-visible={visible ? "true" : "false"}
      className={`fixed top-0 left-0 right-0 z-50 h-[3px] pointer-events-none transition-opacity duration-300 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="w-full h-full bg-zinc-200/50 overflow-hidden">
        <div
          className="relative h-full w-full origin-left bg-gradient-to-r from-rose-500 via-rose-600 to-zinc-900 transition-transform duration-300 ease-out will-change-transform"
          style={{ transform: `scaleX(${clamped})` }}
        >
          {visible && clamped > 0 && clamped < 1 && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/55 to-transparent animate-progress-sheen"
            />
          )}
        </div>
      </div>
    </div>
  );
};
