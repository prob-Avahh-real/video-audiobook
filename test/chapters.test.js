import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectChapters, chaptersFromTranscript, formatTime } from '../src/chapters.js';

describe('formatTime', () => {
  it('formats minutes', () => {
    assert.equal(formatTime(65), '1:05');
  });
  it('formats hours', () => {
    assert.equal(formatTime(3661), '1:01:01');
  });
});

describe('chaptersFromTranscript', () => {
  it('returns empty for blank', () => {
    assert.deepEqual(chaptersFromTranscript(''), []);
  });

  it('splits long text into chapters', () => {
    const a = '这是第一段内容。'.repeat(20);
    const b = '这是第二段内容。'.repeat(20);
    const chapters = chaptersFromTranscript(`${a}\n\n${b}`, { maxChars: 80 });
    assert.ok(chapters.length >= 2);
    assert.equal(chapters[0].title, '开篇');
    assert.ok(chapters[0].text.length > 0);
  });
});

describe('detectChapters', () => {
  it('returns single chapter for empty', () => {
    const ch = detectChapters(new Float32Array(0), 16000);
    assert.equal(ch.length, 1);
  });

  it('splits on long silence', () => {
    const sr = 8000;
    const total = sr * 40; // 40s
    const samples = new Float32Array(total);
    // loud first 12s
    for (let i = 0; i < sr * 12; i++) samples[i] = Math.sin(i / 20) * 0.4;
    // silence 12–16s
    // loud again 16–40s
    for (let i = sr * 16; i < total; i++) samples[i] = Math.sin(i / 18) * 0.4;

    const chapters = detectChapters(samples, sr, {
      silenceDb: -35,
      minSilenceSec: 1,
      minChapterSec: 8,
      windowSec: 0.05,
    });
    assert.ok(chapters.length >= 2, `expected >=2 chapters, got ${chapters.length}`);
    assert.equal(chapters[0].start, 0);
    assert.ok(chapters[1].start > 10);
  });
});
