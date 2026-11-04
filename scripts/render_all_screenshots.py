#!/usr/bin/env python3
import os
import subprocess
import time

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYSTORE_DIR = os.path.join(PROJECT_DIR, "playstore")
HTML_PATH = os.path.join(PROJECT_DIR, "public", "capture_game_screens.html")
CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

screens = [
    (1, "screenshot-1-combat-hud.png"),
    (2, "screenshot-2-six-arenas.png"),
    (3, "screenshot-3-firearms.png"),
    (4, "screenshot-4-crossplay.png"),
    (5, "screenshot-5-ai-training.png")
]

for num, fname in screens:
    out_path = os.path.join(PLAYSTORE_DIR, fname)
    url = f"file://{HTML_PATH}?screen={num}"
    user_data = f"/tmp/chrome-cap-screen-{num}"
    cmd = [
        CHROME_BIN,
        "--headless=new",
        "--no-sandbox",
        "--allow-file-access-from-files",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--virtual-time-budget=2500",
        "--window-size=1920,1080",
        f"--screenshot={out_path}",
        f"--user-data-dir={user_data}",
        url
    ]
    print(f"Rendering screen {num} -> {fname}...")
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(out_path):
        size = os.path.getsize(out_path)
        print(f"  ✓ Saved {fname} ({size} bytes)")
    else:
        print(f"  ✗ Failed to generate {fname}")

print("Done rendering all 5 in-game screenshots!")
