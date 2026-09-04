import numpy as np

from makeup_app.src.kubelka_munk import kubelka_munk_lip_blend


def test_km_zero_thickness_keeps_substrate():
    substrate = np.array([118.0, 73.0, 76.0])
    rendered = kubelka_munk_lip_blend(substrate, [198.0, 73.0, 84.0], thickness=0.0)
    assert np.allclose(rendered, substrate, atol=0.2)


def test_km_opaque_layer_moves_toward_product_colour():
    substrate = np.array([120.0, 85.0, 78.0])
    product = np.array([185.0, 63.0, 72.0])
    sheer = kubelka_munk_lip_blend(substrate, product, texture_type="Juicy Tint")
    opaque = kubelka_munk_lip_blend(substrate, product, texture_type="Lip Clay / Mud")
    assert np.linalg.norm(opaque - product) < np.linalg.norm(sheer - product)
    assert np.all((opaque >= 0.0) & (opaque <= 255.0))

