import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

interface DiffSearchProps {
  value: string;
  onChange: (value: string) => void;
  count: number;
  active: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/** In-diff find bar: highlights matches and jumps between them. */
export default function DiffSearch({
  value,
  onChange,
  count,
  active,
  onPrev,
  onNext,
  onClose,
}: DiffSearchProps) {
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const hasQuery = value.trim().length > 0;

  return (
    <div className="animate-pop absolute right-3 top-2 z-20 flex items-center gap-1 rounded-lg border border-line bg-raised/95 py-1 pl-2 pr-1 shadow-float backdrop-blur">
      <Search size={11.5} className="shrink-0 text-ink-faint" />
      <input
        ref={input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrev();
            else onNext();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder="在改动中查找"
        spellCheck={false}
        className="w-[168px] bg-transparent font-mono text-[11.5px] text-ink outline-none placeholder:font-sans placeholder:text-ink-faint"
      />

      <span
        className={`shrink-0 px-1 font-mono text-[10px] ${
          hasQuery && count === 0 ? "text-negative" : "text-ink-faint"
        }`}
      >
        {hasQuery ? `${count === 0 ? 0 : active + 1}/${count}` : ""}
      </span>

      <button
        type="button"
        aria-label="上一个匹配"
        onClick={onPrev}
        disabled={count === 0}
        className="grid h-5 w-5 place-items-center rounded text-ink-faint transition-colors hover:bg-ink/8 hover:text-ink disabled:opacity-35"
      >
        <ChevronUp size={12} />
      </button>
      <button
        type="button"
        aria-label="下一个匹配"
        onClick={onNext}
        disabled={count === 0}
        className="grid h-5 w-5 place-items-center rounded text-ink-faint transition-colors hover:bg-ink/8 hover:text-ink disabled:opacity-35"
      >
        <ChevronDown size={12} />
      </button>
      <button
        type="button"
        aria-label="关闭查找"
        onClick={onClose}
        className="grid h-5 w-5 place-items-center rounded text-ink-faint transition-colors hover:bg-ink/8 hover:text-ink"
      >
        <X size={11} />
      </button>
    </div>
  );
}