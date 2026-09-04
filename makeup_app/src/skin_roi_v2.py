"""Landmark-guided skin ROI extraction with hull, filtering, and robust statistics."""

from __future__ import annotations

import cv2
import numpy as np


SKIN_LANDMARKS = np.array(
    [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
     400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
     54, 103, 67, 109],
    dtype=int,
)
FEATURE_POLYGONS = (
    np.array([33, 160, 158, 133, 153, 144]),
    np.array([362, 385, 387, 263, 373, 380]),
    np.array([61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]),
)


def _trimmed_mean(values: np.ndarray, proportion: float = 0.1) -> float:
    if values.size == 0:
        raise ValueError("Cannot calculate a statistic for an empty skin ROI.")
    ordered = np.sort(values.astype(float))
    trim = int(ordered.size * proportion)
    core = ordered[trim:-trim] if trim and ordered.size > 2 * trim else ordered
    return float(np.mean(core))


def build_skin_mask(img_bgr: np.ndarray, points: np.ndarray) -> np.ndarray:
    """Return the face hull intersected with conservative HSV skin pixels.

    Eyes and lips are removed explicitly.  The mask intentionally does not
    claim semantic segmentation; a future segmentation model can replace it.
    """
    if img_bgr.ndim != 3 or img_bgr.shape[2] != 3:
        raise ValueError("img_bgr must have shape (height, width, 3)")
    if points.ndim != 2 or points.shape[1] < 2 or points.shape[0] <= int(SKIN_LANDMARKS.max()):
        raise ValueError("points must contain MediaPipe face landmarks with x/y coordinates.")

    h, w = img_bgr.shape[:2]
    hull_points = np.round(points[SKIN_LANDMARKS, :2]).astype(np.int32)
    hull_points[:, 0] = np.clip(hull_points[:, 0], 0, w - 1)
    hull_points[:, 1] = np.clip(hull_points[:, 1], 0, h - 1)
    hull_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillConvexPoly(hull_mask, cv2.convexHull(hull_points), 255)

    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    hue, saturation, value = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    hsv_skin = ((hue <= 25) | (hue >= 170)) & (saturation >= 20) & (saturation <= 220) & (value >= 55)
    mask = np.where((hull_mask > 0) & hsv_skin, 255, 0).astype(np.uint8)

    for indices in FEATURE_POLYGONS:
        polygon = np.round(points[indices, :2]).astype(np.int32)
        polygon[:, 0] = np.clip(polygon[:, 0], 0, w - 1)
        polygon[:, 1] = np.clip(polygon[:, 1], 0, h - 1)
        cv2.fillConvexPoly(mask, cv2.convexHull(polygon), 0)
    return mask


def extract_skin_cielab_v2(img_bgr: np.ndarray, points: np.ndarray, trim_proportion: float = 0.1) -> dict:
    """Extract robust D65 CIELAB measurements from a landmark-guided skin ROI."""
    if not 0.0 <= trim_proportion < 0.5:
        raise ValueError("trim_proportion must be in [0, 0.5).")
    mask = build_skin_mask(img_bgr, points)
    if np.count_nonzero(mask) < 100:
        raise ValueError("Skin ROI is too small after filtering; use a brighter, frontal selfie.")
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2Lab)
    pixels = lab[mask > 0]
    l_vals = pixels[:, 0].astype(float) * (100.0 / 255.0)
    a_vals = pixels[:, 1].astype(float) - 128.0
    b_vals = pixels[:, 2].astype(float) - 128.0
    return {
        "L": _trimmed_mean(l_vals, trim_proportion),
        "a": _trimmed_mean(a_vals, trim_proportion),
        "b": _trimmed_mean(b_vals, trim_proportion),
        "mask": mask,
        "sample_count": int(pixels.shape[0]),
        "method": "face_hull_hsv_feature_exclusion_trimmed_mean",
    }

