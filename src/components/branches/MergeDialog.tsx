import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, GitMerge, Loader2 } from "lucide-react";

import { api } from "../../lib/ipc";
import type { BranchSummary, MergePreview } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import Modal from "../common/Modal";
import BaseBranchPicker from "./BaseBranchPicker";
import CommitMiniList from "./CommitMiniList";

interface MergeDialogProps {
  current: BranchSummary;
  onClose: () => void;
}

function pickDefaultSource(branches: BranchSummary[], current: string): string {
  const others = branches.filter((branch) => branch.refName !== current);
  const local = (name: string) => others.find((branch) => !branch.isRemote && branch.name === name);
  return (
    local("master")?.refName ??
    local("main")?.refName ??
    others.find((branch) => branch.isRemote && branch.shortName === "master")?.refName ??
    others.find((branch) => branch.isRemote && branch.shortName === "main")?.refName ??
    others.find((branch) => !branch.isRemote)?.refName ??
    others[0]?.refName ??
    ""
  );
}

export default function MergeDialog({ current, onClose }: MergeDialogProps) {
  const project = useAppStore((state) => state.activeProject);
  const branches = useAppStore((state) => state.branches);
  const remoteBranches = useAppStore((state) => state.remoteBranches);
  const mergeBranch = useAppStore((state) => state.mergeBranch);

  const allBranches = useMemo(
    () => [
      ...branches,
      ...remoteBranches.filter(
        (remote) => !branches.some((local) => local.refName === remote.refName),
      ),
    ],
    [branches, remoteBranches],
  );

  const [sourceRef, setSourceRef] = useState(() =>
    pickDefaultSource(allBranches, current.refName),
  );
  const [noFf, setNoFf] = useState(false);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!project || !sourceRef) return;
    setLoading(true);
    setError(null);
    try {
      setPreview(await api.mergePreview(project.path, sourceRef));
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [project, sourceRef]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (busy || !sourceRef) return;
    setBusy(true);
    const outcome = await mergeBranch(sourceRef, noFf);
    setBusy(false);
    if (outcome.ok) {
      onClose();
      return;
    }
    if (outcome.code === "merge_conflict") {
      setConflict(outcome.message ?? null);
      return;
    }
    setError(outcome.message ?? "合并失败");
  };

  const sourceBranch = allBranches.find((branch) => branch.refName === sourceRef);
  const nothing = (preview?.count ?? 0) === 0;

  return (
    <Modal
      open
      title="合并分支到当前分支"
      subtitle={`${sourceBranch?.name ?? "选择来源"} → ${current.name}`}
      onClose={busy ? () => undefined : onClose}
      width={560}
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
            disabled={busy || loading || !sourceRef || nothing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <GitMerge size={12} />}
            {preview?.canFastForward && !noFf ? "快进合并" : "合并"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
            来源分支
            <span className="font-normal text-[10.5px] text-ink-faint">
              {nothing ? "没有需要合并的提交" : `将合并 ${preview?.count ?? 0} 个提交`}
            </span>
          </p>
          <BaseBranchPicker
            branches={allBranches}
            value={sourceRef}
            onChange={setSourceRef}
            excludeRefName={current.refName}
            placeholder={sourceBranch?.name ?? "搜索分支"}
            maxHeight={116}
          />
        </div>

        {preview && preview.count > 0 ? (
          <div>
            <p className="mb-1 text-[11.5px] font-medium text-ink-soft">将合并进来的提交</p>
            <div className="overflow-hidden rounded-lg border border-line">
              <CommitMiniList
                commits={preview.commits}
                emptyLabel="没有需要合并的提交"
                maxHeight={148}
              />
            </div>
          </div>
        ) : null}

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-canvas/40 px-3 py-2">
          <span
            className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors ${
              noFf ? "border-accent bg-accent text-white" : "border-line-strong bg-panel"
            }`}
          >
            {noFf ? <Check size={9} strokeWidth={3} /> : null}
          </span>
          <input
            type="checkbox"
            checked={noFf}
            onChange={() => setNoFf((value) => !value)}
            className="sr-only"
          />
          <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-ink-soft">
            始终创建合并提交（--no-ff）
            <span className="mt-0.5 block text-[10px] text-ink-faint">
              不勾选时，能快进就直接快进，历史保持线性。
            </span>
          </span>
        </label>

        {preview?.dirty ? (
          <p className="rounded-lg border border-warning/35 bg-warning/8 px-3 py-2 text-[10.5px] leading-relaxed text-ink-soft">
            工作区有未提交改动，若与合并内容冲突会失败，建议先提交或暂存。
          </p>
        ) : null}

        {conflict ? (
          <div className="rounded-lg border border-negative/35 bg-negative/8 px-3 py-2">
            <p className="flex items-center gap-1 text-[11.5px] font-medium text-negative">
              <AlertTriangle size={11.5} />
              合并出现冲突，仓库停留在 merge 状态
            </p>
            <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-line break-words font-mono text-[10px] leading-relaxed text-ink-soft">
              {conflict}
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="whitespace-pre-line rounded-lg border border-negative/30 bg-negative/8 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-negative">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}