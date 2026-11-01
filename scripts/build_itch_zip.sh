#!/usr/bin/env bash
set -e

# ==============================================================================
# Vortex Arena: Automated Itch.io HTML5 Game Packager
# Packages all frontend game assets, Three.js modules, and relative imports
# into a production-ready ZIP file for itch.io web browser play.
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

BUILD_DIR="$PROJECT_DIR/build_itch_tmp"
OUTPUT_ZIP="$PROJECT_DIR/vortex-arena-html5.zip"

echo "=== [1/4] Preparing Staging Directory ==="
rm -rf "$BUILD_DIR" "$OUTPUT_ZIP"
mkdir -p "$BUILD_DIR"

echo "=== [2/4] Copying Public Game Assets ==="
cp -r "$PROJECT_DIR/public/"* "$BUILD_DIR/"
rm -f "$BUILD_DIR/"*.apk
rm -f "$BUILD_DIR/"*.zip

# Ensure vendor/three/three.module.js is bundled
mkdir -p "$BUILD_DIR/vendor/three"
if [ -f "$PROJECT_DIR/node_modules/three/build/three.module.js" ]; then
    cp "$PROJECT_DIR/node_modules/three/build/three.module.js" "$BUILD_DIR/vendor/three/three.module.js"
elif [ -f "$PROJECT_DIR/android/app/src/main/assets/www/vendor/three/three.module.js" ]; then
    cp "$PROJECT_DIR/android/app/src/main/assets/www/vendor/three/three.module.js" "$BUILD_DIR/vendor/three/three.module.js"
fi

echo "=== [3/4] Configuring Relative Paths & Import Map for Itch.io Iframe ==="
# Add base href="./" and an import map right after <head> in index.html
python3 - << 'EOF'
import re

html_path = 'build_itch_tmp/index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace root-relative asset URLs with relative URLs for itch.io CDN subpath hosting
content = re.sub(r'href="/css/', 'href="css/', content)
content = re.sub(r'href="/icons/', 'href="icons/', content)
content = re.sub(r'href="/favicon\.', 'href="favicon.', content)
content = re.sub(r'href="/manifest\.json"', 'href="manifest.json"', content)
content = re.sub(r'src="/js/', 'src="js/', content)

# Inject importmap for ES module Three.js resolution if not already present
import_map = """
  <base href="./">
  <script type="importmap">
  {
    "imports": {
      "/vendor/three/three.module.js": "./vendor/three/three.module.js"
    }
  }
  </script>
"""

if '<base href="./">' not in content:
    content = content.replace('<head>', '<head>' + import_map, 1)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully injected itch.io iframe compatibility into index.html")
EOF

echo "=== [4/4] Creating ZIP Archive (vortex-arena-html5.zip) ==="
cd "$BUILD_DIR"
zip -r -q "$OUTPUT_ZIP" .
cd "$PROJECT_DIR"
rm -rf "$BUILD_DIR"

echo "=========================================================="
echo " SUCCESS! Vortex Arena Itch.io HTML5 Build Ready:"
echo " Archive: $OUTPUT_ZIP"
ls -lh "$OUTPUT_ZIP"
echo "=========================================================="
