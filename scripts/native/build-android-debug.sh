#!/usr/bin/env bash
# Compile le bundle web, l'embarque dans les projets natifs, puis produit l'APK debug Android.
# Usage : ./scripts/native/build-android-debug.sh   (JDK 21 + Android SDK 35 requis ; voir memory/mobile/N1_N4_RAPPORT.md)
set -euo pipefail
cd "$(dirname "$0")/../../frontend"
export ANDROID_HOME="${ANDROID_HOME:-/root/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-$([ -d /root/jdk21 ] && echo /root/jdk21 || ls -d /usr/lib/jvm/java-21-openjdk-* 2>/dev/null | head -1)}"
# JDK 21 : Debian 12 n'en fournit pas via apt → Temurin 21 (aarch64) :
#   curl -sSL -o /root/jdk21.tgz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/aarch64/jdk/hotspot/normal/eclipse" && mkdir -p /root/jdk21 && tar -xzf /root/jdk21.tgz -C /root/jdk21 --strip-components=1
# SDK Android : cmdline-tools + "platform-tools" "platforms;android-35" "build-tools;35.0.0" dans /root/android-sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
echo "→ build web (REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL:-$(grep REACT_APP_BACKEND_URL .env | cut -d= -f2)})"
GENERATE_SOURCEMAP=false yarn build   # pas de CI=true : les avertissements ESLint historiques ne bloquent pas
echo "→ cap sync"
npx cap sync
echo "→ gradle assembleDebug"
cd android && ./gradlew assembleDebug --no-daemon -q
ls -la app/build/outputs/apk/debug/app-debug.apk
