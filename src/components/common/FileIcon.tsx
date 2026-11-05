import { fileGlyph } from "../../lib/fileIcons";

interface FileIconProps {
  /** Repository-relative path; the extension / file name picks the glyph. */
  path: string;
  size?: number;
  className?: string;
}

/**
 * The coloured glyph shown in front of a path in every change list. Decorative:
 * the row already carries the path as text and the status as a badge, so the
 * icon stays out of the accessibility tree.
 */
export default function FileIcon({ path, size = 14, className = "" }: FileIconProps) {
  const { icon: Glyph, tone } = fileGlyph(path);
  return (
    <Glyph
      size={size}
      strokeWidth={1.7}
      aria-hidden
      className={`shrink-0 ${tone} ${className}`.trimEnd()}
    />
  );
}