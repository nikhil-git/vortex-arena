#!/usr/bin/env bash
set -e

# ==============================================================================
# Vortex Arena: Official Android App Bundle (.aab) & APK Builder
# Production-ready build targeting API 34 using modern Gradle & AndroidX WebEngine
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$PROJECT_DIR/android"
DIST_DIR="$PROJECT_DIR/dist"

echo "======================================================================"
echo " VORTEX ARENA - GOOGLE PLAY STORE PRODUCTION PACKAGING"
echo "======================================================================"

# 1. Environment & Java / Android SDK Verification
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/Cellar/openjdk@17/17.0.16/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-/Users/nikhilarora/Library/Android/sdk}"

if [ ! -d "$JAVA_HOME" ]; then
    echo "ERROR: Java 17 JDK not found at $JAVA_HOME"
    exit 1
fi

if [ ! -d "$ANDROID_HOME" ]; then
    echo "ERROR: Android SDK not found at $ANDROID_HOME"
    exit 1
fi

echo "✓ Java Home:    $JAVA_HOME"
echo "✓ Android SDK:  $ANDROID_HOME"

# 2. Synchronize Web Game Assets to Android Bundle
echo ""
echo "=== [1/4] Synchronizing Latest Game Assets to Android Assets ==="
ASSETS_WWW="$ANDROID_DIR/app/src/main/assets/www"
mkdir -p "$ASSETS_WWW"

# Sync public web assets, excluding binary archives
rsync -av --delete \
    --exclude="*.apk*" \
    --exclude="*.zip" \
    --exclude="*.idsig" \
    --exclude=".DS_Store" \
    "$PROJECT_DIR/public/" "$ASSETS_WWW/"

# Ensure Three.js ES module is bundled for offline/instant boot
mkdir -p "$ASSETS_WWW/vendor/three"
if [ -f "$PROJECT_DIR/node_modules/three/build/three.module.js" ]; then
    cp "$PROJECT_DIR/node_modules/three/build/three.module.js" "$ASSETS_WWW/vendor/three/three.module.js"
fi

echo "✓ Assets synchronized ($(du -sh "$ASSETS_WWW" | cut -f1))"

# 3. Clean and Run Gradle Builds
echo ""
echo "=== [2/4] Compiling Android App Bundle (.aab) and APKs via Gradle ==="
cd "$ANDROID_DIR"
chmod +x gradlew

./gradlew clean bundleRelease assembleRelease assembleDebug --no-daemon

# 4. Package Artifacts to dist/
echo ""
echo "=== [3/4] Exporting Production Deliverables to dist/ ==="
mkdir -p "$DIST_DIR"

AAB_SRC="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
APK_RELEASE_SRC="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
APK_DEBUG_SRC="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"

if [ -f "$AAB_SRC" ]; then
    cp "$AAB_SRC" "$DIST_DIR/VortexArena-release.aab"
fi

if [ -f "$APK_RELEASE_SRC" ]; then
    cp "$APK_RELEASE_SRC" "$DIST_DIR/VortexArena-release.apk"
    # Also update website direct download link
    cp "$APK_RELEASE_SRC" "$PROJECT_DIR/public/VortexArena.apk"
    cp "$APK_RELEASE_SRC" "$PROJECT_DIR/VortexArena.apk"
fi

if [ -f "$APK_DEBUG_SRC" ]; then
    cp "$APK_DEBUG_SRC" "$DIST_DIR/VortexArena-debug.apk"
fi

# 5. Output Summary & Verification
echo ""
echo "=== [4/4] Build Verification & Artifacts ==="
ls -lh "$DIST_DIR"

echo ""
echo "======================================================================"
echo " BUILD SUCCESSFUL!"
echo " Google Play Store Bundle (.aab): $DIST_DIR/VortexArena-release.aab"
echo " Internal Testing APK:            $DIST_DIR/VortexArena-release.apk"
echo " Public Download APK:             $PROJECT_DIR/public/VortexArena.apk"
echo "======================================================================"
