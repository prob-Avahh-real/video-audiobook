import { detectChapters, chaptersFromTranscript, formatTime } from './chapters.js';
import { extractAudioFromVideo, decodeAudioBlob } from './extract.js';
import { playTtsBook, stopSpeaking, listVoices, pickDefaultVoice } from './tts-book.js';
import { loadMeta, upsertBook, getBook, removeBook } from './library.js';
import { createWearableInput } from './wearable-input.js';

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  mode: 'extract', // extract | tts
  file: null,
  converting: false,
  current: null, // { id, title, mode, chapters, objectUrl?, duration }
  chapterIndex: 0,
  playing: false,
  rate: 1,
  stopTts: false,
  voiceURI: '',
};

const audioEl = new Audio();
audioEl.preload = 'metadata';

const els = {};

async function haptic(style = 'Light') {
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle[style] || ImpactStyle.Light });
  } catch {
    /* browser */
  }
}

function toast(msg) {
  const t = els.toast;
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 2000);
}

function setProgress(ratio, label) {
  els.progressWrap?.classList.toggle('visible', ratio > 0 && ratio < 1 || !!label && state.converting);
  if (els.progressBar) els.progressBar.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
  if (els.progressLabel) els.progressLabel.textContent = label || '';
}

function bindEls() {
  Object.assign(els, {
    file: $('#file-input'),
    pickBtn: $('#pick-btn'),
    fileName: $('#file-name'),
    modeExtract: $('#mode-extract'),
    modeTts: $('#mode-tts'),
    transcript: $('#transcript'),
    transcriptPanel: $('#transcript-panel'),
    convertBtn: $('#convert-btn'),
    progressWrap: $('#progress-wrap'),
    progressBar: $('#progress-bar'),
    progressLabel: $('#progress-label'),
    library: $('#library'),
    player: $('#player'),
    playerTitle: $('#player-title'),
    playerMeta: $('#player-meta'),
    playBtn: $('#play-btn'),
    prevBtn: $('#prev-btn'),
    nextBtn: $('#next-btn'),
    seek: $('#seek'),
    timeCur: $('#time-cur'),
    timeDur: $('#time-dur'),
    chapterList: $('#chapter-list'),
    rateSelect: $('#rate-select'),
    wearBtn: $('#wear-btn'),
    toast: $('#toast'),
    downloadBtn: $('#download-btn'),
    closePlayer: $('#close-player'),
  });
}

function setMode(mode) {
  state.mode = mode;
  els.modeExtract?.classList.toggle('active', mode === 'extract');
  els.modeTts?.classList.toggle('active', mode === 'tts');
  els.transcriptPanel?.classList.toggle('hidden', mode !== 'tts');
}

