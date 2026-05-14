import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('csrfToken helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('starts without a cached token', async () => {
    const { getCsrfHeaders, getCsrfToken } = await import('./csrfToken');

    expect(getCsrfToken()).toBeNull();
    expect(getCsrfHeaders()).toEqual({});
  });

  it('fetches, returns, and caches the CSRF token', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ csrfToken: 'token-123' }), { status: 200 }),
    );

    const { fetchCsrfToken, getCsrfHeaders, getCsrfToken } = await import('./csrfToken');

    await expect(fetchCsrfToken()).resolves.toBe('token-123');
    expect(fetchSpy).toHaveBeenCalledWith('/api/csrf-token', {
      credentials: 'include',
    });
    expect(getCsrfToken()).toBe('token-123');
    expect(getCsrfHeaders()).toEqual({ 'x-csrf-token': 'token-123' });
  });

  it('replaces the cached token when a later fetch succeeds', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'token-123' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'token-456' }), { status: 200 }));

    const { fetchCsrfToken, getCsrfHeaders, getCsrfToken } = await import('./csrfToken');

    await fetchCsrfToken();
    await fetchCsrfToken();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(getCsrfToken()).toBe('token-456');
    expect(getCsrfHeaders()).toEqual({ 'x-csrf-token': 'token-456' });
  });

  it('preserves the previous token when fetching fails', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'token-123' }), { status: 200 }))
      .mockRejectedValueOnce(new Error('network down'));

    const { fetchCsrfToken, getCsrfHeaders, getCsrfToken } = await import('./csrfToken');

    await fetchCsrfToken();
    await expect(fetchCsrfToken()).rejects.toThrow('network down');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(getCsrfToken()).toBe('token-123');
    expect(getCsrfHeaders()).toEqual({ 'x-csrf-token': 'token-123' });
  });
});
