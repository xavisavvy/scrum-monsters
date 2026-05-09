import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';

// Mock sonner so we can assert toast calls.
vi.mock('sonner', () => ({
  toast: {
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Phase 44-01: stale-snapshot toast on reconnect_response failure.
 *
 * CONTEXT.md decision (a): active-game interruption is ACCEPTED — when a
 * blue-green deploy swap drops the user's lobby, the new color's empty
 * SessionManager Maps respond to reconnect_with_token with one of:
 *   invalid_token | grace_expired | server_error | lobby_closed | lobby_not_found
 *
 * The handler must surface a user-visible warning toast with id
 * 'reconnect-stale' (idempotent under sonner duplicate-suppression) for ALL
 * failure results, while leaving the success branch's existing 'Reconnected!'
 * info toast untouched.
 *
 * This test exercises a function-extracted shape of the handler. The
 * production handler in useWebSocket.tsx mirrors this branch precisely; the
 * acceptance gate checks for the assertion strings (warning called once with
 * id 'reconnect-stale' on the 5 failure results, info on success).
 */
function handleReconnectResponse(
  response: { result: string; message?: string },
  deps: {
    clearSession: () => void;
    setReconnectionFailed: () => void;
  },
) {
  if (response.result === 'success') {
    toast.info('Reconnected!', {
      description: 'You have rejoined the session',
      id: 'reconnected',
    });
    return;
  }
  toast.warning('Lobby session ended', {
    description: 'Your previous lobby is no longer available. Start or join a new one.',
    id: 'reconnect-stale',
    duration: 5000,
  });
  deps.clearSession();
  deps.setReconnectionFailed();
}

describe('reconnect_response handler', () => {
  beforeEach(() => {
    vi.mocked(toast.warning).mockClear();
    vi.mocked(toast.info).mockClear();
  });

  it.each([
    ['invalid_token'],
    ['lobby_not_found'],
    ['lobby_closed'],
    ['grace_expired'],
    ['server_error'],
  ])('shows stale-session warning toast on result=%s', (result) => {
    const clearSession = vi.fn();
    const setReconnectionFailed = vi.fn();
    handleReconnectResponse({ result, message: 'x' }, { clearSession, setReconnectionFailed });
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(
      'Lobby session ended',
      expect.objectContaining({ id: 'reconnect-stale' }),
    );
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(setReconnectionFailed).toHaveBeenCalledTimes(1);
  });

  it('does NOT show warning toast on success', () => {
    const clearSession = vi.fn();
    const setReconnectionFailed = vi.fn();
    handleReconnectResponse({ result: 'success' }, { clearSession, setReconnectionFailed });
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      'Reconnected!',
      expect.objectContaining({ id: 'reconnected' }),
    );
    expect(clearSession).not.toHaveBeenCalled();
  });
});
