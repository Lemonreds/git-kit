# Code Conventions

## Naming

**TypeScript/React**:
- Components: `PascalCase` (`BranchPanel.tsx`)
- Hooks: `useCamelCase` (`useBranchActions.ts`)
- Utils: `camelCase` (`parsePatch.ts`)
- Constants: `UPPER_SNAKE_CASE` (`MAX_TERMINALS`)
- Types: `PascalCase` (`interface BranchInfo`)

**Rust**:
- Modules: `snake_case` (`git_workflow.rs` → `mod git_workflow`)
- Structs/Enums: `PascalCase` (`BranchInfo`, `AppError`)
- Functions/Variables: `snake_case` (`list_branches`)
- Constants: `UPPER_SNAKE_CASE` (`MAX_COMMIT_COUNT`)

## Component Structure

```typescript
// 1. Imports (React → third-party → local)
import { useState, useEffect } from 'react';
import { FixedSizeList } from 'react-window';
import { useBranchActions } from './useBranchActions';

// 2. Types
interface Props {
  repoPath: string;
}

// 3. Component
export function BranchPanel({ repoPath }: Props) {
  // Hooks (state → refs → context → custom → effects)
  const [selected, setSelected] = useState<string | null>(null);
  const actions = useBranchActions(repoPath);
  
  useEffect(() => {
    actions.loadBranches();
  }, [repoPath]);

  // Event handlers
  const handleClick = (name: string) => setSelected(name);

  // Render
  return <div>{/* ... */}</div>;
}
```

## State Management (Zustand)

```typescript
export interface WorkflowSlice {
  branches: BranchInfo[];
  loading: boolean;
  error: string | null;
  loadBranches: (repoPath: string) => Promise<void>;
}

export const createWorkflowSlice: StateCreator<WorkflowSlice> = (set, get) => ({
  branches: [],
  loading: false,
  error: null,
  
  loadBranches: async (repoPath) => {
    set({ loading: true, error: null });
    try {
      const branches = await ipc.listBranches(repoPath);
      set({ branches, loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },
});
```

**Rules**: One slice per domain, async ops set loading before/after, use `get()` for cross-slice access

## Styling

```tsx
// ✅ Tailwind only
<div className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100">

// ✅ Conditional
<div className={`px-4 ${isActive ? 'bg-blue-100' : 'bg-white'}`}>

// ❌ NO inline styles
<div style={{ padding: '8px' }}>  // 🚫

// ❌ NO CSS-in-JS
const styles = { container: { ... } };  // 🚫
```

## Type Safety

```typescript
// ✅ Explicit types
function process(branch: BranchInfo): string { return branch.name; }

// ✅ Return types when not obvious
async function fetch(repo: string): Promise<BranchInfo[]> { ... }

// ✅ Discriminated unions
type State = 
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: string }
  | { status: 'error'; error: string };

// ❌ NO 'any'
function process(data: any) { }  // 🚫
```

## i18n

```typescript
// ✅ Use hook
const msg = useMessages();
return <button>{msg.branches.create}</button>;

// ❌ NO hardcoded text
<button>Create Branch</button>  // 🚫
<button>创建分支</button>  // 🚫
```

## Rust Error Handling

```rust
// ✅ Use Result + ?
pub fn list_branches(path: &str) -> Result<Vec<BranchInfo>, AppError> {
    let repo = Repository::open(path)?;
    let branches = repo.branches(None)?;
    Ok(result)
}

// ✅ Convert errors
fn read_file(path: &str) -> Result<String, AppError> {
    std::fs::read_to_string(path)
        .map_err(|e| AppError::message(format!("Failed: {}", e)))?
}

// ❌ NO unwrap/expect in production
let repo = Repository::open(path).unwrap();  // 🚫
```

## Tauri Commands

```rust
// ✅ Thin layer, delegate
#[tauri::command(async)]
pub fn list_branches(repo_path: String) -> Result<BranchSummary, AppError> {
    if repo_path.is_empty() {
        return Err(AppError::message("Path empty"));
    }
    git::branches::list_branches(&repo_path)
}

// ✅ Owned types (String not &str)
#[tauri::command(async)]
pub fn create_branch(repo_path: String, name: String) -> Result<(), AppError> { ... }

// ✅ Always return Result
#[tauri::command(async)]
pub fn get_status(repo_path: String) -> Result<Status, AppError> { ... }

// ❌ NO bare returns
pub fn get_status(repo_path: String) -> Status { ... }  // 🚫 Can't propagate errors
```

## Git Operations

