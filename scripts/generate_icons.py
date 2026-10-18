#!/usr/bin/env python3
"""
Generates high-resolution icons for iOS (Apple Touch Icon, PWA, WebClip) and Android.
"""
import os
import math
import base64
from PIL import Image, ImageDraw

def create_vortex_icon(size):
    img = Image.new("RGBA", (size, size), (10, 15, 24, 255))
    draw = ImageDraw.Draw(img)
    center = size / 2
    
    # Outer dark radial border
    pad = size * 0.04
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=size * 0.22, fill=(13, 20, 32, 255), outline=(0, 240, 255, 120), width=int(size * 0.02))
    
    # Cyan outer reticle ring
    r_outer = size * 0.32
    w_outer = max(2, int(size * 0.035))
    draw.ellipse([center - r_outer, center - r_outer, center + r_outer, center + r_outer], outline=(0, 240, 255, 230), width=w_outer)
    
    # Crimson inner target ring
    r_inner = size * 0.18
    w_inner = max(2, int(size * 0.025))
    draw.ellipse([center - r_inner, center - r_inner, center + r_inner, center + r_inner], outline=(255, 51, 102, 240), width=w_inner)
    
    # Crosshair ticks
    tick_len = size * 0.12
    tick_w = max(2, int(size * 0.03))
    # Top
    draw.line([center, center - r_outer - tick_len, center, center - r_outer + tick_len * 0.3], fill=(0, 240, 255, 240), width=tick_w)
    # Bottom
    draw.line([center, center + r_outer - tick_len * 0.3, center, center + r_outer + tick_len], fill=(0, 240, 255, 240), width=tick_w)
    # Left
    draw.line([center - r_outer - tick_len, center, center - r_outer + tick_len * 0.3, center], fill=(0, 240, 255, 240), width=tick_w)
    # Right
    draw.line([center + r_outer - tick_len * 0.3, center, center + r_outer + tick_len, center], fill=(0, 240, 255, 240), width=tick_w)
    
    # Center aim pip
    pip_r = max(3, size * 0.04)
    draw.ellipse([center - pip_r, center - pip_r, center + pip_r, center + pip_r], fill=(255, 51, 102, 255))
    
    return img

def main():
    icons_dir = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
    os.makedirs(icons_dir, exist_ok=True)
    
    # 192x192
    icon_192 = create_vortex_icon(192)
    icon_192.save(os.path.join(icons_dir, "icon-192.png"))
    icon_192.save(os.path.join(icons_dir, "apple-touch-icon.png"))
    
    # 512x512
    icon_512 = create_vortex_icon(512)
    icon_512.save(os.path.join(icons_dir, "icon-512.png"))
    
    # Base64 string for mobileconfig
    with open(os.path.join(icons_dir, "icon-192.png"), "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    
    b64_path = os.path.join(icons_dir, "icon-192.b64")
    with open(b64_path, "w") as f:
        f.write(b64)
        
    print(f"Generated icons in {icons_dir}")

if __name__ == "__main__":
    main()
