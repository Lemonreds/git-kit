import { useEffect, useState } from "react";
import { AlertTriangle, Keyboard, RotateCcw } from "lucide-react";

import { useT } from "../../i18n";
import { COMMAND_GROUPS, COMMANDS } from "../../lib/commands";
import type { CommandSpec } from "../../lib/commands";
import { bindingFromEvent, sameBinding } from "../../lib/keymap";
import type { CommandId } from "../../lib/keymap";
import { useAppStore } from "../../store/appStore";
import IconButton from "../common/IconButton";
import Keycap from "../common/Keycap";

/**
 * Keybinding editor. Recording uses the same `bindingFromEvent` the dispatcher
 * matches against, so what is displayed is exactly what will fire — no
 * "displayed ⌘⇧K but matched Ctrl+Shift+K" surprises.
 */
export default function ShortcutsPanel() {
  const t = useT();
  const keymap = useAppStore((state) => state.keymap);
  const setBinding = useAppStore((state) => state.setBinding);
  const resetBinding = useAppStore((state) => state.resetBinding);
  const resetKeymap = useAppStore((state) => state.resetKeymap);
  const notify = useAppStore((state) => state.notify);

  const [recording, setRecording] = useState<CommandId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(null);
        setError(null);
        return;
      }
      const binding = bindingFromEvent(event);
      if (!binding) return;
      // A bare letter would shadow typing everywhere: require a modifier (an
      // F-key is the one exception).
      if (!binding.mod && !binding.alt && !/^f\d{1,2}$/.test(binding.key)) {
        setError(t("shortcuts.needModifier"));
        return;
      }
      const clash = COMMANDS.find(
        (command) => command.id !== recording && sameBinding(keymap[command.id], binding),
      );
      if (clash) {
        setError(t("shortcuts.conflict", { name: t(clash.labelKey) }));
        return;
      }
      setBinding(recording, binding);
      setRecording(null);
      setError(null);
      notify("info", t("shortcuts.edited"));
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, keymap, setBinding, notify, t]);

  const startRecording = (id: CommandId) => {
    setRecording(id);
    setError(null);
  };

  const bindingOf = (command: CommandSpec) => keymap[command.id];
  const isDefault = (command: CommandSpec) => sameBinding(bindingOf(command), command.defaultBinding);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
            <Keyboard size={13} className="text-ink-faint" />
            {t("shortcuts.title")}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{t("shortcuts.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetKeymap();
            setRecording(null);
            setError(null);
            notify("info", t("shortcuts.resetDone"));
          }}
          className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
        >
          {t("shortcuts.resetAll")}
        </button>
      </div>

      {error ? (
        <p className="flex items-start gap-1.5 rounded-lg border border-negative/30 bg-negative/8 px-2.5 py-2 text-[11px] leading-relaxed text-negative">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          {error}
        </p>
      ) : null}

      {COMMAND_GROUPS.map((group) => {
        const commands = COMMANDS.filter((command) => command.group === group.id);
        if (commands.length === 0) return null;
        return (
          <section key={group.id}>
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
              {t(group.labelKey)}
            </p>
            <div className="overflow-hidden rounded-xl border border-line">
              {commands.map((command, index) => {
                const binding = bindingOf(command);
                const active = recording === command.id;
                return (
                  <div
                    key={command.id}
                    className={`flex items-center gap-2 px-3 py-2 ${
                      index > 0 ? "border-t border-line/70" : ""
                    } ${active ? "bg-accent-soft" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                      {t(command.labelKey)}
                    </span>
                    {!isDefault(command) ? (
                      <IconButton
                        label={t("shortcuts.reset")}
                        size="sm"
                        onClick={() => resetBinding(command.id)}
                      >
                        <RotateCcw size={12} />
                      </IconButton>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => startRecording(command.id)}
                      title={t("shortcuts.rebindHint")}
                      className={`flex h-[25px] min-w-[96px] shrink-0 items-center justify-center rounded-md border px-1.5 transition-colors ${
                        active
                          ? "border-accent bg-panel text-[11.5px] font-medium text-accent"
                          : binding
                            ? "border-transparent bg-transparent hover:border-accent/40 hover:bg-panel"
                            : "border-dashed border-line bg-panel text-[11px] text-ink-faint hover:text-ink"
                      }`}
                    >
                      {active ? (
                        t("shortcuts.record")
                      ) : binding ? (
                        <Keycap binding={binding} size="md" tone="strong" />
                      ) : (
                        t("shortcuts.unbound")
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}