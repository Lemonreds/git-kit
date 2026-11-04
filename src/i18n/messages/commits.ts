import type { Message } from "../types";

export const zh = {
  "commits.backToBranches": "返回分支列表 (Esc)",
  "commits.history": "提交历史",
  "commits.emptyTitle": "该分支还没有提交",
  "commits.emptyDescription": "推送或创建首个提交后，这里会按时间倒序展示。",
  "commits.loading": "加载中",
  "commits.loadMore": "加载更多提交",
  "commits.searchPlaceholder": "搜索提交说明、作者或 SHA",
  "commits.searchNoMatch": "已加载的提交里没有匹配项",
  "commits.searchMoreHint": "仅搜索已加载的 {count} 条提交，可加载更多后重试",
  "commits.searchCount": "{index} / {total}",
  "commits.searchPrev": "上一个匹配",
  "commits.searchNext": "下一个匹配",
  "commits.searchClose": "关闭搜索",
  "commits.searchOpen": "搜索提交历史",
} satisfies Record<string, Message>;

export const en: Record<keyof typeof zh, Message> = {
  "commits.backToBranches": "Back to branches (Esc)",
  "commits.history": "Commit history",
  "commits.emptyTitle": "This branch has no commits yet",
  "commits.emptyDescription":
    "Once you push or create the first commit, it will be listed here newest first.",
  "commits.loading": "Loading",
  "commits.loadMore": "Load more commits",
  "commits.searchPlaceholder": "Search messages, authors or SHAs",
  "commits.searchNoMatch": "No match among the loaded commits",
  "commits.searchMoreHint": "Only the {count} loaded commits are searched — load more and try again",
  "commits.searchCount": "{index} / {total}",
  "commits.searchPrev": "Previous match",
  "commits.searchNext": "Next match",
  "commits.searchClose": "Close search",
  "commits.searchOpen": "Search commit history",
};