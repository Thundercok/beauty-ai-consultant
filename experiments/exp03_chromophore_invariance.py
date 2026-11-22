"""Experiment 03: Illumination-invariance benchmark for relative Melanin & Hemoglobin maps.

Tests whether linear-RGB Beer-Lambert fixed-basis decomposition (`beauty_ai.chromophores`)
produces lighting-invariant spatial melanin & hemoglobin maps on a real 8-bit portrait
(`data/sample_face.jpg`) relit across 2700K, 4000K, 6500K (D65), and 8000K, compared against:
  1. Legacy Gamma-sRGB Log Ratios (`100*log10(255/R)` and `100*log10(R/G)` centered)
  2. Legacy Unconstrained sRGB FastICA (2-component ICA on gamma sRGB optical density)
  3. Linear-RGB Beer-Lambert Fixed-Basis (`B^{-1} Delta d` with clipping rejection)

Metrics (computed over the shared unclipped valid skin mask vs. 6500K reference maps):
  - Pearson correlation (r) for Melanin and Hemoglobin spatial maps (higher = more invariant;
    negative r reveals a sign flip!)
  - Normalized RMSE (NRMSE = RMSE / std(ref)) for Melanin and Hemoglobin maps (lower = better)
"""

from __future__ import annotations

import cv2
import numpy as np

from beauty_ai.chromophores import extract_relative_chromophores_srgb
from beauty_ai.cli import extract_face_mesh
from beauty_ai.product_matcher import _linear_to_srgb, _srgb_to_linear
from beauty_ai.skin_roi_v2 import extract_skin_cielab_v2

ILLUMINANT_GAINS_LINEAR: dict[str, np.ndarray] = {
    "2700K_warm_lamp": np.array([1.38, 0.94, 0.44]),
    "4000K_office": np.array([1.14, 0.99, 0.72]),
    "6500K_D65": np.array([1.00, 1.00, 1.00]),
    "8000K_cool_shade": np.array([0.92, 1.00, 1.15]),
}


def relight_rgb_linear(img_rgb: np.ndarray, gains_linear: np.ndarray) -> np.ndarray:
    """Relight an 8-bit sRGB portrait in linear RGB with 0.85 exposure headroom."""
    lin = _srgb_to_linear(img_rgb)
    lit_lin = np.clip(lin * gains_linear[None, None, :] * 0.85, 0.0, 1.0)
    return np.round(_linear_to_srgb(lit_lin)).astype(np.uint8)


