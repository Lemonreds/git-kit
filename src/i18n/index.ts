import { useSyncExternalStore } from "react";

import { enUS, zhCN } from "./messages";
import type { Locale, Message, MessageParams } from "./types";

export type { Locale, Message, MessageParams };

/** Every message key in the app; a typo is a compile error, not a blank label. */
export type MessageKey = keyof typeof zhCN;

export const LOCALES: Array<{ id: Locale; label: string }> = [
  { id: "zh-CN", label: "中文" },
  { id: "en-US", label: "English" },
];

// Widened on purpose: the typed view lives in `messages/index.ts`, this map only
// needs to be indexable while the dictionaries are being filled in.
const DICTIONARIES: Record<Locale, Partial<Record<string, Message>>> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

const STORAGE_KEY = "gk.locale";

/** Module-level so `store/` and `lib/` can translate without React. */
let locale: Locale = storedLocale();
const listeners = new Set<() => void>();

function storedLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en-US" ? "en-US" : "zh-CN";
  } catch {
    return "zh-CN";
  }
}

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  if (next === locale) return;
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode / quota: the choice just will not survive a restart.
  }
  applyDocumentLang();
  notify();
}

/** Keeps `<html lang>` in sync — screen readers and CSS `:lang()` rely on it. */
export function applyDocumentLang(): void {
  document.documentElement.lang = locale;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replaces `{name}` placeholders; unknown placeholders stay verbatim. */
function fill(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function t(key: MessageKey, params?: MessageParams): string {
  const message = DICTIONARIES[locale][key as string];
  // A missing key returns the key itself: visible in the UI, never a crash.
  if (message === undefined) return key;
  if (typeof message === "string") return fill(message, params);
  const count = Number(params?.count ?? 0);
  return fill(count === 1 ? message.one : message.other, params);
}

/** `t` for non-component code (store slices, `lib/` helpers). */
export const tr = t;

/** Reactive `t`: re-renders the component when the locale changes. */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, getLocale, getLocale);
  return t;
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}