---
type: hotfix
priority: P0
issue: ScrumQuest-wlw
category: security
severity: critical
files_modified:
  - server/websocket.ts
  - client/src/components/game/Discussion.tsx
autonomous: true
tags: [security, websocket, authorization]

must_haves:
  truths:
    - "advancePhaseNow handler uses socket.data.playerId for authentication"
    - "advancePhaseNow handler uses socket.data.lobbyId for lobby context"
    - "Client cannot send arbitrary lobbyId/playerId values"
    - "Host authorization check validates against session playerId"
  artifacts:
    - path: "server/websocket.ts"
      provides: "Secure advancePhaseNow handler"
      contains: "socket.data.playerId"
      contains: "socket.data.lobbyId"
    - path: "client/src/components/game/Discussion.tsx"
      provides: "Client emit without lobbyId/playerId params"
      contains: "emit('advancePhaseNow')"
---

<objective>
Fix critical security vulnerability in advancePhaseNow socket handler that accepts client-controlled lobbyId and playerId parameters, enabling privilege escalation and cross-lobby attacks.

Purpose: Prevent malicious clients from advancing phases in other lobbies or impersonating the host.
Output: Secure handler that uses trusted session data (socket.data) for all authorization checks.
</objective>

<vulnerability_analysis>
## Current Implementation (VULNERABLE)

```typescript
socket.on('advancePhaseNow', ({ lobbyId, playerId }) => {
  const lobby = gameState.getLobby(lobbyId);  // ❌ Client-controlled
  if (lobby.hostId !== playerId) { ... }      // ❌ Client can fake this
});
```

## Attack Vector

A malicious client can send:
```javascript
socket.emit('advancePhaseNow', {
  lobbyId: 'victim-lobby-123',    // ❌ Any lobby ID
  playerId: 'victim-host-id'      // ❌ Impersonate host
});
```

The server trusts these values and performs authorization checks against them, allowing the attacker to:
1. Advance phases in any lobby
2. Bypass host-only restrictions
3. Disrupt other players' games

## Severity Assessment

- **Exploitability**: CRITICAL - Trivial to exploit (modify client emit)
- **Impact**: HIGH - Can disrupt any active game
- **Scope**: ALL - Any authenticated user can attack any lobby
- **Detection**: LOW - No server-side logging of exploitation attempts

## Root Cause

Handler pattern inconsistency: Modern handlers use `socket.data.*` (session-validated), but this legacy handler accepts client params directly.
</vulnerability_analysis>

<context>
Related files:
@server/websocket.ts (line 1031-1061)
@client/src/components/game/Discussion.tsx (line 131-134)
@~/.copilot/session-state/.../socket-audit.md

Pattern references:
- Modern handlers (cast_vote, attack_boss, heal_teammate) use socket.data for auth
- Legacy handlers (this one) accept client params directly

Discovery: Found during comprehensive socket handler audit (2026-02-05)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update server handler to use socket.data</name>
  <files>server/websocket.ts</files>
  <action>
    Replace client-controlled parameters with session data:

    **BEFORE (line 1031):**
    ```typescript
    socket.on('advancePhaseNow', ({ lobbyId, playerId }) => {
      try {
        const lobby = gameState.getLobby(lobbyId);
        if (!lobby || lobby.hostId !== playerId) {
          socket.emit('game_error', { message: 'Only the host can manually advance phases' });
          return;
        }
    ```

    **AFTER:**
    ```typescript
    socket.on('advancePhaseNow', () => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;
        
        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not authenticated or not in a lobby' });
          return;
        }

        const lobby = gameState.getLobby(lobbyId);
        if (!lobby || lobby.hostId !== playerId) {
          socket.emit('game_error', { message: 'Only the host can manually advance phases' });
          return;
        }
    ```

    Changes:
    1. Remove parameters from handler signature
    2. Get playerId from socket.data.playerId (session-validated)
    3. Get lobbyId from socket.data.lobbyId (set during join)
    4. Add null checks for both values
    5. Rest of logic remains unchanged
  </action>
  <verify>TypeScript compiles, handler uses session data</verify>
  <done>Server handler secured with session authentication</done>
</task>

<task type="auto">
  <name>Task 2: Update client to not send lobbyId/playerId</name>
  <files>client/src/components/game/Discussion.tsx</files>
  <action>
    Remove parameters from client emit call:

    **BEFORE (line 131):**
    ```typescript
    onClick={() => socket?.emit('advancePhaseNow', {
      lobbyId: currentLobby.id,
      playerId: currentPlayer.id
    })}
    ```

    **AFTER:**
    ```typescript
    onClick={() => socket?.emit('advancePhaseNow')}
    ```

    The server now uses socket.data for these values, so client doesn't need to send them.
  </action>
  <verify>Client compiles, button still triggers handler</verify>
  <done>Client updated to match secure handler signature</done>
</task>

<task type="verification">
  <name>Task 3: Manual security verification</name>
  <what-to-verify>
    Security fix prevents exploitation:
    1. Normal operation still works (host can advance phase)
    2. Non-host cannot advance phase
    3. Modified client cannot attack other lobbies
  </what-to-verify>
  <how-to-verify>
    **Test 1: Normal Operation (Should Work)**
    1. Create lobby as host
    2. Start game and reach discussion phase with consensus
    3. Click "Advance Now (Host)" button
    4. Verify: Phase advances successfully

    **Test 2: Non-Host Cannot Advance (Should Fail)**
    1. Create lobby with 2 players
    2. As non-host player, try to advance phase
    3. Verify: Error message "Only the host can manually advance phases"

    **Test 3: Cross-Lobby Attack Prevention (Developer Test)**
    1. Open browser console
    2. Try to emit: `socket.emit('advancePhaseNow', { lobbyId: 'other-lobby', playerId: 'other-host' })`
    3. Verify: Handler ignores the parameters and uses session data
    4. Verify: Action only affects current player's lobby (if host) or fails (if not host)
  </how-to-verify>
  <resume-signal>Type "verified" if all tests pass</resume-signal>
</task>

</tasks>

<verification>
1. `npm run check` - TypeScript passes
2. `npm run build` - Production build succeeds
3. Manual testing per Task 3
4. Code review: Verify no other handlers have same pattern
</verification>

<success_criteria>
- Handler signature: `socket.on('advancePhaseNow', () => {})`
- Uses: `socket.data.playerId` and `socket.data.lobbyId` exclusively
- Client emits: `socket.emit('advancePhaseNow')` with no parameters
- Authorization check validates session playerId matches lobby.hostId
- Normal host functionality unchanged
- Cross-lobby attacks prevented
</success_criteria>

<output>
After completion, create `.planning/hotfixes/HOTFIX-001-SUMMARY.md`
</output>
