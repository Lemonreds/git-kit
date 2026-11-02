import type { KeyboardEvent, MouseEvent } from "react";

import { useT } from "../../i18n";
import { copyText } from "../../lib/format";
import { useAppStore } from "../../store/appStore";

interface ShaChipProps {
  /** Full commit id — this is what gets copied. */
  sha: string;
  /** Displayed text; defaults to the first 7 characters. */
  label?: string;
  /** Highlighted state (selected commit row). */
  active?: boolean;
  /** Plain text instead of the mono chip background. */
  plain?: boolean;
  className?: string;
}

/**
 * Commit id chip: click (or Enter / Space) copies the full SHA. Rendered as a
 * span so it can live inside a row button without nesting interactive elements;
 * the click never bubbles to the row.
 */
export default function ShaChip({
  sha,
  label,
  active = false,
  plain = false,
  className = "",
}: ShaChipProps) {
  const t = useT();
  const notify = useAppStore((state) => state.notify);
  const text = label ?? sha.slice(0, 7);

  const copy = async (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const ok = await copyText(sha);
    notify(
      ok ? "success" : "error",
      ok ? t("common.shaCopied", { sha: sha.slice(0, 7) }) : t("common.copyFailed"),
    );
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={t("common.copySha", { sha })}
      onClick={(event) => void copy(event)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") void copy(event);
      }}
      className={`inline-flex shrink-0 cursor-pointer items-center font-mono transition-colors ${
        plain
          ? "rounded px-0.5 hover:bg-accent-soft hover:text-accent"
          : `rounded px-1 py-px text-[9.5px] ${
              active
                ? "bg-accent/12 text-accent"
                : "bg-canvas text-ink-faint hover:bg-accent-soft hover:text-accent"
            }`
      } ${className}`}
    >
      {text}
    </span>
  );
}