import type { Message } from "../types";

import { en as branchesEn, zh as branchesZh } from "./branches";
import { en as changesEn, zh as changesZh } from "./changes";
import { en as commandsEn, zh as commandsZh } from "./commands";
import { en as commitsEn, zh as commitsZh } from "./commits";
import { en as commonEn, zh as commonZh } from "./common";
import { en as conflictEn, zh as conflictZh } from "./conflict";
import { en as diffEn, zh as diffZh } from "./diff";
import { en as errorsEn, zh as errorsZh } from "./errors";
import { en as fileHistoryEn, zh as fileHistoryZh } from "./fileHistory";
import { en as hooksEn, zh as hooksZh } from "./hooks";
import { en as layoutEn, zh as layoutZh } from "./layout";
import { en as libEn, zh as libZh } from "./lib";
import { en as projectsEn, zh as projectsZh } from "./projects";
import { en as settingsEn, zh as settingsZh } from "./settings";
import { en as shortcutsEn, zh as shortcutsZh } from "./shortcuts";
import { en as stashEn, zh as stashZh } from "./stash";
import { en as storeEn, zh as storeZh } from "./store";
import { en as tagsEn, zh as tagsZh } from "./tags";
import { en as terminalEn, zh as terminalZh } from "./terminal";
import { en as workflowEn, zh as workflowZh } from "./workflow";

export const zhCN = {
  ...commonZh,
  ...layoutZh,
  ...projectsZh,
  ...terminalZh,
  ...workflowZh,
  ...branchesZh,
  ...tagsZh,
  ...changesZh,
  ...commandsZh,
  ...commitsZh,
  ...diffZh,
  ...conflictZh,
  ...fileHistoryZh,
  ...hooksZh,
  ...settingsZh,
  ...shortcutsZh,
  ...stashZh,
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
  ...workflowEn,
  ...branchesEn,
  ...tagsEn,
  ...changesEn,
  ...commandsEn,
  ...commitsEn,
  ...diffEn,
  ...conflictEn,
  ...fileHistoryEn,
  ...hooksEn,
  ...settingsEn,
  ...shortcutsEn,
  ...stashEn,
  ...storeEn,
  ...libEn,
  ...errorsEn,
};