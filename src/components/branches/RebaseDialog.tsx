import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, GitBranch, Loader2, RefreshCw, Upload } from "lucide-react";

import { api } from "../../lib/ipc";
import type { BranchSummary, RebasePreview, RebaseResult } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import HelpTip from "../common/HelpTip";
import Modal from "../common/Modal";
import BaseBranchPicker from "./BaseBranchPicker";
import CommitMiniList from "./CommitMiniList";
import PushDialog from "./PushDialog";

interface RebaseDialogProps {
  branch: BranchSummary;
  onClose: () => void;
}

function pickDefaultBase(branches: BranchSummary[], self: string): string {
  const others = branches.filter((branch) => branch.refName !== self);
  const local = (name: string) => others.find((branch) => !branch.isRemote && branch.name === name);
  const remote = (name: string) =>
    others.find((branch) => branch.isRemote && branch.shortName === name);

  return (
    local("master")?.refName ??
    local("main")?.refName ??
    remote("master")?.refName ??
    remote("main")?.refName ??
    others.find((branch) => !branch.isRemote)?.refName ??
    others[0]?.refName ??
    ""
  );
}

export default function RebaseDialog({ branch, onClose }: RebaseDialogProps) {
  const project = useAppStore((state) => state.activeProject);
  const branches = useAppStore((state) => state.branches);
  const remoteBranches = useAppStore((state) => state.remoteBranches);
  const rebaseBranch = useAppStore((state) => state.rebaseBranch);
  const syncBranch = useAppStore((state) => state.syncBranch);

  const allBranches = useMemo(
    () => [
      ...branches,
      ...remoteBranches.filter(
        (remote) => !branches.some((local) => local.refName === remote.refName),
      ),
    ],
    [branches, remoteBranches],
  );

  const [baseRef, setBaseRef] = useState(() => pickDefaultBase(allBranches, branch.refName));
  const [preview, setPreview] = useState<RebasePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [busy, setBusy] = useState<"rebase" | "sync" | null>(null);
  const [result, setResult] = useState<RebaseResult | null>(null);
  const [pushOpen, setPushOpen] = useState(false);

  const load = useCallback(async () => {
    if (!project || !baseRef) return;
    setLoading(true);
    setError(null);
    try {
      setPreview(await api.rebasePreview(project.path, branch.name, baseRef));
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [project, branch.name, baseRef]);

  // Branches can arrive after the dialog mounts (e.g. slow refresh).
  useEffect(() => {
    if (!baseRef && allBranches.length > 0) {
      setBaseRef(pickDefaultBase(allBranches, branch.refName));
    }
  }, [baseRef, allBranches, branch.refName]);

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
    if (busy || !baseRef) return;
    setBusy("rebase");
    const outcome = await rebaseBranch(branch.name, baseRef);
    setBusy(null);
    if (outcome.ok && outcome.result) {
      setResult(outcome.result);
      return;
    }
    if (outcome.code === "rebase_conflict") {
      setConflict(outcome.message ?? null);
      return;
    }
    setError(outcome.message ?? "rebase 失败");
  };

  const blocked = !baseRef || loading || Boolean(preview?.alreadyBased) || Boolean(preview?.dirty);

  if (pushOpen) {
    return <PushDialog branch={branch} onClose={() => setPushOpen(false)} />;
  }

  return (
    <Modal
      open
      title="Rebase 到基线"
      subtitle={`${branch.name} ← ${preview?.base ?? (baseRef || "选择基线")}`}
      onClose={busy ? () => undefined : onClose}
      width={560}
      footer={
        result ? (
          <>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
            >
              完成
            </button>
            {result.needsForcePush ? (
              <button
                type="button"
                onClick={() => setPushOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-negative/40 px-3 py-1.5 text-[12px] font-medium text-negative transition-colors hover:bg-negative/8"
              >
                <Upload size={12} />
                强制推送
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={busy !== null}
              className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy !== null || blocked}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
            >
              {busy === "rebase" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <GitBranch size={12} />
              )}
              开始 rebase
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 rounded-lg border border-positive/30 bg-positive/8 px-3 py-2 text-[11.5px] text-positive">
            <Check size={12} />
            已把 {result.replayed} 个提交 rebase 到 {result.base}
          </p>
          {result.needsForcePush ? (
            <p className="rounded-lg border border-warning/35 bg-warning/8 px-3 py-2 text-[10.5px] leading-relaxed text-ink-soft">
              该分支的旧提交已经推送过，rebase 改写了历史，远程会拒绝普通推送。点「强制推送」使用{" "}
              <code className="font-mono">--force-with-lease</code> 覆盖远程；若他人刚推过新提交仍会被拒绝。
            </p>
          ) : (
            <p className="text-[10.5px] leading-relaxed text-ink-faint">
              历史已重写但尚未推送过该分支，按正常推送即可。
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas/50 px-3 py-2">
            <div className="min-w-0 flex-1 text-[10.5px] text-ink-soft">
              <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 font-mono">
                <span className="break-all text-ink">{branch.name}</span>
                <span className="text-ink-faint">←</span>
                <span className="min-w-0 break-all">
                  {preview?.base ?? (baseRef || "未选择基线")}
                </span>
                <HelpTip label="rebase 会先同步基线（远程基线会 fetch），再把本分支的提交逐个重放到基线上；冲突时仓库停在 rebase 状态，需手动解决后 git rebase --continue。" />
              </p>
              <p className="mt-0.5 text-[10px] text-ink-faint">
                {loading
                  ? "正在比对…"
                  : preview
                    ? `将重放 ${preview.count} 个提交 · 基线领先 ${preview.behindBase} 个`
                    : "—"}
                {preview?.pushedTip ? " · 旧提交已推送" : ""}
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
              同步远程
            </button>
          </div>

          <div>
            <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
              基线分支
              <span className="font-normal text-[10.5px] text-ink-faint">默认主分支</span>
            </p>
            <BaseBranchPicker
              branches={allBranches}
              value={baseRef}
              onChange={setBaseRef}
              excludeRefName={branch.refName}
              placeholder={preview?.base ?? "搜索分支"}
              maxHeight={132}
            />
          </div>

          {preview && preview.count > 0 ? (
            <div>
              <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
                将被重放的提交
                <span className="font-normal text-[10.5px] text-ink-faint">
                  {preview.commits.length}
                  {preview.count > preview.commits.length ? ` / 共 ${preview.count}` : ""} 个
                </span>
              </p>
              <div className="overflow-hidden rounded-lg border border-line">
                <CommitMiniList commits={preview.commits} emptyLabel="没有需要重放的提交" maxHeight={168} />
              </div>
            </div>
          ) : null}

          {preview?.alreadyBased ? (
            <p className="rounded-lg border border-line bg-canvas/50 px-3 py-2 text-[10.5px] text-ink-soft">
              该分支已经包含基线的全部提交，无需 rebase。
            </p>
          ) : null}

          {preview?.dirty ? (
            <p className="rounded-lg border border-warning/35 bg-warning/8 px-3 py-2 text-[10.5px] leading-relaxed text-ink-soft">
              工作区有未提交改动，rebase 前需要先提交或暂存。
            </p>
          ) : null}

          {!branch.isHead ? (
            <p className="text-[10.5px] text-ink-faint">
              rebase 会先切换到 {branch.name}，完成后停留在该分支。
            </p>
          ) : null}

          {conflict ? (
            <div className="rounded-lg border border-negative/35 bg-negative/8 px-3 py-2">
              <p className="flex items-center gap-1 text-[11.5px] font-medium text-negative">
                <AlertTriangle size={11.5} />
                rebase 时出现冲突，仓库停留在 rebase 状态
              </p>
              <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-line break-words font-mono text-[10px] leading-relaxed text-ink-soft">
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
      )}
    </Modal>
  );
}