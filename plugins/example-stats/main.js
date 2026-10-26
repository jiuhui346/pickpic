// ImageVault 插件示例：所有 API 都挂在全局 ImageVault 上
ImageVault.ui.addToolbarButton({
  id: "example-stats",
  label: "图库统计",
  onClick: () => {
    const images = ImageVault.images.list();
    const total = images.reduce((sum, image) => sum + image.sizeBytes, 0);
    ImageVault.toast(`共 ${images.length} 张图片，合计 ${(total / 1024 / 1024).toFixed(1)} MB`);
  }
});
