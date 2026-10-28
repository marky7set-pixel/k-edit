#!/usr/bin/env bash
set -euo pipefail
bash ci/prepare.sh
VER=$(tr -d ' \r\n' < version.txt); IFS=. read -r A B C <<< "$VER"; CODE=$((A*10000+B*100+C))
M=android/app/src/main
rm -rf $M/assets && mkdir -p $M/assets && cp -r ui $M/assets/ui
find $M -name '*.b64' -delete
GV=8.7
curl -sSL -o /tmp/g.zip https://services.gradle.org/distributions/gradle-$GV-bin.zip
unzip -q -o /tmp/g.zip -d /tmp
export KE_VER=$VER KE_CODE=$CODE KE_KS=$PWD/signing/kedit.p12 KE_KS_PASS='KEdit-9ce29c17af72fb8ebcd10940'
(cd android && /tmp/gradle-$GV/bin/gradle --no-daemon -q assembleRelease)
mkdir -p out
cp android/app/build/outputs/apk/release/app-release.apk "out/K-Edit-v$VER.apk"
BT=$(ls -d $ANDROID_HOME/build-tools/* | sort -V | tail -1)
"$BT/apksigner" verify --print-certs "out/K-Edit-v$VER.apk" | grep -i sha-256 || true
ls -la out
