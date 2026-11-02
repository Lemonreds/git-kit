import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  CloudDownload,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Upload,
  X,
} from "lucide-react";

import { useT } from "../../i18n";
import { copyText, relativeTime } from "../../lib/format";
import type { TagInfo } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import { TAG_PAGE } from "../../store/shared";
import EmptyState from "../common/EmptyState";
import IconButton from "../common/IconButton";
import { SkeletonRows } from "../common/Skeleton";
import PaneTabs from "../workspace/PaneTabs";
import TagRow, { type TagRemoteState } from "./TagRow";
import VirtualTagList, { type TagListEntry } from "./VirtualTagList";

// Lazy: the pane is list-only until the user actually creates or deletes.
const CreateTagDialog = lazy(() => import("./CreateTagDialog"));
const DeleteTagDialog = lazy(() => import("./DeleteTagDialog"));

/** How long a freshly created tag keeps its "new" highlight. */
const FRESH_MS = 6000;

type RemoteFilter = "all" | "pushed" | "unpushed";

function matches(tag: TagInfo, keyword: string): boolean {
  if (!keyword) return true;
  return (
    tag.name.toLowerCase().includes(keyword) ||
    (tag.message?.toLowerCase().includes(keyword) ?? false) ||
    (tag.commitSummary?.toLowerCase().includes(keyword) ?? false) ||
    tag.sha.toLowerCase().includes(keyword) ||
    tag.shortSha.toLowerCase().includes(keyword)
  );
}

/**
 * All tags of the active repository: search, remote comparison, create and
 * delete. It is a pane (not a dialog) because a tag list is browsed — the old
 * dialog capped the list at 200 px and had nowhere to search.
 */
