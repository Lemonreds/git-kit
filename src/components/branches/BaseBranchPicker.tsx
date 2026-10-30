import { useMemo, useState } from "react";
import { Check, Cloud, GitBranch, Search } from "lucide-react";

import type { BranchSummary } from "../../lib/types";

interface BaseBranchPickerProps {
  /** Local + already-loaded remote branches. */
  branches: BranchSummary[];
  /** Selected `refName`. */
  value: string;
  onChange: (refName: string) => void;
  /** Hide the branch being based (a branch can not be its own base). */
  excludeRefName?: string;
  /** Shown in the search box when the query is empty. */
  placeholder: string;
  maxHeight?: number;
}

/** Searchable branch list used by 新建分支 and rebase 的基线选择。 */
export default function BaseBranchPicker({
  branches,
  value,
  onChange,
  excludeRefName,
  placeholder,
  maxHeight = 140,
}: BaseBranchPickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const pool = excludeRefName
      ? branches.filter((branch) => branch.refName !== excludeRefName)
      : branches;
    const list = keyword
      ? pool.filter((branch) => branch.name.toLowerCase().includes(keyword))
      : pool;
    return {
      local: list.filter((branch) => !branch.isRemote),
      remote: list.filter((branch) => branch.isRemote),
    };
  }, [branches, excludeRefName, query]);

  const select = (refName: string) => {
    onChange(refName);
    setQuery("");
  };

  return (
    <div className="rounded-lg border border-line">
      <label className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
        <Search size={12} className="shrink-0 text-ink-faint" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className="w-full bg-transparent font-mono text-[11.5px] text-ink outline-none placeholder:text-ink-faint"
        />
      </label>
      <div className="overflow-y-auto" style={{ maxHeight }}>
        {filtered.local.length === 0 && filtered.remote.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-ink-faint">没有匹配的分支</p>
        ) : null}

        {filtered.local.map((branch) => (
          <BaseRow
            key={branch.refName}
            branch={branch}
            active={value === branch.refName}
            onSelect={() => select(branch.refName)}
          />
        ))}

        {filtered.remote.length > 0 ? (
          <p className="border-y border-line bg-canvas/50 px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            远程分支（已加载）
          </p>
        ) : null}
        {filtered.remote.map((branch) => (
          <BaseRow
            key={branch.refName}
            branch={branch}
            active={value === branch.refName}
            onSelect={() => select(branch.refName)}
          />
        ))}
      </div>
    </div>
  );
}

function BaseRow({
  branch,
  active,
  onSelect,
}: {
  branch: BranchSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[11.5px] transition-colors ${
        active ? "bg-accent-soft text-accent" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
      }`}
    >
      {branch.isRemote ? (
        <Cloud size={11} className="shrink-0 text-ink-faint" />
      ) : (
        <GitBranch size={11} className="shrink-0 text-ink-faint" />
      )}
      <span className="min-w-0 flex-1 truncate">{branch.name}</span>
      {branch.isHead ? <span className="shrink-0 text-[9px] text-ink-faint">当前分支</span> : null}
      {active ? <Check size={11} className="shrink-0" /> : null}
    </button>
  );
}