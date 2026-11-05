import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { CloudDownload, FolderOpen, Loader2 } from "lucide-react";

import { useT } from "../../i18n";
import { shortPath } from "../../lib/format";
import { repoNameFromUrl } from "../../lib/remoteName";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import Modal from "../common/Modal";

interface CloneRepoDialogProps {
  onClose: () => void;
}

/**
 * `git clone` entry point: remote address + where it lands.
 *
 * The destination is a *parent folder* plus one folder name, never a free-form
 * path — the backend rejects any name with a separator, so a clone can only ever
 * create one new directory inside the folder picked here.
 *
 * No switch to the new project happens on success: cloning while another repo is
 * open is a normal way to fetch something to look at later, so the sidebar row +
 * the toast are the whole feedback.
 */
export default function CloneRepoDialog({ onClose }: CloneRepoDialogProps) {
  const t = useT();
  const cloning = useSlice((state) => state.cloningProject);
  const cloneRepo = useAppStore((state) => state.cloneRepo);

  const [url, setUrl] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [name, setName] = useState("");
  /** Once the user edits the name, the URL must stop overwriting it. */
  const [nameTouched, setNameTouched] = useState(false);
  const [picking, setPicking] = useState(false);
  /** Message from the last submit attempt (field-level rules are inline below). */
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nameTouched) return;
    setName(repoNameFromUrl(url));
  }, [url, nameTouched]);

  const trimmedUrl = url.trim();
  const trimmedName = name.trim();
  const trimmedParent = parentDir.trim();

  const urlInvalid =
    trimmedUrl.length > 0 &&
    (trimmedUrl.startsWith("-") || /[\s\u0000-\u001f]/.test(trimmedUrl));
  const nameInvalid =
    trimmedName.length > 0 &&
    (trimmedName === "." ||
      trimmedName === ".." ||
      trimmedName.startsWith("-") ||
      /[/\\\u0000-\u001f]/.test(trimmedName));
  const canSubmit = !cloning && trimmedUrl !== "" && trimmedParent !== "" && trimmedName !== "";

  const shownError =
    error ??
    (urlInvalid
      ? t("projects.cloneUrlInvalid")
      : nameInvalid
        ? t("projects.cloneNameInvalid")
        : null);

  const chooseFolder = async () => {
    if (picking || cloning) return;
    setPicking(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("projects.cloneFolderTitle"),
      });
      if (typeof selected === "string") {
        setParentDir(selected);
        setError(null);
      }
    } catch {
      // A dismissed / refused sheet leaves the previous choice untouched.
    } finally {
      setPicking(false);
    }
  };

  const submit = async () => {
    if (cloning) return;
    // The same rules the backend enforces, surfaced before a git process runs.
    if (!trimmedUrl) {
      setError(t("store.cloneMissingUrl"));
      return;
    }
    if (urlInvalid) {
      setError(t("projects.cloneUrlInvalid"));
      return;
    }
    if (!trimmedParent) {
      setError(t("store.cloneMissingDir"));
      return;
    }
    if (!trimmedName) {
      setError(t("store.cloneMissingName"));
      return;
    }
    if (nameInvalid) {
      setError(t("projects.cloneNameInvalid"));
      return;
    }

    setError(null);
    // A failed clone keeps the dialog open with everything typed intact; git's
    // own error lands in the toast / alert dialog.
    const ok = await cloneRepo({ parentDir: trimmedParent, url: trimmedUrl, name: trimmedName });
    if (ok) onClose();
  };

  return (
    <Modal
      open
      title={t("projects.cloneTitle")}
      subtitle={t("projects.cloneSubtitle")}
      onClose={cloning ? () => undefined : onClose}
      width={520}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={cloning}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:cursor-default disabled:opacity-45"
          >
            {t("projects.cloneCancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit || urlInvalid || nameInvalid}
            aria-busy={cloning}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {cloning ? <Loader2 size={12} className="animate-spin" /> : <CloudDownload size={12} />}
            {cloning ? t("projects.cloneRunning") : t("projects.cloneStart")}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
            {t("projects.cloneUrlLabel")}
          </span>
          <input
            // The address is what this dialog is for: type it first, the folder
            // name and the destination are refinements.
            autoFocus
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            placeholder={t("projects.cloneUrlPlaceholder")}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            disabled={cloning}
            className={`w-full rounded-lg border bg-panel px-2.5 py-1.5 font-mono text-[11.5px] text-ink outline-none transition-colors placeholder:font-sans placeholder:text-ink-faint focus:border-accent/60 disabled:opacity-60 ${
              urlInvalid ? "border-negative/60" : "border-line"
            }`}
          />
        </label>

        <div>
          <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
            {t("projects.cloneLocationLabel")}
          </span>
          <div className="flex items-center gap-1.5">
            <span
              title={trimmedParent || undefined}
              className={`min-w-0 flex-1 truncate rounded-lg border bg-canvas/40 px-2.5 py-1.5 font-mono text-[11.5px] ${
                trimmedParent
                  ? "border-line text-ink"
                  : "border-dashed border-line-strong/70 text-ink-faint"
              }`}
            >
              {trimmedParent ? shortPath(trimmedParent) : t("projects.cloneTargetNone")}
            </span>
            <button
              type="button"
              onClick={() => void chooseFolder()}
              disabled={cloning || picking}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-default disabled:opacity-45"
            >
              {picking ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <FolderOpen size={12} />
              )}
              {t("projects.cloneChooseFolder")}
            </button>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
            {t("projects.cloneNameLabel")}
          </span>
          <input
            value={name}
            onChange={(event) => {
              setNameTouched(true);
              setName(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            placeholder={t("projects.cloneNamePlaceholder")}
            spellCheck={false}
            disabled={cloning}
            className={`w-full rounded-lg border bg-panel px-2.5 py-1.5 font-mono text-[11.5px] text-ink outline-none transition-colors placeholder:font-sans placeholder:text-ink-faint focus:border-accent/60 disabled:opacity-60 ${
              nameInvalid ? "border-negative/60" : "border-line"
            }`}
          />
        </label>

        <p className="break-all rounded-lg bg-canvas/40 px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-faint">
          {trimmedParent && trimmedName
            ? t("projects.cloneTarget", { path: `${shortPath(trimmedParent)}/${trimmedName}` })
            : t("projects.cloneHint")}
        </p>

        {shownError ? (
          <p className="rounded-lg border border-negative/30 bg-negative/8 px-2.5 py-1.5 text-[11px] leading-relaxed text-negative">
            {shownError}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}