# Audio Mute Persistence Feature

**Date**: 2026-01-16
**Feature**: Persistent audio mute settings across sessions

## Overview

Audio mute preferences (for both general music and boss music) are now automatically saved to browser localStorage and restored when users return to the site.

## Implementation Details

### Storage Key

```typescript
const MUTE_SETTINGS_KEY = 'scrum-monsters-mute-settings';
```

### Stored Data Structure

```json
{
  "isMuted": boolean,           // General music (home page, lobby, menu)
  "isBossMusicMuted": boolean   // Boss battle music and YouTube audio
}
```

### Changes Made

**File**: `client/src/lib/stores/useAudio.tsx`

1. **Load on Initialization** (lines 74-99)
   - Reads mute settings from localStorage on app load
   - Defaults to unmuted if no settings exist
   - Handles localStorage access errors gracefully

2. **Save on Toggle**
   - `toggleMute()` - Saves after toggling general music mute
   - `toggleBossMusicMute()` - Saves after toggling boss music mute

### User Experience

**Before:**
- User mutes music on home page
- User navigates to lobby → Music plays again (annoying!)
- User refreshes page → Music plays again
- User returns next day → Music plays again

**After:**
- User mutes music on home page → Saved to localStorage
- User navigates to lobby → Music stays muted ✓
- User refreshes page → Music stays muted ✓
- User returns next day → Music stays muted ✓
- User can unmute anytime, preference persists ✓

## How It Works

### Separate Mute Controls

1. **General Music Mute** (`isMuted`)
   - Affects: Home page music, lobby music, menu music, sound effects
   - Toggle button: Usually in header/menu
   - Persisted independently

2. **Boss Music Mute** (`isBossMusicMuted`)
   - Affects: Battle music, YouTube audio during battles
   - Toggle button: In-game during battles
   - Persisted independently

### Automatic Application

When music is about to play, the audio system checks:

```typescript
// General music
if (menuMusic && !isMuted) {
  menuMusic.play();
}

// Boss music
if (bossMusic && !isBossMusicMuted) {
  bossMusic.play();
}
```

This means persisted preferences are automatically respected without additional code changes.

## Code Examples

### Loading Settings (Initialization)

```typescript
const loadMuteSettings = (): { isMuted: boolean; isBossMusicMuted: boolean } => {
  try {
    const stored = localStorage.getItem(MUTE_SETTINGS_KEY);
    if (stored) {
      const settings = JSON.parse(stored);
      return {
        isMuted: settings.isMuted ?? false,
        isBossMusicMuted: settings.isBossMusicMuted ?? false
      };
    }
  } catch (error) {
    console.warn('Failed to load mute settings:', error);
  }
  return { isMuted: false, isBossMusicMuted: false };
};

const initialMuteSettings = loadMuteSettings();

// Use in store initialization
isMuted: initialMuteSettings.isMuted,
isBossMusicMuted: initialMuteSettings.isBossMusicMuted,
```

### Saving Settings (On Toggle)

```typescript
const saveMuteSettings = (isMuted: boolean, isBossMusicMuted: boolean) => {
  try {
    localStorage.setItem(MUTE_SETTINGS_KEY, JSON.stringify({ isMuted, isBossMusicMuted }));
  } catch (error) {
    console.warn('Failed to save mute settings:', error);
  }
};

// Called in toggleMute()
set({ isMuted: newMutedState });
saveMuteSettings(newMutedState, isBossMusicMuted);

// Called in toggleBossMusicMute()
set({ isBossMusicMuted: newMutedState });
saveMuteSettings(isMuted, newMutedState);
```

## Browser Compatibility

Uses standard `localStorage` API, supported in:
- ✅ Chrome/Edge 4+
- ✅ Firefox 3.5+
- ✅ Safari 4+
- ✅ Opera 10.5+
- ✅ iOS Safari 3.2+
- ✅ Android Browser 2.1+

## Privacy & Storage

- **Storage Location**: Browser's localStorage (domain-scoped)
- **Data Size**: ~50 bytes
- **Persistence**: Until user clears browser data
- **Privacy**: Stored locally only, never sent to server
- **Scope**: Per domain (scrummonsters.com has separate storage from localhost)

## Error Handling

Gracefully handles:
- **localStorage disabled**: Falls back to default unmuted state
- **localStorage full**: Logs warning, uses current session state
- **Corrupted data**: Falls back to default unmuted state
- **Browser incognito**: Works normally (clears on browser close)

## Testing

### Manual Test Steps

1. **Initial State**
   - Open site → Music should play (default unmuted)
   - Open DevTools → Console → Check: No localStorage errors

2. **Mute Persistence**
   - Click mute button
   - Check DevTools → Application → Local Storage
   - Should see: `scrum-monsters-mute-settings` with `{"isMuted":true,...}`
   - Refresh page → Music should stay muted
   - Navigate to different pages → Music should stay muted

3. **Boss Music Persistence**
   - Start a battle
   - Mute boss music
   - Check localStorage updated
   - Refresh during battle → Boss music should stay muted

4. **Independent Controls**
   - Mute general music
   - Boss music should still work (if unmuted)
   - Mute boss music
   - General music should still work (if unmuted)

5. **Cross-Session**
   - Mute both music types
   - Close browser completely
   - Reopen site → Both should remain muted

### Console Commands (DevTools)

```javascript
// Check current settings
localStorage.getItem('scrum-monsters-mute-settings');

// Manually set muted
localStorage.setItem('scrum-monsters-mute-settings', '{"isMuted":true,"isBossMusicMuted":true}');

// Clear settings (reset to default)
localStorage.removeItem('scrum-monsters-mute-settings');

// Refresh to see effect
location.reload();
```

## Future Enhancements

Potential improvements:
- [ ] Add volume sliders with persistence
- [ ] Per-track mute settings
- [ ] Audio preset profiles (Silent, SFX Only, Full)
- [ ] Export/import audio preferences
- [ ] Sync preferences across devices (requires backend)

## Troubleshooting

### Issue: Mute settings not persisting

**Check:**
1. Browser localStorage enabled?
   ```javascript
   typeof(Storage) !== "undefined"  // Should be true
   ```
2. Incognito/Private mode? (Clears on close)
3. Browser storage quota exceeded?
4. Third-party cookies blocked? (Shouldn't affect localStorage but check)

**Solution:**
- Clear browser cache/storage and retry
- Check DevTools Console for errors
- Try different browser

### Issue: Music plays despite being muted

**Check:**
1. localStorage value correct?
   ```javascript
   JSON.parse(localStorage.getItem('scrum-monsters-mute-settings'))
   ```
2. Race condition on page load?
3. Audio initialized before settings loaded?

**Solution:**
- Hard refresh (Ctrl+Shift+R)
- Check browser console for audio errors

## Related Files

- `client/src/lib/stores/useAudio.tsx` - Main audio store with persistence
- `client/src/components/ui/BossMusicControls.tsx` - Boss music toggle UI
- Components using audio: `Lobby.tsx`, `BattleScreen.tsx`, etc.

## Documentation

- See `CLAUDE.MD` for overall project documentation
- See `README.md` for user-facing features

---

**Status**: ✅ Implemented and tested
**Backward Compatible**: Yes (existing users default to unmuted)
**Performance Impact**: Negligible (localStorage read on init, write on toggle)
