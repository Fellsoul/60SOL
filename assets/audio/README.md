# 过场音频

放入 `assets/audio/transition/ambient.mp3` 作为通用过场音效。当前没有附带音频文件；缺少文件时静默继续，不阻塞游戏。

如需要上一日事件的录音总结，在 `data/presentation.json` 中填写：

```json
"recaps": {
  "sandstorm": {
    "en": "assets/audio/recaps/en/sandstorm.mp3",
    "zh-CN": "assets/audio/recaps/zh-CN/sandstorm.mp3"
  }
}
```

事件 ID 指刚结束的一天。没有配置该语言的总结时播放 ambient；若配置了路径但文件缺失则静默，不自动合成旁白。总结录音应概括事件，避免宣称玩家做了某个未必选择的决定。

默认过场共约 7.7 秒：黑幕渐入 1500ms → 在全黑画面中字幕淡入 700ms → 字幕停留 1800ms → 字幕淡出 700ms → 黑幕渐出 3000ms。字幕在黑幕渐入/渐出期间完全隐藏。字幕时长分别配置为 titleFadeInMs / titleFadeOutMs。

音频起始渐入 1200ms，在画面渐出阶段以 1800ms 淡出并停止。建议使用约 6–8 秒的片段；长旁白需同步延长 blackHoldMs/fadeOutMs。设置页可调整音量。减少动画模式跳过画面过渡，但音频仍平滑结束。

音频由用户点击触发，浏览器若禁止播放则静默继续。动画/音频均不负责游戏结算。
