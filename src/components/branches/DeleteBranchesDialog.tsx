import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, ShieldOff, Trash2 } from "lucide-react";

import { useT } from "../../i18n";
import { isProtectedBranch } from "../../lib/branchTemplate";
import { relativeTime } from "../../lib/format";
import type { BranchSummary, DeleteFailure } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import ConfirmDialog from "../common/ConfirmDialog";
import HelpTip from "../common/HelpTip";
import Modal from "../common/Modal";
import ShaChip from "../common/ShaChip";

interface DeleteBranchesDialogProps {
  branches: BranchSummary[];
  onClose: () => void;
}

export default function DeleteBranchesDialog({ branches, onClose }: DeleteBranchesDialogProps) {
  const t = useT();
  const deleteLocalBranches = useAppStore((state) => state.deleteLocalBranches);
  const notify = useAppStore((state) => state.notify);
  const snapshot = useAppStore((state) => state.snapshot);
  const project = useAppStore((state) => state.activeProject);

  const candidates = useMemo(() => branches.filter((branch) => !branch.isRemote), [branches]);
  const hasRemote = Boolean(
    snapshot?.url ?? snapshot?.remoteHost ?? project?.url ?? project?.remoteHost,
  );

  // Default: everything selectable except the protected branches and HEAD.
  const [selected, setSelected] = useState<string[]>(() =>
    candidates
      .filter((branch) => !branch.isHead && !isProtectedBranch(branch.name))
      .map((branch) => branch.name),
  );
  const [forceUnmerged, setForceUnmerged] = useState(false);
  const [deleteRemote, setDeleteRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [report, setReport] = useState<{
    deleted: string[];
    failed: DeleteFailure[];
    remoteDeleted: string[];
    remoteFailed: DeleteFailure[];
  } | null>(null);

  // A branch that vanished (external `git branch -d`) must not stay selected.
  useEffect(() => {
    setSelected((current) => current.filter((name) => candidates.some((branch) => branch.name === name)));
  }, [candidates]);

  const selectable = candidates.filter((branch) => !branch.isHead);
  const allSelected = selectable.length > 0 && selectable.every((branch) => selected.includes(branch.name));

  const toggle = (name: string) => {
    setSelected((current) =>
      current.includes(name) ? current.filter((value) => value !== name) : [...current, name],
    );
  };

  const submit = async () => {
    if (busy || selected.length === 0) return;
    setConfirming(false);
    setBusy(true);
    const result = await deleteLocalBranches(selected, forceUnmerged, deleteRemote);
    setBusy(false);
    if (!result.ok) return;

    const deleted = result.deleted ?? [];
    const failed = result.failed ?? [];
    const remoteDeleted = result.remoteDeleted ?? [];
    const remoteFailed = result.remoteFailed ?? [];
    if (deleted.length > 0) {
      notify(
        "success",
        remoteDeleted.length > 0
          ? t("branches.deletedBoth", {
              local: deleted.length,
              remote: remoteDeleted.length,
            })
          : t("branches.deletedLocalCount", { count: deleted.length }),
      );
    }
    if (failed.length > 0 || remoteFailed.length > 0) {
      setReport({ deleted, failed, remoteDeleted, remoteFailed });
      if (failed.length > 0) setSelected(failed.map((item) => item.name));
      return;
    }
    onClose();
  };

  const separator = t("branches.listSeparator");
  const confirmDescription =
    selected.length > 0
      ? [
          selected.length > 6
            ? t("branches.confirmDeleteDescriptionMore", {
                count: selected.length,
                names: selected.slice(0, 6).join(separator),
              })
            : t("branches.confirmDeleteDescription", {
                count: selected.length,
                names: selected.join(separator),
              }),
          forceUnmerged ? t("branches.confirmDeleteForce") : "",
          deleteRemote
            ? t("branches.confirmDeleteRemote")
            : t("branches.confirmDeleteKeepRemote"),
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  return (
    <>
      <Modal
        open
        title={t("branches.deleteBranch")}
        subtitle={t("branches.deleteSubtitle")}
        onClose={busy ? () => undefined : onClose}
        width={540}
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
            >
              {t("branches.close")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy || selected.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-negative px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {deleteRemote && hasRemote
                ? t("branches.deleteCountWithRemote", { count: selected.length })
                : t("branches.deleteCount", { count: selected.length })}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-soft">
              <ShieldOff size={12} className="text-ink-faint" />
              {t("branches.selectToDelete")}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] text-ink-faint">
                {t("branches.selectedOf", { selected: selected.length, total: selectable.length })}
              </span>
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    allSelected
                      ? []
                      : selectable.map((branch) => branch.name),
                  )
                }
                className="rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
              >
                {allSelected ? t("branches.clearSelection") : t("branches.selectAll")}
              </button>
            </div>
          </div>

          <div className="max-h-[232px] overflow-y-auto rounded-lg border border-line">
            {candidates.length === 0 ? (
              <p className="px-3 py-3 text-[11.5px] text-ink-faint">
                {t("branches.noLocalBranches")}
              </p>
            ) : (
              candidates.map((branch) => {
                const disabled = branch.isHead;
                const checked = !disabled && selected.includes(branch.name);
                return (
                  <label
                    key={branch.refName}
                    className={`flex items-start gap-2 border-b border-line/60 px-2.5 py-1.5 last:border-b-0 ${
                      disabled ? "cursor-default opacity-55" : "cursor-pointer hover:bg-ink/5"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors ${
                        checked
                          ? "border-negative bg-negative text-white"
                          : "border-line-strong bg-panel"
                      }`}
                    >
                      {checked ? <Check size={9} strokeWidth={3} /> : null}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(branch.name)}
                      className="sr-only"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-[12px] text-ink">{branch.name}</span>
                        {branch.isHead ? (
                          <span className="shrink-0 rounded bg-accent-soft px-1 py-px text-[9px] font-medium text-accent">
                            {t("branches.currentBranch")}
                          </span>
                        ) : null}
                        {isProtectedBranch(branch.name) ? (
                          <span className="shrink-0 rounded border border-line px-1 py-px text-[9px] text-ink-faint">
                            {t("branches.protectedBranch")}
                          </span>
                        ) : null}
                        {branch.ahead ? (
                          <span className="shrink-0 font-mono text-[9.5px] text-warning">
                            {t("branches.aheadUnpushed", { count: branch.ahead })}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10.5px] text-ink-faint">
                        {branch.lastCommit ? (
                          <>
                            <ShaChip sha={branch.lastCommit.sha} plain className="text-[10px]" />
                            <span className="truncate">{branch.lastCommit.summary}</span>
                            <span>·</span>
                            <span className="shrink-0">{relativeTime(branch.lastCommit.committedAt)}</span>
                          </>
                        ) : (
                          <span>{t("branches.noCommits")}</span>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2">
            <span
              className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors ${
                forceUnmerged ? "border-warning bg-warning text-white" : "border-warning/40 bg-panel"
              }`}
            >
              {forceUnmerged ? <Check size={9} strokeWidth={3} /> : null}
            </span>
            <input
              type="checkbox"
              checked={forceUnmerged}
              onChange={() => setForceUnmerged((value) => !value)}
              className="sr-only"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-[11.5px] font-medium text-ink">
                {t("branches.forceUnmergedLabel")}
                <HelpTip label={t("branches.forceUnmergedHint")} />
              </span>
            </span>
          </label>

          <label
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
              hasRemote
                ? "cursor-pointer border-negative/30 bg-negative/6"
                : "cursor-default border-line bg-canvas/40 opacity-60"
            }`}
          >
            <span
              className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors ${
                deleteRemote && hasRemote
                  ? "border-negative bg-negative text-white"
                  : "border-line-strong bg-panel"
              }`}
            >
              {deleteRemote && hasRemote ? <Check size={9} strokeWidth={3} /> : null}
            </span>
            <input
              type="checkbox"
              checked={deleteRemote}
              disabled={!hasRemote}
              onChange={() => setDeleteRemote((value) => !value)}
              className="sr-only"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-[11.5px] font-medium text-ink">
                {t("branches.deleteRemoteLabel")}
                <HelpTip label={t("branches.deleteRemoteHint")} />
              </span>
              <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-faint">
                {hasRemote
                  ? t("branches.deleteRemoteNote")
                  : t("branches.deleteRemoteNoteNoRemote")}
              </span>
            </span>
          </label>

          {report && (report.failed.length > 0 || report.remoteFailed.length > 0) ? (
            <div className="rounded-lg border border-negative/30 bg-negative/8 px-3 py-2">
              <p className="flex items-center gap-1 text-[11.5px] font-medium text-negative">
                <AlertTriangle size={11.5} />
                {t("branches.deleteReportTitle", {
                  count: report.failed.length + report.remoteFailed.length,
                })}
                {report.deleted.length > 0
                  ? t("branches.deleteReportLocal", { count: report.deleted.length })
                  : ""}
                {report.remoteDeleted.length > 0
                  ? t("branches.deleteReportRemote", { count: report.remoteDeleted.length })
                  : ""}
              </p>
              <ul className="mt-1 space-y-1">
                {[...report.failed, ...report.remoteFailed].map((item) => (
                  <li key={item.name} className="text-[10.5px] leading-relaxed text-ink-soft">
                    <code className="font-mono text-negative">{item.name}</code>
                    <span className="whitespace-pre-line"> — {item.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        title={t("branches.confirmDeleteManyTitle", { count: selected.length })}
        description={confirmDescription}
        confirmLabel={t("branches.confirmDeleteConfirm")}
        tone="danger"
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}