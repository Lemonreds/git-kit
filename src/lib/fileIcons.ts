/**
 * File icons for the change lists.
 *
 * lucide has no per-language marks, so the shape carries the *kind* of file and
 * the colour carries the language (TypeScript blue, Rust orange, …). Two lookups
 * are enough for every path: an exact file name first (`Dockerfile`,
 * `package.json`), then the last extension. Unmatched paths get the generic
 * page glyph, which is also what directory-less binary blobs end up with.
 *
 * The tone strings are Tailwind utilities, not inline styles: Tailwind scans
 * this module and emits them, and the palette keeps working in both themes.
 */

import type { LucideIcon } from "lucide-react";
import {
  Binary,
  BookOpen,
  Container,
  Cpu,
  Database,
  File,
  FileArchive,
  FileAudio,
  FileBraces,
  FileCode,
  FileCode2,
  FileCog,
  FileImage,
  FileJson,
  FileKey,
  FileLock,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideo,
  FlaskConical,
  GitBranch,
  Hash,
  Palette,
  Settings2,
} from "lucide-react";

export interface FileGlyph {
  icon: LucideIcon;
  /** Tailwind text colour class applied to the glyph. */
  tone: string;
}

const PLAIN: FileGlyph = { icon: File, tone: "text-ink-faint" };
const CODE: FileGlyph = { icon: FileCode, tone: "text-ink-soft" };

/** Exact file names win over extensions (`package.json` is not just JSON). */
const BY_NAME: Record<string, FileGlyph> = {
  dockerfile: { icon: Container, tone: "text-[#2496ed]" },
  "docker-compose.yml": { icon: Container, tone: "text-[#2496ed]" },
  "docker-compose.yaml": { icon: Container, tone: "text-[#2496ed]" },
  ".dockerignore": { icon: Container, tone: "text-ink-faint" },
  makefile: { icon: FileCog, tone: "text-[#c96a3f]" },
  cmakelists: { icon: FileCog, tone: "text-[#c96a3f]" },
  "cmakelists.txt": { icon: FileCog, tone: "text-[#c96a3f]" },
  justfile: { icon: FileCog, tone: "text-[#c96a3f]" },
  rakefile: { icon: FileCog, tone: "text-[#cc342d]" },
  gemfile: { icon: FileCog, tone: "text-[#cc342d]" },
  procfile: { icon: FileCog, tone: "text-ink-faint" },
  ".gitignore": { icon: GitBranch, tone: "text-[#f1502f]" },
  ".gitattributes": { icon: GitBranch, tone: "text-[#f1502f]" },
  ".gitmodules": { icon: GitBranch, tone: "text-[#f1502f]" },
  ".gitkeep": { icon: GitBranch, tone: "text-ink-faint/70" },
  ".editorconfig": { icon: Settings2, tone: "text-ink-faint" },
  ".env": { icon: FileKey, tone: "text-[#ecd53f]" },
  ".npmrc": { icon: Settings2, tone: "text-ink-faint" },
  ".nvmrc": { icon: Settings2, tone: "text-ink-faint" },
  ".prettierrc": { icon: FileJson, tone: "text-[#56b3b4]" },
  ".eslintrc": { icon: FileJson, tone: "text-[#7b7be0]" },
  "package.json": { icon: FileBraces, tone: "text-[#cb3837]" },
  "package-lock.json": { icon: FileLock, tone: "text-ink-faint" },
  "pnpm-lock.yaml": { icon: FileLock, tone: "text-ink-faint" },
  "yarn.lock": { icon: FileLock, tone: "text-ink-faint" },
  "cargo.toml": { icon: FileCog, tone: "text-[#dea584]" },
  "cargo.lock": { icon: FileLock, tone: "text-ink-faint" },
  "go.mod": { icon: FileCog, tone: "text-[#00add8]" },
  "go.sum": { icon: FileLock, tone: "text-ink-faint" },
  license: { icon: BookOpen, tone: "text-warning" },
  licence: { icon: BookOpen, tone: "text-warning" },
  "license.md": { icon: BookOpen, tone: "text-warning" },
  readme: { icon: BookOpen, tone: "text-accent" },
  "readme.md": { icon: BookOpen, tone: "text-accent" },
  "readme.txt": { icon: BookOpen, tone: "text-accent" },
};

