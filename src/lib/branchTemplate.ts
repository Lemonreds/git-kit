import type { BranchDateFormat } from "./types";

/** The dynamic part of a template rule, e.g. `prod_{date}_BASE`. */
export const DATE_TOKEN = "{date}";

export const DATE_FORMATS: Array<{ value: BranchDateFormat; label: string }> = [
  { value: "yyyyMMdd", label: "20261029" },
  { value: "yyyy-MM-dd", label: "2026-10-29" },
  { value: "yyyyMMdd-HHmm", label: "20261029-1830" },
];

export interface DateOption {
  /** Rendered with the template's date format. */
  value: string;
  /** `10-29` */
  dayLabel: string;
  /** 今天 / 明天 / 周六 */
  hint: string;
  offset: number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDate(date: Date, format: BranchDateFormat): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  if (format === "yyyy-MM-dd") return `${y}-${m}-${d}`;
  if (format === "yyyyMMdd-HHmm") return `${y}${m}${d}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${y}${m}${d}`;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** Today plus the next `count - 1` days — the default date picker of 新建分支. */
export function upcomingDates(count = 5, format: BranchDateFormat = "yyyyMMdd"): DateOption[] {
  const today = new Date();
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const hint =
      offset === 0 ? "今天" : offset === 1 ? "明天" : offset === 2 ? "后天" : WEEKDAYS[date.getDay()];
    return {
      value: formatDate(date, format),
      dayLabel: `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      hint,
      offset,
    };
  });
}

export function hasDateToken(rule: string): boolean {
  return rule.includes(DATE_TOKEN);
}

/** `prod_{date}_BASE` + `20261029` → `prod_20261029_BASE`. */
export function renderRule(rule: string, dateValue: string): string {
  return rule.split(DATE_TOKEN).join(dateValue).trim();
}

export interface RuleSegment {
  text: string;
  token: boolean;
}

/** Split a rule so the editor can highlight the dynamic date part. */
export function ruleSegments(rule: string): RuleSegment[] {
  if (!rule.includes(DATE_TOKEN)) return rule ? [{ text: rule, token: false }] : [];
  const parts = rule.split(DATE_TOKEN);
  const segments: RuleSegment[] = [];
  parts.forEach((part, index) => {
    if (part) segments.push({ text: part, token: false });
    if (index < parts.length - 1) segments.push({ text: "日期", token: true });
  });
  return segments;
}

export interface BranchNameCheck {
  valid: boolean;
  reason?: string;
}

/**
 * Client-side mirror of `git check-ref-format --branch`, so the input can show
 * the problem before hitting the backend (which still validates for real).
 */
export function checkBranchName(name: string): BranchNameCheck {
  const value = name.trim();
  if (!value) return { valid: false, reason: "请输入分支名" };
  if (value.startsWith("-")) return { valid: false, reason: "分支名不能以 - 开头" };
  if (/\s/.test(value)) return { valid: false, reason: "分支名不能包含空格" };
  if (/[~^:?*\[\\\x00-\x1f\x7f]/.test(value)) {
    return { valid: false, reason: "分支名不能包含 ~ ^ : ? * [ \\ 或控制字符" };
  }
  if (value.includes("..")) return { valid: false, reason: "分支名不能包含连续的两个点 .." };
  if (value.includes("@{")) return { valid: false, reason: "分支名不能包含 @{" };
  if (value.startsWith("/") || value.endsWith("/")) {
    return { valid: false, reason: "分支名不能以 / 开头或结尾" };
  }
  if (value.startsWith(".") || value.endsWith(".")) {
    return { valid: false, reason: "分支名不能以 . 开头或结尾" };
  }
  if (value.includes("//")) return { valid: false, reason: "分支名不能包含连续的 /" };
  if (value.split("/").some((part) => part.endsWith(".lock"))) {
    return { valid: false, reason: "分支名的任一段不能以 .lock 结尾" };
  }
  if (value === "@") return { valid: false, reason: "@ 不是合法的分支名" };
  return { valid: true };
}

/** Branches the delete dialog leaves unchecked by default. */
export const PROTECTED_BRANCHES = ["master", "main", "uat", "test"];

export function isProtectedBranch(name: string): boolean {
  const lower = name.toLowerCase();
  return PROTECTED_BRANCHES.some((protectedName) => lower === protectedName);
}