import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import Modal from "../common/Modal";

interface CreateTagDialogProps {
  /** Pre-filled target: the current branch, or the branch row the pane came from. */
  defaultTarget?: string;
  /** Called with the created name, right before `onClose`. */
  onCreated?: (name: string) => void;
  onClose: () => void;
}

/**
 * Create form of the tags pane. Lives in a dialog so the pane itself stays a
 * list: the form is used a few times per release, the list is always on screen.
 */
export default function CreateTagDialog({ defaultTarget, onCreated, onClose }: CreateTagDialogProps) {
  const t = useT();
  const createTag = useAppStore((state) => state.createTag);

  const [name, setName] = useState("");
  const [target, setTarget] = useState(defaultTarget ?? "HEAD");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && target.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const failure = await createTag(name.trim(), target.trim(), message.trim());
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    onCreated?.(name.trim());
    onClose();
  };

  return (
    <Modal
      open
      title={t("tags.createTitle")}
      subtitle={t("tags.createSubtitle")}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {t("tags.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {t("tags.createAction")}
          </button>
        </>
      }
    >
      <div className="space-y-2.5">
        <label className="block">
          <span className="mb-1 block text-[10.5px] text-ink-faint">{t("tags.name")}</span>
          <input
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder={t("tags.namePlaceholder")}
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[10.5px] text-ink-faint">{t("tags.target")}</span>
          <input
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={t("tags.targetPlaceholder")}
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[10.5px] text-ink-faint">{t("tags.message")}</span>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            placeholder={t("tags.messagePlaceholder")}
            className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60"
          />
        </label>

        {error ? (
          <p className="whitespace-pre-line rounded-md border border-negative/30 bg-negative/8 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-negative">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}