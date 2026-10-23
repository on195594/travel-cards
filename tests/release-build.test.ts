import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("builds only the selected commit, verifies provenance, and refuses to reuse a release tag (fake Docker)", () => {
  const fixture = mkdtempSync(join(tmpdir(), "travel-cards-release-test-"));
  const env = { ...process.env, PATH: `${fixture}/bin:${process.env.PATH}`, TMPDIR: `${fixture}/tmp`, FAKE_DOCKER_DIR: fixture };
  const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: fixture, env, stdio: ["ignore", "pipe", "pipe"] });
  try {
    for (const dir of ["scripts", "bin", "tmp"]) mkdirSync(join(fixture, dir));
    copyFileSync("scripts/build-release.sh", join(fixture, "scripts/build-release.sh"));
    copyFileSync("Dockerfile", join(fixture, "Dockerfile"));
    writeFileSync(join(fixture, "marker"), "reviewed source");
    run("git", ["init", "-q"]);
    run("git", ["add", "scripts", "Dockerfile", "marker"]);
    run("git", ["-c", "user.name=Release Test", "-c", "user.email=test@example.test", "commit", "-qm", "fixture"]);
    const revision = run("git", ["rev-parse", "HEAD"]).toString().trim();
    const sha = createHash("sha256").update(run("git", ["archive", "--format=tar", revision])).digest("hex");
    writeFileSync(join(fixture, "marker"), "uncommitted source");
    writeFileSync(join(fixture, ".env.local"), "FAKE_SECRET=must-not-be-in-snapshot");
    writeFileSync(join(fixture, "bin/docker"), `#!/usr/bin/env node
const fs = require("node:fs");
const assert = require("node:assert/strict");
const args = process.argv.slice(2);
const state = process.env.FAKE_DOCKER_DIR + "/image.json";
if (args[0] === "build") {
  const context = args.at(-1);
  assert.equal(fs.readFileSync(context + "/marker", "utf8"), "reviewed source");
  assert.equal(fs.existsSync(context + "/.env.local"), false);
  const values = Object.fromEntries(args.filter(x => x.startsWith("SOURCE_")).map(x => x.split("=")));
  fs.writeFileSync(state, JSON.stringify(values));
} else {
  if (!fs.existsSync(state)) process.exit(1);
  if (!args.includes("--format")) process.exit(0);
  const values = JSON.parse(fs.readFileSync(state, "utf8"));
  const format = args[args.indexOf("--format") + 1];
  console.log(process.env.FAKE_BAD_LABEL ? "unknown" : format.includes("revision") ? values.SOURCE_REVISION : format.includes("source-sha256") ? values.SOURCE_SHA256 : "sha256:fake-image-id");
}
`, { mode: 0o755 });
    const build = () => spawnSync("bash", ["scripts/build-release.sh", revision], { cwd: fixture, env, encoding: "utf8", timeout: 10_000 });
    const first = build();
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain(`revision=${revision}\nsource_sha256=${sha}`);
    expect(first.stdout).toContain("image_id=sha256:fake-image-id");
    const duplicate = build();
    expect(duplicate.status).toBe(1);
    expect(duplicate.stderr).toContain("Refusing to overwrite");
    rmSync(join(fixture, "image.json"));
    const wrongLabel = spawnSync("bash", ["scripts/build-release.sh", revision], { cwd: fixture, env: { ...env, FAKE_BAD_LABEL: "true" }, encoding: "utf8", timeout: 10_000 });
    expect(wrongLabel.status).toBe(1);
    expect(wrongLabel.stderr).toContain("provenance mismatch");
    expect(readdirSync(join(fixture, "tmp"))).toEqual([]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
