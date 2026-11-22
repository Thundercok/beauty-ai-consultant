"""Experiment 04: Planckian-constrained illuminant estimation & downstream lipstick stability.

Evaluates whether projecting non-skin illuminant estimates (Shades-of-Gray and Grey-Edge)
onto the 1D CIE Planckian locus (2500K--9000K) + Bradford CAT improves:
  Part A: Portrait `data/sample_face.jpg` relit across 2700K, 4000K, 6500K, 8000K
          - Illuminant angular error, Skin Delta E00, dITA, a*, b*
          - Downstream Top-3 Lipstick Recommendation Stability (Jaccard overlap vs. D65 GT)
  Part B: Adversarial colored-background stress test (pink wall / green foliage around a
          Medium Warm skin face under 2700K and 6500K)
"""

from __future__ import annotations

import math

import cv2
import numpy as np
import pandas as pd

from beauty_ai.cli import extract_face_mesh
from beauty_ai.color_constancy import (
    angular_error_deg,
    apply_bradford_white_balance,
    estimate_nonskin_illuminant,
    normalize_illuminant_luma,
    planckian_linear_rgb,
    project_to_planckian_locus,
)
from beauty_ai.face_analysis import classify_season, compute_skin_metrics, extract_lip_metrics, resolve_glowup_profile
from beauty_ai.product_matcher import _linear_to_srgb, _srgb_to_linear, ciede2000, match_products, rgb_to_lab
from beauty_ai.skin_roi_v2 import SKIN_LANDMARKS, extract_skin_cielab_v2

ILLUMINANTS_CCT: dict[str, float] = {
    "2700K_warm_lamp": 2700.0,
    "4000K_office": 4000.0,
    "6500K_D65": 6504.0,
    "8000K_cool_shade": 8000.0,
}


def relight_rgb_planckian(img_rgb: np.ndarray, cct_k: float, exposure: float = 0.80) -> np.ndarray:
    """Relight an sRGB image using the exact CIE Planckian illuminant in linear RGB."""
    lin = _srgb_to_linear(img_rgb)
    gains = planckian_linear_rgb(cct_k)
    lit_lin = np.clip(lin * gains[None, None, :] * exposure, 0.0, 1.0)
    return np.round(_linear_to_srgb(lit_lin)).astype(np.uint8)


def measure_skin_and_lipsticks(
    img_rgb: np.ndarray,
    skin_mask: np.ndarray,
    points: np.ndarray,
    db_df: pd.DataFrame,
) -> dict:
    """Measure trimmed-mean D65 Lab, ITA, and top-3 Kubelka-Munk matched lipsticks."""
    pixels = img_rgb[skin_mask > 0]
    lab_pixels = rgb_to_lab(pixels)
    vals = []
    for ch in range(3):
        s = np.sort(lab_pixels[:, ch])
        t = int(len(s) * 0.1)
        vals.append(float(np.mean(s[t:-t])))
    l_star, a_star, b_star = vals
    ita = math.degrees(math.atan((l_star - 50.0) / (b_star + 1e-5)))

    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    sample = {"L": l_star, "a": a_star, "b": b_star, "mask": skin_mask}
    metrics = compute_skin_metrics(sample, img_bgr)
    season = classify_season(metrics)
    advice = resolve_glowup_profile("Oval", season["season"], "office", "combination")
    lip_metrics = extract_lip_metrics(img_bgr, points)
    lipsticks = match_products(
        advice["techniques"]["target_colors"]["lip"],
        db_df,
        product_type="lipstick",
        lip_base_lab=lip_metrics["lip_base_lab"],
        top_k=3,
    )
    top3_shades = {f"{item['brand']}:{item['shade']}" for item in lipsticks}
    return {
        "lab": np.array([l_star, a_star, b_star]),
        "ITA": ita,
        "season": season["season"],
        "top3_shades": top3_shades,
    }


def jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / max(1, len(a | b))


