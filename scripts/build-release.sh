#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
revision="$(git rev-parse --verify "${1:?Usage: scripts/build-release.sh COMMIT}^{commit}")"
image="travel-cards:git-${revision}"
if docker image inspect "$image" >/dev/null 2>&1; then
  printf 'Refusing to overwrite release image %s\n' "$image" >&2
  exit 1
fi

snapshot="$(mktemp -d "${TMPDIR:-/tmp}/travel-cards-release.XXXXXXXX")"
trap 'rm -rf -- "$snapshot"' EXIT
git archive --format=tar "$revision" > "$snapshot/source.tar"
source_sha="$(sha256sum "$snapshot/source.tar" | cut -d ' ' -f 1)"
mkdir "$snapshot/source"
tar -xf "$snapshot/source.tar" -C "$snapshot/source"

docker build --build-arg "SOURCE_REVISION=$revision" --build-arg "SOURCE_SHA256=$source_sha" \
  --tag "$image" "$snapshot/source"
actual_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image")"
actual_sha="$(docker image inspect --format '{{ index .Config.Labels "win.keyi.travel-cards.source-sha256" }}' "$image")"
if [[ "$actual_revision" != "$revision" || "$actual_sha" != "$source_sha" ]]; then
  printf 'Release image provenance mismatch; do not deploy %s\n' "$image" >&2
  exit 1
fi
image_id="$(docker image inspect --format '{{.Id}}' "$image")"
printf 'image=%s\nimage_id=%s\nrevision=%s\nsource_sha256=%s\n' "$image" "$image_id" "$revision" "$source_sha"