```rust
// ✅ Read with git2
pub fn list_branches(path: &str) -> Result<Vec<BranchInfo>, AppError> {
    let repo = Repository::open(path)?;
    // Use git2 API
}

// ✅ Write with git CLI
pub fn push_branch(path: &str, branch: &str, force: bool) -> Result<(), AppError> {
    let mut cmd = Command::new("git");
    cmd.current_dir(path).args(["push", "origin", branch]);
    if force { cmd.arg("--force-with-lease"); }
    
    let output = cmd.output()?;
    if !output.status.success() {
        return Err(AppError::git_error(String::from_utf8_lossy(&output.stderr).to_string()));
    }
    Ok(())
}

// ✅ Dangerous ops have preview
pub fn push_preview(path: &str, branch: &str) -> Result<Preview> { ... }
pub fn push_branch(path: &str, branch: &str, force: bool) -> Result<()> { ... }
```

## Git Safety Pattern

```rust
// Preview (git2, read-only)
pub fn delete_branch_preview(path: &str, branch: &str) -> Result<Preview> {
    let repo = Repository::open(path)?;
    let branch_obj = repo.find_branch(branch, git2::BranchType::Local)?;
    let is_merged = branch_obj.is_merged()?;
    
    Ok(Preview {
        branch_name: branch.to_string(),
        is_merged,
        will_lose_commits: !is_merged,
    })
}

// Execute (git CLI)
pub fn delete_branch(path: &str, branch: &str, force: bool) -> Result<()> {
    let mut cmd = Command::new("git");
    cmd.current_dir(path).args(["branch", "-d", branch]);
    if force { cmd.arg("-D"); }
    
    let output = cmd.output()?;
    if !output.status.success() {
        return Err(AppError::git_error(String::from_utf8_lossy(&output.stderr).to_string()));
    }
    Ok(())
}
```

**Frontend**:
```typescript
const preview = await ipc.deleteBranchPreview(repo, branch);
if (!preview.isMerged) {
  const ok = await confirmDialog({
    title: 'Delete Unmerged Branch?',
    message: `Will lose ${preview.commitCount} commits`,
    confirmDanger: true,
  });
  if (!ok) return;
}
await ipc.deleteBranch(repo, branch, !preview.isMerged);
```

## Comments

```typescript
// ✅ Non-obvious logic
// LRU eviction: keep 3 most recent sessions
const MAX_TERMINALS = 3;

// ✅ Workarounds
// HACK: setTimeout needed, xterm.js fit doesn't work immediately
setTimeout(() => fitAddon.fit(), 100);

// ✅ TODOs with context
// TODO: Use Web Worker to avoid blocking main thread
const result = heavyComputation();

// ❌ Obvious comments
setSelected(id);  // Set selected to id  🚫
```

```rust
// ✅ Complex algorithms
/// Calculate remote commits that will be overwritten by force push.
/// 1. Find common ancestor of local and remote
/// 2. List commits from ancestor to remote HEAD
/// 3. Those commits will be lost
pub fn calculate_overwrite(/* ... */) -> Result<Vec<String>> { ... }

// ❌ Redundant
let repo = Repository::open(path)?;  // Open repository  🚫
```

## Commit Messages

```bash
<type>: <subject>

# Types
feat:     New feature
fix:      Bug fix
refactor: Refactor (no behavior change)
docs:     Documentation
style:    Formatting
test:     Tests
chore:    Build/tools

# Examples
feat: add tag management panel
fix: terminal session not closing properly
refactor: extract branch ops to custom hook
```

## Anti-Patterns

```typescript
// ❌ Prop drilling
<Parent data={data}>
  <Child data={data}>
    <GrandChild data={data}>  // 🚫
// ✅ Use store
const data = useStore(state => state.data);

// ❌ Unhandled race conditions
useEffect(() => {
  fetchData().then(setData);  // 🚫
}, []);
// ✅ Cleanup
useEffect(() => {
  let cancelled = false;
  fetchData().then(d => !cancelled && setData(d));
  return () => { cancelled = true; };
}, []);

// ❌ Mutating state
state.branches.push(newBranch);  // 🚫
// ✅ Immutable
set({ branches: [...state.branches, newBranch] });
```

```rust
// ❌ Ignoring errors
let _ = dangerous_op();  // 🚫
// ✅ Handle
dangerous_op()?;

// ❌ String concat for paths
let path = repo + "/" + file;  // 🚫 Windows breaks
// ✅ Use Path
let path = PathBuf::from(repo).join(file);

// ❌ Blocking in async
#[tauri::command(async)]
async fn slow() {
    thread::sleep(Duration::from_secs(5));  // 🚫 Blocks executor
}
// ✅ Use tokio
#[tauri::command(async)]
async fn slow() {
    tokio::time::sleep(Duration::from_secs(5)).await;
}
```

---

**Related**: [architecture.md](./architecture.md) | [development.md](./development.md)
