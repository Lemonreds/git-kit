import { useEffect, useState } from "react";
import { History } from "lucide-react";

import { useT } from "../../i18n";
import { relativeTime } from "../../lib/format";
import type { ReflogEntry } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import ConfirmDialog from "../common/ConfirmDialog";
import Modal from "../common/Modal";
import ShaChip from "../common/ShaChip";

interface ReflogDialogProps {
  onClose: () => void;
}

type Pending = { entry: ReflogEntry; hard: boolean };

export default function ReflogDialog({ onClose }: ReflogDialogProps) {
  const t = useT();
  const reflog = useAppStore((state) => state.reflog);
  const refreshReflog = useAppStore((state) => state.refreshReflog);
  const resetTo = useAppStore((state) => state.resetTo);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    void refreshReflog();
  }, [refreshReflog]);

  return (
    <>
      <Modal
        open
        title={t("branches.actionReflog")}
        subtitle={t("branches.reflogSubtitle")}
        onClose={onClose}
        width={560}
        footer={
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {t("branches.close")}
          </button>
        }
      >
        {reflog.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11px] text-ink-faint">
            {t("branches.noReflog")}
          </p>
        ) : (
          <div className="max-h-[340px] overflow-y-auto rounded-lg border border-line">
            {reflog.map((entry) => (
              <div
                key={`${entry.index}:${entry.sha}`}
                className="flex items-center gap-2 border-b border-line/70 px-2.5 py-1.5 last:border-b-0"
              >
                <History size={12} className="shrink-0 text-ink-faint" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5">
                    <ShaChip sha={entry.sha} plain className="text-[10px]" />
                    <span className="truncate text-[11.5px] text-ink">
                      {entry.action || "HEAD"}
                    </span>
                    <span className="shrink-0 text-[10px] text-ink-faint">
                      {relativeTime(entry.when)}
                    </span>
                  </p>
                  {entry.message ? (
                    <p className="mt-0.5 truncate text-[10px] text-ink-faint">{entry.message}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setPending({ entry, hard: false })}
                  className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
                >
                  {t("branches.reflogGoBack")}
                </button>
                <button
                  type="button"
                  onClick={() => setPending({ entry, hard: true })}
                  className="shrink-0 rounded-md border border-negative/35 px-1.5 py-0.5 text-[10.5px] text-negative transition-colors hover:bg-negative/8"
                >
                  {t("branches.reflogHardReset")}
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-2 text-[10.5px] leading-relaxed text-ink-faint">
          {t("branches.reflogMixedPrefix")}
          <code className="font-mono">reset --mixed</code>
          {t("branches.reflogMixedSuffix")}
          <br />
          {t("branches.reflogHardPrefix")}
          <code className="font-mono">reset --hard</code>
          {t("branches.reflogHardSuffix")}
        </p>
      </Modal>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.hard
            ? t("branches.confirmHardResetTitle", { sha: pending.entry.shortSha })
            : t("branches.confirmGoBackTitle", { sha: pending?.entry.shortSha ?? "" })
        }
        description={
          pending?.hard
            ? t("branches.confirmHardResetBody")
            : t("branches.confirmGoBackBody")
        }
        confirmLabel={
          pending?.hard ? t("branches.reflogHardReset") : t("branches.reflogGoBack")
        }
        tone={pending?.hard ? "danger" : "default"}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (!target) return;
          void resetTo(target.entry.sha, target.hard).then((ok) => {
            if (ok) onClose();
          });
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}