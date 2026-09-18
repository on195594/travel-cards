import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const SERVER_ONLY = [
  "/auth.ts",
  "/lib/db.ts",
  "/lib/env.ts",
  "/lib/storage.ts",
  "/lib/guides/repository.ts",
  "/lib/guides/service.ts",
];

async function resolveSource(from: string, specifier: string, sourceRoot: string) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return undefined;
  const base = specifier.startsWith("@/")
    ? path.join(sourceRoot, specifier.slice(2))
    : path.resolve(path.dirname(from), specifier);
  for (const candidate of [base, ...SOURCE_EXTENSIONS.map((extension) => base + extension), ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`))]) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {}
  }
  return undefined;
}

async function serverOnlyImports(entry: string, sourceRoot: string) {
  const pending = [entry];
  const visited = new Set<string>();
  const violations = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = await readFile(file, "utf8");
    const imports = source.matchAll(/(?:import(?!\s+type\b)[\s\S]*?from\s*|import\s*|export\s+(?:\*|\{[^}]*\})\s+from\s*)["']([^"']+)["']/g);
    for (const match of imports) {
      const dependency = await resolveSource(file, match[1], sourceRoot);
      if (!dependency) continue;
      const normalized = dependency.split(path.sep).join("/");
      if (SERVER_ONLY.some((suffix) => normalized.endsWith(suffix))) violations.add(normalized);
      else pending.push(dependency);
    }
  }
  return [...violations];
}

describe("client/server module boundary", () => {
  it("keeps client components away from server-only modules", async () => {
    const sourceRoot = path.resolve("src");
    for (const component of ["guide-editor.tsx", "guide-search.tsx", "guide-card.tsx"]) {
      await expect(serverOnlyImports(path.join(sourceRoot, "components", component), sourceRoot)).resolves.toEqual([]);
    }
  });

  it("detects an indirect server-only import", async () => {
    const sourceRoot = await mkdtemp(path.join(tmpdir(), "travel-cards-boundary-"));
    await mkdir(path.join(sourceRoot, "components"), { recursive: true });
    await mkdir(path.join(sourceRoot, "lib", "guides"), { recursive: true });
    const client = path.join(sourceRoot, "components", "client.tsx");
    await writeFile(client, '"use client"; import { value } from "../middle"; export default value;');
    await writeFile(path.join(sourceRoot, "middle.ts"), 'export { value } from "./lib/guides/repository";');
    await writeFile(path.join(sourceRoot, "lib", "guides", "repository.ts"), "export const value = 1;");
    expect(await serverOnlyImports(client, sourceRoot)).toHaveLength(1);
  });
});