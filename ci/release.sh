#!/usr/bin/env bash
set -euo pipefail
VER=$(tr -d ' \r\n' < version.txt); TAG="v$VER"
ls -la out
gh release delete "$TAG" -y --cleanup-tag --repo "$GITHUB_REPOSITORY" 2>/dev/null || true
cat > /tmp/notes.md <<NOTES
**K-Edit $VER · ادیت کلید**

- K-Edit-v$VER.apk: نسخهٔ اندروید
- K-Edit-Setup-v$VER.exe: نصب روی ویندوز
- K-Edit-Portable-v$VER.exe: ویندوز بدون نصب
NOTES
gh release create "$TAG" out/* --repo "$GITHUB_REPOSITORY" --title "K-Edit $VER" --notes-file /tmp/notes.md --latest
