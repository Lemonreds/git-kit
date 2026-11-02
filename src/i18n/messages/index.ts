import type { Message } from "../types";

import { en as branchesEn, zh as branchesZh } from "./branches";
import { en as changesEn, zh as changesZh } from "./changes";
import { en as commitsEn, zh as commitsZh } from "./commits";
import { en as commonEn, zh as commonZh } from "./common";
import { en as diffEn, zh as diffZh } from "./diff";
import { en as errorsEn, zh as errorsZh } from "./errors";
import { en as layoutEn, zh as layoutZh } from "./layout";
import { en as libEn, zh as libZh } from "./lib";
import { en as projectsEn, zh as projectsZh } from "./projects";
import { en as settingsEn, zh as settingsZh } from "./settings";
import { en as storeEn, zh as storeZh } from "./store";
import { en as terminalEn, zh as terminalZh } from "./terminal";

export const zhCN = {
  ...commonZh,
  ...layoutZh,
  ...projectsZh,
  ...terminalZh,
  ...branchesZh,
  ...changesZh,
  ...commitsZh,
  ...diffZh,
  ...settingsZh,
  ...storeZh,
  ...libZh,
  ...errorsZh,
};

/**
 * Typed against the Chinese dictionary: a key added to `zh` and not to `en`
 * (or a stray key in `en`) is a compile error rather than a runtime fallback.
 */
export const enUS: Record<keyof typeof zhCN, Message> = {
  ...commonEn,
  ...layoutEn,
  ...projectsEn,
  ...terminalEn,
  ...branchesEn,
  ...changesEn,
  ...commitsEn,
  ...diffEn,
  ...settingsEn,
  ...storeEn,
  ...libEn,
  ...errorsEn,
};