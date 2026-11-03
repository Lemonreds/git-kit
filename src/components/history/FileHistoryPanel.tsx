import { useRef } from "react";
import { FileText, History, Loader2, RefreshCw, ScrollText, X } from "lucide-react";

import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import type { FileHistoryTab } from "../../store/slices/fileHistorySlice";
import EmptyState from "../common/EmptyState";
import IconButton from "../common/IconButton";
import { SkeletonRows } from "../common/Skeleton";
import { tip } from "../common/Tooltip";
import DiffViewer from "../diff/DiffViewer";
import VirtualBlameList from "./VirtualBlameList";
import VirtualHistoryList from "./VirtualHistoryList";

const TAB_LABEL: Record<FileHistoryTab, MessageKey> = {
  history: "fileHistory.tabHistory",
  blame: "fileHistory.tabBlame",
};

export default function FileHistoryPanel() {
  const t = useT();
  const view = useAppStore((state) => state.fileView);
  const diffMode = useAppStore((state) => state.diffMode);
  const setTab = useAppStore((state) => state.setFileHistoryTab);
  const selectCommit = useAppStore((state) => state.selectHistoryCommit);
  const loadMore = useAppStore((state) => state.loadMoreHistory);
  const requestBlame = useAppStore((state) => state.requestBlame);
  const refresh = useAppStore((state) => state.refreshFileView);
  const close = useAppStore((state) => state.closeFileView);

  const diffScrollRef = useRef<HTMLDivElement | null>(null);

  if (!view) return null;

  const rev = view.rev;
  const base = "flex items-center gap-1 rounded-md px-2 py-[3px] text-[11px] font-medium transition-colors";
  const on = "bg-panel text-ink shadow-sm";
  const off = "text-ink-faint hover:text-ink-soft";

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <header
        data-tauri-drag-region
        className="drag-region flex h-14 shrink-0 items-center gap-2 border-b border-line px-2.5"
      >
        {/* Row 1: the view switcher; row 2: which file and which revision. The
            path used to share a row with the tabs and lost almost all its width. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="no-drag flex shrink-0 items-center gap-0.5 rounded-lg bg-canvas/80 p-0.5">
              <button type="button" onClick={close} className={`${base} ${off}`}>
                {t("fileHistory.tabDiff")}
              </button>
              {(["history", "blame"] as FileHistoryTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTab(tab)}
                  aria-pressed={view.tab === tab}
                  className={`${base} ${view.tab === tab ? on : off}`}
                >
                  {tab === "history" ? <History size={11.5} /> : <ScrollText size={11.5} />}
                  {t(TAB_LABEL[tab])}
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-ink-faint">
            <FileText size={10} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate font-mono text-ink-soft" {...tip(view.path)}>
              {view.path}
            </span>
            <span className="shrink-0 text-ink-faint/50">·</span>
            <span className="shrink-0">
              {rev === null
                ? t("fileHistory.revWorktree")
                : t("fileHistory.revCommit", { sha: rev.slice(0, 7) })}
            </span>
            {view.entries.length > 0 ? (
              <>
                <span className="shrink-0 text-ink-faint/50">·</span>
                <span className="shrink-0">
                  {t("fileHistory.commitCount", { count: view.entries.length })}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="no-drag ml-auto flex shrink-0 items-center gap-0.5">
          <IconButton label={t("fileHistory.refresh")} onClick={() => void refresh()}>
            <RefreshCw
              size={13}
              className={view.historyLoading || view.blameLoading ? "animate-spin" : undefined}
            />
          </IconButton>
          <IconButton label={t("fileHistory.close")} onClick={close}>
            <X size={13} />
          </IconButton>
        </div>
      </header>

      {view.tab === "history" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="h-[220px] max-h-[42%] min-h-[110px] shrink-0 overflow-hidden border-b border-line bg-canvas/40">
            {view.historyLoading && view.entries.length === 0 ? (
              <SkeletonRows rows={4} />
            ) : view.entries.length === 0 ? (
              <EmptyState
                icon={History}
                title={t("fileHistory.emptyTitle")}
                description={t("fileHistory.emptyDescription")}
              />
            ) : (
              <VirtualHistoryList
                entries={view.entries}
                selectedSha={view.selectedSha}
                onSelect={(sha) => void selectCommit(sha)}
              />
            )}
          </div>

          <div className="relative min-h-0 flex-1">
            <div ref={diffScrollRef} className="h-full overflow-auto bg-panel">
              {view.diffLoading ? (
                <div className="flex h-full items-center justify-center gap-2 text-[11.5px] text-ink-faint">
                  <Loader2 size={14} className="animate-spin" />
                  {t("diff.loadingDiff")}
                </div>
              ) : view.diff ? (
                <DiffViewer
                  diff={view.diff}
                  mode={diffMode}
                  scrollerRef={diffScrollRef}
                  commitSha={view.selectedSha ?? undefined}
                />
              ) : view.diffMissing ? (
                <EmptyState
                  icon={History}
                  title={t("fileHistory.noDiffTitle")}
                  description={t("fileHistory.noDiffDescription")}
                />
              ) : (
                <EmptyState
                  icon={History}
                  title={t("fileHistory.selectCommitTitle")}
                  description={t("fileHistory.selectCommitDescription")}
                />
              )}
            </div>
          </div>

          {view.historyTruncated ? (
            <footer className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-1.5 text-[10.5px] text-ink-faint">
              <span>{t("fileHistory.truncated", { count: view.entries.length })}</span>
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={view.historyLoading}
                className="ml-auto rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                {view.historyLoading ? t("fileHistory.loadingMore") : t("fileHistory.loadMore")}
              </button>
            </footer>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {view.blameError ? (
              <EmptyState
                icon={ScrollText}
                title={t("fileHistory.blameErrorTitle")}
                description={view.blameError}
              />
            ) : view.blameLoadedTo === 0 ? (
              view.blameLoading ? (
                <div className="flex h-full items-center justify-center gap-2 text-[11.5px] text-ink-faint">
                  <Loader2 size={14} className="animate-spin" />
                  {t("fileHistory.blameLoading")}
                </div>
              ) : (
                <EmptyState
                  icon={ScrollText}
                  title={t("fileHistory.blameEmptyTitle")}
                  description={t("fileHistory.blameEmptyDescription")}
                />
              )
            ) : (
              <VirtualBlameList
                hunks={view.blameHunks}
                lines={view.blameLines}
                loadedTo={view.blameLoadedTo}
                totalLines={view.blameTotalLines}
                loaded={!view.blameLoading}
                onLoadMore={() => void requestBlame(view.blameLoadedTo + 1)}
                onSelectCommit={(sha) => {
                  setTab("history");
                  void selectCommit(sha);
                }}
                listKey={`${view.rev ?? "worktree"}:${view.path}`}
              />
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-3 py-1.5 text-[10.5px] text-ink-faint">
            {view.blameLoading ? <Loader2 size={11} className="animate-spin" /> : null}
            <span>
              {view.rev === null
                ? t("fileHistory.worktreeHint")
                : t("fileHistory.revHint", { rev: view.rev.slice(0, 7) })}
            </span>
            {view.blameLoadedTo < view.blameTotalLines ? (
              <span className="ml-auto">
                {t("fileHistory.blameTruncated", {
                  loaded: view.blameLoadedTo,
                  total: view.blameTotalLines,
                })}
              </span>
            ) : view.blameTotalLines > 0 ? (
              <span className="ml-auto">{t("fileHistory.lineCount", { count: view.blameTotalLines })}</span>
            ) : null}
          </footer>
        </div>
      )}
    </section>
  );
}