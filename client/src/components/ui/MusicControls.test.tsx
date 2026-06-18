import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MusicControls } from './MusicControls';
import { saveHistory } from '@/lib/utils/musicHistory';

// ---------------------------------------------------------------------------
// Mutable mock state — tests mutate these before render
// ---------------------------------------------------------------------------

let mockIsHost = false;
let mockHostId = 'host-player-123';
let mockIsYoutubeAudioActive = false;
const mockToggleBossMusicMute = vi.fn();
const mockSocketEmit = vi.fn();

// ---------------------------------------------------------------------------
// Store mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/stores/useGameState', () => ({
  useGameState: () => ({
    currentPlayer: { id: mockHostId, isHost: mockIsHost, name: 'Player' },
  }),
}));

vi.mock('@/lib/stores/useAudio', () => ({
  useAudio: () => ({
    isBossMusicMuted: false,
    isYoutubeAudioActive: mockIsYoutubeAudioActive,
    youtubeUrl: '',
    toggleBossMusicMute: mockToggleBossMusicMute,
  }),
}));

vi.mock('@/lib/stores/useWebSocket', () => ({
  useWebSocket: () => ({
    socket: { emit: mockSocketEmit },
  }),
}));

// ---------------------------------------------------------------------------
// Mock youtubeTitle: keep pure helpers real, mock only the async fetch
// ---------------------------------------------------------------------------

vi.mock('@/lib/utils/youtubeTitle', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/utils/youtubeTitle')>();
  return {
    ...real,
    fetchYoutubeTitle: vi.fn().mockResolvedValue('Mock Video Title'),
  };
});

// ---------------------------------------------------------------------------
// Mock UI primitives (simple pass-throughs for RTL)
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/retro-button', () => ({
  RetroButton: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/retro-card', () => ({
  RetroCard: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title?: string;
  }) => (
    <div data-testid="retro-card">
      {title && <h3>{title}</h3>}
      {children}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOST_ID = 'host-player-123';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MusicControls', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Reset mutable state to defaults
    mockIsHost = false;
    mockHostId = HOST_ID;
    mockIsYoutubeAudioActive = false;
  });

  // -------------------------------------------------------------------------
  // Non-host: read-only status
  // -------------------------------------------------------------------------

  describe('non-host render', () => {
    it('does NOT render the URL input', () => {
      mockIsHost = false;
      render(<MusicControls />);
      expect(
        screen.queryByPlaceholderText('https://www.youtube.com/watch?v=...'),
      ).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('shows "Music stopped" when isYoutubeAudioActive is false', () => {
      mockIsHost = false;
      mockIsYoutubeAudioActive = false;
      render(<MusicControls />);
      expect(screen.getByText('Music stopped')).toBeTruthy();
    });

    it('shows "Music playing" when isYoutubeAudioActive is true', () => {
      mockIsHost = false;
      mockIsYoutubeAudioActive = true;
      render(<MusicControls />);
      expect(screen.getByText(/Music playing/)).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Host: URL input rendered after opening settings panel
  // -------------------------------------------------------------------------

  describe('host render', () => {
    it('renders the Music Settings toggle button', () => {
      mockIsHost = true;
      render(<MusicControls />);
      expect(screen.getByText(/Music Settings/)).toBeTruthy();
    });

    it('shows the URL input after clicking Music Settings', () => {
      mockIsHost = true;
      render(<MusicControls />);
      const settingsBtn = screen.getByText(/Music Settings/);
      fireEvent.click(settingsBtn);
      expect(
        screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'),
      ).toBeTruthy();
    });

    it('Play button is disabled when URL input is empty', () => {
      mockIsHost = true;
      render(<MusicControls />);
      fireEvent.click(screen.getByText(/Music Settings/));
      const playBtn = screen.getByText('Play YouTube Audio') as HTMLButtonElement;
      expect(playBtn.disabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // History: pre-fills URL input when entry clicked
  // -------------------------------------------------------------------------

  describe('history pre-fill', () => {
    it('clicking a history entry sets the input value; does NOT emit', async () => {
      // Seed two history items under the host's key
      saveHistory(HOST_ID, {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        usedAt: Date.now() - 2000,
      });
      saveHistory(HOST_ID, {
        url: 'https://www.youtube.com/watch?v=L_jWHffIx5E',
        title: 'All Star',
        usedAt: Date.now() - 1000,
      });

      mockIsHost = true;
      render(<MusicControls />);
      fireEvent.click(screen.getByText(/Music Settings/));

      // Wait for history entries to appear
      await waitFor(() => {
        expect(screen.getByText('Never Gonna Give You Up')).toBeTruthy();
      });

      // Click the history entry
      fireEvent.click(screen.getByText('Never Gonna Give You Up'));

      // Input should be pre-filled
      const input = screen.getByPlaceholderText(
        'https://www.youtube.com/watch?v=...',
      ) as HTMLInputElement;
      expect(input.value).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      // No socket emit fired by the history click alone
      expect(mockSocketEmit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Submit: valid watch?v= URL
  // -------------------------------------------------------------------------

  describe('submit valid watch URL', () => {
    it('emits youtube_play with non-empty videoId and the correct url', async () => {
      mockIsHost = true;
      render(<MusicControls />);
      fireEvent.click(screen.getByText(/Music Settings/));

      const input = screen.getByPlaceholderText(
        'https://www.youtube.com/watch?v=...',
      ) as HTMLInputElement;
      const validUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      fireEvent.change(input, { target: { value: validUrl } });

      fireEvent.click(screen.getByText('Play YouTube Audio'));

      await waitFor(() => {
        expect(mockSocketEmit).toHaveBeenCalledWith('youtube_play', {
          videoId: 'dQw4w9WgXcQ',
          url: validUrl,
        });
      });

      // Confirm the emit payload has non-empty videoId and no playlistId key
      const emitCall = mockSocketEmit.mock.calls.find(
        ([event]: [string]) => event === 'youtube_play',
      );
      expect(emitCall).toBeDefined();
      const payload = emitCall![1] as Record<string, unknown>;
      expect(payload.videoId).not.toBe('');
      expect('playlistId' in payload).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Submit: bare playlist?list= URL
  // -------------------------------------------------------------------------

  describe('submit bare playlist URL', () => {
    it('shows the inline note and emits youtube_play with videoId="" and no playlistId', async () => {
      mockIsHost = true;
      render(<MusicControls />);
      fireEvent.click(screen.getByText(/Music Settings/));

      const input = screen.getByPlaceholderText(
        'https://www.youtube.com/watch?v=...',
      ) as HTMLInputElement;
      const playlistUrl =
        'https://www.youtube.com/playlist?list=PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-';
      fireEvent.change(input, { target: { value: playlistUrl } });

      // Inline note should appear before submit
      expect(
        screen.getByText(/This playlist URL may not play inline/),
      ).toBeTruthy();

      // Submit
      fireEvent.click(screen.getByText('Play YouTube Audio'));

      await waitFor(() => {
        expect(mockSocketEmit).toHaveBeenCalledWith('youtube_play', {
          videoId: '',
          url: playlistUrl,
        });
      });

      // Confirm: videoId === '' and no playlistId key
      const emitCall = mockSocketEmit.mock.calls.find(
        ([event]: [string]) => event === 'youtube_play',
      );
      expect(emitCall).toBeDefined();
      const payload = emitCall![1] as Record<string, unknown>;
      expect(payload.videoId).toBe('');
      expect('playlistId' in payload).toBe(false);
    });
  });
});
