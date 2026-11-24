/**
 * TTS audiobook: speak chapter texts via SpeechSynthesis, or estimate timings.
 */

/**
 * @param {string} text
 * @param {{ rate?: number, pitch?: number, lang?: string, voiceURI?: string }} [opts]
 * @returns {Promise<void>}
 */
export function speakText(text, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('当前环境不支持语音合成'));
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    u.lang = opts.lang ?? 'zh-CN';
    if (opts.voiceURI) {
      const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === opts.voiceURI);
      if (voice) u.voice = voice;
    }
    u.onend = () => resolve();
    u.onerror = (e) => reject(e.error || new Error('朗读失败'));
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function listVoices() {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices();
}

/**
 * Prefer Chinese voices when available.
 */
export function pickDefaultVoice() {
  const voices = listVoices();
  const zh = voices.find((v) => /zh|chinese|中文|普通话|国语/i.test(`${v.lang} ${v.name}`));
  return zh || voices[0] || null;
}

/**
 * Rough duration estimate for UI progress (chars / speaking rate).
 * @param {string} text
 * @param {number} rate
 */
export function estimateSpeechSeconds(text, rate = 1) {
  const chars = String(text || '').replace(/\s+/g, '').length;
  // ~4.5 Chinese chars/sec at rate 1
  return Math.max(1, chars / (4.5 * Math.max(0.5, rate)));
}

/**
 * Play a TTS chapter queue with progress callbacks.
 * @param {{ text: string, title?: string }[]} chapters
 * @param {{ rate?: number, voiceURI?: string, onChapter?: (i: number) => void, onProgress?: (ratio: number) => void, shouldStop?: () => boolean }} [opts]
 */
export async function playTtsBook(chapters, opts = {}) {
  const rate = opts.rate ?? 1;
  for (let i = 0; i < chapters.length; i++) {
    if (opts.shouldStop?.()) break;
    opts.onChapter?.(i);
    opts.onProgress?.(i / Math.max(1, chapters.length));
    await speakText(chapters[i].text, { rate, voiceURI: opts.voiceURI, lang: 'zh-CN' });
  }
  opts.onProgress?.(1);
}
