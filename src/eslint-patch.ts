/**
 * A dependency-free patcher for ESLint flat configs.
 *
 * The plugin loads inside oxlint's JS runtime, so a real AST rewriter like magicast is not an
 * option. The surface is narrow enough not to need one: every flat config puts its entries in a
 * single top-level array or call, and inserting at its end is order-independent for our rules.
 * Anything this cannot recognise with certainty is reported as unsupported and left alone.
 */

interface Span {
  open: number;
  close: number;
}

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

/**
 * A copy of the source with comment and string *contents* blanked to spaces, preserving every
 * index and newline. Scanning this instead of the raw text is what stops a commented-out import
 * or a commented-out `export default` from winning a regex match against the real one.
 */
function maskLiterals(source: string): string {
  const out = source.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < source.length) {
    const char = source[i] as string;
    const next = source[i + 1];
    if (char === "/" && next === "/") {
      const eol = source.indexOf("\n", i);
      const end = eol === -1 ? source.length : eol;
      blank(i, end);
      i = end;
      continue;
    }
    if (char === "/" && next === "*") {
      const found = source.indexOf("*/", i + 2);
      const end = found === -1 ? source.length : found + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const end = skipString(source, i);
      if (end === -1) {
        i++;
        continue;
      }
      blank(i + 1, end - 1);
      i = end;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** The last character inside the delimiters that is neither whitespace nor part of a comment. */
function lastCodeIndex(source: string, open: number, close: number): number {
  let i = open + 1;
  let last = -1;
  while (i < close) {
    const char = source[i] as string;
    const next = source[i + 1];
    if (char === "/" && next === "/") {
      const eol = source.indexOf("\n", i);
      i = eol === -1 || eol > close ? close : eol + 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 || end > close ? close : end + 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const end = skipString(source, i);
      if (end === -1) return last;
      last = end - 1;
      i = end;
      continue;
    }
    if (!/\s/.test(char)) last = i;
    i++;
  }
  return last;
}

const IDENTIFIER = /^[A-Za-z_$][\w$.]*/;

/**
 * The index of the closing delimiter to insert before. Handles the four shapes in the wild:
 * a bare array, `defineConfig([…])`, a variadic `tseslint.config(…)`, and any of those assigned
 * to a variable that is then exported.
 */
function findInsertionPoint(source: string, from: number, depth = 0): Span | null {
  if (depth > 3) return null;
  const start = skipTrivia(source, from);
  if (source[start] === "[") {
    const close = matchDelimiter(source, start);
    return close === -1 ? null : { open: start, close };
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
      return arrayClose === -1 ? null : { open: firstArgument, close: arrayClose };
    }
    return { open: afterName, close };
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

  const masked = maskLiterals(source);
  const exports = [...masked.matchAll(/(?:^|\n)[ \t]*export[ \t]+default[ \t]+/g)];
  const lastExport = exports.at(-1);
  if (!lastExport) {
    const reason = /(?:^|\n)[ \t]*module\.exports[ \t]*=/.test(masked)
      ? "a CommonJS config; the plugin is ESM, so add it by hand or move to flat ESM"
      : "no `export default` found";
    return { status: "unsupported", reason };
  }

  const span = findInsertionPoint(masked, lastExport.index + lastExport[0].length);
  if (span === null) {
    return { status: "unsupported", reason: "the exported config is not an array or a config call" };
  }

  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const indent = indentOf(source, span.close);
  const body = patch.entries
    .trimEnd()
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : `${indent}${line}`))
    .join(eol);

  const lastCode = lastCodeIndex(masked, span.open, span.close);
  const needsComma = lastCode !== -1 && masked[lastCode] !== ",";
  const withComma =
    needsComma ? `${source.slice(0, lastCode + 1)},${source.slice(lastCode + 1, span.close)}` : source.slice(0, span.close);

  const importsAt = endOfImports(masked);
  const imports = patch.imports.split("\n").join(eol);
  const importBlock = importsAt === 0 ? `${imports}${eol}` : `${eol}${imports}`;

  const patched =
    withComma.slice(0, importsAt) +
    importBlock +
    withComma.slice(importsAt).replace(/\s+$/, "") +
    `${eol}${body},${eol}${indent.slice(2)}` +
    source.slice(span.close);

  return { status: "patched", source: patched, added: [...patch.imports.split("\n"), ...body.split("\n")] };
}
