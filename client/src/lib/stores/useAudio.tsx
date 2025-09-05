import { create } from "zustand";

interface MusicTrack {
  name: string;
  file: string;
  audio?: HTMLAudioElement;
}

interface AudioState {
  backgroundMusic: HTMLAudioElement | null;
  menuMusic: HTMLAudioElement | null;
  bossMusic: HTMLAudioElement | null;
  youtubePlayer: any | null;
  hitSound: HTMLAudioElement | null;
  successSound: HTMLAudioElement | null;
  buttonSelectSound: HTMLAudioElement | null;
  explosionSound: HTMLAudioElement | null;
  musicTracks: MusicTrack[];
  currentTrackIndex: number;
  isMuted: boolean;
  isBossMusicMuted: boolean;
  isMenuMusicPlaying: boolean;
  isBossMusicPlaying: boolean;
  isYoutubeAudioActive: boolean;
  fadeTimer: NodeJS.Timeout | null;
  isTransitioning: boolean;
  youtubeUrl: string;
  
  // Setter functions
  setBackgroundMusic: (music: HTMLAudioElement) => void;
  setMenuMusic: (music: HTMLAudioElement) => void;
  setBossMusic: (music: HTMLAudioElement) => void;
  setYoutubePlayer: (player: any) => void;
  setHitSound: (sound: HTMLAudioElement) => void;
  setSuccessSound: (sound: HTMLAudioElement) => void;
  setButtonSelectSound: (sound: HTMLAudioElement) => void;
  setMusicTracks: (tracks: MusicTrack[]) => void;
  setYoutubeUrl: (url: string) => void;
  
  // Control functions
  toggleMute: () => void;
  toggleBossMusicMute: () => void;
  playHit: () => void;
  playSuccess: () => void;
  playButtonSelect: () => void;
  playExplosion: () => void;
  playMenuMusic: () => void;
  fadeInMenuMusic: () => void;
  fadeOutMenuMusic: () => void;
  stopMenuMusic: () => void;
  playBossMusic: () => void;
  fadeInBossMusic: () => void;
  fadeOutBossMusic: () => void;
  stopBossMusic: () => void;
  playYoutubeAudio: (videoId: string) => void;
  stopYoutubeAudio: () => void;
  switchToNextTrack: () => void;
  getCurrentTrackName: () => string;
}

