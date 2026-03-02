import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";
import { getCsrfHeaders } from '@/lib/csrfToken';

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface UserProfile {
  preferredAvatar: string | null;
  preferredTeam: string | null;
  audioEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  settings: Record<string, unknown> | null;
}

export interface UserStats {
  gamesPlayed: number;
  ticketsEstimated: number;
  accuracyScore: number;
  bossesDefeated: number;
  totalDamageDealt: number;
  totalHealing: number;
  revivesPerformed: number;
}

interface AuthState {
  user: AuthUser | null;
  profile: UserProfile | null;
  stats: UserStats | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  checkAuth: () => Promise<void>;
  login: () => void;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<boolean>;
  fetchStats: () => Promise<void>;
  clearError: () => void;
}

export const useAuth = create<AuthState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        user: null,
        profile: null,
        stats: null,
        isLoading: false,
        isInitialized: false,
        error: null,

        checkAuth: async () => {
          set({ isLoading: true, error: null });
          try {
            const response = await fetch("/api/auth/me", {
              credentials: "include",
            });
            const data = await response.json();

            if (data.user) {
              set({ user: data.user, isInitialized: true, isLoading: false });
              // Fetch profile and stats in background
              get().fetchProfile();
              get().fetchStats();
            } else {
              set({ user: null, profile: null, stats: null, isInitialized: true, isLoading: false });
            }
          } catch (err) {
            console.error("Auth check failed:", err);
            set({ user: null, isInitialized: true, isLoading: false });
          }
        },

        login: () => {
          window.location.href = "/api/auth/login";
        },

        logout: () => {
          window.location.href = "/api/auth/logout";
        },

        fetchProfile: async () => {
          try {
            const response = await fetch("/api/user/profile", {
              credentials: "include",
            });
            if (response.ok) {
              const data = await response.json();
              set({ profile: data.profile });
            }
          } catch (err) {
            console.error("Failed to fetch profile:", err);
          }
        },

        updateProfile: async (updates: Partial<UserProfile>) => {
          try {
            const response = await fetch("/api/user/profile", {
              method: "PUT",
              headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
              body: JSON.stringify(updates),
              credentials: "include",
            });

            if (!response.ok) {
              const data = await response.json();
              set({ error: data.error || "Failed to update profile" });
              return false;
            }

            const data = await response.json();
            set({ profile: data.profile });
            return true;
          } catch (err) {
            console.error("Failed to update profile:", err);
            set({ error: "Failed to update profile" });
            return false;
          }
        },

        fetchStats: async () => {
          try {
            const response = await fetch("/api/user/stats", {
              credentials: "include",
            });
            if (response.ok) {
              const data = await response.json();
              set({ stats: data.stats });
            }
          } catch (err) {
            console.error("Failed to fetch stats:", err);
          }
        },

        clearError: () => set({ error: null }),
      }),
      {
        name: "scrumquest-auth",
        partialize: () => ({
          // Only persist minimal state for quick rehydration
          // Full auth check happens on mount
        }),
      }
    )
  )
);
