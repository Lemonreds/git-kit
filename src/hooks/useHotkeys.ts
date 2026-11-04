import { useEffect } from "react";

import { COMMANDS, isAvailable, runCommand } from "../lib/commands";
import { matchesBinding } from "../lib/keymap";
import { useAppStore } from "../store/appStore";

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

/**
 * Global shortcuts. The bindings come from `prefsSlice.keymap`, so the settings
 * pane can rebind anything at runtime without this hook re-registering: every
 * keydown reads the current map instead of capturing it.
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const store = useAppStore.getState();

      // A dialog owns the keyboard while it is open (Esc closes it, arrows move
      // inside lists) — the panel shortcuts must not fire underneath. Dialog
      // components handle their own keys, including the command palette.
      if (document.querySelector('[data-modal="true"]')) return;

      const typing = isTypingTarget(event.target);
      for (const command of COMMANDS) {
        const binding = store.keymap[command.id];
        if (!binding || !matchesBinding(event, binding)) continue;
        // Owned by a component (the in-diff finder); it matches its own keys.
        if (command.handledLocally) continue;
        // A bare-key binding must not steal keystrokes from a text field.
        if (!binding.mod && !binding.alt && typing) return;
        if (!isAvailable(command, store)) continue;
        if (runCommand(command.id, store)) {
          event.preventDefault();
          return;
        }
      }

      if (typing) return;

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