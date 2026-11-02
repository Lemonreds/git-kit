# Development Guide

## Setup

```bash
# Prerequisites
node -v   # >= 18
rustc --version  # >= 1.70
git --version    # >= 2.30

# macOS
xcode-select --install

# Windows
# Install Visual Studio Build Tools with C++ workload

# Start dev server
npm install
npm run tauri dev   # Hot reload enabled
```

## Project Structure

```
src/                          # Frontend (React + TypeScript)
├── components/               # UI by domain (branches/tags/commits/diff/terminal/projects/workspace/settings)
├── store/slices/             # Zustand slices (11 files)
├── lib/                      # Utilities (ipc.ts, types.ts, parsePatch.ts, terminal.ts, format.ts)
├── hooks/                    # Custom hooks (useHotkeys.ts)
├── i18n/messages/            # Text translations (zh/en)
└── App.tsx, main.tsx

src-tauri/                    # Backend (Rust)
├── src/git/                  # Git logic (branches.rs, commits.rs, status.rs, diff.rs, workflow.rs, ops.rs, cli.rs, config.rs, repo.rs, tests.rs)
├── commands.rs               # IPC commands (132 commands)
├── model.rs, error.rs        # Data structures, error types
├── project_store.rs          # Project persistence
├── settings.rs               # Settings persistence
├── terminal.rs               # PTY management
└── lib.rs, main.rs

scripts/                      # Build scripts (build-mac.sh, build-win.ps1)
```

## Common Tasks

### Add Tauri Command

```rust
// 1. Define in commands.rs
#[tauri::command(async)]
pub fn my_command(repo_path: String, arg: String) -> Result<MyResult, AppError> {
    git::workflow::my_function(&repo_path, &arg)
}

// 2. Register in lib.rs
.invoke_handler(tauri::generate_handler![
    commands::my_command,  // Add here
])

// 3. Add model in model.rs (if needed)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MyResult {
    pub field: String,
}

// 4. Frontend IPC (ipc.ts)
export async function myCommand(repoPath: string, arg: string): Promise<MyResult> {
  return invoke('my_command', { repoPath, arg });
}

// 5. Use in slice
myAction: async (arg: string) => {
  set({ loading: true });
  try {
    const result = await ipc.myCommand(repo.path, arg);
    set({ result });
  } catch (error) {
    set({ error: (error as Error).message });
  } finally {
    set({ loading: false });
  }
}
```

### Add i18n Text

```typescript
// 1. src/i18n/messages/xxx.ts
export const xxxMessages = {
  en: { myKey: 'Text', withVar: 'Hello {name}' },
  zh: { myKey: '文案', withVar: '你好 {name}' },
};

// 2. Export in index.ts
export { xxxMessages } from './xxx';

// 3. Use in component
const msg = useMessages();
return <div>{msg.myKey}</div>;
```

### Add Virtual List Component

```typescript
import { FixedSizeList } from 'react-window';

function Row({ index, style, data }: { index: number; style: React.CSSProperties; data: RowData }) {
  const item = data.items[index];
  return <div style={style} onClick={() => data.onClick(item)}>{item.name}</div>;
}

function MyList({ items, onClick }: Props) {
  return (
    <FixedSizeList
      height={600}
      itemCount={items.length}
      itemSize={32}
      width="100%"
      itemData={{ items, onClick }}
    >
      {Row}
    </FixedSizeList>
  );
}
```

### Add Git Operation with Preview

```rust
// workflow.rs - Step 1: Preview (git2)
pub fn my_op_preview(repo_path: &str, branch: &str) -> Result<Preview> {
    let repo = Repository::open(repo_path)?;
    // Calculate what will happen
    Ok(Preview { will_change: vec![], is_safe: true })
}

// Step 2: Execute (git CLI)
pub fn my_op(repo_path: &str, branch: &str, force: bool) -> Result<()> {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo_path).args(["my-op", branch]);
    if force { cmd.arg("--force"); }
    
    let output = cmd.output()?;
    if !output.status.success() {
        return Err(AppError::git_error(String::from_utf8_lossy(&output.stderr).to_string()));
    }
    Ok(())
}

// commands.rs - Register both
#[tauri::command(async)]
pub fn my_op_preview(repo_path: String, branch: String) -> Result<Preview, AppError> {
    git::workflow::my_op_preview(&repo_path, &branch)
}

#[tauri::command(async)]
pub fn my_op(repo_path: String, branch: String, force: bool) -> Result<(), AppError> {
    git::workflow::my_op(&repo_path, &branch, force)
}
```

