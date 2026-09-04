import numpy as np

from makeup_app.src.bradford_cat import adapt_lab_bradford, adapt_xyz_bradford, bradford_d50_to_d65
from makeup_app.src.product_matcher import ciede2000


def test_bradford_maps_reference_white_to_reference_white():
    adapted = adapt_xyz_bradford([0.96422, 1.0, 0.82521], "D50", "D65")
    assert np.allclose(adapted, [0.95047, 1.0, 1.08883], atol=2e-5)
    assert np.allclose(bradford_d50_to_d65([100.0, 0.0, 0.0]), [100.0, 0.0, 0.0], atol=1e-6)


def test_bradford_is_identity_for_matching_illuminants():
    lab = np.array([[42.0, 18.0, -11.0], [78.0, -4.0, 25.0]])
    assert np.allclose(adapt_lab_bradford(lab, "D65", "D65"), lab)


def test_ciede2000_matches_a_published_reference_pair():
    # Sharma et al.'s CIEDE2000 supplementary reference data, pair 1.
    delta_e = ciede2000(np.array([50.0, 2.6772, -79.7751]), np.array([[50.0, 0.0, -82.7485]]))
    assert np.allclose(delta_e, [2.0425], atol=1e-4)
