import { describe, it } from "bun:test";
import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";

// RuleTester registers through global `describe`/`it` when they exist and runs inline when they do
// not, and Bun only exposes them to files that import `bun:test`. Without this the rule suites
// report zero tests depending on module load order.
const globals = globalThis as Record<string, unknown>;
globals.describe ??= describe;
globals.it ??= it;
import type { RuleModule } from "../src/types.js";

export const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

/** The plugin ships framework-agnostic rule shapes; ESLint's tester wants its own nominal type. */
export function asEslintRule(rule: RuleModule<Record<string, unknown>>): never {
  return rule as never;
}

/** A path under a directory tree that cannot contain a real config file. */
export function virtual(relative: string): string {
  return `/__strict_lint_virtual__/src/${relative}`;
}
