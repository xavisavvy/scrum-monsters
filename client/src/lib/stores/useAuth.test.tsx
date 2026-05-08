import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuth } from './useAuth';

// Reset Zustand state between every test (analog: useProgression.test.ts).
beforeEach(() => {
  useAuth.setState({
    user: null,
    providersConfigured: null,
    isLoading: false,
    isInitialized: false,
    error: null,
    profile: null,
    stats: null,
  });
});

describe('useAuth fetchProviders', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('providers boolean true on {auth0:true}', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ auth0: true }), { status: 200 })
    );
    await useAuth.getState().fetchProviders();
    expect(useAuth.getState().providersConfigured).toBe(true);
  });

  it('providers boolean false on {auth0:false}', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ auth0: false }), { status: 200 })
    );
    await useAuth.getState().fetchProviders();
    expect(useAuth.getState().providersConfigured).toBe(false);
  });

  it('fail closed on providers error (network)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    await useAuth.getState().fetchProviders();
    expect(useAuth.getState().providersConfigured).toBe(false);
  });

  it('fail closed on providers error (non-OK status)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await useAuth.getState().fetchProviders();
    expect(useAuth.getState().providersConfigured).toBe(false);
  });
});

describe('useAuth logout', () => {
  it('logout redirects to /api/auth/logout', () => {
    // happy-dom's window.location.href setter actually triggers navigation;
    // replace the whole `location` with a plain object so .href becomes a
    // simple property (PATTERNS.md L295).
    const original = window.location;
    delete (window as any).location;
    (window as any).location = { href: '' };
    try {
      useAuth.getState().logout();
      expect((window as any).location.href).toBe('/api/auth/logout');
    } finally {
      (window as any).location = original;
    }
  });
});
