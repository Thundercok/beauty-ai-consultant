"""Experiment 02: Compare non-skin illuminant estimators on a real portrait under simulated lights.

Compares 5 white-balance strategies on `data/sample_face.jpg` relit in linear RGB
under 2700K, 4000K, 6500K (D65), and 8000K:
  1. No WB (raw relit image)
  2. Old Skin-GW WB (current Tier-A baseline in face_analysis.py)
  3. Non-Skin Shades-of-Gray (p=6 on pixels outside the face hull, unclipped)
  4. Unclipped Specular Skin (brightest low-saturation unclipped skin pixels)
  5. Sclera WB (eye contour minus iris, unclipped bright half)

Metrics:
  - Illuminant angular error (degrees) vs. known linear-RGB ground-truth illuminant
  - Skin CIELAB recovery error (Delta E00) vs. D65 ground-truth skin ROI
  - ITA drift (degrees) vs. D65 ground-truth skin ROI
"""

from __future__ import annotations

import math

import cv2
import numpy as np

from beauty_ai.cli import extract_face_mesh
from beauty_ai.face_analysis import skin_roi_gray_world_wb
from beauty_ai.product_matcher import _linear_to_srgb, _srgb_to_linear, ciede2000, rgb_to_lab
from beauty_ai.skin_roi_v2 import SKIN_LANDMARKS, extract_skin_cielab_v2

ILLUMINANT_GAINS_LINEAR: dict[str, np.ndarray] = {
    "2700K_warm_lamp": np.array([1.38, 0.94, 0.44]),
    "4000K_office": np.array([1.14, 0.99, 0.72]),
    "6500K_D65": np.array([1.00, 1.00, 1.00]),
    "8000K_cool_shade": np.array([0.92, 1.00, 1.15]),
}

LEFT_EYE_CONTOUR = np.array([33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246])
RIGHT_EYE_CONTOUR = np.array([362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398])
LEFT_IRIS = np.array([468, 469, 470, 471, 472])
RIGHT_IRIS = np.array([473, 474, 475, 476, 477])


def angular_error_deg(est: np.ndarray, true: np.ndarray) -> float:
    """Standard color-constancy recovery angular error in degrees."""
    e1 = np.asarray(est, dtype=float)
    e2 = np.asarray(true, dtype=float)
    cos_sim = float(np.dot(e1, e2) / (np.linalg.norm(e1) * np.linalg.norm(e2) + 1e-12))
    return math.degrees(math.acos(np.clip(cos_sim, -1.0, 1.0)))


def normalize_illuminant_luma(rgb_lin: np.ndarray) -> np.ndarray:
    """Normalize a linear-RGB illuminant vector so CIE luminance Y = 1."""
    vec = np.maximum(np.asarray(rgb_lin, dtype=float), 1e-6)
    y = 0.2126 * vec[0] + 0.7152 * vec[1] + 0.0722 * vec[2]
    return vec / (y + 1e-12)


def relight_bgr_linear(img_bgr: np.ndarray, gains_linear: np.ndarray) -> np.ndarray:
    """Simulate linear-RGB illuminant change with realistic 8-bit sensor clipping."""
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    lin = _srgb_to_linear(rgb)
    # Apply slight exposure scaling (0.85) so D65 highlights don't immediately clip under warm gain.
    lit_lin = np.clip(lin * gains_linear[None, None, :] * 0.85, 0.0, 1.0)
    lit_rgb = np.round(_linear_to_srgb(lit_lin)).astype(np.uint8)
    return cv2.cvtColor(lit_rgb, cv2.COLOR_RGB2BGR)


def apply_linear_wb(img_bgr: np.ndarray, est_illuminant: np.ndarray) -> np.ndarray:
    """Divide linear RGB by estimated Y-normalized illuminant, then re-compand to sRGB."""
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    lin = _srgb_to_linear(rgb)
    ill = normalize_illuminant_luma(est_illuminant)
    corrected = np.clip(lin / ill[None, None, :], 0.0, 1.0)
    out_rgb = np.round(_linear_to_srgb(corrected)).astype(np.uint8)
    return cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)


