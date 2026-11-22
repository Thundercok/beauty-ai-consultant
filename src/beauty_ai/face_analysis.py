"""Non-ML facial geometry, lip sampling, and season baseline used in Tier A."""

from __future__ import annotations

import math

import cv2
import numpy as np

from .advice_engine import get_asian_advice


def skin_roi_gray_world_wb(img_bgr: np.ndarray, skin_mask: np.ndarray | None = None) -> np.ndarray:
    """Legacy gray-world WB estimated from skin ROI (deprecated: erases true skin undertone; see exp01)."""
    image = img_bgr.astype(np.float32)
    blue, green, red = cv2.split(image)
    if skin_mask is not None and np.count_nonzero(skin_mask) > 100:
        include = skin_mask > 0
        blue_mean, green_mean, red_mean = np.mean(blue[include]), np.mean(green[include]), np.mean(red[include])
    else:
        blue_mean, green_mean, red_mean = np.mean(blue), np.mean(green), np.mean(red)
    corrected_red = np.clip(red * green_mean / (red_mean + 1e-6), 0, 255)
    corrected_blue = np.clip(blue * green_mean / (blue_mean + 1e-6), 0, 255)
    return cv2.merge((corrected_blue, green, corrected_red)).astype(np.uint8)


def classify_face_shape(points: np.ndarray) -> dict:
    """Tier-A baseline classifier.  Its hand-tuned parameters remain unvalidated."""
    def distance(first: int, second: int) -> float:
        return float(np.linalg.norm(points[first, :2] - points[second, :2]))
    ratios = np.array([
        distance(10, 152) / (distance(234, 454) + 1e-6),
        distance(172, 397) / (distance(234, 454) + 1e-6),
        distance(338, 297) / (distance(172, 397) + 1e-6),
    ])
    shape_parameters = {
        "Oval": ([1.20, 0.80, 1.00], [0.08, 0.05, 0.08]),
        "Round": ([1.02, 0.90, 1.00], [0.06, 0.05, 0.08]),
        "Square": ([1.08, 0.94, 1.00], [0.06, 0.04, 0.08]),
        "Heart": ([1.18, 0.70, 1.25], [0.08, 0.06, 0.10]),
        "Oblong": ([1.40, 0.85, 1.00], [0.10, 0.06, 0.08]),
        "Diamond": ([1.18, 0.72, 0.92], [0.08, 0.06, 0.08]),
    }
    scores = {
        shape: float(np.exp(-0.5 * np.sum(((ratios - np.asarray(mean)) / np.asarray(std)) ** 2)))
        for shape, (mean, std) in shape_parameters.items()
    }
    total = sum(scores.values()) + 1e-12
    probabilities = {shape: score / total for shape, score in scores.items()}
    ranked = sorted(probabilities, key=probabilities.get, reverse=True)
    return {"primary": ranked[0], "secondary": ranked[1], "probabilities": probabilities, "ratios": {"r1": float(ratios[0]), "r2": float(ratios[1]), "r3": float(ratios[2])}}


def extract_lip_metrics(img_bgr: np.ndarray, points: np.ndarray) -> dict:
    """Estimate natural lip base and border darkness from landmark samples."""
    h, w = img_bgr.shape[:2]
    inner_indices = [13, 14, 78, 308, 82, 312]
    outer_indices = [61, 291, 0, 17, 37, 267, 84, 314]
    radius = max(2, int(min(h, w) * 0.015))
    inner_mask, outer_mask = np.zeros((h, w), np.uint8), np.zeros((h, w), np.uint8)
    for point in points[inner_indices, :2]:
        cv2.circle(inner_mask, tuple(np.round(point).astype(int)), radius, 255, -1)
    for point in points[outer_indices, :2]:
        cv2.circle(outer_mask, tuple(np.round(point).astype(int)), radius, 255, -1)
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2Lab)
    inner, outer = lab[inner_mask > 0], lab[outer_mask > 0]
    if inner.size == 0 or outer.size == 0:
        raise ValueError("Lip ROI is empty; face landmarks are outside the image.")
    lip_base = np.array([np.median(inner[:, 0]) * 100.0 / 255.0, np.median(inner[:, 1]) - 128.0, np.median(inner[:, 2]) - 128.0], dtype=float)
    border_l = float(np.median(outer[:, 0]) * 100.0 / 255.0)
    darkness = float(max(0.0, lip_base[0] - border_l))
    dark_border = border_l < 43.0 or darkness > 5.0
    return {"lip_base_lab": lip_base, "lip_border_L": border_l, "lip_darkness_index": darkness, "has_dark_lip_border": dark_border, "coverage_requirement": "Cần che khuyết điểm / son lip clay" if dark_border else "Viền môi sáng (có thể dùng tint bóng)", "recommended_texture": "Lip Clay / Mud" if dark_border else "Juicy Tint"}


def compute_skin_metrics(lab_sample: dict, img_bgr: np.ndarray) -> dict:
    l_star, a_star, b_star = lab_sample["L"], lab_sample["a"], lab_sample["b"]
    ita = math.degrees(math.atan((l_star - 50.0) / (b_star + 1e-5)))
    if ita > 55:
        category = "Very Light (Fitzpatrick I)"
    elif ita > 41:
        category = "Light (Fitzpatrick II)"
    elif ita > 28:
        category = "Intermediate (Fitzpatrick III)"
    elif ita > 10:
        category = "Tan (Fitzpatrick IV)"
    elif ita > -30:
        category = "Brown (Fitzpatrick V)"
    else:
        category = "Dark (Fitzpatrick VI)"
    pixels = img_bgr[lab_sample["mask"] > 0].astype(float) + 1.0
    green, red = pixels[:, 1], pixels[:, 2]
    return {"ITA_deg": float(ita), "ITA_category": category, "L_star": float(l_star), "a_star": float(a_star), "b_star": float(b_star), "Melanin_index": float(np.mean(100.0 * np.log10(255.0 / red))), "Hemoglobin_index": float(np.mean(100.0 * np.log10(red / green)))}


