import { useEffect } from "react";

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

      if (isTypingTarget(event.target)) return;

      if (event.key === "Escape") {
        if (store.pane !== "branches") {
          event.preventDefault();
          store.backToBranches();
        }
        return;
      }

      if (store.pane !== "commits" || store.commits.length === 0) return;

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