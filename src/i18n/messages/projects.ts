import type { Message } from "../types";

export const zh = {
  "projects.title": "项目",
  "projects.sortBy": "排序方式",
  "projects.sortTitle": "排序（置顶固定在最上）",
  "projects.addProject": "添加项目",
  "projects.addRepo": "添加本地仓库",
  "projects.addRepoHint": "选择一个已有的 Git 仓库文件夹",
  "projects.others": "其他项目",
  "projects.allPinned": "全部项目都已置顶",
  "projects.versionTip": "Git Kit 版本",

  "projects.removeTitle": "移除项目",
  "projects.removeDescription": "从列表中移除「{name}」，磁盘上的仓库文件不会被删除。",
  "projects.removeConfirm": "移除",
  "projects.remove": "移除项目",

  "projects.pinned": "已置顶",
  "projects.unavailable": "无法访问",
  "projects.unavailableHint": "无法访问该仓库",
  "projects.relink": "重新选择文件夹",
  "projects.openTerminal": "在该项目打开终端",
  "projects.unpin": "取消置顶",
  "projects.pin": "置顶项目",
} satisfies Record<string, Message>;

export const en: Record<keyof typeof zh, Message> = {
  "projects.title": "Projects",
  "projects.sortBy": "Sort projects",
  "projects.sortTitle": "Sort (pinned projects stay on top)",
  "projects.addProject": "Add project",
  "projects.addRepo": "Add a local repository",
  "projects.addRepoHint": "Pick a folder that already contains a Git repository",
  "projects.others": "Other projects",
  "projects.allPinned": "Every project is pinned",
  "projects.versionTip": "Git Kit version",

  "projects.removeTitle": "Remove project",
  "projects.removeDescription":
    'Removes "{name}" from the list. Files on disk are left untouched.',
  "projects.removeConfirm": "Remove",
  "projects.remove": "Remove project",

  "projects.pinned": "Pinned",
  "projects.unavailable": "Unavailable",
  "projects.unavailableHint": "This repository cannot be accessed",
  "projects.relink": "Choose the folder again",
  "projects.openTerminal": "Open a terminal in this project",
  "projects.unpin": "Unpin project",
  "projects.pin": "Pin project",
};