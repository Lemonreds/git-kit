export interface HighlightSegment {
  text: string;
  hit: boolean;
}

/**
 * Split `text` into plain / matched segments for an in-diff search. Matching is
 * case-insensitive and never overlaps itself.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, hit: false }];

  const haystack = text.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) break;
    if (found > cursor) segments.push({ text: text.slice(cursor, found), hit: false });
    segments.push({ text: text.slice(found, found + needle.length), hit: true });
    cursor = found + needle.length;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return segments.length > 0 ? segments : [{ text, hit: false }];
}

/** Total occurrences of `query` in `text` (used for the result counter). */
export function countOccurrences(text: string, query: string): number {
  return highlightSegments(text, query).filter((segment) => segment.hit).length;
}