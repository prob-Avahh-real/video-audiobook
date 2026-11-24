#!/usr/bin/env node
/**
 * Desktop CLI: video → audiobook audio via ffmpeg.
 * Usage: npm run convert -- input.mp4 [-o out.mp3] [--chapters]
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function usage() {
  console.log(`影声 CLI — 视频转有声书音轨

用法:
  npm run convert -- <video> [-o output.mp3] [--chapters]

依赖: 系统已安装 ffmpeg / ffprobe
`);
}

function which(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], {
    encoding: 'utf8',
  });
  return r.status === 0;
}

function main(argv) {
  const args = argv.slice(2);
  if (!args.length || args.includes('-h') || args.includes('--help')) {
    usage();
    process.exit(args.length ? 0 : 1);
  }

  if (!which('ffmpeg')) {
    console.error('未找到 ffmpeg，请先安装: brew install ffmpeg');
    process.exit(1);
  }

  let input = null;
  let output = null;
  let wantChapters = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') {
      output = args[++i];
    } else if (args[i] === '--chapters') {
      wantChapters = true;
    } else if (!args[i].startsWith('-')) {
      input = args[i];
    }
  }

  if (!input || !fs.existsSync(input)) {
    console.error('请提供有效的视频文件路径');
    process.exit(1);
  }

  const base = path.basename(input, path.extname(input));
  const outDir = path.join(process.cwd(), 'output');
  fs.mkdirSync(outDir, { recursive: true });
  output = output || path.join(outDir, `${base}.mp3`);

  console.log(`抽取音轨: ${input} → ${output}`);
  const extract = spawnSync(
    'ffmpeg',
    ['-y', '-i', input, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', output],
    { stdio: 'inherit' },
  );
  if (extract.status !== 0) {
    console.error('ffmpeg 抽取失败');
    process.exit(extract.status || 1);
  }

  if (wantChapters) {
    const silenceLog = path.join(outDir, `${base}.silence.txt`);
    const silencedetect = spawnSync(
      'ffmpeg',
      ['-i', output, '-af', 'silencedetect=noise=-35dB:d=1.2', '-f', 'null', '-'],
      { encoding: 'utf8' },
    );
    const text = `${silencedetect.stderr || ''}${silencedetect.stdout || ''}`;
    fs.writeFileSync(silenceLog, text);
    const ends = [...text.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    const chapters = [{ index: 0, start: 0, title: '开篇' }];
    ends.forEach((t, i) => {
      if (t > 2) chapters.push({ index: i + 1, start: t, title: `第 ${i + 1} 章` });
    });
    const metaPath = path.join(outDir, `${base}.chapters.json`);
    fs.writeFileSync(metaPath, JSON.stringify({ title: base, source: input, chapters }, null, 2));
    console.log(`章节元数据: ${metaPath} (${chapters.length} 章)`);
  }

  console.log('完成:', output);
}

main(process.argv);
