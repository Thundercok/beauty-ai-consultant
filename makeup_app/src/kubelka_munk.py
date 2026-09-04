"""Finite-layer RGB Kubelka--Munk lip colour renderer.

This is a three-band approximation, not a 31-band spectral renderer.  It keeps
the important finite-layer behaviour: a translucent tint exposes the natural
lip substrate, while an opaque layer approaches the shade reflectance.
"""

from __future__ import annotations

import numpy as np


TEXTURE_KS_MAP = {
    "Juicy Tint": {"scattering": 0.45, "thickness": 0.55, "km_type": "translucent"},
    "Dewy Balm": {"scattering": 0.60, "thickness": 0.72, "km_type": "sheer"},
    "Lip Clay / Mud": {"scattering": 1.30, "thickness": 1.60, "km_type": "opaque"},
    "Blur Water Tint": {"scattering": 0.78, "thickness": 0.92, "km_type": "satin"},
    "Matte Lipstick": {"scattering": 1.10, "thickness": 1.25, "km_type": "opaque"},
}
DEFAULT_KS = {"scattering": 0.72, "thickness": 0.90, "km_type": "standard"}


def _srgb_to_linear(rgb: np.ndarray) -> np.ndarray:
    rgb = np.clip(np.asarray(rgb, dtype=float) / 255.0, 0.0, 1.0)
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(reflectance: np.ndarray) -> np.ndarray:
    reflectance = np.clip(np.asarray(reflectance, dtype=float), 0.0, 1.0)
    encoded = np.where(reflectance <= 0.0031308, 12.92 * reflectance, 1.055 * reflectance ** (1.0 / 2.4) - 0.055)
    return np.clip(encoded * 255.0, 0.0, 255.0)


def pigment_ks_from_rgb(product_rgb: np.ndarray | list[float], scattering: float) -> tuple[np.ndarray, np.ndarray]:
    """Derive a per-band K/S ratio from the shade's opaque reflectance.

    The texture determines scattering; the product shade supplies the spectral
    shape, so two tint shades are no longer rendered with identical optics.
    """
    reflectance = np.clip(_srgb_to_linear(product_rgb), 1e-4, 0.9999)
    k_over_s = (1.0 - reflectance) ** 2 / (2.0 * reflectance)
    s_coeffs = np.full(3, float(scattering))
    return k_over_s * s_coeffs, s_coeffs


def kubelka_munk_lip_blend(
    substrate_rgb: np.ndarray | list[float],
    product_rgb: np.ndarray | list[float],
    *,
    k_coeffs: np.ndarray | list[float] | None = None,
    s_coeffs: np.ndarray | list[float] | None = None,
    thickness: float = 0.9,
    texture_type: str = "standard",
) -> np.ndarray:
    """Render a finite cosmetic layer over a natural lip substrate in sRGB.

    If coefficients are omitted, they are inferred from ``product_rgb`` and a
    texture-specific scattering coefficient.  ``thickness=0`` returns the
    substrate; increasing it converges towards the product's opaque colour.
    """
    if thickness < 0:
        raise ValueError("thickness must be non-negative")
    config = TEXTURE_KS_MAP.get(texture_type, DEFAULT_KS)
    if k_coeffs is None or s_coeffs is None:
        inferred_k, inferred_s = pigment_ks_from_rgb(product_rgb, config["scattering"])
        k_coeffs = inferred_k if k_coeffs is None else k_coeffs
        s_coeffs = inferred_s if s_coeffs is None else s_coeffs

    k = np.asarray(k_coeffs, dtype=float)
    s = np.asarray(s_coeffs, dtype=float)
    if k.shape != (3,) or s.shape != (3,) or np.any(k < 0) or np.any(s <= 0):
        raise ValueError("K and S coefficients must be length-3 arrays with K >= 0 and S > 0.")

    substrate = np.clip(_srgb_to_linear(substrate_rgb), 1e-4, 0.9999)
    a = 1.0 + k / s
    b = np.sqrt(np.maximum(a * a - 1.0, 1e-12))
    optical_depth = b * s * float(thickness)
    sinh = np.sinh(optical_depth)
    cosh = np.cosh(optical_depth)
    denominator = a * sinh + b * cosh
    layer_r = sinh / denominator
    layer_t = b / denominator
    rendered_reflectance = layer_r + (layer_t * layer_t * substrate) / np.maximum(1.0 - layer_r * substrate, 1e-8)
    return _linear_to_srgb(rendered_reflectance)

