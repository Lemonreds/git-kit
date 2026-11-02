import { useEffect, useState } from "react";
import { Cloud, Palette, Sparkles, UserRound } from "lucide-react";

import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n";
import { useAppStore } from "../../store/appStore";
import { shortPath } from "../../lib/format";
import Modal from "../common/Modal";
import AppearancePanel from "./AppearancePanel";
import BranchTemplatePanel from "./BranchTemplatePanel";
import IdentityPanel from "./IdentityPanel";
import RemotesPanel from "./RemotesPanel";

interface SettingsDialogProps {
  onClose: () => void;
}

type Tab = "general" | "remotes" | "identity" | "templates";

interface TabSpec {
  id: Tab;
  label: MessageKey;
  hint: MessageKey;
  icon: typeof Cloud;
  /** `app` tabs must stay reachable even when no repository can be read. */
  scope: "app" | "repo";
}

const TABS: TabSpec[] = [
  {
    id: "general",
    label: "settings.tab.general",
    hint: "settings.tab.generalHint",
    icon: Palette,
    scope: "app",
  },
  {
    id: "remotes",
    label: "settings.tab.remotes",
    hint: "settings.tab.remotesHint",
    icon: Cloud,
    scope: "repo",
  },
  {
    id: "identity",
    label: "settings.tab.identity",
    hint: "settings.tab.identityHint",
    icon: UserRound,
    scope: "repo",
  },
  {
    id: "templates",
    label: "settings.tab.templates",
    hint: "settings.tab.templatesHint",
    icon: Sparkles,
    scope: "repo",
  },
];

const SUBTITLES: Record<Tab, MessageKey> = {
  general: "settings.subtitle.general",
  remotes: "settings.subtitle.remotes",
  identity: "settings.subtitle.identity",
  templates: "settings.subtitle.templates",
};

export default function SettingsDialog({ onClose }: SettingsDialogProps) {
  const t = useT();
  const project = useAppStore((state) => state.activeProject);
  const loadIdentity = useAppStore((state) => state.loadIdentity);
  const identity = useAppStore((state) => state.identity);
  const [tab, setTab] = useState<Tab>("general");

  const repoReady = project?.status === "ok";

  useEffect(() => {
    if (!repoReady || tab !== "identity") return;
    if (!identity) void loadIdentity();
  }, [repoReady, tab, identity, loadIdentity]);

  const subtitle =
    tab === "identity" && repoReady && project
      ? `${project.name} · ${shortPath(project.path)} · ${t(SUBTITLES.identity)}`
      : t(SUBTITLES[tab]);

  return (
    <Modal
      open
      title={t("settings.title")}
      subtitle={subtitle}
      onClose={onClose}
      width={880}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
        >
          {t("settings.close")}
        </button>
      }
    >
      <div className="flex gap-4" style={{ height: "clamp(380px, calc(100vh - 260px), 560px)" }}>
        <nav className="flex w-[204px] shrink-0 flex-col gap-0.5 overflow-y-auto rounded-xl border border-line bg-canvas/40 p-1.5">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = item.id === tab;
            const disabled = item.scope === "repo" && !repoReady;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-pressed={active}
                disabled={disabled}
                className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors disabled:cursor-default disabled:opacity-45 ${
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
                    {t(item.label)}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-ink-faint">
                    {t(item.hint)}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto pr-1">
          {tab === "general" ? <AppearancePanel /> : null}
          {tab !== "general" && !repoReady ? (
            <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
              {t("settings.repoUnavailable")}
            </p>
          ) : null}
          {repoReady && tab === "remotes" ? <RemotesPanel /> : null}
          {repoReady && tab === "identity" ? <IdentityPanel /> : null}
          {repoReady && tab === "templates" ? <BranchTemplatePanel /> : null}
        </div>
      </div>
    </Modal>
  );
}