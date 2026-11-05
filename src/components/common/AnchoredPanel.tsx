import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface AnchoredPanelProps {
  open: boolean;
  /** Element the panel hangs off. `null` while the trigger is not mounted yet. */
  anchor: HTMLElement | null;
  onClose: () => void;
  /** Preferred side; flips when the panel would leave the window. */
  placement?: "above" | "below";
  align?: "start" | "end";
  width?: number;
  className?: string;
  children: ReactNode;
}

interface PanelPosition {
  left: number;
  top: number;
}

const GAP = 6;
const MARGIN = 10;

/**
 * A popover anchored to a trigger, rendered in a body portal.
 *
 * Same rules as `RowMenu` (never clipped by a scrolling panel, stays inside the
 * window, closes on outside click / Esc / scrolling), but the content is free —
 * a search field, a list, anything. The status bar sits at the bottom of the
 * window, so `placement="above"` is the normal case there.
 */
export default function AnchoredPanel({
  open,
  anchor,
  onClose,
  placement = "below",
  align = "start",
  width = 260,
  className = "",
  children,
}: AnchoredPanelProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    // Scrolling the page detaches a fixed panel from its trigger — but a scroll
    // inside the panel's own list must not close it.
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && panel.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onClose]);

  // Measured after every paint: the content height changes as the user filters,
  // and a stale position would either clip the list or float it away from the
  // trigger. Setting the same value again is a no-op, so this cannot loop.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const box = panel.current?.getBoundingClientRect();
    const height = box?.height ?? 0;
    const panelWidth = box?.width ?? width;

    let top = placement === "above" ? rect.top - height - GAP : rect.bottom + GAP;
    if (placement === "above" && top < MARGIN) top = rect.bottom + GAP;
    if (placement === "below" && top + height > window.innerHeight - MARGIN) {
      top = rect.top - height - GAP;
    }
    let left = align === "end" ? rect.right - panelWidth : rect.left;
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, window.innerWidth - panelWidth - MARGIN));

    const next = { left, top: Math.max(MARGIN, top) };
    setPosition((current) =>
      current && current.left === next.left && current.top === next.top ? current : next,
    );
  });

  if (!open) return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-[70] cursor-default"
      />
      <div
        ref={panel}
        style={{ left: position?.left ?? 0, top: position?.top ?? 0, width }}
        className={`fixed z-[75] overflow-hidden rounded-xl border border-line bg-raised shadow-float ${
          position ? "animate-pop" : "invisible"
        } ${className}`}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}