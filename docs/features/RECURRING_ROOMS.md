# Recurring Meeting Rooms Feature

**Date**: 2026-01-17
**Feature**: Persistent, bookmarkable lobby URLs for recurring scrum sessions

## Overview

Teams can now create persistent meeting rooms with custom, memorable URLs that can be bookmarked and reused for daily standups, sprint planning, and other recurring scrum sessions. Unlike random lobby codes that change every time, recurring rooms use the same URL indefinitely.

## Usage

### Creating/Joining a Recurring Room

1. **Access a recurring room URL**:
   ```
   https://scrummonsters.com/room/daily-standup
   https://scrummonsters.com/room/sprint-planning
   https://scrummonsters.com/room/team-alpha-retro
   ```

2. **First time visitors** see a create/join interface:
   - **Create Room**: Set up a new persistent lobby with this room ID
   - **Join Existing**: Join if someone else already created the room today

3. **Bookmark the URL** for easy access in future meetings

### Recommended Room Naming

Good room names are:
- **Descriptive**: `daily-standup`, `sprint-planning`, `team-alpha`
- **Team-specific**: `frontend-team`, `backend-crew`, `qa-warriors`
- **Meeting-type**: `retrospective`, `refinement`, `demo`
- **Short and memorable**: 3-30 characters, alphanumeric + hyphens

Examples:
```
/room/daily-standup
/room/sprint-planning-team-a
/room/frontend-retro
/room/qa-estimation
```

## Implementation Details

### URL Structure

**Route**: `/room/:roomId`
- `:roomId` = Custom room identifier (3-30 characters, alphanumeric + hyphens)
- Example: `/room/daily-standup`

**Query Parameter**: `?room=<roomId>`
- Used internally after redirect
- Example: `/?room=daily-standup`

### Server-Side Changes

**File**: `server/routes.ts`
```typescript
// Lines 87-96: Recurring lobby route
app.get('/room/:roomId', (req, res) => {
  const { roomId } = req.params;
  // Validate roomId format (alphanumeric, hyphens, 3-30 chars)
  if (!/^[a-zA-Z0-9-]{3,30}$/.test(roomId)) {
    return res.redirect('/?error=invalid-room-id');
  }
  // Redirect to frontend with room parameter
  res.redirect(`/?room=${roomId.toLowerCase()}`);
});
```

**File**: `server/gameState.ts`
```typescript
// Lines 47-60: Updated generateLobbyId to support custom IDs
generateLobbyId(customId?: string): string {
  if (customId) {
    const normalized = customId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    // Check if lobby already exists
    if (this.lobbies.has(normalized.toUpperCase())) {
      return normalized.toUpperCase();
    }
    return normalized.toUpperCase();
  }
  // Otherwise, generate random 6-character ID
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Lines 422-433: Updated createLobby to accept customLobbyId
createLobby(hostName: string, lobbyName: string, initialSettings?: {
  timerSettings?: TimerSettings;
  jiraSettings?: JiraSettings;
  estimationSettings?: EstimationSettings;
  customLobbyId?: string;  // NEW
}): Lobby {
  const lobbyId = this.generateLobbyId(initialSettings?.customLobbyId);
  // ...
}
```

**File**: `shared/gameEvents.ts`
```typescript
// Lines 214-223: Updated event type definition
create_lobby: (data: {
  lobbyName: string;
  hostName: string;
  initialSettings?: {
    timerSettings?: TimerSettings;
    jiraSettings?: JiraSettings;
    estimationSettings?: EstimationSettings;
    customLobbyId?: string;  // NEW
  };
}) => void;
```

### Client-Side Changes

**File**: `client/src/App.tsx`
```typescript
// Lines 35-36: New state for room tracking
const [roomId, setRoomId] = useState<string>('');

// Lines 174-189: URL parameter handling for rooms
else if (roomParam) {
  setRoomId(roomParam);
  // Check for reconnection, otherwise show room join UI
  setAppState('room_join');
}

// Lines 656-658: Render RoomJoin component
case 'room_join':
  return (
    <RoomJoin roomId={roomId} onLobbyCreatedOrJoined={() => {}} />
  );
```

**File**: `client/src/components/game/RoomJoin.tsx` (New component)
- Dual-mode interface: Create or Join
- Room URL sharing with copy button
- Automatic favorite room tracking
- Integration with existing lobby creation system

**File**: `client/src/lib/utils/favoriteRoomsStorage.ts` (New utility)
- Saves up to 10 most recently accessed rooms
- Tracks access count and last access time
- Provides quick access to frequently used rooms

### Favorite Rooms Storage

```typescript
interface FavoriteRoom {
  roomId: string;        // e.g., "daily-standup"
  displayName: string;   // e.g., "Daily Standup"
  lastAccessed: number;  // Unix timestamp
  accessCount: number;   // Number of times accessed
}
```

**Storage Key**: `scrum-monsters-favorite-rooms`

**Methods**:
- `loadFavorites()` - Get all favorite rooms, sorted by last accessed
- `recordRoomAccess(roomId, displayName)` - Add or update room
- `removeRoom(roomId)` - Remove a specific room
- `getMostFrequent()` - Get the most frequently accessed room
- `clearAll()` - Clear all favorites

## User Experience

### Scenario 1: Daily Standup

**Monday**:
1. Scrum Master visits `/room/daily-standup`
2. Creates room "Team Alpha Daily Standup"
3. Shares URL with team
4. Team joins throughout the day

