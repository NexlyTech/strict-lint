/** Collapses `.` and `..` segments. Returns null when the path escapes above its base. */
function normalize(path: string): string | null {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}

function parentDir(rel: string): string {
  const index = rel.lastIndexOf("/");
  return index === -1 ? "" : rel.slice(0, index);
}

/**
 * Maps a module specifier onto a path relative to the source root.
 * Returns null for anything outside it — bare packages, node builtins, virtual modules,
 * and relative paths that climb above the source root.
 */
export function resolveSpecifier(
  specifier: string,
  fromRel: string,
  aliases: Record<string, string>,
): string | null {
  if (specifier.startsWith(".")) {
    const base = parentDir(fromRel);
    return normalize(base === "" ? specifier : `${base}/${specifier}`);
  }

  for (const [prefix, target] of Object.entries(aliases)) {
    if (!specifier.startsWith(prefix)) continue;
    const remainder = specifier.slice(prefix.length);
    return normalize(target === "" ? remainder : `${target}/${remainder}`);
  }

  return null;
}

const INDEX_NAMES = new Set(["index", "index.ts", "index.tsx", "index.js", "index.jsx"]);

/** True when `rel` addresses a feature's public entry rather than a file inside it. */
export function isFeatureEntry(rel: string, featuresDir: string): boolean {
  const segments = rel.split("/");
  if (segments[0] !== featuresDir) return false;
  if (segments.length === 2) return true;
  return segments.length === 3 && INDEX_NAMES.has(segments[2]);
}
