import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Power, RefreshCw, ShieldAlert, Terminal, Trash2 } from "lucide-react";

import { useT } from "../../i18n";
import { api } from "../../lib/ipc";
import type { HookInfo } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import { errorMessage } from "../../store/shared";
import ConfirmDialog from "../common/ConfirmDialog";
import IconButton from "../common/IconButton";
import Modal from "../common/Modal";

interface EditorState {
  hook: HookInfo;
  content: string;
  enabled: boolean;
  loading: boolean;
  sample: boolean;
}

/**
 * `.git/hooks` management. The list is a read of the repository's own files; the
 * only thing that makes git run a hook is its executable bit, so "enable" is
 * exactly that and nothing else.
 */
export default function HooksPanel() {
  const t = useT();
  const { project, repoReady } = useSlice((state) => ({
    project: state.activeProject,
    repoReady: state.activeProject?.status === "ok",
  }));

  const notify = useAppStore((state) => state.notify);
  const showAlert = useAppStore((state) => state.showAlert);

  const [hooks, setHooks] = useState<HookInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HookInfo | null>(null);

  const repoPath = project?.path ?? null;

  const load = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      setHooks(await api.listGitHooks(repoPath));
    } catch (error) {
      showAlert(t("hooks.loadFailed"), errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [repoPath, t, showAlert]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (hook: HookInfo) => {
    if (!repoPath || busy) return;
    setBusy(hook.name);
    try {
      const next = await api.setGitHookEnabled(repoPath, hook.name, !hook.enabled);
      setHooks(next);
      notify("success", t(hook.enabled ? "hooks.disabledDone" : "hooks.enabledDone", { name: hook.name }));
    } catch (error) {
      showAlert(t("hooks.actionFailed"), errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const openEditor = async (hook: HookInfo) => {
    if (!repoPath) return;
    setEditor({ hook, content: "", enabled: hook.enabled || !hook.present, loading: true, sample: false });
    try {
      const content = await api.readGitHook(repoPath, hook.name);
      setEditor({
        hook,
        content,
        enabled: hook.enabled || !hook.present,
        loading: false,
        // An absent hook that has a template was read from `<name>.sample`.
        sample: !hook.present && hook.hasSample,
      });
    } catch (error) {
      setEditor(null);
      showAlert(t("hooks.loadFailed"), errorMessage(error));
    }
  };

  const save = async () => {
    if (!repoPath || !editor) return;
    setBusy(editor.hook.name);
    try {
      const next = await api.writeGitHook(repoPath, editor.hook.name, editor.content, editor.enabled);
      setHooks(next);
      notify("success", t("hooks.saved", { name: editor.hook.name }));
      setEditor(null);
    } catch (error) {
      showAlert(t("hooks.actionFailed"), errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (hook: HookInfo) => {
    if (!repoPath) return;
    setBusy(hook.name);
    try {
      setHooks(await api.deleteGitHook(repoPath, hook.name));
      notify("success", t("hooks.deleted", { name: hook.name }));
    } catch (error) {
      showAlert(t("hooks.actionFailed"), errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (!repoReady) {
    return (
      <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
        {t("hooks.repoMissing")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
            <Terminal size={13} className="text-ink-faint" />
            {t("hooks.title")}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{t("hooks.subtitle")}</p>
        </div>
        <IconButton label={t("common.refresh")} onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </IconButton>
      </div>

      <p className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/8 px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-soft">
        <ShieldAlert size={12} className="mt-px shrink-0 text-warning" />
        {t("hooks.warning")}
      </p>

      {hooks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11px] text-ink-faint">
          {loading ? t("hooks.loadFailed") : t("hooks.empty")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          {hooks.map((hook, index) => {
            const status = hook.enabled
              ? { label: t("hooks.enabled"), tone: "border-positive/40 bg-positive/10 text-positive" }
              : hook.present
                ? { label: t("hooks.disabled"), tone: "border-line text-ink-faint" }
                : hook.hasSample
                  ? { label: t("hooks.sample"), tone: "border-accent/35 bg-accent/8 text-accent" }
                  : { label: t("hooks.missing"), tone: "border-line text-ink-faint" };
            return (
              <div
                key={hook.name}
                className={`flex items-center gap-2 px-2.5 py-1.5 ${
                  index > 0 ? "border-t border-line/70" : ""
                }`}
              >
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink">
                  {hook.name}
                </code>
                <span className={`shrink-0 rounded border px-1 py-px text-[9.5px] ${status.tone}`}>
                  {status.label}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton
                    label={hook.enabled ? t("hooks.disable") : t("hooks.enable")}
                    size="sm"
                    active={hook.enabled}
                    disabled={!hook.present || busy !== null}
                    onClick={() => void toggle(hook)}
                  >
                    {busy === hook.name ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : hook.enabled ? (
                      <Check size={11} />
                    ) : (
                      <Power size={11} />
                    )}
                  </IconButton>
                  <IconButton
                    label={t("hooks.edit")}
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void openEditor(hook)}
                  >
                    <Pencil size={11} />
                  </IconButton>
                  <IconButton
                    label={t("hooks.delete")}
                    size="sm"
                    tone="danger"
                    disabled={!hook.present || busy !== null}
                    onClick={() => setPendingDelete(hook)}
                  >
                    <Trash2 size={11} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editor ? (
        <Modal
          open
          title={t("hooks.editorTitle")}
          subtitle={t("hooks.editorSubtitle", { name: editor.hook.name })}
          onClose={() => setEditor(null)}
          width={640}
          footer={
            <>
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy !== null}
                className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-45"
              >
                {t("common.save")}
              </button>
            </>
          }
        >
          {editor.loading ? (
            <p className="flex items-center gap-2 py-6 text-[11.5px] text-ink-faint">
              <Loader2 size={13} className="animate-spin" />
              {t("hooks.loadFailed")}
            </p>
          ) : (
            <div className="space-y-2">
              {editor.sample ? (
                <p className="text-[10.5px] text-accent">
                  {t("hooks.sampleHint", { name: editor.hook.name })}
                </p>
              ) : null}
              <textarea
                value={editor.content}
                onChange={(event) =>
                  setEditor((current) => (current ? { ...current, content: event.target.value } : current))
                }
                rows={14}
                spellCheck={false}
                placeholder={t("hooks.editorPlaceholder")}
                className="w-full resize-y rounded-lg border border-line bg-canvas px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
              />
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-1.5 text-[10.5px] text-ink-soft">
                  <span
                    className={`grid h-3 w-3 place-items-center rounded-[3px] border transition-colors ${
                      editor.enabled ? "border-accent bg-accent text-white" : "border-line-strong bg-panel"
                    }`}
                  >
                    {editor.enabled ? <Check size={8} strokeWidth={3} /> : null}
                  </span>
                  <input
                    type="checkbox"
                    checked={editor.enabled}
                    onChange={() =>
                      setEditor((current) =>
                        current ? { ...current, enabled: !current.enabled } : current,
                      )
                    }
                    className="sr-only"
                  />
                  {t("hooks.enableOnSave")}
                </label>
                {editor.content.trim() ? null : (
                  <button
                    type="button"
                    onClick={() =>
                      setEditor((current) =>
                        current ? { ...current, content: t("hooks.template") } : current,
                      )
                    }
                    className="rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    {t("hooks.useTemplate")}
                  </button>
                )}
              </div>
            </div>
          )}
        </Modal>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("hooks.deleteTitle", { name: pendingDelete?.name ?? "" })}
        description={t("hooks.deleteDescription")}
        confirmLabel={t("common.delete")}
        tone="danger"
        onConfirm={() => {
          const hook = pendingDelete;
          setPendingDelete(null);
          if (hook) void remove(hook);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}