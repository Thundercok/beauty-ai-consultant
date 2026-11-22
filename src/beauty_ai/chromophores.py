"""Linear-RGB Beer-Lambert chromophore decomposition (melanin, hemoglobin, shading).

Under the diffuse skin optical-density model (Tsumura et al., 1999), linear-RGB
reflectance at pixel x obeys:

    d(x) = -ln(I_lin(x)) = c_M(x) * v_M + c_H(x) * v_H + (-ln s(x)) * 1 + (-ln E)

Centering d(x) across a valid (unclipped) skin ROI cancels any constant diagonal
room illuminant E, and solving the 3x3 linear system with basis B = [v_M, v_H, 1/sqrt(3)]
jointly separates relative melanin contrast (Delta c_M), relative hemoglobin/erythema
contrast (Delta c_H), and geometric shading variation (Delta alpha) without sign
ambiguity or iterative randomness.

Notes on scope:
- Relative maps (Delta c_M, Delta c_H) are mathematically invariant to constant
  diagonal linear-RGB illuminants and multiplicative shading (up to 8-bit
  quantization and sensor clipping).
- Absolute skin-tone levels (mean c_M, mean c_H across people) are removed by
  centering and require separate illuminant estimation.
"""

from __future__ import annotations

import numpy as np

from beauty_ai.product_matcher import _srgb_to_linear

# Unit-normalized effective RGB absorption vectors in linear sRGB.
# Melanin: monotonic decrease with wavelength (approx. lambda^-3.33 at 620/545/460 nm).
_RAW_MELANIN = np.array([0.488, 0.751, 1.320], dtype=float)
MELANIN_BASIS = _RAW_MELANIN / np.linalg.norm(_RAW_MELANIN)

# Hemoglobin (dermal oxy/deoxy aggregate): weak red absorption, strong green Q-band, moderate blue.
_RAW_HEMOGLOBIN = np.array([0.100, 0.820, 0.563], dtype=float)
HEMOGLOBIN_BASIS = _RAW_HEMOGLOBIN / np.linalg.norm(_RAW_HEMOGLOBIN)

# Geometric shading axis (achromatic multiplicative scaling in linear RGB).
SHADING_BASIS = np.array([1.0, 1.0, 1.0], dtype=float) / np.sqrt(3.0)

CHROMOPHORE_BASIS_MATRIX = np.column_stack((MELANIN_BASIS, HEMOGLOBIN_BASIS, SHADING_BASIS))
_CHROMOPHORE_INV = np.linalg.inv(CHROMOPHORE_BASIS_MATRIX)


def decompose_linear_optical_density(
    linear_rgb: np.ndarray,
    skin_mask: np.ndarray,
    *,
    eps: float = 1e-6,
) -> dict[str, np.ndarray | int]:
    """Decompose linear-RGB skin pixels (in [0, 1]) into relative melanin, hemoglobin, and shading.

    Parameters
    ----------
    linear_rgb:
        Float array of shape ``(H, W, 3)`` with linear-RGB intensities in ``[0, 1]``.
    skin_mask:
        Boolean or uint8 mask of shape ``(H, W)`` marking valid, unclipped skin pixels.
    eps:
        Lower clip floor before taking the natural logarithm.

    Returns
    -------
    dict with keys ``melanin_delta``, ``hemoglobin_delta``, ``shading_delta`` (float32 maps of
    shape ``(H, W)``, zero outside ``skin_mask``), ``valid_mask`` (bool), and ``pixel_count`` (int).
    """
    if linear_rgb.ndim != 3 or linear_rgb.shape[2] != 3:
        raise ValueError("linear_rgb must have shape (H, W, 3).")
    if skin_mask.shape != linear_rgb.shape[:2]:
        raise ValueError("skin_mask shape must match linear_rgb height and width.")

    valid = np.asarray(skin_mask) > 0
    h, w = linear_rgb.shape[:2]
    pixel_count = int(np.count_nonzero(valid))

    melanin_map = np.zeros((h, w), dtype=np.float32)
    hemoglobin_map = np.zeros((h, w), dtype=np.float32)
    shading_map = np.zeros((h, w), dtype=np.float32)

    if pixel_count < 10:
        return {
            "melanin_delta": melanin_map,
            "hemoglobin_delta": hemoglobin_map,
            "shading_delta": shading_map,
            "valid_mask": valid,
            "pixel_count": pixel_count,
        }

    # Optical density d(x) = -ln(I_lin(x))
    od = -np.log(np.clip(linear_rgb[valid].astype(float), eps, 1.0))

    # Center across valid skin ROI to cancel constant diagonal illuminant (-ln E)
    centered_od = od - np.mean(od, axis=0, keepdims=True)

    # Solve B @ [Delta c_M, Delta c_H, Delta alpha]^T = centered_od^T
    coeffs = centered_od @ _CHROMOPHORE_INV.T

    melanin_map[valid] = coeffs[:, 0].astype(np.float32)
    hemoglobin_map[valid] = coeffs[:, 1].astype(np.float32)
    shading_map[valid] = coeffs[:, 2].astype(np.float32)

    return {
        "melanin_delta": melanin_map,
        "hemoglobin_delta": hemoglobin_map,
        "shading_delta": shading_map,
        "valid_mask": valid,
        "pixel_count": pixel_count,
    }


def extract_relative_chromophores_srgb(
    img_rgb: np.ndarray,
    skin_mask: np.ndarray,
    *,
    clip_threshold: int = 245,
    dark_threshold: int = 12,
) -> dict[str, np.ndarray | int]:
    """Linearize an 8-bit sRGB image, reject clipped/near-black pixels, and decompose chromophores.

    Parameters
    ----------
    img_rgb:
        Uint8 or float RGB image of shape ``(H, W, 3)`` in ``[0, 255]``.
    skin_mask:
        Skin ROI mask of shape ``(H, W)``.
    clip_threshold:
        Pixels with ``max(R, G, B) >= clip_threshold`` are excluded to prevent clipping distortion.
    dark_threshold:
        Pixels with ``min(R, G, B) <= dark_threshold`` are excluded to avoid log quantization noise.
    """
    if img_rgb.ndim != 3 or img_rgb.shape[2] != 3:
        raise ValueError("img_rgb must have shape (H, W, 3).")

    rgb_arr = np.asarray(img_rgb, dtype=float)
    unclipped = np.max(rgb_arr, axis=-1) < float(clip_threshold)
    not_dark = np.min(rgb_arr, axis=-1) > float(dark_threshold)
    effective_mask = (np.asarray(skin_mask) > 0) & unclipped & not_dark

    linear_rgb = _srgb_to_linear(rgb_arr)
    return decompose_linear_optical_density(linear_rgb, effective_mask)
