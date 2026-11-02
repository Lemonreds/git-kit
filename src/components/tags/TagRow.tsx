import { Cloud, CloudOff, Copy, Loader2, Tag, Trash2, Upload } from "lucide-react";

import { useT } from "../../i18n";
import { relativeTime, timeTooltip } from "../../lib/format";
import type { TagInfo } from "../../lib/types";
import IconButton from "../common/IconButton";
import ShaChip from "../common/ShaChip";
import { tip } from "../common/Tooltip";

/** Where the tag stands relative to the last remote read. */
export type TagRemoteState = "pushed" | "unpushed" | "unknown";

interface TagRowProps {
  tag: TagInfo;
  remote: TagRemoteState;
  /** False when the repository has no remote: pushing is not an option. */
  canPush: boolean;
  /** Label of the operation in flight on this row (push / delete). */
  busy: string | null;
  /** Just created in this session: highlights the row for a few seconds. */
  fresh: boolean;
  onOpen: () => void;
  onPush: () => void;
  onDelete: () => void;
  onCopy: () => void;
}

/**
 * One tag. Clicking the row opens the commit history of the tag (the same list a
 * branch opens); the hover strip carries the three write actions.
 */
export default function TagRow({
  tag,
  remote,
  canPush,
  busy,
  fresh,
  onOpen,
  onPush,
  onDelete,
  onCopy,
}: TagRowProps) {
  const t = useT();
  const stamp = tag.commitTime ?? tag.createdAt;

  const remoteBadge =
    remote === "pushed" ? (
      <span {...tip(t("tags.pushedTip"))} className="shrink-0 text-positive">
        <Cloud size={10} strokeWidth={2.2} />
      </span>
    ) : remote === "unpushed" ? (
      <span {...tip(t("tags.unpushed"))} className="shrink-0 text-warning">
        <CloudOff size={10} strokeWidth={2.2} />
      </span>
    ) : null;

  return (
    <div
      className={`group relative flex items-start rounded-lg transition-colors ${
        fresh ? "bg-accent/6" : "hover:bg-ink/5"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        title={t("tags.viewCommits")}
        className="flex min-w-0 flex-1 items-start gap-2.5 px-2 py-2 text-left"
      >
        <span
          {...tip(tag.annotated ? t("tags.annotated") : t("tags.lightweight"))}
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${
            tag.annotated
              ? "bg-accent/12 text-accent"
              : "border border-dashed border-line-strong bg-transparent text-ink-soft"
          }`}
        >
          <Tag size={12} strokeWidth={2} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-[12px] font-medium text-ink">{tag.name}</span>
            <span className="shrink-0 rounded border border-line px-1 py-px text-[9px] font-medium text-ink-faint">
              {tag.annotated ? t("tags.annotated") : t("tags.lightweight")}
            </span>
            {fresh ? (
              <span className="shrink-0 rounded bg-accent px-1 py-px text-[9px] font-semibold tracking-wide text-white">
                {t("tags.new")}
              </span>
            ) : null}
            {remoteBadge}
          </span>

          {tag.message ? (
            <span className="mt-0.5 block truncate text-[10.5px] text-ink-faint">{tag.message}</span>
          ) : null}

          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-soft">
            <ShaChip sha={tag.sha} className="px-1 py-px" />
            <span className="truncate">{tag.commitSummary ?? t("tags.noSummary")}</span>
          </span>
        </span>
      </button>

      {stamp ? (
        <span
          {...tip(timeTooltip(stamp))}
          className="shrink-0 pr-2 pt-2 text-[10.5px] text-ink-faint transition-opacity group-hover:opacity-0"
        >
          {relativeTime(stamp)}
        </span>
      ) : null}

      {busy ? (
        <span
          className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-raised/95 px-1.5 py-1 text-[10px] text-ink-faint shadow-float"
        >
          <Loader2 size={11} className="animate-spin" />
          {busy}
        </span>
      ) : (
        <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-raised/95 px-0.5 py-0.5 shadow-float group-hover:flex group-focus-within:flex">
          <IconButton label={t("tags.push")} size="sm" disabled={!canPush} onClick={onPush}>
            <Upload size={12} />
          </IconButton>
          <IconButton label={t("tags.copyName")} size="sm" onClick={onCopy}>
            <Copy size={12} />
          </IconButton>
          <IconButton label={t("tags.delete")} size="sm" tone="danger" onClick={onDelete}>
            <Trash2 size={12} />
          </IconButton>
        </div>
      )}
    </div>
  );
}