def build_sclera_mask(img_shape: tuple[int, int], points: np.ndarray) -> np.ndarray:
    """Mask eye interiors excluding the iris (dilated 1.2x to avoid limbal ring bleed)."""
    h, w = img_shape
    mask = np.zeros((h, w), dtype=np.uint8)
    for contour_idx, iris_idx in [(LEFT_EYE_CONTOUR, LEFT_IRIS), (RIGHT_EYE_CONTOUR, RIGHT_IRIS)]:
        poly = np.round(points[contour_idx, :2]).astype(np.int32)
        cv2.fillPoly(mask, [poly], 255)
        center = points[iris_idx[0], :2]
        radius = float(np.mean(np.linalg.norm(points[iris_idx[1:], :2] - center, axis=1))) * 1.25
        cv2.circle(mask, tuple(np.round(center).astype(int)), max(2, int(round(radius))), 0, -1)
    return mask


def estimate_sclera_illuminant(img_bgr: np.ndarray, points: np.ndarray) -> tuple[np.ndarray, int]:
    """Estimate linear-RGB illuminant from bright, unclipped sclera pixels."""
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    sclera = build_sclera_mask(img_bgr.shape[:2], points) > 0
    unclipped = np.max(rgb, axis=-1) < 245
    valid = sclera & unclipped
    if np.count_nonzero(valid) < 10:
        return np.array([1.0, 1.0, 1.0]), int(np.count_nonzero(valid))
    lin = _srgb_to_linear(rgb[valid])
    luma = 0.2126 * lin[:, 0] + 0.7152 * lin[:, 1] + 0.0722 * lin[:, 2]
    # Keep brighter half of sclera to reject upper-eyelid shadow.
    bright = lin[luma >= np.percentile(luma, 50)]
    est = np.median(bright, axis=0)
    return normalize_illuminant_luma(est), int(len(bright))


def estimate_specular_illuminant(img_bgr: np.ndarray, skin_mask: np.ndarray) -> tuple[np.ndarray, int]:
    """Estimate linear-RGB illuminant from brightest, lowest-saturation unclipped skin pixels."""
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    unclipped = np.max(rgb, axis=-1) < 245
    valid = (skin_mask > 0) & unclipped
    if np.count_nonzero(valid) < 50:
        return np.array([1.0, 1.0, 1.0]), int(np.count_nonzero(valid))
    lin = _srgb_to_linear(rgb[valid])
    luma = 0.2126 * lin[:, 0] + 0.7152 * lin[:, 1] + 0.0722 * lin[:, 2]
    # Top 5% brightest unclipped skin pixels.
    top_bright = lin[luma >= np.percentile(luma, 95)]
    # Among those, take lowest chroma/saturation (closest to specular highlight).
    mean_ch = np.mean(top_bright, axis=1, keepdims=True) + 1e-8
    chroma = np.linalg.norm(top_bright / mean_ch - 1.0, axis=1)
    spec = top_bright[chroma <= np.percentile(chroma, 25)]
    est = np.median(spec, axis=0)
    return normalize_illuminant_luma(est), int(len(spec))


def estimate_nonskin_sog(img_bgr: np.ndarray, points: np.ndarray, p: float = 6.0) -> np.ndarray:
    """Shades-of-Gray (p=6) in linear RGB strictly OUTSIDE the face convex hull."""
    h, w = img_bgr.shape[:2]
    hull_pts = np.round(points[SKIN_LANDMARKS, :2]).astype(np.int32)
    face_hull = np.zeros((h, w), dtype=np.uint8)
    cv2.fillConvexPoly(face_hull, cv2.convexHull(hull_pts), 255)
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    valid = (face_hull == 0) & (np.max(rgb, axis=-1) < 245) & (np.min(rgb, axis=-1) > 10)
    lin = _srgb_to_linear(rgb[valid])
    est = np.mean(lin**p, axis=0) ** (1.0 / p)
    return normalize_illuminant_luma(est)


