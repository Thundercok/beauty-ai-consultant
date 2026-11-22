import numpy as np

from beauty_ai.chromophores import (
    HEMOGLOBIN_BASIS,
    MELANIN_BASIS,
    SHADING_BASIS,
    decompose_linear_optical_density,
    extract_relative_chromophores_srgb,
)


def _synthesize_linear_skin(
    melanin: np.ndarray,
    hemoglobin: np.ndarray,
    shading: np.ndarray,
    illuminant: np.ndarray,
) -> np.ndarray:
    """Forward Beer-Lambert linear-RGB skin reflectance model."""
    od = (
        melanin[..., None] * MELANIN_BASIS[None, None, :]
        + hemoglobin[..., None] * HEMOGLOBIN_BASIS[None, None, :]
        + shading[..., None] * SHADING_BASIS[None, None, :]
    )
    return np.clip(illuminant[None, None, :] * np.exp(-od), 1e-6, 1.0)


def test_linear_decomposition_is_exact_invariant_to_illuminant_and_shading():
    rng = np.random.default_rng(7)
    h, w = 40, 40
    mask = np.ones((h, w), dtype=bool)

    true_m = 0.6 + rng.normal(0.0, 0.08, size=(h, w))
    true_h = 0.4 + rng.normal(0.0, 0.06, size=(h, w))
    shading_a = 0.3 + np.linspace(0.0, 0.4, w)[None, :] * np.ones((h, 1))
    shading_b = 0.5 + np.linspace(0.4, 0.0, h)[:, None] * np.ones((1, w))

    lin_d65 = _synthesize_linear_skin(true_m, true_h, shading_a, np.array([1.0, 1.0, 1.0]))
    lin_2700k = _synthesize_linear_skin(true_m, true_h, shading_b, np.array([0.95, 0.65, 0.30]))

    res_d65 = decompose_linear_optical_density(lin_d65, mask)
    res_2700k = decompose_linear_optical_density(lin_2700k, mask)

    expected_dm = true_m - np.mean(true_m)
    expected_dh = true_h - np.mean(true_h)

    assert np.allclose(res_d65["melanin_delta"], expected_dm, atol=1e-5)
    assert np.allclose(res_d65["hemoglobin_delta"], expected_dh, atol=1e-5)
    assert np.allclose(res_d65["melanin_delta"], res_2700k["melanin_delta"], atol=1e-5)
    assert np.allclose(res_d65["hemoglobin_delta"], res_2700k["hemoglobin_delta"], atol=1e-5)


def test_pure_melanin_and_hemoglobin_spots_have_no_crosstalk_or_sign_flip():
    h, w = 30, 30
    mask = np.ones((h, w), dtype=bool)
    m = np.full((h, w), 0.5)
    hemo = np.full((h, w), 0.3)
    shading = np.full((h, w), 0.4)

    # Melanin spot (freckle/melasma) in top-left; erythema spot in bottom-right
    m[4:10, 4:10] += 0.25
    hemo[18:24, 18:24] += 0.25

    lin = _synthesize_linear_skin(m, hemo, shading, np.array([1.0, 0.8, 0.5]))
    res = decompose_linear_optical_density(lin, mask)

    # Melanin spot is strictly positive in melanin_delta and ~0 in hemoglobin_delta
    assert float(np.mean(res["melanin_delta"][4:10, 4:10])) > 0.20
    assert abs(float(np.mean(res["hemoglobin_delta"][4:10, 4:10])) - float(np.mean(res["hemoglobin_delta"][0:3, 0:3]))) < 1e-5

    # Erythema spot is strictly positive in hemoglobin_delta and ~0 in melanin_delta
    assert float(np.mean(res["hemoglobin_delta"][18:24, 18:24])) > 0.20
    assert abs(float(np.mean(res["melanin_delta"][18:24, 18:24])) - float(np.mean(res["melanin_delta"][0:3, 0:3]))) < 1e-5


def test_srgb_wrapper_rejects_clipped_highlights():
    img = np.full((20, 20, 3), [190, 145, 115], dtype=np.uint8)
    img[0:5, 0:5] = [255, 250, 240]  # clipped glare
    mask = np.ones((20, 20), dtype=np.uint8) * 255
    res = extract_relative_chromophores_srgb(img, mask, clip_threshold=245)
    assert res["pixel_count"] == 20 * 20 - 25
    assert np.all(res["valid_mask"][0:5, 0:5] == False)  # noqa: E712
