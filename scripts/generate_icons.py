#!/usr/bin/env python3
"""
Generates high-resolution icons and favicons for Vortex Arena:
- favicon.ico (multi-resolution 16x16, 32x32, 48x48, 64x64)
- favicon.svg (crisp vector for modern browsers)
- PNG favicons (16x16, 32x32, 48x48)
- Apple Touch Icon (180x180)
- PWA icons (192x192, 512x512)
"""
import os
import math
import shutil
from PIL import Image, ImageDraw

SVG_CONTENT = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="vortex-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0e1726"/>
      <stop offset="100%" stop-color="#0a0d14"/>
    </linearGradient>
    <filter id="vortex-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="1.2" flood-color="#00f0ff" flood-opacity="0.8"/>
    </filter>
  </defs>
  
  <!-- Outer tactical squircle -->
  <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#vortex-bg)" stroke="#00f0ff" stroke-width="2" stroke-opacity="0.7"/>
  
  <!-- Outer reticle ring with cyan glow -->
  <circle cx="32" cy="32" r="20" fill="none" stroke="#00f0ff" stroke-width="2.6" filter="url(#vortex-glow)"/>
  
  <!-- Inner crimson target ring -->
  <circle cx="32" cy="32" r="11" fill="none" stroke="#ff3366" stroke-width="2"/>
  
  <!-- Crosshairs -->
  <line x1="32" y1="4" x2="32" y2="18" stroke="#00f0ff" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="32" y1="46" x2="32" y2="60" stroke="#00f0ff" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="4" y1="32" x2="18" y2="32" stroke="#00f0ff" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="46" y1="32" x2="60" y2="32" stroke="#00f0ff" stroke-width="2.4" stroke-linecap="round"/>
  
  <!-- Center aim pip -->
  <circle cx="32" cy="32" r="3.2" fill="#ff3366"/>
</svg>
'''

def create_vortex_icon(size):
    # Render at 4x supersampled resolution for antialiasing
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    center = s / 2
    
    # Outer dark radial squircle
    pad = s * 0.04
    radius = s * 0.22
    draw.rounded_rectangle(
        [pad, pad, s - pad, s - pad],
        radius=radius,
        fill=(11, 17, 28, 255),
        outline=(0, 240, 255, 180),
        width=max(1, int(s * 0.03))
    )
    
    # Cyan outer reticle ring
    r_outer = s * 0.31
    w_outer = max(2, int(s * 0.042))
    draw.ellipse(
        [center - r_outer, center - r_outer, center + r_outer, center + r_outer],
        outline=(0, 240, 255, 255),
        width=w_outer
    )
    
    # Crimson inner target ring
    r_inner = s * 0.17
    w_inner = max(2, int(s * 0.032))
    draw.ellipse(
        [center - r_inner, center - r_inner, center + r_inner, center + r_inner],
        outline=(255, 51, 102, 255),
        width=w_inner
    )
    
    # Crosshair ticks
    tick_len = s * 0.13
    tick_w = max(2, int(s * 0.04))
    # Top
    draw.line([center, center - r_outer - tick_len, center, center - r_outer + tick_len * 0.25], fill=(0, 240, 255, 255), width=tick_w)
    # Bottom
    draw.line([center, center + r_outer - tick_len * 0.25, center, center + r_outer + tick_len], fill=(0, 240, 255, 255), width=tick_w)
    # Left
    draw.line([center - r_outer - tick_len, center, center - r_outer + tick_len * 0.25, center], fill=(0, 240, 255, 255), width=tick_w)
    # Right
    draw.line([center + r_outer - tick_len * 0.25, center, center + r_outer + tick_len, center], fill=(0, 240, 255, 255), width=tick_w)
    
    # Center aim pip
    pip_r = max(2, s * 0.05)
    draw.ellipse([center - pip_r, center - pip_r, center + pip_r, center + pip_r], fill=(255, 51, 102, 255))
    
    return img.resize((size, size), Image.Resampling.LANCZOS)

def main():
    project_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    public_dir = os.path.join(project_dir, "public")
    icons_dir = os.path.join(public_dir, "icons")
    os.makedirs(icons_dir, exist_ok=True)
    
    print("Generating Vortex Arena favicon and brand assets...")
    
    # 1. Save favicon.svg in public/ and public/icons/
    svg_path = os.path.join(public_dir, "favicon.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(SVG_CONTENT.strip())
    shutil.copyfile(svg_path, os.path.join(icons_dir, "favicon.svg"))
    print(" -> Generated favicon.svg")
    
    # 2. Generate PNG favicon sizes
    for sz in [16, 32, 48]:
        png_icon = create_vortex_icon(sz)
        png_path = os.path.join(icons_dir, f"favicon-{sz}x{sz}.png")
        png_icon.save(png_path)
        print(f" -> Generated {png_path}")
        
    # 3. Generate Apple Touch Icon (180x180 standard)
    apple_icon = create_vortex_icon(180)
    apple_icon.save(os.path.join(icons_dir, "apple-touch-icon.png"))
    print(" -> Generated apple-touch-icon.png (180x180)")
    
    # 4. Generate PWA and high-res icons (192x192 and 512x512)
    icon_192 = create_vortex_icon(192)
    icon_192.save(os.path.join(icons_dir, "icon-192.png"))
    
    icon_512 = create_vortex_icon(512)
    icon_512.save(os.path.join(icons_dir, "icon-512.png"))
    print(" -> Generated icon-192.png and icon-512.png")
    
    # 5. Generate multi-resolution favicon.ico (16, 32, 48, 64)
    master_icon = create_vortex_icon(256)
    ico_path = os.path.join(public_dir, "favicon.ico")
    master_icon.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    shutil.copyfile(ico_path, os.path.join(icons_dir, "favicon.ico"))
    print(f" -> Generated multi-resolution favicon.ico ({os.path.getsize(ico_path)} bytes)")
    
    print("All favicon & brand assets generated successfully!")

if __name__ == "__main__":
    main()

