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

---

**Related**: [development.md](./development.md) | [conventions.md](./conventions.md)
