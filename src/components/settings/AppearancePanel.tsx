import { Check } from "lucide-react";

import { LOCALES, setLocale, useLocale, useT } from "../../i18n";
import type { Theme } from "../../lib/theme";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";

const THEMES: Theme[] = ["light", "dark"];

/**
 * Theme + language, the two preferences that are not tied to a repository.
 *
 * The theme cards are miniature three-pane layouts built from the real design
 * tokens: each preview carries its own `data-theme`, so the values come from the
 * actual palette and the preview can never drift from the app.
 */
export default function AppearancePanel() {
  const t = useT();
  const { theme } = useSlice((state) => ({ theme: state.theme }));
  const setTheme = useAppStore((state) => state.setTheme);
  const locale = useLocale();

  return (
    <div className="max-w-[520px] space-y-6">
      <section>
        <h3 className="text-[12px] font-medium text-ink">{t("settings.appearance.theme")}</h3>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-faint">
          {t("settings.appearance.themeHint")}
        </p>
        <div role="radiogroup" aria-label={t("settings.appearance.theme")} className="mt-3 flex gap-3">
          {THEMES.map((id) => (
            <ThemeCard
              key={id}
              id={id}
              selected={theme === id}
              label={id === "light" ? t("settings.appearance.light") : t("settings.appearance.dark")}
              onSelect={() => setTheme(id)}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-[12px] font-medium text-ink">{t("settings.appearance.language")}</h3>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-faint">
          {t("settings.appearance.languageHint")}
        </p>
        <div
          role="radiogroup"
          aria-label={t("settings.appearance.language")}
          className="mt-3 inline-flex rounded-lg border border-line bg-canvas/60 p-0.5"
        >
          {LOCALES.map((item) => {
            const active = locale === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setLocale(item.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                  active ? "bg-panel text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"
                }`}
              >
                {active ? <Check size={11} className="text-accent" /> : null}
                {item.label}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ThemeCard({
  id,
  selected,
  label,
  onSelect,
}: {
  id: Theme;
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  const t = useT();

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className={`group w-[150px] shrink-0 rounded-xl border p-1.5 text-left transition-colors ${
        selected
          ? "border-accent bg-accent-soft/40"
          : "border-line hover:border-line-strong hover:bg-ink/3"
      }`}
    >
      {/* `data-theme` on the frame, not the button: the label below must keep the
          window's own colours while the miniature uses the previewed ones. */}
      <span
        data-theme={id}
        className="block overflow-hidden rounded-lg border border-line bg-canvas p-1.5"
      >
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-ink/25" />
          <span className="h-1 w-7 rounded-full bg-ink/15" />
        </span>
        <span className="mt-1.5 flex gap-1">
          <span className="h-10 w-[26%] rounded border-r border-line bg-sidebar" />
          <span className="h-10 flex-1 rounded bg-panel" />
          <span className="h-10 w-[34%] rounded border-l border-line bg-panel" />
        </span>
        <span className="mt-1 flex items-center gap-1">
          <span className="h-1 w-4 rounded-full bg-accent/50" />
          <span className="h-1 flex-1 rounded-full bg-ink/12" />
          <span className="h-1 w-3 rounded-full bg-ink/12" />
        </span>
      </span>

      <span className="mt-1.5 flex items-center gap-1 px-0.5">
        <span
          className={`flex-1 text-[11.5px] font-medium ${selected ? "text-accent" : "text-ink-soft"}`}
        >
          {label}
        </span>
        {selected ? (
          <Check size={11} className="shrink-0 text-accent" aria-hidden />
        ) : (
          <span className="sr-only">{t("settings.appearance.preview")}</span>
        )}
      </span>
    </button>
  );
}