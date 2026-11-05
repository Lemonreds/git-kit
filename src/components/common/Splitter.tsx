import type { CSSProperties, PointerEvent } from "react";

import { useT } from "../../i18n";

interface SplitterProps {
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  /** Horizontal splitter = a row divider: dragging changes a height. */
  horizontal?: boolean;
  /** Overrides the default "resize panel / terminal" tooltip. */
  label?: string;
  /** Double-click handler, used to restore the default size. */
  onDoubleClick?: () => void;
  style?: CSSProperties;
}

/**
 * The 6px draggable gap between two panes. Kept in one place so the window
 * layout, the terminal drawer and the diff file list feel identical: same hit
 * area (wider than the visible line), same hover tint, same cursor.
 */
export default function Splitter({
  onPointerDown,
  horizontal = false,
  label,
  onDoubleClick,
  style,
}: SplitterProps) {
  const t = useT();

  return (
    <div
      role="separator"
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-label={label ?? (horizontal ? t("layout.resizeTerminal") : t("layout.resizePanel"))}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      style={style}
      className={`relative z-10 bg-canvas transition-colors hover:bg-accent/25 ${
        horizontal ? "cursor-row-resize" : "cursor-col-resize"
      }`}
    >
      <span
        className={
          horizontal ? "absolute inset-x-0 -top-1.5 -bottom-1.5" : "absolute inset-y-0 -left-1.5 -right-1.5"
        }
      />
    </div>
  );
}