#!/bin/bash
set -e

echo "=== Setting Android SDK & Java Environment ==="
export ANDROID_HOME=/home/samagraparashar/Android/Sdk
export JAVA_HOME=/opt/android-studio/jbr
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH

echo "=== Building React Web Application ==="
npm run build

echo "=== Syncing Assets with Capacitor ==="
npx cap sync

echo "=== Compiling Android Debug APK ==="
cd android
./gradlew assembleDebug

echo ""
echo "=========================================================="
echo "✔ Success! Android build compiled successfully."
echo "APK location: frontend/android/app/build/outputs/apk/debug/app-debug.apk"
echo "=========================================================="
