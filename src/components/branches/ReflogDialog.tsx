import { useEffect, useState } from "react";
import { History } from "lucide-react";

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
        title="操作历史（reflog）"
        subtitle="误 rebase / reset / squash 后，可以从这里回到任意一次 HEAD"
        onClose={onClose}
        width={560}
        footer={
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            关闭
          </button>
        }
      >
        {reflog.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11px] text-ink-faint">
            没有操作记录
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
                  回到这里
                </button>
                <button
                  type="button"
                  onClick={() => setPending({ entry, hard: true })}
                  className="shrink-0 rounded-md border border-negative/35 px-1.5 py-0.5 text-[10.5px] text-negative transition-colors hover:bg-negative/8"
                >
                  强制重置
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-2 text-[10.5px] leading-relaxed text-ink-faint">
          「回到这里」使用 <code className="font-mono">reset --mixed</code>
          ，会保留当前文件内容为未提交改动；
          <br />
          「强制重置」使用 <code className="font-mono">reset --hard</code>
          ，工作区改动会被丢弃。如果分支已经推送过，重置后需要强制推送。
        </p>
      </Modal>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.hard
            ? `强制重置到 ${pending.entry.shortSha}？`
            : `回到 ${pending?.entry.shortSha}？`
        }
        description={
          pending?.hard
            ? "当前工作区的未提交改动会被丢弃，且无法撤销。"
            : "当前 HEAD 会移动到该提交，文件内容保留为未提交改动。"
        }
        confirmLabel={pending?.hard ? "强制重置" : "回到这里"}
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