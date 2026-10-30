import { useCallback, useEffect, useState } from "react";

import { clamp } from "../../lib/format";
import DiffPanel from "../diff/DiffPanel";
import ProjectSidebar from "../projects/ProjectSidebar";
import AlertDialog from "../common/AlertDialog";
import Toast from "../common/Toast";
import TooltipLayer from "../common/Tooltip";
import WorkspacePanel from "../workspace/WorkspacePanel";
import TitleBar from "./TitleBar";

const LEFT = { min: 216, max: 380, initial: 264 };
const MIDDLE = { min: 320, max: 620, initial: 404 };

function readWidth(key: string, fallback: number, min: number, max: number): number {
  const raw = Number(localStorage.getItem(key));
  return Number.isFinite(raw) && raw > 0 ? clamp(raw, min, max) : fallback;
}

export default function AppShell() {
  const [left, setLeft] = useState(() => readWidth("gk.left", LEFT.initial, LEFT.min, LEFT.max));
  const [middle, setMiddle] = useState(() =>
    readWidth("gk.middle", MIDDLE.initial, MIDDLE.min, MIDDLE.max),
  );

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

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <TitleBar />
      <div
        className="relative grid min-h-0 flex-1 overflow-hidden"
        style={{
          gridTemplateColumns: `${left}px 6px ${middle}px 6px minmax(0, 1fr)`,
          gridTemplateRows: "minmax(0, 1fr)",
        }}
      >
        <ProjectSidebar />
        <Splitter onPointerDown={beginDrag("left")} />
        <WorkspacePanel />
        <Splitter onPointerDown={beginDrag("middle")} />
        <DiffPanel />
        <Toast />
        <AlertDialog />
        <TooltipLayer />
      </div>
    </div>
  );
}

function Splitter({
  onPointerDown,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调整面板宽度"
      onPointerDown={onPointerDown}
      className="relative z-10 cursor-col-resize bg-canvas transition-colors hover:bg-accent/25"
    >
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}