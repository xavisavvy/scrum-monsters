---
title: Remote players invisible in lobby tavern until they move
discovered: 2026-06-24 (during Phase 47–52 UAT, Test 6)
severity: medium (cosmetic/UX — no data loss, but players appear "missing")
status: root-caused, fix proposed (not yet applied)
area: client / Lobby tavern rendering
reporter: UAT walkthrough (Preston + automated P2 "Mira")
---

# Bug: Remote avatars don't render in the lobby until the remote player moves

## Symptom (user-reported + reproduced)

When a second player connects to a lobby and selects/has a character, the **other**
players in the lobby do **not** see that player's avatar in the tavern scene. The new
player only becomes visible to everyone else **after they move for the first time**.
The new player IS listed correctly in the Battle Teams roster immediately on join — it
is purely the rendered tavern sprite that is missing.

Expected: a connected player with a selected character should be visible in the tavern
immediately (rendered at their spawn position), without having to move first.

## Reproduction (exact steps used)

1. P1 ("Preston", host) creates lobby `HRHNYV`, picks Warrior, lands in tavern.
2. P2 ("Mira") joins via Join Battle in an isolated browser context (separate session).
   - Note: P2 was auto-assigned Warrior and dropped straight into the lobby (see
     "Secondary observation" below).
3. **Before P2 moves:** inspect P1's DOM for elements whose own text === "Mira".
4. P2 holds ArrowLeft ~1s (first movement).
5. **After P2 moves:** re-inspect P1's DOM.

## Evidence (DOM measurements from P1's view)

Each player normally has TWO "name" elements in P1's DOM: a roster `<span>` (in the
Battle Teams panel, ~y=396) and a tavern-avatar `<div>` label (~y=987, bottom of scene).

**Before P2 moves:**
| Player | Roster span (y≈396) | Tavern avatar div (y≈987) |
|--------|---------------------|----------------------------|
| Preston (local) | ✅ present (x=108) | ✅ present (x=392, ancestor title "Tap to jump!") |
| Mira (remote)   | ✅ present (x=269) | ❌ **MISSING** |

**After P2 moves once (held ArrowLeft ~1s):**
| Player | Roster span | Tavern avatar div |
|--------|-------------|-------------------|
| Mira (remote) | ✅ present (x=269) | ✅ **now present** (x=12, y=987, no "Tap to jump!" title → remote-avatar wrapper) |

So the tavern sprite for a remote player appears only after the first movement
broadcast. Screenshot after move: `uat-test6-both-avatars-after-move.png`.

## Root cause

`client/src/components/game/Lobby.tsx`, "Other Players" render block (~L1543–1548):

```jsx
{currentLobby.players
  .filter(player => player.id !== currentPlayer?.id)
  .map(player => {
    const position = playerPositions[player.id];
    if (!position) return null;   // <-- hides any remote player with no position entry
    ...
    return <LobbyAvatar position={{ x: position.x, direction: position.direction }} ... />
```

- `playerPositions` (state, declared L121) is keyed by player id and is **only populated
  by incoming position-broadcast events** (i.e., when a remote player moves/jumps).
- A player who has just joined / selected an avatar exists in `currentLobby.players`
  (hence the roster entry) but has **no `playerPositions[player.id]` entry yet**.
- Therefore `if (!position) return null` short-circuits and the remote avatar is not
  rendered until that player's first movement populates `playerPositions`.

This is independent of Phase 52's refactor — the `LobbyAvatar` extraction preserved the
exact guard; the gating predates it. (Confirmed: the local player renders via a separate
code path that always has `myPosition`, which is why the local avatar is always visible.)

## Proposed fix

Render remote avatars at a default spawn position when no broadcast position exists yet,
instead of returning null. Minimal change at L1547–1548:

```jsx
const DEFAULT_SPAWN = { x: 200, direction: 'right' as SpriteDirection, isMoving: false };
const position = playerPositions[player.id] ?? DEFAULT_SPAWN;
// remove the `if (!position) return null;` early-out
```

Rationale for x=200: matches the local avatar's initial `left:200px` and the existing
`?? 200` fallbacks already used for dragon/victim positioning (Lobby.tsx L624, L874).

Alternatives considered:
- **Seed `playerPositions` on join/avatar-select** (in the `session:player_joined` /
  `session:avatar_selected` handlers) so every player has a position entry immediately.
  More invasive but makes the position map authoritative; would also fix any other
  consumer that reads `playerPositions[id]`.
- **Server emits an initial position** on join. Cleanest semantically but a wire change.

Recommended: the client-side default-spawn fallback (smallest, behavior-safe). Consider
spreading players out (e.g., spawn x by player index) so two un-moved players don't stack.

## Regression test to add

In a Lobby render test: mount with two players where the non-local player has NO
`playerPositions` entry; assert a `LobbyAvatar` is still rendered for them (at the default
spawn x). Currently such a test would assert `null` — flip it.

## Secondary observation (separate, needs its own investigation)

P2 ("Mira") joining via **Join Battle skipped the avatar-selection screen** and was
auto-assigned Warrior (both players showed the ⚔️ icon). Per CLAUDE.md, avatar selection
is gated per-player by `hasSelectedAvatar`; a brand-new joiner should normally see the
selection screen. Either (a) joiners are intentionally given a default avatar, or (b)
`hasSelectedAvatar` is being set true on join. Worth confirming — it is NOT the cause of
the visibility bug above (that bug is purely the `playerPositions` gating), but it blocked
choosing a Cleric for the healer-revival UAT (Test 12). Filed here as a lead, not yet
diagnosed.

## Names / duplication check (per user note)

Confirmed P1="Preston", P2="Mira" — distinct, no duplication in roster or scene. No
collision observed. (User flagged duplicate-name risk to watch for; none seen this run.)
