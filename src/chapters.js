/**
 * Silence-based chapter detection from PCM samples / AudioBuffer-like data.
 */

/**
 * @param {Float32Array} samples mono PCM -1..1
 * @param {number} sampleRate
 * @param {{ silenceDb?: number, minSilenceSec?: number, minChapterSec?: number, windowSec?: number }} [opts]
 * @returns {{ index: number, start: number, end: number, title: string }[]}
 */
export function detectChapters(samples, sampleRate, opts = {}) {
  const silenceDb = opts.silenceDb ?? -35;
  const minSilenceSec = opts.minSilenceSec ?? 1.0;
  const minChapterSec = opts.minChapterSec ?? 8;
  const windowSec = opts.windowSec ?? 0.05;

  if (!samples?.length || !sampleRate) {
    return [{ index: 0, start: 0, end: 0, title: '全文' }];
  }

  const duration = samples.length / sampleRate;
  const win = Math.max(1, Math.floor(sampleRate * windowSec));
  const threshold = Math.pow(10, silenceDb / 20);
  const minSilenceWindows = Math.max(1, Math.ceil(minSilenceSec / windowSec));

  const energies = [];
  for (let i = 0; i < samples.length; i += win) {
    let sum = 0;
    const end = Math.min(samples.length, i + win);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    energies.push(Math.sqrt(sum / (end - i)));
  }

  const splitTimes = [0];
  let silentRun = 0;
  for (let i = 0; i < energies.length; i++) {
    if (energies[i] < threshold) {
      silentRun++;
    } else {
      if (silentRun >= minSilenceWindows) {
        const mid = i - Math.floor(silentRun / 2);
        const t = (mid * win) / sampleRate;
        const last = splitTimes[splitTimes.length - 1];
        if (t - last >= minChapterSec && duration - t >= minChapterSec * 0.5) {
          splitTimes.push(t);
        }
      }
      silentRun = 0;
    }
  }

  if (splitTimes[splitTimes.length - 1] !== duration) {
    /* ends handled below */
  }

  const chapters = [];
  for (let i = 0; i < splitTimes.length; i++) {
    const start = splitTimes[i];
    const end = i + 1 < splitTimes.length ? splitTimes[i + 1] : duration;
    chapters.push({
      index: i,
      start: round2(start),
      end: round2(end),
      title: i === 0 ? '开篇' : `第 ${i} 章`,
    });
  }
  return chapters;
}

/**
 * Split plain transcript into chapter-sized chunks for TTS audiobook mode.
 * @param {string} text
 * @param {{ maxChars?: number }} [opts]
 */
export function chaptersFromTranscript(text, opts = {}) {
  const maxChars = opts.maxChars ?? 280;
  const cleaned = String(text || '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!cleaned) return [];

  const paras = cleaned
    .split(/\n{2,}|(?<=[。！？.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let buf = '';
  for (const p of paras) {
    if (!buf) {
      buf = p;
      continue;
    }
    if (buf.length + p.length + 1 <= maxChars) {
      buf = `${buf}${/[。！？.!?]$/.test(buf) ? '' : ' '}${p}`;
    } else {
      chunks.push(buf);
      buf = p;
    }
  }
  if (buf) chunks.push(buf);

  return chunks.map((body, i) => ({
    index: i,
    start: 0,
    end: 0,
    title: i === 0 ? '开篇' : `第 ${i} 章`,
    text: body,
  }));
}

/**
 * Format seconds as m:ss or h:mm:ss
 * @param {number} sec
 */
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
