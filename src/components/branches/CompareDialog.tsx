import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { api } from "../../lib/ipc";
import type { BranchSummary, ComparePreview, FileChange, FileDiff } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import Modal from "../common/Modal";
import BaseBranchPicker from "./BaseBranchPicker";
import CommitMiniList from "./CommitMiniList";

interface CompareDialogProps {
  /** Branch the dialog was opened from (used as `head` by default). */
  branch: BranchSummary;
  onClose: () => void;
}

function pickMain(branches: BranchSummary[], exclude: string): string {
  const others = branches.filter((branch) => branch.refName !== exclude);
  const local = (name: string) => others.find((branch) => !branch.isRemote && branch.name === name);
  return (
    local("master")?.refName ??
    local("main")?.refName ??
    others.find((branch) => branch.isRemote && branch.shortName === "master")?.refName ??
    others.find((branch) => branch.isRemote && branch.shortName === "main")?.refName ??
    others[0]?.refName ??
    ""
  );
}

export default function CompareDialog({ branch, onClose }: CompareDialogProps) {
  const project = useAppStore((state) => state.activeProject);
  const branches = useAppStore((state) => state.branches);
  const remoteBranches = useAppStore((state) => state.remoteBranches);

  const allBranches = useMemo(
    () => [
      ...branches,
      ...remoteBranches.filter(
        (remote) => !branches.some((local) => local.refName === remote.refName),
      ),
    ],
    [branches, remoteBranches],
  );

  const [baseRef, setBaseRef] = useState(() => pickMain(allBranches, branch.refName));
  const [headRef, setHeadRef] = useState(branch.refName);
  const [preview, setPreview] = useState<ComparePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileChange | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const load = useCallback(async () => {
    if (!project || !baseRef || !headRef) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setDiff(null);
    try {
      setPreview(await api.compareRefs(project.path, baseRef, headRef));
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [project, baseRef, headRef]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFile = async (file: FileChange) => {
    if (!project) return;
    setSelected(file);
    setDiffLoading(true);
    setDiff(null);
    try {
      setDiff(await api.compareFileDiff(project.path, baseRef, headRef, file.path, file.oldPath));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDiffLoading(false);
    }
  };

  const baseBranch = allBranches.find((item) => item.refName === baseRef);
  const headBranch = allBranches.find((item) => item.refName === headRef);

  return (
    <Modal
      open
      title="分支对比"
      subtitle={`${baseBranch?.name ?? "基线"} → ${headBranch?.name ?? "对比分支"}`}
      onClose={onClose}
      width={760}
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
      <div
        className="flex flex-col gap-2.5"
        style={{ height: "clamp(420px, calc(100vh - 280px), 560px)" }}
      >
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-[10.5px] text-ink-faint">基线</p>
            <BaseBranchPicker
              branches={allBranches}
              value={baseRef}
              onChange={setBaseRef}
              placeholder={baseBranch?.name ?? "基线"}
              maxHeight={104}
            />
          </div>
          <div>
            <p className="mb-1 text-[10.5px] text-ink-faint">对比分支</p>
            <BaseBranchPicker
              branches={allBranches}
              value={headRef}
              onChange={setHeadRef}
              placeholder={headBranch?.name ?? "对比分支"}
              maxHeight={104}
            />
          </div>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 py-2 text-[11.5px] text-ink-faint">
            <Loader2 size={12} className="animate-spin" />
            正在比对…
          </p>
        ) : error ? (
          <p className="whitespace-pre-line rounded-lg border border-negative/30 bg-negative/8 px-3 py-2 font-mono text-[10.5px] text-negative">
            {error}
          </p>
        ) : preview ? (
          <>
            <p className="shrink-0 font-mono text-[10.5px] text-ink-faint">
              {preview.commitCount} 个提交 · {preview.files.length} 个文件
              <span className="ml-2 text-positive">+{preview.additions}</span>
              <span className="ml-1 text-negative">−{preview.deletions}</span>
            </p>

            <div className="min-h-0 flex-[0_0_auto] overflow-y-auto rounded-lg border border-line" style={{ maxHeight: 120 }}>
              <CommitMiniList
                commits={preview.commits}
                emptyLabel="两个分支没有差异"
                maxHeight={118}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-line">
              {preview.files.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-ink-faint">没有文件差异</p>
              ) : (
                preview.files.map((file) => (
                  <button
                    key={`${file.oldPath ?? ""}:${file.path}`}
                    type="button"
                    onClick={() => void openFile(file)}
                    className={`flex w-full items-center gap-2 border-b border-line/60 px-2.5 py-1 text-left last:border-b-0 ${
                      selected?.path === file.path ? "bg-accent-soft" : "hover:bg-ink/5"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft">
                      {file.path}
                    </span>
                    <span className="shrink-0 font-mono text-[9.5px] text-positive">+{file.additions}</span>
                    <span className="shrink-0 font-mono text-[9.5px] text-negative">−{file.deletions}</span>
                  </button>
                ))
              )}
            </div>

            {selected ? (
              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-panel">
                {diffLoading ? (
                  <p className="flex items-center gap-2 px-3 py-2 text-[11px] text-ink-faint">
                    <Loader2 size={11} className="animate-spin" />
                    正在读取改动…
                  </p>
                ) : diff ? (
                  <CompareDiff diff={diff} />
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

/** Minimal unified diff body (no search / mode toggle needed here). */
function CompareDiff({ diff }: { diff: FileDiff }) {
  if (diff.isBinary) {
    return <p className="px-3 py-2 text-[11px] text-ink-faint">二进制文件，无法按行展示</p>;
  }
  return (
    <pre className="m-0 whitespace-pre px-3 py-2 font-mono text-[11px] leading-[1.55]">
      {diff.patch.split("\n").map((line, index) => {
        const tone = line.startsWith("+")
          ? "text-positive"
          : line.startsWith("-")
            ? "text-negative"
            : line.startsWith("@@")
              ? "text-accent"
              : "text-ink-soft";
        return (
          <span key={index} className={`block ${tone}`}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}
