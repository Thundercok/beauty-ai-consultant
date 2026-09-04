import cv2
import numpy as np

from makeup_app.src.skin_roi_v2 import SKIN_LANDMARKS, extract_skin_cielab_v2


def test_skin_roi_filters_dark_non_skin_pixels_and_returns_robust_metrics():
    image = np.zeros((160, 160, 3), dtype=np.uint8)
    cv2.ellipse(image, (80, 80), (55, 65), 0, 0, 360, (100, 150, 200), -1)
    cv2.rectangle(image, (65, 65), (95, 95), (0, 0, 0), -1)  # hair/shadow-like occlusion
    points = np.zeros((478, 3), dtype=float)
    angles = np.linspace(0, 2 * np.pi, len(SKIN_LANDMARKS), endpoint=False)
    points[SKIN_LANDMARKS, 0] = 80 + 55 * np.cos(angles)
    points[SKIN_LANDMARKS, 1] = 80 + 65 * np.sin(angles)
    # Keep removed feature polygons inside the already black occlusion.
    points[:, :2] = np.where(points[:, :2] == 0, 80, points[:, :2])
    result = extract_skin_cielab_v2(image, points)
    assert result["sample_count"] > 1_000
    assert result["mask"][80, 80] == 0
    assert 60.0 < result["L"] < 80.0
