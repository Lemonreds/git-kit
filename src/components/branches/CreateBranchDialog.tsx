import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";

import { useT } from "../../i18n";
import {
  DATE_FORMATS,
  checkBranchName,
  formatDate,
  hasDateToken,
  renderRule,
  upcomingDates,
} from "../../lib/branchTemplate";
import type { BranchSummary } from "../../lib/types";
import BaseBranchPicker from "./BaseBranchPicker";
import { useAppStore } from "../../store/appStore";
import HelpTip from "../common/HelpTip";
import Modal from "../common/Modal";

interface CreateBranchDialogProps {
  /** Pre-selected base (used by "create from this remote branch"). */
  initialBaseRef?: string;
  onClose: () => void;
}

function pickDefaultBase(branches: BranchSummary[]): string {
  const locals = branches.filter((branch) => !branch.isRemote);
  const local = (name: string) => locals.find((branch) => branch.name === name);
  const remote = (name: string) => branches.find((branch) => branch.isRemote && branch.shortName === name);

  return (
    local("master")?.refName ??
    local("main")?.refName ??
    remote("master")?.refName ??
    remote("main")?.refName ??
    locals.find((branch) => branch.isHead)?.refName ??
    locals[0]?.refName ??
    branches[0]?.refName ??
    ""
  );
}

