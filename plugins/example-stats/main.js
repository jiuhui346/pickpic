// PickPic 插件示例：所有 API 都挂在全局 PickPic 上
PickPic.ui.addToolbarButton({
  id: "example-stats",
  label: "图库统计",
  onClick: () => {
    const images = PickPic.images.list();
    const total = images.reduce((sum, image) => sum + image.sizeBytes, 0);
    PickPic.toast(`共 ${images.length} 张图片，合计 ${(total / 1024 / 1024).toFixed(1)} MB`);
  }
});
