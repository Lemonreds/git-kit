import { lazy, Suspense, useState } from "react";
import type { ReactNode } from "react";

import { useT } from "../../i18n";
import type { BranchSummary } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import ConfirmDialog from "../common/ConfirmDialog";

const CherryPickDialog = lazy(() => import("./CherryPickDialog"));
const CreateBranchDialog = lazy(() => import("./CreateBranchDialog"));
const MergeDialog = lazy(() => import("./MergeDialog"));
const CompareDialog = lazy(() => import("./CompareDialog"));
const PullDialog = lazy(() => import("./PullDialog"));
const PushDialog = lazy(() => import("./PushDialog"));
const RebaseDialog = lazy(() => import("./RebaseDialog"));
const ReflogDialog = lazy(() => import("./ReflogDialog"));
const SquashDialog = lazy(() => import("./SquashDialog"));
const TagDialog = lazy(() => import("./TagDialog"));

/** Row-level operation in flight, rendered as a spinner + label on the row. */
export interface BranchBusy {
  refName: string;
  label: string;
}

export interface BranchActions {
  /** `checkout` — asks first when the worktree still holds uncommitted changes. */
  switchTo: (branch: BranchSummary) => void;
  squash: (branch: BranchSummary) => void;
  rebase: (branch: BranchSummary) => void;
  cherryPick: (branch: BranchSummary) => void;
  push: (branch: BranchSummary) => void;
  pull: (branch: BranchSummary) => void;
  /** `null` = pick the base inside the dialog, a ref = pre-select it. */
  create: (baseRef: string | null) => void;
  remove: (branch: BranchSummary) => void;
  merge: () => void;
  compare: (branch: BranchSummary) => void;
  tags: () => void;
  reflog: () => void;
}

export interface BranchActionState {
  busy: BranchBusy | null;
  actions: BranchActions;
  /** All dialogs/confirmations this hook owns; render once per panel. */
  dialogs: ReactNode;
}

/**
 * Every branch operation reachable from a branch row (and from the commit list
 * header of that branch): switch / squash / rebase / cherry-pick / push / pull /
 * new branch / delete / merge / compare / tags / reflog.
 *
 * Dialogs are lazy-loaded and only mounted while a target is set. The hook is
 * instantiated once per panel, so the same entry points can be rendered in both
 * the branch list and the commit list without duplicating the wiring.
 */
