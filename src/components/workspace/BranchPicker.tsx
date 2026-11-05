import { useEffect, useMemo, useRef, useState } from "react";
import { Check, GitBranch, Loader2, Search } from "lucide-react";

import { useT } from "../../i18n";
import { relativeTime } from "../../lib/format";
import type { BranchSummary } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import AnchoredPanel from "../common/AnchoredPanel";

interface BranchPickerProps {
  open: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
}

/**
 * Branch switcher hanging off the status bar — the VS Code quick pick, in place:
 * type to filter, ↑/↓ to move, Enter to check out. Local branches only; remote
 * branches live in the branch panel, where creating a tracking branch is an
 * explicit action.
 */
export default function BranchPicker({ open, anchor, onClose }: BranchPickerProps) {
  const t = useT();
  const { branches, loading, headBranch, project } = useSlice((state) => ({
    branches: state.branches,
    loading: state.branchesLoading,
    headBranch: state.snapshot?.headBranch ?? null,
    project: state.activeProject,
  }));
  const switchBranch = useAppStore((state) => state.switchBranch);
  const refreshBranches = useAppStore((state) => state.refreshBranches);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [switching, setSwitching] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // A fresh panel each time: no stale filter, and the list is re-read so
  // branches created in another window show up.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    if (project?.status === "ok") void refreshBranches();
  }, [open, project?.status, refreshBranches]);

  const localBranches = useMemo(() => {
    const locals = branches.filter((branch) => !branch.isRemote);
    // Current branch first, the rest by name: the list is a switcher, not a log.
    return locals.slice().sort((a, b) => {
      if (a.isHead !== b.isHead) return a.isHead ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [branches]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return localBranches;
    return localBranches.filter(
      (branch) =>
        branch.name.toLowerCase().includes(needle) ||
        branch.shortName.toLowerCase().includes(needle),
    );
  }, [localBranches, query]);

  // Keep the highlight inside the list while the filter narrows it.
  useEffect(() => {
    setActive((index) => Math.min(index, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    row?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = async (branch: BranchSummary) => {
    if (switching) return;
    if (branch.isHead) {
      onClose();
      return;
    }
    setSwitching(branch.name);
    const ok = await switchBranch(branch.name);
    setSwitching(null);
    if (ok) onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.max(0, Math.min(index + 1, filtered.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(filtered.length - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const branch = filtered[active];
      if (branch) void choose(branch);
    }
  };

  const detached = headBranch?.startsWith("detached@") ?? false;

  return (
    <AnchoredPanel open={open} anchor={anchor} onClose={onClose} placement="above" width={300}>
      <div className="border-b border-line/70 p-1.5" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-1.5 rounded-lg bg-canvas/70 px-2 py-1">
          <Search size={11} className="shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder={t("workspace.branchPickerPlaceholder")}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-ink outline-none placeholder:font-sans placeholder:text-ink-faint"
          />
          {loading ? <Loader2 size={11} className="shrink-0 animate-spin text-ink-faint" /> : null}
        </div>
      </div>

      {detached ? (
        <p className="flex items-center gap-1.5 border-b border-line/60 bg-warning/8 px-2.5 py-1.5 text-[10.5px] text-warning">
          <GitBranch size={11} className="shrink-0" />
          {t("workspace.branchPickerDetached")}
        </p>
      ) : null}

      <div ref={listRef} role="listbox" className="max-h-[280px] overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-[11px] text-ink-faint">
            {t("workspace.branchPickerEmpty")}
          </p>
        ) : (
          filtered.map((branch, index) => {
            const busy = switching === branch.name;
            const selected = index === active;
            return (
              <button
                key={branch.refName}
                type="button"
                role="option"
                aria-selected={selected}
                data-active={selected}
                onMouseEnter={() => setActive(index)}
                onClick={() => void choose(branch)}
                disabled={switching !== null}
                className={`flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors ${
                  selected ? "bg-accent-soft" : "hover:bg-ink/5"
                } disabled:opacity-60`}
              >
                <span className="grid h-3.5 w-3.5 shrink-0 place-items-center">
                  {busy ? (
                    <Loader2 size={11} className="animate-spin text-accent" />
                  ) : branch.isHead ? (
                    <Check size={11} className="text-accent" />
                  ) : null}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate font-mono text-[11.5px] ${
                    branch.isHead ? "font-medium text-ink" : "text-ink-soft"
                  }`}
                >
                  {branch.name}
                </span>
                {branch.ahead ? (
                  <span className="shrink-0 font-mono text-[9.5px] text-ink-faint">
                    ↑{branch.ahead}
                  </span>
                ) : null}
                {branch.behind ? (
                  <span className="shrink-0 font-mono text-[9.5px] text-ink-faint">
                    ↓{branch.behind}
                  </span>
                ) : null}
                {branch.lastCommit ? (
                  <span className="shrink-0 text-[9.5px] text-ink-faint">
                    {relativeTime(branch.lastCommit.committedAt)}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </AnchoredPanel>
  );
}