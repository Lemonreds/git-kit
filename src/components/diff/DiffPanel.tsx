import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Check,
  ClipboardCopy,
  Columns2,
  Copy,
  FileDiff as FileDiffIcon,
  GitCommitHorizontal,
  History,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Tag,
  Trash2,
  UserRound,
  Undo2,
} from "lucide-react";

import { useT } from "../../i18n";
import { api } from "../../lib/ipc";
import type { CommitDetail } from "../../lib/types";

import { absoluteTime, clamp, copyText, formatCount, relativeTime, timeTooltip } from "../../lib/format";
import { formatBinding, matchesBinding } from "../../lib/keymap";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import ConfirmDialog from "../common/ConfirmDialog";
import EmptyState from "../common/EmptyState";
import FileIcon from "../common/FileIcon";
import IconButton from "../common/IconButton";
import RowMenu from "../common/RowMenu";
import ShaChip from "../common/ShaChip";
import { SkeletonRows } from "../common/Skeleton";
import Splitter from "../common/Splitter";
import { tip } from "../common/Tooltip";
import ConflictPanel from "../conflict/ConflictPanel";
import FileHistoryPanel from "../history/FileHistoryPanel";
import DiffSearch from "./DiffSearch";
import DiffViewer from "./DiffViewer";
import FileChangeList from "./FileChangeList";

/** Share of the diff column taken by the file list; persists across restarts. */
const FILES_KEY = "gk.diffFiles";
const FILES_DEFAULT_RATIO = 0.38;
const FILES_MIN_RATIO = 0.12;
const FILES_MAX_RATIO = 0.72;
/** Never smaller than this, and never taller than the ratio allows. */
const FILES_MIN_PX = 76;

function readFilesRatio(): number {
  try {
    const raw = Number(localStorage.getItem(FILES_KEY));
    return Number.isFinite(raw) && raw > 0 ? clamp(raw, FILES_MIN_RATIO, FILES_MAX_RATIO) : FILES_DEFAULT_RATIO;
  } catch {
    return FILES_DEFAULT_RATIO;
  }
}