export function useBranchActions(): BranchActionState {
  const t = useT();
  const changes = useAppStore((state) => state.changes);
  const branches = useAppStore((state) => state.branches);
  const switchBranch = useAppStore((state) => state.switchBranch);
  const deleteLocalBranches = useAppStore((state) => state.deleteLocalBranches);
  const notify = useAppStore((state) => state.notify);
  const showAlert = useAppStore((state) => state.showAlert);

  const [busy, setBusy] = useState<BranchBusy | null>(null);
  const [squashTarget, setSquashTarget] = useState<BranchSummary | null>(null);
  const [rebaseTarget, setRebaseTarget] = useState<BranchSummary | null>(null);
  const [cherryTarget, setCherryTarget] = useState<BranchSummary | null>(null);
  const [pushTarget, setPushTarget] = useState<BranchSummary | null>(null);
  const [pullTarget, setPullTarget] = useState<BranchSummary | null>(null);
  const [createBase, setCreateBase] = useState<string | null | undefined>(undefined);
  const [pendingSwitch, setPendingSwitch] = useState<BranchSummary | null>(null);
  const [compareTarget, setCompareTarget] = useState<BranchSummary | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [reflogOpen, setReflogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BranchSummary | null>(null);
  const [pendingForceDelete, setPendingForceDelete] = useState<BranchSummary | null>(null);

  const currentBranch = branches.find((branch) => branch.isHead) ?? null;

  const doSwitch = async (branch: BranchSummary) => {
    if (branch.isHead) return;
    setBusy({ refName: branch.refName, label: t("branches.busySwitching") });
    await switchBranch(branch.name);
    setBusy(null);
  };

  /** Uncommitted changes follow the checkout; confirm before moving them. */
  const requestSwitch = (branch: BranchSummary) => {
    if (branch.isHead) return;
    if ((changes?.entries.length ?? 0) > 0) {
      setPendingSwitch(branch);
      return;
    }
    void doSwitch(branch);
  };

  /** Quick delete from the row: `-d` first, offer `-D` only when unmerged. */
  const quickDelete = async (branch: BranchSummary, force: boolean) => {
    setBusy({
      refName: branch.refName,
      label: force ? t("branches.busyForceDeleting") : t("branches.busyDeleting"),
    });
    const result = await deleteLocalBranches([branch.name], force);
    setBusy(null);
    if (!result.ok) return;

    const deleted = result.deleted ?? [];
    const failed = result.failed ?? [];
    if (deleted.length > 0) {
      notify("success", t("branches.deletedLocal", { name: deleted[0] }));
      return;
    }
    const reason = failed[0]?.reason ?? t("branches.deleteFailed");
    // `reason` is the raw backend text, which stays Chinese by design: the
    // "unmerged" case is `git branch -d` refusing, and it is the only signal we
    // get to offer the force-delete follow-up.
    if (!force && reason.includes("未合并")) {
      setPendingForceDelete(branch);
      return;
    }
    if (reason.length > 120 || reason.includes("\n")) {
      showAlert(t("branches.deleteBranchFailedTitle", { name: branch.name }), reason);
    } else {
      notify("error", reason);
    }
  };

  const actions: BranchActions = {
    switchTo: requestSwitch,
    squash: setSquashTarget,
    rebase: setRebaseTarget,
    cherryPick: setCherryTarget,
    push: setPushTarget,
    pull: (branch) => setPullTarget(branch),
    create: (baseRef) => setCreateBase(baseRef),
    remove: setPendingDelete,
    merge: () => {
      if (currentBranch) setMergeOpen(true);
      else notify("error", t("branches.noCurrentBranch"));
    },
    compare: setCompareTarget,
    tags: () => setTagsOpen(true),
    reflog: () => setReflogOpen(true),
  };

  const dialogs = (
    <>
      <Suspense fallback={null}>
        {squashTarget ? (
          <SquashDialog branch={squashTarget} onClose={() => setSquashTarget(null)} />
        ) : null}
        {rebaseTarget ? (
          <RebaseDialog branch={rebaseTarget} onClose={() => setRebaseTarget(null)} />
        ) : null}
        {cherryTarget ? (
          <CherryPickDialog branch={cherryTarget} onClose={() => setCherryTarget(null)} />
        ) : null}
        {pushTarget ? <PushDialog branch={pushTarget} onClose={() => setPushTarget(null)} /> : null}
        {pullTarget ? (
          <PullDialog
            branch={pullTarget}
            switchFirst={!pullTarget.isHead}
            onClose={() => setPullTarget(null)}
          />
        ) : null}
        {createBase !== undefined ? (
          <CreateBranchDialog
            key={createBase ?? "default"}
            initialBaseRef={createBase ?? undefined}
            onClose={() => setCreateBase(undefined)}
          />
        ) : null}
        {mergeOpen && currentBranch ? (
          <MergeDialog current={currentBranch} onClose={() => setMergeOpen(false)} />
        ) : null}
        {compareTarget ? (
          <CompareDialog branch={compareTarget} onClose={() => setCompareTarget(null)} />
        ) : null}
        {tagsOpen ? <TagDialog onClose={() => setTagsOpen(false)} /> : null}
        {reflogOpen ? <ReflogDialog onClose={() => setReflogOpen(false)} /> : null}
      </Suspense>

      {pendingSwitch ? (
        <ConfirmDialog
          open
          title={t("branches.confirmSwitchTitle", { name: pendingSwitch.name })}
          description={t("branches.confirmSwitchBody", { count: changes?.entries.length ?? 0 })}
          confirmLabel={t("branches.confirmSwitch")}
          onConfirm={() => {
            const target = pendingSwitch;
            setPendingSwitch(null);
            void doSwitch(target);
          }}
          onCancel={() => setPendingSwitch(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open
          title={t("branches.confirmDeleteTitle", { name: pendingDelete.name })}
          description={t("branches.confirmDeleteBody")}
          confirmLabel={t("branches.confirmDelete")}
          tone="danger"
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            void quickDelete(target, false);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}

      {pendingForceDelete ? (
        <ConfirmDialog
          open
          title={t("branches.confirmForceDeleteTitle", { name: pendingForceDelete.name })}
          description={
            pendingForceDelete.ahead
              ? t("branches.confirmForceDeleteBodyAhead", { count: pendingForceDelete.ahead })
              : t("branches.confirmForceDeleteBody")
          }
          confirmLabel={t("branches.confirmForceDelete")}
          tone="danger"
          onConfirm={() => {
            const target = pendingForceDelete;
            setPendingForceDelete(null);
            void quickDelete(target, true);
          }}
          onCancel={() => setPendingForceDelete(null)}
        />
      ) : null}
    </>
  );

  return { busy, actions, dialogs };
}