def measure_skin(img_bgr: np.ndarray, skin_mask: np.ndarray) -> dict:
    """Measure trimmed-mean D65 Lab and ITA on a fixed skin mask for apples-to-apples comparison."""
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pixels = rgb[skin_mask > 0]
    lab_pixels = rgb_to_lab(pixels)
    # 10% trimmed mean per channel
    vals = []
    for ch in range(3):
        s = np.sort(lab_pixels[:, ch])
        t = int(len(s) * 0.1)
        vals.append(float(np.mean(s[t:-t])))
    l_star, a_star, b_star = vals
    ita = math.degrees(math.atan((l_star - 50.0) / (b_star + 1e-5)))
    return {"lab": np.array([l_star, a_star, b_star]), "ITA": ita}


def main() -> None:
    img_bgr = cv2.imread("data/sample_face.jpg")
    if img_bgr is None:
        raise FileNotFoundError("Could not read data/sample_face.jpg")

    points = extract_face_mesh(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
    gt_roi = extract_skin_cielab_v2(img_bgr, points)
    fixed_skin_mask = gt_roi["mask"]

    # Ground truth measured on D65 relit (includes the same 0.85 exposure scaling for fair L* comparison)
    d65_ref_bgr = relight_bgr_linear(img_bgr, ILLUMINANT_GAINS_LINEAR["6500K_D65"])
    gt = measure_skin(d65_ref_bgr, fixed_skin_mask)

    sclera_mask = build_sclera_mask(img_bgr.shape[:2], points)
    print(f"Portrait: data/sample_face.jpg ({img_bgr.shape[1]}x{img_bgr.shape[0]})")
    print(f"Skin mask pixels: {np.count_nonzero(fixed_skin_mask):,} | Sclera mask pixels: {np.count_nonzero(sclera_mask):,}")
    print(f"D65 Reference Skin Lab: L*={gt['lab'][0]:.1f}, a*={gt['lab'][1]:.1f}, b*={gt['lab'][2]:.1f}, ITA={gt['ITA']:.1f} deg\n")

    header = f"{'Illuminant':<17} | {'Method':<18} | {'AngErr°':>7} | {'DE00':>5} | {'dITA°':>6} | {'a*':>5} {'b*':>5}"
    print(header)
    print("-" * len(header))

    for ill_name, gains in ILLUMINANT_GAINS_LINEAR.items():
        lit_bgr = relight_bgr_linear(img_bgr, gains)
        true_ill = normalize_illuminant_luma(gains)

        # 1. No WB
        m_raw = measure_skin(lit_bgr, fixed_skin_mask)
        rows = [("No WB", angular_error_deg(np.ones(3), true_ill), m_raw)]

        # 2. Old Skin-GW WB
        old_wb = skin_roi_gray_world_wb(lit_bgr, fixed_skin_mask)
        m_old = measure_skin(old_wb, fixed_skin_mask)
        rows.append(("Old Skin-GW WB", float("nan"), m_old))

        # 3. Non-Skin Shades-of-Gray
        est_bg = estimate_nonskin_sog(lit_bgr, points)
        m_bg = measure_skin(apply_linear_wb(lit_bgr, est_bg), fixed_skin_mask)
        rows.append(("Non-Skin SoG(p=6)", angular_error_deg(est_bg, true_ill), m_bg))

        # 4. Unclipped Specular Skin
        est_spec, _ = estimate_specular_illuminant(lit_bgr, fixed_skin_mask)
        m_spec = measure_skin(apply_linear_wb(lit_bgr, est_spec), fixed_skin_mask)
        rows.append(("Unclipped Specular", angular_error_deg(est_spec, true_ill), m_spec))

        # 5. Sclera WB
        est_sclera, _ = estimate_sclera_illuminant(lit_bgr, points)
        m_sclera = measure_skin(apply_linear_wb(lit_bgr, est_sclera), fixed_skin_mask)
        rows.append(("Sclera WB", angular_error_deg(est_sclera, true_ill), m_sclera))

        for method, ang, m in rows:
            de00 = float(ciede2000(gt["lab"], m["lab"][None, :])[0])
            d_ita = m["ITA"] - gt["ITA"]
            ang_str = f"{ang:7.2f}" if not math.isnan(ang) else "    n/a"
            print(
                f"{ill_name:<17} | {method:<18} | {ang_str} | {de00:5.2f} | {d_ita:+6.1f} | "
                f"{m['lab'][1]:5.1f} {m['lab'][2]:5.1f}"
            )
        print("-" * len(header))


if __name__ == "__main__":
    main()
