#!/usr/bin/env python3
"""
beauty-ai-consultant CLI 🌟
Single All-in-One Command Line Tool for Personal Color & Face Shape Makeup AI Consultation.

Usage:
    python cli.py --image path/to/selfie.jpg [--occasion office] [--texture oily] [--output-json report.json]
"""

import argparse
import json
import math
import os
import sys
import cv2
import numpy as np
import pandas as pd
import mediapipe as mp

# ==============================================================================
# PIPELINE MODULES
# ==============================================================================

def skin_roi_gray_world_wb(img_bgr, skin_mask=None):
    img_float = img_bgr.astype(np.float32)
    b, g, r = cv2.split(img_float)
    if skin_mask is not None and np.sum(skin_mask > 0) > 100:
        mask_bool = skin_mask > 0
        avg_b, avg_g, avg_r = np.mean(b[mask_bool]), np.mean(g[mask_bool]), np.mean(r[mask_bool])
    else:
        avg_b, avg_g, avg_r = np.mean(b), np.mean(g), np.mean(r)
    r_corrected = np.clip(r * (avg_g / (avg_r + 1e-6)), 0, 255)
    b_corrected = np.clip(b * (avg_g / (avg_b + 1e-6)), 0, 255)
    return cv2.merge([b_corrected, g, r_corrected]).astype(np.uint8)

def extract_face_mesh(img_rgb):
    mp_face_mesh = mp.solutions.face_mesh
    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5
    ) as face_mesh:
        results = face_mesh.process(img_rgb)
    if not results.multi_face_landmarks:
        raise ValueError("❌ No face detected in image.")
    landmarks = results.multi_face_landmarks[0]
    h, w = img_rgb.shape[:2]
    points = np.array([(lm.x * w, lm.y * h, lm.z * w) for lm in landmarks.landmark])
    return points

def classify_face_shape(points):
    d = lambda i, j: np.linalg.norm(points[i, :2] - points[j, :2])
    r1 = d(10, 152) / (d(234, 454) + 1e-6)
    r2 = d(172, 397) / (d(234, 454) + 1e-6)
    r3 = d(338, 297) / (d(172, 397) + 1e-6)
    
    shapes_params = {
        "Oval":    {"mu": [1.20, 0.80, 1.00], "sigma": [0.08, 0.05, 0.08]},
        "Round":   {"mu": [1.02, 0.90, 1.00], "sigma": [0.06, 0.05, 0.08]},
        "Square":  {"mu": [1.08, 0.94, 1.00], "sigma": [0.06, 0.04, 0.08]},
        "Heart":   {"mu": [1.18, 0.70, 1.25], "sigma": [0.08, 0.06, 0.10]},
        "Oblong":  {"mu": [1.40, 0.85, 1.00], "sigma": [0.10, 0.06, 0.08]},
        "Diamond": {"mu": [1.18, 0.72, 0.92], "sigma": [0.08, 0.06, 0.08]}
    }
    r_vec = np.array([r1, r2, r3])
    scores = {}
    for shape, p in shapes_params.items():
        mu, sigma = np.array(p["mu"]), np.array(p["sigma"])
        diff = (r_vec - mu) / sigma
        scores[shape] = np.exp(-0.5 * np.sum(diff ** 2))
    total_score = sum(scores.values()) + 1e-12
    probs = {s: sc / total_score for s, sc in scores.items()}
    sorted_shapes = sorted(probs.items(), key=lambda x: x[1], reverse=True)
    return {
        "primary": sorted_shapes[0][0],
        "secondary": sorted_shapes[1][0],
        "probabilities": probs,
        "ratios": {"r1": r1, "r2": r2, "r3": r3}
    }

