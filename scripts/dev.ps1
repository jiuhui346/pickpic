# 开发模式启动（与 build.ps1 相同的环境准备）
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

$env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA "image-vault-build"
Set-Location (Join-Path $PSScriptRoot "..")

npm run tauri dev @args
