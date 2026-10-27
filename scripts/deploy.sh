#!/usr/bin/env bash
set -euo pipefail

# Change to repo root
cd "$(dirname "${BASH_SOURCE[0]}")/.."

target="HEAD"
skip_tests=false
allow_dirty=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-tests|--no-tests)
      skip_tests=true
      shift
      ;;
    --allow-dirty)
      allow_dirty=true
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/deploy.sh [COMMIT|IMAGE] [OPTIONS]

Options:
  --skip-tests    Skip pre-deploy isolated tests (test:oauth)
  --allow-dirty   Allow deploying even if git working tree has uncommitted changes
  -h, --help      Show this help message

Environment variables:
  APP_PORT          Host port (default: 3100)
  MCP_OAUTH_ENABLED Optional OAuth toggle override (defaults to .env.local or false)
  MEEMO_NETWORK     Meemo backend network (default: meemo_backend)
  EDGE_NETWORK      Edge nginx network (default: nginx-network)
EOF
      exit 0
      ;;
    *)
      if [[ "$1" =~ ^- ]]; then
        printf 'Unknown option: %s\n' "$1" >&2
        exit 1
      fi
      target="$1"
      shift
      ;;
  esac
done

# Resolve image and revision
image=""
image_id=""
revision=""

if git rev-parse --verify "${target}^{commit}" >/dev/null 2>&1; then
  revision="$(git rev-parse --verify "${target}^{commit}")"
  image="travel-cards:git-${revision}"

  if [[ "$allow_dirty" != true && -n "$(git status --porcelain)" ]]; then
    printf 'Error: Working tree has uncommitted changes. Commit/stash them first or use --allow-dirty.\n' >&2
    exit 1
  fi

  if docker image inspect "$image" >/dev/null 2>&1; then
    printf 'Release image %s already exists, reusing.\n' "$image"
  else
    printf 'Building immutable release image for %s...\n' "$revision"
    ./scripts/build-release.sh "$revision"
  fi
elif docker image inspect "$target" >/dev/null 2>&1; then
  image="$target"
else
  printf 'Error: Cannot resolve "%s" as a valid git commit or Docker image.\n' "$target" >&2
  exit 1
fi

# Resolve the mutable tag once; verify, test and deploy this exact image.
image_id="$(docker image inspect --format '{{.Id}}' "$image")"
actual_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_id")"
actual_sha="$(docker image inspect --format '{{ index .Config.Labels "win.keyi.travel-cards.source-sha256" }}' "$image_id")"
if [[ ! "$actual_revision" =~ ^[0-9a-f]{40}$ ]] ||
   [[ -n "$revision" && "$actual_revision" != "$revision" ]] ||
   [[ "$(git rev-parse --verify "${actual_revision}^{commit}" 2>/dev/null)" != "$actual_revision" ]]; then
  printf 'Error: Release image must identify the exact available Git commit.\n' >&2
  exit 1
fi
revision="$actual_revision"
source_sha="$(git archive --format=tar "$revision" | sha256sum | cut -d ' ' -f 1)"
if [[ "$actual_sha" != "$source_sha" ]]; then
  printf 'Error: Release image source archive SHA-256 does not match its Git revision.\n' >&2
  exit 1
fi

if [[ "$skip_tests" != true ]]; then
  printf 'Running isolated verification (test:oauth)...\n'
  TRAVEL_CARDS_TEST_IMAGE="$image_id" npm run test:oauth
fi

app_port="${APP_PORT:-3100}"
meemo_net="${MEEMO_NETWORK:-meemo_backend}"
edge_net="${EDGE_NETWORK:-nginx-network}"
oauth_override="${MCP_OAUTH_ENABLED:-}"
compose_cmd=(docker compose -p travel-cards -f docker-compose.yml)
if [[ -n "$oauth_override" ]]; then
  compose_cmd+=(-f docker-compose.production.yml)
fi

for network in "$meemo_net" "$edge_net"; do
  if ! docker network inspect "$network" >/dev/null 2>&1; then
    printf 'Error: Required network "%s" does not exist.\n' "$network" >&2
    exit 1
  fi
done
if [[ "$(docker inspect mongodb --format '{{.State.Running}}')" != true ]]; then
  printf 'Error: Required container "mongodb" is not running.\n' >&2
  exit 1
fi

new_compose() {
  TRAVEL_CARDS_IMAGE="$image_id" MCP_OAUTH_ENABLED="${oauth_override:-false}" \
  APP_PORT="$app_port" MEEMO_NETWORK="$meemo_net" EDGE_NETWORK="$edge_net" \
    "${compose_cmd[@]}" "$@"
}
new_compose config --quiet

# The rollback snapshot contains credentials; never print it or reuse new overrides.
umask 077
snapshot="$(mktemp -d "${TMPDIR:-/tmp}/travel-cards-rollback.XXXXXXXX")"
keep_snapshot=false
trap 'if [[ "$keep_snapshot" == false ]]; then rm -rf -- "$snapshot"; fi' EXIT
old_image=""
old_container="$(docker container ls --all --filter 'name=^/travel-cards-web-1$' --format '{{.ID}}')"
if [[ -n "$old_container" ]]; then
  docker inspect "$old_container" > "$snapshot/container.json"
  node --input-type=commonjs - "$snapshot" <<'NODE'
