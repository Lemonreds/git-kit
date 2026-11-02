import { ChevronDown, Eraser, Plus, SquareTerminal, X } from "lucide-react";

import { useT } from "../../i18n";
import { clearTerminal } from "../../lib/terminal";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import IconButton from "../common/IconButton";
import { tip } from "../common/Tooltip";
import TerminalView from "./TerminalView";

/**
 * Bottom panel: one tab per live shell, spanning the middle and diff columns.
 *
 * The panel keeps its `<div>`s mounted while collapsed (`hidden` + a 0-height
 * grid row). That is deliberate: unmounting would lose every scroll buffer, and
 * re-spawning the shells is exactly the memory churn this feature is meant to
 * avoid. Collapsing only pauses the byte stream (see `lib/terminal.ts`).
 */
export default function TerminalPanel() {
  const t = useT();
  const { terminals, activeTerminalId, terminalOpen, activeProject } = useSlice((state) => ({
    terminals: state.terminals,
    activeTerminalId: state.activeTerminalId,
    terminalOpen: state.terminalOpen,
    activeProject: state.activeProject,
  }));

  const activateTerminal = useAppStore((state) => state.activateTerminal);
  const closeTerminal = useAppStore((state) => state.closeTerminal);
  const setTerminalOpen = useAppStore((state) => state.setTerminalOpen);
  const openTerminal = useAppStore((state) => state.openTerminal);

  const active = terminals.find((tab) => tab.id === activeTerminalId) ?? null;
  const canOpenCurrent = activeProject?.status === "ok";

  return (
    <section
      aria-label={t("terminal.panel")}
      className={`flex h-full min-h-0 flex-col overflow-hidden border-t border-line/70 bg-panel ${
        terminalOpen ? "" : "hidden"
      }`}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line/60 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {terminals.map((tab) => {
            const selected = tab.id === activeTerminalId;
            return (
              <div
                key={tab.id}
                className={`group flex shrink-0 items-center rounded-md transition-colors ${
                  selected ? "bg-accent-soft" : "hover:bg-ink/5"
                }`}
              >
                <button
                  type="button"
                  onClick={() => activateTerminal(tab.id)}
                  aria-pressed={selected}
                  {...tip(`${tab.projectName} — ${tab.cwd}`)}
                  className="flex min-w-0 items-center gap-1.5 py-[3px] pl-2 pr-1"
                >
                  <SquareTerminal
                    size={11}
                    className={selected ? "shrink-0 text-accent" : "shrink-0 text-ink-faint"}
                  />
                  <span
                    className={`max-w-[160px] truncate text-[11.5px] font-medium ${
                      selected ? "text-accent" : "text-ink-soft"
                    }`}
                  >
                    {tab.projectName}
                  </span>
                  {tab.status === "exited" ? (
                    <span
                      className="shrink-0 rounded-full bg-warning/14 px-1 text-[9px] font-semibold text-warning"
                      {...tip(
                        tab.exitCode === null
                          ? t("terminal.exitedTip")
                          : t("terminal.exitedTipWithCode", { code: tab.exitCode }),
                      )}
                    >
                      {t("terminal.exited")}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  aria-label={t("terminal.closeTab", { name: tab.projectName })}
                  onClick={() => closeTerminal(tab.id)}
                  className="mr-1 grid h-4 w-4 shrink-0 place-items-center rounded text-ink-faint opacity-0 transition-opacity hover:bg-ink/10 hover:text-negative group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            label={t("terminal.openInCurrent")}
            size="sm"
            disabled={!canOpenCurrent}
            onClick={() => activeProject && openTerminal(activeProject.id)}
          >
            <Plus size={13} />
          </IconButton>
          <IconButton
            label={t("terminal.clear")}
            size="sm"
            disabled={!active || active.status !== "live"}
            onClick={() => active && clearTerminal(active.id)}
          >
            <Eraser size={13} />
          </IconButton>
          <IconButton label={t("terminal.collapse")} size="sm" onClick={() => setTerminalOpen(false)}>
            <ChevronDown size={13} />
          </IconButton>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-panel pt-1">
        {terminals.map((tab) => (
          <TerminalView
            key={tab.id}
            tab={tab}
            active={terminalOpen && tab.id === activeTerminalId}
          />
        ))}
      </div>
    </section>
  );
}