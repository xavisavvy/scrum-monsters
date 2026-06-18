import React, { useState, useEffect } from 'react';
import { useAudio } from '@/lib/stores/useAudio';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';
import { loadHistory, saveHistory } from '@/lib/utils/musicHistory';
import { fetchYoutubeTitle, isPlaylistUrl, extractVideoId } from '@/lib/utils/youtubeTitle';
import type { MusicHistoryItem } from '@/lib/utils/musicHistory';

export function MusicControls() {
  const {
    isBossMusicMuted,
    isYoutubeAudioActive,
    toggleBossMusicMute,
  } = useAudio();
  const { currentPlayer } = useGameState();
  const { socket } = useWebSocket();

  const isHost = currentPlayer?.isHost;
  const hostId = currentPlayer?.id;

  const [showSettings, setShowSettings] = useState(false);
  const [tempUrl, setTempUrl] = useState('');
  const [history, setHistory] = useState<MusicHistoryItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load history when panel opens or on mount (for host)
  useEffect(() => {
    if (isHost && hostId) {
      setHistory(loadHistory(hostId));
    }
  }, [isHost, hostId, showSettings]);

  // Compute whether we should show the bare-playlist note:
  // Show it only for bare playlist?list=... URLs (no v= param), not for watch?v=...&list=...
  const showPlaylistNote =
    isHost &&
    tempUrl.trim() !== '' &&
    isPlaylistUrl(tempUrl) &&
    extractVideoId(tempUrl) === null;

  const handleSubmit = async () => {
    if (!tempUrl.trim() || !hostId || !socket) return;

    setIsSubmitting(true);
    try {
      const videoId = extractVideoId(tempUrl);
      const title = await fetchYoutubeTitle(tempUrl);

      // Save to history and update local state
      const updatedHistory = saveHistory(hostId, {
        url: tempUrl,
        title,
        usedAt: Date.now(),
      });
      setHistory(updatedHistory);

      // Emit the existing youtube_play event with {videoId, url}
      // videoId is '' for bare playlist URLs — server will reject via Zod (accept-only behavior)
      socket.emit('youtube_play', { videoId: videoId ?? '', url: tempUrl });

      // Close panel on submit
      setShowSettings(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStop = () => {
    if (socket) {
      socket.emit('youtube_stop');
    }
  };

  const handleHistorySelect = (item: MusicHistoryItem) => {
    setTempUrl(item.url);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Boss Music Mute Button — visible to all players */}
      <RetroButton
        onClick={toggleBossMusicMute}
        variant="secondary"
        size="sm"
        className={`${isBossMusicMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
      >
        {isBossMusicMuted ? '🔇' : '🎵'} Boss Music
      </RetroButton>

      {/* Host-only controls */}
      {isHost ? (
        <>
          <RetroButton
            onClick={() => setShowSettings(!showSettings)}
            variant="secondary"
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
          >
            ⚙️ Music Settings
          </RetroButton>

          {showSettings && (
            <div className="relative">
              <div className="absolute left-0 mt-2 z-[60] min-w-80 max-w-md">
                <RetroCard title="Custom Boss Music">
                  <div className="space-y-3">
                    {isYoutubeAudioActive && (
                      <div className="text-center">
                        <div className="text-sm text-green-400 mb-2">
                          🎵 YouTube audio playing
                        </div>
                        <RetroButton
                          onClick={handleStop}
                          variant="secondary"
                          size="sm"
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Stop YouTube Audio
                        </RetroButton>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm text-gray-300 mb-1">
                        YouTube Video URL:
                      </label>
                      <input
                        type="text"
                        value={tempUrl}
                        onChange={(e) => setTempUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                      />
                    </div>

                    {/* Bare-playlist note — only for playlist?list=... (no videoId) */}
                    {showPlaylistNote && (
                      <div className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-700/50 rounded px-2 py-1">
                        This playlist URL may not play inline — try a direct video URL instead
                      </div>
                    )}

                    {/* History dropdown — below the URL input per D-05 */}
                    {history.length > 0 && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Recent history:
                        </label>
                        <div className="max-h-40 overflow-y-auto border border-gray-600 rounded bg-gray-900">
                          {history.map((item, idx) => (
                            <button
                              key={`${item.url}-${idx}`}
                              onClick={() => handleHistorySelect(item)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 truncate border-b border-gray-700 last:border-b-0"
                              title={item.url}
                            >
                              {item.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <RetroButton
                        onClick={handleSubmit}
                        variant="accent"
                        size="sm"
                        disabled={!tempUrl.trim() || isSubmitting}
                      >
                        {isSubmitting ? 'Loading…' : 'Play YouTube Audio'}
                      </RetroButton>
                      <RetroButton
                        onClick={() => setShowSettings(false)}
                        variant="secondary"
                        size="sm"
                      >
                        Cancel
                      </RetroButton>
                    </div>

                    <div className="text-xs text-gray-400">
                      Audio will play to completion, then stop automatically.
                    </div>
                  </div>
                </RetroCard>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Non-host: read-only status indicator */
        <span className="text-sm text-gray-300">
          {isYoutubeAudioActive ? '🎵 Music playing' : 'Music stopped'}
        </span>
      )}
    </div>
  );
}
