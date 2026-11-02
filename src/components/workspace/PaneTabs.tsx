import { FileDiff, GitBranch, Tag } from "lucide-react";

import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import type { PaneMode } from "../../store/appStore";
import { tip } from "../common/Tooltip";

interface PaneTabsProps {
  active: Extract<PaneMode, "branches" | "tags" | "changes">;
  changesCount: number;
}

/**
 * The three views of the middle column. They share one tab bar so the panel
 * header never grows a second navigation row: branches, tags and the worktree
 * are all "what am I looking at in this repository".
 *
 * Only the worktree carries a counter here: the number of tags is a property of
 * the tag pane, so it is shown inside that pane instead of on the tab.
 */
export default function PaneTabs({ active, changesCount }: PaneTabsProps) {
  const t = useT();
  const backToBranches = useAppStore((state) => state.backToBranches);
  const openTags = useAppStore((state) => state.openTags);
  const openChanges = useAppStore((state) => state.openChanges);

  const base = "flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[11.5px] font-medium transition-colors";
  const on = "bg-panel text-ink shadow-sm";
  const off = "text-ink-faint hover:text-ink-soft";

  return (
    <div className="no-drag flex shrink-0 items-center gap-0.5 rounded-lg bg-canvas/80 p-0.5">
      <button
        type="button"
        onClick={backToBranches}
        aria-pressed={active === "branches"}
        className={`${base} ${active === "branches" ? on : off}`}
      >
        <GitBranch size={11.5} />
        {t("workspace.tabBranches")}
      </button>
      <button
        type="button"
        onClick={() => openTags()}
        aria-pressed={active === "tags"}
        {...tip(t("workspace.tagsTip"))}
        className={`${base} ${active === "tags" ? on : off}`}
      >
        <Tag size={11.5} />
        {t("workspace.tabTags")}
      </button>
      <button
        type="button"
        onClick={() => void openChanges()}
        aria-pressed={active === "changes"}
        {...tip(t("workspace.changesTip"))}
        className={`${base} ${active === "changes" ? on : off}`}
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