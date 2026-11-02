import { useCallback, useEffect, useState } from "react";

import { useT } from "../../i18n";
import { clamp } from "../../lib/format";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import { TERMINAL_HEIGHT } from "../../store/slices/terminalSlice";
import DiffPanel from "../diff/DiffPanel";
import ProjectSidebar from "../projects/ProjectSidebar";
import AlertDialog from "../common/AlertDialog";
import Toast from "../common/Toast";
import TooltipLayer from "../common/Tooltip";
import TerminalPanel from "../terminal/TerminalPanel";
import WorkspacePanel from "../workspace/WorkspacePanel";
import TitleBar from "./TitleBar";

const LEFT = { min: 216, max: 380, initial: 264 };
const MIDDLE = { min: 320, max: 620, initial: 404 };
/** The terminal never eats more than this share of the window. */
const TERMINAL_MAX_RATIO = 0.62;

function readWidth(key: string, fallback: number, min: number, max: number): number {
  const raw = Number(localStorage.getItem(key));
  return Number.isFinite(raw) && raw > 0 ? clamp(raw, min, max) : fallback;
}

function terminalLimit(): number {
  return Math.min(TERMINAL_HEIGHT.max, Math.round(window.innerHeight * TERMINAL_MAX_RATIO));
}

export default function AppShell() {
  const [left, setLeft] = useState(() => readWidth("gk.left", LEFT.initial, LEFT.min, LEFT.max));
  const [middle, setMiddle] = useState(() =>
    readWidth("gk.middle", MIDDLE.initial, MIDDLE.min, MIDDLE.max),
  );

  const { terminalCount, terminalOpen, terminalHeight } = useSlice((state) => ({
    terminalCount: state.terminals.length,
    terminalOpen: state.terminalOpen,
    terminalHeight: state.terminalHeight,
  }));
  const setTerminalHeight = useAppStore((state) => state.setTerminalHeight);

  useEffect(() => {
    localStorage.setItem("gk.left", String(left));
  }, [left]);

  useEffect(() => {
    localStorage.setItem("gk.middle", String(middle));
  }, [middle]);

  const beginDrag = useCallback(
    (side: "left" | "middle") => (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = side === "left" ? left : middle;

      const onMove = (move: PointerEvent) => {
        const delta = move.clientX - startX;
        if (side === "left") {
          setLeft(clamp(startWidth + delta, LEFT.min, LEFT.max));
        } else {
          setMiddle(clamp(startWidth + delta, MIDDLE.min, MIDDLE.max));
        }
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.classList.remove("select-none", "cursor-col-resize");
      };

      document.body.classList.add("select-none", "cursor-col-resize");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [left, middle],
  );

  /** Terminal splitter: dragging *up* makes the panel taller. */
  const beginTerminalDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = clamp(terminalHeight, TERMINAL_HEIGHT.min, terminalLimit());
      const limit = terminalLimit();

      const onMove = (move: PointerEvent) => {
        setTerminalHeight(clamp(startHeight + (startY - move.clientY), TERMINAL_HEIGHT.min, limit));
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.classList.remove("select-none", "cursor-row-resize");
      };

      document.body.classList.add("select-none", "cursor-row-resize");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [terminalHeight, setTerminalHeight],
  );

  const hasTerminals = terminalCount > 0;
  const showTerminal = hasTerminals && terminalOpen;
  const height = clamp(terminalHeight, TERMINAL_HEIGHT.min, terminalLimit());

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <TitleBar />
      <div
        className="relative grid min-h-0 flex-1 overflow-hidden"
        style={{
          gridTemplateColumns: `${left}px 6px ${middle}px 6px minmax(0, 1fr)`,
          gridTemplateRows: showTerminal
            ? `minmax(0, 1fr) 6px ${height}px`
            : "minmax(0, 1fr)",
        }}
      >
        {/* The sidebar spans every row: the terminal panel owns columns 3-6
            only, so opening it must not shorten the project column (its version
            footer would jump up). */}
        <div style={{ gridColumn: 1, gridRow: "1 / -1" }} className="min-h-0 min-w-0">
          <ProjectSidebar />
        </div>
        <Splitter style={{ gridColumn: 2, gridRow: "1 / -1" }} onPointerDown={beginDrag("left")} />
        <WorkspacePanel />
        <Splitter onPointerDown={beginDrag("middle")} />
        <DiffPanel />

        {/* Middle + diff columns only: the project sidebar stays full height. */}
        {hasTerminals ? (
          <>
            {showTerminal ? (
              <Splitter
                horizontal
                style={{ gridColumn: "3 / 6", gridRow: 2 }}
                onPointerDown={beginTerminalDrag}
              />
            ) : null}
            <div
              style={{ gridColumn: "3 / 6", gridRow: showTerminal ? 3 : 2 }}
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <TerminalPanel />
            </div>
          </>
        ) : null}

        <Toast />
        <AlertDialog />
        <TooltipLayer />
      </div>
    </div>
  );
}

function Splitter({
  onPointerDown,
  horizontal = false,
  style,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  horizontal?: boolean;
  style?: React.CSSProperties;
}) {
  const t = useT();

  return (
    <div
      role="separator"
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-label={horizontal ? t("layout.resizeTerminal") : t("layout.resizePanel")}
      onPointerDown={onPointerDown}
      style={style}
      className={`relative z-10 bg-canvas transition-colors hover:bg-accent/25 ${
        horizontal ? "cursor-row-resize" : "cursor-col-resize"
      }`}
    >
      <span
        className={
          horizontal ? "absolute inset-x-0 -top-1.5 -bottom-1.5" : "absolute inset-y-0 -left-1.5 -right-1.5"
        }
      />
    </div>
  );
}