#!/usr/bin/env bash
set -e

# ==============================================================================
# Vortex Arena: Automated Android APK Builder
# Builds a production-ready, signed, zip-aligned Android APK using Android SDK
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=== [1/6] Locating Android SDK & Java Toolchain ==="

ANDROID_HOME="${ANDROID_HOME:-/Users/nikhilarora/Library/Android/sdk}"
if [ ! -d "$ANDROID_HOME" ]; then
    echo "ERROR: Android SDK not found at $ANDROID_HOME"
    exit 1
fi

JAVA_HOME="${JAVA_HOME:-/opt/homebrew/Cellar/openjdk@17/17.0.16/libexec/openjdk.jdk/Contents/Home}"
if [ ! -d "$JAVA_HOME" ]; then
    echo "ERROR: Java JDK not found at $JAVA_HOME"
    exit 1
fi
JAVAC="$JAVA_HOME/bin/javac"
JAR="$JAVA_HOME/bin/jar"

# Detect best available build-tools and platform
BUILD_TOOLS_DIR="$ANDROID_HOME/build-tools/33.0.0"
if [ ! -d "$BUILD_TOOLS_DIR" ]; then
    BUILD_TOOLS_DIR="$(ls -d $ANDROID_HOME/build-tools/* | sort -V | tail -n 1)"
fi

PLATFORM_JAR="$ANDROID_HOME/platforms/android-33/android.jar"
if [ ! -f "$PLATFORM_JAR" ]; then
    PLATFORM_JAR="$(ls $ANDROID_HOME/platforms/*/android.jar | sort -V | tail -n 1)"
fi

AAPT2="$BUILD_TOOLS_DIR/aapt2"
D8="$BUILD_TOOLS_DIR/d8"
ZIPALIGN="$BUILD_TOOLS_DIR/zipalign"
APKSIGNER="$BUILD_TOOLS_DIR/apksigner"

echo "Using Android SDK: $ANDROID_HOME"
echo "Using Build Tools: $BUILD_TOOLS_DIR"
echo "Using Platform Jar: $PLATFORM_JAR"
echo "Using Java Compiler: $JAVAC"

BUILD_DIR="$PROJECT_DIR/build_apk_tmp"
OUTPUT_APK="$PROJECT_DIR/VortexArena.apk"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/compiled_res" "$BUILD_DIR/gen" "$BUILD_DIR/obj" "$BUILD_DIR/apk"

# Ensure debug keystore exists
KEYSTORE="$HOME/.android/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
    echo "Generating Android debug keystore..."
    mkdir -p "$HOME/.android"
    "$JAVA_HOME/bin/keytool" -genkey -v -keystore "$KEYSTORE" -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
fi

echo "=== [1.5/6] Synchronizing Latest Web Game Assets to Android Bundle ==="
mkdir -p "$PROJECT_DIR/android/app/src/main/assets/www/vendor/three"
cp -r "$PROJECT_DIR/public/"* "$PROJECT_DIR/android/app/src/main/assets/www/"
rm -f "$PROJECT_DIR/android/app/src/main/assets/www/"*.apk
if [ -f "$PROJECT_DIR/node_modules/three/build/three.module.js" ]; then
    cp "$PROJECT_DIR/node_modules/three/build/three.module.js" "$PROJECT_DIR/android/app/src/main/assets/www/vendor/three/three.module.js"
fi

echo "=== [2/6] Compiling Android XML Resources ==="
"$AAPT2" compile --dir "$PROJECT_DIR/android/app/src/main/res" -o "$BUILD_DIR/compiled_res/res.zip"

echo "=== [3/6] Linking Package & Assets with AAPT2 ==="
"$AAPT2" link \
    -I "$PLATFORM_JAR" \
    --manifest "$PROJECT_DIR/android/app/src/main/AndroidManifest.xml" \
    --min-sdk-version 21 \
    --target-sdk-version 33 \
    -o "$BUILD_DIR/apk/unaligned.apk" \
    -A "$PROJECT_DIR/android/app/src/main/assets" \
    --java "$BUILD_DIR/gen" \
    --auto-add-overlay \
    "$BUILD_DIR/compiled_res/res.zip"

echo "=== [4/6] Compiling Java Sources ==="
"$JAVAC" -encoding UTF-8 -source 11 -target 11 \
    -cp "$PLATFORM_JAR" \
    -d "$BUILD_DIR/obj" \
    "$BUILD_DIR/gen/com/vortexarena/game/R.java" \
    "$PROJECT_DIR/android/app/src/main/java/com/vortexarena/game/MainActivity.java"

echo "=== [5/6] Generating Dalvik Executable (classes.dex) with D8 ==="
CLASS_FILES=$(find "$BUILD_DIR/obj" -name "*.class")
"$D8" --lib "$PLATFORM_JAR" --output "$BUILD_DIR/apk/" $CLASS_FILES

# Package classes.dex into unaligned APK
cd "$BUILD_DIR/apk"
"$JAR" uf unaligned.apk classes.dex
cd "$PROJECT_DIR"

echo "=== [6/6] Zipaligning & Signing Final APK ==="
"$ZIPALIGN" -f -p 4 "$BUILD_DIR/apk/unaligned.apk" "$BUILD_DIR/apk/aligned.apk"

"$APKSIGNER" sign \
    --ks "$KEYSTORE" \
    --ks-pass pass:android \
    --ks-key-alias androiddebugkey \
    --key-pass pass:android \
    --v1-signing-enabled true \
    --v2-signing-enabled true \
    --v3-signing-enabled true \
    --out "$OUTPUT_APK" \
    "$BUILD_DIR/apk/aligned.apk"

echo "=== Verifying APK Signature ==="
"$APKSIGNER" verify -v "$OUTPUT_APK"

# Copy to public/ directory for direct static serving
cp "$OUTPUT_APK" "$PROJECT_DIR/public/VortexArena.apk"

rm -rf "$BUILD_DIR"

echo "=========================================================="
echo " SUCCESS! Vortex Arena Mobile APK Built:"
echo " Root:   $OUTPUT_APK"
echo " Public: $PROJECT_DIR/public/VortexArena.apk"
ls -lh "$OUTPUT_APK" "$PROJECT_DIR/public/VortexArena.apk"
echo "=========================================================="
