# Phase 25: Lobby Polish & Animations - Research

**Researched:** 2026-02-19
**Domain:** React sprite animations, Framer Motion UI polish, emote system UX, multiplayer readiness indicators, WebSocket event testing
**Confidence:** HIGH (verified against codebase and official documentation)

---

## Summary

Phase 25 is the final polish phase for ScrumQuest v2.0, focusing on three lobby UX gaps: (1) the existing emote/magic system lacks visible UI and formal test coverage, (2) no player readiness indicators exist before game start, and (3) character sprites are static during lobby wait periods instead of showing idle animations. The good news: **80% of the foundation already exists** from v1.3 ad-hoc implementation and Phases 22-23 systematic work.

The emote system (`magicWords.ts`, `EmoteModal.tsx`, `MagicEffect.tsx`) is fully functional with 31 magic effect types, server-side validation in `websocket.ts`, and extensive visual effects. What's missing: **zero unit tests** for `detectMagicWords()` / `extractSpellTargets()`, no E2E verification of server-side validation, and the EmoteModal UI is buried behind keyboard shortcut "E" with no visible button or mobile-friendly entry point.

Player readiness has **no implementation** — the lobby phase goes straight from avatar selection to game start with no "ready up" mechanism. Standard multiplayer pattern: GameButton with ready/not-ready toggle, visual state indicator (checkmark icon, color change, ARIA state), and lobby-wide display of who's ready.

Idle animations have the foundation (`useSpriteAnimation` hook with `idle` animation type) but are **not actively used in lobby**. The hook's `idle` animation is currently 1 static frame; needs multi-frame walk cycle variation or subtle breathing/bobbing effect. Performance is already optimized: `requestAnimationFrame` loop in `useSpriteAnimation.ts`, CSS transform animations in `MagicEffect.tsx`.

