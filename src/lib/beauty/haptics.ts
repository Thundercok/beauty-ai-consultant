export type HapticStyle = "selection" | "soft" | "light" | "success";

export type HapticPattern = number | number[];

export const HAPTIC_PATTERNS: Record<HapticStyle, HapticPattern> = {
  selection: 10,
  soft: 6,
  light: 14,
  success: [10, 35, 14],
};

export interface HapticResult {
  triggered: boolean;
  channel: "vibrate" | "ios-switch" | "none";
  pattern: HapticPattern;
}

export interface HapticEnvironment {
  vibrate?: (pattern: HapticPattern) => boolean;
  prefersReducedMotion?: boolean;
  isTouchDevice?: boolean;
  triggerIosSwitch?: () => boolean;
}

function detectReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function detectTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const maxTouch = typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0;
  return maxTouch > 0 || "ontouchstart" in window;
}

/**
 * Progressive iOS 17.4+ Safari Taptic Engine fallback:
 * Clicking a hidden `<label>` bound to `<input type="checkbox" switch>` inside
 * a direct user gesture triggers native subtle switch haptics on iOS devices
 * where `navigator.vibrate` is unavailable.
 */
function pulseIosNativeSwitch(): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  try {
    const id = "__beauty_ai_haptic_switch__";
    let label = document.getElementById(`${id}_label`) as HTMLLabelElement | null;
    if (!label) {
      const input = document.createElement("input");
      input.id = id;
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.setAttribute("aria-hidden", "true");
      input.tabIndex = -1;
      input.style.cssText =
        "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";

      label = document.createElement("label");
      label.id = `${id}_label`;
      label.htmlFor = id;
      label.setAttribute("aria-hidden", "true");
      label.style.cssText =
        "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";

      document.body.appendChild(input);
      document.body.appendChild(label);
    }
    label.click();
    return true;
  } catch {
    return false;
  }
}

/**
 * Trigger a subtle, battery-friendly haptic pulse during a user interaction.
 * Uses the Web Vibration API (`navigator.vibrate`) when available, falls back
 * to iOS Safari native switch haptics on touch devices, and respects
 * `prefers-reduced-motion`.
 */
export function triggerHaptic(
  style: HapticStyle = "selection",
  env?: HapticEnvironment
): HapticResult {
  const pattern = HAPTIC_PATTERNS[style];
  const reducedMotion = env?.prefersReducedMotion ?? detectReducedMotion();
  if (reducedMotion) {
    return { triggered: false, channel: "none", pattern };
  }

  const vibrateFn =
    env?.vibrate ??
    (typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
      ? (p: HapticPattern) => navigator.vibrate(p)
      : undefined);

  if (vibrateFn) {
    try {
      const ok = vibrateFn(pattern);
      return {
        triggered: Boolean(ok),
        channel: ok ? "vibrate" : "none",
        pattern,
      };
    } catch {
      return { triggered: false, channel: "none", pattern };
    }
  }

  const isTouch = env?.isTouchDevice ?? detectTouchDevice();
  if (isTouch) {
    const iosFn = env?.triggerIosSwitch ?? pulseIosNativeSwitch;
    try {
      const ok = iosFn();
      return {
        triggered: Boolean(ok),
        channel: ok ? "ios-switch" : "none",
        pattern,
      };
    } catch {
      return { triggered: false, channel: "none", pattern };
    }
  }

  return { triggered: false, channel: "none", pattern };
}
