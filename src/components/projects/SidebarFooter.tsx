import { useEffect, useState } from "react";
import { FolderGit2 } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";

import { useT } from "../../i18n";
import { tip } from "../common/Tooltip";

/**
 * Sidebar footer: only the app version. Remote address lives in Settings → Remotes
 * and the current branch moved to the middle panel's status bar, so the footer
 * no longer repeats repository metadata.
 */
export default function SidebarFooter() {
  const t = useT();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getVersion()
      .then((value) => {
        if (alive) setVersion(value);
      })
      .catch(() => {
        if (alive) setVersion(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <footer className="flex h-8 shrink-0 items-center border-t border-line/70 px-3">
      <span
        {...tip(t("projects.versionTip"))}
        className="flex items-center gap-1.5 text-[10.5px] text-ink-faint"
      >
        <FolderGit2 size={11} className="shrink-0 opacity-70" />
        <span className="font-mono">{version ? `v${version}` : "—"}</span>
      </span>
    </footer>
  );
}