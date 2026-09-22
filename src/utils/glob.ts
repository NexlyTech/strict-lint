const SPECIAL = /[.+^$(){}|[\]\\]/g;

function compile(glob: string): string {
  let out = "";
  let i = 0;
  while (i < glob.length) {
    const char = glob[i];

    if (char === "*") {
      if (glob[i + 1] === "*") {
        i += 2;
        if (glob[i] === "/") {
          i += 1;
          out += "(?:[^/]*/)*";
        } else {
          out += ".*";
        }
      } else {
        i += 1;
        out += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      i += 1;
      out += "[^/]";
      continue;
    }

    if (char === "{") {
      const close = glob.indexOf("}", i);
      if (close === -1) {
        i += 1;
        out += "\\{";
        continue;
      }
      const alternatives = glob.slice(i + 1, close).split(",");
      out += `(?:${alternatives.map(compile).join("|")})`;
      i = close + 1;
      continue;
    }

    out += char.replace(SPECIAL, "\\$&");
    i += 1;
  }
  return out;
}

const cache = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  let cached = cache.get(glob);
  if (!cached) {
    cached = new RegExp(`^${compile(glob)}$`);
    cache.set(glob, cached);
  }
  return cached;
}

export function matches(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path);
}

export function matchesAny(path: string, globs: readonly string[] | undefined): boolean {
  if (!globs) return false;
  for (const glob of globs) {
    if (matches(path, glob)) return true;
  }
  return false;
}

/** The literal leading path segment of a glob, or null when it starts with a wildcard. */
export function globPrefix(glob: string): string | null {
  const segment = glob.split("/")[0];
  return /[*?{}]/.test(segment) ? null : segment;
}
