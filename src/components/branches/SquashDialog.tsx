import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { api } from "../../lib/ipc";
import type { BranchSummary, SquashPreview } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import HelpTip from "../common/HelpTip";
import Modal from "../common/Modal";
import CommitMiniList from "./CommitMiniList";

interface SquashDialogProps {
  branch: BranchSummary;
  onClose: () => void;
}

export default function SquashDialog({ branch, onClose }: SquashDialogProps) {
  const project = useAppStore((state) => state.activeProject);
  const squashBranch = useAppStore((state) => state.squashBranch);

  const [preview, setPreview] = useState<SquashPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [count, setCount] = useState("1");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!project) return undefined;
    let cancelled = false;
    setPreview(null);
    setLoadError(null);

    api
      .squashPreview(project.path, branch.name)
      .then((value) => {
        if (cancelled) return;
        setPreview(value);
        setCount(String(Math.max(value.count, 1)));
        setMessage(value.oldestMessage ?? "");
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [project, branch.name]);

  const numeric = Number(count);
  const maxCount = Math.max(preview?.totalCommits ?? 1, 1);
  const valid =
    preview !== null &&
    Number.isInteger(numeric) &&
    numeric >= 1 &&
    numeric <= maxCount &&
    message.trim().length > 0;

  const commits = useMemo(() => preview?.commits ?? [], [preview]);
  const activeCount = Number.isInteger(numeric) && numeric > 0 ? numeric : 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await squashBranch(branch.name, numeric, message.trim());
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      title="压缩提交"
      subtitle={`${branch.name} · 把连续的多个提交合并为一个`}
      onClose={busy ? () => undefined : onClose}
      width={520}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!valid || busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : null}
            {preview ? `压缩为 1 个提交 · -${Math.max(numeric - 1, 0)}` : "压缩"}
          </button>
        </>
      }
    >
      {loadError ? (
        <p className="rounded-lg border border-negative/30 bg-negative/8 px-3 py-2 text-[11.5px] leading-relaxed text-negative">
          {loadError}
        </p>
      ) : !preview ? (
        <p className="flex items-center gap-2 py-3 text-[11.5px] text-ink-faint">
          <Loader2 size={13} className="animate-spin" />
          正在统计与基线的差异提交…
        </p>
      ) : (
        <div className="space-y-3.5">
          <div className="rounded-lg border border-line bg-canvas/50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-soft">
            基线 <span className="font-mono text-ink">{preview.baseBranch ?? "仓库首个提交"}</span>
            <span className="mx-1.5 text-ink-faint">·</span>
            分叉后 <span className="font-semibold text-ink">{preview.count}</span> 个提交（分支共{" "}
            {preview.totalCommits} 个）
          </div>

          <div className="flex items-end gap-3">
            <label className="w-28 shrink-0">
              <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">压缩个数</span>
              <input
                type="number"
                min={1}
                max={maxCount}
                value={count}
                onChange={(event) => setCount(event.target.value)}
                className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors focus:border-accent/60"
              />
            </label>
            <p className="min-w-0 flex-1 pb-1 text-[10.5px] leading-relaxed text-ink-faint">
              {numeric > maxCount || numeric < 1 || !Number.isInteger(numeric)
                ? `请输入 1 到 ${maxCount} 之间的整数`
                : `${activeCount} 条会合并，其余保留`}
            </p>
          </div>

          <div>
            <p className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
              将要压缩的提交
              <HelpTip label="高亮的是会被合并的提交，点击行尾「用这条」可把该提交说明填入提交信息。执行 git reset --soft HEAD~N 后重新提交，历史会改写，推送时需要强制推送。" />
              <span className="ml-auto font-normal text-[10.5px] text-ink-faint">最新在前</span>
            </p>
            <div className="overflow-hidden rounded-lg border border-line">
              <CommitMiniList
                commits={commits}
                activeCount={activeCount}
                onPick={(commit) => setMessage(commit.summary)}
                emptyLabel="没有可压缩的提交"
                maxHeight={232}
              />
            </div>
          </div>

          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
              提交信息
              <span className="font-normal text-[10.5px] text-ink-faint">默认取最旧提交</span>
            </span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-[11.5px] leading-relaxed text-ink outline-none transition-colors focus:border-accent/60"
            />
          </label>
        </div>
      )}
    </Modal>
  );
}