import { useEffect, useState } from "react";
import { Cloud, Sparkles, UserRound } from "lucide-react";

import { useAppStore } from "../../store/appStore";
import { shortPath } from "../../lib/format";
import Modal from "../common/Modal";
import BranchTemplatePanel from "./BranchTemplatePanel";
import IdentityPanel from "./IdentityPanel";
import RemotesPanel from "./RemotesPanel";

interface SettingsDialogProps {
  onClose: () => void;
}

type Tab = "remotes" | "identity" | "templates";

const TABS: Array<{
  id: Tab;
  label: string;
  hint: string;
  icon: typeof Cloud;
}> = [
  { id: "remotes", label: "远程仓库", hint: "绑定 / 删除远程地址", icon: Cloud },
  { id: "identity", label: "提交身份", hint: "user.name / user.email", icon: UserRound },
  { id: "templates", label: "分支名模板", hint: "新建分支的命名规则", icon: Sparkles },
];

export default function SettingsDialog({ onClose }: SettingsDialogProps) {
  const project = useAppStore((state) => state.activeProject);
  const loadIdentity = useAppStore((state) => state.loadIdentity);
  const identity = useAppStore((state) => state.identity);
  const [tab, setTab] = useState<Tab>("remotes");

  useEffect(() => {
    if (project?.status !== "ok") return;
    if (!identity) void loadIdentity();
  }, [project, identity, loadIdentity]);

  return (
    <Modal
      open
      title="设置"
      subtitle={
        tab === "templates"
          ? "所有仓库公用"
          : tab === "remotes"
            ? "可为下面选中的仓库单独配置远程地址"
            : project
              ? `${project.name} · ${shortPath(project.path)} · 仅作用于当前仓库`
              : "未选择项目"
      }
      onClose={onClose}
      width={880}
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
      {project?.status !== "ok" ? (
        <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
          当前项目不可读，无法修改仓库设置。
        </p>
      ) : (
        <div
          className="flex gap-4"
          style={{ height: "clamp(380px, calc(100vh - 260px), 560px)" }}
        >
          <nav className="flex w-[204px] shrink-0 flex-col gap-0.5 overflow-y-auto rounded-xl border border-line bg-canvas/40 p-1.5">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = item.id === tab;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-pressed={active}
                  className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                    active ? "bg-panel shadow-sm" : "hover:bg-ink/5"
                  }`}
                >
                  <span
                    className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors ${
                      active
                        ? "bg-accent-soft text-accent"
                        : "border border-line bg-panel text-ink-faint"
                    }`}
                  >
                    <Icon size={12} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-[12px] font-medium ${
                        active ? "text-ink" : "text-ink-soft"
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-ink-faint">
                      {item.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto pr-1">
            {tab === "remotes" ? (
              <RemotesPanel />
            ) : tab === "identity" ? (
              <IdentityPanel />
            ) : (
              <BranchTemplatePanel />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}