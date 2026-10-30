import type { FileStatus } from "./types";

const relativeFormatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
const absoluteFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600 * 1000],
  ["month", 30 * 24 * 3600 * 1000],
  ["week", 7 * 24 * 3600 * 1000],
  ["day", 24 * 3600 * 1000],
  ["hour", 3600 * 1000],
  ["minute", 60 * 1000],
];

/** `1640000000` (unix seconds) → `3 天前`. */
export function relativeTime(unixSeconds: number): string {
  const delta = unixSeconds * 1000 - Date.now();
  const magnitude = Math.abs(delta);
  if (magnitude < 45_000) return "刚刚";
  for (const [unit, ms] of UNITS) {
    if (magnitude >= ms) {
      return relativeFormatter.format(Math.round(delta / ms), unit);
    }
  }
  return "刚刚";
}

export function absoluteTime(unixSeconds: number): string {
  return absoluteFormatter.format(new Date(unixSeconds * 1000));
}

export function timeTooltip(unixSeconds: number): string {
  return `${absoluteTime(unixSeconds)}（${relativeTime(unixSeconds)}）`;
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

const STATUS_META: Record<FileStatus, StatusMeta> = {
  added: { letter: "A", label: "新增", tone: "positive" },
  modified: { letter: "M", label: "修改", tone: "warning" },
  deleted: { letter: "D", label: "删除", tone: "negative" },
  renamed: { letter: "R", label: "重命名", tone: "accent" },
  copied: { letter: "C", label: "复制", tone: "accent" },
  typechange: { letter: "T", label: "类型变更", tone: "accent" },
  untracked: { letter: "U", label: "未跟踪", tone: "positive" },
  conflicted: { letter: "U", label: "冲突", tone: "negative" },
  unknown: { letter: "?", label: "变更", tone: "neutral" },
};

export function statusMeta(status: FileStatus): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.unknown;
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
  return value.toLocaleString("zh-CN");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}