const HEADER_LINE_COUNT = 20;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const markerCache = new Map<string, RegExp>();

function markerRegExp(marker: string): RegExp {
  let cached = markerCache.get(marker);
  if (!cached) {
    cached = new RegExp(`(?://|/\\*|\\{/\\*|\\*)\\s*${escapeRegExp(marker)}\\b`);
    markerCache.set(marker, cached);
  }
  return cached;
}

function lineHasMarker(line: string | undefined, markers: readonly string[]): boolean {
  if (!line) return false;
  for (const marker of markers) {
    if (markerRegExp(marker).test(line)) return true;
  }
  return false;
}

/** True when any marker appears in the first 20 lines of the file. */
export function hasFileExemption(lines: readonly string[], markers: readonly string[]): boolean {
  if (markers.length === 0) return false;
  const limit = Math.min(lines.length, HEADER_LINE_COUNT);
  for (let i = 0; i < limit; i += 1) {
    if (lineHasMarker(lines[i], markers)) return true;
  }
  return false;
}

/** True when a marker sits on the reported line or the line directly above it. */
export function hasLineExemption(lines: readonly string[], line: number, markers: readonly string[]): boolean {
  if (markers.length === 0 || line < 1) return false;
  return lineHasMarker(lines[line - 1], markers) || lineHasMarker(lines[line - 2], markers);
}
