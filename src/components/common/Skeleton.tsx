export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-1 px-2 py-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-2.5 rounded-lg px-2 py-2.5">
          <span className="h-6 w-6 shrink-0 rounded-md bg-ink/8" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block h-2.5 w-2/5 rounded bg-ink/10" />
            <span className="block h-2 w-3/5 rounded bg-ink/6" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink/8 ${className}`} />;
}