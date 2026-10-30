import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { avatarHue, initials, relativeTime, timeTooltip } from "../../lib/format";
import type { CommitSummary } from "../../lib/types";
import ShaChip from "../common/ShaChip";
import { tip } from "../common/Tooltip";

interface CommitRowProps {
  commit: CommitSummary;
  active: boolean;
  onSelect: () => void;
}

export default function CommitRow({ commit, active, onSelect }: CommitRowProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={`flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${
        active ? "bg-accent-soft" : "hover:bg-ink/5"
      }`}
    >
      <span
        className="avatar mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
        style={{ "--avatar-hue": avatarHue(commit.authorEmail) } as CSSProperties}
      >
        {initials(commit.authorName)}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`line-clamp-2 text-[12.5px] leading-snug ${
            active ? "font-medium text-ink" : "text-ink"
          }`}
        >
          {commit.summary}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[10.5px] text-ink-faint">
          <span className="max-w-[40%] truncate">{commit.authorName}</span>
          <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-ink-faint/60" />
          <span className="shrink-0" {...tip(timeTooltip(commit.committedAt))}>
            {relativeTime(commit.committedAt)}
          </span>
        </span>
      </span>

      <ShaChip sha={commit.sha} active={active} className="px-1.5 py-0.5" />
    </button>
  );
}