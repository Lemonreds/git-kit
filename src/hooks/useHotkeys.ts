import { useEffect } from "react";

import { t } from "../i18n";
import { useAppStore } from "../store/appStore";
import { countUnresolved } from "../store/slices/conflictSlice";

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.isContentEditable
  );
}

/** Global shortcuts. Kept in one place so panels stay free of listeners. */
export function useHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const store = useAppStore.getState();
      const withMeta = event.metaKey || event.ctrlKey;

      // A dialog owns the keyboard while it is open (Esc closes it, arrows move
      // inside lists) — the panel shortcuts must not fire underneath.
      if (document.querySelector('[data-modal="true"]')) return;

      if (withMeta && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void store.addProject();
        return;
      }

      if (withMeta && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void store.refresh();
        return;
      }

      // Deliberately above the typing guard: ⌘J must also work while the
      // keystrokes are going into the terminal's own textarea.
      if (withMeta && event.key.toLowerCase() === "j") {
        event.preventDefault();
        store.toggleTerminalPanel();
        return;
      }

      // ⌘⇧T: tags pane. Also above the guard so it works from the search box.
      if (withMeta && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        store.openTags();
        return;
      }

      // ⌘S in the conflict resolver: write the resolution and stage the file.
      if (withMeta && !event.shiftKey && event.key.toLowerCase() === "s") {
        if (!store.conflictPath) return;
        event.preventDefault();
        if (store.conflictSaving || !store.conflictParsed) return;
        const unresolved = countUnresolved(store.conflictParsed, store.conflictDrafts);
        if (unresolved > 0) {
          store.notify(
            "info",
            t("store.conflictUnresolvedFirst", { count: unresolved }),
          );
          return;
        }
        void store.saveConflict();
        return;
      }

      // ⌘⇧H / ⌘⇧B: history / blame of the file the diff column is showing.
      if (withMeta && event.shiftKey && (event.key.toLowerCase() === "h" || event.key.toLowerCase() === "b")) {
        const blame = event.key.toLowerCase() === "b";
        const target = store.worktreeTarget;
        const path = target?.path ?? store.selectedFilePath;
        if (!path) return;
        const rev = target ? null : store.selectedCommitSha;
        event.preventDefault();
        void store.openFileHistory(path, rev).then(() => {
          if (blame) store.setFileHistoryTab("blame");
        });
        return;
      }

      if (isTypingTarget(event.target)) return;

      if (event.key === "Escape") {
        // The resolver / file history take over the column: Esc steps out of
        // them first, without touching the pane behind.
        if (store.conflictPath) {
          if (Object.keys(store.conflictDrafts).length === 0) {
            event.preventDefault();
            store.closeConflict();
          }
          return;
        }
        if (store.fileView) {
          event.preventDefault();
          store.closeFileView();
          return;
        }
        if (store.pane !== "branches") {
          event.preventDefault();
          store.backToBranches();
        }
        return;
      }

      if (store.pane !== "commits") return;

      // Back to the branch/tag list: ← or X (the pane's own back affordance).
      // Deliberately before the commit navigation below.
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "x") {
        event.preventDefault();
        store.backToBranches();
        return;
      }

      if (store.commits.length === 0) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const current = store.commits.findIndex((commit) => commit.sha === store.selectedCommitSha);
        const nextIndex =
          event.key === "ArrowDown"
            ? Math.min((current < 0 ? -1 : current) + 1, store.commits.length - 1)
            : Math.max((current < 0 ? store.commits.length : current) - 1, 0);
        const next = store.commits[nextIndex];
        if (next && next.sha !== store.selectedCommitSha) {
          void store.selectCommit(next.sha);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}