import { create } from "zustand";

interface AudioState {
  backgroundMusic: HTMLAudioElement | null;
  menuMusic: HTMLAudioElement | null;
  hitSound: HTMLAudioElement | null;
  successSound: HTMLAudioElement | null;
  isMuted: boolean;
  isMenuMusicPlaying: boolean;
  fadeTimer: NodeJS.Timeout | null;
  
  // Setter functions
  setBackgroundMusic: (music: HTMLAudioElement) => void;
  setMenuMusic: (music: HTMLAudioElement) => void;
  setHitSound: (sound: HTMLAudioElement) => void;
  setSuccessSound: (sound: HTMLAudioElement) => void;
  
  // Control functions
  toggleMute: () => void;
  playHit: () => void;
  playSuccess: () => void;
  playMenuMusic: () => void;
  fadeInMenuMusic: () => void;
  fadeOutMenuMusic: () => void;
  stopMenuMusic: () => void;
}

export const useAudio = create<AudioState>((set, get) => ({
  backgroundMusic: null,
  menuMusic: null,
  hitSound: null,
  successSound: null,
  isMuted: true, // Start muted by default
  isMenuMusicPlaying: false,
  fadeTimer: null,
  
  setBackgroundMusic: (music) => set({ backgroundMusic: music }),
  setMenuMusic: (music) => set({ menuMusic: music }),
  setHitSound: (sound) => set({ hitSound: sound }),
  setSuccessSound: (sound) => set({ successSound: sound }),
  
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
  }
}));
