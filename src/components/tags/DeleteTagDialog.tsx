import { useState } from "react";
import { Check } from "lucide-react";

import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import ConfirmDialog from "../common/ConfirmDialog";

interface DeleteTagDialogProps {
  name: string;
  /** True when the tag is known to exist on the remote (pre-check the box). */
  onRemote: boolean;
  onClose: () => void;
}

/**
 * Deleting a tag is local by default; removing the remote copy is a second,
 * explicit decision because a deleted remote tag cannot be restored from there.
 */
export default function DeleteTagDialog({ name, onRemote, onClose }: DeleteTagDialogProps) {
  const t = useT();
  const deleteTag = useAppStore((state) => state.deleteTag);
  const [deleteRemote, setDeleteRemote] = useState(onRemote);

  return (
    <ConfirmDialog
      open
      title={t("tags.deleteTitle", { name })}
      description={deleteRemote ? t("tags.deleteRemoteBody") : t("tags.deleteLocalBody")}
      confirmLabel={t("tags.confirmDelete")}
      tone="danger"
      onConfirm={() => {
        onClose();
        void deleteTag(name, deleteRemote);
      }}
      onCancel={onClose}
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
          {t("tags.deleteRemoteLabel")}
          <span className="mt-0.5 block text-[10.5px] text-ink-faint">
            {t("tags.deleteRemoteHint")}
          </span>
        </span>
      </label>
    </ConfirmDialog>
  );
}