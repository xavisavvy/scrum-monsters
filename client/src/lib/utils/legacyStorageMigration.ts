/**
 * One-time carry-over of localStorage keys written under the app's retired
 * name. Players who last visited before the rename keep their tutorial
 * progress instead of seeing every walkthrough again.
 *
 * Safe to call on every load: once the old keys are gone it does nothing.
 */

// legacy-name-ok: these old keys must stay spelled the old way to be found.
export const LEGACY_STORAGE_KEYS: Record<string, string> = {
  'scrumquest-tutorial': 'scrum-monsters-tutorial', // legacy-name-ok
  'scrumquest-auth': 'scrum-monsters-auth', // legacy-name-ok
};

/**
 * Copy each legacy key's value to its new key (unless the new key is already
 * set, which wins), then remove the legacy key.
 */
export function migrateLegacyStorageKeys(): void {
  for (const [oldKey, newKey] of Object.entries(LEGACY_STORAGE_KEYS)) {
    try {
      const legacy = localStorage.getItem(oldKey);
      if (legacy === null) continue;
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, legacy);
      }
      localStorage.removeItem(oldKey);
    } catch (error) {
      console.warn(`Failed to migrate localStorage key ${oldKey}:`, error);
    }
  }
}
