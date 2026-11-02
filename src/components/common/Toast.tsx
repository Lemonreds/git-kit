import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createPortal } from "react-dom";

import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";

export default function Toast() {
  const t = useT();
  const toast = useAppStore((state) => state.toast);
  const dismiss = useAppStore((state) => state.dismissToast);

  if (!toast) return null;

  const Icon = toast.kind === "error" ? AlertCircle : toast.kind === "success" ? CheckCircle2 : Info;
  const tone =
    toast.kind === "error" ? "text-negative" : toast.kind === "success" ? "text-positive" : "text-accent";

  // Portalled and above the dialogs (Modal/ConfirmDialog = 50, AlertDialog = 60):
  // a toast triggered from inside a dialog used to render behind its backdrop.
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-5 z-[80] flex justify-center px-4">
      <div
        key={toast.id}
        role="status"
        className="animate-in pointer-events-auto flex max-w-[560px] items-start gap-2.5 rounded-xl border border-line bg-raised/95 px-3.5 py-2.5 text-[12px] text-ink shadow-float backdrop-blur-xl"
      >
        <Icon size={15} className={`mt-px shrink-0 ${tone}`} />
        <p className="min-w-0 flex-1 leading-relaxed">{toast.message}</p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("common.dismissToast")}
          className="-mr-1 mt-px grid h-5 w-5 shrink-0 place-items-center rounded text-ink-faint transition-colors hover:bg-ink/8 hover:text-ink"
        >
          <X size={12} />
        </button>
      </div>
    </div>,
    document.body,
  );
}