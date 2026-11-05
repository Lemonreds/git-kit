# Architecture Overview

## System Architecture

```
React Components (branches/tags/commits/diff/terminal/projects/workspace)
         ↓
Zustand Store (11 slices: workflow/branch/commits/terminal/diff/ui...)
         ↓
IPC Layer (src/lib/ipc.ts ↔ src-tauri/src/commands.rs - 132 commands)
         ↓
Business Modules (git/project_store/settings/terminal/model/error)
         ↓
    git2 (read)  |  git CLI (write)
```

## Key Modules

### workflowSlice.ts - Git Workflow Orchestrator
**Responsibilities**: Coordinate Git operations (push/pull/rebase/merge), state machine (preview → confirm → execute)

**Key State**:
```typescript
{
  currentOperation: 'push' | 'pull' | 'rebase' | 'merge' | null,
  pushPreview: PushPreview | null,
  rebaseState: 'idle' | 'in-progress' | 'conflict' | 'completed',
  loading: boolean,
  error: string | null,
}
```

### git/workflow.rs - Backend Core (941 lines)
**Responsibilities**: All Git write operations, generate previews, invoke git CLI

**Key Functions**:
```rust
pub fn push_preview(repo_path: &str, branch: &str) -> Result<PushPreview>
pub fn push_branch(repo_path: &str, branch: &str, force: bool) -> Result<PushResult>
pub fn pull_preview(repo_path: &str, branch: &str) -> Result<PullPreview>
pub fn rebase_preview(repo_path: &str, branch: &str, onto: &str) -> Result<RebasePreview>
pub fn rebase_branch(repo_path: &str, branch: &str, onto: &str) -> Result<RebaseResult>
```

**Safety**: All force pushes use `--force-with-lease`, check branch merged before delete, verify worktree clean before rebase

### terminal.rs - PTY Management
```rust
pub struct TerminalManager {
    sessions: HashMap<String, Session>,
}

// Lifecycle: terminal_open → terminal_write → terminal_resize → terminal_close
```

### IPC Layer
**Frontend** (`ipc.ts`):
```typescript
export async function listBranches(repoPath: string): Promise<BranchSummary> {
  return invoke('list_branches', { repoPath });
}
```

**Backend** (`commands.rs`):
```rust
#[tauri::command(async)]
pub fn list_branches(repo_path: String) -> Result<BranchSummary, AppError> {
    git::branches::list_branches(&repo_path)  // delegate
}
```

## Data Flow Examples

### Read: List Branches
```
User switches project → projectSlice.setActiveProject()
  → workflowSlice.loadBranches()
  → ipc.listBranches(repoPath)
  → commands::list_branches()
  → git::branches::list_branches() (git2)
  → Return BranchInfo[] → Update state → Render
```

### Write: Push Branch (with Preview)
```
User clicks push → workflowSlice.pushWithPreview()
  → ipc.pushPreview() → git::workflow::push_preview() (git2 reads refs)
  → Show preview dialog → User confirms
  → ipc.pushBranch(force=true)
  → git::workflow::push_branch() → git push --force-with-lease
  → Reload branches → Show result
```

### Terminal Session
```
User opens terminal → terminalSlice.openTerminal()
  → ipc.terminalOpen() → terminal::terminal_open()
  → Create PTY (openpty/ConPTY) → Start reader thread
  → Frontend loads xterm.js → Mount terminal
  → User input → terminal.onData → ipc.terminalWrite() → PTY.write()
  → PTY output → Backend event → terminal.write()
  → LRU eviction when >3 sessions
```

## Architecture Decisions (ADRs)

### ADR-001: Read/Write Separation
**Decision**: Read ops use git2, write ops use git CLI  
**Reason**: git2 is fast for local reads, git CLI reuses user's SSH/credentials (avoid reimplementing auth)  
**Tradeoff**: Write ops slower (subprocess spawn) but acceptable

### ADR-002: Zustand over Redux
**Reason**: Less boilerplate, native TypeScript, supports async actions  
**Tradeoff**: No Redux DevTools (acceptable for project scale)

### ADR-003: Built-in Terminal
**Reason**: User feedback - GUI can't cover all Git commands, need quick access  
**Limitation**: Max 3 sessions (LRU), no tmux/screen support

### ADR-004: macOS Vendored libgit2
**Problem**: Dynamic linking breaks .app on other Macs (missing dylib/signature)  
**Solution**: Static link libgit2 (vendored-libgit2 feature)  
**Tradeoff**: +2MB binary size

### ADR-005: Virtual Scrolling
**Reason**: Large repos may have 1000+ branches/tags, rendering all DOM causes lag  
**Implementation**: react-window (FixedSizeList), only render visible items

## Tech Stack Rationale

| Layer | Tech | Why |
|-------|------|-----|
| Desktop | Tauri 2 | ~15MB vs Electron ~100MB, native performance |
| Frontend | React 19 | Mature ecosystem, React Compiler optimization |
| State | Zustand | Lightweight, type-safe, no boilerplate |
| Styling | Tailwind v4 | Fast dev, tree-shaking |
| Lists | react-window | Performance for large lists |
| Backend | Rust | Memory safety, performance |
| Git read | git2 | Fast, local-only |
| Git write | git CLI | Reuse user credentials |
| Terminal | portable-pty | Cross-platform (openpty/ConPTY) |
| Terminal UI | xterm.js | Full-featured, widely used |

