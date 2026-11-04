import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import ConfirmDialog from "../common/ConfirmDialog";

/**
 * The single "run this workflow?" confirmation, shared by the workflows pane and
 * the command palette. Keeping it here (and not inside the pane) means a
 * workflow started from ⌘K is confirmed exactly like one started from the list,
 * and the dialog survives a pane switch.
 */
export default function RunWorkflowDialog() {
  const t = useT();
  const { pendingId, workflow } = useSlice((state) => ({
    pendingId: state.pendingWorkflowRun,
    workflow: state.pendingWorkflowRun
      ? (state.workflows.find((item) => item.id === state.pendingWorkflowRun) ?? null)
      : null,
  }));

  const setPending = useAppStore((state) => state.setPendingWorkflowRun);
  const runWorkflow = useAppStore((state) => state.runWorkflow);

  return (
    <ConfirmDialog
      open={Boolean(pendingId && workflow)}
      title={t("workflow.confirmTitle", { name: workflow?.name ?? "" })}
      description={t("workflow.confirmDescription", { count: workflow?.steps.length ?? 0 })}
      confirmLabel={t("workflow.confirmRun")}
      onConfirm={() => {
        const id = workflow?.id;
        setPending(null);
        if (id) void runWorkflow(id);
      }}
      onCancel={() => setPending(null)}
    >
      <ol className="mt-3 space-y-1">
        {(workflow?.steps ?? []).map((step, index) => (
          <li
            key={`${step.kind}-${index}`}
            className="flex items-center gap-1.5 text-[11px] text-ink-soft"
          >
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-canvas text-[9px] text-ink-faint">
              {index + 1}
            </span>
            <span>{t(`workflow.step.${step.kind}`)}</span>
            {step.source ? (
              <span className="truncate font-mono text-[10px] text-ink-faint">{step.source}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </ConfirmDialog>
  );
}