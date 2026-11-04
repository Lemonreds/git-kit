import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowUpFromLine,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { useT } from "../../i18n";
import type { StashEntry } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import ConfirmDialog from "../common/ConfirmDialog";
import EmptyState from "../common/EmptyState";
import IconButton from "../common/IconButton";
import PaneTabs from "../workspace/PaneTabs";

/**
 * Stash pane: the stash list on the left, its changes in the detail column.
 *
 * Everything goes through the store (`stashEntries` / `refreshStashes` /
 * `stashPush` / `stashPop` / `stashDrop`), the same actions the worktree dialog
 * uses, so both entry points can never disagree about what is stashed.
 */
export default function StashPanel() {
  const t = useT();
  const {
    project,
    entries,
    preview,
    changesCount,
  } = useSlice((state) => ({
    project: state.activeProject,
    entries: state.stashEntries,
    preview: state.stashPreview,
    changesCount: state.changes?.entries.length ?? 0,
  }));

  const refreshStashes = useAppStore((state) => state.refreshStashes);
  const stashPush = useAppStore((state) => state.stashPush);
  const stashPop = useAppStore((state) => state.stashPop);
  const stashDrop = useAppStore((state) => state.stashDrop);
  const previewStash = useAppStore((state) => state.previewStash);

  const [composerOpen, setComposerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [busy, setBusy] = useState<"push" | number | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ready = project?.status === "ok";

  // Re-read whenever the pane opens: a stash can also appear from the terminal,
  // and one `git stash list` per pane switch is cheap.
  useEffect(() => {
    if (ready) void refreshStashes();
  }, [ready, refreshStashes]);

  useEffect(() => {
    if (composerOpen) inputRef.current?.focus();
  }, [composerOpen]);

  const submit = async () => {
    if (busy !== null) return;
    setBusy("push");
    const ok = await stashPush(message.trim(), includeUntracked);
    setBusy(null);
    if (!ok) return;
    // The store already reports success; the composer just resets.
    setMessage("");
    setComposerOpen(false);
  };

  const apply = async (entry: StashEntry) => {
    if (busy !== null) return;
    setBusy(entry.index);
    setConflict(null);
    const outcome = await stashPop(entry.index);
    setBusy(null);
    if (outcome.ok) return;
    if (outcome.code === "stash_conflict") setConflict(outcome.message ?? t("stash.conflict"));
  };

  const drop = async (index: number) => {
    if (busy !== null) return;
    setBusy(index);
    await stashDrop(index);
    setBusy(null);
  };

  if (!ready) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
        <header data-tauri-drag-region className="drag-region flex h-11 shrink-0 items-center gap-1.5 border-b border-line px-2">
          <PaneTabs active="stash" changesCount={changesCount} />
        </header>
        <EmptyState icon={Archive} title={t("stash.noRepo")} />
      </section>
    );
  }

  const loading = busy === "push";

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <header
        data-tauri-drag-region
        className="drag-region flex h-11 shrink-0 items-center gap-1.5 border-b border-line px-2"
      >
        <PaneTabs active="stash" changesCount={changesCount} />
        <div className="no-drag ml-auto flex min-w-0 items-center gap-0.5">
          <span className="shrink-0 pr-0.5 text-[10.5px] text-ink-faint">
            {entries.length > 0 ? t("stash.count", { count: entries.length }) : null}
          </span>
          <IconButton
            label={t("common.refresh")}
            onClick={() => void refreshStashes()}
            disabled={busy !== null}
          >
            <RefreshCw size={14} />
          </IconButton>
          <IconButton
            label={t("stash.create")}
            active={composerOpen}
            onClick={() => setComposerOpen((open) => !open)}
            disabled={busy !== null}
          >
            <Plus size={14} />
          </IconButton>
        </div>
      </header>

      {composerOpen ? (
        <div className="shrink-0 border-b border-line bg-canvas/40 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
                if (event.key === "Escape") setComposerOpen(false);
              }}
              placeholder={t("stash.messagePlaceholder")}
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-[11.5px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy !== null}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-45"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <Archive size={11} />}
              {t("stash.submit")}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-1.5 text-[10.5px] text-ink-faint">
              <span
                className={`grid h-3 w-3 place-items-center rounded-[3px] border transition-colors ${
                  includeUntracked ? "border-accent bg-accent text-white" : "border-line-strong bg-panel"
                }`}
              >
                {includeUntracked ? <Check size={8} strokeWidth={3} /> : null}
              </span>
              <input
                type="checkbox"
                checked={includeUntracked}
                onChange={() => setIncludeUntracked((value) => !value)}
                className="sr-only"
              />
              {t("stash.includeUntracked")}
            </label>
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              className="text-[10.5px] text-ink-faint transition-colors hover:text-ink"
            >
              {t("stash.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {conflict ? (
        <p className="max-h-28 shrink-0 overflow-y-auto whitespace-pre-line border-b border-negative/25 bg-negative/8 px-3 py-2 font-mono text-[10px] leading-relaxed text-negative">
          {conflict}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <EmptyState icon={Archive} title={t("stash.empty")} description={t("stash.emptyHint")}>
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="mt-0.5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Archive size={12} />
              {t("stash.create")}
            </button>
          </EmptyState>
        ) : (
          <>
            <ul className="py-1">
              {entries.map((entry) => {
                const active = preview?.selector === entry.selector;
                const rowBusy = busy === entry.index;
                return (
                  <li key={entry.selector}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => void previewStash(entry.index, entry.selector)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void previewStash(entry.index, entry.selector);
                        }
                      }}
                      className={`group mx-1 flex cursor-default items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        active ? "bg-accent-soft" : "hover:bg-ink/5"
                      }`}
                    >
                      <ArchiveRestore
                        size={13}
                        className={`mt-0.5 shrink-0 ${active ? "text-accent" : "text-ink-faint"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11.5px] text-ink" title={entry.message}>
                          {entry.message || t("stash.noMessage")}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[9.5px] text-ink-faint">
                          {entry.selector}
                          {active ? <span className="font-sans">{t("stash.showing")}</span> : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <IconButton
                          label={t("stash.apply")}
                          size="sm"
                          disabled={busy !== null}
                          onClick={(event) => {
                            event.stopPropagation();
                            void apply(entry);
                          }}
                        >
                          {rowBusy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <ArrowUpFromLine size={12} />
                          )}
                        </IconButton>
                        <IconButton
                          label={t("stash.drop")}
                          size="sm"
                          tone="danger"
                          disabled={busy !== null}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDrop(entry.index);
                          }}
                        >
                          <Trash2 size={12} />
                        </IconButton>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="px-3 py-2 text-[10px] leading-relaxed text-ink-faint">{t("stash.hint")}</p>
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingDrop !== null}
        title={t("stash.dropTitle")}
        description={t("stash.dropDescription")}
        confirmLabel={t("common.delete")}
        tone="danger"
        onConfirm={() => {
          const index = pendingDrop;
          setPendingDrop(null);
          if (index !== null) void drop(index);
        }}
        onCancel={() => setPendingDrop(null)}
      />
    </section>
  );
}