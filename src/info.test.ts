import { describe, expect, it } from 'vitest';
import { normalisiereUrl, youtubeId } from './Info';
import anleitungen from './anleitungen.json';
import { POSITIONEN } from './plan';

describe('youtubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://example.com/watch?v=dQw4w9WgXcQ', null],
    ['kein link', null],
  ])('%s', (url, id) => expect(youtubeId(url)).toBe(id));
});

describe('normalisiereUrl', () => {
  it('adds https and rejects other schemes', () => {
    expect(normalisiereUrl('mx5forum.de/thread/1')).toBe('https://mx5forum.de/thread/1');
    expect(normalisiereUrl('javascript:alert(1)')).toBeNull();
    expect(normalisiereUrl('hallo')).toBeNull();
  });
});

describe('anleitungen', () => {
  it('covers every plan position', () => {
    const ids = Object.keys(anleitungen.positionen);
    expect(POSITIONEN.filter((p) => !ids.includes(p.id)).map((p) => p.id)).toEqual([]);
  });
});
