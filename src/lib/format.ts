import { getLocale, t } from "../i18n";
import type { Locale, MessageKey } from "../i18n";
import type { FileStatus } from "./types";

// Formatter caches keyed by locale: rebuilt lazily whenever the UI language changes.
const relativeFormatters = new Map<Locale, Intl.RelativeTimeFormat>();
const absoluteFormatters = new Map<Locale, Intl.DateTimeFormat>();

function relativeFormatter(): Intl.RelativeTimeFormat {
  const locale = getLocale();
  let formatter = relativeFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    relativeFormatters.set(locale, formatter);
  }
  return formatter;
}

function absoluteFormatter(): Intl.DateTimeFormat {
  const locale = getLocale();
  let formatter = absoluteFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    absoluteFormatters.set(locale, formatter);
  }
  return formatter;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600 * 1000],
  ["month", 30 * 24 * 3600 * 1000],
  ["week", 7 * 24 * 3600 * 1000],
  ["day", 24 * 3600 * 1000],
  ["hour", 3600 * 1000],
  ["minute", 60 * 1000],
];

/** `1640000000` (unix seconds) → `3 days ago`. */
export function relativeTime(unixSeconds: number): string {
  const delta = unixSeconds * 1000 - Date.now();
  const magnitude = Math.abs(delta);
  if (magnitude < 45_000) return t("lib.justNow");
  for (const [unit, ms] of UNITS) {
    if (magnitude >= ms) {
      return relativeFormatter().format(Math.round(delta / ms), unit);
    }
  }
  return t("lib.justNow");
}

export function absoluteTime(unixSeconds: number): string {
  return absoluteFormatter().format(new Date(unixSeconds * 1000));
}

export function timeTooltip(unixSeconds: number): string {
  return t("lib.dateTimeTooltip", {
    absolute: absoluteTime(unixSeconds),
    relative: relativeTime(unixSeconds),
  });
}

/** `~` shorthand for the current home directory. */
export function shortPath(path: string): string {
  const match = path.match(/^\/Users\/[^/]+/);
  return match ? path.replace(match[0], "~") : path;
}

export function baseName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function lastName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function dirName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join("/")}/` : "";
}

export interface StatusMeta {
  letter: string;
  label: string;
  tone: "positive" | "negative" | "accent" | "warning" | "neutral";
}

const STATUS_META: Record<FileStatus, Omit<StatusMeta, "label"> & { labelKey: MessageKey }> = {
  added: { letter: "A", labelKey: "lib.status.added", tone: "positive" },
  modified: { letter: "M", labelKey: "lib.status.modified", tone: "warning" },
  deleted: { letter: "D", labelKey: "lib.status.deleted", tone: "negative" },
  renamed: { letter: "R", labelKey: "lib.status.renamed", tone: "accent" },
  copied: { letter: "C", labelKey: "lib.status.copied", tone: "accent" },
  typechange: { letter: "T", labelKey: "lib.status.typechange", tone: "accent" },
  untracked: { letter: "U", labelKey: "lib.status.untracked", tone: "positive" },
  conflicted: { letter: "U", labelKey: "lib.status.conflicted", tone: "negative" },
  unknown: { letter: "?", labelKey: "lib.status.unknown", tone: "neutral" },
};

export function statusMeta(status: FileStatus): StatusMeta {
  const meta = STATUS_META[status] ?? STATUS_META.unknown;
  return { letter: meta.letter, label: t(meta.labelKey), tone: meta.tone };
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function avatarHue(email: string): number {
  let hash = 0;
  for (let index = 0; index < email.length; index += 1) {
    hash = (hash * 31 + email.charCodeAt(index)) % 360;
  }
  return hash;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function formatCount(value: number): string {
  return value.toLocaleString(getLocale());
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}