```typescript
// Frontend workflow
const preview = await ipc.myOpPreview(repo, branch);
if (!preview.isSafe && !await confirmDialog({ title: 'Warning', message: 'Dangerous!' })) return;
await ipc.myOp(repo, branch, !preview.isSafe);
await get().loadBranches();
```

## Testing

```bash
# Rust unit tests
cd src-tauri
cargo test

# Specific test
cargo test test_push_preview

# With output
cargo test -- --nocapture
```

**Write tests**:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    
    #[test]
    fn test_my_function() {
        let temp = TempDir::new().unwrap();
        let path = temp.path().to_str().unwrap();
        
        // Init repo
        Command::new("git").args(["init"]).current_dir(path).output().unwrap();
        
        // Test
        let result = my_function(path);
        assert!(result.is_ok());
    }
}
```

## Build & Package

```bash
# Development build
npm run build                    # Frontend only
npm run tauri build -- --debug   # Full app (debug)

# macOS
npm run package:mac:universal    # Intel + Apple Silicon
npm run package:mac              # Current arch
npm run package:mac:app          # .app only (no DMG)

# Code signing (edit scripts/build-mac.sh)
IDENTITY="Developer ID Application: Name (XXXXXXXXXX)"

# Windows
npm run package:win              # Both MSI and NSIS
npm run package:win:msi          # MSI only
npm run package:win:nsis         # NSIS only
```

**Output**:
- macOS: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`
- Windows MSI: `src-tauri/target/release/bundle/msi/`
- Windows NSIS: `src-tauri/target/release/bundle/nsis/`

## Debugging

**Frontend**: DevTools auto-opens in `npm run tauri dev`

**Backend**:
```rust
eprintln!("[DEBUG] value: {:?}", value);
dbg!(&value);
```

**IPC** (add to `ipc.ts`):
```typescript
console.log(`[IPC →] ${cmd}`, args);
const result = await tauriInvoke<T>(cmd, args);
console.log(`[IPC ←] ${cmd}`, result);
```

**Terminal**:
```rust
// terminal.rs
eprintln!("[PTY] session={}, len={}", id, data.len());
```

## Performance Profiling

**Frontend**: React DevTools Profiler tab, Chrome Performance tab

**Backend**:
```bash
cargo install flamegraph
cargo flamegraph --bin git-kit
```

**Manual timing**:
```rust
let start = Instant::now();
expensive_op();
eprintln!("Took: {:?}", start.elapsed());
```

## Common Issues

**"git not found"**: Ensure Git installed (macOS: `xcode-select --install`, Windows: Git for Windows)

**"Permission denied"**: Check filesystem permissions, macOS: grant "Full Disk Access" in System Preferences

**Terminal blank**: Check PTY logs, run `cargo test` in `src-tauri`

**Hot reload broken**: Restart `npm run tauri dev`, clear cache: `rm -rf node_modules/.vite`, `cargo clean` (slow)

**High memory**: Profile with Chrome DevTools Memory tab, check terminal session leaks

## Git Workflow

```bash
git checkout -b feature/my-feature
git add .
git commit -m "feat: add feature"
git push -u origin feature/my-feature
gh pr create --title "feat: add feature"
```

## Release Process

1. Update version: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
2. Create tag: `git tag v0.0.4 && git push origin v0.0.4`
3. GitHub Actions auto-builds and creates release
4. Test downloaded artifacts on clean machines

---

**Related**: [architecture.md](./architecture.md) | [conventions.md](./conventions.md)
