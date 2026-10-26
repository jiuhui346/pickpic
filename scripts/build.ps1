# 构建环境准备：Rust(a) + NASM(b) + 纯英文产物目录(c)
# 说明：项目路径含中文时，rav1d 的 nasm 汇编步骤无法写中文路径，故把 target 放到 LOCALAPPDATA。
$ErrorActionPreference = "Stop"

$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path $cargoBin) {
    $env:PATH = "$cargoBin;$env:PATH"
}

$nasmCandidates = @(
    "H:\ai\tools\nasm\nasm-2.16.03",
    "$env:ProgramFiles\NASM",
    "${env:ProgramFiles(x86)}\NASM"
)
foreach ($candidate in $nasmCandidates) {
    if (Test-Path (Join-Path $candidate "nasm.exe")) {
        $env:PATH = "$candidate;$env:PATH"
        break
    }
}

if (-not (Get-Command nasm -ErrorAction SilentlyContinue)) {
    Write-Error "未找到 NASM。请安装 NASM 并加入 PATH（AVIF 解码器编译需要）。"
}

$env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA "pickpic-build"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "CARGO_TARGET_DIR = $env:CARGO_TARGET_DIR"
npm run tauri build @args