const fs = require('node:fs');
const dir = process.argv[2];
const [old] = JSON.parse(fs.readFileSync(`${dir}/container.json`, 'utf8'));
const config = old.Config;
const host = old.HostConfig;
function reject(message) {
  console.error(`Error: Cannot safely snapshot the current deployment: ${message}`);
  process.exit(1);
}
if (config.Labels?.['com.docker.compose.project'] !== 'travel-cards' || config.Labels?.['com.docker.compose.service'] !== 'web') reject('unexpected container ownership');
// This app has no mounts or special host privileges/resources; refuse silent loss of extras.
if (old.Mounts?.length || host.Binds?.length || host.Mounts?.length || Object.keys(host.Tmpfs || {}).length || host.VolumesFrom?.length) reject('mounts are not supported by this rollback path');
if (host.Privileged || host.ReadonlyRootfs || host.CapAdd?.length || host.CapDrop?.length || host.SecurityOpt?.length || host.Devices?.length || host.DeviceRequests?.length || host.Sysctls && Object.keys(host.Sysctls).length) reject('custom security or device settings');
if (host.Memory || host.MemoryReservation || host.MemorySwap || host.NanoCpus || host.CpuShares || host.CpuQuota || host.CpuPeriod || host.CpusetCpus || host.CpusetMems || host.PidsLimit > 0 || host.Ulimits?.length) reject('custom resource limits');
if (['host', 'none'].includes(host.NetworkMode) || host.NetworkMode?.startsWith('container:') || host.Dns?.length || host.DnsOptions?.length || host.DnsSearch?.length || host.ExtraHosts?.length || host.Links?.length || host.PidMode || host.UTSMode || host.UsernsMode || host.IpcMode && host.IpcMode !== 'private' || host.Runtime && host.Runtime !== 'runc') reject('custom host or network settings');
if (config.Healthcheck || config.StopSignal || host.RestartPolicy?.MaximumRetryCount || host.ShmSize && host.ShmSize !== 67108864) reject('custom health, stop, restart or shared-memory settings');
const ports = Object.entries(old.NetworkSettings.Ports || {}).flatMap(([target, bindings]) => (bindings || []).map(binding => {
  const [port, protocol] = target.split('/');
  return { target: Number(port), published: binding.HostPort, host_ip: binding.HostIp, protocol };
}));
const healthPort = ports.find(port => port.target === 3000 && port.protocol === 'tcp' && ['127.0.0.1', '0.0.0.0', ''].includes(port.host_ip));
if (!healthPort) reject('no local IPv4 health port for container port 3000');
const networks = {};
const serviceNetworks = {};
Object.entries(old.NetworkSettings.Networks || {}).forEach(([name, network], index) => {
  if (Object.keys(network.IPAMConfig || {}).length || network.Links?.length || network.DriverOpts && Object.keys(network.DriverOpts).length) reject('custom network endpoint settings');
  const key = `original${index}`;
  networks[key] = { external: true, name };
  serviceNetworks[key] = { aliases: network.Aliases || [] };
});
if (!Object.keys(networks).length) reject('no original networks');
const labels = Object.fromEntries(Object.entries(config.Labels || {}).filter(([key]) => !key.startsWith('com.docker.compose.')));
const rollback = { services: { web: {
  image: old.Image,
  environment: config.Env || [],
  ports, networks: serviceNetworks, labels,
  restart: host.RestartPolicy?.Name || 'no',
  ...(host.LogConfig?.Type ? { logging: { driver: host.LogConfig.Type, options: host.LogConfig.Config || {} } } : {}),
  command: config.Cmd || [], entrypoint: config.Entrypoint || [],
  user: config.User || '', working_dir: config.WorkingDir || '',
  init: host.Init || false, tty: config.Tty || false, stdin_open: config.OpenStdin || false,
} }, networks };
// Compose interpolates even JSON strings; escape dollars in the captured environment.
fs.writeFileSync(`${dir}/rollback.json`, JSON.stringify(rollback, (_key, value) => typeof value === 'string' ? value.replaceAll('$', () => '$$') : value));
fs.writeFileSync(`${dir}/image`, old.Image);
fs.writeFileSync(`${dir}/port`, healthPort.published);
NODE
  old_image="$(cat "$snapshot/image")"
  old_port="$(cat "$snapshot/port")"
  rollback_cmd=(docker compose -p travel-cards -f "$snapshot/rollback.json")
  "${rollback_cmd[@]}" config --quiet
fi

wait_for_health() {
  local port="$1"
  for attempt in {1..30}; do
    if curl --fail --silent --max-time 2 "http://127.0.0.1:${port}/api/health/live" >/dev/null 2>&1 &&
       curl --fail --silent --max-time 2 "http://127.0.0.1:${port}/api/health/ready" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

printf 'Switching web service to image %s...\n' "$image_id"
if new_compose up -d --no-deps --no-build --pull never web &&
   [[ "$(docker inspect travel-cards-web-1 --format '{{.Image}}')" == "$image_id" ]] &&
   wait_for_health "$app_port"; then
  printf '\nDeployment successful!\nImage: %s (%s)\nRevision: %s\n' "$image" "$image_id" "$revision"
  printf 'Health check: live & ready OK on port %s\n' "$app_port"
else
  printf 'Error: Deployment switch or health verification failed.\n' >&2
  if [[ -z "$old_image" ]]; then
    printf 'No previous container is available for rollback.\n' >&2
  elif "${rollback_cmd[@]}" up -d --no-deps --no-build --pull never web &&
       [[ "$(docker inspect travel-cards-web-1 --format '{{.Image}}')" == "$old_image" ]] &&
       wait_for_health "$old_port"; then
    printf 'Rollback completed; previous image and configuration are healthy.\n' >&2
  else
    keep_snapshot=true
    printf 'Error: Rollback failed or previous service is unhealthy; manual recovery required.\n' >&2
    printf 'Private recovery configuration retained at %s/rollback.json; remove after recovery.\n' "$snapshot" >&2
  fi
  exit 1
fi
