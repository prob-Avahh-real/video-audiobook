# 影声 — 视频转有声书

输入一段视频，生成可随身听的有声书。支持手机（iOS / Android）、手表窄屏，以及智能戒指 / 手杖控制。

## 两种模式

| 模式 | 做什么 |
|------|--------|
| **原声提炼** | 从视频抽出音轨，按静音自动分章，导出可播放/下载的音频 |
| **旁白重铸** | 粘贴文稿/字幕，按段落分章，用系统 TTS 朗读成有声书 |

## 目标平台

| 平台 | 方式 |
|------|------|
| Android | Capacitor → `./gradlew assembleDebug` |
| iOS | Capacitor → Xcode |
| 手表 | 窄屏自适应（≤280×300） |
| 智能戒指 | 摇一摇播放/暂停；上下/左右倾 → 切章 |
| 智能手杖 | 轻点播放/暂停；挥动切章 |
| 桌面 CLI | `ffmpeg` 批量抽音轨 |

## 命令

```bash
npm install
npm test
npm run build
npm start                          # 本地预览 www/
npm run convert -- video.mp4       # 桌面抽取（需 ffmpeg）
npm run convert -- video.mp4 --chapters
npm run sync:android               # 构建并同步 Android
cd android && ./gradlew assembleDebug
```

## 结构

```
src/
  extract.js       # 浏览器内视频→音轨
  chapters.js      # 静音分章 / 文稿分章
  tts-book.js      # 系统语音朗读
  library.js       # IndexedDB 书库
  wearable-input.js
  app.js
scripts/
  build-web.js
  convert-cli.js   # ffmpeg CLI
```

## 注意

- 手机端原声提炼依赖 `MediaRecorder` + `captureStream`（Android Chrome / WebView 可用）。
- 旁白模式使用设备自带 `speechSynthesis`，不上传文稿。
- 桌面批量处理请用 CLI，质量更稳。