function renderLibrary() {
  const list = loadMeta();
  if (!els.library) return;
  if (!list.length) {
    els.library.innerHTML = `<p class="empty">还没有有声书。选一段视频开始转化。</p>`;
    return;
  }
  els.library.innerHTML = list
    .map(
      (b) => `
    <article class="book-row" data-id="${b.id}">
      <button type="button" class="book-main" data-open="${b.id}">
        <span class="book-title">${escapeHtml(b.title)}</span>
        <span class="book-sub">${b.mode === 'tts' ? '旁白' : '原声'} · ${b.chapterCount || 0} 章 · ${formatTime(b.duration || 0)}</span>
      </button>
      <button type="button" class="icon-btn danger" data-del="${b.id}" aria-label="删除">×</button>
    </article>`,
    )
    .join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function openBook(id) {
  const row = await getBook(id);
  const meta = loadMeta().find((b) => b.id === id);
  if (!row || !meta) {
    toast('找不到这本书');
    return;
  }

  stopPlayback();
  let objectUrl = null;
  if (row.blob) objectUrl = URL.createObjectURL(row.blob);

  state.current = {
    id,
    title: row.title || meta.title,
    mode: row.mode || meta.mode,
    chapters: row.chapters || [],
    duration: meta.duration || 0,
    objectUrl,
    mime: row.mime,
  };
  state.chapterIndex = 0;

  if (objectUrl) {
    audioEl.src = objectUrl;
    audioEl.load();
  }

  showPlayer(true);
  renderChapters();
  updatePlayerChrome();
}

function showPlayer(on) {
  els.player?.classList.toggle('open', on);
  document.body.classList.toggle('player-open', on);
}

function renderChapters() {
  const chapters = state.current?.chapters || [];
  if (!els.chapterList) return;
  els.chapterList.innerHTML = chapters
    .map(
      (c, i) => `
    <button type="button" class="chapter-item ${i === state.chapterIndex ? 'active' : ''}" data-ch="${i}">
      <span>${escapeHtml(c.title || `第 ${i} 章`)}</span>
      <span class="ch-time">${c.text ? `${c.text.slice(0, 18)}…` : formatTime(c.start || 0)}</span>
    </button>`,
    )
    .join('');
}

function updatePlayerChrome() {
  const cur = state.current;
  if (!cur) return;
  if (els.playerTitle) els.playerTitle.textContent = cur.title;
  if (els.playerMeta) {
    const ch = cur.chapters[state.chapterIndex];
    els.playerMeta.textContent = `${cur.mode === 'tts' ? '旁白有声书' : '原声有声书'} · ${ch?.title || ''}`;
  }
  if (els.playBtn) els.playBtn.textContent = state.playing ? '暂停' : '播放';
  if (els.downloadBtn) els.downloadBtn.classList.toggle('hidden', cur.mode === 'tts' || !cur.objectUrl);
  renderChapters();
}

function stopPlayback() {
  state.playing = false;
  state.stopTts = true;
  stopSpeaking();
  audioEl.pause();
  if (els.playBtn) els.playBtn.textContent = '播放';
}

async function togglePlay() {
  const cur = state.current;
  if (!cur) return;
  await haptic('Medium');

  if (state.playing) {
    stopPlayback();
    return;
  }

  state.playing = true;
  state.stopTts = false;
  updatePlayerChrome();

  if (cur.mode === 'tts') {
    const chapters = cur.chapters.slice(state.chapterIndex);
    const offset = state.chapterIndex;
    try {
      await playTtsBook(chapters, {
        rate: state.rate,
        voiceURI: state.voiceURI,
        shouldStop: () => state.stopTts,
        onChapter: (i) => {
          state.chapterIndex = offset + i;
          updatePlayerChrome();
        },
      });
    } catch {
      /* cancelled or error */
    }
    state.playing = false;
    updatePlayerChrome();
    return;
  }

  // extract mode: seek to chapter and play audio
  const ch = cur.chapters[state.chapterIndex];
  if (ch && Number.isFinite(ch.start)) audioEl.currentTime = ch.start;
  audioEl.playbackRate = state.rate;
  try {
    await audioEl.play();
  } catch {
    state.playing = false;
    toast('无法播放，请点按页面后再试');
    updatePlayerChrome();
  }
}

function jumpChapter(delta) {
  const cur = state.current;
  if (!cur?.chapters?.length) return;
  const next = Math.max(0, Math.min(cur.chapters.length - 1, state.chapterIndex + delta));
  if (next === state.chapterIndex) return;
  const wasPlaying = state.playing;
  stopPlayback();
  state.chapterIndex = next;
  updatePlayerChrome();
  if (cur.mode === 'extract' && cur.chapters[next]) {
    audioEl.currentTime = cur.chapters[next].start || 0;
  }
  if (wasPlaying) togglePlay();
  haptic('Light');
}

function syncSeekFromAudio() {
  if (!state.current || state.current.mode !== 'extract') return;
  const d = audioEl.duration || state.current.duration || 0;
  const t = audioEl.currentTime || 0;
  if (els.seek && d) els.seek.value = String((t / d) * 100);
  if (els.timeCur) els.timeCur.textContent = formatTime(t);
  if (els.timeDur) els.timeDur.textContent = formatTime(d);

  const chapters = state.current.chapters || [];
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (t >= (chapters[i].start || 0) - 0.05) {
      if (state.chapterIndex !== i) {
        state.chapterIndex = i;
        renderChapters();
        if (els.playerMeta) {
          els.playerMeta.textContent = `原声有声书 · ${chapters[i].title}`;
        }
      }
      break;
    }
  }
}

async function convert() {
  if (state.converting) return;
  if (!state.file && state.mode === 'extract') {
    toast('请先选择视频');
    return;
  }
  if (state.mode === 'tts') {
    const text = els.transcript?.value?.trim();
    if (!text) {
      toast('请粘贴或输入文稿');
      return;
    }
  }

  state.converting = true;
  els.convertBtn.disabled = true;
  setProgress(0.02, '准备中…');

  try {
    const titleBase = state.file
      ? state.file.name.replace(/\.[^.]+$/, '')
      : `有声书 ${new Date().toLocaleDateString('zh-CN')}`;

    if (state.mode === 'extract') {
      const result = await extractAudioFromVideo(state.file, {
        onProgress: (p, label) => setProgress(p, label),
      });
      setProgress(0.92, '分析章节…');
      let chapters = [{ index: 0, start: 0, end: result.duration, title: '全文' }];
      try {
        const decoded = await decodeAudioBlob(result.blob);
        chapters = detectChapters(decoded.samples, decoded.sampleRate);
      } catch {
        /* keep single chapter */
      }
      const book = await upsertBook(
        {
          title: titleBase,
          mode: 'extract',
          chapters,
          duration: result.duration,
          sourceName: state.file.name,
          mime: result.mime,
        },
        result.blob,
      );
      URL.revokeObjectURL(result.objectUrl);
      toast('有声书已生成');
      renderLibrary();
      await openBook(book.id);
    } else {
      setProgress(0.3, '分章…');
      const chapters = chaptersFromTranscript(els.transcript.value);
      if (!chapters.length) throw new Error('文稿为空');
      const duration = chapters.reduce((sum, c) => sum + Math.max(1, (c.text?.length || 0) / 4.5), 0);
      setProgress(0.8, '写入书库…');
      const book = await upsertBook(
        {
          title: titleBase || '旁白有声书',
          mode: 'tts',
          chapters,
          duration,
          sourceName: state.file?.name || '',
        },
        null,
      );
      toast('旁白有声书已就绪');
      renderLibrary();
      await openBook(book.id);
    }
  } catch (err) {
    console.error(err);
    toast(err.message || '转化失败');
  } finally {
    state.converting = false;
    els.convertBtn.disabled = false;
    setProgress(0, '');
    els.progressWrap?.classList.remove('visible');
  }
}

