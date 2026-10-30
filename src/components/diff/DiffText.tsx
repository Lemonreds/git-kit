import { Fragment } from "react";

import { highlightSegments } from "../../lib/diffSearch";

interface DiffTextProps {
  text: string;
  /** In-diff search term; empty renders the text untouched. */
  query?: string;
}

/** One diff line's text, with search matches wrapped in `<mark>`. */
export default function DiffText({ text, query = "" }: DiffTextProps) {
  const value = text || " ";
  if (!query.trim()) return <>{value}</>;

  return (
    <>
      {highlightSegments(value, query).map((segment, index) =>
        segment.hit ? (
          <mark key={index} data-diff-hit="" className="diff-hit">
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}