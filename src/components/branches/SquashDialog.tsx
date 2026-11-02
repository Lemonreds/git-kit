import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { useT } from "../../i18n";
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
  const t = useT();
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
        // Recommend "everything the branch added on top of its base", but never
        // more than `reset --soft` can address: the oldest commit survives.
        const ceiling = Math.max(value.totalCommits - 1, 1);
        setCount(String(Math.min(Math.max(value.count, 1), ceiling)));
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
  // `reset --soft HEAD~N` needs a commit to reset to, so the branch's oldest
  // commit can never be folded away: `total - 1` is the real ceiling.
  const maxCount = Math.max((preview?.totalCommits ?? 1) - 1, 1);
  const squashable = (preview?.totalCommits ?? 0) >= 2;
  const valid =
    preview !== null &&
    squashable &&
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
      title={t("branches.actionSquash")}
      subtitle={t("branches.squashSubtitle", { name: branch.name })}
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
            {t("branches.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!valid || busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : null}
            {preview
              ? t("branches.squashSubmit", { count: Math.max(numeric - 1, 0) })
              : t("branches.squashAction")}
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
          {t("branches.loadingSquashPreview")}
        </p>
      ) : !squashable ? (
        <p className="rounded-lg border border-line bg-canvas/50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-soft">
          {t("branches.squashNeedsTwoCommits", { count: preview.totalCommits })}
        </p>
      ) : (
        <div className="space-y-3.5">
          <div className="rounded-lg border border-line bg-canvas/50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-soft">
            {t("branches.baseLabel")}{" "}
            <span className="font-mono text-ink">
              {preview.baseBranch ?? t("branches.firstCommit")}
            </span>
            <span className="mx-1.5 text-ink-faint">·</span>
            {t("branches.squashSinceFork")}
            <span className="font-semibold text-ink">{preview.count}</span>
            {t("branches.squashCommitsSuffix", { total: preview.totalCommits })}
          </div>

          <div className="flex items-end gap-3">
            <label className="w-28 shrink-0">
              <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
                {t("branches.squashCount")}
              </span>
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
                ? t("branches.invalidCount", { max: maxCount })
                : t("branches.squashMergeHint", { count: activeCount })}
            </p>
          </div>

          <div>
            <p className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
              {t("branches.squashCommitsTitle")}
              <HelpTip label={t("branches.squashHint")} />
              <span className="ml-auto font-normal text-[10.5px] text-ink-faint">
                {t("branches.newestFirst")}
              </span>
            </p>
            <div className="overflow-hidden rounded-lg border border-line">
              <CommitMiniList
                commits={commits}
                activeCount={activeCount}
                onPick={(commit) => setMessage(commit.summary)}
                emptyLabel={t("branches.noSquashCommits")}
                maxHeight={232}
              />
              {activeCount > commits.length ? (
                <p className="border-t border-line px-2 py-1 text-[10px] text-ink-faint">
                  {t("branches.squashListTruncated", {
                    count: activeCount,
                    listed: commits.length,
                  })}
                </p>
              ) : null}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
              {t("branches.commitMessage")}
              <span className="font-normal text-[10.5px] text-ink-faint">
                {t("branches.oldestCommitHint")}
              </span>
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