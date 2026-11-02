import type { Message } from "../types";

export const zh = {
  "commits.backToBranches": "返回分支列表 (Esc)",
  "commits.history": "提交历史",
  "commits.count": "{count}{more} 次提交",
  "commits.emptyTitle": "该分支还没有提交",
  "commits.emptyDescription": "推送或创建首个提交后，这里会按时间倒序展示。",
  "commits.loading": "加载中",
  "commits.loadMore": "加载更多提交",
} satisfies Record<string, Message>;

export const en: Record<keyof typeof zh, Message> = {
  "commits.backToBranches": "Back to branches (Esc)",
  "commits.history": "Commit history",
  "commits.count": { one: "{count}{more} commit", other: "{count}{more} commits" },
  "commits.emptyTitle": "This branch has no commits yet",
  "commits.emptyDescription":
    "Once you push or create the first commit, it will be listed here newest first.",
  "commits.loading": "Loading",
  "commits.loadMore": "Load more commits",
};