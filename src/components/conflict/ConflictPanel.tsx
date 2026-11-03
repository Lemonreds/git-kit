import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  X,
} from "lucide-react";

import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n";
import type { ConflictBlock, ParsedConflictFile } from "../../lib/parseConflicts";
import type { ConflictKind } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { useSlice } from "../../store/hooks";
import { countUnresolved } from "../../store/slices/conflictSlice";
import EmptyState from "../common/EmptyState";
import IconButton from "../common/IconButton";
import { SkeletonRows } from "../common/Skeleton";
import { tip } from "../common/Tooltip";
import ConfirmDialog from "../common/ConfirmDialog";
import ConflictBlockCard from "./ConflictBlockCard";

const KIND_LABEL: Record<ConflictKind, MessageKey> = {
  both_modified: "conflict.kindBothModified",
  both_added: "conflict.kindBothAdded",
  deleted_by_us: "conflict.kindDeletedByUs",
  deleted_by_them: "conflict.kindDeletedByThem",
  both_deleted: "conflict.kindBothDeleted",
  unknown: "conflict.kindUnknown",
};

/** Blocks rendered per chunk: a file with 200 conflicts stays usable. */
const SEGMENT_STEP = 15;
/** Context lines rendered when a folded run is expanded. */
const CONTEXT_CAP = 300;

type Segment =
  | { kind: "context"; from: number; to: number }
  | { kind: "block"; block: ConflictBlock; index: number };

function buildSegments(parsed: ParsedConflictFile | null): Segment[] {
  if (!parsed) return [];
  const segments: Segment[] = [];
  let cursor = 0;
  parsed.blocks.forEach((block, position) => {
    if (block.start > cursor) segments.push({ kind: "context", from: cursor, to: block.start });
    segments.push({ kind: "block", block, index: position + 1 });
    cursor = block.end + 1;
  });
  if (cursor < parsed.lines.length) {
    segments.push({ kind: "context", from: cursor, to: parsed.lines.length });
  }
  return segments;
}

