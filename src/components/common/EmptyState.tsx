import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-canvas text-ink-faint">
        <Icon size={18} strokeWidth={1.6} />
      </span>
      <div>
        <p className="text-[13px] font-medium text-ink">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-[320px] text-[11.5px] leading-relaxed text-ink-faint">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}