"""Experiment 05: End-to-end cosmetic shade recommendation stability across room lights.

Compares three full pipelines on `data/sample_face.jpg` relit under 2700K, 4000K, 6500K, 8000K:
  1. Legacy Tier-A (Skin-GW WB + Hard Season Cliff)
  2. Planckian Grey-Edge + Hard Season Cliff (argmax season target hex)
  3. Planckian Grey-Edge + Soft CIELAB Target Blending (new default pipeline)

Measures:
  - Target lip colour drift (Delta E00 vs. D65 GT target lip)
  - Top-3 Lipstick Recommendation Jaccard overlap vs. D65 GT
  - Top-2 Blush Recommendation Jaccard overlap vs. D65 GT
"""

from __future__ import annotations

import cv2
import numpy as np
import pandas as pd

from beauty_ai.cli import extract_face_mesh, white_balance_portrait
from beauty_ai.color_constancy import illuminant_locus_linear_rgb
from beauty_ai.face_analysis import (
    classify_season,
    compute_skin_metrics,
    extract_lip_metrics,
    resolve_glowup_profile,
    skin_roi_gray_world_wb,
)
from beauty_ai.product_matcher import (
    _linear_to_srgb,
    _srgb_to_linear,
    blend_target_colors_lab,
    ciede2000,
    hex_to_lab,
    match_products,
)
from beauty_ai.skin_roi_v2 import extract_skin_cielab_v2

ILLUMINANTS_CCT: dict[str, float] = {
    "2700K_warm_lamp": 2700.0,
    "4000K_office": 4000.0,
    "6500K_D65": 6504.0,
    "8000K_cool_shade": 8000.0,
}


def relight_bgr_planckian(img_bgr: np.ndarray, cct_k: float, exposure: float = 0.80) -> np.ndarray:
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    lin = _srgb_to_linear(rgb)
    gains = illuminant_locus_linear_rgb(cct_k)
    lit_lin = np.clip(lin * gains[None, None, :] * exposure, 0.0, 1.0)
    lit_rgb = np.round(_linear_to_srgb(lit_lin)).astype(np.uint8)
    return cv2.cvtColor(lit_rgb, cv2.COLOR_RGB2BGR)


def legacy_hard_season(metrics: dict) -> str:
    """Original discontinuous if/else classifier from Tier A for direct ablation."""
    l_star, a_star, b_star, ita = metrics["L_star"], metrics["a_star"], metrics["b_star"], metrics["ITA_deg"]
    warm = b_star > 14.0 or b_star / (a_star + 1e-5) > 1.1
    cool = b_star < 11.0 or b_star / (a_star + 1e-5) < 0.95
    light, deep = l_star > 62.0 or ita > 40.0, l_star < 50.0 or ita < 20.0
    if warm:
        return "Light Spring" if light else ("Deep Autumn" if deep else ("Warm Spring" if a_star > 14.0 else "Warm Autumn"))
    if cool:
        return "Light Summer" if light else ("Deep Winter" if deep else ("Cool Winter" if a_star > 14.0 else "Cool Summer"))
    return "Bright Spring" if light else ("Soft Autumn" if b_star >= a_star else "Soft Summer")


def evaluate_pipeline(
    lit_bgr: np.ndarray,
    points: np.ndarray,
    fixed_skin_mask: np.ndarray,
    db_df: pd.DataFrame,
    *,
    wb_mode: str,
    use_soft_blend: bool,
) -> dict:
    if wb_mode == "skin_gw":
        corrected = skin_roi_gray_world_wb(lit_bgr, fixed_skin_mask)
    elif wb_mode == "planckian_grey_edge":
        corrected, _ = white_balance_portrait(lit_bgr, points, method="planckian_grey_edge")
    else:
        corrected = lit_bgr

    skin_roi = extract_skin_cielab_v2(corrected, points)
    metrics = compute_skin_metrics(skin_roi, corrected)
    lip_metrics = extract_lip_metrics(corrected, points)

    if use_soft_blend:
        season = classify_season(metrics)
        targets = blend_target_colors_lab(season["probabilities"])
        season_label = season["season"]
    else:
        season_label = legacy_hard_season(metrics)
        advice = resolve_glowup_profile("Oval", season_label, "office", "combination")
        targets = advice["techniques"]["target_colors"]

    lipsticks = match_products(
        targets["lip"], db_df, product_type="lipstick", lip_base_lab=lip_metrics["lip_base_lab"], top_k=3
    )
    blushes = match_products(targets["blush"], db_df, product_type="blush", top_k=2)

    return {
        "season": season_label,
        "target_lip_hex": targets["lip"],
        "lip_set": {f"{x['brand']}:{x['shade']}" for x in lipsticks},
        "blush_set": {f"{x['brand']}:{x['shade']}" for x in blushes},
    }


def jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / max(1, len(a | b))


def main() -> None:
    img_bgr = cv2.imread("data/sample_face.jpg")
    if img_bgr is None:
        raise FileNotFoundError("Could not read data/sample_face.jpg")
    db_df = pd.read_csv("data/product_database.csv")
    points = extract_face_mesh(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
    fixed_skin_mask = extract_skin_cielab_v2(img_bgr, points)["mask"]

    d65_bgr = relight_bgr_planckian(img_bgr, 6504.0)

    pipelines = [
        ("Legacy Skin-GW + Hard", "skin_gw", False),
        ("Planckian GE + Hard", "planckian_grey_edge", False),
        ("Planckian GE + Soft", "planckian_grey_edge", True),
    ]

    # Ground-truth D65 recommendation for each mode (measured on true D65 image without WB distortion)
    gt_hard = evaluate_pipeline(d65_bgr, points, fixed_skin_mask, db_df, wb_mode="none", use_soft_blend=False)
    gt_soft = evaluate_pipeline(d65_bgr, points, fixed_skin_mask, db_df, wb_mode="none", use_soft_blend=True)

    print("=== Experiment 05: End-to-End Cosmetic Shade Stability across 2700K--8000K ===")
    print(f"D65 GT (Soft): {gt_soft['season']} | Lip target={gt_soft['target_lip_hex']} | Top-3={sorted(gt_soft['lip_set'])}\n")

    header = f"{'Illuminant':<17} | {'Pipeline':<22} | {'Season':<13} | {'TargetDE00':>10} | {'LipJacc':>7} | {'BlushJacc':>9}"
    print(header)
    print("-" * len(header))

    for ill_name, cct_k in ILLUMINANTS_CCT.items():
        lit_bgr = relight_bgr_planckian(img_bgr, cct_k)
        for label, wb_mode, use_soft in pipelines:
            res = evaluate_pipeline(
                lit_bgr, points, fixed_skin_mask, db_df, wb_mode=wb_mode, use_soft_blend=use_soft
            )
            gt = gt_soft if use_soft else gt_hard
            target_de00 = float(ciede2000(hex_to_lab(gt["target_lip_hex"]), hex_to_lab(res["target_lip_hex"])[None, :])[0])
            lip_j = jaccard(gt["lip_set"], res["lip_set"])
            blush_j = jaccard(gt["blush_set"], res["blush_set"])
            print(
                f"{ill_name:<17} | {label:<22} | {res['season']:<13} | {target_de00:10.2f} | "
                f"{lip_j:7.2f} | {blush_j:9.2f}"
            )
        print("-" * len(header))


if __name__ == "__main__":
    main()
