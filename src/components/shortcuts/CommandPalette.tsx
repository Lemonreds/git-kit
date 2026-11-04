import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, Search, Workflow as WorkflowIcon } from "lucide-react";

import { useT } from "../../i18n";
import { COMMAND_GROUPS, COMMANDS, isAvailable, runCommand } from "../../lib/commands";
import type { CommandSpec } from "../../lib/commands";
import { formatBinding, splitShortcutLabel } from "../../lib/keymap";
import { useAppStore } from "../../store/appStore";
import Keycap from "../common/Keycap";

interface PaletteEntry {
  id: string;
  group: string;
  label: string;
  keycap: string;
  run: () => void;
}

/**
 * ⌘K palette. It is a thin shell over the command registry: the list is the
 * same `COMMANDS` array the hotkey dispatcher walks, so every entry here has a
 * real binding, and the repository's stored workflows appear as runnable items
 * without a second registry.
 */
export default function CommandPalette() {
  const t = useT();
  const open = useAppStore((state) => state.paletteOpen);
  const setPaletteOpen = useAppStore((state) => state.setPaletteOpen);
  const keymap = useAppStore((state) => state.keymap);
  const workflows = useAppStore((state) => state.workflows);
  const setPendingWorkflowRun = useAppStore((state) => state.setPendingWorkflowRun);
  // Availability inputs: `isAvailable` reads the store directly, so these keep
  // the list honest even when the palette is opened after a selection changed.
  const projectId = useAppStore((state) => state.activeProject?.id ?? null);
  const conflictPath = useAppStore((state) => state.conflictPath);
  const fileTarget = useAppStore(
    (state) => state.worktreeTarget?.path ?? state.selectedFilePath ?? null,
  );

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const entries = useMemo<PaletteEntry[]>(() => {
    const state = useAppStore.getState();
    const commandEntries = COMMANDS.filter(
      (command: CommandSpec) =>
        command.id !== "palette" && !command.hideInPalette && isAvailable(command, state),
    ).map((command) => ({
      id: `cmd:${command.id}`,
      group: t(COMMAND_GROUPS.find((group) => group.id === command.group)?.labelKey ?? "command.groupApp"),
      label: t(command.labelKey),
      keycap: formatBinding(keymap[command.id]),
      run: () => {
        setPaletteOpen(false);
        runCommand(command.id, useAppStore.getState());
      },
    }));

    const workflowEntries = workflows.map((workflow) => ({
      id: `wf:${workflow.id}`,
      group: t("command.groupWorkflows"),
      label: workflow.name,
      keycap: "",
      // Runs through the same confirmation the workflows pane uses.
      run: () => {
        setPaletteOpen(false);
        setPendingWorkflowRun(workflow.id);
      },
    }));

    return [...commandEntries, ...workflowEntries];
  }, [
    keymap,
    workflows,
    t,
    setPendingWorkflowRun,
    setPaletteOpen,
    open,
    projectId,
    conflictPath,
    fileTarget,
  ]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) =>
      `${entry.label} ${entry.group}`.toLowerCase().includes(needle),
    );
  }, [entries, query]);

  // A new result set starts at the top; keep the list scrolled with the cursor.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const container = listRef.current;
    const row = container?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, filtered.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPaletteOpen(false);
        return;
      }
      // The palette's own binding closes it again (⌘K toggles).
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(false);
        return;
      }
      if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
        event.preventDefault();
        setActiveIndex((index) => (filtered.length === 0 ? 0 : (index + 1) % filtered.length));
        return;
      }
      if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
        event.preventDefault();
        setActiveIndex((index) =>
          filtered.length === 0 ? 0 : (index - 1 + filtered.length) % filtered.length,
        );
        return;
      }
      if (event.key === "Enter") {
        const entry = filtered[activeIndex];
        if (!entry) return;
        event.preventDefault();
        entry.run();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, activeIndex, setPaletteOpen]);

  if (!open) return null;

  return createPortal(
    <div
      data-modal="true"
      className="animate-fade fixed inset-0 z-50 flex justify-center bg-black/25 px-4 pt-[14vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setPaletteOpen(false);
      }}
    >
      <div className="animate-in flex max-h-[62vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-line bg-raised shadow-float">
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
          <Search size={13} className="shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("command.palettePlaceholder")}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
          />
          <Keycap keys={["Esc"]} size="sm" />
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11.5px] text-ink-faint">
              {t("command.paletteEmpty")}
            </p>
          ) : (
            filtered.map((entry, index) => {
              const showGroup = index === 0 || filtered[index - 1].group !== entry.group;
              const active = index === activeIndex;
              return (
                <div key={entry.id}>
                  {showGroup ? (
                    <p className="px-3 pb-0.5 pt-2 text-[9.5px] font-semibold uppercase tracking-wide text-ink-faint">
                      {entry.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    data-index={index}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => entry.run()}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                      active ? "bg-accent-soft text-accent" : "text-ink hover:bg-ink/5"
                    }`}
                  >
                    {entry.id.startsWith("wf:") ? (
                      <WorkflowIcon size={11} className="shrink-0 text-ink-faint" />
                    ) : (
                      <CornerDownLeft
                        size={11}
                        className={`shrink-0 ${active ? "text-accent" : "text-ink-faint"}`}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{entry.label}</span>
                    {entry.keycap ? (
                      <Keycap keys={splitShortcutLabel(entry.keycap)} size="sm" />
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <p className="shrink-0 border-t border-line px-3 py-1.5 text-[10px] text-ink-faint">
          {t("command.paletteHint")}
        </p>
      </div>
    </div>,
    document.body,
  );
}