import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearConfigCache, loadConfig, mergeConfig } from "../src/config/load.js";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";

describe("config merge", () => {
  test("a list replaces the default, its Extra sibling appends", () => {
    const config = mergeConfig({ structure: { allow: ["lib/**"], allowExtra: ["widgets/**"] } });
    expect(config.structure.allow).toEqual(["lib/**", "widgets/**"]);
  });

  test("Extra alone keeps the defaults", () => {
    const config = mergeConfig({ structure: { allowExtra: ["widgets/**"] } });
    expect(config.structure.allow).toEqual([...DEFAULT_CONFIG.structure.allow, "widgets/**"]);
  });

  test("a false value removes an inherited denied tag", () => {
    const config = mergeConfig({ elements: { deny: { label: false, marquee: "anything" } } });
    expect(config.elements.deny.label).toBeUndefined();
    expect(config.elements.deny.marquee).toBe("anything");
    expect(config.elements.deny.button).toBe(DEFAULT_CONFIG.elements.deny.button);
  });

  test("a bare string deny pattern gets a default message", () => {
    const config = mergeConfig({ structure: { deny: ["legacy/**"] } });
    expect(config.structure.deny[0]).toEqual({ pattern: "legacy/**", message: "`legacy/**` is a denied location." });
  });

  test("later layers win", () => {
    const config = mergeConfig({ components: { max: 2 } }, { components: { max: 3 } });
    expect(config.components.max).toBe(3);
  });
});

describe("config discovery", () => {
  test("reads the nearest ancestor config", () => {
    clearConfigCache();
    const root = mkdtempSync(join(tmpdir(), "strict-lint-"));
    writeFileSync(join(root, "strictlint.config.json"), JSON.stringify({ components: { max: 4 } }));
    expect(loadConfig(join(root, "src", "app", "page.tsx")).components.max).toBe(4);
  });

  test("a malformed config throws instead of falling back to defaults", () => {
    clearConfigCache();
    const root = mkdtempSync(join(tmpdir(), "strict-lint-"));
    writeFileSync(join(root, "strictlint.config.json"), "{ not json");
    expect(() => loadConfig(join(root, "src", "app", "page.tsx"))).toThrow(/is not valid JSON/);
    clearConfigCache();
  });
});

describe("discovery boundaries", () => {
  test("a project without a config does not inherit one from above the repo root", () => {
    const outer = mkdtempSync(join(tmpdir(), "strict-lint-outer-"));
    writeFileSync(join(outer, "strictlint.config.json"), JSON.stringify({ components: { max: 9 } }));

    const repo = join(outer, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    mkdirSync(join(repo, "src"), { recursive: true });

    clearConfigCache();
    const config = loadConfig(join(repo, "src", "App.tsx"));
    expect(config.components.max).toBe(DEFAULT_CONFIG.components.max);
  });

  test("editing a config file takes effect without clearing the cache", () => {
    const repo = mkdtempSync(join(tmpdir(), "strict-lint-live-"));
    mkdirSync(join(repo, ".git"), { recursive: true });
    const configPath = join(repo, "strictlint.config.json");
    const file = join(repo, "App.tsx");

    writeFileSync(configPath, JSON.stringify({ components: { max: 2 } }));
    clearConfigCache();
    expect(loadConfig(file).components.max).toBe(2);

    writeFileSync(configPath, JSON.stringify({ components: { max: 5 } }));
    utimesSync(configPath, new Date(), new Date(Date.now() + 2000));
    expect(loadConfig(file).components.max).toBe(5);
  });
});
