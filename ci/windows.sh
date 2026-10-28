#!/usr/bin/env bash
set -euo pipefail
bash ci/prepare.sh
VER=$(tr -d ' \r\n' < version.txt)
find ui -name '*.b64' -delete
cd desktop
sed -i -E "s/\"version\": \"[0-9.]+\"/\"version\": \"$VER\"/" src-tauri/tauri.conf.json
sed -i -E "0,/^version = \"[0-9.]+\"/s//version = \"$VER\"/" src-tauri/Cargo.toml
npm install --no-audit --no-fund
npx tauri icon ../assets/icon-1024.png
npx tauri build
mkdir -p ../out
cp src-tauri/target/release/bundle/nsis/*-setup.exe "../out/K-Edit-Setup-v$VER.exe"
cp src-tauri/target/release/k-edit.exe "../out/K-Edit-Portable-v$VER.exe"
ls -la ../out
