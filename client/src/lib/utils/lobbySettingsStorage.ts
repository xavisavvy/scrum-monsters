import { TimerSettings, JiraSettings, EstimationSettings } from '@shared/gameEvents';

export interface LobbySettingsPresets {
  timerSettings?: TimerSettings;
  jiraSettings?: JiraSettings;
  estimationSettings?: EstimationSettings;
}

const STORAGE_KEY = 'scrum-monsters-lobby-settings';
const COOKIE_PREFIX = 'sm-lobby-';

/**
 * Utility class for managing persistent lobby settings
 * Uses localStorage by default (better for this use case than cookies)
 * Provides cookie fallback option for compatibility
 */
export class LobbySettingsStorage {
  private static useLocalStorage = typeof window !== 'undefined' && 'localStorage' in window;

  /**
   * Save lobby settings to persistent storage
   */
  static saveSettings(settings: LobbySettingsPresets): void {
    try {
      if (this.useLocalStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } else {
        // Fallback to cookies
        this.saveToCookies(settings);
      }
      console.log('💾 Lobby settings saved to persistent storage');
    } catch (error) {
      console.warn('Failed to save lobby settings:', error);
    }
  }

  /**
   * Load saved lobby settings from persistent storage
   */
  static loadSettings(): LobbySettingsPresets {
    try {
      if (this.useLocalStorage) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          console.log('📂 Loaded lobby settings from localStorage');
          return this.validateSettings(parsed);
        }
      } else {
        // Fallback to cookies
        return this.loadFromCookies();
      }
    } catch (error) {
      console.warn('Failed to load lobby settings:', error);
    }
    
    return this.getDefaultSettings();
  }

  /**
   * Clear all saved settings
   */
  static clearSettings(): void {
    try {
      if (this.useLocalStorage) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        this.clearCookies();
      }
      console.log('🗑️ Lobby settings cleared from persistent storage');
    } catch (error) {
      console.warn('Failed to clear lobby settings:', error);
    }
  }

  /**
   * Update specific setting category and save
   */
  static updateTimerSettings(timerSettings: TimerSettings): void {
    const current = this.loadSettings();
    current.timerSettings = timerSettings;
    this.saveSettings(current);
  }

  static updateJiraSettings(jiraSettings: JiraSettings): void {
    const current = this.loadSettings();
    current.jiraSettings = jiraSettings;
    this.saveSettings(current);
  }

  static updateEstimationSettings(estimationSettings: EstimationSettings): void {
    const current = this.loadSettings();
    current.estimationSettings = estimationSettings;
    this.saveSettings(current);
  }

  /**
   * Get default settings when none are saved
   */
  private static getDefaultSettings(): LobbySettingsPresets {
    return {
      timerSettings: {
        enabled: false,
        durationMinutes: 5
      },
      jiraSettings: {
        baseUrl: undefined
      },
      estimationSettings: {
        scaleType: 'fibonacci'
      }
    };
  }

  /**
   * Validate and sanitize loaded settings
   */
  private static validateSettings(settings: any): LobbySettingsPresets {
    const defaults = this.getDefaultSettings();
    
    return {
      timerSettings: {
        enabled: typeof settings.timerSettings?.enabled === 'boolean' 
          ? settings.timerSettings.enabled 
          : defaults.timerSettings!.enabled,
        durationMinutes: typeof settings.timerSettings?.durationMinutes === 'number' &&
          settings.timerSettings.durationMinutes > 0 &&
          settings.timerSettings.durationMinutes <= 60
          ? settings.timerSettings.durationMinutes
          : defaults.timerSettings!.durationMinutes
      },
      jiraSettings: {
        baseUrl: typeof settings.jiraSettings?.baseUrl === 'string' &&
          settings.jiraSettings.baseUrl.length > 0
          ? settings.jiraSettings.baseUrl
          : defaults.jiraSettings!.baseUrl
      },
      estimationSettings: {
        scaleType: ['fibonacci', 'doubling', 'tshirt'].includes(settings.estimationSettings?.scaleType)
          ? settings.estimationSettings.scaleType
          : defaults.estimationSettings!.scaleType,
        customTshirtMapping: settings.estimationSettings?.customTshirtMapping &&
          typeof settings.estimationSettings.customTshirtMapping === 'object'
          ? settings.estimationSettings.customTshirtMapping
          : undefined
      }
    };
  }

  /**
   * Cookie fallback methods (for environments without localStorage)
   */
  private static saveToCookies(settings: LobbySettingsPresets): void {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1); // 1 year expiry
    const cookieOptions = `; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;

    // Save each setting category as separate cookies to stay under size limits
    if (settings.timerSettings) {
      document.cookie = `${COOKIE_PREFIX}timer=${encodeURIComponent(JSON.stringify(settings.timerSettings))}${cookieOptions}`;
    }
    if (settings.jiraSettings) {
      document.cookie = `${COOKIE_PREFIX}jira=${encodeURIComponent(JSON.stringify(settings.jiraSettings))}${cookieOptions}`;
    }
    if (settings.estimationSettings) {
      document.cookie = `${COOKIE_PREFIX}estimation=${encodeURIComponent(JSON.stringify(settings.estimationSettings))}${cookieOptions}`;
    }
  }

  private static loadFromCookies(): LobbySettingsPresets {
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key.startsWith(COOKIE_PREFIX)) {
        acc[key.substring(COOKIE_PREFIX.length)] = decodeURIComponent(value);
      }
      return acc;
    }, {} as Record<string, string>);

    const settings: LobbySettingsPresets = {};

    try {
      if (cookies.timer) settings.timerSettings = JSON.parse(cookies.timer);
      if (cookies.jira) settings.jiraSettings = JSON.parse(cookies.jira);
      if (cookies.estimation) settings.estimationSettings = JSON.parse(cookies.estimation);
    } catch (error) {
      console.warn('Failed to parse settings from cookies:', error);
    }

    console.log('📂 Loaded lobby settings from cookies');
    return this.validateSettings(settings);
  }

  private static clearCookies(): void {
    const pastDate = 'Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = `${COOKIE_PREFIX}timer=; expires=${pastDate}; path=/`;
    document.cookie = `${COOKIE_PREFIX}jira=; expires=${pastDate}; path=/`;
    document.cookie = `${COOKIE_PREFIX}estimation=; expires=${pastDate}; path=/`;
  }
}