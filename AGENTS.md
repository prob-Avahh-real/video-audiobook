# 影声 (video-audiobook)

视频 → 有声书。默认交付：**Android / iOS APK·IPA** + **手表 / 戒指 / 手杖**，网页仅作调试。

## 平台

- 移动：Capacitor 6 → `npm run sync:android` / `sync:ios`
- 手表：`@media (max-width: 280px), (max-height: 300px)`
- 戒指：DeviceOrientation（倾角切章、摇一摇播放）
- 手杖：DeviceMotion（轻点播放、挥动切章）

## 流水线

1. 选视频 → 原声提炼（抽音轨 + 静音分章）或旁白重铸（文稿 + TTS）
2. 写入 IndexedDB 书库
3. 播放器：章节、倍速、导出

桌面：`npm run convert -- file.mp4 [--chapters]`（依赖 ffmpeg）。

HTML 变更后：`npm run build`，再 sync 到 `www/` 与 Capacitor assets。

## Harness / Loop（助手）

- 遵循根 `/Users/skat/AGENTS.md`：**Harness Engineering** + **Loop Engineering**
- Guide = 本文件；Sensor = 下方验证命令；同类失误第二次须沉淀规则或测试（棘轮）
- 开干前写清 **Done**；每切片过验证环；显式停止（成功 / 上限 / 无进展 / 人审）
- 详解：`docs/HARNESS_ENGINEERING.md`、`docs/LOOP_ENGINEERING.md`

## 验证环 / Done

```bash
npm install
npm test          # 若有
npm run build     # 或 build:web
npx cap sync android   # 若有 android/
# 可选：JAVA_HOME=…/openjdk@17 npm run apk:debug
```

**Done 示例**：测试通过（若有）+ web 产物进 `www/`/`dist/` + `cap sync` 无报错。可选穿戴未做可搁置，不纳入强制 Done。
