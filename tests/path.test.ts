import { describe, expect, test } from "bun:test";
import { srcRelative, toPosix } from "../src/utils/path.js";

describe("srcRelative", () => {
  test("resolves against the innermost source root", () => {
    const result = srcRelative("/repo/apps/web/src/features/auth/components/LoginForm.tsx", "src");
    expect(result?.rel).toBe("features/auth/components/LoginForm.tsx");
    expect(result?.srcRoot).toBe("/repo/apps/web/src");
  });

  test("ignores an outer directory that merely shares the name", () => {
    const result = srcRelative("/src/repo/packages/web/src/lib/utils.ts", "src");
    expect(result?.rel).toBe("lib/utils.ts");
  });

  test("returns null outside the source root", () => {
    expect(srcRelative("/repo/scripts/build.ts", "src")).toBe(null);
  });

  test("normalizes windows separators", () => {
    expect(toPosix("C:\\repo\\src\\lib\\x.ts")).toBe("C:/repo/src/lib/x.ts");
    expect(srcRelative(toPosix("C:\\repo\\src\\lib\\x.ts"), "src")?.rel).toBe("lib/x.ts");
  });

});
