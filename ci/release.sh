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
# only the newest version stays: older releases and their tags are removed (build logs stay)
gh release list --repo "$GITHUB_REPOSITORY" --limit 100 --json tagName --jq '.[].tagName' | while read -r t; do
  case "$t" in v*) [ "$t" != "$TAG" ] && gh release delete "$t" -y --cleanup-tag --repo "$GITHUB_REPOSITORY" && echo "removed $t" ;; esac
done