export default function CreateBranchDialog({ initialBaseRef, onClose }: CreateBranchDialogProps) {
  const t = useT();
  const branches = useAppStore((state) => state.branches);
  const remoteBranches = useAppStore((state) => state.remoteBranches);
  const templates = useAppStore((state) => state.templates);
  const defaultTemplateId = useAppStore((state) => state.defaultTemplateId);
  const createBranch = useAppStore((state) => state.createBranch);

  const allBranches = useMemo(
    () => [...branches, ...remoteBranches.filter((remote) => !branches.some((local) => local.refName === remote.refName))],
    [branches, remoteBranches],
  );

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [dateValue, setDateValue] = useState("");
  const [name, setName] = useState("");
  const [baseRef, setBaseRef] = useState("");
  const [busy, setBusy] = useState<"create" | "checkout" | null>(null);
  const initialized = useRef(false);

  // Templates load asynchronously — seed the form on the first render that has them.
  useEffect(() => {
    if (initialized.current || templates.length === 0) return;
    initialized.current = true;
    const template = templates.find((item) => item.id === defaultTemplateId) ?? templates[0];
    const today = formatDate(new Date(), template.dateFormat);
    setTemplateId(template.id);
    setDateValue(today);
    setName(renderRule(template.rule, today));
  }, [templates, defaultTemplateId]);

  useEffect(() => {
    setBaseRef(initialBaseRef ?? pickDefaultBase(branches));
    // Only on mount: later branch refreshes must not reset the user's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const template = templates.find((item) => item.id === templateId) ?? null;
  const dateFormat = template?.dateFormat ?? "yyyyMMdd";
  const dateOptions = useMemo(() => upcomingDates(5, dateFormat), [dateFormat]);

  const baseBranch = allBranches.find((branch) => branch.refName === baseRef) ?? null;
  const trimmed = name.trim();
  const check = checkBranchName(trimmed);
  const duplicate = branches.some((branch) => !branch.isRemote && branch.name === trimmed);
  const valid = check.valid && !duplicate && baseRef.length > 0;

  const applyTemplate = (id: string | null) => {
    setTemplateId(id);
    const next = templates.find((item) => item.id === id) ?? null;
    if (!next) return;
    const today = formatDate(new Date(), next.dateFormat);
    setDateValue(today);
    setName(renderRule(next.rule, today));
  };

  const applyDate = (value: string) => {
    setDateValue(value);
    if (template) setName(renderRule(template.rule, value));
  };


  const submit = async (checkout: boolean) => {
    if (!valid || busy) return;
    setBusy(checkout ? "checkout" : "create");
    const ok = await createBranch(trimmed, baseRef, checkout);
    setBusy(null);
    if (ok) onClose();
  };

  const showDates = template ? hasDateToken(template.rule) : false;

  return (
    <Modal
      open
      title={t("branches.newBranch")}
      subtitle={t("branches.createSubtitle")}
      onClose={busy !== null ? () => undefined : onClose}
      width={560}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
          >
            {t("branches.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit(false)}
            disabled={!valid || busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/45 px-3 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft disabled:cursor-default disabled:opacity-45"
          >
            {busy === "create" ? <Loader2 size={12} className="animate-spin" /> : null}
            {t("branches.createOnly")}
          </button>
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={!valid || busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {busy === "checkout" ? <Loader2 size={12} className="animate-spin" /> : null}
            {t("branches.createAndCheckout")}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <p className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
            {t("branches.templateLabel")}
            <HelpTip label={t("branches.templateHint")} />
          </p>
          <div className="flex flex-wrap gap-1">
            {templates.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyTemplate(item.id)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  templateId === item.id
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-line text-ink-soft hover:bg-ink/5"
                }`}
              >
                {item.name}
                {item.id === defaultTemplateId ? (
                  <span className="rounded bg-accent/12 px-1 text-[9px] text-accent">
                    {t("branches.defaultTag")}
                  </span>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyTemplate(null)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                templateId === null
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line text-ink-soft hover:bg-ink/5"
              }`}
            >
              {t("branches.custom")}
            </button>
          </div>
        </div>

        {showDates ? (
          <div>
            <p className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
              {t("branches.pickDate")}
              <span className="font-normal text-[10.5px] text-ink-faint">
                {t("branches.dateFormat", {
                  format:
                    DATE_FORMATS.find((option) => option.value === dateFormat)?.label ?? dateFormat,
                })}
              </span>
            </p>
            <div className="flex flex-wrap gap-1">
              {dateOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => applyDate(option.value)}
                  className={`flex min-w-[74px] flex-col items-center rounded-lg border px-2 py-1 transition-colors ${
                    dateValue === option.value
                      ? "border-accent/50 bg-accent-soft"
                      : "border-line hover:bg-ink/5"
                  }`}
                >
                  <span
                    className={`text-[10px] ${
                      dateValue === option.value ? "text-accent" : "text-ink-faint"
                    }`}
                  >
                    {option.hint} · {option.dayLabel}
                  </span>
                  <span
                    className={`font-mono text-[10.5px] ${
                      dateValue === option.value ? "font-medium text-accent" : "text-ink-soft"
                    }`}
                  >
                    {option.value}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
            {t("branches.branchName")}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="feature_20261029"
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors focus:border-accent/60"
          />
          {trimmed ? (
            <span className="mt-1 flex items-start gap-1 text-[10.5px] leading-relaxed">
              {duplicate ? (
                <span className="text-negative">
                  {t("branches.duplicateName", { name: trimmed })}
                </span>
              ) : check.valid ? (
                <span className="flex items-center gap-1 text-positive">
                  <Check size={10.5} />
                  {t("branches.nameAvailable")}
                </span>
              ) : (
                <span className="text-negative">{check.reason}</span>
              )}
            </span>
          ) : null}
        </label>

        <div>
          <p className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
            {t("branches.baseBranch")}
            <HelpTip label={t("branches.baseHint")} />
          </p>
          <BaseBranchPicker
            branches={allBranches}
            value={baseRef}
            onChange={setBaseRef}
            placeholder={baseBranch ? baseBranch.name : t("branches.searchBranches")}
          />
          {baseBranch?.isRemote ? (
            <p className="mt-1 text-[10.5px] text-ink-faint">
              {t("branches.tracksRemotePrefix")}
              <code className="font-mono">{baseBranch.name}</code>
              {t("branches.tracksRemoteSuffix")}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-line bg-canvas/50 px-3 py-2">
          <p className="flex items-center gap-1 text-[10.5px] text-ink-faint">
            <Sparkles size={10.5} />
            {t("branches.willCreate")}
          </p>
          <p className="mt-0.5 break-all font-mono text-[12px] font-medium text-ink">
            {trimmed || "—"}
            <span className="ml-1.5 font-sans text-[10.5px] font-normal text-ink-faint">
              {t("branches.basedOn", {
                name: baseBranch?.name ?? t("branches.notSelected"),
              })}
            </span>
          </p>
        </div>
      </div>
    </Modal>
  );
}
