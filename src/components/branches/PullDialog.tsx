import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Check, Loader2, RefreshCw } from "lucide-react";

import { api } from "../../lib/ipc";
import type { BranchSummary, PullPreview } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import HelpTip from "../common/HelpTip";
import Modal from "../common/Modal";
import ShaChip from "../common/ShaChip";
import CommitMiniList from "./CommitMiniList";

interface PullDialogProps {
  branch: BranchSummary;
  /** Row action on a non-current branch: switch to it before pulling. */
  switchFirst?: boolean;
  onClose: () => void;
}

export default function PullDialog({ branch, switchFirst = false, onClose }: PullDialogProps) {
  const project = useAppStore((state) => state.activeProject);
  const pullBranch = useAppStore((state) => state.pullBranch);
  const syncBranch = useAppStore((state) => state.syncBranch);

  const [preview, setPreview] = useState<PullPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [allowMerge, setAllowMerge] = useState(false);
  const [busy, setBusy] = useState<"pull" | "sync" | null>(null);

  const load = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    setError(null);
    try {
      setPreview(await api.pullPreview(project.path, branch.name));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [project, branch.name]);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = async () => {
    if (busy) return;
    setBusy("sync");
    await syncBranch(branch.name);
    setBusy(null);
    await load();
  };

  const submit = async () => {
    if (busy) return;
    setBusy("pull");
    const outcome = await pullBranch(branch.name, allowMerge, switchFirst);
    setBusy(null);
    if (outcome.ok) {
      onClose();
      return;
    }
    if (outcome.code === "pull_conflict") {
      setConflict(outcome.message ?? null);
      await load();
      return;
    }
    setError(outcome.message ?? "拉取失败");
  };

  // A pull that has to switch branches first is fast-forward only: merging into a
  // branch the user was not on would be a surprise.
  const needsMergeChoice = preview && !switchFirst ? preview.diverged : false;
  const divergedBlocked = preview && switchFirst ? preview.diverged : false;
  const nothingToPull = (preview?.upToDate ?? false) || (preview ? !preview.remoteExists : false);
  const missingRemote = preview ? !preview.remoteExists : false;
  const blocked = (needsMergeChoice && !allowMerge) || Boolean(divergedBlocked);

  return (
    <Modal
      open
      title="拉取远程提交"
      subtitle={`${branch.name} ← ${preview?.upstream ?? branch.upstream ?? "origin/同名分支"}`}
      onClose={busy ? () => undefined : onClose}
      width={560}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="mr-auto rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy !== null || loading || nothingToPull || blocked}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {busy === "pull" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ArrowDownToLine size={12} />
            )}
            {nothingToPull
              ? "已是最新"
              : switchFirst
                ? "切换并拉取"
                : needsMergeChoice
                  ? "合并并拉取"
                  : "拉取"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {loading && !preview ? (
          <p className="flex items-center gap-2 py-4 text-[11.5px] text-ink-faint">
            <Loader2 size={13} className="animate-spin" />
            正在比对本地与远程…
          </p>
        ) : null}

        {error ? (
          <p className="whitespace-pre-line rounded-lg border border-negative/30 bg-negative/8 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-negative">
            {error}
          </p>
        ) : null}

        {conflict ? (
          <div className="rounded-lg border border-negative/35 bg-negative/8 px-3 py-2">
            <p className="flex items-center gap-1 text-[11.5px] font-medium text-negative">
              <AlertTriangle size={11.5} />
              拉取时出现冲突，仓库停留在 merge 状态
            </p>
            <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-line break-words font-mono text-[10px] leading-relaxed text-ink-soft">
              {conflict}
            </p>
          </div>
        ) : null}

        {preview ? (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas/50 px-3 py-2">
              <div className="min-w-0 flex-1 font-mono text-[10.5px] text-ink-soft">
                <p className="flex min-w-0 items-center gap-1">
                  {preview.localSha ? (
                    <ShaChip sha={preview.localSha} plain className="text-ink" />
                  ) : (
                    <span className="text-ink">—</span>
                  )}
                  <span className="text-ink-faint">←</span>
                  <span className="min-w-0 truncate">{preview.upstream ?? `${preview.remote}/${preview.branch}`}</span>
                  {preview.remoteSha ? (
                    <ShaChip sha={preview.remoteSha} plain className="text-ink-faint" />
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                  <HelpTip label="点「拉取」时先执行 git fetch --prune 再比对：本地无自有提交则快进，否则合并。网络超时 120 秒，复用系统 SSH key / 凭据助手。" />
                </p>
                <p className="mt-0.5 text-[10px] text-ink-faint">
                  落后 <span className="text-warning">{preview.behind}</span> · 领先{" "}
                  <span className={preview.ahead > 0 ? "text-positive" : "text-ink-faint"}>
                    {preview.ahead}
                  </span>
                  {preview.upToDate ? " · 已是最新" : ""}
                  {preview.fastForward ? " · 可直接快进" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void sync()}
                disabled={busy !== null}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-1 text-[10.5px] text-ink-soft transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                {busy === "sync" ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <RefreshCw size={11} />
                )}
                同步远程状态
              </button>
            </div>

            {preview.dirty ? (
              <p className="rounded-lg border border-warning/35 bg-warning/8 px-3 py-2 text-[10.5px] leading-relaxed text-ink-soft">
                工作区有未提交改动；若与拉取的提交改到同一文件，git 会拒绝合并或产生冲突。
              </p>
            ) : null}

            {missingRemote ? (
              <p className="rounded-lg border border-warning/35 bg-warning/8 px-3 py-2 text-[10.5px] leading-relaxed text-ink-soft">
                远程还没有 <code className="font-mono">{preview.upstream}</code>，先把本地分支推送上去再拉取。
              </p>
            ) : null}

            <div>
              <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
                将拉取的提交
                <span className="font-normal text-[10.5px] text-ink-faint">
                  {preview.incomingCommits.length}
                  {preview.incomingTotal > preview.incomingCommits.length
                    ? ` / 共 ${preview.incomingTotal}`
                    : ""}{" "}
                  个
                </span>
              </p>
              <div className="overflow-hidden rounded-lg border border-line">
                <CommitMiniList
                  commits={preview.incomingCommits}
                  emptyLabel="远程没有新的提交"
                  maxHeight={168}
                />
              </div>
            </div>

            {preview.localOnlyCommits.length > 0 ? (
              <div>
                <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
                  本地未推送提交
                  <span className="font-normal text-[10.5px] text-warning">
                    {preview.localOnlyTotal} 个 · 合并会生成 merge 提交
                  </span>
                </p>
                <div className="overflow-hidden rounded-lg border border-warning/35">
                  <CommitMiniList
                    commits={preview.localOnlyCommits}
                    emptyLabel="没有本地独有提交"
                    maxHeight={124}
                  />
                </div>
              </div>
            ) : null}

            {switchFirst ? (
              <p className="rounded-lg border border-line bg-canvas/50 px-3 py-2 text-[10.5px] leading-relaxed text-ink-soft">
                拉取前会先切换到 <code className="font-mono">{branch.name}</code>
                ，并保持在该分支；工作区有未提交改动时会先询问。此入口只做快进，不会自动合并。
              </p>
            ) : null}

            {divergedBlocked ? (
              <p className="rounded-lg border border-warning/35 bg-warning/8 px-3 py-2 text-[10.5px] leading-relaxed text-ink-soft">
                本地有 {preview?.ahead ?? 0} 个未推送提交，无法快进拉取。请先推送，或切换到该分支后在「改动」面板里手动选择合并。
              </p>
            ) : null}

            {needsMergeChoice ? (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-warning/35 bg-warning/8 px-3 py-2">
                <span
                  className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors ${
                    allowMerge ? "border-warning bg-warning text-white" : "border-line-strong bg-panel"
                  }`}
                >
                  {allowMerge ? <Check size={9} strokeWidth={3} /> : null}
                </span>
                <input
                  type="checkbox"
                  checked={allowMerge}
                  onChange={() => setAllowMerge((value) => !value)}
                  className="sr-only"
                />
                <span className="text-[11px] leading-relaxed text-ink-soft">
                  本地有未推送提交，允许创建合并提交（merge）
                </span>
              </label>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}