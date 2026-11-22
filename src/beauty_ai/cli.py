#!/usr/bin/env python3
"""GlowUpAdvisor optical consultation CLI."""

from __future__ import annotations

import argparse
import json
import os

import cv2
import numpy as np
import pandas as pd

from beauty_ai.chromophores import extract_relative_chromophores_srgb
from beauty_ai.color_constancy import (
    apply_bradford_white_balance,
    estimate_nonskin_illuminant,
    project_to_planckian_locus,
)
from beauty_ai.face_analysis import (
    classify_face_shape,
    classify_season,
    compute_skin_metrics,
    extract_lip_metrics,
    resolve_glowup_profile,
)
from beauty_ai.product_matcher import blend_target_colors_lab, match_products
from beauty_ai.skin_roi_v2 import SKIN_LANDMARKS, extract_skin_cielab_v2


def extract_face_mesh(img_rgb: np.ndarray) -> np.ndarray:
    try:
        import mediapipe as mp
    except ImportError as exc:
        raise RuntimeError(
            "mediapipe is required for face landmark extraction. Install with `uv sync --extra vision`."
        ) from exc
    face_mesh = mp.solutions.face_mesh
    with face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
    ) as detector:
        result = detector.process(img_rgb)
    if not result.multi_face_landmarks:
        raise ValueError("No face detected in image.")
    h, w = img_rgb.shape[:2]
    return np.array(
        [(landmark.x * w, landmark.y * h, landmark.z * w) for landmark in result.multi_face_landmarks[0].landmark]
    )


def build_face_hull_mask(img_shape: tuple[int, int], points: np.ndarray) -> np.ndarray:
    """Convex hull covering the face region (used to exclude skin from illuminant estimation)."""
    h, w = img_shape
    hull_pts = np.round(points[SKIN_LANDMARKS, :2]).astype(np.int32)
    hull_pts[:, 0] = np.clip(hull_pts[:, 0], 0, w - 1)
    hull_pts[:, 1] = np.clip(hull_pts[:, 1], 0, h - 1)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillConvexPoly(mask, cv2.convexHull(hull_pts), 255)
    return mask


def white_balance_portrait(
    img_bgr: np.ndarray,
    points: np.ndarray,
    *,
    method: str = "planckian_grey_edge",
) -> tuple[np.ndarray, dict]:
    """Apply Planckian-constrained non-skin white balance + Bradford CAT (or bypass if 'none')."""
    if method == "none":
        return img_bgr, {"method": "none", "estimated_cct_k": None, "off_locus_deg": None}

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    face_hull = build_face_hull_mask(img_bgr.shape[:2], points)
    raw_method = "grey_edge" if method == "planckian_grey_edge" else "sog"
    raw_ill = estimate_nonskin_illuminant(img_rgb, face_hull, method=raw_method, p=6.0)
    proj = project_to_planckian_locus(raw_ill)
    adapted_rgb = apply_bradford_white_balance(img_rgb, proj["illuminant_linear"])
    diagnostics = {
        "method": method,
        "estimated_cct_k": round(float(proj["cct_kelvin"]), 1),
        "off_locus_deg": round(float(proj["off_locus_deg"]), 2),
    }
    return cv2.cvtColor(adapted_rgb, cv2.COLOR_RGB2BGR), diagnostics