def extract_skin_cielab(img_bgr, points):
    h, w = img_bgr.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    centers = [points[151][:2], points[50][:2], points[280][:2]]
    radius = int(min(h, w) * 0.035)
    for c in centers:
        cv2.circle(mask, (int(c[0]), int(c[1])), radius, 255, -1)
    img_lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2Lab)
    skin_pixels_lab = img_lab[mask > 0]
    l_vals = skin_pixels_lab[:, 0] * (100.0 / 255.0)
    a_vals = skin_pixels_lab[:, 1].astype(np.float32) - 128.0
    b_vals = skin_pixels_lab[:, 2].astype(np.float32) - 128.0
    return {
        "L": float(np.median(l_vals)),
        "a": float(np.median(a_vals)),
        "b": float(np.median(b_vals)),
        "mask": mask
    }

def extract_lip_metrics(img_bgr, points):
    h, w = img_bgr.shape[:2]
    inner_coords = points[[13, 14, 78, 308, 82, 312], :2]
    outer_coords = points[[61, 291, 0, 17, 37, 267, 84, 314], :2]
    radius = max(2, int(min(h, w) * 0.015))
    
    inner_mask = np.zeros((h, w), dtype=np.uint8)
    for pt in inner_coords: cv2.circle(inner_mask, (int(pt[0]), int(pt[1])), radius, 255, -1)
    
    outer_mask = np.zeros((h, w), dtype=np.uint8)
    for pt in outer_coords: cv2.circle(outer_mask, (int(pt[0]), int(pt[1])), radius, 255, -1)
    
    img_lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2Lab)
    inner_pixels = img_lab[inner_mask > 0]
    outer_pixels = img_lab[outer_mask > 0]
    
    l_inner = np.median(inner_pixels[:, 0]) * (100.0 / 255.0)
    a_inner = np.median(inner_pixels[:, 1]).astype(np.float32) - 128.0
    b_inner = np.median(inner_pixels[:, 2]).astype(np.float32) - 128.0
    
    l_outer = np.median(outer_pixels[:, 0]) * (100.0 / 255.0)
    lip_darkness_index = float(max(0.0, l_inner - l_outer))
    has_dark_border = l_outer < 43.0 or lip_darkness_index > 5.0
    
    return {
        "lip_base_lab": np.array([l_inner, a_inner, b_inner]),
        "lip_border_L": l_outer,
        "lip_darkness_index": lip_darkness_index,
        "has_dark_lip_border": has_dark_border,
        "coverage_requirement": "Cần che khuyết điểm / Son Lip Clay bùn" if has_dark_border else "Viền môi sáng (Dùng Tint bóng được)",
        "recommended_texture": "Lip Clay / Mud" if has_dark_border else "Juicy Tint"
    }

def compute_skin_metrics(lab_dict, img_bgr, points):
    L_val, a_val, b_val = lab_dict["L"], lab_dict["a"], lab_dict["b"]
    ita_deg = math.degrees(math.atan((L_val - 50.0) / (b_val + 1e-5)))
    if ita_deg > 55.0:      ita_cat = "Very Light (Fitzpatrick I)"
    elif ita_deg > 41.0:    ita_cat = "Light (Fitzpatrick II)"
    elif ita_deg > 28.0:    ita_cat = "Intermediate (Fitzpatrick III)"
    elif ita_deg > 10.0:    ita_cat = "Tan (Fitzpatrick IV)"
    elif ita_deg > -30.0:   ita_cat = "Brown (Fitzpatrick V)"
    else:                   ita_cat = "Dark (Fitzpatrick VI)"
    
    mask = lab_dict["mask"]
    bgr_pixels = img_bgr[mask > 0].astype(np.float32) + 1.0
    b_pix, g_pix, r_pix = bgr_pixels[:, 0], bgr_pixels[:, 1], bgr_pixels[:, 2]
    return {
        "ITA_deg": ita_deg,
        "ITA_category": ita_cat,
        "L_star": L_val,
        "a_star": a_val,
        "b_star": b_val,
        "Melanin_index": float(np.mean(100.0 * np.log10(255.0 / r_pix))),
        "Hemoglobin_index": float(np.mean(100.0 * np.log10(r_pix / g_pix)))
    }

