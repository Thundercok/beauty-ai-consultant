"""Planckian-constrained computational color constancy and Bradford white balance.

Estimates room illumination from non-skin image regions in linear sRGB (via
Shades-of-Gray or first-order Grey-Edge), then projects the raw illuminant onto
the 1D CIE Planckian blackbody locus (2500K--9000K) to reject non-physical
green/magenta background tints before adapting the portrait to D65 via Bradford
LMS cone-space chromatic adaptation.
"""

from __future__ import annotations

import math

import cv2
import numpy as np

from beauty_ai.bradford_cat import _BRADFORD, _BRADFORD_INV, WHITEPOINTS
from beauty_ai.product_matcher import _linear_to_srgb, _srgb_to_linear

_SRGB_TO_XYZ = np.array(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ],
    dtype=float,
)
_XYZ_TO_SRGB = np.linalg.inv(_SRGB_TO_XYZ)


def planckian_xy(cct_kelvin: float) -> tuple[float, float]:
    """CIE 1931 (x, y) chromaticity on the Planckian locus (Kang et al., 2002).

    Valid for 1667K <= T <= 25000K.
    """
    t = float(cct_kelvin)
    if not 1667.0 <= t <= 25000.0:
        raise ValueError("cct_kelvin must lie in [1667, 25000].")

    if t <= 4000.0:
        x = -0.2661239e9 / (t**3) - 0.2343589e6 / (t**2) + 0.8776956e3 / t + 0.179910
    else:
        x = -3.0258469e9 / (t**3) + 2.1070379e6 / (t**2) + 0.2226347e3 / t + 0.240390

    if t <= 2222.0:
        y = -1.1063814 * (x**3) - 1.34811020 * (x**2) + 2.18555832 * x - 0.20219683
    elif t <= 4000.0:
        y = -0.9549476 * (x**3) - 1.37418593 * (x**2) + 2.09137015 * x - 0.16748867
    else:
        y = 3.0817580 * (x**3) - 5.87338670 * (x**2) + 3.75112997 * x - 0.37001483
    return float(x), float(y)


def planckian_xyz(cct_kelvin: float) -> np.ndarray:
    """Return Y=1 normalized CIE XYZ tristimulus vector on the Planckian locus."""
    x, y = planckian_xy(cct_kelvin)
    return np.array([x / y, 1.0, (1.0 - x - y) / y], dtype=float)


def normalize_illuminant_luma(rgb_lin: np.ndarray) -> np.ndarray:
    """Normalize a linear-sRGB illuminant vector so CIE luminance Y = 1."""
    vec = np.maximum(np.asarray(rgb_lin, dtype=float), 1e-6)
    y = 0.2126729 * vec[0] + 0.7151522 * vec[1] + 0.0721750 * vec[2]
    return vec / (y + 1e-12)


def planckian_linear_rgb(cct_kelvin: float) -> np.ndarray:
    """Return Y=1 normalized linear-sRGB illuminant on the Planckian locus."""
    xyz = planckian_xyz(cct_kelvin)
    rgb = _XYZ_TO_SRGB @ xyz
    return normalize_illuminant_luma(rgb)


