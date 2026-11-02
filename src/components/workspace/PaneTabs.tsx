import { FileDiff, GitBranch } from "lucide-react";

import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import type { PaneMode } from "../../store/appStore";
import { tip } from "../common/Tooltip";

interface PaneTabsProps {
  active: Extract<PaneMode, "branches" | "changes">;
  changesCount: number;
}

export default function PaneTabs({ active, changesCount }: PaneTabsProps) {
  const t = useT();
  const backToBranches = useAppStore((state) => state.backToBranches);
  const openChanges = useAppStore((state) => state.openChanges);

  return (
    <div className="no-drag flex items-center gap-0.5 rounded-lg bg-canvas/80 p-0.5">
      <button
        type="button"
        onClick={backToBranches}
        aria-pressed={active === "branches"}
        className={`flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[11.5px] font-medium transition-colors ${
          active === "branches" ? "bg-panel text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"
        }`}
      >
        <GitBranch size={11.5} />
        {t("workspace.tabBranches")}
      </button>
      <button
        type="button"
        onClick={() => void openChanges()}
        aria-pressed={active === "changes"}
        {...tip(t("workspace.changesTip"))}
        className={`flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[11.5px] font-medium transition-colors ${
          active === "changes" ? "bg-panel text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"
        }`}
      >
        <FileDiff size={11.5} />
        {t("workspace.tabChanges")}
        {changesCount > 0 ? (
          <span className="rounded-full bg-accent/14 px-1.5 text-[9.5px] font-semibold text-accent">
            {changesCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}