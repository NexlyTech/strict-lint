export function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export interface SrcLocation {
  /** Absolute posix path of the directory treated as the source root. */
  srcRoot: string;
  /** Path relative to `srcRoot`, posix separators, no leading slash. */
  rel: string;
}

/**
 * Locates the configured source root by scanning right-to-left, so monorepo paths
 * such as `apps/web/src/features/auth/...` resolve against the innermost `src`.
 */
export function srcRelative(filename: string, root: string): SrcLocation | null {
  const posix = toPosix(filename);

  if (root === "" || root === ".") {
    return { srcRoot: "", rel: posix.replace(/^\.?\//, "") };
  }

  const needle = `/${root}/`;
  const index = posix.lastIndexOf(needle);
  if (index !== -1) {
    return { srcRoot: posix.slice(0, index + root.length + 1), rel: posix.slice(index + needle.length) };
  }

  const prefix = `${root}/`;
  if (posix.startsWith(prefix)) {
    return { srcRoot: root, rel: posix.slice(prefix.length) };
  }

  return null;
}

export function featureOf(rel: string, featuresDir: string): string | null {
  const segments = rel.split("/");
  if (segments[0] !== featuresDir || segments.length < 2) return null;
  return segments[1];
}

export function basename(rel: string): string {
  const segments = rel.split("/");
  return segments[segments.length - 1];
}

export function isVirtualFilename(filename: string): boolean {
  return !filename || filename === "<input>" || filename === "<text>" || filename.startsWith("<");
}
