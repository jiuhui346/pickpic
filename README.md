# 拾图 PickPic

Windows 本地图片库：拖入导入、缩略图网格、分类与标签、拖出到其他软件，全部数据保存在本机，不联网、不上传。

技术栈：Tauri 2 + React 18 + TypeScript + Vite + Zustand + Tailwind CSS + SQLite（rusqlite）。

## 功能特性

- 拖入导入：移动/复制、逐个命名、分类选择、标签选择、重复图片检测
- 分类管理：多对多、右键/拖拽/批量归类、命名时直接选分类
- 标签筛选：标签独立于分类，用于在分类内筛选；顶部筛选器重启后自动重置
- 缩略图网格：虚拟滚动、异步缓存、滑动多选、整组拖出
- 删除与批量操作：右键删除、批量删除、确认保护
- 设置：存储目录迁移、拖入/拖出行为、缩略图尺寸、主题、简洁模式、动图预览、快捷键自定义
- MCP 接口：本机 HTTP + stdio 适配，Agent 可执行全部图片/分类/标签/设置操作
- 插件系统：插件目录 + plugin.json + main.js，可在软件内从 GitHub 插件源安装

## 一、安装包

`release/` 目录（不打进 git，建议上传到 GitHub Releases）：

- `PickPic_1.0.9_x64-setup.exe`（NSIS 安装包）
- `PickPic_1.0.9_x64_en-US.msi`（MSI 安装包）

安装后从开始菜单或 `%LOCALAPPDATA%\PickPic\pickpic.exe` 启动。

## 二、从源码开发

前置：Node.js 18+、Rust（rustup + MSVC）、NASM、WebView2 Runtime。

```powershell
npm install
npm run app:dev      # 开发模式
npm run build        # 打包 msi + nsis
```

构建脚本会自动设置 `CARGO_TARGET_DIR=%LOCALAPPDATA%\pickpic-build` 并把 NASM 加进 PATH。
不要直接运行 `npm run tauri build`：项目路径含中文时 NASM 写不了中文 target 路径。

更完整的构建坑（WiX/NSIS/镜像）见 `docs/开发文档.md`。

## 三、目录结构

```
pickpic/
├─ src/                   React 前端
├─ src-tauri/             Rust / Tauri 后端
├─ plugins/               在线插件源（index.json + 各插件目录）
├─ docs/                  开发文档 / 使用说明 / 验收报告
├─ scripts/               构建与开发脚本
├─ public/                静态资源
└─ release/               安装包输出（git 忽略）
```

## 四、存储根目录布局

```
<存储根目录>/
├─ vault.db          SQLite（图片元数据 / 分类 / 标签 / 设置）
├─ thumbs/           缩略图缓存（512px，JPEG 或 PNG）
└─ images/2026/10/   原图，按导入年月分目录
```

整个目录可以整体拷贝/迁移；数据库里保存的是相对路径。
存储目录指针在注册表 `HKCU\Software\PickPic\StorageRoot`。

## 五、GitHub 仓库与插件源

### 1. 创建仓库并推送

1. 在 GitHub 新建一个空仓库，例如 `pickpic`，建议 **Public**（插件走 CDN 需要公开）。
2. 本地仓库已经初始化并提交，执行：

```powershell
git remote add origin https://github.com/<你的用户名>/pickpic.git
git branch -M main
git push -u origin main
```

GitHub 直连不稳定时，先开代理/VPN；密码处填 Personal Access Token（不是账号密码）。

### 2. 在软件里配置插件源

推送成功后，把下面地址填到「设置 → 插件 → 在线插件源」：

```
https://fastly.jsdelivr.net/gh/<你的用户名>/pickpic@main/plugins/index.json
```

jsDelivr 在国内一般可直连；如果不行，可改用：

```
https://gh-proxy.com/https://raw.githubusercontent.com/<你的用户名>/pickpic/main/plugins/index.json
```

填好后点「保存并刷新」，就能看到仓库里的插件并一键安装。插件默认禁用，启用后点「重新加载」生效。

### 3. 新增插件

1. 在 `plugins/` 下新建以插件 id 命名的文件夹；
2. 放入 `plugin.json` 与 `main.js`；
3. 在 `plugins/index.json` 的 `plugins` 数组里加一条（id/name/version/description/files）；
4. 提交并推送，软件里刷新在线插件源即可。

详见 `plugins/README.md`。

## 六、常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run app:dev` | 开发模式启动 |
| `npm run build` | 打包安装包（msi + nsis） |
| `npm run build:web` | 只构建前端 |
| `cargo test`（在 `src-tauri`） | Rust 单元测试 |

## 七、常见问题

- **启动提示「存储目录不可用」**：目录被移动/删除，或所在磁盘未插入；重新指定即可，原记录不会丢。
- **拖入提示「文件正在被其他程序占用」**：先在原程序里关闭该文件再拖入。
- **缩略图显示「无法预览」**：图片损坏，或尺寸超过解码上限；原文件仍可正常拖出使用。
- **杀毒软件提示未知发布者**：安装包未签名，属正常现象；可自行签名。
- **插件源读取失败**：检查地址是否为 `.../plugins/index.json`、仓库是否公开、jsDelivr 缓存是否已刷新。

## 八、文档

- `docs/使用说明.md`：面向用户的功能说明
- `docs/开发文档.md`：架构、模块、构建与实现细节
- `docs/验收报告.md`：验收清单、性能数据与迭代记录
- `plugins/README.md`：插件格式与插件源说明
- `docs/GitHub上传指南.md`：从零创建仓库、推送、PAT、Releases 的步骤