export default function ConflictPanel() {
  const t = useT();
  const {
    path,
    detail,
    parsed,
    drafts,
    files,
    loading,
    saving,
  } = useSlice((state) => ({
    path: state.conflictPath,
    detail: state.conflictDetail,
    parsed: state.conflictParsed,
    drafts: state.conflictDrafts,
    files: state.conflictFiles,
    loading: state.conflictLoading,
    saving: state.conflictSaving,
  }));

  const choose = useAppStore((state) => state.chooseConflictSide);
  const setDraft = useAppStore((state) => state.setConflictDraft);
  const resetDraft = useAppStore((state) => state.resetConflictDraft);
  const addLine = useAppStore((state) => state.appendConflictLine);
  const applyAll = useAppStore((state) => state.applyAllConflictSides);
  const saveConflict = useAppStore((state) => state.saveConflict);
  const resolveSide = useAppStore((state) => state.resolveConflictSide);
  const step = useAppStore((state) => state.stepConflict);
  const reload = useAppStore((state) => state.refreshConflict);
  const close = useAppStore((state) => state.closeConflict);

  const [limit, setLimit] = useState(SEGMENT_STEP);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pendingStep, setPendingStep] = useState<number | null>(null);

  const segments = useMemo(() => buildSegments(parsed), [parsed]);
  const unresolved = countUnresolved(parsed, drafts);
  const totalBlocks = parsed?.blocks.length ?? 0;
  const resolvedBlocks = totalBlocks - unresolved;
  const hasDrafts = Object.keys(drafts).length > 0;
  const file = files.find((entry) => entry.path === detail?.path);
  const position = files.findIndex((entry) => entry.path === detail?.path);

  const binary = Boolean(
    detail && (detail.worktreeBinary || detail.ours.isBinary || detail.theirs.isBinary),
  );
  // Whole-file handling is the only safe option for binary, oversized or
  // marker-less conflicts (deleted sides land here too).
  const blocksEditable = Boolean(detail && detail.complete && parsed?.hasMarkers && !binary);
  const deletion =
    detail?.kind === "deleted_by_us" ||
    detail?.kind === "deleted_by_them" ||
    detail?.kind === "both_deleted";

  if (!path) return null;

  const handleSave = () => {
    if (unresolved > 0) {
      setConfirmSave(true);
      return;
    }
    void saveConflict();
  };

  /** Switching files throws the drafts away, so ask first when there are any. */
  const goStep = (delta: number) => {
    if (hasDrafts) {
      setPendingStep(delta);
      return;
    }
    void step(delta);
  };

  const specialTitle = binary
    ? t("conflict.binaryTitle")
    : detail && !detail.complete
      ? t("conflict.tooLargeTitle")
      : t("conflict.noMarkersTitle");
  const specialDescription = binary
    ? t("conflict.binaryDescription")
    : detail && !detail.complete
      ? t("conflict.tooLargeDescription")
      : t("conflict.noMarkersDescription");

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <header
        data-tauri-drag-region
        className="drag-region flex h-11 shrink-0 items-center gap-1.5 border-b border-line px-2.5"
      >
        <AlertTriangle size={13} className="shrink-0 text-warning" />
        {detail ? (
          <span className="shrink-0 rounded bg-warning/14 px-1.5 py-0.5 text-[9.5px] font-semibold text-warning">
            {t(KIND_LABEL[detail.kind])}
          </span>
        ) : null}
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft"
          {...tip(detail?.path ?? path)}
        >
          {detail?.path ?? path}
        </span>
        {files.length > 0 ? (
          <span className="shrink-0 font-mono text-[10px] text-ink-faint">
            {t("conflict.positionPlain", {
              index: position >= 0 ? position + 1 : 1,
              total: files.length,
            })}
          </span>
        ) : null}

        <div className="no-drag ml-1 flex shrink-0 items-center gap-0.5">
          <IconButton
            label={t("conflict.prev")}
            onClick={() => goStep(-1)}
            disabled={files.length < 2}
          >
            <ChevronLeft size={13} />
          </IconButton>
          <IconButton
            label={t("conflict.next")}
            onClick={() => goStep(1)}
            disabled={files.length < 2}
          >
            <ChevronRight size={13} />
          </IconButton>
          <IconButton
            label={t("conflict.reload")}
            onClick={() => (hasDrafts ? setConfirmReload(true) : void reload())}
            disabled={loading || saving}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : undefined} />
          </IconButton>
          <IconButton
            label={t("conflict.close")}
            onClick={() => (hasDrafts ? setConfirmClose(true) : close())}
          >
            <X size={13} />
          </IconButton>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !parsed || !detail?.complete}
            {...tip(t("conflict.saveHint"))}
            className="ml-1 inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            {saving ? t("conflict.saving") : t("conflict.save")}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && !detail ? (
          <SkeletonRows rows={5} />
        ) : !detail ? (
          <EmptyState icon={AlertTriangle} title={t("conflict.emptyTitle")} />
        ) : blocksEditable && parsed ? (
          <>
            {totalBlocks > 1 ? (
              <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-canvas/40 px-2 py-1.5">
                <span className="text-[10.5px] text-ink-soft">
                  {t("conflict.summary", { resolved: resolvedBlocks, total: totalBlocks })}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyAll("ours")}
                    className="rounded-md border border-positive/35 px-1.5 py-0.5 text-[10px] font-medium text-positive transition-colors hover:bg-positive/10"
                  >
                    {t("conflict.allOurs")}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyAll("theirs")}
                    className="rounded-md border border-negative/35 px-1.5 py-0.5 text-[10px] font-medium text-negative transition-colors hover:bg-negative/10"
                  >
                    {t("conflict.allTheirs")}
                  </button>
                </div>
              </div>
            ) : null}

            {parsed.malformed ? (
              <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-warning/35 bg-warning/10 px-2 py-1.5 text-[10.5px] text-warning">
                <FileWarning size={12} className="mt-px shrink-0" />
                {t("conflict.malformedNotice")}
              </div>
            ) : null}

            <div className="space-y-2">
              {segments.slice(0, limit).map((segment) =>
                segment.kind === "context" ? (
                  <ContextLines
                    key={`ctx-${segment.from}`}
                    lines={parsed.lines}
                    from={segment.from}
                    to={segment.to}
                  />
                ) : (
                  <ConflictBlockCard
                    key={segment.block.id}
                    block={segment.block}
                    index={segment.index}
                    parsed={parsed}
                    draft={drafts[segment.block.id]}
                    oursLabel={detail.oursLabel}
                    theirsLabel={detail.theirsLabel}
                    onChoose={(choice) => choose(segment.block.id, choice)}
                    onChange={(text) => setDraft(segment.block.id, text)}
                    onReset={() => resetDraft(segment.block.id)}
                    onAddLine={(side, line) => addLine(segment.block.id, side, line)}
                  />
                ),
              )}
            </div>

            {limit < segments.length ? (
              <button
                type="button"
                onClick={() => setLimit((current) => current + SEGMENT_STEP)}
                className="mt-2 w-full rounded-lg border border-line py-1.5 text-[11px] text-ink-soft transition-colors hover:bg-ink/4 hover:text-ink"
              >
                {t("conflict.showMore", { remaining: segments.length - limit })}
              </button>
            ) : null}

            {unresolved > 0 ? (
              <p className="mt-2 rounded-lg bg-warning/10 px-2 py-1.5 text-[10.5px] text-warning">
                {t("conflict.remainingBlocks", { count: unresolved })}
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex min-h-0 flex-col items-center gap-3 py-6">
            <EmptyState
              icon={binary ? ShieldAlert : FileWarning}
              title={specialTitle}
              description={specialDescription}
            />
            {detail.kind === "deleted_by_us" || detail.kind === "deleted_by_them" ? (
              <p className="text-[10.5px] text-ink-faint">
                {t("conflict.deletedNotice", {
                  side:
                    detail.kind === "deleted_by_us"
                      ? t("conflict.deletedOurs")
                      : t("conflict.deletedTheirs"),
                })}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {file?.hasOurs ? (
                <button
                  type="button"
                  onClick={() => void resolveSide("ours")}
                  disabled={saving}
                  className="rounded-lg border border-positive/40 px-2 py-1 text-[11px] font-medium text-positive transition-colors hover:bg-positive/10 disabled:opacity-50"
                >
                  {t("conflict.takeOursFile")}
                </button>
              ) : null}
              {file?.hasTheirs ? (
                <button
                  type="button"
                  onClick={() => void resolveSide("theirs")}
                  disabled={saving}
                  className="rounded-lg border border-negative/40 px-2 py-1 text-[11px] font-medium text-negative transition-colors hover:bg-negative/10 disabled:opacity-50"
                >
                  {t("conflict.takeTheirsFile")}
                </button>
              ) : null}
              {deletion ? (
                <button
                  type="button"
                  onClick={() => void resolveSide("delete")}
                  disabled={saving}
                  className="rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
                >
                  {t("conflict.keepDeletion")}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-3 py-1.5 text-[10.5px] text-ink-faint">
        {totalBlocks > 0 ? (
          <span>{t("conflict.summary", { resolved: resolvedBlocks, total: totalBlocks })}</span>
        ) : (
          <span>{t("conflict.wholeFile")}</span>
        )}
        <span className="ml-auto">{t("conflict.backgroundHint")}</span>
      </footer>

      <ConfirmDialog
        open={confirmSave}
        title={t("conflict.confirmUnresolvedTitle", { count: unresolved })}
        description={t("conflict.confirmUnresolvedDescription")}
        confirmLabel={t("conflict.confirmUnresolved")}
        tone="danger"
        onConfirm={() => {
          setConfirmSave(false);
          void saveConflict(true);
        }}
        onCancel={() => setConfirmSave(false)}
      />
      <ConfirmDialog
        open={pendingStep !== null}
        title={t("conflict.switchConfirmTitle")}
        description={t("conflict.switchConfirmDescription")}
        confirmLabel={t("conflict.switchConfirm")}
        tone="danger"
        onConfirm={() => {
          const delta = pendingStep;
          setPendingStep(null);
          if (delta !== null) void step(delta);
        }}
        onCancel={() => setPendingStep(null)}
      />
      <ConfirmDialog
        open={confirmReload}
        title={t("conflict.reloadConfirmTitle")}
        description={t("conflict.reloadConfirmDescription")}
        confirmLabel={t("conflict.reload")}
        tone="danger"
        onConfirm={() => {
          setConfirmReload(false);
          void reload();
        }}
        onCancel={() => setConfirmReload(false)}
      />
      <ConfirmDialog
        open={confirmClose}
        title={t("conflict.closeConfirmTitle")}
        description={t("conflict.closeConfirmDescription")}
        confirmLabel={t("conflict.closeConfirm")}
        tone="danger"
        onConfirm={() => {
          setConfirmClose(false);
          close();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </section>
  );
}

/** Folded run of untouched lines between two conflict blocks. */
function ContextLines({ lines, from, to }: { lines: string[]; from: number; to: number }) {
  const t = useT();
  const count = Math.max(0, to - from);
  const [expanded, setExpanded] = useState(count <= 4);

  if (count === 0) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-1.5 rounded-md bg-canvas/50 px-2 py-1 text-left text-[10px] text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink-soft"
      >
        ···
        <span>{t("conflict.contextCollapsed", { count })}</span>
        <span className="ml-auto">{t("conflict.contextExpand")}</span>
      </button>
    );
  }

  const visible = Math.min(count, CONTEXT_CAP);
  return (
    <div className="rounded-lg border border-line/60 bg-canvas/30">
      <div className="overflow-x-auto">
        <div className="min-w-max font-mono text-[11px] leading-[1.6] text-ink-faint">
          {Array.from({ length: visible }, (_, offset) => (
            <div key={from + offset} className="flex">
              <span className="w-10 shrink-0 select-none pr-1.5 text-right text-[9.5px] opacity-70">
                {from + offset + 1}
              </span>
              <span className="whitespace-pre pr-2">{lines[from + offset] ?? ""}</span>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="w-full border-t border-line/60 py-0.5 text-[10px] text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink-soft"
      >
        {t("conflict.contextCollapse")}
        {count > CONTEXT_CAP ? ` · ${t("conflict.contextCapped", { count: CONTEXT_CAP })}` : ""}
      </button>
    </div>
  );
}