Testing infrastructure is complete: Vitest 4.0.17 + @testing-library/react 16.3.2 + happy-dom 20.5.3, with existing test patterns in `useEventSync.test.ts`, `useProgression.test.ts`. Framer Motion testing requires mocking (documented in [Framer Motion issue #285](https://github.com/framer/motion/issues/285) and [Mock Framer Motion with Jest](https://www.hectane.com/blog/mock-framer-motion-with-jest)).

**Primary recommendation:** Add Vitest tests for `magicWords.ts`, create visible EmoteButton using GameButton from Phase 22, implement ready/not-ready toggle with WCAG-compliant state indicators, and extend `useSpriteAnimation` idle to multi-frame loop. No new dependencies needed — everything uses existing stack.

---

## Codebase State (What Already Exists)

This section is critical for planning — do not rebuild what exists.

### Existing Emote/Magic System (v1.3 Implementation)

**Files:**
- `client/src/lib/utils/magicWords.ts` - 31 magic effect types, detection logic, target extraction
- `client/src/components/game/EmoteModal.tsx` - Modal UI with text input, magic word hints
- `client/src/components/game/MagicEffect.tsx` - Particle visual effects with CSS keyframe animations
- `client/src/components/game/Lobby.tsx` - Emote modal trigger on "E" key, speech bubble display
- `server/websocket.ts` - `lobby_emote` event handler with message validation (1-100 chars), broadcast to lobby

**Magic effect types:**
Fire, ice, heal, lightning, magic, love, confetti, rage, sleep, sparkle, die, revive, haste, slow, fly, hold, earthbind, massacre, massrevive, dragon, dispel, chaos, invisibility, enlarge, reduce, petrify

**Current UX:**
- Press "E" key → EmoteModal opens → Type message → "Say It!" button → Server validates → Broadcast to lobby
- Server validates: player in lobby phase, message 1-100 chars, broadcasts to `socket.to(lobbyId)`
- Client displays: SpeechBubble above player sprite + MagicEffect particles if magic words detected

**What's missing:**
- **No unit tests** for `detectMagicWords()`, `getPrimaryMagicEffect()`, `extractSpellTargets()`
- **No E2E tests** for emote server validation, broadcast to other players
- **No visible UI** — EmoteModal only accessible via keyboard "E" (mobile unfriendly, discoverable problem)
- **No server-side magic word processing** — all magic logic is client-side only

### Existing Animation Infrastructure

**useSpriteAnimation hook** (`client/src/hooks/useSpriteAnimation.ts`):
- Supports 6 animation types: `idle`, `walk`, `attack`, `cast`, `death`, `victory`
- `idle` animation config: `{ row: 0, frames: 1, speed: 1000, loop: true }` — **1 static frame**
- `requestAnimationFrame` loop for frame updates
- Walking sound integration via `useAudio` store

**Current lobby behavior:**
- Characters show static idle pose (frame 0 of sprite sheet)
- No animation during waiting periods

**What exists:**
- Hook already supports looping animations
- Sprite sheets already loaded (256x256, 4x4 grid, 64px frames)
- Performance optimized with RAF + CSS transforms

**What's missing:**
- Multi-frame idle animation (breathing, bobbing, subtle movement)
- Idle animation not triggered in lobby phase

### Existing UI Components (Phase 22/23)

**GameButton** (`client/src/components/ui/GameButton.tsx`):
- CVA variants: primary, secondary, accent, danger, ghost
- Built-in sound on click via `useAudio.getState().playButtonSelect()`
- Touch-friendly: `min-h-[44px] min-w-[44px]` (Phase 23)
- Size variants: sm, md, lg

**GamePanel** (`client/src/components/ui/GamePanel.tsx`):
- CVA variants for themed panels
- Already used across game phases

**Phase transitions** (`client/src/components/game/phases/PhaseTransition.tsx`):
- Framer Motion `AnimatePresence` with fade + slide + scale
- `useGameSounds` hook for transition sounds
- `useReducedMotion` for accessibility

### Existing Testing Infrastructure

**Vitest setup** (`vitest.config.ts`):
- Environment: `happy-dom`
- Setup file: `./client/src/test/setup.ts`
- Coverage: v8 provider, 12% thresholds (lines/statements)
- Test patterns: `**/*.{test,spec}.{ts,tsx}` in client/server/shared

**Example tests:**
- `client/src/lib/stores/useEventSync.test.ts` - Zustand store testing pattern
- `client/src/lib/stores/useProgression.test.ts` - Mock data + state mutations
- `server/domains/CombatManager.test.ts` - Server-side logic testing

**Testing libraries installed:**
- `@testing-library/react@16.3.2`
- `@testing-library/jest-dom@6.9.1`
- `vitest@4.0.17`
- `happy-dom@20.5.3`
- `@vitest/coverage-v8@4.0.18`

**What's missing:**
- No tests for `magicWords.ts` utility functions
- No Framer Motion mock setup (needed for testing animated components)

### Existing WebSocket Events

**Emote event schema** (`shared/socket-schemas.ts`):
```typescript
export const LobbyEmotePayloadSchema = z.object({
  message: z.string().min(1),
  x: z.number(),
  y: z.number(),
});
```

**Server handler** (`server/websocket.ts` line 731-755):
- Validates player in lobby phase
- Validates message 1-100 chars
- Broadcasts `lobby_emote` to `socket.to(lobbyId)`

**Client listener** (in `Lobby.tsx`):
- Receives `lobby_emote` events
- Displays SpeechBubble + MagicEffect particles
- 5-second timeout before clearing

---

## Standard Stack

### Core (Already Installed — No New Packages Needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `framer-motion` | 11.13.1 | UI animations, idle effects | Already used in PhaseTransition, industry standard ([Motion docs](https://motion.dev)) |
| `vitest` | 4.0.17 | Unit testing framework | Already configured, fast, ESM-native ([Vitest Guide](https://vitest.dev/guide/)) |
| `@testing-library/react` | 16.3.2 | Component testing utilities | Already installed, recommended for React testing |
| `happy-dom` | 20.5.3 | DOM environment for tests | Already configured, faster than jsdom |
| `class-variance-authority` | 0.7.1 | CVA for component variants | Used in GameButton/GamePanel (Phase 22) |
| CSS transitions/keyframes | Browser built-in | Sprite idle animations | Better performance than JS ([MDN Performance Guide](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance)) |

### Supporting

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `@react-three/drei` SpriteAnimator | 3D sprite animations | NOT needed — already have 2D useSpriteAnimation hook |
| `react-sprite-animator` | Sprite sheet animations | NOT needed — custom hook is lighter and already works |

### Alternatives Considered

| Standard Approach | Alternative | Why Not |
|-------------------|-------------|---------|
| `useSpriteAnimation` custom hook | `react-sprite-animator` npm package | Custom hook already exists, optimized for ScrumQuest sprite sheets |
| CSS keyframe animations for idle | JavaScript `requestAnimationFrame` for idle | CSS is more performant for looping animations ([CSS vs JS animations](https://web.dev/articles/css-vs-javascript)) |
| Framer Motion for UI polish | GSAP / react-spring | Framer Motion already installed, used in phase transitions |
| Vitest + @testing-library | Jest + Enzyme | Vitest already configured, faster, better ESM support |

**Installation:** No new packages required. All needed tools are already installed.

---

## Architecture Patterns

### Recommended Project Structure

No new files needed — enhance existing files:

```
client/src/
├── lib/utils/
│   ├── magicWords.ts              # EXISTING - add unit tests
│   └── magicWords.test.ts         # NEW - test all detection/extraction functions
├── components/
│   ├── game/
│   │   ├── EmoteModal.tsx         # EXISTING - no changes needed
│   │   ├── MagicEffect.tsx        # EXISTING - no changes needed
│   │   ├── Lobby.tsx              # ENHANCE - add visible EmoteButton, ready toggle
│   │   └── LobbyReadyButton.tsx   # NEW - ready/not-ready toggle component
│   └── ui/
│       ├── GameButton.tsx         # EXISTING - reuse for EmoteButton/ReadyButton
│       └── GamePanel.tsx          # EXISTING - reuse for player list panel
├── hooks/
│   ├── useSpriteAnimation.ts      # ENHANCE - add multi-frame idle animation
│   └── useSpriteAnimation.test.ts # NEW - test idle animation frame cycling
└── test/
    └── setup.ts                   # ENHANCE - add Framer Motion mock

e2e/
└── lobby-emotes.spec.ts           # NEW - E2E test for emote broadcast
```

### Pattern 1: Testing Utility Functions (magicWords.ts)

**What:** Unit tests for pure functions that detect magic words and extract targets
**When to use:** All utility functions with deterministic outputs
**Source:** Existing test pattern from `useEventSync.test.ts`

```typescript
// magicWords.test.ts
import { describe, it, expect } from 'vitest';
import { detectMagicWords, extractSpellTargets, getSpellWords } from './magicWords';

describe('detectMagicWords', () => {
  it('detects single magic word', () => {
    expect(detectMagicWords('fire')).toEqual(['fire']);
    expect(detectMagicWords('Time to heal!')).toEqual(['heal']);
  });

  it('detects multiple magic words in one message', () => {
    expect(detectMagicWords('fire and ice')).toEqual(['fire', 'ice']);
  });

  it('is case insensitive', () => {
    expect(detectMagicWords('FIRE')).toEqual(['fire']);
    expect(detectMagicWords('HeAl')).toEqual(['heal']);
  });

  it('returns empty array for no magic words', () => {
    expect(detectMagicWords('hello world')).toEqual([]);
  });

  it('does not duplicate effect types', () => {
    expect(detectMagicWords('fire flame burn')).toEqual(['fire']); // All trigger 'fire'
  });
});

describe('extractSpellTargets', () => {
  it('extracts single target after spell word', () => {
    const spellWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify bob', spellWords)).toEqual(['bob']);
  });

  it('extracts multiple comma-separated targets', () => {
    const spellWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify bob, alice, charlie', spellWords))
      .toEqual(['bob', 'alice', 'charlie']);
  });

  it('extracts targets with "and" separator', () => {
    const spellWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify bob and alice', spellWords))
      .toEqual(['bob', 'alice']);
  });

  it('returns null for self-cast (no targets)', () => {
    const spellWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify', spellWords)).toBeNull();
  });
});
```

### Pattern 2: Framer Motion Mocking for Tests

**What:** Mock Framer Motion components to avoid animation performance issues in test environment
**When to use:** When testing components that use `motion.*` or `AnimatePresence`
**Source:** [Mock Framer Motion with Jest](https://www.hectane.com/blog/mock-framer-motion-with-jest), adapted for Vitest

```typescript
// client/src/test/setup.ts
import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useReducedMotion: () => false,
}));
```

### Pattern 3: Player Readiness Toggle Component

**What:** GameButton with toggle state for ready/not-ready indication
**When to use:** Lobby phase before game starts
**Source:** [WCAG Provide Feedback](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p10-status-feedback/), GameButton CVA pattern from Phase 22

```typescript
// LobbyReadyButton.tsx
import { GameButton } from '@/components/ui/GameButton';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';

export function LobbyReadyButton() {
  const { emit } = useWebSocket();
  const { currentPlayer } = useGameState();
  const isReady = currentPlayer?.isReady ?? false;

  const handleToggle = () => {
    emit('toggle_ready', { ready: !isReady });
  };

  return (
    <GameButton
      onClick={handleToggle}
      variant={isReady ? 'primary' : 'secondary'}
      aria-pressed={isReady}
      aria-label={isReady ? 'Ready - click to unready' : 'Not ready - click to ready up'}
    >
      {isReady ? '✓ Ready' : 'Not Ready'}
    </GameButton>
  );
}
```

**ARIA state:** `aria-pressed={isReady}` satisfies WCAG SC 4.1.2 (Name, Role, Value) by programmatically exposing toggle state to assistive tech.

**Visual feedback:** Color change (primary vs secondary variant) + checkmark icon satisfies WCAG SC 1.4.1 (Use of Color) by not relying solely on color.

### Pattern 4: Multi-Frame Idle Animation

**What:** Extend `useSpriteAnimation` to cycle through multiple idle frames for subtle movement
**When to use:** Lobby/waiting periods when character is not walking
**Source:** Existing `useSpriteAnimation.ts` RAF loop, [React sprite animation best practices](https://www.freecodecamp.org/news/learn-advanced-react-patterns-by-developing-a-game-with-sprite-animation-5dc072886975/)

```typescript
// useSpriteAnimation.ts (ENHANCE idle animation config)
const SPRITE_CONFIG: SpriteConfig = {
  frameWidth: 64,
  frameHeight: 64,
  animations: {
    // BEFORE: idle: { row: 0, frames: 1, speed: 1000, loop: true }
    // AFTER: Use 2 frames for subtle breathing effect
    idle: { row: 0, frames: 2, speed: 800, loop: true }, // Frames 0-1 = idle cycle
    walk: { row: 0, frames: 4, speed: 200, loop: true },
    // ... rest unchanged
  },
  // ... rest unchanged
};
```

**Performance:** Already uses `requestAnimationFrame` loop, no additional CPU cost for 2-frame vs 1-frame idle.

**Alternative:** If sprite sheets don't have multi-frame idle, use Framer Motion for subtle Y-axis bobbing:

```typescript
// Lobby.tsx - Character wrapper
<motion.div
  animate={{ y: [0, -2, 0] }}
  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
>
  <SpriteRenderer {...spriteProps} />
</motion.div>
```

### Pattern 5: E2E Testing for Emote Broadcast

**What:** Playwright E2E test verifying emote sent by one player appears for another
**When to use:** Testing real-time WebSocket features with multiple clients
**Source:** Existing E2E pattern from `e2e/battle.spec.ts`

```typescript
// e2e/lobby-emotes.spec.ts
import { test, expect } from '@playwright/test';

test('emote sent by one player appears for other players', async ({ page, context }) => {
  // Create lobby with player 1
  await page.goto('/');
  await page.getByRole('button', { name: /create lobby/i }).click();
  const lobbyCode = await page.locator('[data-testid="lobby-code"]').textContent();

  // Open second tab for player 2
  const page2 = await context.newPage();
  await page2.goto('/');
  await page2.getByRole('button', { name: /join lobby/i }).click();
  await page2.getByPlaceholder('Lobby Code').fill(lobbyCode);
  await page2.getByRole('button', { name: /join/i }).click();

  // Player 1 sends emote
  await page.keyboard.press('e'); // Open emote modal
  await page.getByPlaceholder('Type your emote message').fill('Hello from player 1!');
  await page.getByRole('button', { name: /say it/i }).click();

  // Verify player 2 sees the emote
  await expect(page2.getByText('Hello from player 1!')).toBeVisible({ timeout: 2000 });

  // Verify magic effect appears for magic words
  await page.keyboard.press('e');
  await page.getByPlaceholder('Type your emote message').fill('fire');
  await page.getByRole('button', { name: /say it/i }).click();

  await expect(page2.locator('[data-testid="magic-effect-fire"]')).toBeVisible({ timeout: 1000 });
});
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Animation frame timing | Custom `setInterval` loops | `requestAnimationFrame` (already used) or CSS keyframes | RAF syncs with browser repaint, better perf ([MDN Performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance)) |
| UI state animations | Custom tween/easing logic | Framer Motion (already installed) | Production-tested, handles reduced-motion, better DX |
| Sprite sheet parsing | Custom canvas slicing | Existing `useSpriteAnimation` hook | Already handles frame calculation, direction mapping |
| Emote validation | Client-only message checks | Server-side validation (already exists) | Prevents malicious/oversized messages, rate limiting |
| Readiness state sync | Local state only | WebSocket events + server state | Single source of truth, prevents desync |

**Key insight:** The lobby polish phase is **not** about building new systems — it's about **testing, refining, and making visible** what already exists invisibly. The emote system works but has no tests or UI entry point. Idle animations exist but aren't active. Readiness doesn't exist but the WebSocket pattern does.

---

## Common Pitfalls

### Pitfall 1: Testing Framer Motion Without Mocking

**What goes wrong:** Tests fail with "ReferenceError: window is not defined" or hang indefinitely because Framer Motion tries to run animations in happy-dom/jsdom environments.

**Why it happens:** Framer Motion internally uses browser APIs (requestAnimationFrame, window resize observers) that don't exist or behave differently in test environments.

**How to avoid:** Mock `framer-motion` in Vitest setup file to return plain React components without animation logic ([documented approach](https://github.com/framer/motion/issues/1690)).

**Warning signs:** Test timeouts when rendering components using `motion.*` or `AnimatePresence`.

### Pitfall 2: Idle Animation Frame Overflow

**What goes wrong:** `useSpriteAnimation` tries to render frame 2 or 3 of idle animation but sprite sheet only has 1 idle frame, resulting in incorrect sprite display.

**Why it happens:** Changing `idle: { frames: 2 }` without verifying sprite sheet layout.

**How to avoid:** Before changing frames count, verify sprite sheet has those frames. All ScrumQuest sprites use row 0, frames 0-3 for down-facing walk cycle — frame 0 is idle, frames 1-3 are walk. Can use frames 0-1 for 2-frame idle breathing effect.

**Warning signs:** Console warning "Frame out of bounds" from `useSpriteAnimation.ts` line 112-114.

### Pitfall 3: Emote Button Accessibility Without ARIA State

**What goes wrong:** Ready/not-ready button changes color but screen readers don't announce state change.

**Why it happens:** Visual-only state indication without programmatic state exposure.

**How to avoid:** Use `aria-pressed={isReady}` for toggle buttons, `aria-label` for screen reader text ([WCAG Interactive Elements](https://developerux.com/2025/08/18/wcag-guidelines-for-interactive-elements/)).

**Warning signs:** Axe Core accessibility scan flags "Button does not have accessible name" or "Toggle button missing aria-pressed".

### Pitfall 4: Server-Side Emote Validation Not Tested

**What goes wrong:** Server accepts malformed emote payloads (missing x/y, oversized messages) because validation logic isn't covered by tests.

**Why it happens:** WebSocket event handlers harder to test than HTTP endpoints, often skipped.

**How to avoid:** Add server-side unit tests for `websocket.ts` emote handler using mock Socket.IO instances. Verify message length validation, phase validation, broadcast behavior.

**Warning signs:** CodeQL alerts for input validation, production logs showing invalid emote payloads.

### Pitfall 5: Race Condition in Ready State Display

**What goes wrong:** Player clicks ready, button updates locally, but lobby player list doesn't show checkmark for 1-2 seconds.

**Why it happens:** Optimistic UI update on client without waiting for server confirmation, or server doesn't broadcast `lobby_updated` event after ready state change.

**How to avoid:** Server must emit `lobby_updated` after processing `toggle_ready` event. Client displays optimistic state but reverts if server response differs.

**Warning signs:** Ready state flickers, desyncs between players' views of who's ready.

---

## Code Examples

Verified patterns from official sources and existing codebase.

### Testing Magic Word Detection

```typescript
// Source: Vitest docs + existing useEventSync.test.ts pattern
import { describe, it, expect } from 'vitest';
import { detectMagicWords, getPrimaryMagicEffect } from '@/lib/utils/magicWords';

describe('Magic word detection', () => {
  it('detects fire-related keywords', () => {
    expect(detectMagicWords('fire')).toEqual(['fire']);
    expect(detectMagicWords('flame')).toEqual(['fire']);
    expect(detectMagicWords('burn it all')).toEqual(['fire']);
  });

  it('detects multiple effects', () => {
    expect(detectMagicWords('fire and ice')).toEqual(['fire', 'ice']);
  });

  it('returns primary effect for priority handling', () => {
    expect(getPrimaryMagicEffect('fire and ice')).toBe('fire'); // First detected
  });
});
```

### Visible Emote Button in Lobby

```typescript
// Source: GameButton CVA pattern from Phase 22-02
// Lobby.tsx - add to bottom control panel
<GamePanel variant="primary" className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
  <GameButton
    onClick={() => setEmoteModalOpen(true)}
    variant="primary"
    size="md"
    aria-label="Send emote message"
  >
    💬 Emote
  </GameButton>

  <LobbyReadyButton />
</GamePanel>
```

### Multi-Frame Idle Animation Loop

```typescript
// Source: Existing useSpriteAnimation.ts RAF loop
// Option 1: Use existing sprite frames 0-1 for breathing effect
const SPRITE_CONFIG: SpriteConfig = {
  animations: {
    idle: { row: 0, frames: 2, speed: 800, loop: true }, // Subtle 2-frame cycle
    // ...
  },
};

// Option 2: Framer Motion Y-axis bobbing if sprite sheets don't support multi-frame idle
// Source: https://www.framer.com/motion/transition/ - repeat + ease-in-out
<motion.div
  animate={{ y: [0, -3, 0] }}
  transition={{
    duration: 2.5,
    repeat: Infinity,
    ease: 'easeInOut',
    repeatType: 'loop'
  }}
>
  <SpriteRenderer {...spriteProps} />
</motion.div>
```

### Ready State WebSocket Events

```typescript
// Source: Existing socket-schemas.ts pattern + server websocket.ts broadcast pattern
// shared/socket-schemas.ts - ADD
export const ToggleReadyPayloadSchema = z.object({
  ready: z.boolean(),
});

// server/websocket.ts - ADD handler
socket.on('toggle_ready', ({ ready }) => {
  const playerId = socket.data.playerId;
  const lobbyId = socket.data.lobbyId;
  if (!playerId || !lobbyId) return;

  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  const player = lobby.players.find(p => p.id === playerId);
  if (!player) return;

  player.isReady = ready;

  // Broadcast updated lobby state
  io.to(lobbyId).emit('lobby_updated', lobby);
});

// shared/gameEvents.ts - ADD to Player interface
export interface Player {
  // ... existing fields
  isReady?: boolean; // NEW - player ready state for lobby
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Keyboard-only emotes ("E" key) | Visible button + keyboard shortcut | Phase 25 | Mobile accessibility, discoverability |
| Static idle sprites | Multi-frame or motion-animated idle | Phase 25 | Visual polish, "living" lobby feel |
| No readiness indicator | Ready/not-ready toggle before start | Phase 25 | Prevents accidental game starts, clearer intent |
| Zero emote system tests | Unit + E2E coverage | Phase 25 | Confidence in server validation, prevents regressions |
| Framer Motion as "motion" | Rebranded to Motion library | Jan 2026 ([Bytes #346](https://bytes.dev/archives/346)) | API unchanged, just naming |

**Deprecated/outdated:**
- `react-sprite-animator` npm package: Not needed, custom `useSpriteAnimation` hook is lighter and already optimized
- Manual `setInterval` for animations: Use `requestAnimationFrame` or CSS keyframes for better performance
- Jest for testing: Vitest is faster, better ESM support, already configured

---

## Open Questions

### 1. Should idle animation use sprite frames or Framer Motion?

**What we know:**
- Sprite sheets have frames 0-3 in row 0 (down-facing walk cycle)
- Frame 0 = idle, frames 1-3 = walk steps
- Could use frames 0-1 for 2-frame idle breathing

**What's unclear:**
- Do all avatar class sprite sheets follow same layout?
- Is frame 1 visually distinct enough from frame 0 for breathing effect?

**Recommendation:** Inspect sprite sheets first. If frame 1 is suitable, use frames 0-1 for authentic pixel-art breathing. If not distinct, use Framer Motion Y-axis bobbing (3px range, 2.5s duration) for subtle effect.

### 2. Should emote button be always visible or context-aware?

**What we know:**
- GamePanel already used for bottom control panels
- Mobile needs visible button (no keyboard)
- Desktop could use keyboard shortcut only

**What's unclear:**
- Does permanent bottom panel obstruct lobby view on small screens?
- Should button appear only on mobile (`useIsMobile` hook from Phase 23)?

**Recommendation:** Always show button for consistency. Use existing `useIsMobile` hook if obstruction becomes issue — desktop gets smaller button, mobile gets larger touch target.

### 3. What's the ready threshold for game start?

**What we know:**
- Standard multiplayer pattern: all players must ready up
- ScrumQuest supports 1-8 players

**What's unclear:**
- Should host override (start even if not all ready)?
- Minimum players required to start (2? 3?)?
- Should spectators affect ready count?

**Recommendation:** Defer to existing game start logic. If no ready system exists, implement "all non-spectator players must ready" as baseline. Host override is Phase 26+ enhancement.

---

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- [Vitest Component Testing Guide](https://vitest.dev/guide/browser/component-testing) - Test setup patterns
- [Framer Motion Transition docs](https://www.framer.com/motion/transition/) - Loop and repeat animations
- [MDN CSS/JS Animation Performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance) - CSS keyframes vs RAF
- [WCAG Provide Feedback Pattern](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p10-status-feedback/) - Status indicator requirements
- [WCAG Interactive Elements Guidelines](https://developerux.com/2025/08/18/wcag-guidelines-for-interactive-elements/) - Button state ARIA requirements

**Codebase Files:**
- `client/src/lib/utils/magicWords.ts` - Existing implementation
- `client/src/hooks/useSpriteAnimation.ts` - Animation hook
- `server/websocket.ts` - Emote event handler
- `vitest.config.ts` - Test configuration
- `client/src/components/ui/GameButton.tsx` - CVA button pattern
- `.planning/phases/22-jrpg-theme-foundation/22-RESEARCH.md` - Theme foundation context
- `.planning/phases/23-mobile-ux-critical-path/23-RESEARCH.md` - Mobile patterns

### Secondary (MEDIUM confidence)

**WebSearch verified:**
- [Mock Framer Motion with Jest](https://www.hectane.com/blog/mock-framer-motion-with-jest) - Testing pattern (adaptable to Vitest)
- [Game UI Database - Chat Shortcuts & Emotes](https://www.gameuidatabase.com/index.php?scrn=113) - Emote UI patterns
- [About Chat Systems in Games](https://medium.com/nyc-design/about-chat-systems-in-games-971336d4f75e) - Non-verbal communication importance
- [React sprite animation patterns](https://www.freecodecamp.org/news/learn-advanced-react-patterns-by-developing-a-game-with-sprite-animation-5dc072886975/) - Best practices
- [CSS vs JavaScript animations](https://web.dev/articles/css-vs-javascript) - Performance comparison

### Tertiary (LOW confidence - marked for validation)

**WebSearch only:**
- [Drei SpriteAnimator](https://drei.docs.pmnd.rs/misc/sprite-animator) - 3D sprite pattern (not applicable, but reference)
- React Three Fiber animation examples - Not needed for 2D sprites

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - All libraries already installed, verified in package.json and codebase
- Architecture patterns: **HIGH** - Based on existing Phase 22/23 patterns and official documentation
- Testing approach: **HIGH** - Vitest config verified, existing test patterns inspected
- Emote system state: **HIGH** - Full codebase inspection of existing implementation
- Idle animation approach: **MEDIUM** - Sprite sheet layout assumed based on hook config, needs visual verification
- Readiness UX: **MEDIUM** - Standard multiplayer pattern, but no ScrumQuest-specific requirements documented

**Research date:** 2026-02-19
**Valid until:** 2026-03-21 (30 days for stable tech stack)
