#!/usr/bin/env bash
# Fail unless the git tag (v1.2.3) matches the versions in pyproject.toml and package.json.
set -euo pipefail

tag="${1#v}"
root="$(cd "$(dirname "$0")/.." && pwd)"
py=$(grep -m1 -E '^version = ' "$root/backend/pyproject.toml" | cut -d'"' -f2)
js=$(node -p "require('$root/frontend/package.json').version")

if [[ "$tag" != "$py" || "$tag" != "$js" ]]; then
  echo "Version mismatch: tag=$tag pyproject=$py package.json=$js" >&2
  echo "Run scripts/bump-version.sh $tag and commit before tagging." >&2
  exit 1
fi
echo "Version $tag OK"
