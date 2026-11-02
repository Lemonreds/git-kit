import { useEffect, useRef } from "react";

import { useT } from "../../i18n";
import {
  attachTerminal,
  focusTerminal,
  setTerminalVisible,
} from "../../lib/terminal";
import { useAppStore } from "../../store/appStore";
import type { TerminalTab } from "../../store/slices/terminalSlice";

interface TerminalViewProps {
  tab: TerminalTab;
  /** Both conditions matter: the tab must be selected *and* the panel expanded. */
  active: boolean;
}

/**
 * One xterm instance pinned to a stable `<div>`.
 *
 * The component never unmounts while its tab exists — switching tabs toggles a
 * class. Remounting would recreate the host node and throw away the scroll buffer
 * (and, since `lib/terminal.ts` keys on the tab id, the element would have to be
 * moved anyway).
 */
export default function TerminalView({ tab, active }: TerminalViewProps) {
  const t = useT();
  const host = useRef<HTMLDivElement | null>(null);
  const markTerminalExit = useAppStore((state) => state.markTerminalExit);
  const notify = useAppStore((state) => state.notify);

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    let cancelled = false;

    void attachTerminal(tab.id, element, {
      path: tab.cwd,
      onExit: (code) => markTerminalExit(tab.id, code),
    }).catch((error: unknown) => {
      if (cancelled) return;
      notify("error", error instanceof Error ? error.message : t("terminal.openFailed"));
      // The tab points at a pty that does not exist; drop it instead of leaving
      // a black rectangle behind.
      useAppStore.getState().closeTerminal(tab.id);
    });

    return () => {
      cancelled = true;
    };
  }, [tab.id, tab.cwd, markTerminalExit, notify]);

  useEffect(() => {
    setTerminalVisible(tab.id, active);
    if (active) focusTerminal(tab.id);
  }, [tab.id, active]);

  return (
    <div
      ref={host}
      data-terminal={tab.id}
      className={active ? "h-full w-full px-2 pb-1" : "hidden"}
    />
  );
}