def classify_season(metrics):
    L, a, b, ita = metrics["L_star"], metrics["a_star"], metrics["b_star"], metrics["ITA_deg"]
    is_warm = b > 14.0 or (b / (a + 1e-5)) > 1.1
    is_cool = b < 11.0 or (b / (a + 1e-5)) < 0.95
    is_light = L > 62.0 or ita > 40.0
    is_deep  = L < 50.0 or ita < 20.0
    if is_warm:
        season = "Light Spring" if is_light else ("Deep Autumn" if is_deep else ("Warm Spring" if a > 14.0 else "Warm Autumn"))
    elif is_cool:
        season = "Light Summer" if is_light else ("Deep Winter" if is_deep else ("Cool Winter" if a > 14.0 else "Cool Summer"))
    else:
        season = "Bright Spring" if is_light else ("Soft Autumn" if b >= a else "Soft Summer")
    undertone = "Warm (Golden)" if is_warm else ("Cool (Pink/Blue)" if is_cool else "Neutral")
    return {"season": season, "undertone": undertone}

ADVICE_MATRIX = {
    ("Diamond", "Light Summer"): {
        "contour": "Tạo khối nhẹ góc thái dương & cằm bằng tông Taupe xám lạnh.",
        "blush": "Má hồng tông Muted Rose / Baby Pink dánh ngang gò má trên.",
        "lip": "Son tint bóng mọng nước Muted Fig (Romand Bare Grape #B75B5B / Mauve Whip #A25254).",
        "eyes": "Phấn mắt tông Plum Taupe & nhũ ngọc trai góc mắt inner corner.",
        "avoid": ["Son cam gạch đậm lì kiểu cũ", "Phấn tạo khối tông cam vàng ấm", "Má hồng cam neon"]
    },
    ("Round", "Warm Autumn"): {
        "contour": "Tạo khối viền thái dương, gò má dưới và góc hàm để định hình độ nét.",
        "blush": "Má hồng cam đất Nudy Chip (Romand N02) đánh chéo 45 độ hướng về đường chân tóc.",
        "lip": "Son tint mỏng mượt MLBB Almond Rose (Romand #C86B5A / 3CE Laydown #BA626B).",
        "eyes": "Tông cam đất mờ & nâu cà phê nhấn đuôi mắt.",
        "avoid": ["Đánh má hồng tròn xoe giữa má", "Son hồng cánh sen/hồng baby lạnh", "Highlighter kim tuyến to"]
    }
}

def get_base_advice(shape, season):
    if (shape, season) in ADVICE_MATRIX: return ADVICE_MATRIX[(shape, season)]
    is_warm = "Warm" in season or "Autumn" in season or "Spring" in season
    return {
        "contour": f"Tạo khối nhẹ dọc theo viền hàm {shape.lower()} & dưới gò má.",
        "blush": "Đánh má hồng chéo hướng về thái dương." if shape in ["Round", "Square"] else "Đánh má hồng tán nhẹ tự nhiên.",
        "lip": "MLBB Almond Rose / Warm Fig (#C86B5A)" if is_warm else "Muted Bare Grape / Mauve Rose (#B75B5B)",
        "eyes": "Bảng mắt tông Nâu Cam Đất mờ" if is_warm else "Bảng mắt tông Nâu Khói / Hồng Đất mờ",
        "avoid": ["Tông son lì đậm cũ kỹ", "Đánh khối quá tay", "Màu sắc chọi với undertone da"]
    }

OCCASION_MODIFIERS = {
    "daily":  {"intensity": "Tự nhiên trong trẻo (0.4)", "texture_style": "Glasting Water Tint / Dewy Balm", "eye_depth": "Nhấn nhẹ mi & phấn nhạt"},
    "office": {"intensity": "Thanh lịch chỉn chu (0.6)", "texture_style": "Blur Water Tint / Satin", "eye_depth": "Tạo hốc mắt nhẹ tự nhiên"},
    "glam":   {"intensity": "Nổi bật cuốn hút (1.0)", "texture_style": "Hazy Lip Clay / Glossy Layering", "eye_depth": "Nhấn nhũ mịn & eyeliner đuôi dài"}
}

