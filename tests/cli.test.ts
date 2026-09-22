import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

interface Project {
  dir: string;
  read: (name: string) => string;
  has: (name: string) => boolean;
}

function project(pkg: Record<string, unknown> = {}, files: Record<string, string> = {}): Project {
  const dir = mkdtempSync(join(tmpdir(), "strict-lint-cli-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", ...pkg }, null, 2));
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(dir, name), contents);
  return {
    dir,
    read: (name) => readFileSync(join(dir, name), "utf8"),
    has: (name) => existsSync(join(dir, name)),
  };
}

function init(dir: string, ...args: string[]): { code: number; out: string } {
  const result = spawnSync("bun", [CLI, "init", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, npm_config_user_agent: "" },
  });
  return { code: result.status ?? 1, out: `${result.stdout}${result.stderr}` };
}

describe("init targets", () => {
  test("a project with no linter installed is scaffolded for oxlint", () => {
    const fixture = project();
    const { code, out } = init(fixture.dir, "--no-install");

    expect(code).toBe(0);
    expect(fixture.has("strictlint.config.json")).toBe(true);
    expect(fixture.has(".oxlintrc.json")).toBe(true);
    expect(fixture.has("eslint.config.mjs")).toBe(false);
    expect(out).toContain("Lint with oxlint");
  });

  test("eslint in devDependencies writes a flat config instead", () => {
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } });
    const { code } = init(fixture.dir, "--no-install");

    expect(code).toBe(0);
    expect(fixture.has("eslint.config.mjs")).toBe(true);
    expect(fixture.has(".oxlintrc.json")).toBe(false);
    expect(fixture.read("eslint.config.mjs")).toContain("strictLint.configs.recommended");
  });

  test("both linters installed wires up both", () => {
    const fixture = project({ devDependencies: { eslint: "^9.0.0", oxlint: "^1.0.0" } });
    init(fixture.dir, "--no-install");

    expect(fixture.has(".oxlintrc.json")).toBe(true);
    expect(fixture.has("eslint.config.mjs")).toBe(true);
  });

  test("an existing flat config is printed, never rewritten", () => {
    const original = "export default [];\n";
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } }, { "eslint.config.mjs": original });
    const { out } = init(fixture.dir, "--no-install");

    expect(fixture.read("eslint.config.mjs")).toBe(original);
    expect(out).toContain("Add this to eslint.config.mjs");
    expect(out).toContain("strictLint.configs.recommended");
  });

  test("--force replaces an existing flat config", () => {
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } }, { "eslint.config.mjs": "export default [];\n" });
    init(fixture.dir, "--no-install", "--force");

    expect(fixture.read("eslint.config.mjs")).toContain("strictLint.configs.recommended");
  });

  test("an existing oxlint config keeps its own keys and rules", () => {
    const existing = JSON.stringify({ categories: { correctness: "error" }, rules: { eqeqeq: "warn" } });
    const fixture = project({}, { ".oxlintrc.json": existing });
    init(fixture.dir, "--no-install");

    const patched = JSON.parse(fixture.read(".oxlintrc.json"));
    expect(patched.jsPlugins).toEqual(["@nexlytech.dev/strict-lint"]);
    expect(patched.categories).toEqual({ correctness: "error" });
    expect(patched.rules.eqeqeq).toBe("warn");
    expect(patched.rules["strict-lint/folder-structure"]).toBe("error");
  });
});

describe("init install", () => {
  test("--dry-run reports the install without touching the project", () => {
    const fixture = project();
    const { out } = init(fixture.dir, "--dry-run");

    expect(out).toContain("would run  npm install -D @nexlytech.dev/strict-lint");
    expect(fixture.has("strictlint.config.json")).toBe(false);
  });

  test("an eslint project also installs the parser the generated config imports", () => {
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } });
    const { out } = init(fixture.dir, "--dry-run");

    expect(out).toContain("@nexlytech.dev/strict-lint @typescript-eslint/parser");
  });

  test("dependencies already declared are not reinstalled", () => {
    const fixture = project({
      devDependencies: {
        eslint: "^9.0.0",
        "@typescript-eslint/parser": "^8.0.0",
        "@nexlytech.dev/strict-lint": "^0.3.0",
      },
    });
    const { out } = init(fixture.dir, "--dry-run");

    expect(out).not.toContain("would run");
  });

  test("the detected package manager decides the install command", () => {
    const fixture = project({}, { "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" });
    const { out } = init(fixture.dir, "--dry-run");

    expect(out).toContain("would run  pnpm add -D @nexlytech.dev/strict-lint");
  });

  test("--no-install prints the command rather than running it", () => {
    const fixture = project();
    const { out } = init(fixture.dir, "--no-install");

    expect(out).toContain("Install the dependencies");
    expect(out).toContain("npm install -D @nexlytech.dev/strict-lint");
  });
});

describe("init guards", () => {
  test("a directory without a package.json is rejected", () => {
    const dir = mkdtempSync(join(tmpdir(), "strict-lint-bare-"));
    const { code, out } = init(dir, "--no-install");

    expect(code).toBe(1);
    expect(out).toContain("Run this from your project root");
  });

  test("a misspelled flag fails instead of silently installing", () => {
    const fixture = project();
    const { code, out } = init(fixture.dir, "--no-instal");

    expect(code).toBe(1);
    expect(out).toContain("Unknown option --no-instal");
    expect(fixture.has("strictlint.config.json")).toBe(false);
  });

  test("rerunning keeps the config the user has already tuned", () => {
    const fixture = project();
    init(fixture.dir, "--no-install");
    writeFileSync(join(fixture.dir, "strictlint.config.json"), '{ "root": "app" }\n');
    const { out } = init(fixture.dir, "--no-install");

    expect(fixture.read("strictlint.config.json")).toBe('{ "root": "app" }\n');
    expect(out).toContain("already exists");
  });
});
