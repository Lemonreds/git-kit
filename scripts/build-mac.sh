#!/usr/bin/env bash
#
# 打包 Git Kit 为 macOS 安装包（.dmg 安装包 + .app 应用）。
#
# 用法：
#   bash scripts/build-mac.sh                 # 当前架构：release .app + .dmg
#   bash scripts/build-mac.sh --universal     # Intel + Apple Silicon 通用二进制
#   bash scripts/build-mac.sh --app-only      # 只出 .app（跳过 dmg，最快）
#   bash scripts/build-mac.sh --debug         # 调试包，便于本地验证（不自增版本号）
#   bash scripts/build-mac.sh --no-bump       # release 包但保持当前版本号
#   bash scripts/build-mac.sh --universal --open
#
# 产物统一输出到 ./release/，并附带 .zip（方便分发）与 SHA256 校验文件。
# 文件名统一带版本号：Git-Kit-v0.0.3-x64.dmg / Git-Kit-v0.0.3.zip / SHA256SUMS-v0.0.3.txt
# （.app 保持「Git Kit.app」不变，安装后的应用名才不会被版本号污染。）
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CONF="src-tauri/tauri.conf.json"
RELEASE_DIR="$ROOT_DIR/release"

UNIVERSAL=0
BUNDLES="app,dmg"
PROFILE="release"
OPEN_AFTER=0
SKIP_CHECK=0
NO_BUMP=0

info()  { printf '\033[36m▸ %s\033[0m\n' "$*"; }
ok()    { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn()  { printf '\033[33m! %s\033[0m\n' "$*"; }
die()   { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  sed -n '3,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--universal) UNIVERSAL=1 ;;
    --app-only)     BUNDLES="app" ;;
    --dmg-only)     BUNDLES="dmg" ;;
    --debug)        PROFILE="debug" ;;
    -o|--open)      OPEN_AFTER=1 ;;
    --skip-check)   SKIP_CHECK=1 ;;
    --no-bump)      NO_BUMP=1 ;;
    -h|--help)      usage ;;
    *)              die "未知参数：$1（用 --help 查看用法）" ;;
  esac
  shift
done

# CI 会把未配置的 secrets 传成空字符串，而 Tauri 看到空值会当成「要签名」，
# 所以空字符串一律当作未设置。
for var in APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  if [[ -z "${!var:-}" ]]; then
    unset "$var"
  fi
done
# 没有签名证书时用 ad-hoc 签名（`-`）：Tauri 会跳过签名，而 Apple Silicon 上
# 未签名的二进制无法启动。
if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  unset APPLE_SIGNING_IDENTITY
  export APPLE_SIGNING_IDENTITY="-"
fi

# ---------- 环境检查 ----------
if [[ "$(uname -s)" != "Darwin" ]]; then
  die "当前系统不是 macOS，无法打包 .dmg / .app。"
fi

command -v node >/dev/null 2>&1 || die "缺少 node，请先安装 Node.js 20+。"
command -v npm  >/dev/null 2>&1 || die "缺少 npm。"
command -v cargo >/dev/null 2>&1 || die "缺少 Rust 工具链，请先安装：curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"

# ---------- 版本号 ----------
# Release 包自动 +0.0.1（debug 包保持当前版本，方便反复调试）。
if [[ "$PROFILE" != "debug" && "$NO_BUMP" -eq 0 ]]; then
  info "版本号 +0.0.1 …"
  node scripts/bump-version.mjs || die "版本号自增失败，已中止（可用 --no-bump 跳过）"
else
  info "跳过版本号自增（debug 包 / --no-bump）"
fi

PRODUCT_NAME="$(node -p "require('./$CONF').productName")"
APP_VERSION="$(node -p "require('./$CONF').version")"
IDENTIFIER="$(node -p "require('./$CONF').identifier")"
BUNDLE_ID_SUFFIX=""

# ---------- 产物命名 ----------
# 每个可分发文件都带上版本号（并带平台架构），下载目录里一眼就能分清
# 哪个版本、哪种架构，不用打开 dmg 才知道。
SLUG="${PRODUCT_NAME// /-}"
if [[ "$UNIVERSAL" -eq 1 ]]; then
  DMG_ARCH="universal"
  ARCH_SUFFIX="-universal"
else
  case "$(uname -m)" in
    x86_64|amd64)  DMG_ARCH="x64" ;;
    arm64|aarch64) DMG_ARCH="aarch64" ;;
    *)             DMG_ARCH="$(uname -m)" ;;
  esac
  ARCH_SUFFIX=""
fi
DMG_NAME="${SLUG}-v${APP_VERSION}-${DMG_ARCH}.dmg"
ZIP_NAME="${SLUG}-v${APP_VERSION}${ARCH_SUFFIX}.zip"
SUMS_NAME="SHA256SUMS-v${APP_VERSION}.txt"

info "Git Kit v$APP_VERSION（$IDENTIFIER）"

# ---------- 依赖 ----------
if [[ ! -d node_modules ]]; then
  info "安装前端依赖（npm ci）…"
  npm ci
fi

if [[ "$UNIVERSAL" -eq 1 ]]; then
  if command -v rustup >/dev/null 2>&1; then
    for t in aarch64-apple-darwin x86_64-apple-darwin; do
      if ! rustup target list --installed | grep -qx "$t"; then
        info "安装 Rust 目标架构 $t …"
        rustup target add "$t"
      fi
    done
  else
    warn "未找到 rustup，跳过目标架构检查（通用二进制需要 aarch64 与 x86_64 两个 target）。"
  fi
fi

# ---------- 构建 ----------
TAURI_ARGS=(build --bundles "$BUNDLES")
if [[ "$UNIVERSAL" -eq 1 ]]; then
  TAURI_ARGS+=(--target universal-apple-darwin)
  TARGET_DIR="src-tauri/target/universal-apple-darwin/$PROFILE"
