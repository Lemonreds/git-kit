import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, RefreshCw, Upload } from "lucide-react";

import { useT } from "../../i18n";
import { api } from "../../lib/ipc";
import type { BranchSummary, PushPreview } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import HelpTip from "../common/HelpTip";
import Modal from "../common/Modal";
import ShaChip from "../common/ShaChip";
import CommitMiniList from "./CommitMiniList";

interface PushDialogProps {
  branch: BranchSummary;
  onClose: () => void;
}

export default function PushDialog({ branch, onClose }: PushDialogProps) {
  const t = useT();
  const project = useAppStore((state) => state.activeProject);
  const pushBranch = useAppStore((state) => state.pushBranch);
  const syncBranch = useAppStore((state) => state.syncBranch);

  const [preview, setPreview] = useState<PushPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState<"normal" | "force" | "sync" | null>(null);

  const load = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    setError(null);
    try {
      setPreview(await api.pushPreview(project.path, branch.name));
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

  const submit = async (force: boolean) => {
    if (busy) return;
    setBusy(force ? "force" : "normal");
    const outcome = await pushBranch(branch.name, force);
    setBusy(null);
    if (outcome.ok) {
      onClose();
      return;
    }
    if (outcome.code === "push_rejected") {
      // The server rejected a normal push: keep the dialog, show the diff and
      // let the user decide about a force push.
      setRejected(outcome.message ?? null);
      setPreview((current) => (current ? { ...current, requiresForce: true } : current));
      await load();
      return;
    }
    setError(outcome.message ?? t("branches.pushFailed"));
  };

  const requiresForce = preview?.requiresForce ?? false;
  const isNewRemoteBranch = preview !== null && !preview.remoteExists;
  const forceBlocked = requiresForce && !acknowledged;

  return (
    <Modal
      open
      title={t("branches.pushTitle")}
      subtitle={`${branch.name} → ${preview?.upstream ?? branch.upstream ?? t("branches.sameNameUpstream")}`}
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
            {t("branches.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={busy !== null || loading || forceBlocked}
            className="inline-flex items-center gap-1.5 rounded-lg border border-negative/40 px-3 py-1.5 text-[12px] font-medium text-negative transition-colors hover:bg-negative/8 disabled:cursor-default disabled:opacity-40"
          >
            {busy === "force" ? <Loader2 size={12} className="animate-spin" /> : null}
            {t("branches.forcePush")}
          </button>
          <button
            type="button"
            onClick={() => void submit(false)}
            disabled={busy !== null || loading || requiresForce}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {busy === "normal" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Upload size={12} />
            )}
            {isNewRemoteBranch
              ? t("branches.pushCreateRemote")
              : t("branches.pushAction")}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {loading && !preview ? (
          <p className="flex items-center gap-2 py-4 text-[11.5px] text-ink-faint">
            <Loader2 size={13} className="animate-spin" />
            {t("branches.comparingLocalRemote")}
          </p>
        ) : null}

        {error ? (
          <p className="whitespace-pre-line rounded-lg border border-negative/30 bg-negative/8 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-negative">
            {error}
          </p>
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
                  <span className="text-ink-faint">→</span>
                  <span className="min-w-0 truncate">{preview.upstream ?? `${preview.remote}/${preview.branch}`}</span>
                  {preview.remoteSha ? (
                    <ShaChip sha={preview.remoteSha} plain className="text-ink-faint" />
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                  <HelpTip label={t("branches.pushHint")} />
                </p>
                <p className="mt-0.5 text-[10px] text-ink-faint">
                  {t("branches.aheadLabel")}{" "}
                  <span className="text-positive">{preview.ahead}</span> · {t("branches.behindLabel")}{" "}
                  <span className={preview.behind > 0 ? "text-warning" : "text-ink-faint"}>
                    {preview.behind}
                  </span>
                  {isNewRemoteBranch ? t("branches.remoteBranchMissingSuffix") : ""}
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
                {t("branches.syncRemoteStatus")}
              </button>
            </div>

            {rejected ? (
              <div className="rounded-lg border border-negative/30 bg-negative/8 px-3 py-2">
                <p className="flex items-center gap-1 text-[11.5px] font-medium text-negative">
                  <AlertTriangle size={11.5} />
                  {t("branches.pushRejected")}
                </p>
                <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-line break-words font-mono text-[10px] leading-relaxed text-ink-soft">
                  {rejected}
                </p>
              </div>
            ) : null}

            {requiresForce ? (
              <div className="rounded-lg border border-warning/35 bg-warning/8 px-3 py-2">
                <p className="flex items-center gap-1 text-[11.5px] font-medium text-ink">
                  <AlertTriangle size={11.5} className="text-warning" />
                  {t("branches.pushRequiresForce", { count: preview.remoteOnlyTotal })}
                </p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-faint">
                  {t("branches.pushForcePrefix")}
                  <code className="font-mono">--force-with-lease</code>
                  {t("branches.pushForceSuffix")}
                </p>
              </div>
            ) : null}

            <div>
              <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
                {t("branches.pushCommits")}
                <span className="font-normal text-[10.5px] text-ink-faint">
                  {preview.ahead > preview.pushCommits.length
                    ? t("branches.commitCountOfTotal", {
                        shown: preview.pushCommits.length,
                        total: preview.ahead,
                      })
                    : t("branches.commitCount", { count: preview.pushCommits.length })}
                </span>
              </p>
              <div className="overflow-hidden rounded-lg border border-line">
                <CommitMiniList
                  commits={preview.pushCommits}
                  emptyLabel={
                    isNewRemoteBranch
                      ? t("branches.pushNewRemoteEmpty")
                      : t("branches.noPushCommits")
                  }
                  maxHeight={148}
                />
              </div>
            </div>

            {preview.remoteOnlyCommits.length > 0 ? (
              <div>
                <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
                  {t("branches.remoteOnlyCommitsTitle")}
                  <span className="font-normal text-[10.5px] text-warning">
                    {t("branches.commitCount", { count: preview.remoteOnlyTotal })}
                  </span>
                </p>
                <div className="overflow-hidden rounded-lg border border-warning/35">
                  <CommitMiniList
                    commits={preview.remoteOnlyCommits}
                    emptyLabel={t("branches.noRemoteOnlyCommits")}
                    maxHeight={124}
                  />
                </div>
              </div>
            ) : null}

            {requiresForce ? (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-negative/30 bg-negative/6 px-3 py-2">
                <span
                  className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors ${
                    acknowledged ? "border-negative bg-negative text-white" : "border-line-strong bg-panel"
                  }`}
                >
                  {acknowledged ? <Check size={9} strokeWidth={3} /> : null}
                </span>
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={() => setAcknowledged((value) => !value)}
                  className="sr-only"
                />
                <span className="text-[11px] leading-relaxed text-ink-soft">
                  {t("branches.forceAckPrefix")}
                  <span className="font-semibold text-negative">{preview.remoteOnlyTotal}</span>
                  {t("branches.forceAckSuffix")}
                </span>
              </label>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}