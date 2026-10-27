import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repo = resolve(import.meta.dirname, "..");
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
const sourceSha = execFileSync("bash", ["-o", "pipefail", "-c", 'git archive --format=tar "$1" | sha256sum', "--", revision], { cwd: repo, encoding: "utf8" }).split(" ")[0];
const newImage = `sha256:${"a".repeat(64)}`;
const oldImage = `sha256:${"b".repeat(64)}`;
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function run(options: Record<string, string> = {}, target = revision, skipTests = false) {
  const dir = mkdtempSync(join(tmpdir(), "travel-cards-deploy-test-"));
  directories.push(dir);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const old = {
    Image: oldImage,
    Config: {
      Env: ["MCP_OAUTH_ENABLED=true", "AUTH_SECRET=fake-only-$literal\nsecond line"],
      Cmd: ["node", "server.js"], Entrypoint: ["docker-entrypoint.sh"],
      User: "nextjs", WorkingDir: "/app",
      Labels: { "com.docker.compose.project": "travel-cards", "com.docker.compose.service": "web" },
    },
    HostConfig: { RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 }, IpcMode: "private", LogConfig: { Type: "json-file", Config: { "max-file": "3", "max-size": "50m" } } },
    Mounts: options.FAKE_MOUNT ? [{ Source: "/sensitive", Destination: "/data" }] : [],
    NetworkSettings: {
      Ports: { "3000/tcp": [{ HostIp: "127.0.0.1", HostPort: "3100" }] },
      Networks: { "original-backend": { Aliases: ["web"], IPAMConfig: null }, "original-edge": { Aliases: ["travel-cards-web"], IPAMConfig: options.FAKE_STATIC_IP ? { IPv4Address: "192.0.2.10" } : {} } },
    },
  };
  writeFileSync(join(dir, "old.json"), JSON.stringify([old]));
  const scripts: Record<string, string> = {
    docker: `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.FAKE_DIR;
const args = process.argv.slice(2);
const write = (name, value) => fs.writeFileSync(path.join(dir, name), value);
const output = value => process.stdout.write(String(value));
fs.appendFileSync(path.join(dir, 'docker-calls'), JSON.stringify(args) + '\\n');
if (args[0] === 'image' && args[1] === 'inspect') {
  const format = args[args.indexOf('--format') + 1];
  if (!args.includes('--format')) output('[]');
  else if (format === '{{.Id}}') output(fs.existsSync(path.join(dir, 'tag-moved')) ? 'sha256:moved-tag' : process.env.FAKE_NEW_IMAGE);
  else if (format.includes('source-sha256')) output(process.env.FAKE_BAD_SHA || process.env.FAKE_SOURCE_SHA);
  else output(process.env.FAKE_BAD_REVISION || process.env.FAKE_REVISION);
} else if (args[0] === 'network') {
  process.exit(0);
} else if (args[0] === 'container') {
  if (!process.env.FAKE_NO_OLD) output('old-container');
} else if (args[0] === 'inspect') {
  if (args[1] === 'mongodb') output('true');
  else if (args[1] === 'old-container') output(fs.readFileSync(path.join(dir, 'old.json')));
  else output(fs.readFileSync(path.join(dir, 'active-image'), 'utf8'));
} else if (args[0] === 'compose') {
  const rollbackFile = args.find(arg => arg.endsWith('/rollback.json'));
  if (args.includes('config')) {
    if (rollbackFile) write('snapshot-mode', String(fs.statSync(rollbackFile).mode & 0o777));
    process.exit(0);
  }
  if (!args.includes('up')) process.exit(90);
  if (rollbackFile) {
    write('rollback-copy.json', fs.readFileSync(rollbackFile));
    write('snapshot-path', path.dirname(rollbackFile));
    write('stage', 'old');
    write('active-image', process.env.FAKE_OLD_IMAGE);
    if (process.env.FAKE_ROLLBACK_FAIL) process.exit(1);
  } else {
    write('deploy-image', process.env.TRAVEL_CARDS_IMAGE);
    write('stage', 'new');
    write('active-image', process.env.TRAVEL_CARDS_IMAGE);
    if (process.env.FAKE_SWITCH_FAIL) process.exit(1);
  }
} else process.exit(91);
`,
    npm: `#!/usr/bin/env bash
printf '%s' "$TRAVEL_CARDS_TEST_IMAGE" > "$FAKE_DIR/test-image"
printf '%s' "$*" > "$FAKE_DIR/test-command"
: > "$FAKE_DIR/tag-moved"
[[ -z "\${FAKE_PREFLIGHT_FAIL:-}" ]]
`,
    curl: `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_DIR/health-calls"
read -r stage < "$FAKE_DIR/stage" || true
if [[ "$stage" == new && -n "\${FAKE_HEALTH_FAIL:-}" || "$stage" == old && -n "\${FAKE_ROLLBACK_HEALTH_FAIL:-}" ]]; then exit 1; fi
`,
    sleep: "#!/usr/bin/env bash\nexit 0\n",
  };
  for (const [name, content] of Object.entries(scripts)) {
    writeFileSync(join(bin, name), content);
    chmodSync(join(bin, name), 0o700);
  }
  const result = spawnSync("bash", [join(repo, "scripts/deploy.sh"), target, "--allow-dirty", ...(skipTests ? ["--skip-tests"] : [])], {
    cwd: repo, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: dir,
      FAKE_DIR: dir, FAKE_NEW_IMAGE: newImage, FAKE_OLD_IMAGE: oldImage, FAKE_REVISION: revision, FAKE_SOURCE_SHA: sourceSha,
      APP_PORT: "3200", MCP_OAUTH_ENABLED: "false", MEEMO_NETWORK: "new-backend", EDGE_NETWORK: "new-edge", ...options },
  });
  if (result.error) throw result.error;
  const read = (file: string) => existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : "";
  return { ...result, read, dir, output: result.stdout + result.stderr };
}

