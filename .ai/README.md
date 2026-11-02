# AI Documentation Guide

## For AI Agents

**Start here**: Read `context.md` (~5KB, 135 lines) - it has:
- File navigation map (where everything is)
- Core rules (must-follow conventions)
- Common task patterns
- Critical gotchas

**Reference on-demand**: Other docs for specific needs:
- `architecture.md` - system design, data flows, ADRs
- `development.md` - setup, debugging, packaging
- `conventions.md` - detailed code style

**Don't**: Read all docs at session start (wastes tokens)

## For Human Developers

Start with `README.md`, then:
- Setup → `development.md`
- Architecture → `architecture.md`
- Style questions → `conventions.md`
- Quick reference → `context.md`

## Document Sizes

| File | Size | Lines | Purpose |
|------|------|-------|---------|
| `context.md` | 5KB | 135 | Entry point (read every session) |
| `architecture.md` | 7KB | 180 | System design (read when needed) |
| `development.md` | 6KB | 165 | Setup & debug (read when needed) |
| `conventions.md` | 7KB | 200 | Code style (read when needed) |

**Total**: ~25KB / 680 lines (was 70KB / 2400 lines - **64% smaller**)

## Maintenance

**Update when**:
- Major refactor → `architecture.md`
- New module → Add to `context.md` file map
- New gotcha → Add to `context.md` warnings
- Style change → `conventions.md`

**Keep lean**: `context.md` should stay <10KB

---

This `.ai/` directory provides AI-optimized context. Compatible with Claude / GPT-4 / Cursor / Copilot / Windsurf.
