import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";

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

export interface AuthProviders {
  google: boolean;
  github: boolean;
  local: boolean;
}

interface AuthState {
  user: AuthUser | null;
  profile: UserProfile | null;
  stats: UserStats | null;
  providers: AuthProviders | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  checkAuth: () => Promise<void>;
  fetchProviders: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, username?: string, displayName?: string) => Promise<boolean>;
  logout: () => Promise<void>;
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
        providers: null,
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

        fetchProviders: async () => {
          try {
            const response = await fetch("/api/auth/providers");
            const data = await response.json();
            set({ providers: data });
          } catch (err) {
            console.error("Failed to fetch providers:", err);
          }
        },

        login: async (email: string, password: string) => {
          set({ isLoading: true, error: null });
          try {
            const response = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password }),
              credentials: "include",
            });
            const data = await response.json();

            if (!response.ok) {
              set({ error: data.error || "Login failed", isLoading: false });
              return false;
            }

            set({ user: data.user, isLoading: false });
            // Fetch profile and stats
            get().fetchProfile();
            get().fetchStats();
            return true;
          } catch (err) {
            console.error("Login error:", err);
            set({ error: "Login failed. Please try again.", isLoading: false });
            return false;
          }
        },

        register: async (email: string, password: string, username?: string, displayName?: string) => {
          set({ isLoading: true, error: null });
          try {
            const response = await fetch("/api/auth/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password, username, displayName }),
              credentials: "include",
            });
            const data = await response.json();

            if (!response.ok) {
              set({ error: data.error || "Registration failed", isLoading: false });
              return false;
            }

            set({ user: data.user, isLoading: false });
            // Fetch profile and stats
            get().fetchProfile();
            get().fetchStats();
            return true;
          } catch (err) {
            console.error("Registration error:", err);
            set({ error: "Registration failed. Please try again.", isLoading: false });
            return false;
          }
        },

        logout: async () => {
          set({ isLoading: true });
          try {
            await fetch("/api/auth/logout", {
              method: "POST",
              credentials: "include",
            });
          } catch (err) {
            console.error("Logout error:", err);
          }
          set({ user: null, profile: null, stats: null, isLoading: false });
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
              headers: { "Content-Type": "application/json" },
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
        partialize: (state) => ({
          // Only persist minimal state for quick rehydration
          // Full auth check happens on mount
        }),
      }
    )
  )
);
