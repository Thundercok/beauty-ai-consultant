import React from "react";
import { AlertTriangle, CheckCircle2, Moon, Sun, SunMedium } from "lucide-react";
import type { LightingReading } from "../lib/beauty/cameraAssistant";

interface LightingAssistantOverlayProps {
  reading: LightingReading;
}

export const LightingAssistantOverlay: React.FC<LightingAssistantOverlayProps> = ({ reading }) => {
  const styles =
    reading.level === "perfect"
      ? {
          ring: "border-emerald-400/50 bg-emerald-950/65",
          dot: "bg-emerald-400",
          badge: "bg-emerald-500/25 text-emerald-200 border-emerald-400/40",
          bar: "bg-emerald-400",
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />,
        }
      : reading.level === "too_dark"
        ? {
            ring: "border-rose-400/50 bg-rose-950/70",
            dot: "bg-rose-400",
            badge: "bg-rose-500/25 text-rose-100 border-rose-400/40",
            bar: "bg-rose-400",
            icon: <Moon className="w-4 h-4 text-rose-300 shrink-0" />,
          }
        : reading.level === "too_bright"
          ? {
              ring: "border-amber-400/50 bg-amber-950/70",
              dot: "bg-amber-300",
              badge: "bg-amber-500/25 text-amber-100 border-amber-400/40",
              bar: "bg-amber-300",
              icon: <Sun className="w-4 h-4 text-amber-300 shrink-0" />,
            }
          : reading.level === "uneven"
            ? {
                ring: "border-amber-400/45 bg-zinc-950/70",
                dot: "bg-amber-400",
                badge: "bg-amber-500/20 text-amber-100 border-amber-400/35",
                bar: "bg-amber-400",
                icon: <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />,
              }
            : {
                ring: "border-white/20 bg-zinc-950/70",
                dot: "bg-amber-300",
                badge: "bg-white/15 text-white border-white/20",
                bar: "bg-amber-300",
                icon: <SunMedium className="w-4 h-4 text-amber-200 shrink-0" />,
              };

  const sourceText =
    reading.source === "ambient_sensor" && reading.lux !== null
      ? `Cảm biến ánh sáng · ${reading.lux} lux`
      : reading.source === "camera_frame" && reading.luma !== null
        ? `Đo sáng camera · ${reading.brightnessPct}%`
        : "Trợ lý ánh sáng";

  return (
    <div
      data-testid="lighting-assistant-overlay"
      data-lighting-level={reading.level}
      role="status"
      aria-live="polite"
      className={`pointer-events-none rounded-2xl border backdrop-blur-md px-3.5 py-2.5 text-white shadow-lg transition-colors duration-200 ${styles.ring}`}
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {styles.icon}
          <span className="text-xs font-semibold tracking-tight truncate">{reading.labelVi}</span>
          <span
            className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold tracking-wide uppercase shrink-0 ${styles.badge}`}
          >
            {reading.badgeEn}
          </span>
        </div>
        <span className="text-[10px] font-mono tabular-nums text-white/75 whitespace-nowrap shrink-0">
          {sourceText}
        </span>
      </div>

      {/* Subtle real-time exposure meter bar */}
      <div className="mt-2 flex items-center gap-2.5">
        <div className="relative h-1.5 flex-1 rounded-full bg-white/15 overflow-hidden">
          {/* Optimal daylight zone indicator */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[37%] right-[12%] bg-emerald-400/20"
          />
          <div
            className={`h-full rounded-full transition-all duration-200 ${styles.bar}`}
            style={{ width: `${Math.max(8, Math.min(100, reading.brightnessPct))}%` }}
          />
        </div>
        <span className="text-[10px] text-white/85 truncate max-w-[65%]">{reading.guidanceVi}</span>
      </div>
    </div>
  );
};
