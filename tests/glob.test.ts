import { describe, expect, test } from "bun:test";
import { globPrefix, matches } from "../src/utils/glob.js";

describe("glob", () => {
  test("single star does not cross a slash", () => {
    expect(matches("components/Button.tsx", "components/*.tsx")).toBe(true);
    expect(matches("components/ui/Button.tsx", "components/*.tsx")).toBe(false);
  });

  test("globstar crosses any depth", () => {
    expect(matches("components/ui/nested/Button.tsx", "components/**")).toBe(true);
    expect(matches("Button.tsx", "**/*.tsx")).toBe(true);
    expect(matches("a/b/Button.tsx", "**/*.tsx")).toBe(true);
  });

  test("braces expand alternatives", () => {
    expect(matches("features/auth/hooks.ts", "features/*/{hooks,types}.{ts,tsx}")).toBe(true);
    expect(matches("features/auth/types.tsx", "features/*/{hooks,types}.{ts,tsx}")).toBe(true);
    expect(matches("features/auth/services.ts", "features/*/{hooks,types}.{ts,tsx}")).toBe(false);
  });

  test("dots are literal", () => {
    expect(matches("indexXts", "index.ts")).toBe(false);
    expect(matches("index.ts", "index.ts")).toBe(true);
  });

  test("question mark matches one non-slash character", () => {
    expect(matches("a.ts", "?.ts")).toBe(true);
    expect(matches("ab.ts", "?.ts")).toBe(false);
  });

  test("globPrefix reports the literal leading segment", () => {
    expect(globPrefix("features/*/components/**")).toBe("features");
    expect(globPrefix("*.{ts,tsx}")).toBe(null);
  });
});
