# 主菜单 PNG

- `space.png`：宇宙背景，整幅不透明，建议与目标画面相同比例，位于底层。
- `mars.png`：卡通火星，星球以外真实透明，位于中层；默认画面中偏左，右边给按钮留空。
- `meteors.png`：一张包含多块陨石的透明 PNG，位于最上层；围绕火星分布，尽量不遮挡右侧按钮。整体跟随鼠标/触控笔轻微移动。

素材由你提供。当前未放入时只保留深色底与可操作菜单，不绘制替代星球。PNG 读取路径在 `data/presentation.json`，位置在 `styles/menu.css`。移动端按钮排在星球下方；减少动画设置关闭悬浮和视差。

难度卡片使用 `easy.png`、`normal.png`、`hardpng.png`（困难图片当前的实际文件名），路径在 `index.html`。默认模糊，悬浮或键盘聚焦后清晰，并在下方显示说明；触屏直接显示说明。

说明文字可直接修改 `locales/zh-CN.json`（中文）或 `locales/en.json`（英文）中的 `difficulty.easy.description`、`difficulty.medium.description`、`difficulty.hard.description`。Normal 对应存档中的 `medium`，只改显示名称，不改变难度规则。