def legacy_gamma_srgb_maps(img_rgb: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Centered pixel-wise legacy indices from `face_analysis.py` on gamma-encoded sRGB."""
    valid = mask > 0
    pixels = img_rgb[valid].astype(float) + 1.0
    red, green = pixels[:, 0], pixels[:, 1]
    m_vals = 100.0 * np.log10(255.0 / red)
    h_vals = 100.0 * np.log10(red / green)
    m_map = np.zeros(mask.shape, dtype=np.float32)
    h_map = np.zeros(mask.shape, dtype=np.float32)
    m_map[valid] = (m_vals - np.mean(m_vals)).astype(np.float32)
    h_map[valid] = (h_vals - np.mean(h_vals)).astype(np.float32)
    return m_map, h_map


def legacy_srgb_fastica_maps(img_rgb: np.ndarray, mask: np.ndarray, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    """Faithful NumPy reproduction of legacy 2-component sRGB optical-density FastICA."""
    valid = mask > 0
    eps = 1e-5
    rgb01 = np.clip(img_rgb[valid].astype(float) / 255.0, eps, 1.0)
    od = -np.log10(rgb01)
    x = od - np.mean(od, axis=0, keepdims=True)

    # Whiten to 2 components via SVD
    cov = (x.T @ x) / len(x)
    eigvals, eigvecs = np.linalg.eigh(cov)
    order = np.argsort(eigvals)[::-1][:2]
    vals = np.maximum(eigvals[order], 1e-12)
    vecs = eigvecs[:, order]
    whiten = (vecs / np.sqrt(vals)).T  # (2, 3)
    dewhiten = vecs * np.sqrt(vals)  # (3, 2)
    z = x @ whiten.T  # (N, 2)

    # Symmetric FastICA (logcosh nonlinearity)
    rng = np.random.default_rng(seed)
    w = rng.normal(size=(2, 2))
    u, _, vt = np.linalg.svd(w)
    w = u @ vt
    for _ in range(100):
        wx = z @ w.T
        g = np.tanh(wx)
        g_prime = 1.0 - g * g
        w_new = (g.T @ z) / len(z) - np.mean(g_prime, axis=0)[:, None] * w
        u, _, vt = np.linalg.svd(w_new)
        w_new = u @ vt
        if np.max(np.abs(np.abs(np.sum(w_new * w, axis=1)) - 1.0)) < 1e-6:
            w = w_new
            break
        w = w_new

    sources = z @ w.T  # (N, 2)
    mixing = dewhiten @ w.T  # (3, 2)

    # Legacy heuristic: Melanin has higher B/R ratio in mixing column
    b_to_r_0 = mixing[2, 0] / (mixing[0, 0] + eps)
    b_to_r_1 = mixing[2, 1] / (mixing[0, 1] + eps)
    m_idx, h_idx = (0, 1) if b_to_r_0 > b_to_r_1 else (1, 0)

    def _minmax(v: np.ndarray) -> np.ndarray:
        return (v - np.min(v)) / (np.ptp(v) + eps)

    m_map = np.zeros(mask.shape, dtype=np.float32)
    h_map = np.zeros(mask.shape, dtype=np.float32)
    m_map[valid] = _minmax(sources[:, m_idx]).astype(np.float32)
    h_map[valid] = _minmax(sources[:, h_idx]).astype(np.float32)
    return m_map, h_map


def compare_maps(ref: np.ndarray, test: np.ndarray, mask: np.ndarray) -> tuple[float, float]:
    """Return (Pearson r, NRMSE = RMSE / std(ref)) on the shared mask."""
    a = ref[mask].astype(float)
    b = test[mask].astype(float)
    corr = float(np.corrcoef(a, b)[0, 1])
    nrmse = float(np.sqrt(np.mean((a - b) ** 2)) / (np.std(a) + 1e-12))
    return corr, nrmse


def main() -> None:
    img_bgr = cv2.imread("data/sample_face.jpg")
    if img_bgr is None:
        raise FileNotFoundError("Could not read data/sample_face.jpg")
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    points = extract_face_mesh(img_rgb)
    base_skin_mask = extract_skin_cielab_v2(img_bgr, points)["mask"] > 0

    relit_images = {name: relight_rgb_linear(img_rgb, gains) for name, gains in ILLUMINANT_GAINS_LINEAR.items()}

    # Shared unclipped/non-dark mask across all illuminants for strictly apples-to-apples evaluation
    shared_mask = base_skin_mask.copy()
    for rgb in relit_images.values():
        shared_mask &= (np.max(rgb, axis=-1) < 245) & (np.min(rgb, axis=-1) > 12)

    print(f"Portrait: data/sample_face.jpg | Shared valid skin pixels across all 4 lights: {np.count_nonzero(shared_mask):,}\n")

    # Compute 6500K D65 references for each method
    ref_img = relit_images["6500K_D65"]
    refs = {
        "Legacy sRGB Log": legacy_gamma_srgb_maps(ref_img, shared_mask),
        "Legacy sRGB FastICA": legacy_srgb_fastica_maps(ref_img, shared_mask),
        "Linear Beer-Lambert": (
            extract_relative_chromophores_srgb(ref_img, shared_mask)["melanin_delta"],
            extract_relative_chromophores_srgb(ref_img, shared_mask)["hemoglobin_delta"],
        ),
    }

    header = (
        f"{'Illuminant':<17} | {'Method':<20} | "
        f"{'Mel r':>7} {'Mel NRMSE':>10} | {'Hemo r':>7} {'Hemo NRMSE':>10}"
    )
    print(header)
    print("-" * len(header))

    for ill_name, lit_rgb in relit_images.items():
        outputs = {
            "Legacy sRGB Log": legacy_gamma_srgb_maps(lit_rgb, shared_mask),
            "Legacy sRGB FastICA": legacy_srgb_fastica_maps(lit_rgb, shared_mask),
            "Linear Beer-Lambert": (
                extract_relative_chromophores_srgb(lit_rgb, shared_mask)["melanin_delta"],
                extract_relative_chromophores_srgb(lit_rgb, shared_mask)["hemoglobin_delta"],
            ),
        }
        for method, (m_map, h_map) in outputs.items():
            ref_m, ref_h = refs[method]
            m_r, m_nrmse = compare_maps(ref_m, m_map, shared_mask)
            h_r, h_nrmse = compare_maps(ref_h, h_map, shared_mask)
            print(
                f"{ill_name:<17} | {method:<20} | "
                f"{m_r:7.4f} {m_nrmse:10.4f} | {h_r:7.4f} {h_nrmse:10.4f}"
            )
        print("-" * len(header))


if __name__ == "__main__":
    main()
