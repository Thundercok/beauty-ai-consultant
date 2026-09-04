#!/usr/bin/env python3
"""GlowUpAdvisor Tier-A command line pipeline."""

import argparse
import json
import os
import sys

import cv2
import mediapipe as mp
import numpy as np
import pandas as pd

from makeup_app.src.face_analysis import (
    classify_face_shape, classify_season, compute_skin_metrics, extract_lip_metrics,
    resolve_glowup_profile, skin_roi_gray_world_wb,
)
from makeup_app.src.product_matcher import match_products
from makeup_app.src.skin_roi_v2 import extract_skin_cielab_v2


def extract_face_mesh(img_rgb: np.ndarray) -> np.ndarray:
    face_mesh = mp.solutions.face_mesh
    with face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.5) as detector:
        result = detector.process(img_rgb)
    if not result.multi_face_landmarks:
        raise ValueError("No face detected in image.")
    h, w = img_rgb.shape[:2]
    return np.array([(landmark.x * w, landmark.y * h, landmark.z * w) for landmark in result.multi_face_landmarks[0].landmark])


def _print_matches(label: str, matches: list[dict]) -> None:
    print(f"  {label}:")
    for product in matches:
        print(f"     [{product['match_tier']}] {product['brand']} {product['name']} ({product['shade']}) — ΔE00 = {product['delta_e']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="GlowUpAdvisor Tier-A CLI")
    parser.add_argument("--image", "-i", required=True, help="Path to a selfie")
    parser.add_argument("--occasion", "-o", choices=["daily", "office", "glam"], default="office")
    parser.add_argument("--texture", "-t", choices=["oily", "dry", "combination"], default="combination")
    parser.add_argument("--db", default="makeup_app/data/product_database.csv")
    parser.add_argument("--catalog-illuminant", choices=["D50", "D65"], default="D65", help="Source illuminant for catalogue Lab data; normal sRGB hex is D65.")
    parser.add_argument("--output-json", default=None)
    args = parser.parse_args()
    if not os.path.exists(args.image) or not os.path.exists(args.db):
        parser.error("--image and --db must refer to existing files.")
    image = cv2.imread(args.image)
    if image is None:
        parser.error(f"Could not read image: {args.image}")
    try:
        points = extract_face_mesh(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        # Derive the white-balance mask from the uncorrected image, then measure
        # colour metrics on the corrected image using a fresh v2 skin ROI.
        initial_roi = extract_skin_cielab_v2(image, points)
        corrected = skin_roi_gray_world_wb(image, initial_roi["mask"])
        skin_roi = extract_skin_cielab_v2(corrected, points)
        lip_metrics = extract_lip_metrics(corrected, points)
    except (ValueError, RuntimeError) as exc:
        parser.error(str(exc))
    shape = classify_face_shape(points)
    skin_metrics = compute_skin_metrics(skin_roi, corrected)
    season = classify_season(skin_metrics)
    advice = resolve_glowup_profile(shape["primary"], season["season"], args.occasion, args.texture)
    targets = advice["techniques"]["target_colors"]
    database = pd.read_csv(args.db)
    matches = {
        "lipsticks": match_products(targets["lip"], database, product_type="lipstick", lip_base_lab=lip_metrics["lip_base_lab"], catalog_illuminant=args.catalog_illuminant),
        "blushes": match_products(targets["blush"], database, product_type="blush", catalog_illuminant=args.catalog_illuminant, top_k=2),
        "eyeshadows": match_products(targets["eyeshadow"], database, product_type="eyeshadow", catalog_illuminant=args.catalog_illuminant, top_k=2),
    }
    print(f"Face shape: {shape['primary']} ({shape['probabilities'][shape['primary']]:.1%})")
    print(f"Personal-color season: {season['season']} ({season['undertone']}; heuristic baseline)")
    print(f"Skin Lab (D65): L*={skin_metrics['L_star']:.1f}, a*={skin_metrics['a_star']:.1f}, b*={skin_metrics['b_star']:.1f}")
    print(f"Skin ROI: {skin_roi['method']} ({skin_roi['sample_count']} pixels)")
    for key in ("contour", "blush", "eyes", "lip"):
        print(f"{key.title()}: {advice['techniques'][key]}")
    _print_matches("Lipsticks", matches["lipsticks"])
    _print_matches("Blushes", matches["blushes"])
    _print_matches("Eyeshadows", matches["eyeshadows"])
    if args.output_json:
        report = {"face_shape": shape, "skin_metrics": skin_metrics, "skin_sampling": {key: skin_roi[key] for key in ("method", "sample_count")}, "season": season, "lip_metrics": {key: value for key, value in lip_metrics.items() if key != "lip_base_lab"}, "advice": advice, "matched_products": matches, "catalog_illuminant": args.catalog_illuminant}
        with open(args.output_json, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
        print(f"JSON report: {args.output_json}")


if __name__ == "__main__":
    main()
