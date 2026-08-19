---
title: Player appears twice in roster when creating a new lobby right after a victory (same session)
discovered: 2026-06-24 (Phase 47–52 UAT, during fix verification)
severity: low (transient; self-heals on reload) — but matches user's "watch for duplication" concern
status: ROOT-CAUSED + FIXED (eventHandlers.ts session:player_joined now dedups players by id, mirroring the existing teams guard) + regression test added. Reproduced live in the host's own browser (saw self twice) after a refresh/reconnect.
area: client lobby state / session reconnect on lobby transition
reporter: UAT (automated P1 "Preston")
---

# Transient duplicate player on new lobby after victory

## Symptom

After finishing a battle (VICTORY) and navigating `/game/OLD` → `/play` → **Create Battle
Lobby** in the SAME browser session, the freshly created lobby briefly showed the host
**twice** in the Battle Teams roster: "Developers … 2 players ⚔️Preston* ⚔️Preston".
React logged a duplicate-key warning (same player id `…db7d` rendered twice) from the team
roster (GamePanel → RetroCard). A **hard reload self-healed** it back to "1 player ⚔️Preston"
with 0 errors.

## Notes

- Transient and client-side — clears on reconnect, so likely a stale client player-list
  merge during the old-lobby→new-lobby transition (old player entry not cleared before the
  new create populates the list), rather than persistent server-side duplication.
- NOT caused by the Phase-52 work or the remote-avatar fix (the duplicate is in the roster
  component, a different render path).
- Reproduced reliably TWICE via same-session lobby-hop (victory → /play → create new lobby,
  and lobby → /play → create new lobby) — each time the host appeared twice with a React
  duplicate-key warning until a reload. So it's not a one-off; any "leave lobby → create/join
  another" path in the same session is suspect. A real user hits it whenever they start a
  fresh game without refreshing.
- Relevant to the user's standing note to watch for name/player duplication.

## Suggested investigation

- On `create_lobby` / entering a new lobby, ensure the client clears the previous lobby's
  player list (reset `currentLobby` rather than merge) so a stale entry can't linger.
- Check the duplicate-key render path (team roster `.map` keyed by player.id) — add a dedupe
  by id as a defensive guard, and verify server `create_lobby` doesn't return the player
  twice on a lingering socket.
