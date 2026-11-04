#!/usr/bin/env python3
import os
import math
from PIL import Image, ImageDraw, ImageFont

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYSTORE_DIR = os.path.join(PROJECT_DIR, "playstore")
os.makedirs(PLAYSTORE_DIR, exist_ok=True)

# 1. Copy 512x512 High-Res App Icon
icon_src = os.path.join(PROJECT_DIR, "public", "icons", "icon-512.png")
icon_dst = os.path.join(PLAYSTORE_DIR, "icon-512.png")
if os.path.exists(icon_src):
    img = Image.open(icon_src).convert("RGBA")
    # Google Play Store requires non-transparent PNG for the 512x512 store icon
    bg = Image.new("RGB", (512, 512), (10, 15, 24))
    bg.paste(img, (0, 0), img)
    bg.save(icon_dst, "PNG")
    print(f"✓ Saved 512x512 Store Icon: {icon_dst}")

# 2. Generate 1024x500 Feature Graphic
def generate_feature_graphic():
    w, h = 1024, 500
    img = Image.new("RGB", (w, h), (10, 15, 24))
    draw = ImageDraw.Draw(img)

    # Ambient radial gradient
    for r in range(350, 0, -5):
        alpha = int(40 * (1 - r / 350))
        color = (int(0 * alpha / 255), int(240 * alpha / 255), int(255 * alpha / 255))
        draw.ellipse([w//2 - r, h//2 - r - 30, w//2 + r, h//2 + r - 30], fill=color)

    # Grid background lines
    for x in range(0, w, 40):
        draw.line([(x, 0), (x, h)], fill=(16, 26, 44), width=1)
    for y in range(0, h, 40):
        draw.line([(0, y), (w, y)], fill=(16, 26, 44), width=1)

    # Subtle diagonal speed/energy slashes
    for offset in range(-200, w + 400, 120):
        draw.line([(offset, 0), (offset - 180, h)], fill=(18, 30, 52), width=2)

    # Tactical Reticle / Crosshair watermark in center
    cx, cy = w // 2, 220
    draw.ellipse([cx - 140, cy - 140, cx + 140, cy + 140], outline=(0, 240, 255, 60), width=2)
    draw.ellipse([cx - 80, cy - 80, cx + 80, cy + 80], outline=(255, 51, 102, 70), width=2)
    draw.ellipse([cx - 30, cy - 30, cx + 30, cy + 30], outline=(0, 240, 255, 90), width=2)
    draw.line([(cx - 160, cy), (cx - 40, cy)], fill=(0, 240, 255), width=2)
    draw.line([(cx + 40, cy), (cx + 160, cy)], fill=(0, 240, 255), width=2)
    draw.line([(cx, cy - 160), (cx, cy - 40)], fill=(0, 240, 255), width=2)
    draw.line([(cx, cy + 40), (cx, cy + 160)], fill=(0, 240, 255), width=2)

    # Badge: TOP PILL
    pill_w, pill_h = 320, 32
    pill_x, pill_y = (w - pill_w) // 2, 60
    draw.rounded_rectangle([pill_x, pill_y, pill_x + pill_w, pill_y + pill_h], radius=16, fill=(18, 30, 52), outline=(0, 240, 255))
    draw.text((pill_x + 36, pill_y + 8), "⚡ 12-PLAYER 3D TACTICAL FPS SHOOTER", fill=(0, 240, 255))

    # Main Title: VORTEX ARENA
    # Draw shadowed glowing title
    title_text = "VORTEX ARENA"
    # Fallback to standard bitmap text scaling
    # Draw bold styled lettering
    title_x, title_y = w // 2 - 210, 140
    # Outer glow
    for dx, dy in [(-2,0),(2,0),(0,-2),(0,2),(-2,-2),(2,2)]:
        draw.text((title_x + dx, title_y + dy), title_text, fill=(0, 180, 200))
    draw.text((title_x, title_y), title_text, fill=(255, 255, 255))

    # Tagline
    draw.text((w // 2 - 180, 205), "FAST-PACED REAL-TIME MULTIPLAYER COMBAT", fill=(148, 163, 184))

    # Feature Badges Row
    badges = [
        "🌐 Cross-Play (Mobile + PC)",
        "🗺️ 6 Combat Arenas",
        "🔫 4 Military Firearms",
        "🤖 Smart AI Bots"
    ]
    bx_start = 80
    for i, b in enumerate(badges):
        bx = bx_start + i * 220
        by = 380
        draw.rounded_rectangle([bx, by, bx + 205, by + 48], radius=8, fill=(17, 26, 46), outline=(0, 240, 255, 120))
        draw.text((bx + 14, by + 16), b, fill=(241, 245, 249))

    dst = os.path.join(PLAYSTORE_DIR, "feature_graphic-1024x500.png")
    img.save(dst, "PNG")
    print(f"✓ Saved 1024x500 Feature Graphic: {dst}")

generate_feature_graphic()

# 3. Generate 5 High-Resolution 1920x1080 Landscape Screenshots
def generate_screenshots():
    screens = [
        {
            "filename": "screenshot-1-combat-hud.png",
            "title": "TACTICAL 3D COMBAT & INTUITIVE MOBILE CONTROLS",
            "subtitle": "Smooth Virtual Joystick, Drag-to-Aim Fire & Haptic Weapon Recoil",
            "map_name": "SECTOR-7 (MILITARY COMPOUND)",
            "weapon": "V-44 Striker (Assault Rifle)",
            "accent": (0, 240, 255)
        },
        {
            "filename": "screenshot-2-six-arenas.png",
            "title": "6 DIVERSE COMBAT MAPS",
            "subtitle": "Sector-7, Suburban House, Rural Farm, Pine Forest, BlockCraft & Cruise Ship",
            "map_name": "SUBURBAN HOUSE & COURTYARD",
            "weapon": "Hawk-50 Anti-Materiel (Sniper Rifle)",
            "accent": (255, 183, 0)
        },
        {
            "filename": "screenshot-3-firearms.png",
            "title": "ARSENAL OF 4 SPECIALIZED WEAPONS",
            "subtitle": "Assault Rifle, Precision Sniper, Breacher-12 Shotgun & Pulse-9 Pistol",
            "map_name": "PINE FOREST ARENA",
            "weapon": "Breacher-12 Tactical (Shotgun)",
            "accent": (255, 51, 102)
        },
        {
            "filename": "screenshot-4-crossplay.png",
            "title": "SEAMLESS 12-PLAYER MULTIPLAYER & CROSS-PLAY",
            "subtitle": "Fight Against Android, Laptop, and Web Players in Real-Time",
            "map_name": "BLOCKCRAFT ARENA",
            "weapon": "Pulse-9 Sidearm (Pistol)",
            "accent": (0, 255, 136)
        },
        {
            "filename": "screenshot-5-ai-training.png",
            "title": "OFFLINE SINGLE PLAYER & PRACTICE SANDBOX",
            "subtitle": "Sharpen Your Aim Against 4 AI Bot Difficulties Anytime, Anywhere",
            "map_name": "CRUISE SHIP UPPER DECK",
            "weapon": "V-44 Striker (Tactical)",
            "accent": (168, 85, 247)
        }
    ]

    w, h = 1920, 1080

    for idx, s in enumerate(screens):
        img = Image.new("RGB", (w, h), (10, 15, 24))
        draw = ImageDraw.Draw(img)

        # 3D Environment Horizon & Ground Plane Simulation
        horizon = 640
        # Sky gradient
        for y in range(0, horizon, 10):
            t = y / horizon
            r = int(10 + t * 15)
            g = int(15 + t * 25)
            b = int(28 + t * 40)
            draw.rectangle([0, y, w, y + 10], fill=(r, g, b))

        # Ground grid & perspective lines
        for y in range(horizon, h, 20):
            t = (y - horizon) / (h - horizon)
            r = int(18 + t * 12)
            g = int(24 + t * 16)
            b = int(36 + t * 24)
            draw.rectangle([0, y, w, y + 20], fill=(r, g, b))

        # Grid lines in perspective
        for x in range(0, w, 80):
            draw.line([(w // 2, horizon), (x, h)], fill=(28, 42, 65), width=1)
        for y in [660, 690, 730, 780, 840, 920, 1010]:
            draw.line([(0, y), (w, y)], fill=(28, 42, 65), width=1)

        # 3D Arena Obstacles / Geometric Map Silhouettes
        accent_color = s["accent"]
        draw.rectangle([280, 420, 560, horizon], fill=(22, 32, 50), outline=accent_color, width=2)
        draw.rectangle([760, 360, 1160, horizon], fill=(25, 36, 56), outline=accent_color, width=2)
        draw.rectangle([1360, 440, 1640, horizon], fill=(20, 30, 48), outline=accent_color, width=2)

        # Aim Reticle in 3D center
        rcx, rcy = w // 2, horizon - 80
        draw.ellipse([rcx - 24, rcy - 24, rcx + 24, rcy + 24], outline=accent_color, width=2)
        draw.point((rcx, rcy), fill=(255, 255, 255))
        draw.line([(rcx - 36, rcy), (rcx - 12, rcy)], fill=accent_color, width=2)
        draw.line([(rcx + 12, rcy), (rcx + 36, rcy)], fill=accent_color, width=2)
        draw.line([(rcx, rcy - 36), (rcx, rcy - 12)], fill=accent_color, width=2)
        draw.line([(rcx, rcy + 12), (rcx, rcy + 36)], fill=accent_color, width=2)

        # Mobile HUD: Left Virtual Joystick
        jx, jy = 220, h - 220
        draw.ellipse([jx - 90, jy - 90, jx + 90, jy + 90], outline=(255, 255, 255, 80), width=3)
        draw.ellipse([jx - 40, jy - 50, jx + 40, jy + 30], fill=(0, 240, 255, 160), outline=(0, 240, 255), width=2)

        # Mobile HUD: Right Action & Fire Buttons
        fx, fy = w - 240, h - 240
        draw.ellipse([fx - 70, fy - 70, fx + 70, fy + 70], fill=(255, 51, 102, 180), outline=(255, 51, 102), width=3)
        draw.text((fx - 18, fy - 8), "FIRE", fill=(255, 255, 255))

        # Jump Button
        jx2, jy2 = w - 120, h - 380
        draw.ellipse([jx2 - 40, jy2 - 40, jx2 + 40, jy2 + 40], fill=(17, 26, 46, 200), outline=(0, 240, 255), width=2)
        draw.text((jx2 - 16, jy2 - 8), "JUMP", fill=(0, 240, 255))

        # Reload Button
        rx, ry = w - 380, h - 160
        draw.ellipse([rx - 40, ry - 40, rx + 40, ry + 40], fill=(17, 26, 46, 200), outline=(255, 183, 0), width=2)
        draw.text((rx - 22, ry - 8), "RELOAD", fill=(255, 183, 0))

        # HUD Top Banner: Health & Shield Box
        draw.rounded_rectangle([60, 40, 380, 110], radius=8, fill=(17, 26, 46, 220), outline=(0, 240, 255, 100))
        draw.text((80, 52), "❤️ HEALTH: 100", fill=(0, 255, 136))
        draw.text((80, 80), "🛡️ SHIELD:  50", fill=(0, 240, 255))

        # HUD Top Right: Weapon & Ammo Box
        draw.rounded_rectangle([w - 440, 40, w - 60, 110], radius=8, fill=(17, 26, 46, 220), outline=(0, 240, 255, 100))
        draw.text((w - 420, 52), f"WEAPON: {s['weapon']}", fill=(241, 245, 249))
        draw.text((w - 420, 80), "AMMO:   30 / 240", fill=(255, 183, 0))

        # Header Title Bar (for Play Store showcase)
        draw.rectangle([0, 0, w, 90], fill=(10, 15, 24, 230))
        draw.line([(0, 90), (w, 90)], fill=accent_color, width=3)
        draw.text((60, 24), s["title"], fill=accent_color)
        draw.text((60, 56), s["subtitle"], fill=(148, 163, 184))

        # Footer Map Badge
        draw.rounded_rectangle([w // 2 - 200, h - 70, w // 2 + 200, h - 20], radius=6, fill=(17, 26, 46), outline=accent_color)
        draw.text((w // 2 - 140, h - 52), f"📍 MAP: {s['map_name']}", fill=(255, 255, 255))

        dst = os.path.join(PLAYSTORE_DIR, s["filename"])
        img.save(dst, "PNG")
        print(f"✓ Saved Screenshot {idx+1}/5: {dst}")

generate_screenshots()
print("All Google Play Store graphics generated in:", PLAYSTORE_DIR)