TEXTURE_MODIFIERS = {
    "oily":        {"prep": "Kem lót kiềm dầu Niacinamide Matte Primer", "setting": "Phấn phủ Translucent Bake Powder vùng T-zone"},
    "dry":         {"prep": "Xịt khoáng cấp ẩm Hyaluronic Mist", "setting": "Xịt khóa nền bóng Dewy Glow Setting Spray"},
    "combination": {"prep": "Kem lót kiềm dầu vùng T-Zone", "setting": "Phấn phủ nhẹ vùng T-Zone"}
}

def resolve_glowup_profile(shape, season, occasion="daily", texture="combination"):
    base = get_base_advice(shape, season)
    occ  = OCCASION_MODIFIERS[occasion]
    tex  = TEXTURE_MODIFIERS[texture]
    return {
        "profile": {"face_shape": shape, "season": season, "occasion": occasion, "texture": texture},
        "techniques": base,
        "execution_parameters": {**occ, **tex}
    }

def hex_to_lab(hex_str):
    hex_str = hex_str.lstrip("#")
    rgb = [int(hex_str[i:i+2], 16) for i in (0, 2, 4)]
    bgr_pixel = np.uint8([[ [rgb[2], rgb[1], rgb[0]] ]])
    lab_pixel = cv2.cvtColor(bgr_pixel, cv2.COLOR_BGR2Lab)[0][0]
    return np.array([lab_pixel[0] * (100.0 / 255.0), float(lab_pixel[1]) - 128.0, float(lab_pixel[2]) - 128.0])

def vectorized_ciede2000(target_lab, db_lab_array):
    L1, a1, b1 = target_lab[0], target_lab[1], target_lab[2]
    L2, a2, b2 = db_lab_array[:, 0], db_lab_array[:, 1], db_lab_array[:, 2]
    C1, C2 = np.sqrt(a1**2 + b1**2), np.sqrt(a2**2 + b2**2)
    C_bar = (C1 + C2) / 2.0
    G = 0.5 * (1.0 - np.sqrt(C_bar**7 / (C_bar**7 + 25**7 + 1e-5)))
    a1_p, a2_p = (1.0 + G) * a1, (1.0 + G) * a2
    C1_p, C2_p = np.sqrt(a1_p**2 + b1**2), np.sqrt(a2_p**2 + b2**2)
    h1_p = np.degrees(np.arctan2(b1, a1_p)) % 360.0
    h2_p = np.degrees(np.arctan2(b2, a2_p)) % 360.0
    dL_p, dC_p = L2 - L1, C2_p - C1_p
    dh_p = h2_p - h1_p
    dh_p = np.where(dh_p > 180.0, dh_p - 360.0, dh_p)
    dh_p = np.where(dh_p < -180.0, dh_p + 360.0, dh_p)
    dH_p = 2.0 * np.sqrt(C1_p * C2_p) * np.sin(np.radians(dh_p / 2.0))
    SL = 1.0 + (0.015 * ((L1 + L2)/2.0 - 50.0)**2) / np.sqrt(20.0 + ((L1 + L2)/2.0 - 50.0)**2)
    SC = 1.0 + 0.045 * ((C1_p + C2_p)/2.0)
    SH = 1.0 + 0.015 * ((C1_p + C2_p)/2.0)
    return np.sqrt((dL_p/SL)**2 + (dC_p/SC)**2 + (dH_p/SH)**2)

def match_products(target_hex, db_df, product_type="lipstick", lip_base_lab=None, top_k=3):
    df_filtered = db_df[db_df["product_type"] == product_type].copy()
    if len(df_filtered) == 0: return []
    target_lab = hex_to_lab(target_hex)
    db_labs = np.array([hex_to_lab(h) for h in df_filtered["hex_color"]])
    if lip_base_lab is not None and product_type == "lipstick":
        rendered_labs = 0.3 * lip_base_lab + 0.7 * db_labs
        df_filtered["delta_e"] = vectorized_ciede2000(target_lab, rendered_labs)
    else:
        df_filtered["delta_e"] = vectorized_ciede2000(target_lab, db_labs)
    top_matches = df_filtered.sort_values("delta_e").head(top_k)
    results = []
    for _, row in top_matches.iterrows():
        de = row["delta_e"]
        tier = "Exact Match" if de < 1.0 else ("Great Match" if de < 2.0 else "Close Alternative")
        tex = row["texture_type"] if "texture_type" in row else "Standard"
        results.append({
            "brand": row["brand"], "name": row["product_name"], "shade": row["shade_name"],
            "texture": tex, "hex": row["hex_color"], "delta_e": round(de, 2), "match_tier": tier
        })
    return results