# Unvalidated soft Gaussian prototypes in (L*, skin hue angle h_deg = atan2(b*, a*), chroma C*).
# Replaces discontinuous if/else thresholds so small lighting jitter never flips target colours abruptly.
SEASON_GAUSSIAN_PROTOTYPES: dict[str, tuple[float, float, float]] = {
    "Light Spring": (72.0, 60.0, 20.0),
    "Warm Spring": (64.0, 64.0, 25.0),
    "Bright Spring": (67.0, 58.0, 27.0),
    "Light Summer": (72.0, 46.0, 16.0),
    "Cool Summer": (63.0, 43.0, 17.0),
    "Soft Summer": (60.0, 49.0, 14.0),
    "Warm Autumn": (57.0, 65.0, 23.0),
    "Soft Autumn": (60.0, 58.0, 16.0),
    "Deep Autumn": (46.0, 60.0, 21.0),
    "Bright Winter": (66.0, 44.0, 24.0),
    "Cool Winter": (56.0, 41.0, 20.0),
    "Deep Winter": (45.0, 44.0, 19.0),
}
_SEASON_SIGMA = np.array([9.0, 8.0, 6.0], dtype=float)
_WARM_SEASONS = {"Light Spring", "Warm Spring", "Bright Spring", "Warm Autumn", "Soft Autumn", "Deep Autumn"}


def classify_season(metrics: dict) -> dict:
    """Smooth 12-season Gaussian baseline in (L*, hue, chroma); unvalidated against expert ground truth."""
    l_star = float(metrics["L_star"])
    a_star = float(metrics["a_star"])
    b_star = float(metrics["b_star"])
    hue_deg = math.degrees(math.atan2(b_star, max(a_star, 1e-5)))
    chroma = math.hypot(a_star, b_star)
    features = np.array([l_star, hue_deg, chroma], dtype=float)

    log_scores = {
        name: float(-0.5 * np.sum(((features - np.asarray(proto, dtype=float)) / _SEASON_SIGMA) ** 2))
        for name, proto in SEASON_GAUSSIAN_PROTOTYPES.items()
    }
    max_log = max(log_scores.values())
    exp_scores = {name: math.exp(val - max_log) for name, val in log_scores.items()}
    total = sum(exp_scores.values()) + 1e-12
    probabilities = {name: score / total for name, score in exp_scores.items()}

    ranked = sorted(probabilities, key=probabilities.__getitem__, reverse=True)
    primary, secondary = ranked[0], ranked[1]
    warm_prob = sum(probabilities[name] for name in _WARM_SEASONS)
    if warm_prob >= 0.6:
        undertone = "Warm (Golden)"
    elif warm_prob <= 0.4:
        undertone = "Cool (Pink/Blue)"
    else:
        undertone = "Neutral"

    return {
        "season": primary,
        "secondary_season": secondary,
        "confidence": round(probabilities[primary], 4),
        "is_borderline": bool(probabilities[primary] < 0.45),
        "warm_probability": round(warm_prob, 4),
        "probabilities": probabilities,
        "undertone": undertone,
        "skin_hue_deg": round(hue_deg, 2),
        "skin_chroma": round(chroma, 2),
        "backend": "soft_gaussian_baseline_unvalidated",
    }


OCCASION_MODIFIERS = {"daily": {"intensity": "Tự nhiên trong trẻo (0.4)", "texture_style": "Glasting Water Tint / Dewy Balm", "eye_depth": "Nhấn nhẹ mi & phấn nhạt"}, "office": {"intensity": "Thanh lịch chỉn chu (0.6)", "texture_style": "Blur Water Tint / Satin", "eye_depth": "Tạo hốc mắt nhẹ tự nhiên"}, "glam": {"intensity": "Nổi bật cuốn hút (1.0)", "texture_style": "Hazy Lip Clay / Glossy Layering", "eye_depth": "Nhấn nhũ mịn & eyeliner đuôi dài"}}
TEXTURE_MODIFIERS = {"oily": {"prep": "Kem lót kiềm dầu Niacinamide Matte Primer", "setting": "Phấn phủ Translucent Bake Powder vùng T-zone"}, "dry": {"prep": "Xịt khoáng cấp ẩm Hyaluronic Mist", "setting": "Xịt khóa nền bóng Dewy Glow Setting Spray"}, "combination": {"prep": "Kem lót kiềm dầu vùng T-Zone", "setting": "Phấn phủ nhẹ vùng T-Zone"}}


def resolve_glowup_profile(shape: str, season: str, occasion: str = "daily", texture: str = "combination") -> dict:
    if occasion not in OCCASION_MODIFIERS or texture not in TEXTURE_MODIFIERS:
        raise ValueError("Unsupported occasion or skin texture.")
    return {"profile": {"face_shape": shape, "season": season, "occasion": occasion, "texture": texture}, "techniques": get_asian_advice(shape, season), "execution_parameters": {**OCCASION_MODIFIERS[occasion], **TEXTURE_MODIFIERS[texture]}}
