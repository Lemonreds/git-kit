import {
  AlertTriangle,
  FolderGit2,
  FolderSearch,
  Pin,
  PinOff,
  SquareTerminal,
  Trash2,
} from "lucide-react";

import { useT } from "../../i18n";
import { shortPath } from "../../lib/format";
import type { Project } from "../../lib/types";
import IconButton from "../common/IconButton";

interface ProjectRowProps {
  project: Project;
  active: boolean;
  /** A live shell (or panel tab) exists for this repository. */
  terminalOpen: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRelink: () => void;
  onTogglePin: () => void;
  onOpenTerminal: () => void;
}

export default function ProjectRow({
  project,
  active,
  terminalOpen,
  onSelect,
  onRemove,
  onRelink,
  onTogglePin,
  onOpenTerminal,
}: ProjectRowProps) {
  const t = useT();
  const unavailable = project.status !== "ok";
  const pinned = project.pinned;

  return (
    <div
      className={`group relative flex items-center rounded-lg transition-colors ${
        active ? "bg-accent-soft" : pinned ? "bg-accent-soft/45 hover:bg-accent-soft/70" : "hover:bg-ink/5"
      }`}
    >
      {/* Pinned rows always carry the rail, so the state is visible without hover. */}
      {active || pinned ? (
        <span
          aria-hidden
          className={`absolute inset-y-1.5 left-0 w-[2px] rounded-full ${
            active ? "bg-accent" : "bg-accent/45"
          }`}
        />
      ) : null}

      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left"
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors ${
            active
              ? "bg-accent text-white"
              : pinned
                ? "bg-panel text-accent"
                : "bg-canvas text-ink-soft"
          }`}
        >
          <FolderGit2 size={14} strokeWidth={1.9} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span
              className={`truncate text-[12.5px] font-medium ${
                active ? "text-ink" : pinned ? "text-ink" : "text-ink-soft"
              }`}
            >
              {project.name}
            </span>
            {pinned ? (
              <Pin
                size={10}
                strokeWidth={2.2}
                className="shrink-0 fill-current text-accent"
                aria-label={t("projects.pinned")}
              />
            ) : null}
            {unavailable ? (
              <AlertTriangle
                size={11}
                className="shrink-0 text-warning"
                aria-label={t("projects.unavailable")}
              />
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
            {unavailable
              ? project.statusHint ?? t("projects.unavailableHint")
              : shortPath(project.path)}
          </span>
        </span>
      </button>

      <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-raised/95 px-0.5 py-0.5 shadow-float group-hover:flex group-focus-within:flex">
        {unavailable ? (
          <IconButton label={t("projects.relink")} size="sm" onClick={onRelink}>
            <FolderSearch size={13} />
          </IconButton>
        ) : (
          <IconButton
            label={t("projects.openTerminal")}
            size="sm"
            active={terminalOpen}
            onClick={onOpenTerminal}
          >
            <SquareTerminal size={13} />
          </IconButton>
        )}
        <IconButton
          label={pinned ? t("projects.unpin") : t("projects.pin")}
          size="sm"
          onClick={onTogglePin}
          className={pinned ? "text-accent" : ""}
        >
          {pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </IconButton>
        <IconButton label={t("projects.remove")} size="sm" tone="danger" onClick={onRemove}>
          <Trash2 size={13} />
        </IconButton>
      </div>
    </div>
  );
}