# ==============================================================================
# MAIN CLI CONTROLLER
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="beauty-ai-consultant All-in-One CLI Tool 🌟",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--image", "-i", type=str, required=True, help="Path to input selfie photograph")
    parser.add_argument("--occasion", "-o", type=str, choices=["daily", "office", "glam"], default="office", help="Target occasion vibe")
    parser.add_argument("--texture", "-t", type=str, choices=["oily", "dry", "combination"], default="combination", help="User skin texture type")
    parser.add_argument("--db", type=str, default="makeup_app/data/product_database.csv", help="Path to product database CSV")
    parser.add_argument("--output-json", type=str, default=None, help="Optional file path to export JSON report")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.image):
        print(f"❌ Error: Image file not found at '{args.image}'")
        sys.exit(1)
        
    if not os.path.exists(args.db):
        print(f"⚠️ Warning: Database file not found at '{args.db}'. Looking relative to script...")
        script_dir = os.path.dirname(os.path.abspath(__file__))
        alt_db = os.path.join(script_dir, "makeup_app/data/product_database.csv")
        if os.path.exists(alt_db):
            args.db = alt_db
        else:
            print(f"❌ Error: Database CSV missing. Please ensure product_database.csv exists.")
            sys.exit(1)

    img_bgr = cv2.imread(args.image)
    if img_bgr is None:
        print(f"❌ Error: Failed to read image '{args.image}'")
        sys.exit(1)
        
    print("\n" + "="*65)
    print("🌟 BEAUTY-AI-CONSULTANT CLI: PROCESSING PIPELINE")
    print("="*65)
    print(f"📸 Input Photo: {args.image} ({img_bgr.shape[1]}x{img_bgr.shape[0]} px)")
    print(f"⚙️ Options: Occasion={args.occasion.upper()} | Skin Texture={args.texture.upper()}")
    
    # Run Pipeline
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    try:
        points = extract_face_mesh(img_rgb)
    except Exception as e:
        print(f"\n❌ Error during MediaPipe face extraction: {e}")
        sys.exit(1)
        
    lab_sample = extract_skin_cielab(img_bgr, points)
    img_wb_bgr = skin_roi_gray_world_wb(img_bgr, skin_mask=lab_sample["mask"])
    lip_metrics = extract_lip_metrics(img_wb_bgr, points)
    shape_res = classify_face_shape(points)
    metrics = compute_skin_metrics(lab_sample, img_wb_bgr, points)
    season_res = classify_season(metrics)
    advice_card = resolve_glowup_profile(shape_res["primary"], season_res["season"], occasion=args.occasion, texture=args.texture)
    
    db_df = pd.read_csv(args.db)
    target_lip_hex = "#B75B5B" if "Summer" in season_res["season"] or "Winter" in season_res["season"] else "#C86B5A"
    target_blush_hex = "#D98B94" if "Summer" in season_res["season"] or "Winter" in season_res["season"] else "#E8A6A1"
    target_eye_hex = "#B88276" if "Summer" in season_res["season"] or "Winter" in season_res["season"] else "#C8957F"
    
    matched_lips = match_products(target_lip_hex, db_df, product_type="lipstick", lip_base_lab=lip_metrics["lip_base_lab"], top_k=3)
    matched_blushes = match_products(target_blush_hex, db_df, product_type="blush", top_k=2)
    matched_eyes = match_products(target_eye_hex, db_df, product_type="eyeshadow", top_k=2)

    # Print Clean Console Report
    print("\n1️⃣ HÌNH DÁNG KHUÔN MẶT & TỈ LỆ BIOMETRICS:")
    print(f"  • Dáng mặt chính:   {shape_res['primary']} ({shape_res['probabilities'][shape_res['primary']]:.1%} confidence)")
    print(f"  • Dáng mặt phụ:     {shape_res['secondary']}")
    print(f"  • Tỉ lệ hình học:   Dài/Rộng={shape_res['ratios']['r1']:.2f}, Hàm/Má={shape_res['ratios']['r2']:.2f}, Trán/Hàm={shape_res['ratios']['r3']:.2f}")

    print("\n2️⃣ QUANG HỌC SẮC TỐ DA (12 SEASONS):")
    print(f"  • Mùa màu sắc:     {season_res['season']} ({season_res['undertone']})")
    print(f"  • Độ sáng da ITA°:  {metrics['ITA_deg']:.1f}° ({metrics['ITA_category']})")
    print(f"  • CIELAB D65:       L*={metrics['L_star']:.1f}, a*={metrics['a_star']:.1f}, b*={metrics['b_star']:.1f}")

    print("\n3️⃣ VIỀN MÔI & DỰ ĐOÁN MÀU NỀN MÔI GỐC (FEATURE 1 & 2):")
    print(f"  • Độ sáng viền môi (L*):   {lip_metrics['lip_border_L']:.1f}")
    print(f"  • Chỉ số thâm viền môi:   {lip_metrics['lip_darkness_index']:.1f}")
    print(f"  • Đánh giá che phủ:       {lip_metrics['coverage_requirement']}")
    print(f"  • Khuyến nghị chất son:   {lip_metrics['recommended_texture']}")

    print("\n4️⃣ HƯỚNG DẪN TRANG ĐIỂM CHI TIẾT (FULL LAYOUT):")
    print(f"  • 💆 Tạo khối (Contour):  {advice_card['techniques']['contour']}")
    print(f"  • 🌸 Phấn má (Blush):     {advice_card['techniques']['blush']}")
    print(f"  • 👁️ Phấn mắt (Eyes):     {advice_card['techniques']['eyes']}")
    print(f"  • 💄 Son môi (Lip):       {advice_card['techniques']['lip']}")
    print(f"  • 🧴 Kem lót (Prep):      {advice_card['execution_parameters']['prep']}")
    print(f"  • ✨ Khóa nền (Setting):   {advice_card['execution_parameters']['setting']}")
    
    print("\n5️⃣ LỖI CẦN TRÁNH (AVOID LIST):")
    for avoid in advice_card['techniques']['avoid']:
        print(f"  ⚠️ {avoid}")

    print("\n6️⃣ DANH SÁCH MỸ PHẨM KHỚP CHUẨN (TOP MATCHED SKUs):")
    print("  💄 Son môi (Lipsticks):")
    for p in matched_lips:
        print(f"     [{p['match_tier']}] {p['brand']} {p['name']} ({p['shade']}) — Chất: {p['texture']}")
    print("  🌸 Phấn má (Blushes):")
    for p in matched_blushes:
        print(f"     [{p['match_tier']}] {p['brand']} {p['name']} ({p['shade']})")
    print("  👁️ Phấn mắt (Eyeshadows):")
    for p in matched_eyes:
        print(f"     [{p['match_tier']}] {p['brand']} {p['name']} ({p['shade']})")

    print("="*65)
    print("✅ ANALYSIS COMPLETED SUCCESSFULLY!")
    print("="*65 + "\n")

    if args.output_json:
        report_data = {
            "face_shape": shape_res,
            "skin_metrics": metrics,
            "season": season_res,
            "lip_metrics": {
                "lip_border_L": lip_metrics["lip_border_L"],
                "lip_darkness_index": lip_metrics["lip_darkness_index"],
                "coverage_requirement": lip_metrics["coverage_requirement"],
                "recommended_texture": lip_metrics["recommended_texture"]
            },
            "advice": advice_card,
            "matched_products": {
                "lipsticks": matched_lips,
                "blushes": matched_blushes,
                "eyeshadows": matched_eyes
            }
        }
        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(report_data, f, ensure_ascii=False, indent=2)
        print(f"📄 JSON Report exported to: {args.output_json}")

if __name__ == "__main__":
    main()