/** Extension → glyph. Longest extension wins, so `d.ts` is handled by `ts`. */
const BY_EXT: Record<string, FileGlyph> = {
  // Scripting / typed languages
  ts: { icon: FileCode2, tone: "text-[#3178c6]" },
  mts: { icon: FileCode2, tone: "text-[#3178c6]" },
  cts: { icon: FileCode2, tone: "text-[#3178c6]" },
  tsx: { icon: FileCode2, tone: "text-[#3178c6]" },
  js: { icon: FileCode2, tone: "text-[#e6b91e]" },
  mjs: { icon: FileCode2, tone: "text-[#e6b91e]" },
  cjs: { icon: FileCode2, tone: "text-[#e6b91e]" },
  jsx: { icon: FileCode2, tone: "text-[#e6b91e]" },
  vue: { icon: FileCode, tone: "text-[#41b883]" },
  svelte: { icon: FileCode, tone: "text-[#ff3e00]" },
  astro: { icon: FileCode, tone: "text-[#ff5d01]" },
  py: { icon: FileCode, tone: "text-[#3572a5]" },
  pyi: { icon: FileCode, tone: "text-[#3572a5]" },
  rb: { icon: FileCode, tone: "text-[#cc342d]" },
  php: { icon: FileCode, tone: "text-[#787cb5]" },
  rs: { icon: FileCode, tone: "text-[#dea584]" },
  go: { icon: FileCode, tone: "text-[#00add8]" },
  java: { icon: FileCode, tone: "text-[#e76f00]" },
  kt: { icon: FileCode, tone: "text-[#a97bff]" },
  kts: { icon: FileCode, tone: "text-[#a97bff]" },
  scala: { icon: FileCode, tone: "text-[#c22d40]" },
  swift: { icon: FileCode, tone: "text-[#f05138]" },
  m: { icon: FileCode, tone: "text-[#438eff]" },
  mm: { icon: FileCode, tone: "text-[#438eff]" },
  c: { icon: FileCode, tone: "text-[#5b8ec4]" },
  h: { icon: FileCode, tone: "text-[#5b8ec4]" },
  cc: { icon: FileCode, tone: "text-[#5b8ec4]" },
  cpp: { icon: FileCode, tone: "text-[#5b8ec4]" },
  cxx: { icon: FileCode, tone: "text-[#5b8ec4]" },
  hpp: { icon: FileCode, tone: "text-[#5b8ec4]" },
  cs: { icon: FileCode, tone: "text-[#8a6ad6]" },
  dart: { icon: FileCode, tone: "text-[#00b4ab]" },
  lua: { icon: FileCode, tone: "text-[#4b6c9c]" },
  r: { icon: FileCode, tone: "text-[#2a6fb0]" },
  ex: { icon: FileCode, tone: "text-[#8a5cab]" },
  exs: { icon: FileCode, tone: "text-[#8a5cab]" },
  erl: { icon: FileCode, tone: "text-[#b83998]" },
  hs: { icon: FileCode, tone: "text-[#8f6ab5]" },
  clj: { icon: FileCode, tone: "text-[#63b132]" },
  zig: { icon: FileCode, tone: "text-[#e6a338]" },
  sol: { icon: FileCode, tone: "text-[#8b8b8b]" },

  // Shell / terminal entry points
  sh: { icon: FileTerminal, tone: "text-[#4eaa25]" },
  bash: { icon: FileTerminal, tone: "text-[#4eaa25]" },
  zsh: { icon: FileTerminal, tone: "text-[#4eaa25]" },
  fish: { icon: FileTerminal, tone: "text-[#4eaa25]" },
  ps1: { icon: FileTerminal, tone: "text-[#5391c8]" },
  bat: { icon: FileTerminal, tone: "text-ink-soft" },
  cmd: { icon: FileTerminal, tone: "text-ink-soft" },
  service: { icon: Settings2, tone: "text-ink-faint" },

  // Markup / styling
  html: { icon: FileCode, tone: "text-[#e34c26]" },
  htm: { icon: FileCode, tone: "text-[#e34c26]" },
  css: { icon: Palette, tone: "text-[#563d7c]" },
  scss: { icon: Palette, tone: "text-[#c6538c]" },
  sass: { icon: Palette, tone: "text-[#c6538c]" },
  less: { icon: Palette, tone: "text-[#3d6ca5]" },
  styl: { icon: Palette, tone: "text-[#b3d107]" },
  md: { icon: FileText, tone: "text-[#4a90d9]" },
  mdx: { icon: FileText, tone: "text-[#4a90d9]" },
  rst: { icon: FileText, tone: "text-ink-soft" },
  adoc: { icon: FileText, tone: "text-ink-soft" },
  tex: { icon: FileText, tone: "text-[#3d6117]" },

  // Data / config
  json: { icon: FileJson, tone: "text-[#a8a13c]" },
  jsonc: { icon: FileJson, tone: "text-[#a8a13c]" },
  json5: { icon: FileJson, tone: "text-[#a8a13c]" },
  yaml: { icon: FileBraces, tone: "text-[#d16b6b]" },
  yml: { icon: FileBraces, tone: "text-[#d16b6b]" },
  toml: { icon: FileBraces, tone: "text-[#c96a3f]" },
  ini: { icon: FileBraces, tone: "text-ink-faint" },
  cfg: { icon: FileBraces, tone: "text-ink-faint" },
  conf: { icon: FileBraces, tone: "text-ink-faint" },
  env: { icon: FileKey, tone: "text-[#ecd53f]" },
  xml: { icon: FileBraces, tone: "text-[#e37933]" },
  plist: { icon: FileBraces, tone: "text-ink-soft" },
  graphql: { icon: Hash, tone: "text-[#e10098]" },
  gql: { icon: Hash, tone: "text-[#e10098]" },
  proto: { icon: FileBraces, tone: "text-[#5b8ec4]" },
  sql: { icon: Database, tone: "text-[#5b8ec4]" },
  db: { icon: Database, tone: "text-[#5b8ec4]" },
  sqlite: { icon: Database, tone: "text-[#5b8ec4]" },
  ipynb: { icon: FlaskConical, tone: "text-[#e27a2b]" },
  csv: { icon: FileSpreadsheet, tone: "text-[#1f9d55]" },
  tsv: { icon: FileSpreadsheet, tone: "text-[#1f9d55]" },
  xls: { icon: FileSpreadsheet, tone: "text-[#1f9d55]" },
  xlsx: { icon: FileSpreadsheet, tone: "text-[#1f9d55]" },
  lock: { icon: FileLock, tone: "text-ink-faint" },
  map: { icon: Binary, tone: "text-ink-faint" },
  wasm: { icon: Binary, tone: "text-[#654ff0]" },
  log: { icon: FileText, tone: "text-ink-faint" },
  txt: { icon: FileText, tone: "text-ink-faint" },

  // Images / media
  png: { icon: FileImage, tone: "text-[#a259d6]" },
  jpg: { icon: FileImage, tone: "text-[#a259d6]" },
  jpeg: { icon: FileImage, tone: "text-[#a259d6]" },
  gif: { icon: FileImage, tone: "text-[#a259d6]" },
  webp: { icon: FileImage, tone: "text-[#a259d6]" },
  avif: { icon: FileImage, tone: "text-[#a259d6]" },
  bmp: { icon: FileImage, tone: "text-[#a259d6]" },
  ico: { icon: FileImage, tone: "text-[#a259d6]" },
  icns: { icon: FileImage, tone: "text-[#a259d6]" },
  svg: { icon: FileImage, tone: "text-[#ffb13b]" },
  mp4: { icon: FileVideo, tone: "text-[#e0603f]" },
  mov: { icon: FileVideo, tone: "text-[#e0603f]" },
  webm: { icon: FileVideo, tone: "text-[#e0603f]" },
  mkv: { icon: FileVideo, tone: "text-[#e0603f]" },
  avi: { icon: FileVideo, tone: "text-[#e0603f]" },
  mp3: { icon: FileAudio, tone: "text-[#2aa198]" },
  wav: { icon: FileAudio, tone: "text-[#2aa198]" },
  flac: { icon: FileAudio, tone: "text-[#2aa198]" },
  ogg: { icon: FileAudio, tone: "text-[#2aa198]" },
  m4a: { icon: FileAudio, tone: "text-[#2aa198]" },
  ttf: { icon: FileType, tone: "text-ink-soft" },
  otf: { icon: FileType, tone: "text-ink-soft" },
  woff: { icon: FileType, tone: "text-ink-soft" },
  woff2: { icon: FileType, tone: "text-ink-soft" },

  // Archives / packages
  zip: { icon: FileArchive, tone: "text-[#c9a227]" },
  tar: { icon: FileArchive, tone: "text-[#c9a227]" },
  gz: { icon: FileArchive, tone: "text-[#c9a227]" },
  tgz: { icon: FileArchive, tone: "text-[#c9a227]" },
  bz2: { icon: FileArchive, tone: "text-[#c9a227]" },
  xz: { icon: FileArchive, tone: "text-[#c9a227]" },
  rar: { icon: FileArchive, tone: "text-[#c9a227]" },
  "7z": { icon: FileArchive, tone: "text-[#c9a227]" },
  dmg: { icon: FileArchive, tone: "text-[#c9a227]" },
  pkg: { icon: FileArchive, tone: "text-[#c9a227]" },
  exe: { icon: Cpu, tone: "text-ink-faint" },
  dll: { icon: Cpu, tone: "text-ink-faint" },
  so: { icon: Cpu, tone: "text-ink-faint" },
  dylib: { icon: Cpu, tone: "text-ink-faint" },
  class: { icon: Cpu, tone: "text-ink-faint" },
  o: { icon: Cpu, tone: "text-ink-faint" },
  a: { icon: Cpu, tone: "text-ink-faint" },
  pdf: { icon: FileText, tone: "text-[#d93a32]" },
};

/** Lower-case file name of a repo path (no directories, no trailing slash). */
function nameOf(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const slash = trimmed.lastIndexOf("/");
  return (slash >= 0 ? trimmed.slice(slash + 1) : trimmed).toLowerCase();
}

/** Glyph for `path`; never throws and never returns `undefined`. */
export function fileGlyph(path: string): FileGlyph {
  const name = nameOf(path);
  if (name.length === 0) return PLAIN;
  const byName = BY_NAME[name];
  if (byName) return byName;

  const dot = name.lastIndexOf(".");
  // A dotfile (`.bashrc`) has no extension: the leading dot is not a separator.
  if (dot <= 0 || dot === name.length - 1) {
    return name.startsWith(".") ? CODE : PLAIN;
  }
  return BY_EXT[name.slice(dot + 1)] ?? PLAIN;
}
