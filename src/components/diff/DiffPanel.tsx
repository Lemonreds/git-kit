import { useEffect, useRef, useState } from "react";
import {
  ClipboardCopy,
  Columns2,
  Copy,
  FileDiff as FileDiffIcon,
  GitCommitHorizontal,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Tag,
  Trash2,
  Undo2,
} from "lucide-react";

import { useT } from "../../i18n";
import { api } from "../../lib/ipc";
import type { CommitDetail } from "../../lib/types";
import TagDialog from "../branches/TagDialog";

import { absoluteTime, copyText, formatCount, timeTooltip } from "../../lib/format";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import ConfirmDialog from "../common/ConfirmDialog";
import EmptyState from "../common/EmptyState";
import IconButton from "../common/IconButton";
import ShaChip from "../common/ShaChip";
import { SkeletonRows } from "../common/Skeleton";
import { tip } from "../common/Tooltip";
import DiffSearch from "./DiffSearch";
import DiffViewer from "./DiffViewer";
import FileChangeList from "./FileChangeList";

export default function DiffPanel() {
  const t = useT();
  const {
    activeProject,
    commits,
    worktreeTarget,
    selectedCommitSha,
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
    files: state.commitFiles,
    filesLoading: state.filesLoading,
    selectedFilePath: state.selectedFilePath,
    diff: state.diff,
    diffLoading: state.diffLoading,
    diffMode: state.diffMode,
  }));

  const setDiffMode = useAppStore((state) => state.setDiffMode);
  const selectFile = useAppStore((state) => state.selectFile);
  const refreshCommitFiles = useAppStore((state) => state.refreshCommitFiles);
  const refreshWorktreeDiff = useAppStore((state) => state.refreshWorktreeDiff);
  const stageFile = useAppStore((state) => state.stageFile);
  const unstageFile = useAppStore((state) => state.unstageFile);
  const discardFile = useAppStore((state) => state.discardFile);
  const notify = useAppStore((state) => state.notify);
  const showAlert = useAppStore((state) => state.showAlert);
  const revertCommit = useAppStore((state) => state.revertCommit);

  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const commit = commits.find((item) => item.sha === selectedCommitSha) ?? null;
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

  const modeToggle = (
    <div className="ml-0.5 flex items-center gap-0.5 rounded-md border border-line bg-canvas/60 p-0.5">
      <IconButton
        label={t("diff.unifiedView")}
        size="sm"
        active={diffMode === "unified"}
        onClick={() => setDiffMode("unified")}
      >
        <Rows3 size={12} />
      </IconButton>
      <IconButton
        label={t("diff.splitView")}
        size="sm"
        active={diffMode === "split"}
        onClick={() => setDiffMode("split")}
      >
        <Columns2 size={12} />
      </IconButton>
    </div>
  );

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCount, setSearchCount] = useState(0);
  const [searchActive, setSearchActive] = useState(0);
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);

  useEffect(() => {
    if (!selectedCommitSha || !activeProject) {
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
  }, [selectedCommitSha, activeProject]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ⌘F / Ctrl+F opens the in-diff finder.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        // Re-focus (and re-select) the input when ⌘F is pressed again.
        setSearchFocusKey((key) => key + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  const searchToggle = (
    <IconButton
      label={t("diff.findInDiff")}
      shortcut="⌘F"
      active={searchOpen}
      onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
    >
      <Search size={13} />
    </IconButton>
  );

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

  if (worktreeTarget) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
        <header
          data-tauri-drag-region
          className="drag-region flex h-11 shrink-0 items-center gap-2 border-b border-line px-3"
        >
          <FileDiffIcon size={13} className="shrink-0 text-ink-faint" />
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${
              worktreeTarget.staged
                ? "bg-positive/12 text-positive"
                : "bg-warning/14 text-warning"
            }`}
          >
            {worktreeTarget.staged ? t("diff.staged") : t("diff.unstaged")}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft">
            {worktreeTarget.path}
          </span>
          {diff ? (
            <span className="shrink-0 font-mono text-[10px]">
              <span className="text-positive">+{diff.additions}</span>
              <span className="ml-1 text-negative">−{diff.deletions}</span>
            </span>
          ) : null}

          <div className="no-drag ml-1 flex shrink-0 items-center gap-0.5">
            <IconButton
              label={t("diff.refreshThisFile")}
              onClick={() => void refreshWorktreeDiff()}
              disabled={diffLoading}
            >
              <RefreshCw size={13} className={diffLoading ? "animate-spin" : undefined} />
            </IconButton>
            {worktreeTarget.staged ? (
              <IconButton
                label={t("diff.unstageThisFile")}
                onClick={() => void unstageFile(worktreeTarget.path)}
              >
                <Undo2 size={13} />
              </IconButton>
            ) : (
              <IconButton label={t("diff.stageThisFile")} onClick={() => void stageFile(worktreeTarget.path)}>
                <Plus size={13} />
              </IconButton>
            )}
            <IconButton
              label={t("diff.discardFileChanges")}
              tone="danger"
              onClick={() => setConfirmDiscard(true)}
            >
              <Trash2 size={13} />
            </IconButton>
            {diff?.patch ? (
              <IconButton label={t("diff.copyThisFilePatch")} onClick={() => void copyPatch()}>
                <ClipboardCopy size={13} />
              </IconButton>
            ) : null}
            {searchToggle}
            {modeToggle}
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
        className="drag-region flex h-11 shrink-0 items-center gap-2 border-b border-line px-3"
      >
        {commit ? (
          <>
            <GitCommitHorizontal size={13} className="shrink-0 text-ink-faint" />
            <ShaChip
              sha={commit.sha}
              className="px-1.5 py-0.5 text-[10.5px] text-ink-soft"
            />
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-soft" {...tip(commit.summary)}>
              {commit.summary}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-ink-faint">
              {t("diff.fileCount", { count: formatCount(files.length) })}
              <span className="ml-1.5 text-positive">+{stats.additions}</span>
              <span className="ml-1 text-negative">−{stats.deletions}</span>
            </span>
          </>
        ) : (
          <>
            <FileDiffIcon size={13} className="text-ink-faint" />
            <span className="flex-1 text-[11.5px] font-medium text-ink-soft">{t("diff.comparison")}</span>
          </>
        )}

        <div className="no-drag ml-1 flex shrink-0 items-center gap-0.5">
          <IconButton
            label={t("diff.refreshFileList")}
            onClick={() => void refreshCommitFiles()}
            disabled={filesLoading || !selectedCommitSha}
          >
            <RefreshCw size={13} className={filesLoading ? "animate-spin" : undefined} />
          </IconButton>
          {diff?.patch ? (
            <IconButton label={t("diff.copyThisFilePatch")} onClick={() => void copyPatch()}>
              <ClipboardCopy size={13} />
            </IconButton>
          ) : null}
          {selectedCommitSha ? (
            <>
              <IconButton label={t("diff.copyCommitSha")} onClick={() => void copySha()}>
                <Copy size={13} />
              </IconButton>
              <IconButton
                label={t("diff.commitDetails")}
                active={detailOpen}
                onClick={() => setDetailOpen((open) => !open)}
              >
                <Info size={13} />
              </IconButton>
            </>
          ) : null}
          {searchToggle}
          {modeToggle}
        </div>
      </header>

      {selectedCommitSha && detailOpen && detail ? (
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
              onClick={() => setTagOpen(true)}
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
        <EmptyState icon={FileDiffIcon} title={t("diff.selectCommit")} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="max-h-[38%] shrink-0 overflow-y-auto border-b border-line bg-canvas/40">
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

          <div className="relative min-h-0 flex-1">
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

      {tagOpen && selectedCommitSha ? (
        <TagDialog defaultTarget={selectedCommitSha} onClose={() => setTagOpen(false)} />
      ) : null}

      <ConfirmDialog
        open={confirmRevert}
        title={t("diff.revertConfirmTitle")}
        description={t("diff.revertConfirmDescription")}
        confirmLabel={t("diff.revertConfirm")}
        tone="danger"
        onConfirm={() => {
          setConfirmRevert(false);
          if (!selectedCommitSha) return;
          void revertCommit(selectedCommitSha).then((outcome) => {
            if (!outcome.ok && outcome.message) {
              showAlert(t("diff.revertFailed"), outcome.message);
            }
          });
        }}
        onCancel={() => setConfirmRevert(false)}
      />
    </section>
  );
}