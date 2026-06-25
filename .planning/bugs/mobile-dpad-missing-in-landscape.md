---
title: Mobile D-pad shows in portrait but disappears in landscape
discovered: 2026-06-24 (Phase 47–52 UAT)
severity: high (controls unusable — phone-in-landscape players can't move)
status: FIXED (branch fix/uat-v6-bugs) — combined media query (narrow width OR coarse-pointer+short-height) in use-is-mobile.tsx; needs manual on-device landscape spot-check
area: client / mobile detection (useIsMobile) gating MobileControls
reporter: Preston
---

# Bug: virtual D-pad missing when a phone is in landscape

## Symptom (user)

On mobile-sized screens the D-pad (virtual controls) shows up in **portrait** but **not in
landscape**.

## Root cause

`client/src/hooks/use-is-mobile.tsx` decides mobile purely by viewport WIDTH:

```js
const MOBILE_BREAKPOINT = 768
// ...
setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
```

`MobileControls` (the D-pad) is rendered only when `isMobile` is true
(`PlayerController.tsx` ~L1149: `{isMobile && <MobileControls .../>}`; also used in
`Lobby.tsx:110`). On a phone:

- **Portrait:** `innerWidth` ≈ 390–430px → `< 768` → `isMobile = true` → D-pad shows. ✔
- **Landscape:** `innerWidth` becomes the long edge ≈ 740–932px (e.g. iPhone 14 = 844px) →
  `>= 768` → `isMobile = false` → device treated as desktop → **D-pad hidden.** �’

So rotating a phone to landscape pushes `innerWidth` past the 768 breakpoint and the app
misclassifies the phone as a desktop, dropping the touch controls — exactly when a player
most wants them.

## Proposed fix

Detect mobile by something orientation-stable, not raw width. Options (recommend combining):

1. **Smaller dimension or short height:** treat as mobile if the *min* viewport dimension is
   small, or height is short (landscape phones are short):
   ```js
   const isSmall = window.innerWidth < 768 || window.innerHeight < 500;
   ```
   This aligns with the existing CSS rule `@media (orientation: landscape) and
   (max-height: 500px)` in `client/src/styles/mobile.css:137`.

2. **Coarse-pointer (touch) capability**, orientation-independent:
   ```js
   const isTouch = window.matchMedia('(pointer: coarse)').matches;
   ```

3. **Combined (most robust):** mobile if
   `(max-width: 767px)` OR `((pointer: coarse) AND (max-height: 600px))`.
   Update the `matchMedia` query AND the `onChange`/initial `setIsMobile` to use the same
   combined predicate (currently the listener is on a width-only mql, so it also won't fire
   on orientation change without a height/orientation term).

Also add an `orientationchange` / height term so the hook re-evaluates on rotation (there is
already a `useOrientation` hook at `client/src/hooks/useOrientation.ts` using
`matchMedia('(orientation: portrait)')` that could be composed in).

## Acceptance

- A phone in landscape still shows the D-pad / MobileControls.
- Rotating between portrait and landscape keeps the controls visible (hook re-evaluates).
- Desktop (no coarse pointer, large viewport) still does NOT show the D-pad.

## Related files

- `client/src/hooks/use-is-mobile.tsx` (the width-only detection — fix here)
- `client/src/hooks/useOrientation.ts` (existing orientation hook to compose)
- `client/src/components/game/MobileControls.tsx` (the D-pad)
- `client/src/components/game/PlayerController.tsx` ~L1149, `Lobby.tsx:110` (render gates)
- `client/src/styles/mobile.css:137` (existing landscape/short-height CSS precedent)
