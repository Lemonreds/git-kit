#!/usr/bin/env node
/**
 * Bump the app version in every place that carries it.
 *
 * The version lives in five files (frontend package, Tauri bundle config, Rust
 * crate and their two lock files). Bumping them by hand is how versions drift
 * apart, so release builds call this script instead:
 *
 *   node scripts/bump-version.mjs              # 0.0.2 -> 0.0.3
 *   node scripts/bump-version.mjs --set 0.3.0  # exact version
 *   node scripts/bump-version.mjs --dry-run    # print, write nothing
 *
 * The UI reads the version at runtime through `getVersion()` (Tauri), which in
 * turn reads tauri.conf.json — so no frontend code needs to change.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const setAt = args.indexOf("--set");
const explicitVersion = setAt >= 0 ? args[setAt + 1] : null;

const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const write = (rel, text) => {
  if (!dryRun) writeFileSync(path.join(root, rel), text);
};

const current = JSON.parse(read("package.json")).version;

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) throw new Error(`当前版本号无法解析：${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

const next = explicitVersion ? explicitVersion.trim() : bumpPatch(current);
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  throw new Error(`目标版本号格式不合法（需要 X.Y.Z）：${next}`);
}

const old = current.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const failures = [];
/** Staged file contents: nothing is written unless every file checks out. */
const updates = new Map();

/**
 * Stage a replacement of exactly `count` occurrences of `pattern`. `build`
 * receives the regex match groups and returns the replacement text.
 */
function replaceCount(rel, pattern, count, label, build) {
  const text = read(rel);
  const matches = text.match(pattern) ?? [];
  if (matches.length < count) {
    failures.push(`${rel}：期望找到 ${count} 处${label}，实际 ${matches.length} 处`);
    return;
  }
  let replaced = 0;
  updates.set(
    rel,
    text.replace(pattern, (...groups) => {
      if (replaced >= count) return groups[0];
      replaced += 1;
      return build(groups);
    }),
  );
}

const stringVersion = `"${next}"`;
const jsonVersion = `"version": ${stringVersion}`;
const tomlVersion = `version = ${stringVersion}`;
const jsonVersionPattern = new RegExp(`"version":\\s*"${old}"`, "g");

// 1. package.json (root version)
replaceCount("package.json", jsonVersionPattern, 1, "项目版本", () => jsonVersion);
// 2. package-lock.json: the root entry and packages[""] both carry it
replaceCount("package-lock.json", jsonVersionPattern, 2, "lock 版本", () => jsonVersion);
// 3. Tauri bundle config (drives .app / .dmg / .msi version and getVersion())
replaceCount("src-tauri/tauri.conf.json", jsonVersionPattern, 1, "Tauri 版本", () => jsonVersion);
// 4. Rust crate version
replaceCount("src-tauri/Cargo.toml", new RegExp(`^version = "${old}"`, "gm"), 1, "Cargo 版本", () => tomlVersion);
// 5. Cargo.lock entry of this crate only (dependencies keep their own versions)
replaceCount(
  "src-tauri/Cargo.lock",
  new RegExp(`(name = "git-kit"\\r?\\nversion = )"${old}"`, "g"),
  1,
  "Cargo.lock 版本",
  ([, prefix]) => `${prefix}${stringVersion}`,
);

if (failures.length > 0) {
  console.error("✗ 版本号没能完全同步（未写入任何文件）：");
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}

for (const [rel, text] of updates) write(rel, text);

console.log(`${dryRun ? "[dry-run] " : ""}版本号 ${current} → ${next}`);
console.log(
  "  已同步：package.json · package-lock.json · tauri.conf.json · Cargo.toml · Cargo.lock",
);