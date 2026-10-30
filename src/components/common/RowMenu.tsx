import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { createPortal } from "react-dom";

import { tip } from "./Tooltip";

export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  separatorBefore?: boolean;
}

interface RowMenuProps {
  /** Tooltip of the `⋯` trigger. */
  label: string;
  items: RowMenuItem[];
}

interface MenuPosition {
  left: number;
  top: number;
}

/**
 * `⋯` overflow menu for dense rows. Positioned in a body portal so it is never
 * clipped by the scrolling panel; flips above the trigger when space is short.
 */
export default function RowMenu({ label, items }: RowMenuProps) {
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  // Measure after paint so the menu can stay inside the window.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const anchor = trigger.current?.getBoundingClientRect();
    const panel = menu.current;
    if (!anchor || !panel) return;

    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const gap = 6;
    const openUp = anchor.bottom + gap + height > window.innerHeight - 8;

    setPosition({
      left: Math.min(Math.max(anchor.right - width, 8), window.innerWidth - width - 8),
      top: openUp ? anchor.top - height - gap : anchor.bottom + gap,
    });
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        {...tip(label)}
        onClick={() => setOpen((value) => !value)}
        className={`grid h-6 w-6 place-items-center rounded-md transition-colors ${
          open ? "bg-ink/8 text-ink" : "text-ink-soft hover:bg-ink/8 hover:text-ink"
        }`}
      >
        <Ellipsis size={14} />
      </button>

      {open
        ? createPortal(
            <>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[70] cursor-default"
              />
              <div
                ref={menu}
                role="menu"
                className={`fixed z-[75] w-[228px] rounded-xl border border-line bg-raised p-1 shadow-float ${
                  position ? "animate-pop" : "invisible"
                }`}
                style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
              >
                {items.map((item) => (
                  <div key={item.label}>
                    {item.separatorBefore ? <div className="my-1 h-px bg-line" /> : null}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        item.onSelect();
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-[6px] text-left text-[11.5px] transition-colors ${
                        item.tone === "danger"
                          ? "text-negative hover:bg-negative/8"
                          : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                      }`}
                    >
                      <span className="grid h-4 w-4 shrink-0 place-items-center opacity-80">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1 whitespace-nowrap">{item.label}</span>
                    </button>
                  </div>
                ))}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}