export const useAudio = create<AudioState>((set, get) => ({
  backgroundMusic: null,
  menuMusic: null,
  bossMusic: null,
  youtubePlayer: null,
  hitSound: null,
  successSound: null,
  buttonSelectSound: null,
  musicTracks: [],
  currentTrackIndex: 0,
  isMuted: false, // Start unmuted by default
  isBossMusicMuted: false,
  isMenuMusicPlaying: false,
  isBossMusicPlaying: false,
  isYoutubeAudioActive: false,
  fadeTimer: null,
  isTransitioning: false,
  youtubeUrl: '',
  
  setBackgroundMusic: (music) => set({ backgroundMusic: music }),
  setMenuMusic: (music) => set({ menuMusic: music }),
  setBossMusic: (music) => set({ bossMusic: music }),
  setYoutubePlayer: (player) => set({ youtubePlayer: player }),
  setHitSound: (sound) => set({ hitSound: sound }),
  setSuccessSound: (sound) => set({ successSound: sound }),
  setButtonSelectSound: (sound) => set({ buttonSelectSound: sound }),
  setExplosionSound: (sound) => set({ explosionSound: sound }),
  setMusicTracks: (tracks) => set({ musicTracks: tracks }),
  setYoutubeUrl: (url) => set({ youtubeUrl: url }),
  
  toggleMute: () => {
    const { isMuted, menuMusic, fadeTimer } = get();
    const newMutedState = !isMuted;
    
    // Clear any running fade timer
    if (fadeTimer) {
      clearInterval(fadeTimer);
      set({ fadeTimer: null });
    }
    
    // Pause or resume the audio
    if (menuMusic) {
      if (newMutedState) {
        // Muting - pause the audio
        menuMusic.pause();
        set({ isMenuMusicPlaying: false });
      } else {
        // Unmuting - resume the audio if it was playing
        const wasPlaying = !menuMusic.paused || menuMusic.currentTime > 0;
        if (wasPlaying) {
          menuMusic.play().catch(error => {
            console.log("Menu music resume prevented:", error);
          });
          set({ isMenuMusicPlaying: true });
        }
      }
    }
    
    // Update the muted state
    set({ isMuted: newMutedState });
    
    // Log the change
    console.log(`Sound ${newMutedState ? 'muted' : 'unmuted'}`);
  },
  
  playHit: () => {
    const { hitSound, isMuted } = get();
    if (hitSound) {
      // If sound is muted, don't play anything
      if (isMuted) {
        console.log("Hit sound skipped (muted)");
        return;
      }
      
      // Clone the sound to allow overlapping playback
      const soundClone = hitSound.cloneNode() as HTMLAudioElement;
      soundClone.volume = 0.3;
      soundClone.play().catch(error => {
        console.log("Hit sound play prevented:", error);
      });
    }
  },
  
  playSuccess: () => {
    const { successSound, isMuted } = get();
    if (successSound) {
      // If sound is muted, don't play anything
      if (isMuted) {
        console.log("Success sound skipped (muted)");
        return;
      }
      
      successSound.currentTime = 0;
      successSound.play().catch(error => {
        console.log("Success sound play prevented:", error);
      });
    }
  },
  
  playButtonSelect: () => {
    const { buttonSelectSound, isMuted } = get();
    if (buttonSelectSound) {
      // If sound is muted, don't play anything
      if (isMuted) {
        console.log("Button select sound skipped (muted)");
        return;
      }
      
      // Clone the sound to allow overlapping playback
      const soundClone = buttonSelectSound.cloneNode() as HTMLAudioElement;
      soundClone.volume = 0.5;
      soundClone.play().catch(error => {
        console.log("Button select sound play prevented:", error);
      });
    }
  },

  playExplosion: () => {
    const { explosionSound, isMuted } = get();
    if (explosionSound) {
      // If sound is muted, don't play anything
      if (isMuted) {
        console.log("Explosion sound skipped (muted)");
        return;
      }
      
      // Clone the sound to allow overlapping playback
      const soundClone = explosionSound.cloneNode() as HTMLAudioElement;
      soundClone.volume = 0.6;
      soundClone.play().catch(error => {
        console.log("Explosion sound play prevented:", error);
      });
    }
  },
  
  playMenuMusic: () => {
    const { menuMusic, isMuted } = get();
    if (menuMusic && !isMuted) {
      menuMusic.loop = true;
      menuMusic.volume = 0.4;
      menuMusic.play().catch(error => {
        console.log("Menu music play prevented:", error);
      });
      set({ isMenuMusicPlaying: true });
    }
  },
  
  fadeInMenuMusic: () => {
    const { menuMusic, isMuted, fadeTimer } = get();
    if (menuMusic && !isMuted) {
      // Clear any existing fade timer
      if (fadeTimer) {
        clearInterval(fadeTimer);
      }
      
      menuMusic.loop = true;
      menuMusic.volume = 0;
      
      menuMusic.play().then(() => {
        // Only set playing state after successful play
        set({ isMenuMusicPlaying: true });
        
        // Fade in over 2 seconds (40 intervals * 50ms = 2000ms)
        // 0.4 target volume / 40 intervals = 0.01 increment per interval
        const fadeInterval = setInterval(() => {
          if (menuMusic.volume < 0.4) {
            menuMusic.volume = Math.min(0.4, menuMusic.volume + 0.01);
          } else {
            clearInterval(fadeInterval);
            set({ fadeTimer: null });
          }
        }, 50); // Update every 50ms for smooth fade
        
        set({ fadeTimer: fadeInterval });
      }).catch(error => {
        console.log("Menu music play prevented:", error);
        set({ fadeTimer: null });
      });
    }
  },
  
  fadeOutMenuMusic: () => {
    const { menuMusic, fadeTimer } = get();
    if (menuMusic) {
      // Clear any existing fade timer
      if (fadeTimer) {
        clearInterval(fadeTimer);
      }
      
      // Fade out over 1 second (20 intervals * 50ms = 1000ms)
      // Start from current volume, decrement by 0.02 per interval
      const fadeInterval = setInterval(() => {
        if (menuMusic.volume > 0) {
          menuMusic.volume = Math.max(0, menuMusic.volume - 0.02);
        } else {
          clearInterval(fadeInterval);
          menuMusic.pause();
          set({ isMenuMusicPlaying: false, fadeTimer: null });
        }
      }, 50); // Update every 50ms for smooth fade
      
      set({ fadeTimer: fadeInterval });
    }
  },
  
  stopMenuMusic: () => {
    const { menuMusic, fadeTimer } = get();
    if (menuMusic) {
      // Clear any running fade timer
      if (fadeTimer) {
        clearInterval(fadeTimer);
        set({ fadeTimer: null });
      }
      
      menuMusic.pause();
      menuMusic.currentTime = 0;
      set({ isMenuMusicPlaying: false });
    }
  },
  
  switchToNextTrack: () => {
    const { musicTracks, currentTrackIndex, isMenuMusicPlaying, isMuted, fadeTimer, isTransitioning } = get();
    
    if (musicTracks.length === 0 || isTransitioning) return;
    
    // Set transitioning flag to prevent multiple switches
    set({ isTransitioning: true });
    
    const currentMusic = get().menuMusic;
    const nextIndex = (currentTrackIndex + 1) % musicTracks.length;
    const nextTrack = musicTracks[nextIndex];
    
    if (!nextTrack.audio) {
      set({ isTransitioning: false });
      return;
    }
    
    // If music is playing, fade out current track first
    if (currentMusic && isMenuMusicPlaying && !isMuted) {
      // Clear any existing fade timer
      if (fadeTimer) {
        clearInterval(fadeTimer);
        set({ fadeTimer: null });
      }
      
      // Crossfade: fade out current track
      const fadeOutInterval = setInterval(() => {
        if (currentMusic.volume > 0) {
          currentMusic.volume = Math.max(0, currentMusic.volume - 0.04); // Faster fade-out
        } else {
          clearInterval(fadeOutInterval);
          
          // Now switch to new track
          currentMusic.pause();
          currentMusic.currentTime = 0;
          
          // Set new track with volume 0
          nextTrack.audio!.volume = 0;
          nextTrack.audio!.loop = true;
          
          set({ 
            menuMusic: nextTrack.audio!, 
            currentTrackIndex: nextIndex,
            isMenuMusicPlaying: false,
            fadeTimer: null
          });
          
          // Fade in new track
          nextTrack.audio!.play().then(() => {
            set({ isMenuMusicPlaying: true });
            
            const fadeInInterval = setInterval(() => {
              if (nextTrack.audio!.volume < 0.4) {
                nextTrack.audio!.volume = Math.min(0.4, nextTrack.audio!.volume + 0.02);
              } else {
                clearInterval(fadeInInterval);
                set({ fadeTimer: null, isTransitioning: false });
              }
            }, 50);
            
            set({ fadeTimer: fadeInInterval });
          }).catch(error => {
            console.log("Track switch play prevented:", error);
            set({ isTransitioning: false, fadeTimer: null });
          });
        }
      }, 25); // Faster fade-out for crossfade
      
      set({ fadeTimer: fadeOutInterval });
    } else {
      // Not playing, just switch tracks immediately
      if (currentMusic) {
        currentMusic.pause();
        currentMusic.currentTime = 0;
      }
      
      // Ensure new track starts at volume 0
      nextTrack.audio.volume = 0;
      nextTrack.audio.loop = true;
      
      set({ 
        menuMusic: nextTrack.audio, 
        currentTrackIndex: nextIndex,
        isMenuMusicPlaying: false,
        isTransitioning: false
      });
    }
    
    console.log(`Switched to track: ${nextTrack.name}`);
  },
  
  getCurrentTrackName: () => {
    const { musicTracks, currentTrackIndex } = get();
    if (musicTracks.length > 0 && musicTracks[currentTrackIndex]) {
      return musicTracks[currentTrackIndex].name;
    }
    return 'Unknown Track';
  },

  toggleBossMusicMute: () => {
    const { isBossMusicMuted, bossMusic, youtubePlayer, isYoutubeAudioActive } = get();
    const newMutedState = !isBossMusicMuted;
    
    if (isYoutubeAudioActive && youtubePlayer) {
      if (newMutedState) {
        youtubePlayer.pauseVideo();
      } else {
        youtubePlayer.playVideo();
      }
    } else if (bossMusic) {
      if (newMutedState) {
        bossMusic.pause();
        set({ isBossMusicPlaying: false });
      } else {
        bossMusic.play().catch((error: any) => {
          console.log("Boss music resume prevented:", error);
        });
        set({ isBossMusicPlaying: true });
      }
    }
    
    set({ isBossMusicMuted: newMutedState });
    console.log(`Boss music ${newMutedState ? 'muted' : 'unmuted'}`);
  },

  playBossMusic: () => {
    const { bossMusic, isBossMusicMuted } = get();
    if (bossMusic && !isBossMusicMuted) {
      bossMusic.loop = true;
      bossMusic.volume = 0.6;
      bossMusic.play().catch((error: any) => {
        console.log("Boss music play prevented:", error);
      });
      set({ isBossMusicPlaying: true });
    }
  },

  fadeInBossMusic: () => {
    const { bossMusic, isBossMusicMuted, isYoutubeAudioActive } = get();
    
    // Don't play boss music if YouTube music is already active
    if (isYoutubeAudioActive) {
      console.log("Boss music skipped - YouTube audio is active");
      return;
    }
    
    if (bossMusic && !isBossMusicMuted) {
      bossMusic.volume = 0;
      bossMusic.loop = true;
      bossMusic.play().catch((error: any) => {
        console.log("Boss music fade in prevented:", error);
      });
      
      set({ isBossMusicPlaying: true });
      
      // Fade in over 1 second
      const fadeInInterval = setInterval(() => {
        if (bossMusic.volume < 0.6) {
          bossMusic.volume = Math.min(bossMusic.volume + 0.05, 0.6);
        } else {
          clearInterval(fadeInInterval);
        }
      }, 50);
    }
  },

  fadeOutBossMusic: () => {
    const { bossMusic } = get();
    if (bossMusic && !bossMusic.paused) {
      const fadeOutInterval = setInterval(() => {
        if (bossMusic.volume > 0.05) {
          bossMusic.volume = Math.max(bossMusic.volume - 0.05, 0);
        } else {
          bossMusic.pause();
          bossMusic.volume = 0.6; // Reset volume for next play
          set({ isBossMusicPlaying: false });
          clearInterval(fadeOutInterval);
        }
      }, 50);
    }
  },

  stopBossMusic: () => {
    const { bossMusic, youtubePlayer, isYoutubeAudioActive } = get();
    
    if (isYoutubeAudioActive && youtubePlayer) {
      youtubePlayer.stopVideo();
      set({ isYoutubeAudioActive: false });
    }
    
    if (bossMusic) {
      bossMusic.pause();
      bossMusic.currentTime = 0;
      set({ isBossMusicPlaying: false });
    }
  },

  playYoutubeAudio: (videoId: string) => {
    const { youtubePlayer, bossMusic, isBossMusicMuted, isBossMusicPlaying } = get();
    
    if (isBossMusicMuted) return;
    
    // Explicitly pause boss music if playing
    if (bossMusic && isBossMusicPlaying) {
      bossMusic.pause();
      set({ isBossMusicPlaying: false });
      console.log("🎵 Boss music paused for YouTube");
    }
    
    if (youtubePlayer && videoId) {
      youtubePlayer.loadVideoById(videoId);
      set({ isYoutubeAudioActive: true });
      console.log("🎵 YouTube music started:", videoId);
    }
  },

  stopYoutubeAudio: () => {
    const { youtubePlayer, bossMusic } = get();
    if (youtubePlayer) {
      youtubePlayer.stopVideo();
      set({ isYoutubeAudioActive: false, youtubeUrl: '' }); // Clear URL here
      console.log("🎵 YouTube music stopped");
      
      // Resume boss music only if we're in battle and music isn't muted
      const { isBossMusicMuted, isBossMusicPlaying } = get();
      
      // Check if we're in battle phase (basic check - could be enhanced)
      const currentLobby = document.querySelector('[data-game-phase="battle"]');
      const isInBattle = !!currentLobby;
      
      if (bossMusic && !isBossMusicMuted && !isBossMusicPlaying && isInBattle) {
        console.log("🎵 Resuming boss music after YouTube stop");
        bossMusic.play().catch((error: any) => {
          console.log("Boss music resume prevented:", error);
        });
        set({ isBossMusicPlaying: true });
      }
    }
  }
}));
