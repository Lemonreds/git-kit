/** Shared i18n types — kept apart so the dictionaries never import the runtime. */

export type Locale = "zh-CN" | "en-US";

/**
 * A message is either a plain template (`{name}` placeholders) or a
 * singular/plural pair picked by `params.count`. English needs the pair; the
 * Chinese dictionary simply repeats the same text in both fields.
 */
export type Message = string | { one: string; other: string };

export type MessageParams = Record<string, string | number>;