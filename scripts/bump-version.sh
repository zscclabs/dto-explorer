#!/usr/bin/env bash
# Set the release version in backend/pyproject.toml and frontend/package.json.
# Usage: scripts/bump-version.sh 0.2.0
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.]+)?$ ]]; then
  echo "usage: $0 <semver, e.g. 0.2.0>" >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
sed -i.bak -E "s/^version = \".*\"/version = \"$version\"/" "$root/backend/pyproject.toml"
rm "$root/backend/pyproject.toml.bak"
(cd "$root/backend" && uv lock --quiet)
(cd "$root/frontend" && npm version "$version" --no-git-tag-version --allow-same-version >/dev/null)

echo "Version set to $version. Next:"
echo "  1. Add a '## [$version]' section to CHANGELOG.md"
echo "  2. git commit -am \"Release v$version\" && git tag v$version"
echo "  3. git push origin main v$version"
