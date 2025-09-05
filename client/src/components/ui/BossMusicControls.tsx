import React, { useState } from 'react';
import { useAudio } from '@/lib/stores/useAudio';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';

export function BossMusicControls() {
  const { 
    isBossMusicMuted, 
    isYoutubeAudioActive,
    youtubeUrl,
    toggleBossMusicMute, 
    playYoutubeAudio, 
    stopYoutubeAudio,
    setYoutubeUrl 
  } = useAudio();
  const { currentPlayer } = useGameState();
  const { socket } = useWebSocket();
  const [showSettings, setShowSettings] = useState(false);
  const [tempUrl, setTempUrl] = useState(youtubeUrl);

  const isHost = currentPlayer?.isHost;

  const extractVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const handleYoutubeSubmit = () => {
    const videoId = extractVideoId(tempUrl);
    if (videoId && socket) {
      // Send WebSocket event to sync with all players
      socket.emit('youtube_play', { videoId, url: tempUrl });
      setShowSettings(false);
    } else if (!videoId) {
      alert('Please enter a valid YouTube URL');
    }
  };

  const handleStopYoutube = () => {
    if (socket) {
      // Send WebSocket event to sync with all players
      socket.emit('youtube_stop', {});
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Boss Music Mute Button */}
      <RetroButton
        onClick={toggleBossMusicMute}
        variant="secondary"
        size="sm"
        className={`${isBossMusicMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
      >
        {isBossMusicMuted ? '🔇' : '🎵'} Boss Music
      </RetroButton>

      {/* Host YouTube Controls */}
      {isHost && (
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
            <div className="absolute top-full right-0 mt-2 z-50 max-w-md">
              <RetroCard title="Custom Boss Music">
                <div className="space-y-3 min-w-80">
                  {isYoutubeAudioActive && (
                    <div className="text-center">
                      <div className="text-sm text-green-400 mb-2">
                        🎵 YouTube audio playing
                      </div>
                      <RetroButton
                        onClick={handleStopYoutube}
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
                  
                  <div className="flex gap-2">
                    <RetroButton
                      onClick={handleYoutubeSubmit}
                      variant="accent"
                      size="sm"
                      disabled={!tempUrl.trim()}
                    >
                      Play YouTube Audio
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
          )}
        </>
      )}
    </div>
  );
}