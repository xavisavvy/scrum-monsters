import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  truncateUrl,
  isPlaylistUrl,
  extractVideoId,
  extractPlaylistId,
  fetchYoutubeTitle,
} from './youtubeTitle';

describe('truncateUrl', () => {
  it('returns the input unchanged when <= 40 chars', () => {
    const short = 'https://youtu.be/abc';
    expect(truncateUrl(short)).toBe(short);
    expect(truncateUrl('a'.repeat(40))).toBe('a'.repeat(40));
  });

  it('slices to 40 chars and appends ellipsis when longer', () => {
    const long = 'https://www.youtube.com/watch?v=abc12345678';
    const result = truncateUrl(long);
    expect(result).toBe(long.slice(0, 40) + '…');
    expect(result.length).toBe(41); // 40 chars + 1 ellipsis char
  });
});

describe('isPlaylistUrl', () => {
  it('is true for a url containing list=', () => {
    expect(isPlaylistUrl('https://www.youtube.com/playlist?list=PLabc')).toBe(true);
    expect(isPlaylistUrl('https://www.youtube.com/watch?v=abc12345678&list=PLxyz')).toBe(true);
  });

  it('is false for a url without list=', () => {
    expect(isPlaylistUrl('https://youtu.be/abc12345678')).toBe(false);
    expect(isPlaylistUrl('https://www.youtube.com/watch?v=abc12345678')).toBe(false);
  });
});

describe('extractVideoId', () => {
  it('returns the 11-char id for a watch?v= url', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('returns the id for a watch?v=ID&list=... url', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('returns null for a bare playlist?list= url', () => {
    expect(extractVideoId('https://www.youtube.com/playlist?list=PLabc123')).toBeNull();
  });

  it('returns the id for a youtu.be/ short url', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});

describe('extractPlaylistId', () => {
  it('returns the list= param value for a bare playlist?list= url', () => {
    expect(extractPlaylistId('https://www.youtube.com/playlist?list=PLabc123')).toBe('PLabc123');
  });

  it('returns the list= param value for a watch?v=ID&list=... url', () => {
    expect(extractPlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz')).toBe(
      'PLxyz'
    );
  });

  it('returns null for a URL with no list= param', () => {
    expect(extractPlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(extractPlaylistId('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
  });
});

describe('fetchYoutubeTitle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves to data.title when fetch returns ok with a JSON body containing title', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: 'Rick Astley - Never Gonna Give You Up' }),
    } as Response);

    const result = await fetchYoutubeTitle('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).toBe('Rick Astley - Never Gonna Give You Up');
  });

  it('resolves to truncateUrl(url) when fetch returns { ok: false } (404)', async () => {
    const url = 'https://www.youtube.com/watch?v=privatevideo1';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    const result = await fetchYoutubeTitle(url);
    expect(result).toBe(truncateUrl(url));
    // Must not reject
    await expect(fetchYoutubeTitle(url)).resolves.toBeDefined();
  });

  it('resolves to truncateUrl(url) when fetch rejects (network error)', async () => {
    const url = 'https://www.youtube.com/watch?v=networkerror1';
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network failure'));

    const result = await fetchYoutubeTitle(url);
    expect(result).toBe(truncateUrl(url));
  });
});
