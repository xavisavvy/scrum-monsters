# Quality of Life Improvements

**Date**: 2026-01-17
**Features**: Player name persistence, Copy lobby code button, Quick rejoin last lobby

## Overview

Three high-impact quality-of-life improvements have been implemented to enhance the user experience:

1. **Player Name Persistence** - Automatically saves and restores player names
2. **Copy Lobby Code Button** - One-click copying of lobby codes
3. **Quick Rejoin Last Lobby** - Fast access to recently used lobbies

## 1. Player Name Persistence

### What It Does

Automatically remembers the player's name across sessions, eliminating the need to retype it every time.

### User Experience

**Before:**
- User visits site
- Creates/joins lobby
- Types name: "Alice"
- Next day: Types name again: "Alice"
- Every session: Must retype name

**After:**
- User visits site first time
- Types name: "Alice" → Saved automatically
- Next visit: Name already filled in ✓
- Can edit if needed
- Works across all lobby types (create, join, room)

### Implementation

**File**: `client/src/lib/utils/playerNameStorage.ts` (New utility)
```typescript
export class PlayerNameStorage {
  static loadName(): string;     // Load saved name
  static saveName(name: string); // Save name to localStorage
  static clearName();            // Clear saved name
}
```

**Storage Key**: `scrum-monsters-player-name`

**Modified Components:**
- `LobbyCreation.tsx` - Pre-fills host name, saves on create
- `LobbyJoin.tsx` - Pre-fills player name, saves on join
- `RoomJoin.tsx` - Pre-fills player name in both create/join modes

### Code Changes

```typescript
// On component mount
useEffect(() => {
  const savedName = PlayerNameStorage.loadName();
  if (savedName) {
    setPlayerName(savedName); // or setHostName(savedName)
  }
}, []);

// On lobby create/join
const handleAction = () => {
  // ... validation ...
  PlayerNameStorage.saveName(playerName.trim());
  // ... emit socket event ...
};
```

## 2. Copy Lobby Code Button

### What It Does

Adds a one-click copy button next to the lobby code for easy sharing.

### User Experience

**Before:**
- Host sees lobby code: `X7K2M9`
- Must manually select and copy the code
- Or use the full invite link

**After:**
- Host sees lobby code: `X7K2M9` 📋
- Click clipboard icon → Code copied
- Toast notification confirms
- Much faster than invite link for quick sharing

### Implementation

**File**: `client/src/components/game/Lobby.tsx`

**Added Function:**
```typescript
const copyLobbyCode = () => {
  if (currentLobby?.id) {
    navigator.clipboard.writeText(currentLobby.id);
    setShowCopiedNotification(true);

    // Auto-hide notification after 2 seconds
    setTimeout(() => {
      setShowCopiedNotification(false);
    }, 2000);
  }
};
```

**UI Change (Lobby.tsx:680-691):**
```tsx
<div className="flex items-center justify-center gap-2">
  <p className="text-gray-400">
    Lobby Code: <span className="retro-text-glow-light text-xl font-mono">{currentLobby.id}</span>
  </p>
  <button
    onClick={copyLobbyCode}
    className="text-gray-400 hover:text-white transition-colors p-1"
    title="Copy lobby code"
  >
    📋
  </button>
</div>
```

### Benefits

- Faster than copying full invite link
- Works even if invite link generation fails
- Familiar clipboard icon (📋)
- Uses existing notification system
- Minimal UI footprint

## 3. Quick Rejoin Last Lobby

### What It Does

Shows a prominent "Rejoin" button on the menu for the last lobby the user was in (within 24 hours).

### User Experience

**Before:**
- User was in "Daily Standup" lobby (code: `ABC123`)
- Closes browser
- Returns later
- Must click "Join Battle"
- Type lobby code: `ABC123`
- Type name again

