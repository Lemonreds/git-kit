import { useT } from "../../i18n";
import { baseName, dirName, statusMeta } from "../../lib/format";
import type { FileChange } from "../../lib/types";
import { tip } from "../common/Tooltip";

const TONE_CLASS: Record<string, string> = {
  positive: "bg-positive/12 text-positive",
  negative: "bg-negative/12 text-negative",
  accent: "bg-accent/12 text-accent",
  warning: "bg-warning/14 text-warning",
  neutral: "bg-ink/8 text-ink-faint",
};

interface FileChangeListProps {
  files: FileChange[];
  selectedPath: string | null;
  onSelect: (file: FileChange) => void;
}

export default function FileChangeList({ files, selectedPath, onSelect }: FileChangeListProps) {
  const t = useT();
  return (
    <ul className="py-1">
      {files.map((file) => {
        const active = file.path === selectedPath;
        const meta = statusMeta(file.status);
        return (
          <li key={`${file.oldPath ?? ""}:${file.path}`}>
            <button
              type="button"
              onClick={() => onSelect(file)}
              aria-current={active ? "true" : undefined}
              className={`flex w-full items-center gap-2 px-3 py-[5px] text-left transition-colors ${
                active ? "bg-accent-soft" : "hover:bg-ink/4"
              }`}
            >
              <span
                className={`grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] text-[9px] font-bold ${TONE_CLASS[meta.tone]}`}
                {...tip(meta.label)}
              >
                {meta.letter}
              </span>

              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft">
                {file.oldPath ? (
                  <>
                    <span className="text-ink-faint line-through decoration-ink-faint/40">
                      {file.oldPath}
                    </span>
                    <span className="px-1 text-ink-faint">→</span>
                    <span className="font-medium text-ink">{file.path}</span>
                  </>
                ) : (
                  <>
                    <span className="text-ink-faint">{dirName(file.path)}</span>
                    <span className={active ? "font-medium text-ink" : ""}>{baseName(file.path)}</span>
                  </>
                )}
              </span>

              {file.isBinary ? (
                <span className="shrink-0 text-[9.5px] text-ink-faint">{t("diff.binaryBadge")}</span>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9.5px]">
                  <span className={file.additions ? "text-positive" : "text-ink-faint"}>
                    +{file.additions}
                  </span>
                  <span className={file.deletions ? "text-negative" : "text-ink-faint"}>
                    −{file.deletions}
                  </span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}