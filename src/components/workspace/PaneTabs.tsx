import { Archive, FileDiff, GitBranch, Tag, Workflow } from "lucide-react";

import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import type { PaneMode } from "../../store/appStore";
import { formatBinding } from "../../lib/keymap";
import { tip } from "../common/Tooltip";

interface PaneTabsProps {
  active: PaneMode;
  changesCount: number;
}

/**
 * The views of the middle column. They share one tab bar so the panel header
 * never grows a second navigation row.
 *
 * Only branches and changes carry a text label: they are what the column is
 * for. Tags, stash and workflows are secondary views, so they live in the
 * icon-only group on the right — a low-frequency entry point that still keeps
 * its tooltip and ⌘⇧ shortcut.
 *
 * The worktree is the one icon tab with a counter here: the number of tags is a
 * property of the tag pane, so it is shown inside that pane instead.
 */
export default function PaneTabs({ active, changesCount }: PaneTabsProps) {
  const t = useT();
  const backToBranches = useAppStore((state) => state.backToBranches);
  const openTags = useAppStore((state) => state.openTags);
  const openChanges = useAppStore((state) => state.openChanges);
  const openStash = useAppStore((state) => state.openStash);
  const openWorkflows = useAppStore((state) => state.openWorkflows);
  const stashCount = useAppStore((state) => state.stashEntries.length);
  const keymap = useAppStore((state) => state.keymap);

  const base = "flex items-center gap-1.5 rounded-md px-1.5 py-[3px] text-[11.5px] font-medium transition-colors";
  const on = "bg-panel text-ink shadow-sm";
  const off = "text-ink-faint hover:text-ink-soft";

  /** Icon-only tabs: the row would overflow at the panel's minimum width. */
  const iconTab = (activeTab: boolean) =>
    `flex h-[22px] w-[22px] items-center justify-center rounded-md transition-colors ${
      activeTab ? "bg-panel text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"
    }`;

  return (
    <div className="no-drag flex shrink-0 items-center gap-px rounded-lg bg-canvas/80 p-0.5">
      <button
        type="button"
        onClick={backToBranches}
        aria-pressed={active === "branches" || active === "commits"}
        className={`${base} ${active === "branches" || active === "commits" ? on : off}`}
      >
        <GitBranch size={11.5} />
        {t("workspace.tabBranches")}
      </button>
      <button
        type="button"
        onClick={() => void openChanges()}
        aria-pressed={active === "changes"}
        {...tip(t("command.paneChanges"), formatBinding(keymap.paneChanges))}
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
      <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-line" />
      <button
        type="button"
        onClick={() => openTags()}
        aria-pressed={active === "tags"}
        aria-label={t("command.paneTags")}
        {...tip(t("command.paneTags"), formatBinding(keymap.paneTags))}
        className={iconTab(active === "tags")}
      >
        <Tag size={12} />
      </button>
      <button
        type="button"
        onClick={openStash}
        aria-pressed={active === "stash"}
        aria-label={t("command.paneStash")}
        {...tip(t("command.paneStash"), formatBinding(keymap.paneStash))}
        className={iconTab(active === "stash")}
      >
        <Archive size={12} />
        {stashCount > 0 ? (
          <span className="ml-0.5 text-[9.5px] font-semibold text-accent">{stashCount}</span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={openWorkflows}
        aria-pressed={active === "workflows"}
        aria-label={t("command.paneWorkflows")}
        {...tip(t("command.paneWorkflows"), formatBinding(keymap.paneWorkflows))}
        className={iconTab(active === "workflows")}
      >
        <Workflow size={12} />
      </button>
    </div>
  );
}