import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  test("an existing flat config is patched in place", () => {
    const original = 'import js from "@eslint/js";\n\nexport default [\n  js.configs.recommended,\n];\n';
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } }, { "eslint.config.mjs": original });
    const { out } = init(fixture.dir, "--no-install");

    const patched = fixture.read("eslint.config.mjs");
    expect(patched).toContain("strictLint.configs.recommended");
    expect(patched).toContain("js.configs.recommended,");
    expect(fixture.read("eslint.config.mjs.bak")).toBe(original);
    expect(out).toContain("backup: eslint.config.mjs.bak");
  });

  test("patching is idempotent", () => {
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } }, { "eslint.config.mjs": "export default [];\n" });
    init(fixture.dir, "--no-install");
    const once = fixture.read("eslint.config.mjs");
    const { out } = init(fixture.dir, "--no-install");

    expect(fixture.read("eslint.config.mjs")).toBe(once);
    expect(out).toContain("already references the plugin");
  });

  test("a shape it cannot recognise is left alone and printed instead", () => {
    const original = "export default makeConfig;\n";
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } }, { "eslint.config.mjs": original });
    const { out } = init(fixture.dir, "--no-install");

    expect(fixture.read("eslint.config.mjs")).toBe(original);
    expect(fixture.has("eslint.config.mjs.bak")).toBe(false);
    expect(out).toContain("Add this to eslint.config.mjs");
  });

  test("--no-edit prints rather than patching", () => {
    const original = "export default [];\n";
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } }, { "eslint.config.mjs": original });
    const { out } = init(fixture.dir, "--no-install", "--no-edit");

    expect(fixture.read("eslint.config.mjs")).toBe(original);
    expect(out).toContain("Add this to eslint.config.mjs");
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

describe("preset selection", () => {
  const withSource = (files: Record<string, string> = {}) =>
    project({ devDependencies: { eslint: "^9.0.0" } }, files);

  test("a project that already has source files gets warnings, not errors", () => {
    const fixture = withSource({ "eslint.config.mjs": "export default [];\n" });
    mkdirSync(join(fixture.dir, "src"), { recursive: true });
    writeFileSync(join(fixture.dir, "src", "App.tsx"), "export const App = () => null;\n");

    const { out } = init(fixture.dir, "--no-install");

    expect(fixture.read("eslint.config.mjs")).toContain("strictLint.configs.warn");
    expect(out).toContain("reporting as warnings");
  });

  test("an empty project gets the strict preset", () => {
    const fixture = withSource({ "eslint.config.mjs": "export default [];\n" });
    init(fixture.dir, "--no-install");

    expect(fixture.read("eslint.config.mjs")).toContain("strictLint.configs.recommended");
  });

  test("--strict overrides the warning default", () => {
    const fixture = withSource({ "eslint.config.mjs": "export default [];\n" });
    mkdirSync(join(fixture.dir, "src"), { recursive: true });
    writeFileSync(join(fixture.dir, "src", "App.tsx"), "export const App = () => null;\n");

    init(fixture.dir, "--no-install", "--strict");

    expect(fixture.read("eslint.config.mjs")).toContain("strictLint.configs.recommended");
  });

  test("oxlint severities follow the same preset", () => {
    const fixture = project({ devDependencies: { oxlint: "^1.0.0" } });
    mkdirSync(join(fixture.dir, "src"), { recursive: true });
    writeFileSync(join(fixture.dir, "src", "App.tsx"), "export const App = () => null;\n");

    init(fixture.dir, "--no-install");

    const config = JSON.parse(fixture.read(".oxlintrc.json"));
    expect(config.rules["strict-lint/folder-structure"]).toBe("warn");
  });
});

describe("patching matches what the host config already does", () => {
  test("a config that already parses TypeScript gets the preset and nothing else", () => {
    const host = 'import tseslint from "typescript-eslint";\n\nexport default [\n  ...tseslint.configs.recommended,\n];\n';
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } }, { "eslint.config.mjs": host });
    const { out } = init(fixture.dir, "--no-install");

    const patched = fixture.read("eslint.config.mjs");
    expect(patched).toContain("strictLint.configs.recommended,");
    expect(patched).not.toContain("tsParser");
    expect(patched).not.toContain("ecmaFeatures");
    expect(out).not.toContain("@typescript-eslint/parser");
  });

  test("the host's own language options are left intact", () => {
    const host = 'import tseslint from "typescript-eslint";\n\nexport default [\n  { languageOptions: { parser: hostParser } },\n];\n';
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } }, { "eslint.config.mjs": host });
    init(fixture.dir, "--no-install");

    expect(fixture.read("eslint.config.mjs")).toContain("parser: hostParser");
  });

  test("eslint-config-next counts as TypeScript coverage", () => {
    const fixture = project(
      { devDependencies: { eslint: "^9.0.0", "eslint-config-next": "^16.0.0" } },
      { "eslint.config.mjs": "export default [\n  base,\n];\n" },
    );
    init(fixture.dir, "--no-install");

    expect(fixture.read("eslint.config.mjs")).not.toContain("tsParser");
  });

  test("a config with no TypeScript support gets the parser, or the rules would skip .tsx", () => {
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } }, { "eslint.config.mjs": "export default [];\n" });
    const { out } = init(fixture.dir, "--no-install");

    expect(fixture.read("eslint.config.mjs")).toContain("parser: tsParser");
    expect(out).toContain("@typescript-eslint/parser");
  });
});

describe("whatever init writes parses", () => {
  const HOSTS: [string, string][] = [
    ["plain array", "export default [\n  base,\n];\n"],
    ["next-style defineConfig", "const c = defineConfig([\n  ...next,\n]);\n\nexport default c;\n"],
    ["no trailing comma", "export default [\n  base\n];\n"],
    ["empty", "export default [];\n"],
  ];

  test.each(HOSTS)("%s", (_name, host) => {
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } }, { "eslint.config.mjs": host });
    init(fixture.dir, "--no-install");

    const written = join(fixture.dir, "eslint.config.mjs");
    expect(fixture.read("eslint.config.mjs")).not.toContain(",,");
    expect(() => execFileSync("node", ["--check", written], { stdio: "pipe" })).not.toThrow();
  });

  test("a config created from scratch parses too", () => {
    const fixture = project({ devDependencies: { eslint: "^9.0.0" } });
    init(fixture.dir, "--no-install");

    const written = join(fixture.dir, "eslint.config.mjs");
    expect(() => execFileSync("node", ["--check", written], { stdio: "pipe" })).not.toThrow();
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
