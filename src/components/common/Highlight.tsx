import { useMemo } from "react";

interface HighlightProps {
  text: string;
  /** Empty/undefined renders the text unchanged. Case-insensitive. */
  query?: string;
  className?: string;
}

/**
 * Marks every occurrence of `query` inside `text`. Used by the commit search to
 * show *why* a row matched, without filtering the list.
 */
export default function Highlight({ text, query, className = "" }: HighlightProps) {
  const parts = useMemo(() => split(text, query?.trim() ?? ""), [text, query]);

  if (parts.length === 1 && !parts[0].hit) return <>{text}</>;

  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark
            key={index}
            className={`rounded-[3px] bg-accent/18 px-0.5 text-accent ${className}`}
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function split(text: string, query: string): Array<{ text: string; hit: boolean }> {
  if (!query || !text) return [{ text, hit: false }];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: Array<{ text: string; hit: boolean }> = [];
  let at = 0;

  while (at < text.length) {
    const found = haystack.indexOf(needle, at);
    if (found < 0) {
      parts.push({ text: text.slice(at), hit: false });
      break;
    }
    if (found > at) parts.push({ text: text.slice(at, found), hit: false });
    parts.push({ text: text.slice(found, found + needle.length), hit: true });
    at = found + needle.length;
  }

  return parts.length > 0 ? parts : [{ text, hit: false }];
}