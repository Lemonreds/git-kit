# Git Kit - AI Context

> Quick reference for AI agents. For detailed docs, see [.ai/README.md](.ai/README.md)

## Project Overview

**Tech**: Tauri 2 + React 19 + Rust | **Type**: Git desktop client for team collaboration

**Stack**: Zustand + Tailwind v4 + react-window (frontend) | git2 + portable-pty (backend)

## File Navigation Map

| What | Where |
|------|-------|
| **Branch UI** | `src/components/branches/BranchPanel.tsx` |
| **Branch state** | `src/store/slices/branchSlice.ts`, `workflowSlice.ts` |
| **Branch logic (backend)** | `src-tauri/src/git/branches.rs` (read), `workflow.rs` (write) |
| **Tag UI** | `src/components/tags/TagsPanel.tsx`, `VirtualTagList.tsx` |
| **Commit UI** | `src/components/commits/CommitPanel.tsx` |
| **Commit state** | `src/store/slices/commitsSlice.ts` |
| **Changes UI** | `src/components/changes/ChangesPanel.tsx` |
| **Diff UI** | `src/components/diff/DiffPanel.tsx` |
| **Terminal UI** | `src/components/terminal/Terminal.tsx` |
| **Terminal state** | `src/store/slices/terminalSlice.ts` (LRU, max 3 sessions) |
| **Terminal backend** | `src-tauri/src/terminal.rs` (PTY management) |
| **Project list** | `src/components/projects/ProjectList.tsx` |
| **Layout** | `src/components/workspace/WorkspacePanel.tsx`, `PaneTabs.tsx` |
| **i18n text** | `src/i18n/messages/*.ts` (zh/en) |
| **IPC layer** | `src/lib/ipc.ts` (frontend) ↔ `src-tauri/src/commands.rs` (132 commands) |
| **Data models** | `src-tauri/src/model.rs` |
| **Git core** | `src-tauri/src/git/` (11 files: repo, workflow, branches, commits, status, diff, ops, cli, config) |

## Core Rules

### Frontend
- **State**: Zustand only, one slice per domain
- **Style**: Tailwind CSS v4 only, NO inline styles or CSS-in-JS
- **Lists**: Use `react-window` for >100 items (ref: `tags/VirtualTagList.tsx`)
- **i18n**: All text via `useMessages()`, NO hardcoded strings

### Backend
- **Read ops**: `git2` crate (libgit2) - fast, local-only
- **Write ops**: `git` CLI - reuses user's SSH/credentials
- **Errors**: Always `Result<T, AppError>`, NO `unwrap()`/`expect()` (except tests)
- **Dangerous ops**: Must have `xxx_preview()` + user confirmation + safe flags (`--force-with-lease`)

### IPC Pattern
```rust
// commands.rs - thin validation layer
#[tauri::command(async)]
pub fn my_command(repo_path: String) -> Result<Data, AppError> {
    git::module::my_function(&repo_path)  // delegate
}
```

```typescript
// ipc.ts - type-safe wrapper
export async function myCommand(repoPath: string): Promise<Data> {
  return invoke('my_command', { repoPath });
}
```

## Common Tasks

### Add Git Feature
1. Backend: `commands.rs` → add `#[tauri::command]`
2. Register: `lib.rs` → `invoke_handler![...]`
3. Model: `model.rs` → define struct
4. Frontend: `ipc.ts` → add typed function
5. State: `slices/xxxSlice.ts` → add action
6. i18n: `i18n/messages/xxx.ts` → add text

### Add Dangerous Operation
```rust
// Step 1: Preview (git2, read-only)
pub fn delete_branch_preview(repo_path: &str, branch: &str) -> Result<Preview> { ... }

// Step 2: Execute (git CLI)
pub fn delete_branch(repo_path: &str, branch: &str, force: bool) -> Result<()> { ... }
```

```typescript
// Frontend: preview → confirm → execute
const preview = await ipc.deleteBranchPreview(repo, branch);
if (!preview.isMerged && !await confirmDialog()) return;
await ipc.deleteBranch(repo, branch, !preview.isMerged);
```

## Critical Gotchas

### macOS
- **vendored libgit2 REQUIRED**: `Cargo.toml` has `features = ["vendored-libgit2"]` - DO NOT change
- **Why**: Dynamic linking breaks .app on other Macs (missing dylib/signature)

### Windows
- **Paths**: Use `std::path::Path`, never concat `/` or `\` manually

### Performance
- **Large repos**: Pagination required (branches/commits)
- **Large diffs**: >10MB files show "too large", don't render

### Tech Debt
- Terminal LRU may race when rapidly opening/closing
- Rebase state machine needs FSM refactor

## Architecture

```
React Components → Zustand Slices → ipc.ts
         ↓ Tauri IPC (JSON)
commands.rs → git/* modules
         ↓
    git2 (read) / git CLI (write)
```

**Example flow** (push branch):
`BranchPanel` → `workflowSlice.pushWithPreview()` → `ipc.pushPreview()` → `commands::push_preview()` → `workflow::push_preview()` (git2) → show preview → user confirms → `ipc.pushBranch()` → `workflow::push_branch()` (git CLI: `git push --force-with-lease`)

## Dependencies

**Runtime**: Git CLI v2.30+, user's SSH/credential config  
**Build**: Node 18+, Rust 1.70+, Xcode CLI (macOS), VS Build Tools (Windows)  
**Key libs**: zustand, react-window, lucide-react, @xterm/xterm (frontend) | git2, portable-pty, serde (backend)

## Debug

**Frontend**: DevTools auto-opens in `npm run tauri dev`  
**Backend**: `eprintln!("[DEBUG] {:?}", var);` or `dbg!(var);`  
**IPC**: Log in `ipc.ts` wrapper  
**Tests**: `cd src-tauri && cargo test`

---

**More details**: [architecture.md](./architecture.md) | [development.md](./development.md) | [conventions.md](./conventions.md)  
**Last updated**: 2024-01-15 | **Maintainer**: @Lemonreds
