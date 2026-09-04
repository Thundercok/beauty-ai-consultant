from makeup_app.src.advice_engine import SEASON_COLOR_PALETTES, SHAPE_CONTOUR_RULES, advice_coverage, get_asian_advice


def test_advice_engine_covers_every_shape_season_pair():
    assert len(advice_coverage()) == 72
    assert len(SHAPE_CONTOUR_RULES) == 6
    assert len(SEASON_COLOR_PALETTES) == 12
    advice = get_asian_advice("Round", "Warm Autumn")
    assert advice["target_colors"]["lip"] == "#B85D4C"
    assert "45°" in advice["blush"]
