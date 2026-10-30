import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  /** Extra controls (e.g. an "also delete remotely" checkbox). */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "default",
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "bg-negative text-white hover:opacity-90"
      : "bg-accent text-white hover:opacity-90";

  // Portalled so a nested / blurred ancestor can not clip or hide it.
  return createPortal(
    <div
      data-modal="true"
      className="animate-fade fixed inset-0 z-50 grid place-items-center bg-black/25 p-6 backdrop-blur-[2px]"
    >
      <div className="animate-in w-full max-w-[360px] rounded-2xl border border-line bg-raised p-5 shadow-float">
        <p className="text-[13.5px] font-semibold text-ink">{title}</p>
        {description ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{description}</p>
        ) : null}
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}