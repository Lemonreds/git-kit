import { useEffect, useState } from "react";
import { Archive, ArrowUpFromLine, Check, Loader2, Trash2 } from "lucide-react";

import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import ConfirmDialog from "../common/ConfirmDialog";
import Modal from "../common/Modal";

interface StashDialogProps {
  onClose: () => void;
}

export default function StashDialog({ onClose }: StashDialogProps) {
  const t = useT();
  const stashEntries = useAppStore((state) => state.stashEntries);
  const refreshStashes = useAppStore((state) => state.refreshStashes);
  const stashPush = useAppStore((state) => state.stashPush);
  const stashPop = useAppStore((state) => state.stashPop);
  const stashDrop = useAppStore((state) => state.stashDrop);
  const notify = useAppStore((state) => state.notify);

  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [busy, setBusy] = useState<"push" | number | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<number | null>(null);

  useEffect(() => {
    void refreshStashes();
  }, [refreshStashes]);

  const push = async () => {
    if (busy !== null) return;
    setBusy("push");
    const ok = await stashPush(message.trim(), includeUntracked);
    setBusy(null);
    if (ok) setMessage("");
  };

  const pop = async (index: number) => {
    if (busy !== null) return;
    setBusy(index);
    setConflict(null);
    const outcome = await stashPop(index);
    setBusy(null);
    if (outcome.ok) {
      onClose();
      return;
    }
    if (outcome.code === "stash_conflict") setConflict(outcome.message ?? null);
  };

  return (
    <>
      <Modal
        open
        title={t("changes.stashLabel")}
        subtitle={t("changes.stashSubtitle")}
        onClose={busy !== null ? () => undefined : onClose}
        width={520}
        footer={
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {t("changes.close")}
          </button>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-canvas/40 p-2.5">
            <div className="flex items-center gap-2">
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void push();
                }}
                placeholder={t("changes.stashMessagePlaceholder")}
                className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
              />
              <button
                type="button"
                onClick={() => void push()}
                disabled={busy !== null}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-45"
              >
                {busy === "push" ? <Loader2 size={11} className="animate-spin" /> : <Archive size={11} />}
                {t("changes.stashCreate")}
              </button>
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[10.5px] text-ink-faint">
              <span
                className={`grid h-3 w-3 place-items-center rounded-[3px] border transition-colors ${
                  includeUntracked ? "border-accent bg-accent text-white" : "border-line-strong bg-panel"
                }`}
              >
                {includeUntracked ? <Check size={8} strokeWidth={3} /> : null}
              </span>
              <input
                type="checkbox"
                checked={includeUntracked}
                onChange={() => setIncludeUntracked((value) => !value)}
                className="sr-only"
              />
              {t("changes.stashIncludeUntracked")}
            </label>
          </div>

          <div>
            <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
              {t("changes.stashExisting")}
              <span className="font-normal text-[10.5px] text-ink-faint">
                {t("changes.stashCount", { count: stashEntries.length })}
              </span>
            </p>
            {stashEntries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-[11px] text-ink-faint">
                {t("changes.stashEmpty")}
              </p>
            ) : (
              <div className="max-h-[220px] overflow-y-auto rounded-lg border border-line">
                {stashEntries.map((entry) => (
                  <div
                    key={entry.selector}
                    className="flex items-center gap-2 border-b border-line/70 px-2.5 py-1.5 last:border-b-0"
                  >
                    <code className="shrink-0 rounded bg-canvas px-1 py-px font-mono text-[9.5px] text-ink-faint">
                      {entry.selector}
                    </code>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink">
                      {entry.message || t("changes.stashNoMessage")}
                    </span>
                    <button
                      type="button"
                      onClick={() => void pop(entry.index)}
                      disabled={busy !== null}
                      title={t("changes.stashPopTitle")}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-40"
                    >
                      {busy === entry.index ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <ArrowUpFromLine size={10} />
                      )}
                      {t("changes.stashPop")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDrop(entry.index)}
                      disabled={busy !== null}
                      aria-label={t("changes.stashDrop")}
                      className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-faint transition-colors hover:bg-negative/10 hover:text-negative disabled:opacity-40"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {conflict ? (
            <p className="max-h-32 overflow-y-auto whitespace-pre-line rounded-lg border border-negative/30 bg-negative/8 px-3 py-2 font-mono text-[10px] leading-relaxed text-negative">
              {conflict}
            </p>
          ) : null}

          <p className="text-[10.5px] leading-relaxed text-ink-faint">
            {t("changes.stashConflictHint")}
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDrop !== null}
        title={t("changes.stashDropTitle")}
        description={t("changes.stashDropDescription")}
        confirmLabel={t("changes.delete")}
        tone="danger"
        onConfirm={() => {
          const index = pendingDrop;
          setPendingDrop(null);
          if (index !== null) {
            void stashDrop(index).then((ok) => {
              if (!ok) notify("error", t("changes.stashDropFailed"));
            });
          }
        }}
        onCancel={() => setPendingDrop(null)}
      />
    </>
  );
}