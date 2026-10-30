import { CircleHelp } from "lucide-react";

import { tip } from "./Tooltip";

interface HelpTipProps {
  /** Full explanation shown in the tooltip. */
  label: string;
  className?: string;
}

/**
 * Small “?” affordance for explanations that would otherwise be a paragraph of
 * text in the UI. Uses the shared TooltipLayer, so it behaves like every other
 * hover hint (fast, keyboard focusable, auto-flipping).
 */
export default function HelpTip({ label, className = "" }: HelpTipProps) {
  return (
    <span
      role="img"
      aria-label={label}
      tabIndex={0}
      {...tip(label)}
      className={`inline-flex h-3.5 w-3.5 shrink-0 cursor-default items-center justify-center rounded-full text-ink-faint transition-colors hover:text-ink-soft focus-visible:text-ink-soft ${className}`}
    >
      <CircleHelp size={11} strokeWidth={2} />
    </span>
  );
}