describe("release deployment with fake Docker, curl and npm", () => {
  it.each(["revision", "sha"])("rejects a reused commit image with wrong %s even when tests are skipped", (field) => {
    const result = run(field === "revision" ? { FAKE_BAD_REVISION: "f".repeat(40) } : { FAKE_BAD_SHA: "f".repeat(64) }, revision, true);
    expect(result.status).toBe(1);
    expect(result.read("deploy-image")).toBe("");
    expect(result.read("test-image")).toBe("");
    expect(result.output).toContain("Error: Release image");
  });

  it("rejects an explicitly specified image without complete provenance", () => {
    const result = run({ FAKE_BAD_REVISION: "unknown" }, "travel-cards:custom", true);
    expect(result.status).toBe(1);
    expect(result.read("deploy-image")).toBe("");
  });

  it("tests and switches the same image ID even when its tag changes during preflight", () => {
    const result = run();
    expect(result.status, result.output).toBe(0);
    expect(result.read("test-command")).toBe("run test:oauth");
    expect(result.read("test-image")).toBe(newImage);
    expect(result.read("deploy-image")).toBe(newImage);
    expect(result.output).toContain("Deployment successful!");
    expect(result.read("rollback-copy.json")).toBe("");
    expect(result.output).not.toContain("fake-only");
  });

  it("does not switch when isolated verification fails", () => {
    const result = run({ FAKE_PREFLIGHT_FAIL: "1" });
    expect(result.status).toBe(1);
    expect(result.read("deploy-image")).toBe("");
  });

  it.each(["FAKE_SWITCH_FAIL", "FAKE_HEALTH_FAIL"])("restores original settings and rechecks health after %s", (failure) => {
    const result = run({ [failure]: "1" });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("Rollback completed;");
    const rollback = JSON.parse(result.read("rollback-copy.json"));
    expect(rollback.services.web.image).toBe(oldImage);
    expect(rollback.services.web.environment).toEqual(["MCP_OAUTH_ENABLED=true", "AUTH_SECRET=fake-only-$$literal\nsecond line"]);
    expect(rollback.services.web.ports).toEqual([{ target: 3000, published: "3100", host_ip: "127.0.0.1", protocol: "tcp" }]);
    expect(rollback.services.web.logging).toEqual({ driver: "json-file", options: { "max-file": "3", "max-size": "50m" } });
    expect(Object.values(rollback.networks)).toEqual([{ external: true, name: "original-backend" }, { external: true, name: "original-edge" }]);
    expect(result.read("health-calls")).toContain("http://127.0.0.1:3100/api/health/ready");
    expect(result.read("snapshot-mode")).toBe(String(0o600));
    expect(existsSync(result.read("snapshot-path"))).toBe(false);
    expect(result.output).not.toContain("fake-only");
    expect(result.output).not.toContain("Deployment successful!");
  });

  it.each(["FAKE_ROLLBACK_FAIL", "FAKE_ROLLBACK_HEALTH_FAIL"])("reports manual recovery instead of success after %s", (failure) => {
    const result = run({ FAKE_SWITCH_FAIL: "1", [failure]: "1" });
    expect(result.status).toBe(1);
    expect(result.output).toContain("manual recovery required");
    expect(result.output).not.toContain("Rollback completed");
    expect(existsSync(join(result.read("snapshot-path"), "rollback.json"))).toBe(true);
    expect(result.output).not.toContain("fake-only");
  });

  it("rejects unsupported original runtime settings before switching", () => {
    const result = run({ FAKE_MOUNT: "1" });
    expect(result.status).toBe(1);
    expect(result.output).toContain("mounts are not supported");
    expect(result.read("deploy-image")).toBe("");
  });

  it("rejects an explicit network IP while accepting empty IPAM in normal deployments", () => {
    const result = run({ FAKE_STATIC_IP: "1" });
    expect(result.status).toBe(1);
    expect(result.output).toContain("custom network endpoint settings");
    expect(result.read("deploy-image")).toBe("");
  });

  it("reports the missing rollback target on a failed first deployment", () => {
    const result = run({ FAKE_NO_OLD: "1", FAKE_SWITCH_FAIL: "1" });
    expect(result.status).toBe(1);
    expect(result.output).toContain("No previous container");
    expect(result.read("rollback-copy.json")).toBe("");
  });
});
