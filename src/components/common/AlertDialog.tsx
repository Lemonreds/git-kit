import { useAppStore } from "../../store/appStore";
import { createPortal } from "react-dom";

/** Blocking message for long git output (cherry-pick conflicts, push errors). */
export default function AlertDialog() {
  const alert = useAppStore((state) => state.alert);
  const dismiss = useAppStore((state) => state.dismissAlert);

  if (!alert) return null;

  return createPortal(
    <div
      data-modal="true"
      className="animate-fade fixed inset-0 z-[60] grid place-items-center bg-black/30 p-6 backdrop-blur-[2px]"
    >
      <div className="animate-in flex max-h-[80vh] w-full max-w-[520px] flex-col rounded-2xl border border-line bg-raised p-4 shadow-float">
        <p className="text-[13px] font-semibold text-ink">{alert.title}</p>
        <p className="mt-2 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-canvas/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-soft">
          {alert.message}
        </p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
          >
            知道了
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}