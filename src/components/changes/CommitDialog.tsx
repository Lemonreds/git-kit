import { useState } from "react";
import { AlertTriangle, Check, GitCommitHorizontal, Loader2 } from "lucide-react";

import { api } from "../../lib/ipc";
import { statusMeta } from "../../lib/format";
import type { HeadCommitPreview, WorktreeEntry } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import HelpTip from "../common/HelpTip";
import Modal from "../common/Modal";

interface CommitDialogProps {
  staged: WorktreeEntry[];
  branch: string | null;
  conflictedCount: number;
  onClose: () => void;
}

const TONE_CLASS: Record<string, string> = {
  positive: "bg-positive/12 text-positive",
  negative: "bg-negative/12 text-negative",
  accent: "bg-accent/12 text-accent",
  warning: "bg-warning/14 text-warning",
  neutral: "bg-ink/8 text-ink-faint",
};

export default function CommitDialog({
  staged,
  branch,
  conflictedCount,
  onClose,
}: CommitDialogProps) {
  const project = useAppStore((state) => state.activeProject);
  const commitStaged = useAppStore((state) => state.commitStaged);
  const amendCommit = useAppStore((state) => state.amendCommit);
  const notify = useAppStore((state) => state.notify);

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [amend, setAmend] = useState(false);
  const [amendPreview, setAmendPreview] = useState<HeadCommitPreview | null>(null);
  const [amendError, setAmendError] = useState<string | null>(null);

  const trimmed = message.trim();
  const valid =
    trimmed.length > 0 && conflictedCount === 0 && (amend ? true : staged.length > 0);

  const toggleAmend = async () => {
    if (busy) return;
    if (amend) {
      setAmend(false);
      setAmendPreview(null);
      return;
    }
    setAmend(true);
    setAmendError(null);
    if (!project) return;
    try {
      const preview = await api.headCommitPreview(project.path);
      setAmendPreview(preview);
      setMessage(preview.message);
    } catch (reason) {
      setAmendError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    if (amend) {
      const outcome = await amendCommit(trimmed);
      setBusy(false);
      if (!outcome.ok) return;
      if (outcome.needsForcePush) {
        notify("info", "该提交已推送过，修正后需要强制推送");
      }
      onClose();
      return;
    }
    const ok = await commitStaged(trimmed);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      title={amend ? "修正上一次提交" : "提交已暂存的改动"}
      subtitle={
        amend
          ? `${branch ?? "当前分支"} · 替换最新提交${amendPreview ? ` ${amendPreview.shortSha}` : ""}`
          : `${branch ?? "当前分支"} · ${staged.length} 个文件`
      }
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
            disabled={!valid || busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {busy ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <GitCommitHorizontal size={12} />
            )}
            {amend ? "修正提交" : "提交"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-line bg-canvas/40 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => void toggleAmend()}
            disabled={busy}
            className="flex items-center gap-2 text-left"
          >
            <span
              className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors ${
                amend ? "border-accent bg-accent text-white" : "border-line-strong bg-panel"
              }`}
            >
              {amend ? <Check size={9} strokeWidth={3} /> : null}
            </span>
            <span className="text-[11.5px] text-ink">修正上一次提交（amend）</span>
          </button>
          <span className="shrink-0 text-[10px] text-ink-faint">
            {amendPreview
              ? `${amendPreview.filesChanged} 个文件${amendPreview.pushed ? " · 已推送" : ""}`
              : ""}
          </span>
        </div>

        {amendError ? (
          <p className="whitespace-pre-line rounded-lg border border-negative/30 bg-negative/8 px-3 py-2 font-mono text-[10px] text-negative">
            {amendError}
          </p>
        ) : null}

        {amend && amendPreview?.pushed ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-warning/35 bg-warning/8 px-2.5 py-1.5 text-[10.5px] leading-relaxed text-ink-soft">
            <AlertTriangle size={11} className="mt-0.5 shrink-0 text-warning" />
            该提交已经推送过，修正后远程会拒绝普通推送，需要强制推送。
          </p>
        ) : null}

        {conflictedCount > 0 ? (
          <p className="rounded-lg border border-negative/30 bg-negative/8 px-3 py-2 text-[11.5px] leading-relaxed text-negative">
            还有 {conflictedCount} 个冲突文件未解决，需先解决冲突并暂存后才能提交。
          </p>
        ) : null}

        <div>
          <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
            将提交的文件
            <span className="font-normal text-[10.5px] text-ink-faint">{staged.length} 个</span>
          </p>
          <div className="max-h-[148px] overflow-y-auto rounded-lg border border-line">
            {staged.map((entry) => {
              const meta = statusMeta(entry.staged ?? "modified");
              return (
                <div
                  key={entry.path}
                  className="flex items-center gap-2 border-b border-line/60 px-2.5 py-1 last:border-b-0"
                >
                  <span
                    className={`grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] text-[9px] font-bold ${TONE_CLASS[meta.tone]}`}
                  >
                    {meta.letter}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-soft">
                    {entry.oldPath ? (
                      <>
                        <span className="text-ink-faint line-through decoration-ink-faint/40">
                          {entry.oldPath}
                        </span>
                        <span className="mx-1 text-ink-faint">→</span>
                        {entry.path}
                      </>
                    ) : (
                      entry.path
                    )}
                  </span>
                  <span className="shrink-0 text-[9.5px] text-ink-faint">{meta.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
            提交信息
            <HelpTip label="只提交暂存区（git commit，不带 -a），复用你的 hooks 与身份配置；为避免无终端时签名提示卡住，不启用 GPG 签名。⌘↵ 快速提交。" />
          </span>
          <textarea
            autoFocus
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            rows={4}
            placeholder={"feat: 简短说明这次改动\n\n可选：补充原因或影响范围"}
            spellCheck={false}
            className="w-full resize-y rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-[11.5px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
          />
        </label>
      </div>
    </Modal>
  );
}