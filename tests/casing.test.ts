import { describe, expect, test } from "bun:test";
import { extensionOf, matchesCase, stemOf, toCase, tokenize } from "../src/utils/casing.js";

describe("casing", () => {
  test("tokenizes camel humps and acronyms", () => {
    expect(tokenize("parseHTMLBlock")).toEqual(["parse", "HTML", "Block"]);
    expect(tokenize("alert-dialog")).toEqual(["alert", "dialog"]);
    expect(tokenize("h1Heading")).toEqual(["h1", "Heading"]);
  });

  test("converts between cases", () => {
    expect(toCase("alert-dialog", "PascalCase")).toBe("AlertDialog");
    expect(toCase("AlertDialog", "kebab-case")).toBe("alert-dialog");
    expect(toCase("data_card", "camelCase")).toBe("dataCard");
    expect(toCase("useAuth", "SCREAMING_SNAKE_CASE")).toBe("USE_AUTH");
    expect(toCase("anything", "any")).toBe("anything");
  });

  test("validates cases", () => {
    expect(matchesCase("DataCard", "PascalCase")).toBe(true);
    expect(matchesCase("dataCard", "PascalCase")).toBe(false);
    expect(matchesCase("alert-dialog", "kebab-case")).toBe(true);
    expect(matchesCase("AlertDialog", "kebab-case")).toBe(false);
    expect(matchesCase("__root", "any")).toBe(true);
  });

  test("splits the stem at the first dot", () => {
    expect(stemOf("Button.stories.tsx")).toBe("Button");
    expect(extensionOf("Button.stories.tsx")).toBe(".stories.tsx");
    expect(stemOf("README")).toBe("README");
    expect(extensionOf("README")).toBe("");
  });
});
