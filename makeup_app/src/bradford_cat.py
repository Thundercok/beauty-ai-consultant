"""Colour-space conversions and Bradford chromatic adaptation.

All public Lab values use the conventional ``L*, a*, b*`` scale.  Product
catalogue colours should only be adapted when their source illuminant is known;
an sRGB hex value is already D65-referenced by definition.
"""

from __future__ import annotations

import numpy as np


WHITEPOINTS = {
    "D50": np.array([0.96422, 1.00000, 0.82521]),
    "D65": np.array([0.95047, 1.00000, 1.08883]),
}

_BRADFORD = np.array(
    [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]]
)
_BRADFORD_INV = np.linalg.inv(_BRADFORD)


def _whitepoint(name: str) -> np.ndarray:
    try:
        return WHITEPOINTS[name.upper()]
    except KeyError as exc:
        choices = ", ".join(WHITEPOINTS)
        raise ValueError(f"Unsupported illuminant '{name}'. Use one of: {choices}.") from exc


def _as_color_array(values: np.ndarray | list[float]) -> tuple[np.ndarray, bool]:
    array = np.asarray(values, dtype=float)
    if array.shape == (3,):
        return array[None, :], True
    if array.ndim < 2 or array.shape[-1] != 3:
        raise ValueError("Expected one colour with shape (3,) or an array with final dimension 3.")
    return array, False


def adapt_xyz_bradford(
    xyz: np.ndarray | list[float], source_illuminant: str = "D50", target_illuminant: str = "D65"
) -> np.ndarray:
    """Adapt XYZ tristimulus values with the Bradford chromatic-adaptation transform."""
    colors, squeezed = _as_color_array(xyz)
    source = _whitepoint(source_illuminant)
    target = _whitepoint(target_illuminant)
    if source_illuminant.upper() == target_illuminant.upper():
        result = colors.copy()
    else:
        lms_scale = np.diag((_BRADFORD @ target) / (_BRADFORD @ source))
        matrix = _BRADFORD_INV @ lms_scale @ _BRADFORD
        result = colors @ matrix.T
    return result[0] if squeezed else result


def lab_to_xyz(lab: np.ndarray | list[float], illuminant: str = "D65") -> np.ndarray:
    """Convert CIELAB values to XYZ, using the supplied reference white."""
    colors, squeezed = _as_color_array(lab)
    l_star, a_star, b_star = colors[..., 0], colors[..., 1], colors[..., 2]
    fy = (l_star + 16.0) / 116.0
    fx = fy + a_star / 500.0
    fz = fy - b_star / 200.0
    delta = 6.0 / 29.0

    def f_inv(component: np.ndarray) -> np.ndarray:
        return np.where(component > delta, component**3, 3.0 * delta**2 * (component - 4.0 / 29.0))

    xyz = np.stack((f_inv(fx), f_inv(fy), f_inv(fz)), axis=-1) * _whitepoint(illuminant)
    return xyz[0] if squeezed else xyz


def xyz_to_lab(xyz: np.ndarray | list[float], illuminant: str = "D65") -> np.ndarray:
    """Convert XYZ tristimulus values to CIELAB using the supplied reference white."""
    colors, squeezed = _as_color_array(xyz)
    normalized = colors / _whitepoint(illuminant)
    delta = 6.0 / 29.0
    f = np.where(normalized > delta**3, np.cbrt(np.clip(normalized, 0.0, None)), normalized / (3.0 * delta**2) + 4.0 / 29.0)
    lab = np.stack((116.0 * f[..., 1] - 16.0, 500.0 * (f[..., 0] - f[..., 1]), 200.0 * (f[..., 1] - f[..., 2])), axis=-1)
    return lab[0] if squeezed else lab


def adapt_lab_bradford(
    lab: np.ndarray | list[float], source_illuminant: str = "D50", target_illuminant: str = "D65"
) -> np.ndarray:
    """Adapt Lab values by converting Lab -> XYZ -> Bradford CAT -> Lab."""
    xyz = lab_to_xyz(lab, source_illuminant)
    adapted_xyz = adapt_xyz_bradford(xyz, source_illuminant, target_illuminant)
    return xyz_to_lab(adapted_xyz, target_illuminant)


def bradford_d50_to_d65(lab_d50: np.ndarray | list[float]) -> np.ndarray:
    """Convenience wrapper for D50 product-catalogue Lab values."""
    return adapt_lab_bradford(lab_d50, "D50", "D65")

