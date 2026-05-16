---
slug: webgl-context-lost
status: resolved
trigger: WebGLRenderer Context Lost in prod console with no app-level recovery handlers
created: 2026-05-16
updated: 2026-05-16
---

# Debug: webgl-context-lost

## Symptoms

<DATA_START>
- **Browser console output (production, scrummonsters.com):**
  ```
  THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
  THREE.WebGLRenderer: Context Lost.
  ```
- **Context:** The `THREE.Clock` line is a separate, cosmetic deprecation
  noise (three@0.184 deprecated Clock; @react-three/fiber@8.18 still uses
  it internally). Already suppressed via a console.warn filter in
  `client/src/main.tsx`. Not in scope here.
- **Real bug:** `THREE.WebGLRenderer: Context Lost.` is the GPU
  signalling it dropped the WebGL context (tab backgrounded, GPU
  memory pressure, driver hiccup, multi-tab tab limit, or extension
  interference). Three.js logs the loss but doesn't auto-recover.
- **Codebase has ZERO handlers for `webglcontextlost` or
  `webglcontextrestored`** — confirmed via grep:
  ```
  grep -rnE "contextlost|contextrestored|loseContext" client/  # no hits
  ```
  Without `event.preventDefault()` on `webglcontextlost`, the browser
  will NOT restore the context automatically — even if the GPU
  recovers. So the canvas stays black/frozen until the user reloads.
- **User-visible impact:** The 3D scene (PlayerCharacter, BossDisplay,
  3D avatar canvas) freezes silently. Players might not realize
  anything is wrong until they try to move and nothing renders.
- **Stack info:**
  - `three@^0.184.0`
  - `@react-three/fiber@^8.18.0`
  - `@react-three/drei@^9.122.0`
  - `@react-three/postprocessing@^2.19.1`
  - React 18.3.1 (not yet 19; would be required for R3F v9 upgrade)
- **Where Canvas is mounted:** game phases (BattleScreen, AvatarSelection,
  Lobby — wherever 3D PlayerCharacter renders). Search for `<Canvas>`
  from `@react-three/fiber` to enumerate mount points.
- **Repro:** Hard to repro reliably. Most common triggers in the wild:
  - Long-backgrounded tab + Chrome's GPU memory pressure
  - Multiple WebGL tabs open (Chrome enforces a per-process context cap)
  - GPU driver crash + recovery (TDR on Windows)
  - Browser extension that injects into WebGL (uBlock Origin's
    third-party-frame blocker has been known to trip it)
- **Timeline:** Surfaced today in user's prod browser console
  (2026-05-16). Likely present since the 3D Canvas was first mounted.
</DATA_END>

## Suspect components / files

- `<Canvas>` mount point(s) — search via:
  `grep -rnE "from ['\"]@react-three/fiber['\"]" --include="*.tsx" client/`
- Specific suspects (3D-using components):
  - `client/src/components/game/PlayerCharacter.tsx`
  - `client/src/components/game/BossDisplay.tsx`
  - `client/src/components/game/BattleScreen.tsx`
  - `client/src/components/game/AvatarSelection.tsx` (3D avatar preview)
- React-three-fiber Canvas `onCreated` prop is the right hook for adding
  GL event listeners. Pattern:
  ```tsx
  <Canvas onCreated={({ gl }) => {
    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();  // ← critical: tells the browser we want recovery
      // optionally show a toast, log to metrics
    });
    canvas.addEventListener('webglcontextrestored', () => {
      // R3F will re-upload its own resources on restore;
      // app-managed GPU resources (e.g. cached textures we hold refs to)
      // need to be re-uploaded manually here
    });
  }}>
  ```

## Investigation prompts for the debugger

1. **Locate every `<Canvas>` mount** in client/src — there's likely
   more than one (PlayerCharacter, BossDisplay each render their own
   Canvas in the current architecture). Each needs context-loss handling
   OR a shared util that hooks into the renderer at creation time.

2. **Decide on the recovery UX**:
   a. Silent recovery (preventDefault + let R3F re-create resources;
      user may see a brief black flash)
   b. Toast notification ("Graphics lost — recovering…") + Sentry/metric
   c. Force a soft reload of the 3D component (unmount/remount Canvas)
   Pick (a) for first cut; it's the lowest-effort path to functional
   recovery.