export default function TagsPanel() {
  const t = useT();
  const {
    project,
    snapshot,
    tags,
    loading,
    filter,
    busy,
    pushingAll,
    remote,
    remoteLoading,
    createTarget,
    changesCount,
    tagLimit,
  } = useSlice((state) => ({
    project: state.activeProject,
    snapshot: state.snapshot,
    tags: state.tags,
    loading: state.tagsLoading,
    filter: state.tagFilter,
    busy: state.tagBusy,
    pushingAll: state.tagPushingAll,
    remote: state.tagRemote,
    remoteLoading: state.tagRemoteLoading,
    createTarget: state.tagTarget,
    changesCount: state.changes?.entries.length ?? 0,
    tagLimit: state.tagLimit,
  }));

  const setFilter = useAppStore((state) => state.setTagFilter);
  const loadMoreTags = useAppStore((state) => state.loadMoreTags);
  const resetTagPage = useAppStore((state) => state.resetTagPage);
  const refreshTags = useAppStore((state) => state.refreshTags);
  const syncRemoteTags = useAppStore((state) => state.syncRemoteTags);
  const pushAllTags = useAppStore((state) => state.pushAllTags);
  const pushTag = useAppStore((state) => state.pushTag);
  const clearTagTarget = useAppStore((state) => state.clearTagTarget);
  const openTagCommits = useAppStore((state) => state.openTagCommits);
  const notify = useAppStore((state) => state.notify);
  const headBranch = useAppStore(
    (state) => state.branches.find((branch) => branch.isHead)?.name ?? null,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [remoteFilter, setRemoteFilter] = useState<RemoteFilter>("all");
  const [freshName, setFreshName] = useState<string | null>(null);
  const freshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Tags are cheap to read and can change from outside the app (a `git tag` in
  // the terminal), so the pane re-reads once per project instead of trusting
  // whatever the project load fetched.
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    const id = project?.id ?? null;
    if (!id || refreshedFor.current === id) return;
    refreshedFor.current = id;
    void refreshTags();
  }, [project?.id, refreshTags]);

  useEffect(() => () => clearTimeout(freshTimer.current), []);

  // Reached from "tag this commit": the pane opens with a pre-filled form.
  useEffect(() => {
    if (createTarget) setCreateOpen(true);
  }, [createTarget]);

  const hasRemote = Boolean(snapshot?.url ?? snapshot?.remoteHost ?? project?.url);
  const remoteKnown = Boolean(remote && remote.remote && !remote.failure);
  const remoteTags = remoteKnown ? remote?.tags ?? {} : null;

  const remoteStateOf = useCallback(
    (name: string): TagRemoteState => {
      if (!remoteTags) return "unknown";
      return remoteTags[name] ? "pushed" : "unpushed";
    },
    [remoteTags],
  );

  const keyword = filter.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = tags.filter((tag) => matches(tag, keyword));
    if (!remoteTags || remoteFilter === "all") return list;
    return list.filter((tag) =>
      remoteFilter === "pushed" ? Boolean(remoteTags[tag.name]) : !remoteTags[tag.name],
    );
  }, [tags, keyword, remoteTags, remoteFilter]);

  // Tags that only exist on the remote cannot be shown as rows (there is no
  // local ref to open or delete), but the count is worth knowing.
  const remoteOnlyCount = useMemo(() => {
    if (!remoteTags) return 0;
    const local = new Set(tags.map((tag) => tag.name));
    return Object.keys(remoteTags).filter((name) => !local.has(name)).length;
  }, [remoteTags, tags]);

  // Only the first page is mounted at once: the full list is already in memory,
  // but rendering hundreds of rows is what the virtual list and the paging are
  // here to avoid. `tagLimit` lives in the store so the page survives a pane
  // switch and is reset when the project / keyword / filter changes.
  const visible = useMemo(() => filtered.slice(0, tagLimit), [filtered, tagLimit]);
  const hasMore = filtered.length > visible.length;

  const listKey = `${project?.id ?? ""}::${keyword}::${remoteFilter}::${tagLimit}::${remote?.syncedAt ?? 0}`;

  const loadMoreNode = (
    <div className="flex items-center gap-2 px-2 pb-1 pt-2">
      <button
        type="button"
        onClick={() => loadMoreTags()}
        title={t("tags.loadMoreTip", { page: TAG_PAGE, shown: visible.length, total: filtered.length })}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-px text-[10px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
      >
        <ChevronDown size={9} />
        {t("tags.loadMore", { page: TAG_PAGE })}
      </button>
      <span className="h-px flex-1 bg-line" />
      <span className="shrink-0 text-[10px] text-ink-faint">
        {t("tags.showing", { shown: visible.length, total: filtered.length })}
      </span>
    </div>
  );

  // Rebuilt on every render on purpose: the footer renders the current counters.
  // At most `tagLimit` rows exist, so this stays cheap.
  const entries: TagListEntry[] = visible.map((tag) => ({ kind: "row", tag }));
  if (hasMore) entries.push({ kind: "node", key: "load-more", node: loadMoreNode });

  const markFresh = (name: string) => {
    clearTimeout(freshTimer.current);
    setFreshName(name);
    freshTimer.current = setTimeout(() => setFreshName(null), FRESH_MS);
  };

  // Switching the remote comparison filter is a new result set too.
  const changeRemoteFilter = (next: RemoteFilter) => {
    setRemoteFilter(next);
    resetTagPage();
  };

  const copyName = async (name: string) => {
    const ok = await copyText(name);
    notify(ok ? "success" : "error", ok ? t("tags.copied", { name }) : t("common.copyFailed"));
  };

  const renderRow = (tag: TagInfo) => (
    <TagRow
      key={tag.name}
      tag={tag}
      remote={remoteStateOf(tag.name)}
      canPush={hasRemote}
      busy={busy === tag.name ? t("tags.working") : null}
      fresh={freshName === tag.name}
      onOpen={() => void openTagCommits(tag)}
      onPush={() => void pushTag(tag.name)}
      onCopy={() => void copyName(tag.name)}
      onDelete={() => setDeleteTarget(tag.name)}
    />
  );

  const chips: Array<{ id: RemoteFilter; label: string }> = [
    { id: "all", label: t("tags.filterAll") },
    { id: "unpushed", label: t("tags.filterUnpushed") },
    { id: "pushed", label: t("tags.filterPushed") },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <header
        data-tauri-drag-region
        className="drag-region flex h-11 shrink-0 items-center gap-2 border-b border-line px-2.5"
      >
        <PaneTabs active="tags" changesCount={changesCount} />
        <div className="no-drag ml-auto flex min-w-0 items-center gap-0.5">
          <IconButton
            label={t("tags.refresh")}
            onClick={() => void refreshTags()}
            disabled={!snapshot || loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </IconButton>
          <IconButton
            label={t("tags.syncRemote")}
            onClick={() => void syncRemoteTags()}
            disabled={!hasRemote || remoteLoading || !snapshot}
          >
            {remoteLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CloudDownload size={14} />
            )}
          </IconButton>
          <IconButton
            label={t("tags.pushAll")}
            onClick={() => void pushAllTags()}
            disabled={!hasRemote || pushingAll || tags.length === 0}
          >
            {pushingAll ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          </IconButton>
          <IconButton label={t("tags.create")} onClick={() => setCreateOpen(true)} disabled={!snapshot}>
            <Plus size={14} />
          </IconButton>
        </div>
      </header>

      <div className="shrink-0 space-y-1.5 px-3 pb-1.5 pt-2.5">
        <label className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas/50 px-2 py-1.5 transition-colors focus-within:border-accent/60 focus-within:bg-panel">
          <Search size={12} className="shrink-0 text-ink-faint" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t("tags.filterPlaceholder")}
            spellCheck={false}
            className="w-full bg-transparent text-[11.5px] text-ink outline-none placeholder:text-ink-faint"
          />
          {filter ? (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label={t("tags.clearFilter")}
              className="grid h-4 w-4 place-items-center rounded text-ink-faint hover:bg-ink/8 hover:text-ink"
            >
              <X size={10} />
            </button>
          ) : null}
        </label>

        {remoteKnown ? (
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-ink-faint">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => changeRemoteFilter(chip.id)}
                aria-pressed={remoteFilter === chip.id}
                className={`rounded-md border px-1.5 py-px transition-colors ${
                  remoteFilter === chip.id
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-line text-ink-soft hover:border-accent/40 hover:text-accent"
                }`}
              >
                {chip.label}
              </button>
            ))}
            <span className="ml-0.5 truncate">
              {t("tags.remoteSummary", {
                remote: remote?.remote ?? "",
                count: Object.keys(remoteTags ?? {}).length,
              })}
            </span>
            <span aria-hidden className="text-line-strong">
              ·
            </span>
            <span>{t("tags.syncedAt", { time: relativeTime(Math.floor((remote?.syncedAt ?? 0) / 1000)) })}</span>
          </div>
        ) : null}

        {remote?.failure ? (
          <p className="truncate text-[10px] text-negative" title={remote.failure}>
            {t("tags.remoteFailure", { error: remote.failure })}
          </p>
        ) : null}

        {hasRemote ? null : (
          <p className="text-[10px] text-ink-faint">{t("tags.remoteMissing")}</p>
        )}

        {remoteOnlyCount > 0 ? (
          <p className="text-[10px] text-ink-faint">
            {t("tags.remoteOnlyHint", { count: remoteOnlyCount })}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading && tags.length === 0 ? (
          <div className="px-2 pt-1">
            <SkeletonRows rows={6} />
          </div>
        ) : tags.length === 0 ? (
          <EmptyState
            icon={Tag}
            title={t("tags.emptyTitle")}
            description={t("tags.emptyDescription")}
          >
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus size={12} />
              {t("tags.create")}
            </button>
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title={t("tags.noMatchTitle")}
            description={t("tags.noMatchDescription")}
          />
        ) : (
          <VirtualTagList entries={entries} renderTag={renderRow} listKey={listKey} />
        )}
      </div>

      <Suspense fallback={null}>
        {createOpen ? (
          <CreateTagDialog
            defaultTarget={createTarget ?? headBranch ?? "HEAD"}
            onCreated={markFresh}
            onClose={() => {
              setCreateOpen(false);
              clearTagTarget();
            }}
          />
        ) : null}
        {deleteTarget ? (
          <DeleteTagDialog
            name={deleteTarget}
            onRemote={remoteStateOf(deleteTarget) === "pushed"}
            onClose={() => setDeleteTarget(null)}
          />
        ) : null}
      </Suspense>
    </section>
  );
}