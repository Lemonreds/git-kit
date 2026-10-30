#requires -Version 5.1

<#
Git Kit — Windows 安装包（.msi / .exe）

用法（在仓库根目录或任意目录执行）：
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-win.ps1              # release msi
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-win.ps1 -Nsis        # release nsis (.exe)
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-win.ps1 -Msi -Nsis   # 两个都出
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-win.ps1 -Debug       # 调试包（不自增版本号）
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-win.ps1 -NoBump      # release 包但保持当前版本
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-win.ps1 -Open        # 完成后打开 release 目录

前置条件：
  · Windows 10/11 + Rust MSVC 工具链（rustup default stable-msvc）+ Visual Studio Build Tools
  · Node.js 20+
  · MSI 由 Tauri 自动下载 WiX Toolset，无需手动安装
  · WebView2 运行时按 tauri.conf.json 的 webviewInstallMode 处理（默认联网下载 bootstrapper）

产物输出到 .\release\，附带 SHA256SUMS.txt。
#>

[CmdletBinding()]
param(
  [switch]$Msi,
  [switch]$Nsis,
  [switch]$Debug,
  [switch]$NoBump,
  [switch]$Open
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) { Write-Host "> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "OK $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "! $Message" -ForegroundColor Yellow }
function Write-Die([string]$Message) { Write-Host "X $Message" -ForegroundColor Red; exit 1 }

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Conf = "src-tauri/tauri.conf.json"
$ReleaseDir = Join-Path $Root "release"

# ---------- 环境检查 ----------
if ($env:OS -ne "Windows_NT") {
  Write-Die "当前系统不是 Windows，无法打包 .msi / .exe。"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Die "缺少 node，请先安装 Node.js 20+。" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Die "缺少 npm。" }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  Write-Die "缺少 Rust 工具链，请先安装：https://rustup.rs（需要 MSVC 工具链）"
}

# ---------- 打包目标 ----------
$Bundles = @()
if ($Msi) { $Bundles += "msi" }
if ($Nsis) { $Bundles += "nsis" }
if ($Bundles.Count -eq 0) { $Bundles = @("msi") }
$BundleArg = $Bundles -join ","

$Profile = if ($Debug) { "debug" } else { "release" }

# ---------- 版本号 ----------
# Release 包自动 +0.0.1；debug 包保持当前版本，方便反复调试。
if ($Profile -ne "debug" -and -not $NoBump) {
  Write-Info "版本号 +0.0.1 ..."
  & node scripts/bump-version.mjs
  if ($LASTEXITCODE -ne 0) { Write-Die "版本号自增失败，已中止（可用 -NoBump 跳过）" }
} else {
  Write-Info "跳过版本号自增（debug 包 / -NoBump）"
}

$ProductName = (& node -p "require('./$Conf').productName").Trim()
$AppVersion = (& node -p "require('./$Conf').version").Trim()
$Identifier = (& node -p "require('./$Conf').identifier").Trim()
Write-Info "Git Kit v$AppVersion ($Identifier)"

# ---------- 依赖 ----------
if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Info "安装前端依赖（npm ci）..."
  & npm ci
  if ($LASTEXITCODE -ne 0) { Write-Die "npm ci 失败" }
}

# ---------- 构建 ----------
$TauriArgs = @("tauri", "build", "--bundles", $BundleArg)
if ($Debug) { $TauriArgs += "--debug" }

Write-Info "开始构建：npx $($TauriArgs -join ' ')"
$started = Get-Date
& npx @TauriArgs
if ($LASTEXITCODE -ne 0) { Write-Die "tauri build 失败（退出码 $LASTEXITCODE）" }
$elapsed = (Get-Date) - $started
Write-Ok ("构建完成，用时 {0:N0}m{1:N0}s" -f [math]::Floor($elapsed.TotalMinutes), $elapsed.Seconds)

# ---------- 收集产物 ----------
$BundleRoot = Join-Path $Root "src-tauri\target\$Profile\bundle"
$Artifacts = @()
foreach ($target in $Bundles) {
  $dir = Join-Path $BundleRoot $target
  if (-not (Test-Path $dir)) { continue }
  $Artifacts += Get-ChildItem -Path $dir -File | Where-Object { $_.Extension -in @(".msi", ".exe") }
}
if ($Artifacts.Count -eq 0) { Write-Die "没有找到安装包，检查 $BundleRoot" }

if (Test-Path $ReleaseDir) { Remove-Item $ReleaseDir -Recurse -Force }
New-Item -ItemType Directory -Path $ReleaseDir | Out-Null

Write-Info "复制产物到 release\ ..."
foreach ($file in $Artifacts) {
  Copy-Item $file.FullName -Destination (Join-Path $ReleaseDir $file.Name) -Force
}

# ---------- 校验 ----------
$hashes = Get-ChildItem $ReleaseDir -File |
  Sort-Object Name |
  ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
    "$hash  $($_.Name)"
  }
$hashes | Set-Content -Path (Join-Path $ReleaseDir "SHA256SUMS.txt") -Encoding ASCII

Write-Host ""
Write-Ok "打包完成 -> $ReleaseDir"
foreach ($file in Get-ChildItem $ReleaseDir -File | Sort-Object Name) {
  $size = [math]::Round($file.Length / 1MB, 2)
  Write-Host ("  {0}  {1} MB" -f $file.Name, $size)
}
Write-Host ""
Write-Host "  安装：双击 .msi（或 .exe）按向导安装。"
Write-Host "  若机构禁止联网安装 WebView2，可把 tauri.conf.json 的 webviewInstallMode 改为 offlineInstaller。"
Write-Host ""

if ($Open) { Start-Process explorer.exe $ReleaseDir }