def angular_error_deg(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Angle in degrees between two 3D illuminant vectors."""
    a = np.asarray(vec_a, dtype=float)
    b = np.asarray(vec_b, dtype=float)
    cos_sim = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))
    return math.degrees(math.acos(np.clip(cos_sim, -1.0, 1.0)))


def project_to_planckian_locus(
    raw_illuminant_linear: np.ndarray,
    *,
    t_min: float = 2500.0,
    t_max: float = 9000.0,
    num_steps: int = 261,
) -> dict[str, np.ndarray | float]:
    """Project an unconstrained linear-RGB illuminant onto the 1D Planckian locus.

    Minimizes recovery angular error over a uniform reciprocal-kelvin (mired) grid
    spanning ``[t_min, t_max]``, returning the constrained illuminant, estimated
    correlated color temperature (CCT), and off-locus angular residual.
    """
    raw = normalize_illuminant_luma(raw_illuminant_linear)
    raw_unit = raw / (np.linalg.norm(raw) + 1e-12)

    # Sample uniformly in mireds (1e6 / T) for perceptually even spacing from warm to cool.
    mireds = np.linspace(1e6 / t_max, 1e6 / t_min, num_steps)
    ccts = 1e6 / mireds
    candidates = np.vstack([planckian_linear_rgb(float(t)) for t in ccts])
    cand_units = candidates / (np.linalg.norm(candidates, axis=1, keepdims=True) + 1e-12)

    dots = np.clip(cand_units @ raw_unit, -1.0, 1.0)
    best_idx = int(np.argmax(dots))
    off_locus_deg = math.degrees(math.acos(float(dots[best_idx])))

    return {
        "illuminant_linear": candidates[best_idx],
        "cct_kelvin": float(ccts[best_idx]),
        "off_locus_deg": float(off_locus_deg),
        "raw_illuminant_linear": raw,
    }


def estimate_nonskin_illuminant(
    img_rgb: np.ndarray,
    exclude_mask: np.ndarray,
    *,
    method: str = "sog",
    p: float = 6.0,
    sigma: float = 1.0,
    clip_threshold: int = 245,
    dark_threshold: int = 10,
) -> np.ndarray:
    """Estimate raw linear-RGB illuminant from pixels strictly outside ``exclude_mask``.

    Parameters
    ----------
    img_rgb:
        Uint8 or float RGB image of shape ``(H, W, 3)`` in ``[0, 255]``.
    exclude_mask:
        Mask of shape ``(H, W)`` marking face/skin pixels to exclude (non-zero = excluded).
    method:
        ``"sog"`` (Shades-of-Gray Minkowski p-norm) or ``"grey_edge"`` (1st-order Grey-Edge,
        van de Weijer et al., 2007).
    """
    if img_rgb.ndim != 3 or img_rgb.shape[2] != 3:
        raise ValueError("img_rgb must have shape (H, W, 3).")
    if method not in {"sog", "grey_edge"}:
        raise ValueError("method must be 'sog' or 'grey_edge'.")

    rgb_arr = np.asarray(img_rgb, dtype=float)
    valid = (np.asarray(exclude_mask) == 0) & (np.max(rgb_arr, axis=-1) < clip_threshold) & (
        np.min(rgb_arr, axis=-1) > dark_threshold
    )
    if np.count_nonzero(valid) < 50:
        return np.array([1.0, 1.0, 1.0], dtype=float)

    lin = _srgb_to_linear(rgb_arr)

    if method == "sog":
        pixels = lin[valid]
        est = np.mean(pixels**p, axis=0) ** (1.0 / p)
        return normalize_illuminant_luma(est)

    # First-order Grey-Edge in linear RGB: Gaussian smooth, Sobel gradient magnitude per channel.
    lin_f32 = lin.astype(np.float32)
    if sigma > 0:
        lin_f32 = cv2.GaussianBlur(lin_f32, (0, 0), sigmaX=sigma, sigmaY=sigma)

    # Erode valid mask by 2 px so gradients don't cross clipped or face-boundary edges.
    kernel = np.ones((5, 5), dtype=np.uint8)
    valid_interior = cv2.erode(valid.astype(np.uint8), kernel, iterations=1) > 0
    if np.count_nonzero(valid_interior) < 50:
        valid_interior = valid

    grad_mag = np.empty_like(lin_f32, dtype=float)
    for ch in range(3):
        gx = cv2.Sobel(lin_f32[..., ch], cv2.CV_64F, 1, 0, ksize=3)
        gy = cv2.Sobel(lin_f32[..., ch], cv2.CV_64F, 0, 1, ksize=3)
        grad_mag[..., ch] = np.hypot(gx, gy)

    edges = grad_mag[valid_interior]
    est = np.mean(edges**p, axis=0) ** (1.0 / p)
    return normalize_illuminant_luma(est)


def apply_bradford_white_balance(
    img_rgb: np.ndarray,
    est_illuminant_linear: np.ndarray,
) -> np.ndarray:
    """Adapt an sRGB image from estimated linear-RGB illuminant to D65 via Bradford CAT."""
    lin = _srgb_to_linear(np.asarray(img_rgb, dtype=float))
    src_white_xyz = _SRGB_TO_XYZ @ normalize_illuminant_luma(est_illuminant_linear)
    dst_white_xyz = WHITEPOINTS["D65"]

    lms_scale = np.diag((_BRADFORD @ dst_white_xyz) / np.maximum(_BRADFORD @ src_white_xyz, 1e-8))
    cat_xyz = _BRADFORD_INV @ lms_scale @ _BRADFORD
    cat_rgb = _XYZ_TO_SRGB @ cat_xyz @ _SRGB_TO_XYZ

    adapted_lin = np.clip(lin @ cat_rgb.T, 0.0, 1.0)
    return np.round(_linear_to_srgb(adapted_lin)).astype(np.uint8)