## Performance Strategies

**Frontend**: Virtual scrolling, lazy load xterm.js, 300ms search debounce, React.memo for diff  
**Backend**: Pagination (branches/commits), incremental updates  
**IPC**: Batch operations, stream large diffs via events

## Security

**Git Safety**: Preview before dangerous ops, `--force-with-lease` only, check merged before delete  
**Filesystem**: Path normalization (prevent traversal), permission checks  
**Process**: Terminal process isolation, timeout (prevent zombies)

## Known Limitations

**Terminal**: No tmux/screen, no graphical TUI, max 3 sessions  
**Git**: No Git LFS (needs config), no submodule visualization  
**Performance**: Large repos (>10GB) may lag, diff limited to 10MB files  
**Platforms**: macOS + Windows only (Linux planned)

**Files**:
- `src/components/conflict/ConflictPanel.tsx` — conflict resolver view (header, batch actions, special states)
- `src/components/conflict/MergeFileView.tsx` — the whole file as one continuous code stream (context + conflict segments, folding, chunking)
- `src/components/conflict/ConflictHunk.tsx` — one inline conflict region: code lens (accept current / incoming / both), stacked sides, resolved text and its editor
- `src/components/history/FileHistoryPanel.tsx` — diff / history / blame tabs of one file
- `src/components/history/VirtualHistoryList.tsx`, `VirtualBlameList.tsx` — virtualised lists
- `src/store/slices/conflictSlice.ts`, `src/store/slices/fileHistorySlice.ts` — state + IPC orchestration
- `src/lib/parseConflicts.ts` — conflict marker parser / assembler (pure functions)
- `src-tauri/src/git/conflict.rs` — conflict stages read + resolution write
- `src-tauri/src/git/history.rs` — blame windows + rename-following file history

### Conflict Resolution (§3.4)

**Responsibilities**: read the three index stages of a conflicted path, let the user resolve it block by block in the diff column, write the result back atomically and stage it.

**Data flow (read)**:
```
ChangesPanel / RepoStateBanner → openConflict(path)
  → list_conflicts        (one index.conflicts() walk: kind + stages)
  → get_conflict_file     (ours / theirs / ancestor blobs + worktree text + eol + labels)
  → parseConflictFile()   (single pass, blocks = line ranges, one copy of the text)
  → ConflictPanel         (drafts only; nothing is written until Save)
```

**Data flow (write)**:
```
Save → assembleConflictFile(parsed, drafts)
  → resolve_conflict(path, content)
  → validate path is still conflicted → atomic write (temp + rename) → git add -- <path>
  → RepoOperationState → refreshChanges + next conflicted file
```

**Caps**: 1.5 MB / 40k lines per side (`complete=false` disables block editing and saving),
2000-line blame windows, 500 history rows.

### Windows (§3.6)

**Model**: the main window owns the project list; opening a folder **replaces** the
project it was opened from (one window, one repository). Extra windows are created
with `?project=<id>` (`open_project_window`) and keep only that repository: the
project column is hidden, and `bootstrap` never falls back to `last_active`.

```
ProjectRow → openProjectWindow(id) → commands::open_project_window
  → WebviewWindow(project-<id>, "index.html?project=<id>", title = repo name)
  → bootstrap(): activeProject = projects.find(id === ?project)   (no set_active_project)
```

**Caveats**: PTY sessions live in Rust with a global cap (3); the persisted
`last_active` pointer is still global, so a window opening a folder rewrites it.

### Inline Blame (§3.7)

**Responsibilities**: show, per line of the diff, which commit last touched it.

```
DiffViewer → useInlineBlame({path, rev, maxLine})
  → lib/inlineBlame.ts windows (500 lines, cap 2500, LRU 32)
  → file_blame(repoPath, path, start, end, rev)   // rev null = working tree
  → UnifiedDiff/SplitDiff → BlameNote (select-none, tooltip = sha/author/summary)
```

Cache invalidation rides on `invalidateCaches()` (commit / checkout / refresh).
Failures are remembered and never retried, so a repo without blame support just
renders the diff without annotations.

### File History / Blame (§3.5)

**Responsibilities**: list the commits that touched one path and attribute every line of it.

**Data flow**:
```
DiffPanel header → openFileHistory(path, rev)
  → file_history (git log --follow, bounded) → virtualised commit list
  → selectHistoryCommit → get_file_diff(sha, path) → DiffViewer

Blame tab → file_blame(path, start, end, rev) → window of hunks + line texts
  → mergeHunks / mergeLines → VirtualBlameList (window requested near the end)
```

**Why the CLI here**:
- `git blame --line-porcelain -L a,b` abouts an *arbitrary revision* correctly. libgit2's
  `blame_file` always reads the working-directory copy, so blaming an older commit through
  it would attribute lines of a different file version.
- `git log --follow` follows renames; a revwalk + per-commit tree diff cannot, and would be
  far slower on a long history.

### Diff column view priority

The right column is one surface with four owners, resolved in this order:
`conflict → file history → worktree diff → commit diff`. `clearDetail()` closes the first two
when the repository context changes (project switch, pane switch, back-to-branches).

---

**Related**: [development.md](./development.md) | [conventions.md](./conventions.md)
