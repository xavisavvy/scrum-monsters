---
title: Uncaught CombatNotActiveError from a socket handler crashes the ENTIRE server
discovered: 2026-06-24 (Phase 47-52 UAT, live during Test 12 setup)
severity: CRITICAL (client-triggerable full server crash — DoS-class; drops every player in every lobby)
status: FIXED (server/websocket.ts on() wrapper now catches handler throws) — needs server restart + manual re-verify
area: server / websocket event dispatch + combat lifecycle
reporter: Penelope (host) during live UAT
---

# Bug: a client `attack_boss` during the voting window crashes the whole server

## Symptom (live)

Host started a battle, was "in combat", then everyone dropped to "connecting to
server". Server log showed:

```
FATAL: Uncaught Exception
CombatNotActiveError: No active combat for lobby 'L2O8A3'
    at CombatManager.applyBasicDamageToBoss (server/domains/CombatManager.ts:540:13)
    at GameStateManager.attackBoss (server/gameState.ts:1590:58)
    at <anonymous> (server/websocket.ts:1036:32)   // on('attack_boss')
```

The process then hit `process.on('uncaughtException')` (server/index.ts:15) which
calls `process.exit(1)` — so the **entire server process died**, disconnecting every
player in every lobby, not just the one that sent the bad event.

## Root cause

Two layers:

1. **No crash guard at the socket dispatch boundary.** The central `on()` wrapper
   (server/websocket.ts ~L332) validated + rate-limited each event, then called
   `handler(result.data)` with **no try/catch**. Any throw inside any handler became
   an uncaught exception → `process.exit(1)`.

2. **`attack_boss` can arrive when combat isn't active.** After `start_battle`, the
   lobby enters the voting/estimation window before combat is "active". The client
   still lets a player attack (Ctrl/click → `emit('attack_boss')`). On the server,
   `attackBoss → applyBasicDamageToBoss` throws `CombatNotActiveError` (a legitimate
   domain guard) — but nothing caught it.

So a normal, easily-triggered player action (attacking a moment too early) took down
the whole server. Any thrown CombatError from any handler had the same effect.

## Fix applied

`server/websocket.ts` — wrap the `handler(...)` call in the `on()` wrapper in
try/catch:

- `CombatError` (and subclasses: CombatNotActiveError, PlayerNotInCombatError,
  RevivalNotAllowedError, NotHealerClassError, …) → expected domain rejection; log at
  `debug` and continue. (No client spam: these are transient/expected, e.g. attacking
  during the voting window.)
- Any other error → real bug; log at `error` with the event + stack, emit a generic
  `game_error` to that one client, and **keep the process alive**.

This is a universal backstop: no single socket handler can crash the server anymore.
The `process.on('uncaughtException') → exit(1)` policy in index.ts is correct and
unchanged — the fix is to never let an expected domain throw reach it.

Verified: `npm run check` (tsc) = 0, eslint = 0. NOTE: server change → the running
dev server (tsx, no hot-reload) must be **restarted** to pick it up.

## Follow-ups (optional, lower priority)

- Client: consider disabling/ignoring attack input during the voting window so
  `attack_boss` isn't emitted before combat is active (removes the noise at source).
- Audit other direct `gameState.*` calls in websocket.ts that can throw CombatError
  to confirm the boundary catch is the single intended safety net (it now is).
- Consider a regression test that drives the `on()` wrapper with a throwing handler
  and asserts the process-level handler is never reached.