export default function DiffPanel() {
  const t = useT();
  const {
    activeProject,
    commits,
    worktreeTarget,
    selectedCommitSha,
    stashPreview,
    files,
    filesLoading,
    selectedFilePath,
    diff,
    diffLoading,
    diffMode,
  } = useSlice((state) => ({
    activeProject: state.activeProject,
    commits: state.commits,
    worktreeTarget: state.worktreeTarget,
    selectedCommitSha: state.selectedCommitSha,
    stashPreview: state.stashPreview,
    files: state.commitFiles,
    filesLoading: state.filesLoading,
    selectedFilePath: state.selectedFilePath,
    diff: state.diff,
    diffLoading: state.diffLoading,
    diffMode: state.diffMode,
  }));

  const setDiffMode = useAppStore((state) => state.setDiffMode);
  const inlineBlame = useAppStore((state) => state.inlineBlame);
  const setInlineBlame = useAppStore((state) => state.setInlineBlame);
  const selectFile = useAppStore((state) => state.selectFile);
  const refreshCommitFiles = useAppStore((state) => state.refreshCommitFiles);
  const refreshWorktreeDiff = useAppStore((state) => state.refreshWorktreeDiff);
  const stageFile = useAppStore((state) => state.stageFile);
  const unstageFile = useAppStore((state) => state.unstageFile);
  const discardFile = useAppStore((state) => state.discardFile);
  const notify = useAppStore((state) => state.notify);
  const showAlert = useAppStore((state) => state.showAlert);
  const revertCommit = useAppStore((state) => state.revertCommit);
  // Conflict resolver + file history own the whole column while they are open.
  const openConflict = useAppStore((state) => state.openConflict);
  const openFileHistory = useAppStore((state) => state.openFileHistory);
  const conflictPath = useAppStore((state) => state.conflictPath);
  const fileViewOpen = useAppStore((state) => state.fileView !== null);
  const shownFileConflicted = useAppStore((state) => {
    const target = state.worktreeTarget;
    if (!target) return false;
    return (
      state.changes?.entries.some((entry) => entry.path === target.path && entry.conflicted) ?? false
    );
  });
  // Tagging this commit jumps to the tags pane with the create form pre-filled.
  const openTags = useAppStore((state) => state.openTags);

  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const commit = commits.find((item) => item.sha === selectedCommitSha) ?? null;
  // A stash has no row in the commit list: the header shows the stash ref
  // instead, and commit-only actions (tag / revert / details) stay hidden.
  const previewLabel = stashPreview?.selector ?? null;
  const stats = files.reduce(
    (acc, file) => ({ additions: acc.additions + file.additions, deletions: acc.deletions + file.deletions }),
    { additions: 0, deletions: 0 },
  );

  const copySha = async () => {
    if (!selectedCommitSha) return;
    const ok = await copyText(selectedCommitSha);
    notify(ok ? "success" : "error", ok ? t("diff.copyShaSuccess") : t("diff.copyFailure"));
  };

  const copyPatch = async () => {
    if (!diff?.patch) return;
    const ok = await copyText(diff.patch);
    notify(ok ? "success" : "error", ok ? t("diff.copyPatchSuccess") : t("diff.copyFailure"));
  };

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCount, setSearchCount] = useState(0);
  const [searchActive, setSearchActive] = useState(0);
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  // `git revert` has no `--no-verify`: the backend skips hooks another way.
  const [revertSkipHooks, setRevertSkipHooks] = useState(false);

  useEffect(() => {
    // A stash ref is not a commit: `get_commit` would just 404 on it.
    if (!selectedCommitSha || !activeProject || stashPreview) {
      setDetail(null);
      return;
    }
    let alive = true;
    api
      .getCommit(activeProject.path, selectedCommitSha)
      .then((value) => {
        if (alive) setDetail(value);
      })
      .catch(() => {
        if (alive) setDetail(null);
      });
    return () => {
      alive = false;
    };
  }, [selectedCommitSha, activeProject, stashPreview]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // --- file list / diff splitter -------------------------------------------
  // The share is stored as a ratio, not pixels, so the split survives window
  // resizes: a height that fit yesterday must not leave the diff invisible
  // today. The container is measured because the minimum height needs pixels.
  const [filesRatio, setFilesRatio] = useState(readFilesRatio);
  const [bodyHeight, setBodyHeight] = useState(0);
  const splitBodyRef = useRef<HTMLDivElement | null>(null);
  const splitFilesRef = useRef<HTMLDivElement | null>(null);
  const ratioRef = useRef(filesRatio);

  useEffect(() => {
    const element = splitBodyRef.current;
    if (!element) {
      setBodyHeight(0);
      return undefined;
    }
    setBodyHeight(element.getBoundingClientRect().height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setBodyHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
    // The splitter only exists in the commit / stash view.
  }, [selectedCommitSha, stashPreview, conflictPath, fileViewOpen, worktreeTarget]);

  const filesHeight =
    bodyHeight > 0
      ? Math.round(
          clamp(
            bodyHeight * filesRatio,
            FILES_MIN_PX,
            Math.max(FILES_MIN_PX, bodyHeight * FILES_MAX_RATIO),
          ),
        )
      : null;

  const beginFilesDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const total = splitBodyRef.current?.getBoundingClientRect().height ?? 0;
    if (total <= 0) return;
    const startY = event.clientY;
    const startHeight = splitFilesRef.current?.getBoundingClientRect().height ?? 0;
    const limit = Math.max(FILES_MIN_PX, total * FILES_MAX_RATIO);

    const onMove = (move: PointerEvent) => {
      const next = clamp(startHeight + (move.clientY - startY), FILES_MIN_PX, limit);
      ratioRef.current = next / total;
      setFilesRatio(ratioRef.current);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("select-none", "cursor-row-resize");
      try {
        localStorage.setItem(FILES_KEY, String(ratioRef.current));
      } catch {
        // Private mode / quota: the split just will not survive a restart.
      }
    };

    document.body.classList.add("select-none", "cursor-row-resize");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const resetFilesHeight = useCallback(() => {
    ratioRef.current = FILES_DEFAULT_RATIO;
    setFilesRatio(FILES_DEFAULT_RATIO);
    try {
      localStorage.removeItem(FILES_KEY);
    } catch {
      // Nothing to clean up.
    }
  }, []);

  // The in-diff finder is a local command: the binding is user-editable, but
  // the search state lives here, so this component does the matching.
  const keymap = useAppStore((state) => state.keymap);
  const findBinding = keymap.findInDiff;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesBinding(event, findBinding)) return;
      // A dialog (or the palette) owns the keyboard while it is open.
      if (document.querySelector('[data-modal="true"]')) return;
      event.preventDefault();
      setSearchOpen(true);
      // Re-focus (and re-select) the input when the key is pressed again.
      setSearchFocusKey((key) => key + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [findBinding]);

  // New term -> start from the first match again.
  useEffect(() => {
    setSearchActive(0);
  }, [searchQuery]);

  // Highlight count + scrolling live in the DOM, which keeps the two diff
  // renderers (unified / split) free of match bookkeeping.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const hits = Array.from(container.querySelectorAll<HTMLElement>("mark[data-diff-hit]"));
    setSearchCount(hits.length);
    if (hits.length === 0) {
      setSearchActive(0);
      return;
    }
    const index = Math.min(searchActive, hits.length - 1);
    if (index !== searchActive) {
      setSearchActive(index);
      return;
    }
    hits.forEach((hit, position) => {
      if (position === index) hit.dataset.active = "true";
      else delete hit.dataset.active;
    });
    hits[index]?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [searchQuery, searchActive, diff, diffMode, searchOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchCount(0);
    setSearchActive(0);
  };

  const stepMatch = (delta: number) => {
    if (searchCount === 0) return;
    setSearchActive((current) => (current + delta + searchCount) % searchCount);
  };

  const searchBar = searchOpen ? (
    <DiffSearch
      key={searchFocusKey}
      value={searchQuery}
      onChange={setSearchQuery}
      count={searchCount}
      active={searchActive}
      onPrev={() => stepMatch(-1)}
      onNext={() => stepMatch(1)}
      onClose={closeSearch}
    />
  ) : null;

  if (conflictPath) return <ConflictPanel />;
  if (fileViewOpen) return <FileHistoryPanel />;

  if (worktreeTarget) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
        <header
          data-tauri-drag-region
          className="drag-region flex h-14 shrink-0 items-center gap-2 border-b border-line px-3"
        >
          {/* Two-line identity: the path gets its own line, the badges and stats
              drop below it so they never squeeze the actions. */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <FileIcon path={worktreeTarget.path} size={13} />
              <span
                className="min-w-0 truncate font-mono text-[11.5px] text-ink"
                {...tip(worktreeTarget.path)}
              >
                {worktreeTarget.path}
              </span>
              <span
                className={`shrink-0 rounded px-1 py-px text-[9px] font-semibold ${
                  worktreeTarget.staged
                    ? "bg-positive/12 text-positive"
                    : "bg-warning/14 text-warning"
                }`}
              >
                {worktreeTarget.staged ? t("diff.staged") : t("diff.unstaged")}
              </span>
            </div>

            <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-ink-faint">
              {diff ? (
                <span className="shrink-0 font-mono">
                  <span className="text-positive">+{diff.additions}</span>
                  <span className="ml-1 text-negative">−{diff.deletions}</span>
                </span>
              ) : (
                <span className="shrink-0">{t("diff.loadingDiff")}</span>
              )}
              <span className="shrink-0 text-ink-faint/50">·</span>
              <button
                type="button"
                onClick={() => void openFileHistory(worktreeTarget.path, null)}
                {...tip(t("fileHistory.openHint"), formatBinding(keymap.fileHistory))}
                className="no-drag inline-flex shrink-0 items-center gap-1 rounded px-1 py-px text-[10px] text-ink-faint transition-colors hover:bg-ink/6 hover:text-accent"
              >
                <History size={10} />
                {t("fileHistory.tabHistory")}
              </button>
            </div>
          </div>

          <div className="no-drag ml-1 flex shrink-0 items-center gap-1">
            {shownFileConflicted ? (
              <button
                type="button"
                onClick={() => void openConflict(worktreeTarget.path)}
                className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[10.5px] font-medium text-warning transition-colors hover:bg-warning/15"
              >
                <AlertTriangle size={11} />
                {t("conflict.title")}
              </button>
            ) : null}
            {worktreeTarget.staged ? (
              <IconButton
                label={t("diff.unstageThisFile")}
                onClick={() => void unstageFile(worktreeTarget.path)}
              >
                <Undo2 size={13} />
              </IconButton>
            ) : (
              <IconButton
                label={t("diff.stageThisFile")}
                onClick={() => void stageFile(worktreeTarget.path)}
              >
                <Plus size={13} />
              </IconButton>
            )}
            <RowMenu
              label={t("common.more")}
              items={[
                {
                  label: t("diff.refreshThisFile"),
                  icon: <RefreshCw size={12} />,
                  onSelect: () => void refreshWorktreeDiff(),
                },
                ...(diff?.patch
                  ? [
                      {
                        label: t("diff.copyThisFilePatch"),
                        icon: <ClipboardCopy size={12} />,
                        onSelect: () => void copyPatch(),
                      },
                    ]
                  : []),
                {
                  label: searchOpen ? t("diff.closeSearch") : t("diff.findInDiff"),
                  icon: <Search size={12} />,
                  onSelect: () => (searchOpen ? closeSearch() : setSearchOpen(true)),
                },
                {
                  label:
                    diffMode === "unified"
                      ? t("diff.switchToSplit")
                      : t("diff.switchToUnified"),
                  icon: diffMode === "unified" ? <Columns2 size={12} /> : <Rows3 size={12} />,
                  onSelect: () => setDiffMode(diffMode === "unified" ? "split" : "unified"),
                },
                {
                  label: t("diff.inlineBlame"),
                  icon: <UserRound size={12} />,
                  checked: inlineBlame,
                  onSelect: () => setInlineBlame(!inlineBlame),
                },
                {
                  label: t("diff.discardFileChanges"),
                  icon: <Trash2 size={12} />,
                  tone: "danger" as const,
                  separatorBefore: true,
                  onSelect: () => setConfirmDiscard(true),
                },
              ]}
            />
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="h-full overflow-auto bg-panel">
            {diffLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-[11.5px] text-ink-faint">
                <Loader2 size={14} className="animate-spin" />
                {t("diff.loadingDiff")}
              </div>
            ) : diff ? (
              <DiffViewer diff={diff} mode={diffMode} query={searchQuery} scrollerRef={scrollRef} commitSha={selectedCommitSha ?? undefined} />
            ) : (
              <EmptyState
                icon={FileDiffIcon}
                title={t("diff.emptyDiffTitle")}
                description={t("diff.emptyDiffDescription")}
              />
            )}
          </div>
          {searchBar}
        </div>

        <ConfirmDialog
          open={confirmDiscard}
          title={t("diff.discardConfirmTitle")}
          description={t("diff.discardConfirmDescription", { path: worktreeTarget.path })}
          confirmLabel={t("diff.discardConfirm")}
          tone="danger"
          onConfirm={() => {
            void discardFile(worktreeTarget.path);
            setConfirmDiscard(false);
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <header
        data-tauri-drag-region
        className="drag-region flex h-14 shrink-0 items-center gap-2 border-b border-line px-3"
      >
        {/* Same two-line recipe as the worktree header: title on top, the
            author / time / stats line below, only primary actions on the right. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {commit ? (
              <>
                <GitCommitHorizontal size={12} className="shrink-0 text-ink-faint" />
                <ShaChip sha={commit.sha} className="shrink-0 px-1 py-px text-[10px] text-ink-soft" />
                <span
                  className="min-w-0 truncate text-[11.5px] text-ink"
                  {...tip(commit.summary)}
                >
                  {commit.summary}
                </span>
                {detail?.isMerge ? (
                  <span className="shrink-0 rounded border border-line px-1 py-px text-[9px] text-ink-faint">
                    merge
                  </span>
                ) : null}
              </>
            ) : previewLabel ? (
              <>
                <Archive size={12} className="shrink-0 text-ink-faint" />
                <code className="shrink-0 rounded bg-canvas px-1 py-px font-mono text-[10px] text-ink-soft">
                  {previewLabel}
                </code>
                <span className="min-w-0 truncate text-[11.5px] text-ink">
                  {stashPreview ? t("stash.previewTitle") : t("diff.comparison")}
                </span>
              </>
            ) : (
              <>
                <FileDiffIcon size={12} className="shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-ink-soft">
                  {t("diff.comparison")}
                </span>
              </>
            )}
          </div>

          <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-ink-faint">
            {commit ? (
              <>
                <span className="min-w-0 truncate">{commit.authorName}</span>
                <span className="shrink-0 text-ink-faint/50">·</span>
                <span className="shrink-0" {...tip(timeTooltip(commit.committedAt))}>
                  {relativeTime(commit.committedAt)}
                </span>
                <span className="shrink-0 text-ink-faint/50">·</span>
                <span className="shrink-0 font-mono">
                  {t("diff.fileCount", { count: formatCount(files.length) })}
                  <span className="ml-1.5 text-positive">+{stats.additions}</span>
                  <span className="ml-1 text-negative">−{stats.deletions}</span>
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="no-drag ml-1 flex shrink-0 items-center gap-1">
          {selectedFilePath && !stashPreview ? (
            <IconButton
              label={t("fileHistory.openHint")}
              shortcut={formatBinding(keymap.fileHistory)}
              onClick={() => void openFileHistory(selectedFilePath, selectedCommitSha)}
            >
              <History size={13} />
            </IconButton>
          ) : null}
          {selectedCommitSha && !stashPreview ? (
            <RowMenu
              label={t("common.more")}
              items={[
                {
                  label: t("diff.refreshFileList"),
                  icon: <RefreshCw size={12} />,
                  onSelect: () => void refreshCommitFiles(),
                },
                ...(diff?.patch
                  ? [
                      {
                        label: t("diff.copyThisFilePatch"),
                        icon: <ClipboardCopy size={12} />,
                        onSelect: () => void copyPatch(),
                      },
                    ]
                  : []),
                {
                  label: t("diff.copyCommitSha"),
                  icon: <Copy size={12} />,
                  onSelect: () => void copySha(),
                },
                {
                  label: t("diff.commitDetails"),
                  icon: <Info size={12} />,
                  onSelect: () => setDetailOpen((open) => !open),
                },
                {
                  label: searchOpen ? t("diff.closeSearch") : t("diff.findInDiff"),
                  icon: <Search size={12} />,
                  onSelect: () => (searchOpen ? closeSearch() : setSearchOpen(true)),
                },
                {
                  label:
                    diffMode === "unified"
                      ? t("diff.switchToSplit")
                      : t("diff.switchToUnified"),
                  icon: diffMode === "unified" ? <Columns2 size={12} /> : <Rows3 size={12} />,
                  onSelect: () => setDiffMode(diffMode === "unified" ? "split" : "unified"),
                },
                {
                  label: t("diff.inlineBlame"),
                  icon: <UserRound size={12} />,
                  checked: inlineBlame,
                  onSelect: () => setInlineBlame(!inlineBlame),
                },
                {
                  label: t("diff.addTag"),
                  icon: <Tag size={12} />,
                  separatorBefore: true,
                  onSelect: () => openTags(selectedCommitSha),
                },
                {
                  label: t("diff.revertThisCommit"),
                  icon: <Undo2 size={12} />,
                  tone: "danger" as const,
                  onSelect: () => setConfirmRevert(true),
                },
              ]}
            />
          ) : null}
        </div>
      </header>

      {selectedCommitSha && !stashPreview && detailOpen && detail ? (
        <div className="max-h-[38%] shrink-0 overflow-y-auto border-b border-line bg-canvas/40 px-3 py-2">
          <p className="whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-ink">
            {detail.message.trim() || detail.summary}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-faint">
            <span className="text-ink-soft">{detail.authorName}</span>
            <span>{detail.authorEmail}</span>
            <span>·</span>
            <span {...tip(timeTooltip(detail.committedAt))}>{absoluteTime(detail.committedAt)}</span>
            <span>·</span>
            <span className="font-mono">
              +{detail.additions} / −{detail.deletions} · {t("diff.fileCount", { count: detail.filesChanged })}
            </span>
            {detail.isMerge ? (
              <span className="rounded border border-line px-1 py-px">merge</span>
            ) : null}
          </p>
          {detail.parents.length > 0 ? (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-ink-faint">
              {t("diff.parents")}
              {detail.parents.map((sha) => (
                <ShaChip key={sha} sha={sha} plain className="text-[10px]" />
              ))}
            </p>
          ) : null}
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => openTags(selectedCommitSha)}
              className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
            >
              <Tag size={10} />
              {t("diff.addTag")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmRevert(true)}
              className="inline-flex items-center gap-1 rounded-md border border-negative/35 px-1.5 py-0.5 text-[10.5px] text-negative transition-colors hover:bg-negative/8"
            >
              <Undo2 size={10} />
              {t("diff.revertThisCommit")}
            </button>
          </div>
        </div>
      ) : null}

      {!selectedCommitSha ? (
        <EmptyState icon={FileDiffIcon} title={t("diff.comparison")} />
      ) : (
        <div
          ref={splitBodyRef}
          className="grid min-h-0 flex-1"
          style={{
            gridTemplateRows:
              filesHeight === null
                ? "minmax(0, 38%) 6px minmax(0, 1fr)"
                : `${filesHeight}px 6px minmax(0, 1fr)`,
          }}
        >
          <div ref={splitFilesRef} className="min-h-0 overflow-y-auto bg-canvas/40">
            {filesLoading ? (
              <SkeletonRows rows={4} />
            ) : files.length === 0 ? (
              <p className="px-3 py-4 text-[11.5px] text-ink-faint">{t("diff.noFileChanges")}</p>
            ) : (
              <FileChangeList
                files={files}
                selectedPath={selectedFilePath}
                onSelect={(file) => void selectFile(file)}
              />
            )}
          </div>

          <Splitter
            horizontal
            label={t("layout.resizeFileList")}
            onPointerDown={beginFilesDrag}
            onDoubleClick={resetFilesHeight}
          />

          <div className="relative min-h-0">
            <div ref={scrollRef} className="h-full overflow-auto bg-panel">
              {diffLoading ? (
                <div className="flex h-full items-center justify-center gap-2 text-[11.5px] text-ink-faint">
                  <Loader2 size={14} className="animate-spin" />
                  {t("diff.loadingDiff")}
                </div>
              ) : diff ? (
                <DiffViewer diff={diff} mode={diffMode} query={searchQuery} scrollerRef={scrollRef} />
              ) : (
                <EmptyState
                  icon={FileDiffIcon}
                  title={t("diff.selectFileTitle")}
                  description={t("diff.selectFileDescription")}
                />
              )}
            </div>
            {searchBar}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRevert}
        title={t("diff.revertConfirmTitle")}
        description={t("diff.revertConfirmDescription")}
        confirmLabel={t("diff.revertConfirm")}
        tone="danger"
        onConfirm={() => {
          setConfirmRevert(false);
          if (!selectedCommitSha) return;
          void revertCommit(selectedCommitSha, revertSkipHooks).then((outcome) => {
            if (!outcome.ok && outcome.message) {
              showAlert(t("diff.revertFailed"), outcome.message);
            }
          });
        }}
        onCancel={() => setConfirmRevert(false)}
      >
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-canvas/40 px-2.5 py-1.5">
          <span
            className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors ${
              revertSkipHooks ? "border-accent bg-accent text-white" : "border-line-strong bg-panel"
            }`}
          >
            {revertSkipHooks ? <Check size={9} strokeWidth={3} /> : null}
          </span>
          <input
            type="checkbox"
            checked={revertSkipHooks}
            onChange={() => setRevertSkipHooks((value) => !value)}
            className="sr-only"
          />
          <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-ink-soft">
            {t("diff.revertSkipHooks")}
            <span className="mt-0.5 block text-[10px] text-ink-faint">
              {t("diff.revertSkipHooksHint")}
            </span>
          </span>
        </label>
      </ConfirmDialog>
    </section>
  );
}