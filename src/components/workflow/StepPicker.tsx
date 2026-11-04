import { useEffect } from "react";
import {
  Archive,
  ArchiveRestore,
  CloudDownload,
  Download,
  GitCommitHorizontal,
  GitCommitVertical,
  GitMerge,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useT } from "../../i18n";
import type { WorkflowStepKind } from "../../lib/workflows";
import { tip } from "../common/Tooltip";

interface StepPickerProps {
  onPick: (kind: WorkflowStepKind) => void;
  onClose: () => void;
}

/**
 * The eight kinds in composer order: three remote steps, three local history
 * steps, then stash-restore and commit. At three columns per row the groups line
 * up with the rows, so the panel reads top-down without extra headings.
 */
const STEPS: Array<{ kind: WorkflowStepKind; icon: LucideIcon }> = [
  { kind: "fetch", icon: CloudDownload },
  { kind: "pull", icon: Download },
  { kind: "push", icon: Upload },
  { kind: "rebase", icon: GitCommitVertical },
  { kind: "merge", icon: GitMerge },
  { kind: "stash", icon: Archive },
  { kind: "stashPop", icon: ArchiveRestore },
  { kind: "commit", icon: GitCommitHorizontal },
];

/**
 * Step picker, rendered inline inside the workflow editor: adding a step is part
 * of composing the sequence, so it must not open a second dialog on top.
 *
 * Names carry the meaning; the longer explanation lives in the tooltip so the
 * panel stays two rows tall instead of pushing the step list off screen.
 */
export default function StepPicker({ onPick, onClose }: StepPickerProps) {
  const t = useT();

  // Escape collapses the picker only: the dialog's own Escape/close affordances
  // keep closing the whole editor, which is what they promise.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <section className="rounded-xl border border-line bg-canvas/40 p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[11.5px] font-medium text-ink">
          {t("workflow.pickStep")}
          <span className="ml-1.5 font-normal text-ink-faint">{t("workflow.pickStepSubtitle")}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-ink/8 hover:text-ink"
        >
          <X size={11} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <button
              key={step.kind}
              type="button"
              onClick={() => onPick(step.kind)}
              {...tip(t(`workflow.stepHint.${step.kind}`))}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1.5 text-left transition-colors hover:border-accent/45 hover:bg-accent-soft/50 hover:text-accent"
            >
              <Icon size={12} className="shrink-0 text-ink-faint" />
              <span className="min-w-0 truncate text-[11.5px] font-medium text-ink">
                {t(`workflow.step.${step.kind}`)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}