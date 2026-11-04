import type { Binding } from "../../lib/keymap";
import { bindingKeyLabels } from "../../lib/keymap";

interface KeycapProps {
  /** Rendered as one cap per key, in the order the binding applies. */
  binding?: Binding | null;
  /** Pre-split labels, for callers that only kept the formatted string. */
  keys?: string[];
  size?: "sm" | "md";
  /** `muted` for hints (tooltip, palette), `strong` for the binding editor. */
  tone?: "muted" | "strong";
  className?: string;
}

const SIZES = {
  sm: "h-[17px] min-w-[16px] px-1 text-[10.5px]",
  md: "h-[21px] min-w-[20px] px-1.5 text-[11.5px]",
} as const;

const TONES = {
  muted: "border-line bg-canvas/80 text-ink-faint",
  strong: "border-line-strong bg-panel text-ink-soft",
} as const;

/**
 * Keyboard shortcut rendered as one small cap per key (⌘ ⇧ K instead of
 * "⌘⇧K"). One shared component so the settings editor, the palette and the
 * tooltips all show the same, legible size.
 */
export default function Keycap({
  binding,
  keys,
  size = "sm",
  tone = "muted",
  className = "",
}: KeycapProps) {
  const labels = keys ?? bindingKeyLabels(binding ?? null);
  if (labels.length === 0) return null;

  return (
    <span className={`inline-flex shrink-0 items-center gap-[3px] ${className}`}>
      {labels.map((label, index) => (
        <kbd
          key={`${label}-${index}`}
          className={`inline-flex items-center justify-center rounded-[5px] border font-sans font-medium leading-none tracking-tight ${SIZES[size]} ${TONES[tone]}`}
        >
          {label}
        </kbd>
      ))}
    </span>
  );
}