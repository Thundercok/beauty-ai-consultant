"""Experiment 01: Quantify failure modes of the Tier-A baseline under multi-illuminant shifts.

Tests two controlled questions:
1. Identity check (D65 -> D65): Does `skin_roi_gray_world_wb` preserve true skin color
   and chromophore indices when the photo is already captured under ideal D65 daylight?
2. Illumination invariance (2700K / 4000K / 6500K / 8000K): How much do CIELAB (Delta E00),
   ITA, Melanin index, Hemoglobin index, and predicted Season drift when only the room
   illuminant changes?

Relighting is simulated in linear RGB (von Kries diagonal illuminant model in linear sRGB),
then re-encoded to 8-bit sRGB.
"""

from __future__ import annotations

import cv2
import numpy as np

from beauty_ai.face_analysis import classify_season, compute_skin_metrics, skin_roi_gray_world_wb
from beauty_ai.product_matcher import _linear_to_srgb, _srgb_to_linear, ciede2000, rgb_to_lab

# Standard linear-sRGB illuminant multipliers relative to D65 (Y-normalized).
# Derived from CIE illuminant chromaticities mapped to linear sRGB.
ILLUMINANT_GAINS_LINEAR: dict[str, np.ndarray] = {
    "2700K_warm_lamp": np.array([1.38, 0.94, 0.44]),
    "4000K_office": np.array([1.14, 0.99, 0.72]),
    "6500K_D65": np.array([1.00, 1.00, 1.00]),
    "8000K_cool_shade": np.array([0.92, 1.00, 1.15]),
}

# Representative ground-truth D65 sRGB skin swatches (Fitzpatrick I-V, warm & cool).
SKIN_PROFILES_RGB: dict[str, tuple[int, int, int]] = {
    "Fair_Cool (I-II)": (235, 200, 192),
    "Light_Warm (II-III)": (224, 186, 155),
    "Medium_Warm (III-IV)": (194, 148, 114),
    "Tan_Olive (IV)": (164, 126, 98),
    "Deep_Warm (V)": (118, 82, 62),
}


def make_skin_patch(rgb: tuple[int, int, int], size: int = 80, seed: int = 42) -> np.ndarray:
    """Create a realistic slightly-textured BGR uint8 skin patch with subtle biological noise."""
    rng = np.random.default_rng(seed)
    base = np.full((size, size, 3), rgb, dtype=float)
    noise = rng.normal(0.0, 2.0, size=(size, size, 3))
    rgb_img = np.clip(base + noise, 0, 255).astype(np.uint8)
    return cv2.cvtColor(rgb_img, cv2.COLOR_RGB2BGR)


def relight_bgr_linear(img_bgr: np.ndarray, illuminant_name: str) -> np.ndarray:
    """Apply a physical linear-RGB illuminant shift to a D65 BGR image."""
    gains = ILLUMINANT_GAINS_LINEAR[illuminant_name]
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    linear = _srgb_to_linear(rgb)
    # Keep headroom below clipping where possible while preserving chromaticity ratio.
    lit_linear = np.clip(linear * gains[None, None, :], 0.0, 1.0)
    lit_rgb = np.round(_linear_to_srgb(lit_linear)).astype(np.uint8)
    return cv2.cvtColor(lit_rgb, cv2.COLOR_RGB2BGR)


def measure_patch(img_bgr: np.ndarray, apply_wb: bool) -> dict:
    """Measure Lab, ITA, Melanin, Hemoglobin, and Season on a full-patch skin mask."""
    mask = np.full(img_bgr.shape[:2], 255, dtype=np.uint8)
    work = skin_roi_gray_world_wb(img_bgr, mask) if apply_wb else img_bgr
    rgb = cv2.cvtColor(work, cv2.COLOR_BGR2RGB)
    mean_rgb = rgb.reshape(-1, 3).mean(axis=0)
    lab = rgb_to_lab(mean_rgb)
    sample = {"L": float(lab[0]), "a": float(lab[1]), "b": float(lab[2]), "mask": mask}
    metrics = compute_skin_metrics(sample, work)
    season = classify_season(metrics)
    return {**metrics, "season": season["season"], "undertone": season["undertone"], "lab": lab}


def main() -> None:
    print("=== PART 1: Identity Check under PERFECT D65 Daylight ===")
    print(f"{'Profile':<22} | {'Mode':<10} | {'L*':>5} {'a*':>6} {'b*':>6} | {'DE00':>5} | {'ITA':>6} | {'Hemo':>6} | {'Season'}")
    print("-" * 102)
    for name, rgb in SKIN_PROFILES_RGB.items():
        patch = make_skin_patch(rgb)
        gt = measure_patch(patch, apply_wb=False)
        wb = measure_patch(patch, apply_wb=True)
        de00 = float(ciede2000(gt["lab"], wb["lab"][None, :])[0])
        print(
            f"{name:<22} | {'GT (D65)':<10} | {gt['L_star']:5.1f} {gt['a_star']:6.1f} {gt['b_star']:6.1f} | "
            f"{0.0:5.1f} | {gt['ITA_deg']:6.1f} | {gt['Hemoglobin_index']:6.2f} | {gt['season']}"
        )
        print(
            f"{'':<22} | {'Skin-GW WB':<10} | {wb['L_star']:5.1f} {wb['a_star']:6.1f} {wb['b_star']:6.1f} | "
            f"{de00:5.1f} | {wb['ITA_deg']:6.1f} | {wb['Hemoglobin_index']:6.2f} | {wb['season']}"
        )

    print("\n=== PART 2: Illumination Drift on Medium_Warm (III-IV) across 4 Room Lights ===")
    patch = make_skin_patch(SKIN_PROFILES_RGB["Medium_Warm (III-IV)"])
    gt = measure_patch(patch, apply_wb=False)
    print(f"{'Illuminant':<18} | {'Mode':<10} | {'DE00':>5} | {'ITA':>6} | {'Mel':>6} | {'Hemo':>6} | {'Season'}")
    print("-" * 82)
    for ill_name in ILLUMINANT_GAINS_LINEAR:
        lit = relight_bgr_linear(patch, ill_name)
        for label, use_wb in [("No WB", False), ("Skin-GW WB", True)]:
            m = measure_patch(lit, apply_wb=use_wb)
            de00 = float(ciede2000(gt["lab"], m["lab"][None, :])[0])
            print(
                f"{ill_name:<18} | {label:<10} | {de00:5.1f} | {m['ITA_deg']:6.1f} | "
                f"{m['Melanin_index']:6.2f} | {m['Hemoglobin_index']:6.2f} | {m['season']}"
            )


if __name__ == "__main__":
    main()
