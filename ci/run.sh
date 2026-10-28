#!/usr/bin/env bash
# run one build step; always publish the last lines of its log to the "ci-log-<step>" pre-release (readable without Actions access)
N="$1"
bash "ci/$N.sh" 2>&1 | tee "/tmp/$N.log"; S=${PIPESTATUS[0]}
{ echo "step: $N | exit: $S | commit: ${GITHUB_SHA:-?} | $(date -u +%FT%TZ)"; echo '```'; tail -n 160 "/tmp/$N.log" | cut -c1-400; echo '```'; } > "/tmp/$N.notes"
T="ci-log-$N"
gh release view "$T" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1 || gh release create "$T" --repo "$GITHUB_REPOSITORY" --prerelease --title "$T" --notes "log" >/dev/null 2>&1 || true
gh release edit "$T" --repo "$GITHUB_REPOSITORY" --prerelease --notes-file "/tmp/$N.notes" >/dev/null 2>&1 || true
exit $S
