import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";

import { api } from "../../lib/ipc";
import { relativeTime } from "../../lib/format";
import type { BranchSummary, CommitSummary } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import HelpTip from "../common/HelpTip";
import Modal from "../common/Modal";
import ShaChip from "../common/ShaChip";

interface CherryPickDialogProps {
  branch: BranchSummary;
  onClose: () => void;
}

export default function CherryPickDialog({ branch, onClose }: CherryPickDialogProps) {
  const project = useAppStore((state) => state.activeProject);
  const branches = useAppStore((state) => state.branches);
  const cherryPick = useAppStore((state) => state.cherryPick);

  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = useMemo(
    () => branches.filter((item) => !item.isRemote && item.name !== branch.name),
    [branches, branch.name],
  );

  useEffect(() => {
    if (!project) return;
    const preferred =
      targets.find((item) => item.name === "test") ??
      targets.find((item) => item.name === "master") ??
      targets.find((item) => item.name === "main") ??
      targets[0];
    if (preferred) {
      setTarget(preferred.name);
      setQuery(preferred.name);
    }
  }, [project, targets]);

  useEffect(() => {
    if (!project) return undefined;
    let cancelled = false;
    setLoading(true);

    api
      .listCommits(project.path, branch.refName, 0, 30)
      .then((page) => {
        if (cancelled) return;
        setCommits(page.commits);
        setSelected(page.commits.length > 0 ? [page.commits[0].sha] : []);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project, branch.refName]);

  const filteredTargets = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return targets;
    return targets.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [targets, query]);

  const toggle = (sha: string) => {
    setSelected((current) =>
      current.includes(sha) ? current.filter((value) => value !== sha) : [...current, sha],
    );
  };

  const submit = async () => {
    if (busy || !target || selected.length === 0) return;
    setBusy(true);
    const ok = await cherryPick(branch.name, target, selected);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      title="挑选提交到其他分支"
      subtitle={`从 ${branch.name} 挑选提交，使用 cherry-pick 应用到目标分支`}
      onClose={busy ? () => undefined : onClose}
      width={520}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !target || selected.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : null}
            cherry-pick {selected.length} 个提交
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        {error ? (
          <p className="rounded-lg border border-negative/30 bg-negative/8 px-3 py-2 text-[11.5px] text-negative">
            {error}
          </p>
        ) : null}

        <div>
          <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
            选择提交
            <span className="font-normal text-[10.5px] text-ink-faint">
              已选 {selected.length} 个 · 默认最新一条
            </span>
          </p>
          <div className="max-h-[196px] overflow-y-auto rounded-lg border border-line">
            {loading ? (
              <p className="flex items-center gap-2 px-3 py-3 text-[11.5px] text-ink-faint">
                <Loader2 size={12} className="animate-spin" />
                正在读取提交…
              </p>
            ) : commits.length === 0 ? (
              <p className="px-3 py-3 text-[11.5px] text-ink-faint">该分支还没有提交</p>
            ) : (
              commits.map((commit) => {
                const checked = selected.includes(commit.sha);
                return (
                  <label
                    key={commit.sha}
                    className="flex cursor-pointer items-start gap-2 px-2.5 py-1.5 transition-colors hover:bg-ink/5"
                  >
                    <span
                      className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors ${
                        checked ? "border-accent bg-accent text-white" : "border-line-strong bg-panel"
                      }`}
                    >
                      {checked ? <Check size={9} strokeWidth={3} /> : null}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(commit.sha)}
                      className="sr-only"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-ink">{commit.summary}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-faint">
                        <ShaChip sha={commit.sha} plain />
                        <span>·</span>
                        <span className="truncate">{commit.authorName}</span>
                        <span>·</span>
                        <span>{relativeTime(commit.committedAt)}</span>
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div>
          <p className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
            目标分支
            <HelpTip label="执行时会切换到目标分支并停留在该分支；若冲突，仓库会停在 cherry-pick 状态，需要手动解决后 git cherry-pick --continue（或 --abort）。" />
            <span className="ml-auto font-normal text-[10.5px] text-ink-faint">默认优先 test / 主分支</span>
          </p>
          <label className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1.5 transition-colors focus-within:border-accent/60">
            <Search size={12} className="shrink-0 text-ink-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索分支"
              className="w-full bg-transparent font-mono text-[11.5px] text-ink outline-none placeholder:text-ink-faint"
            />
          </label>
          <div className="mt-1 max-h-[104px] overflow-y-auto rounded-lg border border-line">
            {filteredTargets.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-ink-faint">没有匹配的分支</p>
            ) : (
              filteredTargets.map((item) => (
                <button
                  key={item.refName}
                  type="button"
                  onClick={() => {
                    setTarget(item.name);
                    setQuery(item.name);
                  }}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[11.5px] transition-colors ${
                    target === item.name
                      ? "bg-accent-soft text-accent"
                      : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.isHead ? (
                    <span className="shrink-0 text-[9px] text-ink-faint">当前分支</span>
                  ) : null}
                  {target === item.name ? <Check size={11} className="shrink-0" /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}