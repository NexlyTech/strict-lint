export type NamingCase =
  | "PascalCase"
  | "camelCase"
  | "kebab-case"
  | "snake_case"
  | "SCREAMING_SNAKE_CASE"
  | "any";

export const NAMING_CASES: readonly NamingCase[] = [
  "PascalCase",
  "camelCase",
  "kebab-case",
  "snake_case",
  "SCREAMING_SNAKE_CASE",
  "any",
];

export function isNamingCase(value: unknown): value is NamingCase {
  return typeof value === "string" && (NAMING_CASES as readonly string[]).includes(value);
}

const VALIDATORS: Record<Exclude<NamingCase, "any">, RegExp> = {
  PascalCase: /^[A-Z][A-Za-z0-9]*$/,
  camelCase: /^[a-z][A-Za-z0-9]*$/,
  "kebab-case": /^[a-z0-9]+(-[a-z0-9]+)*$/,
  snake_case: /^[a-z0-9]+(_[a-z0-9]+)*$/,
  SCREAMING_SNAKE_CASE: /^[A-Z0-9]+(_[A-Z0-9]+)*$/,
};

export function matchesCase(name: string, casing: NamingCase): boolean {
  if (casing === "any") return true;
  return VALIDATORS[casing].test(name);
}

/** Splits on separators and camel-hump boundaries: `parseHTMLBlock` -> `[parse, HTML, Block]`. */
export function tokenize(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function capitalize(token: string): string {
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** Rewrites `name` into `casing`, used to suggest a correct filename in the report. */
export function toCase(name: string, casing: NamingCase): string {
  const tokens = tokenize(name);
  if (casing === "any" || tokens.length === 0) return name;

  switch (casing) {
    case "PascalCase":
      return tokens.map(capitalize).join("");
    case "camelCase":
      return tokens.map((token, index) => (index === 0 ? token.toLowerCase() : capitalize(token))).join("");
    case "kebab-case":
      return tokens.map((token) => token.toLowerCase()).join("-");
    case "snake_case":
      return tokens.map((token) => token.toLowerCase()).join("_");
    case "SCREAMING_SNAKE_CASE":
      return tokens.map((token) => token.toUpperCase()).join("_");
  }
}

/** The part of a filename before the first dot: `Button.stories.tsx` -> `Button`. */
export function stemOf(filename: string): string {
  const dot = filename.indexOf(".");
  return dot === -1 ? filename : filename.slice(0, dot);
}

/** Everything from the first dot onward, so a suggestion keeps `.stories.tsx` intact. */
export function extensionOf(filename: string): string {
  const dot = filename.indexOf(".");
  return dot === -1 ? "" : filename.slice(dot);
}
