import { useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";

import { useT } from "../../i18n";
import { api } from "../../lib/ipc";
import { baseName } from "../../lib/format";
import { useAppStore } from "../../store/appStore";

interface FileContentModalProps {
  open: boolean;
  sha: string;
  path: string;
  onClose: () => void;
}

export default function FileContentModal({ open, sha, path, onClose }: FileContentModalProps) {
  const t = useT();
  const repoPath = useAppStore((state) => state.activeProject?.path);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !repoPath) return;

    setLoading(true);
    setError(null);
    setContent(null);

    api
      .getFileContent(repoPath, sha, path)
      .then((data) => {
        setContent(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || t("diff.loadFileContentFailed"));
        setLoading(false);
      });
  }, [open, repoPath, sha, path]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-line px-4 py-3">
          <FileText size={16} className="mt-0.5 shrink-0 text-ink-soft" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">{baseName(path)}</p>
            <p className="mt-0.5 text-[11px] text-ink-faint">{path}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("diff.close")}
            className="-mr-1 -mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-ink/8 hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-ink-faint">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-[12px]">{t("diff.loading")}</span>
            </div>
          ) : error ? (
            <div className="px-4 py-20 text-center">
              <p className="text-[12px] text-negative">{error}</p>
            </div>
          ) : content !== null ? (
            <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-ink">
              <code>{content}</code>
            </pre>
          ) : null}
        </div>

        {/* Footer */}
        {content !== null && !loading && !error ? (
          <div className="border-t border-line px-4 py-2.5 text-[11px] text-ink-faint">
            {t("diff.lineCount", { count: content.split("\n").length })}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
