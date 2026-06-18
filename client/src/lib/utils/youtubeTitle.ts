/**
 * YouTube oEmbed title resolver and URL helpers.
 *
 * Security note (T-46-03): Only the `title` text field from oEmbed responses is used.
 * The `html` field is NEVER read or rendered (XSS risk — React does NOT auto-escape
 * raw HTML inserted via dangerouslySetInnerHTML; the oEmbed `html` field contains
 * an <iframe> embed tag).
 */

/**
 * Truncates a URL to at most 40 characters, appending an ellipsis if truncated.
 * Used as a display fallback when oEmbed title resolution fails.
 */
export function truncateUrl(s: string): string {
  return s.length <= 40 ? s : s.slice(0, 40) + '…'; // U+2026 HORIZONTAL ELLIPSIS
}

/**
 * Returns true when the URL contains a `list=` query parameter, indicating a
 * YouTube playlist (either a standalone playlist URL or a watch URL with a list).
 */
export function isPlaylistUrl(url: string): boolean {
  return /[?&]list=/.test(url);
}

/**
 * Extracts the 11-character YouTube video ID from a URL.
 *
 * Copied verbatim from BossMusicControls.tsx lines 22-26.
 * Returns null for bare playlist URLs (no `v=` parameter) — callers should use
 * isPlaylistUrl() to detect and handle that case separately.
 */
export function extractVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

/**
 * Extracts the YouTube playlist ID from the `list=` query parameter.
 * Returns null when no `list=` param is present.
 *
 * Useful for future phases that need playlist-level metadata without video ID extraction.
 */
export function extractPlaylistId(url: string): string | null {
  const match = url.match(/[?&]list=([^#&?]+)/);
  return match ? match[1] : null;
}

/**
 * Fetches the video/playlist title from the YouTube oEmbed endpoint.
 *
 * CORS note (verified 2026-06-17): youtube.com/oembed reflects the request Origin in
 * Access-Control-Allow-Origin, so a plain browser fetch() works cross-origin.
 *
 * Fallback (D-03): any error (404, network failure, non-ok status) resolves to
 * truncateUrl(url) — this function NEVER rejects.
 */
export async function fetchYoutubeTitle(url: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!res.ok) throw new Error(`oEmbed ${res.status}`);
    const data = (await res.json()) as { title?: string };
    return data.title ?? truncateUrl(url);
  } catch {
    return truncateUrl(url);
  }
}
