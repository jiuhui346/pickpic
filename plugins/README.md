# 插件仓库

这个目录同时是 PickPic 的在线插件源。软件里填写的地址格式：

```
https://fastly.jsdelivr.net/gh/<GitHub用户名>/<仓库名>@main/plugins/index.json
```

也可以用 gh-proxy：

```
https://gh-proxy.com/https://raw.githubusercontent.com/jiuhui346/<仓库名>/main/plugins/index.json
```

## 插件结构

```
plugins/
  index.json
  <插件id>/
    plugin.json
    main.js
```

`plugin.json`：

```json
{
  "id": "example-stats",
  "name": "图库统计",
  "version": "1.0.0",
  "description": "说明文字",
  "author": "作者",
  "main": "main.js"
}
```

`index.json` 里的每个插件需要包含 `id / name / version / description / files`，
`files` 是相对 `plugins/<id>/` 的文件列表。软件按这个列表逐个下载，安装到
`%APPDATA%\PickPic\plugins\<id>`，默认禁用，启用后重新加载生效。

## 新增插件

1. 在 `plugins/` 下新建以插件 id 命名的文件夹；
2. 放入 `plugin.json` 与 `main.js`；
3. 在 `index.json` 的 `plugins` 数组里加一条；
4. 提交并推送，等 jsDelivr 缓存刷新（通常几分钟，也可用 `@main` 强制最新）。
