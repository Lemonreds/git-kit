import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  FolderGit2,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import { api } from "../../lib/ipc";
import { copyText, shortPath } from "../../lib/format";
import type { Project, RemoteInfo } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import ConfirmDialog from "../common/ConfirmDialog";
import HelpTip from "../common/HelpTip";
import IconButton from "../common/IconButton";
import { tip } from "../common/Tooltip";

const inputClass =
  "w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60";
const monoInputClass = `${inputClass} font-mono`;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function RemotesPanel() {
  const projects = useAppStore((state) => state.projects);
  const activeProject = useAppStore((state) => state.activeProject);
  const notify = useAppStore((state) => state.notify);
  const refreshBranches = useAppStore((state) => state.refreshBranches);
  const remoteLoaded = useAppStore((state) => state.remoteLoaded);
  const loadRemoteBranches = useAppStore((state) => state.loadRemoteBranches);

  // Which repository this panel edits. Defaults to the window's selected
  // project and follows it when that selection changes.
  const [targetId, setTargetId] = useState(activeProject?.id ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (activeProject) setTargetId(activeProject.id);
  }, [activeProject?.id]);

  const target = useMemo<Project | null>(
    () => projects.find((project) => project.id === targetId) ?? activeProject,
    [projects, targetId, activeProject],
  );
  const isActiveTarget = Boolean(target && target.id === activeProject?.id);
  const targetPath = target?.path ?? "";
  const targetReady = target?.status === "ok";

  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("origin");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<RemoteInfo | null>(null);

  const load = useCallback(async () => {
    if (!targetPath || !targetReady) {
      setRemotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setRemotes(await api.listRemotes(targetPath));
    } catch (error) {
      setRemotes([]);
      setLoadError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }, [targetPath, targetReady]);

  useEffect(() => {
    void load();
    setFormError(null);
    setName("");
    setUrl("");
  }, [load]);

  // Suggest `origin` only while it is still free.
  useEffect(() => {
    if (loading) return;
    setName((current) => {
      if (current.trim()) return current;
      return remotes.some((remote) => remote.name === "origin") ? "" : "origin";
    });
  }, [loading, remotes]);

  // Only the window's active project has branches/snapshot to refresh.
  const syncWindow = async () => {
    if (!isActiveTarget) return;
    await refreshBranches();
    if (remoteLoaded) await loadRemoteBranches();
  };

  const submit = async () => {
    if (busy || !target || !targetReady || !name.trim() || !url.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      const created = await api.addRemote(target.path, name.trim(), url.trim());
      await load();
      await syncWindow();
      notify("success", `已添加远程仓库 ${created.name}`);
      setName("");
      setUrl("");
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async (remote: RemoteInfo) => {
    if (!target) return;
    setPendingRemove(null);
    try {
      const result = await api.removeRemote(target.path, remote.name);
      await load();
      await syncWindow();
      const detail =
        result.removedTracking > 0 ? `，同时清理了 ${result.removedTracking} 个远程跟踪分支` : "";
      notify("success", `已删除远程仓库 ${result.name}${detail}`);
    } catch (error) {
      setFormError(messageOf(error));
    }
  };

  const copy = async (value: string) => {
    const ok = await copyText(value);
    notify(ok ? "success" : "error", ok ? "已复制" : "复制失败");
  };

  return (
    <div className="space-y-3">
      {/* Repository being edited */}
      <div className="relative flex items-center gap-2 rounded-lg border border-line bg-canvas/40 px-2.5 py-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-panel text-ink-faint">
          <FolderGit2 size={12} />
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          aria-expanded={pickerOpen}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[12px] font-medium text-ink">
                {target?.name ?? "未选择仓库"}
              </span>
              {isActiveTarget ? (
                <span className="shrink-0 rounded border border-accent/35 bg-accent-soft px-1 py-px text-[9px] font-medium text-accent">
                  当前选中
                </span>
              ) : null}
            </span>
            <span
              {...tip(target?.path ?? "")}
              className="mt-0.5 block truncate font-mono text-[10px] text-ink-faint"
            >
              {target ? shortPath(target.path) : "—"}
            </span>
          </span>
          <ChevronDown
            size={12}
            className={`shrink-0 text-ink-faint transition-transform ${pickerOpen ? "rotate-180" : ""}`}
          />
        </button>
        {target ? (
          <IconButton label="复制仓库路径" size="sm" onClick={() => void copy(target.path)}>
            <Copy size={12} />
          </IconButton>
        ) : null}

        {pickerOpen ? (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setPickerOpen(false)}
              className="fixed inset-0 z-30 cursor-default"
            />
            <div className="animate-pop absolute left-2 right-2 top-[52px] z-40 overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-float">
              <div className="max-h-52 overflow-y-auto">
                {projects.map((project) => {
                  const selected = project.id === target?.id;
                  const disabled = project.status !== "ok";
                  return (
                    <button
                      key={project.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setTargetId(project.id);
                        setPickerOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors disabled:cursor-default disabled:opacity-45 ${
                        selected ? "bg-accent-soft" : "hover:bg-ink/5"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-[11.5px] font-medium ${
                            selected ? "text-accent" : "text-ink"
                          }`}
                        >
                          {project.name}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[9.5px] text-ink-faint">
                          {disabled ? project.statusHint ?? "无法访问" : shortPath(project.path)}
                        </span>
                      </span>
                      {project.id === activeProject?.id ? (
                        <span className="shrink-0 text-[9px] text-ink-faint">窗口当前</span>
                      ) : null}
                      {selected ? <Check size={11} className="shrink-0 text-accent" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11.5px] font-medium text-ink-soft">远程地址</p>
        <span className="text-[10.5px] text-ink-faint">{remotes.length} 个</span>
      </div>

      {!targetReady ? (
        <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-[10.5px] leading-relaxed text-ink-soft">
          该仓库当前不可读，无法修改远程配置。
        </p>
      ) : loading ? (
        <p className="flex items-center gap-2 py-3 text-[11.5px] text-ink-faint">
          <Loader2 size={12} className="animate-spin" />
          正在读取远程仓库…
        </p>
      ) : loadError ? (
        <p className="whitespace-pre-line rounded-lg border border-negative/30 bg-negative/8 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-negative">
          {loadError}
        </p>
      ) : remotes.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong/70 bg-canvas/40 px-3 py-3">
          <Cloud size={14} className="shrink-0 text-ink-faint" />
          <p className="text-[11.5px] font-medium text-ink">还没有远程仓库</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          {remotes.map((remote) => (
            <div
              key={remote.name}
              className="flex items-center gap-2 border-b border-line/70 px-2.5 py-2 last:border-b-0"
            >
              <Cloud size={13} className="shrink-0 text-ink-faint" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[11.5px] font-medium text-ink">
                    {remote.name}
                  </span>
                  {remote.isOrigin ? (
                    <span className="shrink-0 rounded bg-accent-soft px-1 py-px text-[9px] font-medium text-accent">
                      默认远程
                    </span>
                  ) : null}
                  <span className="shrink-0 rounded border border-line px-1 py-px text-[9px] text-ink-faint">
                    跟踪 {remote.trackingBranches}
                  </span>
                </p>
                <p
                  {...tip(remote.pushUrl ? `fetch: ${remote.url}\npush: ${remote.pushUrl}` : remote.url)}
                  className="mt-0.5 truncate font-mono text-[10.5px] text-ink-faint"
                >
                  {remote.host ? <span className="text-ink-soft">{remote.host}</span> : remote.url}
                  {remote.host ? <span className="ml-1.5">{remote.url}</span> : null}
                </p>
              </div>
              <IconButton label="复制远程地址" size="sm" onClick={() => void copy(remote.url)}>
                <Copy size={12} />
              </IconButton>
              <IconButton
                label="删除远程仓库"
                size="sm"
                tone="danger"
                onClick={() => setPendingRemove(remote)}
              >
                <Trash2 size={12} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-line bg-canvas/40 p-2.5">
        <p className="mb-1.5 flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
          <Plus size={11} />
          添加远程仓库
          <HelpTip label="支持 HTTPS、SSH 与 git@host:org/repo.git 形式。只校验名称格式与重名，不联网验证可达性；推送 / 拉取时才会真正访问。" />
        </p>
        <div className="flex items-start gap-2">
          <label className="w-[104px] shrink-0">
            <span className="mb-1 block text-[10px] text-ink-faint">名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="origin"
              spellCheck={false}
              disabled={!targetReady}
              className={`${monoInputClass} ${formError ? "border-negative/40" : ""}`}
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[10px] text-ink-faint">地址</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
              placeholder="git@github.com:org/repo.git"
              spellCheck={false}
              disabled={!targetReady}
              className={`${monoInputClass} ${formError ? "border-negative/40" : ""}`}
            />
          </label>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !targetReady || !name.trim() || !url.trim()}
            className="mt-[18px] inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            添加
          </button>
        </div>

        {formError ? (
          <p className="mt-2 flex items-start gap-1 whitespace-pre-line rounded-md border border-negative/30 bg-negative/8 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-negative">
            <AlertTriangle size={10.5} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{formError}</span>
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`删除远程仓库 ${pendingRemove?.name ?? ""}？`}
        description={`会同时删除 refs/remotes/${pendingRemove?.name ?? ""}/* 下 ${
          pendingRemove?.trackingBranches ?? 0
        } 个跟踪分支；本地分支与服务器不受影响，原跟踪它的分支需重新指定远程。`}
        confirmLabel="删除远程仓库"
        tone="danger"
        onConfirm={() => {
          if (pendingRemove) void confirmRemove(pendingRemove);
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}