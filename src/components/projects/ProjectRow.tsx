import { AlertTriangle, FolderGit2, FolderSearch, Pin, PinOff, Trash2 } from "lucide-react";

import { shortPath } from "../../lib/format";
import type { Project } from "../../lib/types";
import IconButton from "../common/IconButton";

interface ProjectRowProps {
  project: Project;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRelink: () => void;
  onTogglePin: () => void;
}

export default function ProjectRow({
  project,
  active,
  onSelect,
  onRemove,
  onRelink,
  onTogglePin,
}: ProjectRowProps) {
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
                aria-label="已置顶"
              />
            ) : null}
            {unavailable ? (
              <AlertTriangle size={11} className="shrink-0 text-warning" aria-label="无法访问" />
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
            {unavailable ? project.statusHint ?? "无法访问该仓库" : shortPath(project.path)}
          </span>
        </span>
      </button>

      <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-raised/95 px-0.5 py-0.5 shadow-float group-hover:flex group-focus-within:flex">
        {unavailable ? (
          <IconButton label="重新选择文件夹" size="sm" onClick={onRelink}>
            <FolderSearch size={13} />
          </IconButton>
        ) : null}
        <IconButton
          label={pinned ? "取消置顶" : "置顶项目"}
          size="sm"
          onClick={onTogglePin}
          className={pinned ? "text-accent" : ""}
        >
          {pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </IconButton>
        <IconButton label="移除项目" size="sm" tone="danger" onClick={onRemove}>
          <Trash2 size={13} />
        </IconButton>
      </div>
    </div>
  );
}