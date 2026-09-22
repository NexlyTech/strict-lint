import type { AstNode } from "../types.js";

const SKIP_KEYS = new Set(["parent", "loc", "range", "start", "end", "type"]);

/** Depth-first walk. Returning `false` from `visit` stops descent into that subtree. */
export function walk(node: unknown, visit: (node: AstNode) => boolean | void): void {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }

  const candidate = node as AstNode;
  if (typeof candidate.type !== "string") return;
  if (visit(candidate) === false) return;

  for (const key of Object.keys(candidate)) {
    if (SKIP_KEYS.has(key)) continue;
    walk(candidate[key], visit);
  }
}

export function containsJsx(node: unknown): boolean {
  let found = false;
  walk(node, (child) => {
    if (found) return false;
    if (child.type === "JSXElement" || child.type === "JSXFragment") {
      found = true;
      return false;
    }
  });
  return found;
}

export function lineOf(node: AstNode, text: string): number {
  const line = node.loc?.start?.line;
  if (typeof line === "number") return line;

  const offset = node.range?.[0] ?? node.start;
  if (typeof offset !== "number") return -1;

  let count = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) count += 1;
  }
  return count;
}

export function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/** Resolves the tag name of a JSX element, or null for member/namespaced names. */
export function jsxTagName(nameNode: unknown): string | null {
  if (!nameNode || typeof nameNode !== "object") return null;
  const node = nameNode as AstNode;
  if (node.type !== "JSXIdentifier") return null;
  return typeof node.name === "string" ? node.name : null;
}

/** Intrinsic elements are lowercase or hyphenated; anything else is a component reference. */
export function isIntrinsicTag(name: string): boolean {
  return /^[a-z]/.test(name);
}
