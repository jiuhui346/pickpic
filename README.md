<div align="center">

<img src="src-tauri/icons/128x128.png" width="96" height="96" alt="拾图图标">

# 拾图 · 轻量化图片管理器

**把图片收进一个轻巧的匣子。**

本地、离线、不联网的 Windows 图片管理器 —— 拖进来、分好类、需要时拖出去。

[![平台](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-1E9BFA?style=flat-square&logo=windows)](https://github.com/jiuhui346/pickpic/releases)
[![版本](https://img.shields.io/github/v/release/jiuhui346/pickpic?style=flat-square&color=1E9BFA)](https://github.com/jiuhui346/pickpic/releases)
[![技术栈](https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri)](https://tauri.app)
[![离线](https://img.shields.io/badge/offline-100%25-2ea44f?style=flat-square)](https://github.com/jiuhui346/pickpic)

[简体中文](./README.md) · [English](./README.en.md)

</div>

![拾图主界面](docs/images/main-window.png)

## 为什么是拾图

- **轻**：不装运行时、不联网、不注册账号；安装包不到 5 MB，空闲内存约 85 MB。
- **快**：一万张图片的图库，滚动平均 6.1 ms/帧（P95 6.9 ms），冷启动约 1.1 秒。
- **本地**：图片、缩略图、索引全部保存在你指定的目录，复制目录即可备份/换机。
- **能长**：内置 MCP 接口和插件系统，后续功能以插件形式扩展，本体保持轻量。

## 功能

- **拖入导入**：从资源管理器拖图片或文件夹，支持移动/复制、逐个命名、批量导入。
- **重复检测**：BLAKE3 内容哈希，导入前提示完全相同的图片，可选择跳过或仍然添加。
- **分类 + 标签**：左侧分类管理归属，顶部标签在分类内筛选；标签重启后自动回到「不筛选」。
- **缩略图网格**：虚拟滚动、512px 缓存、小/中/大三档；可选让 GIF / 动态 WebP 直接播放。
- **选择与拖出**：单击/再点取消、Ctrl 滑动多选、整组拖到桌面/微信/PS/文件夹。
- **删除保护**：右键或 `Delete` 删除，二次确认；支持批量操作。
- **MCP 接口**：本机 HTTP + stdio，Agent 可执行导入、重命名、删除、导出、分类、标签、设置等操作。
- **插件系统**：插件目录 + `plugin.json` + `main.js`，可在软件内从 GitHub 插件源一键安装。
- **界面**：深色/浅色/跟随系统、简洁模式、自定义快捷键、图库目录迁移。

## 下载

> [!NOTE]
> 安装包发布在 [GitHub Releases](https://github.com/jiuhui346/pickpic/releases)。
> 第一次使用请先看 [使用说明](docs/使用说明.md)。

| 文件 | 说明 |
| --- | --- |
| `PickPic_1.0.12_x64-setup.exe` | NSIS 安装包，推荐 |
| `PickPic_1.0.12_x64_en-US.msi` | MSI 安装包，适合批量部署 |

系统要求：Windows 10 / 11（x64），需要 WebView2 Runtime（Win11 自带，Win10 一般已随 Edge 安装）。

## 快速开始

1. 安装并打开「拾图」，选择一个存储目录（例如 `D:\图库`）。
2. 从资源管理器把图片拖进窗口；在命名框里选分类、标签，回车确认。
3. 在左侧建分类，在顶部按标签筛选；右键图片可以归类、打标签、删除。
4. 需要用时，把图片直接拖到其他软件或文件夹。

> 默认导入是**移动**（原文件进入图库），拖出是**复制**（库内保留）；可在设置 → 通用里修改。

## 插件

插件让本体保持轻量，功能按需下载：

1. 设置 → 插件 → 在线插件源，填入：
   `https://fastly.jsdelivr.net/gh/jiuhui346/pickpic@main/plugins/index.json`
2. 点「保存并刷新」，在列表里点「安装」。
3. 安装后默认禁用；启用后点「重新加载」生效。

插件格式与开发说明见 [plugins/README.md](plugins/README.md)。插件 API 全局对象为 `PickPic`，旧版 `ImageVault` 别名仍可用。

## MCP

设置 → MCP 接口，开启后：

- HTTP：`http://127.0.0.1:45871/mcp`（Bearer 令牌，可在设置里复制配置）
- stdio：`pickpic.exe --mcp-stdio`（适合只支持命令行的 Agent）

MCP 只监听本机回环地址，可以执行与界面相同的图片/分类/标签/设置操作。

## 从源码构建

前置：Node.js 18+、Rust（rustup + MSVC）、NASM、WebView2 Runtime。

```powershell
npm install
npm run app:dev      # 开发模式
npm run build        # 打包 msi + nsis
```

构建脚本会自动设置 `CARGO_TARGET_DIR=%LOCALAPPDATA%\pickpic-build` 并把 NASM 加进 PATH。
不要直接执行 `npm run tauri build`：项目路径含中文时 NASM 无法写入中文 target 路径。

## 目录结构

```
pickpic/
├─ src/              React 前端
├─ src-tauri/        Rust / Tauri 后端
├─ plugins/          在线插件源（index.json + 各插件）
├─ docs/             使用说明
├─ scripts/          构建与开发脚本
└─ release/          安装包输出（git 忽略）
```

存储目录：

```
<图库目录>/
├─ vault.db          SQLite（图片、分类、标签、设置）
├─ thumbs/           缩略图缓存
└─ images/2026/10/   原图，按导入年月分目录
```

## 常见问题

- **启动提示存储目录不可用**：目录被移动/删除或磁盘未插入；重新选择即可，原记录不会丢。
- **拖入提示文件被占用**：先在原程序里关闭该文件再拖入。
- **缩略图无法预览**：图片损坏或尺寸超过解码上限；原文件仍可拖出。
- **安装包提示未知发布者**：当前安装包未签名，属正常现象。
- **插件源读取失败**：确认地址以 `/plugins/index.json` 结尾、仓库为 Public、jsDelivr 缓存已刷新。

## 文档

- [使用说明](docs/使用说明.md)
- [插件格式](plugins/README.md)
