import React, { useEffect, useRef } from 'react';
import { useAudio } from '@/lib/stores/useAudio';

// Minimal shape of the YouTube IFrame API we use.
interface YTPlayer {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  loadVideoById: (videoId: string) => void;
}

interface YTPlayerEvent {
  target: YTPlayer;
}

interface YTStateChangeEvent {
  data: number;
}

interface YTPlayerConstructor {
  new (
    container: HTMLElement,
    options: {
      height: string;
      width: string;
      playerVars: Record<string, number>;
      events: {
        onReady?: (event: YTPlayerEvent) => void;
        onStateChange?: (event: YTStateChangeEvent) => void;
      };
    }
  ): YTPlayer;
}

declare global {
  interface Window {
    YT: { Player: YTPlayerConstructor };
    onYouTubeIframeAPIReady: () => void;
  }
}

export function YoutubeAudioPlayer() {
  const { setYoutubePlayer, stopYoutubeAudio } = useAudio();
  const playerRef = useRef<YTPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load YouTube IFrame API
    const loadYouTubeAPI = () => {
      if (window.YT) {
        initializePlayer();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);

      window.onYouTubeIframeAPIReady = initializePlayer;
    };

    const initializePlayer = () => {
      if (!containerRef.current) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        height: '0',
        width: '0',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          showinfo: 0,
        },
        events: {
          onReady: (event: YTPlayerEvent) => {
            setYoutubePlayer(event.target);
          },
          onStateChange: (event: YTStateChangeEvent) => {
            // When video ends (state 0), stop the audio
            if (event.data === 0) {
              stopYoutubeAudio();
            }
          },
        },
      });
    };

    loadYouTubeAPI();

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [setYoutubePlayer, stopYoutubeAudio]);

  return (
    <div 
      ref={containerRef}
      className="absolute opacity-0 pointer-events-none"
      style={{ left: '-9999px', top: '-9999px' }}
    />
  );
}