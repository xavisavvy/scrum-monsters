import { describe, it, expect, beforeEach } from 'vitest';
import { LEGACY_STORAGE_KEYS, migrateLegacyStorageKeys } from './legacyStorageMigration';

const [OLD_TUTORIAL_KEY] = Object.keys(LEGACY_STORAGE_KEYS);
const NEW_TUTORIAL_KEY = LEGACY_STORAGE_KEYS[OLD_TUTORIAL_KEY];

describe('migrateLegacyStorageKeys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('moves a legacy value to the new key and removes the legacy key', () => {
    localStorage.setItem(OLD_TUTORIAL_KEY, '{"state":{"completedTutorials":{"a":true}}}');

    migrateLegacyStorageKeys();

    expect(localStorage.getItem(NEW_TUTORIAL_KEY)).toBe('{"state":{"completedTutorials":{"a":true}}}');
    expect(localStorage.getItem(OLD_TUTORIAL_KEY)).toBeNull();
  });

  it('keeps an existing new-key value and still removes the legacy key', () => {
    localStorage.setItem(OLD_TUTORIAL_KEY, 'old');
    localStorage.setItem(NEW_TUTORIAL_KEY, 'new');

    migrateLegacyStorageKeys();

    expect(localStorage.getItem(NEW_TUTORIAL_KEY)).toBe('new');
    expect(localStorage.getItem(OLD_TUTORIAL_KEY)).toBeNull();
  });

  it('does nothing when no legacy keys exist', () => {
    migrateLegacyStorageKeys();

    expect(localStorage.length).toBe(0);
  });

  it('maps every legacy key to a scrum-monsters key', () => {
    for (const newKey of Object.values(LEGACY_STORAGE_KEYS)) {
      expect(newKey.startsWith('scrum-monsters-')).toBe(true);
    }
  });
});
