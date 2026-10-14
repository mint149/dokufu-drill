#!/usr/bin/env bash
# Assemble the GitHub Pages site into _site/:
#   /            latest release tag (v*), or main if no tag exists yet
#   /vX.Y.Z/     every release tag, frozen
#   /next/       current main (development version)
# Each copy gets its version label written into <meta name="app-version">.
set -euo pipefail

out=${1:-_site}
main_ref=${MAIN_REF:-origin/main}
rm -rf "$out"
mkdir -p "$out"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

export_ref() { # ref dest label
  local src="$work/src-$3-$RANDOM"
  mkdir -p "$src" "$2"
  git archive "$1" | tar -x -C "$src"
  if [ -f "$src/package.json" ]; then
    # Vite era (v0.1+): build and publish dist/
    (cd "$src" && npm ci --no-audit --no-fund && npm run build)
    cp -R "$src/dist/." "$2/"
  else
    # Single-file era (v0.0.x): publish the repository files as they are
    rm -rf "$src/.github"
    cp -R "$src/." "$2/"
  fi
  perl -pi -e 's/(<meta name="app-version" content=")[^"]*(")/${1}'"$3"'${2}/' "$2/index.html"
}

tags=$(git tag -l 'v*' --sort=-v:refname)
latest=$(printf '%s\n' "$tags" | head -n1)

if [ -n "$latest" ]; then
  export_ref "$latest" "$out" "$latest"
else
  export_ref "$main_ref" "$out" next
fi
for t in $tags; do
  export_ref "$t" "$out/$t" "$t"
done
export_ref "$main_ref" "$out/next" next

echo "root: ${latest:-main}"
echo "releases: $(echo $tags)"
