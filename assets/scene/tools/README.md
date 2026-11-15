# 游玩中的工具图片槽位

五种工具已经接入场景图层，图片由美术提供。每张 PNG 与 `assets/scene/interior/outpost_baseMain.png` 使用相同的完整画布尺寸和原点，和人物图片一样叠放。工具直接画在最终显示的位置，其余区域保留真实透明通道，不要裁掉透明边距。

| 工具 | 正常图片路径（相对于本目录） |
| --- | --- |
| 工具箱 | `toolkit/ready.png` |
| 小型机器人 | `robot/ready.png` |
| 备用电池 | `battery/ready.png` |
| 辐射监测仪 | `monitor/ready.png` |
| 屏蔽加固包 | `shield/ready.png` |

每个目录也预留了 `damaged.png`，供对应工具的损坏状态使用。未携带或已消耗的工具隐藏；缺少图片时图层保持空白。全部工具图层随场景一起等比缩放，透明区域不会阻挡终端按钮的点击。

按路径放入图片后刷新页面即可读取。新素材不会改变已有存档的携带物品：只渲染本局选中的两件工具，备用电池或屏蔽包消耗后隐藏。未携带的工具不会出现在场景中；`assets/menu/` 中的小图标不是场景素材。

图层和状态映射位于 `data/scene_layout.json` 中的 `tool-*` 配置，所有工具按完整场景画布直接叠放：

| 层级 | 图层 |
| --- | --- |
| 55 | 桌子 |
| 56 | shelf |
| 57 | shield：位于 shelf 上方、shelfOverride 下方 |
| 58 | battery：位于 shelf 上方；样本柜 samples 也位于此层，两者在画面不同位置 |
| 59 | shelfOverride |
| 60 | robot：位于 shelfOverride 上方 |
| 61 | toolkit 工具盒：位于桌子上方 |
| 62 | monitor：位于 samples 上方 |
| 80 | 灯光 |
