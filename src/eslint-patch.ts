/**
 * A dependency-free patcher for ESLint flat configs.
 *
 * The plugin loads inside oxlint's JS runtime, so a real AST rewriter like magicast is not an
 * option. The surface is narrow enough not to need one: every flat config puts its entries in a
 * single top-level array or call, and inserting at its end is order-independent for our rules.
 * Anything this cannot recognise with certainty is reported as unsupported and left alone.
 */

export interface FlatConfigPatch {
  /** Import statements to add below the existing ones. */
  imports: string;
  /** Config entries to insert, written at zero indentation. */
  entries: string;
  /** Its presence anywhere in the source means the config is already wired up. */
  marker: string;
}

export type PatchResult =
  | { status: "patched"; source: string; added: string[] }
  | { status: "present" }
  | { status: "unsupported"; reason: string };

const CLOSERS: Record<string, string> = { "[": "]", "(": ")", "{": "}" };

function skipString(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const char = source[i];
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (char === quote) return i + 1;
    if (quote === "`" && char === "$" && source[i + 1] === "{") {
      const close = matchDelimiter(source, i + 1);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    i++;
  }
  return -1;
}

/** Index of the delimiter closing the one at `open`, or -1 when the source is not balanced. */
function matchDelimiter(source: string, open: number): number {
  const stack: string[] = [];
  let i = open;
  while (i < source.length) {
    const char = source[i] as string;
    const next = source[i + 1];
    if (char === "/" && next === "/") {
      const eol = source.indexOf("\n", i);
      if (eol === -1) return -1;
      i = eol + 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return -1;
      i = end + 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const end = skipString(source, i);
      if (end === -1) return -1;
      i = end;
      continue;
    }
    if (CLOSERS[char]) {
      stack.push(CLOSERS[char] as string);
      i++;
      continue;
    }
    if (char === "]" || char === ")" || char === "}") {
      if (stack.pop() !== char) return -1;
      if (stack.length === 0) return i;
      i++;
      continue;
    }
    i++;
  }
  return -1;
}

function skipTrivia(source: string, from: number): number {
  let i = from;
  while (i < source.length) {
    const char = source[i] as string;
    const next = source[i + 1];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === "/" && next === "/") {
      const eol = source.indexOf("\n", i);
      if (eol === -1) return source.length;
      i = eol + 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return source.length;
      i = end + 2;
      continue;
    }
    return i;
  }
  return i;
}

const IDENTIFIER = /^[A-Za-z_$][\w$.]*/;

/**
 * The index of the closing delimiter to insert before. Handles the four shapes in the wild:
 * a bare array, `defineConfig([…])`, a variadic `tseslint.config(…)`, and any of those assigned
 * to a variable that is then exported.
 */
function findInsertionPoint(source: string, from: number, depth = 0): number | null {
  if (depth > 3) return null;
  const start = skipTrivia(source, from);
  if (source[start] === "[") {
    const close = matchDelimiter(source, start);
    return close === -1 ? null : close;
  }

  const identifier = IDENTIFIER.exec(source.slice(start))?.[0];
  if (!identifier) return null;

  const afterName = skipTrivia(source, start + identifier.length);
  if (source[afterName] === "(") {
    const close = matchDelimiter(source, afterName);
    if (close === -1) return null;
    const firstArgument = skipTrivia(source, afterName + 1);
    if (source[firstArgument] === "[") {
      const arrayClose = matchDelimiter(source, firstArgument);
      return arrayClose === -1 ? null : arrayClose;
    }
    return close;
  }

  const declaration = new RegExp(`(?:^|\\n)\\s*(?:const|let|var)\\s+${identifier}\\s*=`).exec(source);
  if (!declaration) return null;
  return findInsertionPoint(source, declaration.index + declaration[0].length, depth + 1);
}

/** The end of the last top-level import statement, scanning past multi-line specifier lists. */
function endOfImports(source: string): number {
  const matches = [...source.matchAll(/^[ \t]*import\b/gm)];
  const last = matches.at(-1);
  if (!last) return 0;

  let i = last.index;
  while (i < source.length) {
    const char = source[i] as string;
    if (char === '"' || char === "'" || char === "`") {
      const end = skipString(source, i);
      if (end === -1) break;
      i = end;
      continue;
    }
    if (char === "{") {
      const end = matchDelimiter(source, i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (char === ";") return i + 1;
    if (char === "\n") return i;
    i++;
  }
  const eol = source.indexOf("\n", last.index);
  return eol === -1 ? source.length : eol;
}

function indentOf(source: string, close: number): string {
  const lineStart = source.lastIndexOf("\n", close) + 1;
  const indent = /^[ \t]*/.exec(source.slice(lineStart, close))?.[0] ?? "";
  return `${indent}  `;
}

export function patchFlatConfig(source: string, patch: FlatConfigPatch): PatchResult {
  if (source.includes(patch.marker)) return { status: "present" };

  const exports = [...source.matchAll(/(?:^|\n)[ \t]*export[ \t]+default[ \t]+/g)];
  const lastExport = exports.at(-1);
  if (!lastExport) return { status: "unsupported", reason: "no `export default` found" };

  const close = findInsertionPoint(source, lastExport.index + lastExport[0].length);
  if (close === null) {
    return { status: "unsupported", reason: "the exported config is not an array or a config call" };
  }

  const indent = indentOf(source, close);
  const body = patch.entries
    .trimEnd()
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : `${indent}${line}`))
    .join("\n");

  const before = source.slice(0, close).trimEnd();
  const needsComma = !before.endsWith(",") && !before.endsWith("[") && !before.endsWith("(");
  const entryBlock = `${needsComma ? "," : ""}\n${body},\n${indent.slice(2)}`;

  const importsAt = endOfImports(source);
  const importBlock = importsAt === 0 ? `${patch.imports}\n` : `\n${patch.imports}`;

  const patched =
    source.slice(0, importsAt) +
    importBlock +
    source.slice(importsAt, close).trimEnd() +
    entryBlock +
    source.slice(close);

  return { status: "patched", source: patched, added: [...patch.imports.split("\n"), ...body.split("\n")] };
}
