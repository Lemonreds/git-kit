import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Tag, Trash2, Upload } from "lucide-react";

import { useAppStore } from "../../store/appStore";
import ConfirmDialog from "../common/ConfirmDialog";
import IconButton from "../common/IconButton";
import Modal from "../common/Modal";
import ShaChip from "../common/ShaChip";

interface TagDialogProps {
  /** Target for a new tag: a sha (commit detail) or a branch name (default HEAD). */
  defaultTarget?: string;
  onClose: () => void;
}

export default function TagDialog({ defaultTarget, onClose }: TagDialogProps) {
  const tags = useAppStore((state) => state.tags);
  const refreshTags = useAppStore((state) => state.refreshTags);
  const createTag = useAppStore((state) => state.createTag);
  const deleteTag = useAppStore((state) => state.deleteTag);
  const pushTag = useAppStore((state) => state.pushTag);
  const activeProject = useAppStore((state) => state.activeProject);

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState(defaultTarget ?? "HEAD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteRemote, setDeleteRemote] = useState(false);
  const [pushing, setPushing] = useState<string | null>(null);

  useEffect(() => {
    void refreshTags();
  }, [refreshTags]);

  const submit = async () => {
    if (busy || !name.trim() || !target.trim()) return;
    setBusy(true);
    setError(null);
    const failure = await createTag(name.trim(), target.trim(), message.trim());
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setName("");
    setMessage("");
  };

  return (
    <>
      <Modal
        open
        title="标签"
        subtitle={activeProject ? activeProject.name : "当前仓库的标签"}
        onClose={onClose}
        width={560}
        footer={
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            关闭
          </button>
        }
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
              已有标签
              <span className="font-normal text-[10.5px] text-ink-faint">{tags.length} 个</span>
            </p>
            {tags.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-[11px] text-ink-faint">
                还没有标签
              </p>
            ) : (
              <div className="max-h-[200px] overflow-y-auto rounded-lg border border-line">
                {tags.map((tag) => (
                  <div
                    key={tag.name}
                    className="flex items-center gap-2 border-b border-line/70 px-2.5 py-1.5 last:border-b-0"
                  >
                    <Tag size={12} className="shrink-0 text-ink-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-[11.5px] font-medium text-ink">
                          {tag.name}
                        </span>
                        {tag.annotated ? (
                          <span className="shrink-0 rounded border border-line px-1 py-px text-[9px] text-ink-faint">
                            附注
                          </span>
                        ) : null}
                        <ShaChip sha={tag.sha} plain className="text-[10px]" />
                      </p>
                      {tag.message ? (
                        <p className="mt-0.5 truncate text-[10px] text-ink-faint">{tag.message}</p>
                      ) : null}
                    </div>
                    <IconButton
                      label="推送该标签到远程"
                      size="sm"
                      onClick={() => {
                        setPushing(tag.name);
                        void pushTag(tag.name).finally(() => setPushing(null));
                      }}
                    >
                      {pushing === tag.name ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Upload size={11} />
                      )}
                    </IconButton>
                    <IconButton
                      label="删除标签"
                      size="sm"
                      tone="danger"
                      onClick={() => {
                        setDeleteRemote(false);
                        setPendingDelete(tag.name);
                      }}
                    >
                      <Trash2 size={11} />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line bg-canvas/40 p-2.5">
            <p className="mb-1.5 flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
              <Plus size={11} />
              新建标签
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] text-ink-faint">标签名</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="v1.0.0"
                  spellCheck={false}
                  className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-ink-faint">目标（分支 / 提交）</span>
                <input
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder="HEAD"
                  spellCheck={false}
                  className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
                />
              </label>
            </div>
            <label className="mt-2 block">
              <span className="mb-1 block text-[10px] text-ink-faint">说明（填写则创建附注标签）</span>
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                placeholder="例如：生产发布 2026-10-29"
                className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
              />
            </label>
            <div className="mt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !name.trim() || !target.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                创建标签
              </button>
            </div>
            {error ? (
              <p className="mt-2 whitespace-pre-line rounded-md border border-negative/30 bg-negative/8 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-negative">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`删除标签 ${pendingDelete ?? ""}？`}
        description={
          deleteRemote
            ? "本地标签会先删除，随后执行 git push origin --delete 删除 origin 上的同名标签；远程标签删除后无法从远程恢复。"
            : "只删除本地标签，origin 上的同名标签不受影响。"
        }
        confirmLabel="删除"
        tone="danger"
        onConfirm={() => {
          const target2 = pendingDelete;
          const alsoRemote = deleteRemote;
          setPendingDelete(null);
          if (target2) void deleteTag(target2, alsoRemote);
        }}
        onCancel={() => setPendingDelete(null)}
      >
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-negative/25 bg-negative/6 px-2.5 py-2">
          <span
            className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors ${
              deleteRemote ? "border-negative bg-negative text-white" : "border-line-strong bg-panel"
            }`}
          >
            {deleteRemote ? <Check size={9} strokeWidth={3} /> : null}
          </span>
          <input
            type="checkbox"
            checked={deleteRemote}
            onChange={() => setDeleteRemote((value) => !value)}
            className="sr-only"
          />
          <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-ink">
            同时删除 origin 上的同名标签
            <span className="mt-0.5 block text-[10.5px] text-ink-faint">
              默认不勾选；勾选后远程标签一并删除，且无法在远程恢复。
            </span>
          </span>
        </label>
      </ConfirmDialog>
    </>
  );
}