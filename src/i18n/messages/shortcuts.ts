import type { Message } from "../types";

export const zh = {
  "shortcuts.title": "快捷键",
  "shortcuts.subtitle": "点击右侧按键后按下新的组合键即可修改",
  "shortcuts.record": "按下新的快捷键…",
  "shortcuts.cancelRecord": "取消",
  "shortcuts.reset": "恢复默认",
  "shortcuts.resetAll": "全部恢复默认",
  "shortcuts.resetDone": "快捷键已恢复默认",
  "shortcuts.rebindHint": "点击修改",
  "shortcuts.unbound": "未绑定",
  "shortcuts.conflict": "该组合键已被「{name}」占用",
  "shortcuts.needModifier": "快捷键需要包含 ⌘ / Ctrl 或 Alt",
  "shortcuts.edited": "已修改",
} as const;

export const en: Record<keyof typeof zh, Message> = {
  "shortcuts.title": "Shortcuts",
  "shortcuts.subtitle": "Click a binding, then press the new key combination",
  "shortcuts.record": "Press the new shortcut…",
  "shortcuts.cancelRecord": "Cancel",
  "shortcuts.reset": "Reset to default",
  "shortcuts.resetAll": "Reset all",
  "shortcuts.resetDone": "Shortcuts reset to defaults",
  "shortcuts.rebindHint": "Click to change",
  "shortcuts.unbound": "Unbound",
  "shortcuts.conflict": "This combination is already used by “{name}”",
  "shortcuts.needModifier": "A shortcut needs ⌘ / Ctrl or Alt",
  "shortcuts.edited": "Changed",
};