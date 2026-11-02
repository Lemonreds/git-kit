import type { Message } from "../types";

export const zh = {
  "terminal.panel": "终端",
  "terminal.exited": "已退出",
  "terminal.exitedTip": "进程已退出",
  "terminal.exitedTipWithCode": "进程已退出（退出码 {code}）",
  "terminal.closeTab": "关闭 {name} 的终端",
  "terminal.openInCurrent": "在当前项目打开终端",
  "terminal.clear": "清屏",
  "terminal.collapse": "收起终端面板",
  "terminal.openFailed": "无法打开终端",
} satisfies Record<string, Message>;

export const en: Record<keyof typeof zh, Message> = {
  "terminal.panel": "Terminal",
  "terminal.exited": "Exited",
  "terminal.exitedTip": "The process has exited",
  "terminal.exitedTipWithCode": "The process exited with code {code}",
  "terminal.closeTab": "Close the terminal for {name}",
  "terminal.openInCurrent": "Open a terminal in the current project",
  "terminal.clear": "Clear terminal",
  "terminal.collapse": "Collapse the terminal panel",
  "terminal.openFailed": "Could not open the terminal",
};