#!/usr/bin/env bash
# Binary files live in the repo as *.b64 text; turn them back into real files.
set -euo pipefail
find . -name '*.b64' -not -path './.git/*' | while read -r f; do
  tr -d '\r' < "$f" | base64 -d > "${f%.b64}"
done
