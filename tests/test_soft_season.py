import numpy as np

from beauty_ai.face_analysis import classify_season
from beauty_ai.product_matcher import blend_target_colors_lab, ciede2000, hex_to_lab


def test_soft_season_has_no_cliff_across_warm_cool_boundary():
    # Sweep b* across the old hard cliff (b* = 11.0) in 0.5-unit steps
    b_values = np.linspace(9.0, 15.0, 13)
    prev_lab = None
    prev_warm = None

    for b_val in b_values:
        metrics = {"L_star": 65.0, "a_star": 9.5, "b_star": float(b_val), "ITA_deg": 40.0}
        season = classify_season(metrics)
        assert abs(sum(season["probabilities"].values()) - 1.0) < 1e-6

        targets = blend_target_colors_lab(season["probabilities"])
        lip_lab = hex_to_lab(targets["lip"])

        if prev_lab is not None:
            step_de00 = float(ciede2000(prev_lab, lip_lab[None, :])[0])
            assert step_de00 < 1.2, f"Discontinuous target lip jump ({step_de00:.2f} DE00) at b*={b_val}"
            assert abs(season["warm_probability"] - prev_warm) < 0.10

        prev_lab = lip_lab
        prev_warm = season["warm_probability"]


def test_soft_season_identifies_clear_warm_deep_and_cool_light_archetypes():
    deep_warm = classify_season({"L_star": 46.0, "a_star": 10.5, "b_star": 18.5, "ITA_deg": -12.0})
    assert deep_warm["season"] == "Deep Autumn"
    assert deep_warm["warm_probability"] > 0.75

    light_cool = classify_season({"L_star": 74.0, "a_star": 11.0, "b_star": 10.5, "ITA_deg": 66.0})
    assert light_cool["season"] == "Light Summer"
    assert light_cool["warm_probability"] < 0.25
