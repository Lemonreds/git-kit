import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  width?: number;
}

export default function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 440,
}: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Portalled to <body>: a `backdrop-filter` / `transform` ancestor (the title
  // bar uses backdrop-blur) would otherwise become the containing block for
  // `position: fixed` and paint the dialog behind the panels.
  return createPortal(
    <div
      data-modal="true"
      className="animate-fade fixed inset-0 z-50 grid place-items-center bg-black/25 p-6 backdrop-blur-[2px]"
    >
      <div
        className="animate-in w-full rounded-2xl border border-line bg-raised shadow-float"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">{title}</p>
            {subtitle ? <p className="mt-0.5 text-[11px] text-ink-faint">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mr-1 -mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-ink/8 hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>

        <div className="max-h-[calc(100vh-190px)] overflow-y-auto px-4 py-3.5">{children}</div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}