def _print_matches(label: str, matches: list[dict]) -> None:
    print(f"  {label}:")
    for product in matches:
        print(
            f"     [{product['match_tier']}] {product['brand']} {product['name']} "
            f"({product['shade']}) — ΔE00 = {product['delta_e']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="GlowUpAdvisor Optical Consultation CLI")
    parser.add_argument("--image", "-i", required=True, help="Path to a portrait image")
    parser.add_argument("--occasion", "-o", choices=["daily", "office", "glam"], default="office")
    parser.add_argument("--texture", "-t", choices=["oily", "dry", "combination"], default="combination")
    parser.add_argument("--db", default="data/product_database.csv")
    parser.add_argument(
        "--wb-method",
        choices=["planckian_grey_edge", "planckian_sog", "none"],
        default="planckian_grey_edge",
        help="Illuminant correction method (default: planckian_grey_edge).",
    )
    parser.add_argument(
        "--catalog-illuminant",
        choices=["D50", "D65"],
        default="D65",
        help="Source illuminant for catalogue Lab data; standard sRGB hex is D65.",
    )
    parser.add_argument("--output-json", default=None)
    args = parser.parse_args()

    if not os.path.exists(args.image) or not os.path.exists(args.db):
        parser.error("--image and --db must refer to existing files.")
    image = cv2.imread(args.image)
    if image is None:
        parser.error(f"Could not read image: {args.image}")

    try:
        img_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        points = extract_face_mesh(img_rgb)
        corrected, wb_info = white_balance_portrait(image, points, method=args.wb_method)
        skin_roi = extract_skin_cielab_v2(corrected, points)
        lip_metrics = extract_lip_metrics(corrected, points)
        chromo = extract_relative_chromophores_srgb(img_rgb, skin_roi["mask"])
    except (ValueError, RuntimeError) as exc:
        parser.error(str(exc))

    shape = classify_face_shape(points)
    skin_metrics = compute_skin_metrics(skin_roi, corrected)
    season = classify_season(skin_metrics)
    advice = resolve_glowup_profile(shape["primary"], season["season"], args.occasion, args.texture)
    blended_targets = blend_target_colors_lab(season["probabilities"])

    valid_chromo = chromo["valid_mask"]
    chromophore_summary = {
        "valid_pixels": int(chromo["pixel_count"]),
        "melanin_spatial_std": round(float(np.std(chromo["melanin_delta"][valid_chromo])), 4)
        if chromo["pixel_count"] >= 10
        else 0.0,
        "hemoglobin_spatial_std": round(float(np.std(chromo["hemoglobin_delta"][valid_chromo])), 4)
        if chromo["pixel_count"] >= 10
        else 0.0,
        "method": "linear_rgb_beer_lambert_fixed_basis",
    }

    database = pd.read_csv(args.db)
    matches = {
        "lipsticks": match_products(
            blended_targets["lip"],
            database,
            product_type="lipstick",
            lip_base_lab=lip_metrics["lip_base_lab"],
            catalog_illuminant=args.catalog_illuminant,
        ),
        "blushes": match_products(
            blended_targets["blush"],
            database,
            product_type="blush",
            catalog_illuminant=args.catalog_illuminant,
            top_k=2,
        ),
        "eyeshadows": match_products(
            blended_targets["eyeshadow"],
            database,
            product_type="eyeshadow",
            catalog_illuminant=args.catalog_illuminant,
            top_k=2,
        ),
    }

    print(f"White balance: {wb_info['method']} (CCT={wb_info['estimated_cct_k']}K, off-locus={wb_info['off_locus_deg']}°)")
    print(f"Face shape: {shape['primary']} ({shape['probabilities'][shape['primary']]:.1%})")
    border_note = f" [borderline with {season['secondary_season']}]" if season["is_borderline"] else ""
    print(
        f"Personal-color season: {season['season']} ({season['confidence']:.1%}, {season['undertone']}){border_note}"
    )
    print(
        f"Skin Lab (D65): L*={skin_metrics['L_star']:.1f}, a*={skin_metrics['a_star']:.1f}, "
        f"b*={skin_metrics['b_star']:.1f} (ITA={skin_metrics['ITA_deg']:.1f}°)"
    )
    print(f"Soft blended targets: lip={blended_targets['lip']}, blush={blended_targets['blush']}, eye={blended_targets['eyeshadow']}")
    print(f"Skin ROI: {skin_roi['method']} ({skin_roi['sample_count']} pixels)")
    for key in ("contour", "blush", "eyes", "lip"):
        print(f"{key.title()}: {advice['techniques'][key]}")
    _print_matches("Lipsticks", matches["lipsticks"])
    _print_matches("Blushes", matches["blushes"])
    _print_matches("Eyeshadows", matches["eyeshadows"])

    if args.output_json:
        report = {
            "white_balance": wb_info,
            "face_shape": shape,
            "skin_metrics": skin_metrics,
            "chromophores": chromophore_summary,
            "skin_sampling": {key: skin_roi[key] for key in ("method", "sample_count")},
            "season": season,
            "blended_target_colors": blended_targets,
            "lip_metrics": {key: value for key, value in lip_metrics.items() if key != "lip_base_lab"},
            "advice": advice,
            "matched_products": matches,
            "catalog_illuminant": args.catalog_illuminant,
        }
        with open(args.output_json, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
        print(f"JSON report: {args.output_json}")


if __name__ == "__main__":
    main()