**After:**
- User was in "Daily Standup" lobby
- Closes browser
- Returns later
- Sees: **"🔄 Rejoin: Daily Standup"** button
- One click → Back in the lobby
- Name already filled in (from #1)
- Much faster workflow

### Implementation

**File**: `client/src/lib/utils/lastLobbyStorage.ts` (New utility)
```typescript
export interface LastLobbyInfo {
  lobbyId: string;
  lobbyName: string;
  timestamp: number;
}

export class LastLobbyStorage {
  static loadLastLobby(): LastLobbyInfo | null;
  static saveLastLobby(lobbyId: string, lobbyName: string);
  static clearLastLobby();
}
```

**Storage Key**: `scrum-monsters-last-lobby`

**Modified Files:**
- `App.tsx` - Tracks last lobby, shows rejoin button
  - Saves lobby info on `lobby_created` and `lobby_joined` events
  - Displays rejoin button on menu if last lobby exists (<24 hours old)

**UI Addition (App.tsx:574-587):**
```tsx
{lastLobby && (
  <div className="mb-2">
    <RetroButton
      onClick={() => {
        playButtonSelect();
        fadeOutMenuMusic();
        setJoinLobbyId(lastLobby.lobbyId);
        setAppState('join_lobby');
      }}
      className="w-full"
      variant="primary"
    >
      🔄 Rejoin: {lastLobby.lobbyName}
    </RetroButton>
    <p className="text-xs text-gray-500 mt-1 text-center">
      Lobby Code: {lastLobby.lobbyId}
    </p>
  </div>
)}
```

### Smart Expiration

- Only shows lobbies from the last 24 hours
- Prevents rejoining stale/closed lobbies
- Automatically cleaned up on age check

## Combined Workflow Example

### Scenario: Daily Standup Team

**Day 1:**
1. Alice creates lobby "Daily Standup" (code: `STAND1`)
2. Types her name: "Alice" → **Saved automatically**
3. Shares code with team using **copy button** 📋
4. Meeting ends, everyone leaves

**Day 2:**
1. Alice opens ScrumMonsters
2. Sees **"🔄 Rejoin: Daily Standup"** button
3. Clicks rejoin → Name already "Alice" → Joins immediately
4. Bob opens ScrumMonsters
5. Sees **"🔄 Rejoin: Daily Standup"** button
6. Clicks rejoin → Name already "Bob" → Joins immediately

**Result**: Two-click rejoin instead of multi-step manual process!

## Technical Details

### LocalStorage Keys

All improvements use browser localStorage for persistence:

| Feature | Key | Data |
|---------|-----|------|
| Player Name | `scrum-monsters-player-name` | String (player name) |
| Last Lobby | `scrum-monsters-last-lobby` | JSON with lobbyId, lobbyName, timestamp |

### Error Handling

All localStorage operations are wrapped in try-catch blocks:
```typescript
try {
  localStorage.setItem(key, value);
} catch (error) {
  console.warn('Failed to save:', error);
  // Graceful degradation - feature just doesn't persist
}
```

### Browser Compatibility

Uses standard Web APIs:
- ✅ `localStorage` - Supported in all modern browsers
- ✅ `navigator.clipboard.writeText()` - Supported in all modern browsers (requires HTTPS)
- ✅ No external dependencies

### Privacy & Storage

- **Stored locally only** - Never sent to server
- **Per-domain** - Separate storage for localhost vs production
- **User-controlled** - Cleared when browser data is cleared
- **Minimal data** - Only essential information stored
- **No sensitive data** - Lobby codes are not secret/private

## Files Modified

### New Files
1. `client/src/lib/utils/playerNameStorage.ts` - Player name persistence utility
2. `client/src/lib/utils/lastLobbyStorage.ts` - Last lobby tracking utility
3. `QOL_IMPROVEMENTS.md` - This documentation

### Modified Files
1. `client/src/components/game/LobbyCreation.tsx`
   - Lines 1-5: Added imports (useEffect, PlayerNameStorage)
   - Lines 22-26: Load saved name on mount
   - Lines 33: Save name on create

2. `client/src/components/game/LobbyJoin.tsx`
   - Lines 1-5: Added imports (useEffect, PlayerNameStorage)
   - Lines 18-22: Load saved name on mount
   - Lines 33: Save name on join

3. `client/src/components/game/RoomJoin.tsx`
   - Lines 7: Added PlayerNameStorage import
   - Lines 25-29: Load saved name on mount
   - Lines 47, 69: Save name on create/join

4. `client/src/components/game/Lobby.tsx`
   - Lines 563-575: Added copyLobbyCode function
   - Lines 680-691: Updated lobby code display with copy button

5. `client/src/App.tsx`
   - Line 30: Added LastLobbyStorage import
   - Line 43: Added lastLobby state
   - Lines 239, 246: Save last lobby on events
   - Lines 574-587: Added rejoin button to menu

## Testing

### Manual Test Cases

**Test 1: Player Name Persistence**
1. Open site in incognito/private window
2. Create lobby with name "TestUser1"
3. Close browser completely
4. Reopen site
5. ✅ Name should be pre-filled as "TestUser1"

**Test 2: Copy Lobby Code**
1. Create a lobby
2. Note the lobby code (e.g., "X7K2M9")
3. Click the 📋 button next to the code
4. ✅ Should see "Copied!" notification
5. Paste in a text editor
6. ✅ Should paste the exact lobby code

**Test 3: Quick Rejoin**
1. Create lobby "Test Meeting" with code "TEST01"
2. Click "Back to Menu"
3. ✅ Should see "🔄 Rejoin: Test Meeting" button
4. Click rejoin button
5. ✅ Should go to join screen with "TEST01" pre-filled
6. Wait 25 hours, return to menu
7. ✅ Rejoin button should NOT appear (expired)

### Browser Console Tests

```javascript
// Check player name storage
localStorage.getItem('scrum-monsters-player-name');

// Check last lobby storage
JSON.parse(localStorage.getItem('scrum-monsters-last-lobby'));

// Clear all QoL data
localStorage.removeItem('scrum-monsters-player-name');
localStorage.removeItem('scrum-monsters-last-lobby');
location.reload();
```

## Future Enhancements

Potential improvements to these features:

- [ ] **Multiple saved names** - Switch between different personas
- [ ] **Lobby history** - Show last 5 lobbies instead of just 1
- [ ] **Favorite lobbies** - Star lobbies for permanent quick access
- [ ] **Name suggestions** - Auto-complete from previous names
- [ ] **Copy with formatting** - Copy lobby code with URL template
- [ ] **Keyboard shortcuts** - Ctrl+C to copy lobby code from lobby screen
- [ ] **Rejoin notification** - Badge showing if last lobby is still active

## Related Features

These QoL improvements work well with existing features:

- **Recurring Rooms** (`RECURRING_ROOMS.md`) - Combine with Quick Rejoin for instant daily standup access
- **Audio Persistence** (`AUDIO_PERSISTENCE.md`) - Part of the same localStorage pattern
- **Reconnection System** - Complements the rejoin feature for network issues

## Metrics

Expected impact on user experience:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Time to rejoin daily lobby | ~30 seconds | ~5 seconds | 83% faster |
| Name entry steps | Every session | Once ever | 100% reduction (after first) |
| Lobby code sharing time | ~10 seconds | ~2 seconds | 80% faster |
| User clicks to rejoin | 4-5 clicks | 1 click | 75-80% reduction |

---

**Status**: ✅ Implemented and tested
**Backward Compatible**: Yes (all features are additive)
**Performance Impact**: Negligible (localStorage operations only)
**User Impact**: High (daily workflow improvement)
