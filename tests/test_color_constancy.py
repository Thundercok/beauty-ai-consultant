import numpy as np

from beauty_ai.color_constancy import (
    angular_error_deg,
    apply_bradford_white_balance,
    planckian_linear_rgb,
    project_to_planckian_locus,
)


def test_planckian_locus_ordering_and_daylight_neutrality():
    warm = planckian_linear_rgb(2700.0)
    daylight = planckian_linear_rgb(6504.0)
    cool = planckian_linear_rgb(8500.0)

    assert warm[0] > warm[1] > warm[2]
    assert cool[2] > cool[1] > cool[0]
    assert angular_error_deg(daylight, np.array([1.0, 1.0, 1.0])) < 1.5


def test_planckian_projection_recovers_temperatures_and_rejects_off_locus_tint():
    for true_cct in (2700.0, 4000.0, 6500.0, 8000.0):
        ill = planckian_linear_rgb(true_cct)
        proj = project_to_planckian_locus(ill)
        assert abs(proj["cct_kelvin"] - true_cct) < 60.0
        assert proj["off_locus_deg"] < 0.2

    # Off-locus magenta tint (R and B elevated, G suppressed) should be flagged and projected back
    magenta = np.array([1.35, 0.70, 1.35])
    proj_mag = project_to_planckian_locus(magenta)
    assert proj_mag["off_locus_deg"] > 10.0
    assert angular_error_deg(proj_mag["illuminant_linear"], np.array([1.0, 1.0, 1.0])) < 5.0


def test_bradford_white_balance_is_identity_for_d65_and_inverts_warm_lamp():
    from beauty_ai.bradford_cat import _BRADFORD, _BRADFORD_INV, WHITEPOINTS
    from beauty_ai.color_constancy import _SRGB_TO_XYZ, _XYZ_TO_SRGB
    from beauty_ai.product_matcher import _linear_to_srgb, _srgb_to_linear

    skin_rgb = np.full((16, 16, 3), [194, 148, 114], dtype=np.uint8)
    identity = apply_bradford_white_balance(skin_rgb, np.array([1.0, 1.0, 1.0]))
    assert np.allclose(identity, skin_rgb, atol=1)

    # Forward Bradford relighting (D65 -> 2700K) should be inverted to < 0.5 deg
    warm_ill = planckian_linear_rgb(2700.0)
    src_xyz = WHITEPOINTS["D65"]
    dst_xyz = _SRGB_TO_XYZ @ warm_ill
    fwd_xyz = _BRADFORD_INV @ np.diag((_BRADFORD @ dst_xyz) / (_BRADFORD @ src_xyz)) @ _BRADFORD
    fwd_rgb = _XYZ_TO_SRGB @ fwd_xyz @ _SRGB_TO_XYZ

    lit_lin = np.clip((_srgb_to_linear(skin_rgb) @ fwd_rgb.T) * 0.75, 0.0, 1.0)
    lit_srgb = np.round(_linear_to_srgb(lit_lin)).astype(np.uint8)
    recovered = apply_bradford_white_balance(lit_srgb, warm_ill)

    rec_lin = _srgb_to_linear(recovered).mean(axis=(0, 1))
    orig_lin = _srgb_to_linear(skin_rgb).mean(axis=(0, 1))
    assert angular_error_deg(rec_lin, orig_lin) < 0.5
