import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
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
