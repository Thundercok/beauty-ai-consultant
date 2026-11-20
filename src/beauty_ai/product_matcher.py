"""Colour-correct product preparation, finite-layer lip rendering, and ΔE00 matching."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .bradford_cat import adapt_lab_bradford, lab_to_xyz, xyz_to_lab
from .kubelka_munk import kubelka_munk_lip_blend


def _srgb_to_linear(rgb: np.ndarray) -> np.ndarray:
    rgb = np.clip(np.asarray(rgb, dtype=float) / 255.0, 0.0, 1.0)
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(linear: np.ndarray) -> np.ndarray:
    linear = np.clip(np.asarray(linear, dtype=float), 0.0, 1.0)
    srgb = np.where(linear <= 0.0031308, 12.92 * linear, 1.055 * linear ** (1.0 / 2.4) - 0.055)
    return np.clip(srgb * 255.0, 0.0, 255.0)


def hex_to_rgb(hex_str: str) -> np.ndarray:
    value = str(hex_str).strip().lstrip("#")
    if len(value) != 6:
        raise ValueError(f"Expected a six-digit hex colour, got '{hex_str}'.")
    try:
        return np.array([int(value[index:index + 2], 16) for index in (0, 2, 4)], dtype=float)
    except ValueError as exc:
        raise ValueError(f"Invalid hex colour '{hex_str}'.") from exc


def rgb_to_lab(rgb: np.ndarray | list[float]) -> np.ndarray:
    """Convert encoded sRGB (D65) values to CIELAB (D65)."""
    linear = _srgb_to_linear(np.asarray(rgb, dtype=float))
    matrix = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    return xyz_to_lab(linear @ matrix.T, "D65")


def lab_to_rgb(lab: np.ndarray | list[float]) -> np.ndarray:
    """Convert D65 CIELAB to encoded sRGB, clipping out-of-gamut values."""
    xyz = lab_to_xyz(lab, "D65")
    matrix = np.array([[3.2404542, -1.5371385, -0.4985314], [-0.9692660, 1.8760108, 0.0415560], [0.0556434, -0.2040259, 1.0572252]])
    return _linear_to_srgb(np.asarray(xyz) @ matrix.T)


def hex_to_lab(hex_str: str) -> np.ndarray:
    return rgb_to_lab(hex_to_rgb(hex_str))


def ciede2000(target_lab: np.ndarray, candidate_labs: np.ndarray) -> np.ndarray:
    """Vectorised CIEDE2000 ΔE implementation, including the hue-rotation term."""
    target = np.asarray(target_lab, dtype=float)
    candidates = np.asarray(candidate_labs, dtype=float)
    if target.shape != (3,) or candidates.ndim != 2 or candidates.shape[1] != 3:
        raise ValueError("target_lab must have shape (3,) and candidate_labs shape (n, 3).")
    l1, a1, b1 = target
    l2, a2, b2 = candidates[:, 0], candidates[:, 1], candidates[:, 2]
    c1, c2 = np.hypot(a1, b1), np.hypot(a2, b2)
    c_bar = (c1 + c2) / 2.0
    g = 0.5 * (1.0 - np.sqrt(c_bar**7 / (c_bar**7 + 25.0**7)))
    a1_prime, a2_prime = (1.0 + g) * a1, (1.0 + g) * a2
    c1_prime, c2_prime = np.hypot(a1_prime, b1), np.hypot(a2_prime, b2)
    h1_prime = np.degrees(np.arctan2(b1, a1_prime)) % 360.0
    h2_prime = np.degrees(np.arctan2(b2, a2_prime)) % 360.0
    delta_l = l2 - l1
    delta_c = c2_prime - c1_prime
    delta_h_angle = h2_prime - h1_prime
    delta_h_angle = np.where(delta_h_angle > 180.0, delta_h_angle - 360.0, delta_h_angle)
    delta_h_angle = np.where(delta_h_angle < -180.0, delta_h_angle + 360.0, delta_h_angle)
    delta_h = 2.0 * np.sqrt(c1_prime * c2_prime) * np.sin(np.radians(delta_h_angle / 2.0))
    l_bar = (l1 + l2) / 2.0
    c_bar_prime = (c1_prime + c2_prime) / 2.0
    hue_sum = h1_prime + h2_prime
    hue_difference = np.abs(h1_prime - h2_prime)
    h_bar = np.where(c1_prime * c2_prime == 0.0, hue_sum, np.where(hue_difference <= 180.0, hue_sum / 2.0, np.where(hue_sum < 360.0, (hue_sum + 360.0) / 2.0, (hue_sum - 360.0) / 2.0)))
    t = 1.0 - 0.17 * np.cos(np.radians(h_bar - 30.0)) + 0.24 * np.cos(np.radians(2.0 * h_bar)) + 0.32 * np.cos(np.radians(3.0 * h_bar + 6.0)) - 0.20 * np.cos(np.radians(4.0 * h_bar - 63.0))
    delta_theta = 30.0 * np.exp(-((h_bar - 275.0) / 25.0) ** 2)
    r_c = 2.0 * np.sqrt(c_bar_prime**7 / (c_bar_prime**7 + 25.0**7))
    s_l = 1.0 + (0.015 * (l_bar - 50.0) ** 2) / np.sqrt(20.0 + (l_bar - 50.0) ** 2)
    s_c = 1.0 + 0.045 * c_bar_prime
    s_h = 1.0 + 0.015 * c_bar_prime * t
    r_t = -np.sin(np.radians(2.0 * delta_theta)) * r_c
    return np.sqrt((delta_l / s_l) ** 2 + (delta_c / s_c) ** 2 + (delta_h / s_h) ** 2 + r_t * (delta_c / s_c) * (delta_h / s_h))


def _catalog_lab(row: pd.Series, fallback_illuminant: str) -> np.ndarray:
    lab = hex_to_lab(row["hex_color"])
    illuminant = str(row.get("catalog_illuminant", fallback_illuminant)).upper()
    if illuminant not in {"D50", "D65"}:
        raise ValueError("catalog_illuminant must be D50 or D65.")
    # A normal hex is encoded sRGB/D65.  A D50 entry is an explicit assertion
    # that the recorded Lab coordinates were authored under D50 before encoding.
    return adapt_lab_bradford(lab, illuminant, "D65") if illuminant == "D50" else lab


def match_products(
    target_hex: str,
    db_df: pd.DataFrame,
    *,
    product_type: str = "lipstick",
    lip_base_lab: np.ndarray | None = None,
    top_k: int = 3,
    catalog_illuminant: str = "D65",
) -> list[dict]:
    """Match catalogue products in D65 Lab, rendering lip products with K--M."""
    required = {"product_type", "hex_color", "brand", "product_name", "shade_name"}
    missing = required - set(db_df.columns)
    if missing:
        raise ValueError(f"Product database is missing required columns: {', '.join(sorted(missing))}.")
    filtered = db_df.loc[db_df["product_type"] == product_type].copy()
    if filtered.empty:
        return []
    target_lab = hex_to_lab(target_hex)
    product_labs = np.vstack([_catalog_lab(row, catalog_illuminant) for _, row in filtered.iterrows()])
    if lip_base_lab is not None and product_type == "lipstick":
        substrate_rgb = lab_to_rgb(lip_base_lab)
        rendered_labs = []
        for (_, row), product_lab in zip(filtered.iterrows(), product_labs, strict=True):
            product_rgb = lab_to_rgb(product_lab)
            texture = str(row.get("texture_type", "standard"))
            rendered_rgb = kubelka_munk_lip_blend(substrate_rgb, product_rgb, texture_type=texture)
            rendered_labs.append(rgb_to_lab(rendered_rgb))
        candidate_labs = np.vstack(rendered_labs)
    else:
        candidate_labs = product_labs
    filtered["delta_e"] = ciede2000(target_lab, candidate_labs)
    results = []
    for _, row in filtered.nsmallest(top_k, "delta_e").iterrows():
        delta_e = float(row["delta_e"])
        tier = "Exact Match" if delta_e < 1.0 else ("Great Match" if delta_e < 2.0 else "Close Alternative")
        results.append({"brand": row["brand"], "name": row["product_name"], "shade": row["shade_name"], "texture": row.get("texture_type", "Standard"), "hex": row["hex_color"], "delta_e": round(delta_e, 2), "match_tier": tier})
    return results