function downloadCurrent() {
  const cur = state.current;
  if (!cur?.objectUrl) return;
  const a = document.createElement('a');
  a.href = cur.objectUrl;
  const ext = (cur.mime || '').includes('mp4') ? 'm4a' : 'webm';
  a.download = `${cur.title || 'audiobook'}.${ext}`;
  a.click();
  haptic('Light');
}

function wireAudio() {
  audioEl.addEventListener('timeupdate', syncSeekFromAudio);
  audioEl.addEventListener('ended', () => {
    if (state.chapterIndex < (state.current?.chapters?.length || 1) - 1) {
      jumpChapter(1);
      togglePlay();
    } else {
      state.playing = false;
      updatePlayerChrome();
    }
  });
  audioEl.addEventListener('play', () => {
    state.playing = true;
    updatePlayerChrome();
  });
  audioEl.addEventListener('pause', () => {
    if (!audioEl.ended) {
      state.playing = false;
      updatePlayerChrome();
    }
  });
}

function wireWearables() {
  const wear = createWearableInput({
    onRingShake: () => togglePlay(),
    onRingTiltUp: () => jumpChapter(-1),
    onRingTiltDown: () => jumpChapter(1),
    onRingTiltLeft: () => jumpChapter(-1),
    onRingTiltRight: () => jumpChapter(1),
    onCaneTap: () => togglePlay(),
    onCaneSwingLeft: () => jumpChapter(-1),
    onCaneSwingRight: () => jumpChapter(1),
  });

  els.wearBtn?.addEventListener('click', async () => {
    const ok = await wear.requestPermission();
    if (!ok) {
      toast('需要动作权限才能用戒指/手杖');
      return;
    }
    wear.start();
    els.wearBtn.classList.add('on');
    els.wearBtn.textContent = '穿戴已开';
    toast('戒指摇一摇播放 · 手杖轻点暂停');
  });
}

function wireUi() {
  els.pickBtn?.addEventListener('click', () => els.file?.click());
  els.file?.addEventListener('change', () => {
    const f = els.file.files?.[0];
    state.file = f || null;
    if (els.fileName) els.fileName.textContent = f ? f.name : '未选择视频';
  });

  els.modeExtract?.addEventListener('click', () => setMode('extract'));
  els.modeTts?.addEventListener('click', () => setMode('tts'));
  els.convertBtn?.addEventListener('click', convert);

  els.library?.addEventListener('click', async (e) => {
    const openId = e.target.closest('[data-open]')?.getAttribute('data-open');
    const delId = e.target.closest('[data-del]')?.getAttribute('data-del');
    if (delId) {
      await removeBook(delId);
      if (state.current?.id === delId) {
        stopPlayback();
        showPlayer(false);
        state.current = null;
      }
      renderLibrary();
      toast('已删除');
      return;
    }
    if (openId) await openBook(openId);
  });

  els.playBtn?.addEventListener('click', togglePlay);
  els.prevBtn?.addEventListener('click', () => jumpChapter(-1));
  els.nextBtn?.addEventListener('click', () => jumpChapter(1));
  els.downloadBtn?.addEventListener('click', downloadCurrent);
  els.closePlayer?.addEventListener('click', () => {
    stopPlayback();
    showPlayer(false);
  });

  els.chapterList?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ch]');
    if (!btn) return;
    const i = Number(btn.getAttribute('data-ch'));
    const was = state.playing;
    stopPlayback();
    state.chapterIndex = i;
    if (state.current?.mode === 'extract') {
      audioEl.currentTime = state.current.chapters[i]?.start || 0;
    }
    updatePlayerChrome();
    if (was) togglePlay();
  });

  els.seek?.addEventListener('input', () => {
    if (state.current?.mode !== 'extract') return;
    const d = audioEl.duration || state.current.duration || 0;
    audioEl.currentTime = (Number(els.seek.value) / 100) * d;
  });

  els.rateSelect?.addEventListener('change', () => {
    state.rate = Number(els.rateSelect.value) || 1;
    audioEl.playbackRate = state.rate;
  });

  // Voice warm-up for TTS
  if ('speechSynthesis' in window) {
    listVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      const v = pickDefaultVoice();
      if (v) state.voiceURI = v.voiceURI;
    };
    const v = pickDefaultVoice();
    if (v) state.voiceURI = v.voiceURI;
  }
}

function init() {
  bindEls();
  wireUi();
  wireAudio();
  wireWearables();
  setMode('extract');
  renderLibrary();
  requestAnimationFrame(() => document.body.classList.add('ready'));
}

init();