def run_part_a_portrait() -> None:
    img_bgr = cv2.imread("data/sample_face.jpg")
    if img_bgr is None:
        raise FileNotFoundError("Could not read data/sample_face.jpg")
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    db_df = pd.read_csv("data/product_database.csv")

    points = extract_face_mesh(img_rgb)
    skin_mask = extract_skin_cielab_v2(img_bgr, points)["mask"]

    h, w = img_rgb.shape[:2]
    hull_pts = np.round(points[SKIN_LANDMARKS, :2]).astype(np.int32)
    face_hull = np.zeros((h, w), dtype=np.uint8)
    cv2.fillConvexPoly(face_hull, cv2.convexHull(hull_pts), 255)

    # D65 Ground-Truth reference (at same exposure 0.80)
    d65_ref = relight_rgb_planckian(img_rgb, 6504.0)
    gt = measure_skin_and_lipsticks(d65_ref, skin_mask, points, db_df)

    print("=== PART A: Portrait Relighting (data/sample_face.jpg) + Top-3 Lipstick Stability ===")
    print(f"D65 GT Skin: L*={gt['lab'][0]:.1f}, a*={gt['lab'][1]:.1f}, b*={gt['lab'][2]:.1f}, ITA={gt['ITA']:.1f}°, Season={gt['season']}")
    print(f"D65 GT Top-3 Lipsticks: {sorted(gt['top3_shades'])}\n")

    header = (
        f"{'Illuminant':<17} | {'Method':<22} | {'CCT(K)':>6} | {'Off°':>5} | "
        f"{'Ang°':>5} | {'DE00':>5} | {'dITA°':>6} | {'a*':>5} {'b*':>5} | {'LipJacc':>7}"
    )
    print(header)
    print("-" * len(header))

    for ill_name, cct_k in ILLUMINANTS_CCT.items():
        lit = relight_rgb_planckian(img_rgb, cct_k)
        true_ill = planckian_linear_rgb(cct_k)

        raw_sog = estimate_nonskin_illuminant(lit, face_hull, method="sog", p=6.0)
        proj_sog = project_to_planckian_locus(raw_sog)

        raw_ge = estimate_nonskin_illuminant(lit, face_hull, method="grey_edge", p=6.0, sigma=1.0)
        proj_ge = project_to_planckian_locus(raw_ge)

        candidates = [
            ("No WB", None, float("nan"), np.array([1.0, 1.0, 1.0]), lit),
            ("Unconstrained SoG", None, float("nan"), raw_sog, apply_bradford_white_balance(lit, raw_sog)),
            (
                "Planckian SoG",
                proj_sog["cct_kelvin"],
                proj_sog["off_locus_deg"],
                proj_sog["illuminant_linear"],
                apply_bradford_white_balance(lit, proj_sog["illuminant_linear"]),
            ),
            (
                "Planckian Grey-Edge",
                proj_ge["cct_kelvin"],
                proj_ge["off_locus_deg"],
                proj_ge["illuminant_linear"],
                apply_bradford_white_balance(lit, proj_ge["illuminant_linear"]),
            ),
        ]

        for method, est_cct, off_deg, est_ill, out_rgb in candidates:
            m = measure_skin_and_lipsticks(out_rgb, skin_mask, points, db_df)
            de00 = float(ciede2000(gt["lab"], m["lab"][None, :])[0])
            ang = angular_error_deg(est_ill, true_ill)
            d_ita = m["ITA"] - gt["ITA"]
            lip_j = jaccard(gt["top3_shades"], m["top3_shades"])
            cct_str = f"{est_cct:6.0f}" if est_cct is not None else "   n/a"
            off_str = f"{off_deg:5.1f}" if not math.isnan(off_deg) else "  n/a"
            print(
                f"{ill_name:<17} | {method:<22} | {cct_str} | {off_str} | "
                f"{ang:5.2f} | {de00:5.2f} | {d_ita:+6.1f} | "
                f"{m['lab'][1]:5.1f} {m['lab'][2]:5.1f} | {lip_j:7.2f}"
            )
        print("-" * len(header))


def run_part_b_adversarial_backgrounds() -> None:
    """Test pink/magenta bedroom wall & green foliage background bias rejection."""
    print("\n=== PART B: Adversarial Colored-Background Stress Test (Medium Warm Skin) ===")
    rng = np.random.default_rng(7)
    h, w = 160, 160
    skin_rgb = np.array([194, 148, 114], dtype=float)
    face_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(face_mask, (80, 80), 40, 255, -1)

    scenarios = {
        "Pink_Bedroom_Wall": np.array([220, 130, 175], dtype=float),
        "Green_Foliage_BG": np.array([90, 175, 95], dtype=float),
    }

    header = f"{'Background':<18} | {'Light':<7} | {'Method':<20} | {'AngErr°':>7} | {'Skin DE00':>9} | {'a*':>5} {'b*':>5}"
    print(header)
    print("-" * len(header))

    for bg_name, bg_color in scenarios.items():
        # Build base D65 scene: colored wall + textured neutral shirt strip + skin circle
        scene = np.full((h, w, 3), bg_color, dtype=float)
        scene += rng.normal(0.0, 4.0, size=(h, w, 3))
        scene[face_mask > 0] = skin_rgb + rng.normal(0.0, 2.0, size=(np.count_nonzero(face_mask), 3))
        scene_u8 = np.clip(scene, 0, 255).astype(np.uint8)

        d65_scene = relight_rgb_planckian(scene_u8, 6504.0)
        gt_lab = rgb_to_lab(d65_scene[face_mask > 0]).mean(axis=0)

        for light_label, cct_k in [("2700K", 2700.0), ("6500K", 6504.0)]:
            lit = relight_rgb_planckian(scene_u8, cct_k)
            true_ill = planckian_linear_rgb(cct_k)

            raw_sog = estimate_nonskin_illuminant(lit, face_mask, method="sog", p=6.0)
            proj_sog = project_to_planckian_locus(raw_sog)

            for method, est_ill, out_rgb in [
                ("No WB", normalize_illuminant_luma(np.ones(3)), lit),
                ("Unconstrained SoG", raw_sog, apply_bradford_white_balance(lit, raw_sog)),
                (
                    "Planckian SoG",
                    proj_sog["illuminant_linear"],
                    apply_bradford_white_balance(lit, proj_sog["illuminant_linear"]),
                ),
            ]:
                lab = rgb_to_lab(out_rgb[face_mask > 0]).mean(axis=0)
                de00 = float(ciede2000(gt_lab, lab[None, :])[0])
                ang = angular_error_deg(est_ill, true_ill)
                print(
                    f"{bg_name:<18} | {light_label:<7} | {method:<20} | {ang:7.2f} | {de00:9.2f} | "
                    f"{lab[1]:5.1f} {lab[2]:5.1f}"
                )
        print("-" * len(header))


def main() -> None:
    run_part_a_portrait()
    run_part_b_adversarial_backgrounds()


if __name__ == "__main__":
    main()
