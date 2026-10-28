#!/usr/bin/env bash
# Binary files live in the repo as *.b64 text; turn them back into real files.
set -euo pipefail
find . -name '*.b64' -not -path './.git/*' | while read -r f; do
  tr -d '\r' < "$f" | base64 -d > "${f%.b64}"
done
# AI upscale model: official Real-ESRGAN weights, converted to ui/ai (never committed). Build continues without it if the download fails.
rm -f ui/ai/x4v3.bin ui/ai/x4v3.json
(python3 ci/ai_weights.py || python ci/ai_weights.py || py ci/ai_weights.py) 2>&1 | tail -3 || true
ls -la ui/ai 2>/dev/null || echo "AI model missing"