else
  TARGET_DIR="src-tauri/target/$PROFILE"
fi
[[ "$PROFILE" == "debug" ]] && TAURI_ARGS+=(--debug)

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  info "代码签名身份：$APPLE_SIGNING_IDENTITY"
else
  warn "未设置 APPLE_SIGNING_IDENTITY，产物为 ad-hoc 签名（本机可直接打开，其他人首次打开需右键 → 打开）。"
fi

if [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  info "检测到 Apple 公证凭据，构建后会自动公证（notarize）。"
else
  info "未检测到 Apple 公证凭据（APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID），跳过公证。"
fi

info "开始构建：npx tauri ${TAURI_ARGS[*]}"

# 重复构建时 dmg 里的同名卷可能还挂着，会导致 hdiutil 无法卸载而失败。
if [[ -d "/Volumes/$PRODUCT_NAME" ]]; then
  warn "检测到已挂载的 $PRODUCT_NAME 磁盘映像，先卸载。"
  hdiutil detach "/Volumes/$PRODUCT_NAME" >/dev/null 2>&1 \
    || hdiutil detach -force "/Volumes/$PRODUCT_NAME" >/dev/null 2>&1 \
    || warn "卸载失败，若打包报 hdiutil 错误请手动退出它。"
fi
# 上一次的 dmg 会让 hdiutil convert 报“文件已经存在”。
rm -f "$TARGET_DIR/bundle/dmg"/*.dmg 2>/dev/null || true

BUILD_START=$SECONDS
npx tauri "${TAURI_ARGS[@]}"
BUILD_SECONDS=$((SECONDS - BUILD_START))
ok "构建完成，用时 $((BUILD_SECONDS / 60))m$((BUILD_SECONDS % 60))s"

# ---------- 收集产物 ----------
APP_PATH="$TARGET_DIR/bundle/macos/$PRODUCT_NAME.app"
DMG_DIR="$TARGET_DIR/bundle/dmg"

[[ -d "$APP_PATH" ]] || die "没有找到 .app：$APP_PATH"
[[ -d "$DMG_DIR" ]] || [[ "$BUNDLES" != *dmg* ]] || die "没有找到 dmg 目录：$DMG_DIR"

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

info "复制产物到 release/ …"
ditto "$APP_PATH" "$RELEASE_DIR/$PRODUCT_NAME.app"

if [[ "$BUNDLES" == *dmg* ]]; then
  shopt -s nullglob
  DMGS=("$DMG_DIR"/*.dmg)
  shopt -u nullglob
  [[ ${#DMGS[@]} -gt 0 ]] || die "dmg 目录为空：$DMG_DIR"
  index=0
  for d in "${DMGS[@]}"; do
    # Tauri 自己生成的名字是「Git Kit_0.0.3_x64.dmg」：声明式地重命名成
    # 带 v 前缀、连字符分隔的发布文件名；多份 dmg 时追加序号避免覆盖。
    if [[ $index -eq 0 ]]; then
      target_name="$DMG_NAME"
    else
      target_name="${DMG_NAME%.dmg}-$((index + 1)).dmg"
    fi
    cp "$d" "$RELEASE_DIR/$target_name"
    index=$((index + 1))
  done
fi

# .app 打成 zip，便于分发并保留签名 / 权限位（zip 内仍是「Git Kit.app」）
ditto -c -k --keepParent "$APP_PATH" "$RELEASE_DIR/$ZIP_NAME"

# ---------- 校验与报告 ----------
# 只对可分发文件求校验值：把校验文件自己也列进去会得到一个永远对不上的自引用条目。
(
  cd "$RELEASE_DIR"
  : > "$SUMS_NAME"
  shopt -s nullglob
  for f in *.dmg *.zip; do
    shasum -a 256 "$f" >> "$SUMS_NAME"
  done
  shopt -u nullglob
)

APP_BIN="$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$RELEASE_DIR/$PRODUCT_NAME.app/Contents/Info.plist" 2>/dev/null || echo "$PRODUCT_NAME")"
ARCH_INFO="$(lipo -archs "$RELEASE_DIR/$PRODUCT_NAME.app/Contents/MacOS/$APP_BIN" 2>/dev/null || echo "unknown")"
SIGN_INFO="$(codesign -dv "$RELEASE_DIR/$PRODUCT_NAME.app" 2>&1 | grep -E '^(Authority|Signature)=' | head -3 || true)"

echo
ok "打包完成 → $RELEASE_DIR"
echo "  应用：$PRODUCT_NAME.app   架构：$ARCH_INFO"
[[ -n "$SIGN_INFO" ]] && echo "  签名：$(echo "$SIGN_INFO" | tr '\n' ' ')"
if [[ "$BUNDLES" == *dmg* ]]; then
  shopt -s nullglob
  for f in "$RELEASE_DIR"/*.dmg; do
    echo "  安装包：$(basename "$f")  $(du -h "$f" | cut -f1)"
  done
  shopt -u nullglob
fi
echo "  压缩包：$ZIP_NAME  $(du -h "$RELEASE_DIR/$ZIP_NAME" | cut -f1)"
echo "  校验值：release/$SUMS_NAME"
echo
echo "  安装方式：打开 .dmg，把「$PRODUCT_NAME」拖到 Applications。"
echo "  若提示「已损坏」或「无法验证开发者」（下载后被加隔离标记），执行："
echo "    xattr -dr com.apple.quarantine \"/Applications/$PRODUCT_NAME.app\""

if [[ "$OPEN_AFTER" -eq 1 ]]; then
  open "$RELEASE_DIR"
fi