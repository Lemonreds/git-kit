import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Tooltip attributes to spread on any element. A single delegated layer
 * (`<TooltipLayer />`, mounted once in AppShell) renders the bubble, so adding
 * a tooltip costs no extra DOM and there is exactly one visible at a time.
 *
 *   <button {...tip("Push to remote", "⌘⇧P")}>…</button>
 */
export function tip(label: string, shortcut?: string): {
  "data-tip": string;
  "data-tip-k"?: string;
} {
  return shortcut ? { "data-tip": label, "data-tip-k": shortcut } : { "data-tip": label };
}

const SHOW_DELAY = 180;
/** Once a tooltip has been shown, siblings appear instantly for this long. */
const FAST_WINDOW = 900;
const HIDE_GRACE = 110;

interface ActiveTip {
  label: string;
  shortcut?: string;
  rect: DOMRect;
}

interface TipPosition {
  left: number;
  top: number;
  placement: "top" | "bottom";
}

export default function TooltipLayer() {
  const [active, setActive] = useState<ActiveTip | null>(null);
  const [position, setPosition] = useState<TipPosition | null>(null);

  const bubble = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const anchor = useRef<Element | null>(null);
  const pending = useRef<Element | null>(null);
  const lastShown = useRef(0);

  useEffect(() => {
    const clearTimer = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const hide = () => {
      clearTimer();
      anchor.current = null;
      pending.current = null;
      setActive(null);
      setPosition(null);
    };

    const show = (element: Element) => {
      const label = element.getAttribute("data-tip");
      if (!label) return;
      const shortcut = element.getAttribute("data-tip-k") ?? undefined;
      anchor.current = element;
      pending.current = null;
      lastShown.current = Date.now();
      setPosition(null);
      setActive({ label, shortcut, rect: element.getBoundingClientRect() });
    };

    const scheduleShow = (element: Element) => {
      clearTimer();
      pending.current = element;
      const fast = Date.now() - lastShown.current < FAST_WINDOW;
      timer.current = window.setTimeout(
        () => {
          if (pending.current === element) show(element);
        },
        fast ? 0 : SHOW_DELAY,
      );
    };

    const closestTip = (node: EventTarget | null): Element | null => {
      const element = node as Element | null;
      if (!element || typeof element.closest !== "function") return null;
      return element.closest("[data-tip]");
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const element = closestTip(event.target);
      if (!element) return;
      if (anchor.current === element || pending.current === element) return;
      scheduleShow(element);
    };

    const onPointerOut = (event: PointerEvent) => {
      const element = closestTip(event.target);
      if (!element) return;
      const next = closestTip(event.relatedTarget);
      if (next === element) return;

      if (pending.current === element) {
        clearTimer();
        pending.current = null;
        return;
      }
      if (anchor.current !== element) return;

      clearTimer();
      timer.current = window.setTimeout(() => {
        if (anchor.current === element) hide();
      }, HIDE_GRACE);
    };

    const onFocusIn = (event: FocusEvent) => {
      const element = closestTip(event.target);
      if (element) show(element);
    };

    const onFocusOut = (event: FocusEvent) => {
      const element = closestTip(event.target);
      if (element && anchor.current === element) hide();
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", hide, true);

    return () => {
      clearTimer();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  // Measure after paint, then keep the bubble inside the window.
  useLayoutEffect(() => {
    if (!active) {
      setPosition(null);
      return;
    }
    const element = bubble.current;
    if (!element) return;

    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 9;
    const { rect } = active;

    const placement: TipPosition["placement"] =
      rect.top - height - gap >= 6 ? "top" : "bottom";
    const rawTop = placement === "top" ? rect.top - height - gap : rect.bottom + gap;
    const rawLeft = rect.left + rect.width / 2 - width / 2;

    setPosition({
      placement,
      left: Math.min(Math.max(rawLeft, 6), Math.max(viewportWidth - width - 6, 6)),
      top: Math.min(Math.max(rawTop, 6), Math.max(viewportHeight - height - 6, 6)),
    });
  }, [active]);

  if (!active) return null;

  const placement = position?.placement ?? "top";
  const arrow =
    placement === "top"
      ? "left-1/2 top-full -mt-[3.5px] -translate-x-1/2 border-b border-r"
      : "bottom-full left-1/2 -mb-[3.5px] -translate-x-1/2 border-l border-t";

  return createPortal(
    <div
      role="tooltip"
      ref={bubble}
      key={`${active.rect.left}:${active.rect.top}:${active.label}`}
      className={`pointer-events-none fixed z-[95] max-w-[300px] ${
        position ? "animate-tip" : "invisible"
      }`}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
    >
      <div className="relative rounded-lg border border-line bg-raised px-2 py-1.5 text-[11px] leading-snug text-ink shadow-float">
        <span className="whitespace-pre-line font-medium">{active.label}</span>
        {active.shortcut ? (
          <kbd className="ml-1.5 rounded border border-line bg-canvas px-1 py-px align-middle font-mono text-[9.5px] font-normal text-ink-faint">
            {active.shortcut}
          </kbd>
        ) : null}
        <span
          aria-hidden
          className={`absolute h-[7px] w-[7px] rotate-45 border-line bg-raised ${arrow}`}
        />
      </div>
    </div>,
    document.body,
  );
}