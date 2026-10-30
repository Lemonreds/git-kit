import { useEffect, useState } from "react";
import { FolderGit2 } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";

import { tip } from "../common/Tooltip";

/**
 * Sidebar footer: only the app version. Remote address lives in 设置 → 远程仓库
 * and the current branch moved to the middle panel's status bar, so the footer
 * no longer repeats repository metadata.
 */
export default function SidebarFooter() {
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
        {...tip("Git Kit 版本")}
        className="flex items-center gap-1.5 text-[10.5px] text-ink-faint"
      >
        <FolderGit2 size={11} className="shrink-0 opacity-70" />
        <span className="font-mono">{version ? `v${version}` : "—"}</span>
      </span>
    </footer>
  );
}