import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchFlatConfig, type FlatConfigPatch } from "../src/eslint-patch.js";

const PATCH: FlatConfigPatch = {
  imports: 'import strictLint from "@nexlytech.dev/strict-lint";\nimport tsParser from "@typescript-eslint/parser";',
  entries: `strictLint.configs.recommended,
{
  files: ["**/*.{ts,tsx,js,jsx}"],
  languageOptions: { parser: tsParser },
}`,
  marker: "@nexlytech.dev/strict-lint",
};

function patch(source: string): string {
  const result = patchFlatConfig(source, PATCH);
  if (result.status !== "patched") throw new Error(`expected a patch, got ${result.status}`);
  return result.source;
}

describe("flat config shapes", () => {
  test("a bare array export", () => {
    const out = patch(`import js from "@eslint/js";\n\nexport default [\n  js.configs.recommended,\n];\n`);
    expect(out).toContain('import strictLint from "@nexlytech.dev/strict-lint";');
    expect(out).toContain("  js.configs.recommended,\n  strictLint.configs.recommended,");
    expect(out.trimEnd().endsWith("];")).toBe(true);
  });

  test("defineConfig wrapping an array", () => {
    const out = patch(`import { defineConfig } from "eslint/config";\n\nexport default defineConfig([\n  base,\n]);\n`);
    expect(out).toContain("  base,\n  strictLint.configs.recommended,");
    expect(out.trimEnd().endsWith("]);")).toBe(true);
  });

  test("a variable declaration exported by name", () => {
    const source = `import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([".next/**"]),
]);

export default eslintConfig;
`;
    const out = patch(source);
    expect(out).toContain('globalIgnores([".next/**"]),\n  strictLint.configs.recommended,');
    expect(out).toContain("export default eslintConfig;");
    expect(out).toContain('import nextVitals from "eslint-config-next/core-web-vitals";');
  });

  test("a variadic tseslint.config call", () => {
    const out = patch(`import tseslint from "typescript-eslint";\n\nexport default tseslint.config(base, other);\n`);
    expect(out).toContain("strictLint.configs.recommended,");
    expect(out.trimEnd().endsWith(");")).toBe(true);
  });

  test("an empty array still gets a valid entry", () => {
    const out = patch(`export default [];\n`);
    expect(out).toContain("strictLint.configs.recommended,");
    expect(out).not.toContain("[,");
  });
});

describe("safety", () => {
  test("a config already referencing the plugin is left alone", () => {
    const source = `import strictLint from "@nexlytech.dev/strict-lint";\nexport default [strictLint.configs.recommended];\n`;
    expect(patchFlatConfig(source, PATCH).status).toBe("present");
  });

  test("an unrecognised export is reported, never guessed at", () => {
    const result = patchFlatConfig(`export default makeConfig;\n`, PATCH);
    expect(result.status).toBe("unsupported");
  });

  test("a file with no default export is reported", () => {
    const result = patchFlatConfig(`export const config = [];\n`, PATCH);
    expect(result).toEqual({ status: "unsupported", reason: "no `export default` found" });
  });

  test("brackets inside strings and comments do not derail the scan", () => {
    const source = `import js from "@eslint/js";

export default [
  // a stray ] and ( in a comment
  { files: ["**/*.[jt]s"], name: "has ] bracket" },
];
`;
    const out = patch(source);
    expect(out).toContain('name: "has ] bracket" },\n  strictLint.configs.recommended,');
  });

  test("multi-line import lists are not split", () => {
    const source = `import {
  defineConfig,
  globalIgnores,
} from "eslint/config";

export default defineConfig([]);
`;
    const out = patch(source);
    expect(out).toContain('} from "eslint/config";\nimport strictLint');
  });

  test("a config with no imports at all still gets them", () => {
    const out = patch(`export default [];\n`);
    expect(out.startsWith('import strictLint from "@nexlytech.dev/strict-lint";')).toBe(true);
  });
});

describe("the output always parses", () => {
  const SHAPES: [string, string][] = [
    ["plain array", 'export default [\n  a,\n];\n'],
    ["no trailing comma", 'export default [\n  a\n];\n'],
    ["last entry followed by a line comment", 'export default [\n  a // keep last\n];\n'],
    ["last entry followed by a block comment", 'export default [\n  a /* note */\n];\n'],
    ["a body of only comments", 'export default [\n  // nothing yet\n];\n'],
    ["empty array", "export default [];\n"],
    ["single line", "export default [a];\n"],
    ["defineConfig", 'export default defineConfig([\n  a\n]);\n'],
    ["variadic call", "export default tseslint.config(a, b);\n"],
    ["variable indirection", "const c = defineConfig([\n  a\n]);\n\nexport default c;\n"],
    ["CRLF", "export default [\r\n  a,\r\n];\r\n"],
    ["regex with an unbalanced bracket", 'export default [\n  { name: /[/]/.source }\n];\n'],
    ["strings holding brackets", 'export default [\n  { name: "] ) }" }\n];\n'],
    ["side-effect import", 'import "./polyfill";\nimport a from "a";\n\nexport default [a];\n'],
    ["multi-line import list", 'import {\n  a,\n  b,\n} from "x";\n\nexport default [a];\n'],
  ];

  test.each(SHAPES)("%s", (_name, source) => {
    const result = patchFlatConfig(source, PATCH);
    expect(result.status).toBe("patched");
    if (result.status !== "patched") return;

    const file = join(mkdtempSync(join(tmpdir(), "flat-")), "eslint.config.mjs");
    writeFileSync(file, result.source);
    expect(() => execFileSync("node", ["--check", file], { stdio: "pipe" })).not.toThrow();
  });

  test("a CommonJS config is named as such rather than guessed at", () => {
    const result = patchFlatConfig("module.exports = [\n  a,\n];\n", PATCH);
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") expect(result.reason).toContain("CommonJS");
  });
});

describe("comments never win a scan", () => {
  test("a commented-out import does not capture the insertion point", () => {
    const source = `/*
import legacy from "./legacy.js";
*/
import js from "@eslint/js";

export default [
  js.configs.recommended,
];
`;
    const out = patch(source);
    const real = out.indexOf('import js from "@eslint/js";');
    const inserted = out.indexOf('import strictLint');
    expect(inserted).toBeGreaterThan(real);
    expect(out.indexOf("*/")).toBeLessThan(real);
  });

  test("a commented-out trailing config does not steal the entries", () => {
    const source = `import js from "@eslint/js";

export default [
  js.configs.recommended,
];

/*
const config = defineConfig([old]);
export default config;
*/
`;
    const out = patch(source);
    expect(out).toContain("js.configs.recommended,\n  strictLint.configs.recommended,");
    expect(out.indexOf("strictLint.configs.recommended")).toBeLessThan(out.indexOf("/*"));
  });

  test("a commented-out declaration does not redirect the variable lookup", () => {
    const source = `// const eslintConfig = defineConfig([decoy]);
const eslintConfig = defineConfig([real]);

export default eslintConfig;
`;
    const out = patch(source);
    expect(out).toContain("defineConfig([real,\n  strictLint.configs.recommended,");
    expect(out).toContain("// const eslintConfig = defineConfig([decoy]);");
  });
});
