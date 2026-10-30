import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Check, Loader2, Plus, Sparkles, Star, Trash2 } from "lucide-react";

import {
  DATE_FORMATS,
  DATE_TOKEN,
  formatDate,
  renderRule,
  ruleSegments,
} from "../../lib/branchTemplate";
import type { BranchDateFormat, BranchTemplate } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import HelpTip from "../common/HelpTip";
import { tip } from "../common/Tooltip";

function newId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function blankTemplate(): BranchTemplate {
  return {
    id: newId(),
    name: "",
    rule: "feature_{date}",
    dateFormat: "yyyyMMdd",
    updatedAt: Date.now() / 1000,
  };
}

/** 分支名模板管理面板（设置弹窗的第三个 tab）。 */
export default function BranchTemplatePanel() {
  const templates = useAppStore((state) => state.templates);
  const defaultTemplateId = useAppStore((state) => state.defaultTemplateId);
  const saveTemplates = useAppStore((state) => state.saveTemplates);

  const [draft, setDraft] = useState<BranchTemplate[]>([]);
  const [selectedDefault, setSelectedDefault] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ruleInput = useRef<HTMLInputElement | null>(null);

  // Mount-only snapshot: edits stay local until 保存.
  useEffect(() => {
    const copy = templates.map((template) => ({ ...template }));
    setDraft(copy);
    setSelectedDefault(defaultTemplateId);
    setSelectedId(defaultTemplateId ?? copy[0]?.id ?? null);
  }, []);

  const selected = useMemo(
    () => draft.find((template) => template.id === selectedId) ?? null,
    [draft, selectedId],
  );

  const today = formatDate(new Date(), selected?.dateFormat ?? "yyyyMMdd");
  const preview = selected ? renderRule(selected.rule, today) : "";
  const invalid = draft.some((template) => !template.name.trim() || !template.rule.trim());
  const dirty =
    JSON.stringify(draft.map((template) => [template.id, template.name, template.rule, template.dateFormat])) !==
      JSON.stringify(
        templates.map((template) => [template.id, template.name, template.rule, template.dateFormat]),
      ) || selectedDefault !== defaultTemplateId;

  const update = (patch: Partial<BranchTemplate>) => {
    if (!selected) return;
    setDraft((current) =>
      current.map((template) =>
        template.id === selected.id
          ? { ...template, ...patch, updatedAt: Date.now() / 1000 }
          : template,
      ),
    );
  };

  const addTemplate = () => {
    const template = blankTemplate();
    setDraft((current) => [...current, template]);
    setSelectedId(template.id);
  };

  const removeTemplate = (id: string) => {
    setDraft((current) => {
      const next = current.filter((template) => template.id !== id);
      if (selectedDefault === id) setSelectedDefault(next[0]?.id ?? null);
      return next;
    });
    setSelectedId((current) => (current === id ? null : current));
  };

  const insertDateToken = () => {
    if (!selected) return;
    const input = ruleInput.current;
    const value = selected.rule;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const next = `${value.slice(0, start)}${DATE_TOKEN}${value.slice(end)}`;
    update({ rule: next });
    requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      const position = start + DATE_TOKEN.length;
      input.setSelectionRange(position, position);
    });
  };

  const submit = async () => {
    if (busy || invalid) return;
    setBusy(true);
    await saveTemplates(
      draft.map((template) => ({
        ...template,
        name: template.name.trim(),
        rule: template.rule.trim(),
      })),
      selectedDefault,
    );
    setBusy(false);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex w-[210px] shrink-0 flex-col">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto rounded-lg border border-line bg-canvas/40 p-1">
            {draft.length === 0 ? (
              <p className="px-2 py-3 text-[11px] leading-relaxed text-ink-faint">
                还没有模板，新建一个即可。
              </p>
            ) : (
              draft.map((template) => {
                const active = template.id === selectedId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedId(template.id)}
                    className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                      active ? "bg-panel shadow-sm" : "hover:bg-ink/5"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <span
                        className={`min-w-0 flex-1 truncate text-[11.5px] font-medium ${
                          active ? "text-ink" : "text-ink-soft"
                        }`}
                      >
                        {template.name.trim() || "未命名模板"}
                      </span>
                      {selectedDefault === template.id ? (
                        <Star size={10} className="shrink-0 fill-current text-accent" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-ink-faint">
                      {template.rule || "（空规则）"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <button
            type="button"
            onClick={addTemplate}
            className="mt-1.5 inline-flex items-center justify-center gap-1 rounded-lg border border-line py-1.5 text-[11.5px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <Plus size={12} />
            新建模板
          </button>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto pr-1">
          {!selected ? (
            <div className="grid h-full place-items-center rounded-lg border border-dashed border-line px-4 text-center">
              <p className="text-[11.5px] leading-relaxed text-ink-faint">
                选择一个模板，或新建模板。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">模板名称</span>
                <input
                  value={selected.name}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder="例如：生产基线"
                  className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors focus:border-accent/60"
                />
              </label>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
                    模板规则
                    <HelpTip label="用 {date} 表示日期占位符，其余字符固定。例如 prod_{date}_BASE 会生成 prod_20261029_BASE。" />
                  </span>
                  <button
                    type="button"
                    onClick={insertDateToken}
                    {...tip("在光标处插入日期占位符")}
                    className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
                  >
                    <CalendarPlus size={11} />
                    插入日期
                  </button>
                </div>
                <input
                  ref={ruleInput}
                  value={selected.rule}
                  onChange={(event) => update({ rule: event.target.value })}
                  placeholder="prod_{date}_BASE"
                  className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors focus:border-accent/60"
                />

                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {ruleSegments(selected.rule).map((segment, index) =>
                    segment.token ? (
                      <span
                        key={index}
                        className="rounded bg-accent-soft px-1.5 py-px font-mono text-[10px] font-medium text-accent"
                      >
                        日期
                      </span>
                    ) : (
                      <span key={index} className="font-mono text-[10.5px] text-ink-faint">
                        {segment.text}
                      </span>
                    ),
                  )}
                  {ruleSegments(selected.rule).length === 0 ? (
                    <span className="text-[10.5px] text-ink-faint">规则为空</span>
                  ) : null}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">日期格式</span>
                <div className="flex flex-wrap gap-1">
                  {DATE_FORMATS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => update({ dateFormat: option.value as BranchDateFormat })}
                      className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                        selected.dateFormat === option.value
                          ? "border-accent/50 bg-accent-soft text-accent"
                          : "border-line text-ink-soft hover:bg-ink/5"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </label>

              <div className="rounded-lg border border-line bg-canvas/50 px-3 py-2">
                <p className="flex items-center gap-1 text-[10.5px] text-ink-faint">
                  <Sparkles size={10.5} />
                  预览（今天）
                </p>
                <p className="mt-0.5 break-all font-mono text-[12px] font-medium text-ink">
                  {preview || "—"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDefault((current) => (current === selected.id ? null : selected.id))
                  }
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                    selectedDefault === selected.id
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-line text-ink-soft hover:bg-ink/5 hover:text-ink"
                  }`}
                >
                  {selectedDefault === selected.id ? <Check size={11} /> : <Star size={11} />}
                  {selectedDefault === selected.id ? "默认模板" : "设为默认"}
                </button>
                <button
                  type="button"
                  onClick={() => removeTemplate(selected.id)}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-negative/30 px-2 py-1 text-[11px] font-medium text-negative transition-colors hover:border-negative/55 hover:bg-negative/10"
                >
                  <Trash2 size={11} />
                  删除模板
                </button>
              </div>

              {!selected.name.trim() || !selected.rule.trim() ? (
                <p className="text-[10.5px] text-negative">模板名称与规则都不能为空</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-line pt-2.5">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || invalid || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : null}
          保存模板
        </button>
      </div>    </div>
  );
}