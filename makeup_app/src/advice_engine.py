"""Compositional 6-shape × 12-season K-beauty advice engine."""

from __future__ import annotations


SHAPE_CONTOUR_RULES = {
    "Oval": {"contour": "Nhấn thật mỏng dưới gò má và sát chân tóc để giữ tỷ lệ cân đối.", "blush": "Tán từ tâm gò má chếch nhẹ ra thái dương, không kéo thấp quá mũi.", "liner": "Kẻ đuôi ngắn, nâng rất nhẹ theo đường mi tự nhiên."},
    "Round": {"contour": "Tạo bóng ở thái dương, dưới gò má và góc hàm để tăng chiều dọc.", "blush": "Đánh chéo 45° từ má ngoài hướng lên thái dương; tránh vòng tròn ở giữa má.", "liner": "Kéo đuôi liner mảnh 2–3 mm để tạo hiệu ứng dài hơn."},
    "Square": {"contour": "Tán màu taupe mềm ở bốn góc trán và quai hàm, tránh đường khối sắc cạnh.", "blush": "Đặt má hồng cao hơn gò má rồi tán theo oval mềm hướng ra ngoài.", "liner": "Làm mềm viền mắt bằng phấn sát chân mi thay vì cánh liner góc cạnh."},
    "Heart": {"contour": "Nhẹ tay ở thái dương và chóp cằm; ưu tiên cân bằng phần hàm dưới nhỏ.", "blush": "Tán ngang nhẹ ở phần má giữa–ngoài, giữ trọng tâm thấp hơn thái dương một chút.", "liner": "Nhấn đuôi mi nâu mềm để cân bằng vùng trán rộng."},
    "Oblong": {"contour": "Tán mờ sát chân tóc và dưới cằm để rút ngắn cảm giác chiều dài khuôn mặt.", "blush": "Đánh ngang qua phần gò má, giới hạn độ kéo lên thái dương.", "liner": "Kẻ đuôi ngắn, mở rộng theo chiều ngang thay vì hất cao."},
    "Diamond": {"contour": "Tạo bóng rất nhẹ ở thái dương và chóp cằm, giữ phần giữa gò má thoáng sáng.", "blush": "Đặt màu hơi trước tâm gò má rồi tán ngang mềm để cân bằng phần má cao.", "liner": "Dùng mắt khói mềm hoặc liner mảnh kéo ngang để làm dịu góc gò má."},
}

