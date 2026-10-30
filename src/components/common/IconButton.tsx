import type { ButtonHTMLAttributes, ReactNode } from "react";

import { tip } from "./Tooltip";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** Rendered as a keycap inside the tooltip, e.g. `⌘R`. */
  shortcut?: string;
  children: ReactNode;
  tone?: "default" | "danger";
  active?: boolean;
  size?: "sm" | "md";
}

export default function IconButton({
  label,
  shortcut,
  children,
  tone = "default",
  active = false,
  size = "md",
  className = "",
  type = "button",
  ...rest
}: IconButtonProps) {
  const toneClass =
    tone === "danger"
      ? "text-ink-soft hover:bg-negative/10 hover:text-negative"
      : "text-ink-soft hover:bg-ink/8 hover:text-ink";
  const sizeClass = size === "sm" ? "h-6 w-6" : "h-7 w-7";

  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active}
      {...tip(label, shortcut)}
      className={`inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-35 ${
        active ? "bg-accent-soft text-accent" : toneClass
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}