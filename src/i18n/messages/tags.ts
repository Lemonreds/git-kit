import type { Message } from "../types";

/**
 * The tags pane: list / search / create / delete plus the remote comparison.
 * Everything here is a tag-specific label — pipeline operations still live under
 * `branches.action*`.
 */
export const zh = {
  "tags.badge": "标签",
  "tags.create": "新建标签",
  "tags.refresh": "重新读取标签",
  "tags.working": "处理中",
  "tags.pushAll": "推送全部标签",
  "tags.syncRemote": "同步远程标签（联网）",

  "tags.filterPlaceholder": "搜索标签名 / 说明 / 提交号",
  "tags.clearFilter": "清除搜索",
  "tags.filterAll": "全部",
  "tags.filterUnpushed": "未推送",
  "tags.filterPushed": "已推送",

  "tags.loadMore": "加载更多 +{page}",
  "tags.loadMoreTip": "再显示 {page} 个标签（已显示 {shown} / 共 {total}）",
  "tags.showing": "已显示 {shown} / {total}",

  "tags.remoteSummary": "远程 {remote}：{count} 个标签",
  "tags.remoteMissing": "该仓库没有远程地址，只显示本地标签",
  "tags.remoteFailure": "读取远程标签失败：{error}",
  "tags.remoteOnlyHint": "远程还有 {count} 个标签未拉取，可执行 git fetch --tags。",
  "tags.syncedAt": "同步于 {time}",

  "tags.emptyTitle": "还没有标签",
  "tags.emptyDescription": "发布时打一个标签，之后就能随时回到这次提交。",
  "tags.noMatchTitle": "没有匹配的标签",
  "tags.noMatchDescription": "换个关键词，或清除上面的筛选条件。",

  "tags.annotated": "附注",
  "tags.lightweight": "轻量",
  "tags.new": "新增",
  "tags.noSummary": "（没有提交摘要）",

  "tags.push": "推送该标签到远程",
  "tags.copyName": "复制标签名",
  "tags.copied": "已复制标签名 {name}",
  "tags.delete": "删除标签",
  "tags.viewCommits": "查看该标签的提交",

  "tags.unpushed": "该标签只在本地，尚未推送到远程",
  "tags.pushedTip": "远程上已有同名标签",

  "tags.createTitle": "新建标签",
  "tags.createSubtitle": "给一次发布一个不会移动的名字",
  "tags.name": "标签名",
  "tags.namePlaceholder": "v1.0.0",
  "tags.target": "目标（分支 / 提交）",
  "tags.targetPlaceholder": "HEAD",
  "tags.message": "说明（填写则创建附注标签）",
  "tags.messagePlaceholder": "例如：生产发布 2026-10-29",
  "tags.createAction": "创建标签",
  "tags.cancel": "取消",

  "tags.deleteTitle": "删除标签 {name}？",
  "tags.deleteLocalBody": "只删除本地标签，远程上的同名标签不受影响。",
  "tags.deleteRemoteBody":
    "先删除本地标签，随后删除远程上的同名标签；远程标签一旦删除，无法从远程恢复。",
  "tags.deleteRemoteLabel": "同时删除远程上的同名标签",
  "tags.deleteRemoteHint": "默认不勾选；勾选后远程标签一并删除。",
  "tags.confirmDelete": "删除",
};

export const en: Record<keyof typeof zh, Message> = {
  "tags.badge": "Tag",
  "tags.create": "New tag",
  "tags.refresh": "Reload the tags",
  "tags.working": "Working",
  "tags.pushAll": "Push all tags",
  "tags.syncRemote": "Compare with the remote tags (network)",

  "tags.filterPlaceholder": "Search name / message / commit",
  "tags.clearFilter": "Clear the search",
  "tags.filterAll": "All",
  "tags.filterUnpushed": "Not pushed",
  "tags.filterPushed": "Pushed",

  "tags.loadMore": "Load more +{page}",
  "tags.loadMoreTip": "Show {page} more tags ({shown} of {total} shown)",
  "tags.showing": "{shown} of {total} shown",

  "tags.remoteSummary": "Remote {remote}: {count} tags",
  "tags.remoteMissing": "This repository has no remote; only local tags are listed",
  "tags.remoteFailure": "Could not read the remote tags: {error}",
  "tags.remoteOnlyHint":
    "{count} remote tags are missing locally — use git fetch --tags.",
  "tags.syncedAt": "synced {time}",

  "tags.emptyTitle": "No tags yet",
  "tags.emptyDescription": "Tag a release and you can always come back to that commit.",
  "tags.noMatchTitle": "No matching tags",
  "tags.noMatchDescription": "Try another keyword, or clear the filters above.",

  "tags.annotated": "Annotated",
  "tags.lightweight": "Lightweight",
  "tags.new": "New",
  "tags.noSummary": "(no commit summary)",

  "tags.push": "Push this tag to the remote",
  "tags.copyName": "Copy the tag name",
  "tags.copied": "Copied the tag name {name}",
  "tags.delete": "Delete tag",
  "tags.viewCommits": "Show the commits of this tag",

  "tags.unpushed": "Only exists locally, not pushed yet",
  "tags.pushedTip": "The remote has a tag with this name",

  "tags.createTitle": "New tag",
  "tags.createSubtitle": "Give a release a name that never moves",
  "tags.name": "Tag name",
  "tags.namePlaceholder": "v1.0.0",
  "tags.target": "Target (branch / commit)",
  "tags.targetPlaceholder": "HEAD",
  "tags.message": "Description (fills in an annotated tag)",
  "tags.messagePlaceholder": "e.g. production release 2026-10-29",
  "tags.createAction": "Create tag",
  "tags.cancel": "Cancel",

  "tags.deleteTitle": "Delete tag {name}?",
  "tags.deleteLocalBody": "Only the local tag is deleted; the remote one stays.",
  "tags.deleteRemoteBody":
    "The local tag is deleted first, then the same tag on the remote; a deleted remote tag cannot be restored from the remote.",
  "tags.deleteRemoteLabel": "Also delete the same tag on the remote",
  "tags.deleteRemoteHint": "Unchecked by default; when checked the remote tag is deleted too.",
  "tags.confirmDelete": "Delete",
};