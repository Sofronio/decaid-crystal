#!/usr/bin/env bash
set -euo pipefail

# Builds the release archive Decaid installs from a GitHub release.
#
# The installer enforces three things this script keeps in sync:
#   - the release tag is X.Y.Z or vX.Y.Z and equals manifest.version exactly
#   - the release carries exactly one .zip asset
#   - the archive holds a single top-level <plugin-id>/ directory with
#     manifest.json and plugin.js inside it

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_id="crystal.reaplugin"
plugin_dir="$repo_root/$plugin_id"
manifest="$plugin_dir/manifest.json"
dist="$repo_root/dist"

if ! command -v jq >/dev/null 2>&1; then
  echo "package: jq is required" >&2
  exit 1
fi
if ! command -v zip >/dev/null 2>&1; then
  echo "package: zip is required" >&2
  exit 1
fi

for f in "$manifest" "$plugin_dir/plugin.js"; do
  if [ ! -s "$f" ]; then
    echo "package: missing or empty ${f#"$repo_root"/}" >&2
    exit 1
  fi
done

id="$(jq -r '.id' "$manifest")"
if [ "$id" != "$plugin_id" ]; then
  echo "package: manifest id is '$id', expected '$plugin_id'" >&2
  exit 1
fi

version="$(jq -r '.version' "$manifest")"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "package: manifest version '$version' is not X.Y.Z" >&2
  exit 1
fi

api_version="$(jq -r '.apiVersion' "$manifest")"
if [ "$api_version" != "1" ]; then
  echo "package: manifest apiVersion is '$api_version', expected 1" >&2
  exit 1
fi

if ! grep -q 'createPlugin' "$plugin_dir/plugin.js"; then
  echo "package: plugin.js has no 'createPlugin' entry point" >&2
  exit 1
fi

mkdir -p "$dist"
archive="$dist/$plugin_id-$version.zip"
rm -f "$archive"

# -X strips extra file attributes so repeated runs produce identical bytes.
(cd "$repo_root" && zip -q -X -r "$archive" "$plugin_id")

entries="$(unzip -Z1 "$archive")"
for required in "$plugin_id/manifest.json" "$plugin_id/plugin.js"; do
  case "$entries" in
    *"$required"*) ;;
    *)
      echo "package: $archive does not contain $required" >&2
      exit 1
      ;;
  esac
done

echo "package: $archive"
echo "package: tag the release v$version (the tag must equal manifest.version)"
