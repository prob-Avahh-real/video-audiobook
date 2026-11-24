/**
 * Extract audio track from a video File/Blob in the browser.
 * Strategy: play video → capture audio stream → MediaRecorder → audio Blob.
 * Fallback: Web Audio MediaElementSource → MediaStreamDestination.
 */

function pickMime() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function waitEvent(el, name) {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('媒体加载失败'));
    };
    const cleanup = () => {
      el.removeEventListener(name, onOk);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener(name, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

/**
 * @param {File|Blob} file
 * @param {{ onProgress?: (p: number, label: string) => void }} [opts]
 * @returns {Promise<{ blob: Blob, mime: string, duration: number, objectUrl: string }>}
 */
export async function extractAudioFromVideo(file, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  onProgress(0.05, '读取视频…');

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.muted = false;
  video.volume = 1;
  video.preload = 'auto';

  try {
    await Promise.race([
      waitEvent(video, 'loadedmetadata'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('视频元数据超时')), 20000)),
    ]);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  onProgress(0.15, '抽取音轨…');

  const mime = pickMime();
  if (!mime || typeof MediaRecorder === 'undefined') {
    URL.revokeObjectURL(url);
    throw new Error('当前环境不支持录音导出，请用桌面 CLI: npm run convert -- 视频.mp4');
  }

  let stream;
  if (typeof video.captureStream === 'function') {
    stream = video.captureStream();
  } else if (typeof video.mozCaptureStream === 'function') {
    stream = video.mozCaptureStream();
  } else {
    stream = await routeViaAudioContext(video);
  }

  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) {
    URL.revokeObjectURL(url);
    throw new Error('视频没有可抽取的音轨');
  }
  const audioStream = new MediaStream(audioTracks);

  const chunks = [];
  const recorder = new MediaRecorder(audioStream, { mimeType: mime });
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('录音失败'));
  });

  recorder.start(250);

  video.currentTime = 0;
  try {
    await video.play();
  } catch {
    /* autoplay may need muted; keep unmuted for captureStream audio */
    video.muted = true;
    await video.play();
    video.muted = false;
  }

  await new Promise((resolve) => {
    const tick = () => {
      if (video.ended || video.paused) {
        resolve();
        return;
      }
      if (duration > 0) {
        onProgress(0.15 + 0.75 * Math.min(1, video.currentTime / duration), '抽取音轨…');
      }
      requestAnimationFrame(tick);
    };
    video.addEventListener('ended', () => resolve(), { once: true });
    tick();
  });

  if (recorder.state !== 'inactive') recorder.stop();
  await done;

  audioTracks.forEach((t) => t.stop());
  URL.revokeObjectURL(url);
  video.removeAttribute('src');
  video.load();

  onProgress(0.95, '封装有声书…');
  const blob = new Blob(chunks, { type: mime });
  if (!blob.size) throw new Error('抽取结果为空');

  const objectUrl = URL.createObjectURL(blob);
  onProgress(1, '完成');
  return { blob, mime, duration, objectUrl };
}

async function routeViaAudioContext(video) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('不支持 Web Audio');
  const ctx = new Ctx();
  const src = ctx.createMediaElementSource(video);
  const dest = ctx.createMediaStreamDestination();
  src.connect(dest);
  src.connect(ctx.destination);
  if (ctx.state === 'suspended') await ctx.resume();
  return dest.stream;
}

/**
 * Decode blob to mono Float32Array for chapter analysis.
 * @param {Blob} blob
 * @returns {Promise<{ samples: Float32Array, sampleRate: number, duration: number }>}
 */
export async function decodeAudioBlob(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('不支持 Web Audio');
  const ctx = new Ctx();
  const buf = await blob.arrayBuffer();
  const audio = await ctx.decodeAudioData(buf.slice(0));
  const ch0 = audio.getChannelData(0);
  let samples = ch0;
  if (audio.numberOfChannels > 1) {
    const ch1 = audio.getChannelData(1);
    samples = new Float32Array(ch0.length);
    for (let i = 0; i < ch0.length; i++) samples[i] = (ch0[i] + ch1[i]) * 0.5;
  }
  await ctx.close().catch(() => {});
  return { samples, sampleRate: audio.sampleRate, duration: audio.duration };
}
