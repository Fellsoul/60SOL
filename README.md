# Last Light Outpost

纯 HTML/CSS/JavaScript 的场景叙事原型，采用 Controller–View–Model 架构。主画面只呈现场景与终端入口；任务文字和选择位于可关闭、可滚动的侧滑终端。每天开始时黑幕淡出，资源数值保留在后台规则中。

当前已实现的事件、全部选项、日常工作、工具、每日规则、结局和界面功能，见 [游戏内容总清单](GAME_CONTENT_LIST.md)。

## 启动

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

访问 <http://localhost:8000>。不要直接双击 HTML。

## 先准备图片

场景仅读取你自己提供的 PNG，没有程序绘制的场景或占位美术。素材未放入前，对应图层为空，终端仍可使用。

- [素材需求、生成说明和导入步骤](assets/README.md)
- [场景 PNG 文件路径清单](assets/PNG_FILES.txt)
- `assets/scene/`：已经建立的素材目录。
- `data/scene_layout.json`：图片与状态映射、覆盖层级、沙尘移动配置。静态场景 PNG 与 interior 基底同尺寸、同原点叠放；四张沙尘纹理在各自窗口区域横向平铺移动，远景慢、近景快。

建议先完成清单中的第一批 16 张正常场景素材，再补沙暴与其他状态。室内基底分为 `outpost_baseMain.png` 与 `outpost_baseRight.png`，均保留原始完整画布；主窗、右窗分别按外景、沙尘、室内基底叠放，右窗整组在主窗组上方。整个场景随视口等比缩放。

## 模块分工

| 模块 | 责任 |
| --- | --- |
| `src/app.js` | 加载配置，组装 Model、View、Controller 和 Repository |
| `src/controllers/GameController.js` | 接收终端操作，确认规则、保存，再协调画面过渡 |
| `src/models/GameModel.js` | 唯一游戏状态与命令入口 |
| `src/models/TurnEngine.js` | 每日结算、昨日简报、天气与结局 |
| `src/models/ActionRules.js` | 行动成本、效果、叙事总结 |
| `src/models/EventEngine.js` | 教学、天气事件、带种子的权重抽取 |
| `src/models/state.js` | 状态定义、存档版本和校验 |
| `src/repositories/SaveRepository.js` | localStorage 读写与旧版本迁移 |
| `src/views/GameView.js` | 黑幕过渡与视图组合 |
| `src/views/TerminalView.js`、`Typewriter.js` | 侧滑、滚动、选择和可跳过的打字机效果 |
| `src/views/SceneState.js` | 将游戏状态投影成天气、植物、灯光、人物和工具的素材状态 |
| `src/views/SceneView.js`、`SceneAssets.js` | PNG 加载、图层显示、沙尘连续位移动画；不结算游戏 |
| `data/events.json` | 事件文本；每个事件与选项均含 `summaryLine` |
| `data/environment.json` | 固定演示天气序列，非实时火星天气 |

建议分工：A 负责 App/Controller/存档，B 负责 Model/规则测试，C 负责 View/样式/美术对齐，D 负责事件文案与素材。三人时 A 兼任内容配置。

`summaryLine` 的选项分支记录实际决定，工作也有独立总结；日终汇总后写入 `previousDaySummary`，翌日终端读取，刷新不重新生成昨天的经历。

## 当前范围与验证

启动时先进入主菜单：新游戏、存在有效存档时显示的继续、读取存档、设置。“继续”直接加载最近保存的有效任务；“读取存档”打开本浏览器的全部存档列表，显示保存时间、Sol 和任务阶段，点击条目后加载，也可返回或按 Esc 取消。每条存档旁的“删除”按钮在确认后移除该存档，旧版和损坏存档也可删除；列表与“继续”按钮即时更新，语言设置保留。每次新游戏建立独立存档，后续自动保存只更新当前任务，旧版单存档仍可选择；损坏或不兼容的存档保留并标记为不可加载。设置使用左侧终端，支持语言和过场音量；默认英语，支持中文。游戏中的“主菜单”按钮返回菜单。

菜单 PNG 清单见 `assets/menu/README.md`；音频导入见 `assets/audio/README.md`。图片和音频需要自行放入对应路径。过场时长、音频路径及事件录音映射位于 `data/presentation.json`；默认约 7.7 秒，`SOL xxx` 字幕只在画面全黑时独立淡入、淡出。语言扩展方法见 `locales/README.md`。

已有基础 14 Sol 流程、6 张示例事件、工具选择、灯光/植物/沙暴的状态映射、本地存档和终端交互。开关灯为独立操作，不占工作机会；每个日终保持亮灯消耗 1 E，关灯不扣照明电力，电力耗尽自动熄灯。天气演示默认 Sol 4、8、9 为沙暴，可在环境 JSON 中修改。

还未包含完整 20 张事件、全部工具损坏事件、多设施维修、NASA 来源页和最终美术。图片是否对齐、透明区域是否正确、沙尘纹理是否无缝衔接，要在提供 PNG 后验证。

规则与翻译测试：`npm test`。翻译表统一使用英文语义 key，具体规范见 [语言配置说明](locales/README.md)。浏览器检查脚本：`python tests/browser_smoke.py`，需要 Python Playwright 和本机 Edge；使用测试响应验证图片路径与状态切换，不提供游戏美术。

https://docs.google.com/document/d/1ULwb509Fd4l8WoeZYRNe-yRgJkW4OErQ/edit

样本采集：工作板可独立安排次日人物出行，或用机器人当天采样。最多 3 个样本，每个支持 2 次常规舱内研究。人物出行一天后返航并自动休整，日终开灯恢复 50% 疲劳、关灯恢复 25%。鼠标悬浮或键盘聚焦人物可查看状态，详细规则见 [内容列表](GAME_CONTENT_LIST.md)。

资源 UI：食物使用鸡腿图标（每个 4 点，支持四分之一填亮），研究点使用烧瓶图标（每个 1 点）。每名宇航员每天消耗 4 食物；初始食物 80、上限 128、普通收获 32。旧存档食物数值自动换算。