3. **Surface the loss to ops** — add a Prometheus counter
   `scrumquest_webgl_context_loss_total` (server-emitted via socket
   so we can attribute to environment / lobby) OR a client-side
   structured log to `/api/log` (whichever exists). If neither exists,
   defer telemetry to a follow-up.

4. **Test recovery** — Chrome DevTools → Rendering → "Lose WebGL
   context" forces a context loss. Verify the scene comes back without
   reload after our handler lands.

## Current Focus

- hypothesis: Three's `WebGLRenderer: Context Lost.` log is reached
  but the browser receives no `preventDefault()` on the
  `webglcontextlost` event, so the context is never restored. Adding
  `e.preventDefault()` in a Canvas `onCreated` handler should let R3F's
  internal restore logic re-upload buffers/textures and bring the scene
  back automatically.
- next_action: enumerate all `<Canvas>` mount points and decide
  whether to add the handler per-mount, in a wrapper component, or via
  a custom Canvas. Apply the fix, smoke-test via DevTools "Lose WebGL
  context".

## Evidence

(populated by investigator)

## Eliminated

(populated by investigator)

## Resolution

- **Root cause:** All R3F `<Canvas>` mounts (currently a single one in
  `client/src/components/game/Lobby.tsx` for the tavern particle/lighting
  layer) were created without a `webglcontextlost` handler. Per WebGL
  spec, the browser only restores a lost GL context if the page calls
  `event.preventDefault()` inside the `webglcontextlost` listener. With
  no such handler, the context stayed lost forever and the canvas froze
  silently until full page reload.

- **Fix applied:**
  1. Added `client/src/lib/utils/webglResilience.ts` — exports
     `attachWebglResilience(state)`, an R3F `onCreated` handler that
     idempotently attaches `webglcontextlost` (calls
     `preventDefault()`) and `webglcontextrestored` (logs)
     listeners on the canvas DOM element.
  2. Wired it into the `<Canvas>` in `Lobby.tsx` via
     `onCreated={attachWebglResilience}`.
  3. `npm run check` (tsc) passes clean.

- **Why a shared helper for one mount:** keeps the resilience contract
  declarative and makes every future `<Canvas>` a one-prop change to
  inherit recovery. Grep verified `Lobby.tsx` is the only live mount;
  `*.bak` files are pre-existing local backups (not in the build).

- **Specialist review:** none — no Three.js/R3F specialist is registered
  in the skill set. The fix follows the canonical Khronos
  "Handling Context Lost" pattern and the documented R3F `onCreated`
  hook contract; both R3F 8.x and three 0.184 re-upload GPU resources
  they own on the `webglcontextrestored` event.

- **Manual verification the user should run before shipping:**
  1. `npm run dev` and open http://localhost:5000 to the Lobby phase.
  2. Open Chrome DevTools → `Cmd/Ctrl+Shift+P` → run "Show Rendering".
  3. In the Rendering tab, find the "Lose WebGL context" / "Restore
     WebGL context" controls (or the `WEBGL_lose_context` extension
     via the console: `renderer.getContext().getExtension('WEBGL_lose_context').loseContext()`).
  4. Confirm console shows `[webgl] context lost — recovery requested`
     immediately, then trigger restore. Confirm `[webgl] context
     restored` appears and the tavern lighting/particles resume
     rendering without a page reload.
  5. Repeat in a packaged production build (`npm run build && npm run
     start`) to make sure the listener survives the Vite/Terser pass.

- **Follow-ups (not done, defer to a separate phase if desired):**
  - Telemetry: client-side structured log or Prometheus counter
    `scrumquest_webgl_context_loss_total` so prod recovery rate is
    measurable. The session file's investigation prompt #3 outlines the
    options; deferred per the "low-effort first cut" decision.
  - UX: optional toast ("Graphics paused, recovering…") if the
    silent recovery turns out to leave a visible black flash on slower
    GPUs. Add inside the `onLost`/`onRestored` callbacks of
    `attachWebglResilience` without touching call sites.