SEASON_COLOR_PALETTES = {
    "Light Spring": {"undertone": "warm", "lip": "coral pink trong", "lip_hex": "#D9786D", "blush": "apricot-pink sáng", "blush_hex": "#F0ACA1", "eye": "champagne, peach và nâu mật ong nhạt", "eye_hex": "#D7AE87", "contour_tone": "nâu be trung tính sáng", "avoid": "màu mận quá trầm hoặc xám tro"},
    "Warm Spring": {"undertone": "warm", "lip": "coral đỏ tươi vừa", "lip_hex": "#D65F52", "blush": "peach ấm", "blush_hex": "#EE9B82", "eye": "gold champagne, camel và cam đào", "eye_hex": "#C9925E", "contour_tone": "nâu caramel nhẹ", "avoid": "mauve lạnh, xám than và burgundy nặng"},
    "Bright Spring": {"undertone": "warm", "lip": "watermelon coral rõ màu", "lip_hex": "#E05F61", "blush": "coral tươi", "blush_hex": "#F28C7D", "eye": "ivory, gold sáng và nâu ấm sạch", "eye_hex": "#D99A54", "contour_tone": "nâu mật ong trong", "avoid": "màu dusty, beige xỉn hoặc son nâu tím"},
    "Light Summer": {"undertone": "cool", "lip": "rose pink dịu", "lip_hex": "#C77886", "blush": "baby pink lạnh", "blush_hex": "#E7A7B5", "eye": "taupe sáng, lavender và pearl", "eye_hex": "#B5A3B4", "contour_tone": "taupe xám lạnh rất nhạt", "avoid": "cam gạch, vàng mustard và nâu quá đậm"},
    "Cool Summer": {"undertone": "cool", "lip": "mauve rose trung tính lạnh", "lip_hex": "#B76D83", "blush": "rose mauve", "blush_hex": "#D791A4", "eye": "mauve taupe, hồng khói và bạc ngọc trai", "eye_hex": "#9C8691", "contour_tone": "taupe xám lạnh", "avoid": "coral neon, vàng cam và bronzer đỏ"},
    "Soft Summer": {"undertone": "cool", "lip": "muted berry-rose", "lip_hex": "#A96E7A", "blush": "dusty rose", "blush_hex": "#CE919D", "eye": "rose-brown, slate taupe và plum xám", "eye_hex": "#8F777B", "contour_tone": "taupe xám nâu dịu", "avoid": "màu quá bão hòa, đen tuyền hoặc cam tươi"},
    "Warm Autumn": {"undertone": "warm", "lip": "terracotta rose", "lip_hex": "#B85D4C", "blush": "apricot đất", "blush_hex": "#D98769", "eye": "camel, olive, đồng và nâu quế", "eye_hex": "#9A6C43", "contour_tone": "nâu vàng ấm", "avoid": "hồng baby lạnh, bạc lạnh và fuchsia"},
    "Soft Autumn": {"undertone": "warm", "lip": "nude rose trầm mềm", "lip_hex": "#B77A6B", "blush": "beige peach muted", "blush_hex": "#D8A08A", "eye": "taupe ấm, olive nhạt và nâu sữa", "eye_hex": "#9B8370", "contour_tone": "nâu be trung tính ấm", "avoid": "màu neon, trắng tương phản cao hoặc đỏ lạnh"},
    "Deep Autumn": {"undertone": "warm", "lip": "brick red hoặc cinnamon", "lip_hex": "#933F37", "blush": "burnt apricot", "blush_hex": "#B96652", "eye": "espresso, bronze, olive đậm và copper", "eye_hex": "#66422D", "contour_tone": "nâu chocolate ấm", "avoid": "pastel băng giá, hồng kẹo ngọt hoặc bạc sáng"},
    "Bright Winter": {"undertone": "cool", "lip": "berry đỏ trong", "lip_hex": "#B94055", "blush": "cool raspberry", "blush_hex": "#D8657A", "eye": "charcoal sạch, bạc và plum rõ nét", "eye_hex": "#5D4B58", "contour_tone": "taupe lạnh sạch", "avoid": "beige vàng xỉn, cam đất và màu muted"},
    "Cool Winter": {"undertone": "cool", "lip": "cranberry hoặc ruby lạnh", "lip_hex": "#A63F58", "blush": "rose lạnh", "blush_hex": "#CC6F86", "eye": "charcoal, navy, mauve lạnh và pearl", "eye_hex": "#4C4655", "contour_tone": "taupe xám lạnh", "avoid": "orange-red, camel vàng và bronze đỏ"},
    "Deep Winter": {"undertone": "cool", "lip": "wine berry sâu", "lip_hex": "#7D3549", "blush": "berry rose trầm", "blush_hex": "#A95D73", "eye": "espresso lạnh, plum đậm và charcoal", "eye_hex": "#493B43", "contour_tone": "nâu-taupe lạnh sâu", "avoid": "pastel phấn, cam đào và vàng sáng"},
}


def compose_advice(shape_rule: dict, palette: dict) -> dict:
    """Merge independently authored shape placement and season colour rules."""
    return {
        "contour": f"{shape_rule['contour']} Chọn {palette['contour_tone']}.",
        "blush": f"Dùng {palette['blush']} ({palette['blush_hex']}). {shape_rule['blush']}",
        "lip": f"Ưu tiên {palette['lip']} ({palette['lip_hex']}); điều chỉnh độ phủ theo sắc tố môi nền.",
        "eyes": f"Phối {palette['eye']}. {shape_rule['liner']}",
        "avoid": [f"Tránh {palette['avoid']}", "Tạo khối quá đậm hoặc có ánh cam không phù hợp undertone", "Đánh má hồng thấp làm nặng tỷ lệ khuôn mặt"],
        "target_colors": {"lip": palette["lip_hex"], "blush": palette["blush_hex"], "eyeshadow": palette["eye_hex"]},
    }


def get_asian_advice(shape: str, season: str) -> dict:
    """Return specific advice for every supported face-shape/season pairing."""
    if shape not in SHAPE_CONTOUR_RULES:
        raise ValueError(f"Unsupported face shape '{shape}'.")
    if season not in SEASON_COLOR_PALETTES:
        raise ValueError(f"Unsupported personal-color season '{season}'.")
    return compose_advice(SHAPE_CONTOUR_RULES[shape], SEASON_COLOR_PALETTES[season])


def advice_coverage() -> set[tuple[str, str]]:
    """Expose the generated 72-pair coverage for testing and reporting."""
    return {(shape, season) for shape in SHAPE_CONTOUR_RULES for season in SEASON_COLOR_PALETTES}