**Tuesday**:
1. Everyone uses the same bookmarked URL: `/room/daily-standup`
2. First person creates a new lobby with the same room ID
3. Others join the existing lobby
4. All settings from previous sessions are preserved (via LobbySettingsStorage)

### Scenario 2: Sprint Planning

```
Week 1: /room/sprint-planning → Create lobby "Sprint 23 Planning"
Week 2: /room/sprint-planning → Create lobby "Sprint 24 Planning"
Week 3: /room/sprint-planning → Create lobby "Sprint 25 Planning"
```

Same URL, different lobby each time (lobbies don't persist between meetings).

## Benefits

### For Teams
- **No more sharing codes**: Bookmark one URL and use it forever
- **Consistent meeting access**: Same URL for every daily standup
- **Easier onboarding**: New team members just bookmark the team's room
- **Professional appearance**: `scrummonsters.com/room/team-alpha` vs `?join=X7K2M9`

### For Scrum Masters
- **Simplified setup**: Create the room once, share the link once
- **Predictable workflow**: Always use the same URL
- **Settings persistence**: Timer, estimation scales, etc. carry over (via existing LobbySettingsStorage)

## Privacy & Security

### Room ID Validation
- **Length**: 3-30 characters
- **Characters**: Alphanumeric + hyphens only (a-z, A-Z, 0-9, -)
- **Normalization**: Converted to lowercase internally
- **Invalid IDs**: Redirect to home page with error

### Room Ownership
- **No authentication required**: Anyone can create/join
- **First-come, first-served**: First person to create sets the lobby name
- **No permanent ownership**: Rooms reset when lobby closes
- **No private rooms**: All rooms are accessible to anyone with the URL

### Data Storage
- **Favorite rooms**: Stored locally only (localStorage)
- **Not synced**: Favorites are per-device/browser
- **No server storage**: Room IDs are not stored on the server
- **Ephemeral lobbies**: Lobbies still close when host disconnects (15-minute grace period)

## Differences from Regular Lobbies

| Feature | Regular Lobby | Recurring Room |
|---------|---------------|----------------|
| **Lobby ID** | Random 6-char (e.g., `X7K2M9`) | Custom (e.g., `daily-standup`) |
| **URL** | `/join/X7K2M9` | `/room/daily-standup` |
| **Persistence** | One-time use | Reusable URL |
| **Bookmarkable** | Not practical | Yes, recommended |
| **Shareable** | Must share new code each time | Share URL once |
| **Use Case** | One-off sessions | Recurring meetings |

## Migration from Regular Lobbies

No migration needed! Recurring rooms are an additional feature:
- **Regular lobbies** still work exactly the same
- **Random codes** still generated for ad-hoc sessions
- **Join codes** still accepted in the "Join Battle" screen

Teams can use:
- **Recurring rooms** for daily standups, sprint planning, etc.
- **Regular lobbies** for one-off estimation sessions

## Troubleshooting

### Issue: "Room already exists" when creating

**Cause**: Someone else already created a lobby with this room ID today.

**Solution**:
1. Switch to "Join Existing" mode
2. Enter your name and join
3. OR wait for the existing lobby to close (15 minutes after host disconnect)

### Issue: Invalid room ID error

**Cause**: Room ID contains invalid characters or is too long/short.

**Solution**: Use only alphanumeric characters and hyphens, 3-30 characters total.

Examples:
- ✅ `daily-standup`
- ✅ `team-alpha-retro`
- ❌ `daily standup` (spaces not allowed)
- ❌ `team_alpha` (underscores not allowed)
- ❌ `ab` (too short)

### Issue: Lost favorites after browser clear

**Cause**: Favorite rooms are stored in localStorage and cleared when browser data is cleared.

**Solution**: Bookmark your team's recurring room URLs in your browser instead.

## Future Enhancements

Potential improvements for this feature:

- [ ] **Room directory**: Browse active public rooms
- [ ] **Room analytics**: Track usage statistics for recurring rooms
- [ ] **Scheduled rooms**: Auto-create rooms at specific times
- [ ] **Room invitations**: Email/calendar integration for recurring meetings
- [ ] **Private rooms**: Password-protected recurring rooms
- [ ] **Room templates**: Pre-configured settings for specific room types
- [ ] **Multi-team support**: Hierarchical room organization

## Related Documentation

- **Audio Persistence**: `AUDIO_PERSISTENCE.md` - Settings that persist across sessions
- **Lobby Settings**: `client/src/lib/utils/lobbySettingsStorage.ts` - Timer and estimation settings
- **Deployment Guide**: `REPLIT_DEPLOYMENT.md` - Production deployment information
- **Main Documentation**: `CLAUDE.MD` - Overall project documentation

## Code References

### Server
- `server/routes.ts:87-96` - Room route handler
- `server/gameState.ts:47-60` - Custom lobby ID support
- `server/gameState.ts:422-433` - Updated createLobby method
- `shared/gameEvents.ts:214-223` - Event type definitions

### Client
- `client/src/App.tsx:174-189` - URL routing for rooms
- `client/src/App.tsx:656-658` - RoomJoin component rendering
- `client/src/components/game/RoomJoin.tsx` - Room join/create UI
- `client/src/lib/utils/favoriteRoomsStorage.ts` - Favorite rooms persistence

---

**Status**: ✅ Implemented and ready for use
**Backward Compatible**: Yes (doesn't affect existing lobby functionality)
**Performance Impact**: Negligible (localStorage operations only)
