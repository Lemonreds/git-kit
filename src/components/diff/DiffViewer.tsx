import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Binary, FileWarning } from "lucide-react";

import { parsePatch, toSplitRowItems, toUnifiedRows } from "../../lib/parsePatch";
import type { FileDiff } from "../../lib/types";
import type { DiffMode } from "../../store/appStore";
import EmptyState from "../common/EmptyState";
import SplitDiff from "./SplitDiff";
import UnifiedDiff from "./UnifiedDiff";

interface DiffViewerProps {
  diff: FileDiff;
  mode: DiffMode;
  /** In-diff search term (highlights matches). */
  query?: string;
  /** Scroll container around this viewer; used to load more rows while scrolling. */
  scrollerRef?: RefObject<HTMLDivElement | null>;
}

// Auto-switch to unified mode for large files: the split view renders both
// sides of every row, which doubles the DOM for no benefit on huge files.
const LARGE_FILE_THRESHOLD = 1000;

/**
 * Rows rendered per chunk. A 6k-line patch would otherwise mount ~20k nodes and
 * hold them until the file is closed; rendering on demand keeps the DOM window
 * roughly constant while scrolling.
 */
const RENDER_STEP = 600;

function DiffViewer({ diff, mode, query = "", scrollerRef }: DiffViewerProps) {
  const parsed = useMemo(() => parsePatch(diff.patch), [diff.patch]);

  const totalLines = diff.additions + diff.deletions;
  const isLargeFile = totalLines > LARGE_FILE_THRESHOLD;
  const effectiveMode = isLargeFile ? "unified" : mode;

  // Built once per patch + mode: rebuilding the side-by-side pairing on every
  // render used to allocate a fresh object per line each time. Only the rows of
  // the mode that is actually shown are built.
  const unifiedRows = useMemo(
    () => (effectiveMode === "unified" ? toUnifiedRows(parsed.hunks) : null),
    [parsed, effectiveMode],
  );
  const splitRows = useMemo(
    () => (effectiveMode === "split" ? toSplitRowItems(parsed.hunks) : null),
    [parsed, effectiveMode],
  );
  const rowCount = unifiedRows?.length ?? splitRows?.length ?? 0;

  const [limit, setLimit] = useState(RENDER_STEP);
  useEffect(() => {
    setLimit(RENDER_STEP);
  }, [diff.patch, effectiveMode]);

  const searching = query.trim().length > 0;
  // Matches are found in the DOM, so a search renders the whole file. Closing
  // the search collapses back to the chunked view.
  const visible = searching ? rowCount : Math.min(limit, rowCount);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (searching || visible >= rowCount) return undefined;
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((current) => Math.min(current + RENDER_STEP, rowCount));
        }
      },
      // The diff scrolls inside its own pane, not the window.
      { root: scrollerRef?.current ?? null, rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [searching, visible, rowCount, scrollerRef]);

  if (diff.isBinary) {
    return (
      <EmptyState
        icon={Binary}
        title="二进制文件"
        description="该文件无法按行展示差异，请在本地工具中查看。"
      />
    );
  }

  return (
    <div className="min-w-0">
      {/* No backdrop blur here: a full-width blurred surface over a long scrolling
          document keeps a compositing layer alive for as long as the file is open. */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft">
          {diff.oldPath ? (
            <>
              <span className="text-ink-faint">{diff.oldPath}</span>
              <span className="px-1.5 text-ink-faint">→</span>
              <span className="text-ink">{diff.path}</span>
            </>
          ) : (
            <span className="text-ink">{diff.path}</span>
          )}
        </span>
        <span className="shrink-0 font-mono text-[10px]">
          <span className="text-positive">+{diff.additions}</span>
          <span className="px-1 text-ink-faint">/</span>
          <span className="text-negative">−{diff.deletions}</span>
        </span>
      </div>

      {diff.truncated ? (
        <div className="flex items-center gap-2 border-b border-line bg-warning/10 px-3 py-1.5 text-[11px] text-warning">
          <FileWarning size={12} className="shrink-0" />
          文件较大，仅展示部分改动内容。
        </div>
      ) : null}

      {isLargeFile && mode === "split" ? (
        <div className="flex items-center gap-2 border-b border-line bg-accent/10 px-3 py-1.5 text-[11px] text-accent">
          <FileWarning size={12} className="shrink-0" />
          文件改动超过 {LARGE_FILE_THRESHOLD} 行，已自动切换为 unified 模式以优化性能。
        </div>
      ) : null}

      {unifiedRows ? (
        <UnifiedDiff rows={unifiedRows} limit={visible} query={query} />
      ) : splitRows ? (
        <SplitDiff rows={splitRows} limit={visible} query={query} />
      ) : null}

      {visible < rowCount ? (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center gap-2 border-t border-line/60 px-3 py-2 text-[10.5px] text-ink-faint"
        >
          已显示 {visible} / {rowCount} 行 · 继续向下滚动会自动加载
          <button
            type="button"
            onClick={() => setLimit(rowCount)}
            className="rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
          >
            全部显示
          </button>
        </div>
      ) : null}
    </div>
  );
}

// The parent re-renders on every search step; the diff itself only changes when
// the patch / mode / query changes.
export default memo(DiffViewer);