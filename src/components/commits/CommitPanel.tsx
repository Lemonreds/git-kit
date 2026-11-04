import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  Search,
  Tag,
  X,
} from "lucide-react";
import type { ListImperativeAPI } from "react-window";

import { useT } from "../../i18n";
import { formatBinding } from "../../lib/keymap";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import BranchRowActions from "../branches/BranchRowActions";
import { useBranchActions } from "../branches/useBranchActions";
import EmptyState from "../common/EmptyState";
import IconButton from "../common/IconButton";
import { SkeletonRows } from "../common/Skeleton";
import CommitRow from "./CommitRow";
import VirtualCommitList from "./VirtualCommitList";

/** Above this many rows the history is virtualised. */
const VIRTUALIZE_AFTER = 40;

/** Fields the commit search looks at. `needle` is already lower-cased. */
function matchesQuery(commit: { sha: string; summary: string; authorName: string }, needle: string) {
  return (
    commit.summary.toLowerCase().includes(needle) ||
    commit.authorName.toLowerCase().includes(needle) ||
    commit.sha.toLowerCase().includes(needle)
  );
}

export default function CommitPanel() {
  const t = useT();
  const {
    project,
    branch,
    tag,
    commits,
    loading,
    hasMore,
    selectedSha,
    searchOpen,
  } = useSlice((state) => ({
    project: state.activeProject,
    branch: state.selectedBranch,
    tag: state.selectedTag,
    commits: state.commits,
    loading: state.commitsLoading,
    hasMore: state.commitsHasMore,
    selectedSha: state.selectedCommitSha,
    searchOpen: state.commitSearchOpen,
  }));

  const selectCommit = useAppStore((state) => state.selectCommit);
  const loadMore = useAppStore((state) => state.loadMoreCommits);
  const backToBranches = useAppStore((state) => state.backToBranches);
  const setSearchOpen = useAppStore((state) => state.setCommitSearchOpen);
  const keymap = useAppStore((state) => state.keymap);
  // Same entry points as the branch row this list was opened from.
  const { busy, actions, dialogs } = useBranchActions();
  const virtualized = commits.length >= VIRTUALIZE_AFTER;

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<ListImperativeAPI | null>(null);
  const plainListRef = useRef<HTMLDivElement | null>(null);

  const listKey = branch?.refName ?? (tag ? `refs/tags/${tag.name}` : "");
  const needle = query.trim().toLowerCase();

  // Row indexes (not filtered commits): the list stays intact, the search only
  // highlights and scrolls.
  const matches = useMemo(() => {
    if (!needle) return [];
    const result: number[] = [];
    commits.forEach((commit, index) => {
      if (matchesQuery(commit, needle)) result.push(index);
    });
    return result;
  }, [commits, needle]);

  const safeCursor = matches.length > 0 ? Math.min(cursor, matches.length - 1) : 0;
  const matchIndex = matches.length > 0 ? matches[safeCursor] : -1;
  const matchSha = matchIndex >= 0 ? (commits[matchIndex]?.sha ?? null) : null;

  const step = useCallback(
    (delta: number) => {
      if (matches.length === 0) return;
      setCursor((current) => {
        const base = current >= matches.length ? 0 : current;
        return (base + delta + matches.length) % matches.length;
      });
    },
    [matches.length],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
    setCursor(0);
  }, [setSearchOpen]);

  // Leaving the branch / tag drops the query; the next list is a new search.
  useEffect(() => {
    setQuery("");
    setCursor(0);
  }, [listKey]);

  // Opening the bar moves the caret into it, so the user can just type.
  useEffect(() => {
    if (!searchOpen) return undefined;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [searchOpen]);

  // A new query restarts the cursor at the first match.
  // Capture phase: Esc must close the search instead of stepping out of the
  // commit pane (the global dispatcher listens on the bubble phase).
  useEffect(() => {
    if (!searchOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('[data-modal="true"]')) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSearch();
        return;
      }
      if (event.key === "F3") {
        event.preventDefault();
        event.stopPropagation();
        step(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [searchOpen, closeSearch, step]);

  // Bring the current match into view — smooth for short hops, and react-window
  // corrects the animation as it measures the dynamic row heights.
  useEffect(() => {
    if (!searchOpen || matchIndex < 0) return;
    if (virtualized) {
      listRef.current?.scrollToRow({ index: matchIndex, align: "center", behavior: "smooth" });
      return;
    }
    plainListRef.current
      ?.querySelector<HTMLElement>(`[data-commit-index="${matchIndex}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [searchOpen, matchIndex, virtualized]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <header
        data-tauri-drag-region
        className="drag-region flex h-11 shrink-0 items-center gap-1.5 border-b border-line px-2"
      >
        <IconButton label={t("commits.backToBranches")} onClick={backToBranches}>
          <ChevronLeft size={16} />
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px]">
          <span className="truncate text-ink-faint">{project?.name}</span>
          <span className="shrink-0 text-line-strong">/</span>
          <span className="flex min-w-0 items-center gap-1 font-mono text-[11.5px] font-medium text-ink">
            {tag ? (
              <Tag size={11} className="shrink-0 text-ink-faint" />
            ) : (
              <GitBranch size={11} className="shrink-0 text-ink-faint" />
            )}
            <span className="truncate">{tag?.name ?? branch?.name ?? t("commits.history")}</span>
            {tag ? (
              <span className="shrink-0 rounded border border-line px-1 py-px font-sans text-[9px] font-medium text-ink-faint">
                {t("tags.badge")}
              </span>
            ) : null}
          </span>
        </div>
        {commits.length > 0 ? (
          <div className="no-drag shrink-0">
            <IconButton
              label={t("commits.searchOpen")}
              shortcut={formatBinding(keymap.commitSearch)}
              active={searchOpen}
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            >
              <Search size={14} />
            </IconButton>
          </div>
        ) : null}
        {branch ? (
          <div className="no-drag flex shrink-0 items-center gap-0.5 border-l border-line pl-1">
            <BranchRowActions
              variant="header"
              busy={busy?.refName === branch.refName ? busy.label : null}
              isRemote={branch.isRemote}
              isCurrent={branch.isHead}
              onSwitch={() => actions.switchTo(branch)}
              onSquash={() => actions.squash(branch)}
              onRebase={() => actions.rebase(branch)}
              onCherryPick={() => actions.cherryPick(branch)}
              onPush={() => actions.push(branch)}
              onPull={() => actions.pull(branch)}
              onNewBranch={() => actions.create(branch.refName)}
              onDelete={() => actions.remove(branch)}
              onMerge={() => actions.merge()}
              onCompare={() => actions.compare(branch)}
              onTags={() => actions.tags()}
              onReflog={() => actions.reflog()}
            />
          </div>
        ) : null}
      </header>

      {searchOpen ? (
        <div className="shrink-0 px-3 pb-1.5 pt-2">
          <label className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas/50 px-2 py-1.5 transition-colors focus-within:border-accent/60 focus-within:bg-panel">
            <Search size={12} className="shrink-0 text-ink-faint" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                // Reset the cursor in the same update, so the scroll effect never
                // runs once for the stale match and once for the first one.
                setQuery(event.target.value);
                setCursor(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  step(event.shiftKey ? -1 : 1);
                }
              }}
              placeholder={t("commits.searchPlaceholder")}
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-[11.5px] text-ink outline-none placeholder:text-ink-faint"
            />
            {needle ? (
              <span className="shrink-0 font-mono text-[10.5px] text-ink-faint">
                {matches.length > 0
                  ? t("commits.searchCount", { index: safeCursor + 1, total: matches.length })
                  : t("commits.searchNoMatch")}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={matches.length === 0}
              aria-label={t("commits.searchPrev")}
              className="grid h-4 w-4 shrink-0 place-items-center rounded text-ink-faint transition-colors hover:bg-ink/8 hover:text-ink disabled:opacity-35"
            >
              <ChevronUp size={12} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={matches.length === 0}
              aria-label={t("commits.searchNext")}
              className="grid h-4 w-4 shrink-0 place-items-center rounded text-ink-faint transition-colors hover:bg-ink/8 hover:text-ink disabled:opacity-35"
            >
              <ChevronDown size={12} />
            </button>
            <button
              type="button"
              onClick={closeSearch}
              aria-label={t("commits.searchClose")}
              className="grid h-4 w-4 shrink-0 place-items-center rounded text-ink-faint transition-colors hover:bg-ink/8 hover:text-ink"
            >
              <X size={10} />
            </button>
          </label>
          {needle && matches.length === 0 && hasMore ? (
            <p className="mt-1 text-[10.5px] text-ink-faint">
              {t("commits.searchMoreHint", { count: commits.length })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading && commits.length === 0 ? (
          <div className="px-2 py-2">
            <SkeletonRows rows={8} />
          </div>
        ) : commits.length === 0 ? (
          <EmptyState
            icon={GitCommitHorizontal}
            title={t("commits.emptyTitle")}
            description={t("commits.emptyDescription")}
          />
        ) : virtualized ? (
          <VirtualCommitList
            commits={commits}
            selectedSha={selectedSha}
            loading={loading}
            hasMore={hasMore}
            selectCommit={(sha) => void selectCommit(sha)}
            loadMore={() => void loadMore()}
            listKey={listKey}
            listRef={listRef}
            query={needle}
            matchSha={matchSha}
          />
        ) : (
          <div ref={plainListRef} className="h-full space-y-px overflow-y-auto px-2 py-2">
            {commits.map((commit, index) => (
              <CommitRow
                key={commit.sha}
                commit={commit}
                active={commit.sha === selectedSha}
                matched={matchSha !== null && commit.sha === matchSha}
                query={needle}
                index={index}
                onSelect={() => void selectCommit(commit.sha)}
              />
            ))}

            {hasMore ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-[11.5px] font-medium text-ink-soft transition-colors hover:bg-ink/4 hover:text-ink disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      {t("commits.loading")}
                    </>
                  ) : (
                    t("commits.loadMore")
                  )}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {dialogs}
    </section>
  );
}