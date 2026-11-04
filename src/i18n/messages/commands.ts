import type { Message } from "../types";

export const zh = {
  "command.palette": "命令面板",
  "command.refresh": "刷新仓库",
  "command.addProject": "添加项目",
  "command.settings": "打开设置",
  "command.terminal": "显示 / 隐藏终端",
  "command.paneBranches": "分支",
  "command.paneChanges": "改动",
  "command.paneStash": "贮藏",
  "command.paneTags": "标签",
  "command.paneWorkflows": "工作流",
  "command.commitSearch": "搜索提交",
  "command.fetch": "拉取所有远程引用",
  "command.fileHistory": "当前文件的历史",
  "command.blame": "当前文件的逐行追溯",
  "command.saveConflict": "保存冲突解决",
  "command.findInDiff": "在差异中查找",

  "command.groupApp": "应用",
  "command.groupNavigation": "导航",
  "command.groupRepository": "仓库",

  "command.palettePlaceholder": "搜索命令、面板或工作流…",
  "command.paletteEmpty": "没有匹配的命令",
  "command.paletteHint": "↑↓ 选择 · Enter 执行 · Esc 关闭",
  "command.groupWorkflows": "运行工作流",
} as const;

export const en: Record<keyof typeof zh, Message> = {
  "command.palette": "Command palette",
  "command.refresh": "Refresh repository",
  "command.addProject": "Add project",
  "command.settings": "Open settings",
  "command.terminal": "Show / hide terminal",
  "command.paneBranches": "Branches",
  "command.paneChanges": "Changes",
  "command.paneStash": "Stash",
  "command.paneTags": "Tags",
  "command.paneWorkflows": "Workflows",
  "command.commitSearch": "Search commits",
  "command.fetch": "Fetch all remotes",
  "command.fileHistory": "History of the open file",
  "command.blame": "Blame the open file",
  "command.saveConflict": "Save conflict resolution",
  "command.findInDiff": "Find in diff",

  "command.groupApp": "App",
  "command.groupNavigation": "Navigation",
  "command.groupRepository": "Repository",

  "command.palettePlaceholder": "Search commands, panes or workflows…",
  "command.paletteEmpty": "No matching command",
  "command.paletteHint": "↑↓ select · Enter run · Esc close",
  "command.groupWorkflows": "Run a workflow",
};