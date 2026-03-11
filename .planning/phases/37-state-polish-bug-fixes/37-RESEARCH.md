# Phase 37: State Polish & Bug Fixes - Research

**Researched:** 2026-03-11
**Domain:** React UI polish, error handling, server socket handlers
**Confidence:** HIGH

## Summary

This phase addresses five distinct concerns: empty state messaging (POLISH-01), loading skeletons/spinners (POLISH-02), error boundary improvements (POLISH-03), a missing server socket handler (FIX-01), and broken developer menu wiring (FIX-02). The existing codebase has strong JRPG theming infrastructure (`RetroCard`, `RetroButton`, `GamePanel`, `Skeleton` component, CSS tokens in `retro.css` and `tokens.css`) that should be reused for all new UI. The `ErrorBoundary` component exists but is minimal -- it recovers from DOM errors silently but shows an empty div as fallback, with no retry capability or themed UI.

The two bugs are well-scoped: `restart_game` is defined in `shared/gameEvents.ts` (line 252) and emitted by `VictoryPhase.tsx` (line 179) but has zero server handlers anywhere in the `server/` directory. The `DeveloperMenu` has `onOpenCharacterTools` and `onOpenBossTools` props but App.tsx passes empty no-op functions with TODO comments (lines 206-207), while fully functional `CharacterTools` and `BossTools` components exist in `client/src/components/utils/`.

**Primary recommendation:** Build all new UI with existing `RetroCard`, `RetroButton`, `Skeleton`, and Framer Motion. Implement `restart_game` handler by modeling after the existing `return_to_lobby` handler pattern. Wire developer tools via React state in App.tsx.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18+ | UI framework | Already used everywhere |
| framer-motion | ^11.13.1 | Animations, transitions | Already used in Lobby, PhaseTransition |
| Tailwind CSS | (project dep) | Styling, responsive design | Already used for all components |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| RetroCard/GamePanel | internal | JRPG-themed card containers | All empty state and error UI |
| RetroButton/GameButton | internal | JRPG-themed buttons | CTAs in empty states, retry buttons |
| Skeleton | internal (shadcn) | Loading placeholder | Lobby player list skeletons |
| class-variance-authority | (project dep) | Component variants | GamePanel already uses it |

### No New Dependencies Needed
All required UI primitives exist in the project. No new packages to install.

## Architecture Patterns

### Existing Component Structure
```
client/src/
  components/
    ui/
      ErrorBoundary.tsx     # Minimal, needs enhancement
      skeleton.tsx           # shadcn Skeleton (animate-pulse)
      GamePanel.tsx          # JRPG panel with variants
      GameButton.tsx         # JRPG button with variants
      retro-card.tsx         # Wrapper around GamePanel
      retro-button.tsx       # Wrapper around GameButton
      DeveloperMenu.tsx      # Developer tools menu (broken wiring)
    game/
      Lobby.tsx              # Already has empty ticket state (line 2095)
      phases/
        PhaseRenderer.tsx    # Central phase renderer, wrap with error boundary
        PhaseRegistry.tsx    # Phase component registry
        BattlePhase.tsx      # Has basic "Preparing Battle..." fallback
        VictoryPhase.tsx     # Has restart_game emit (line 179)
        GameOverPhase.tsx    # Has return_to_lobby emit
    utils/
      CharacterTools.tsx     # Fully functional, not wired
      BossTools.tsx          # Fully functional, not wired
  App.tsx                    # DeveloperMenu with no-op callbacks (lines 206-207)
server/
  websocket.ts               # Socket handlers (no restart_game handler)
  gameState.ts               # Has abandonQuest (line 870) and returnToLobby (line 896)
shared/
  gameEvents.ts              # restart_game defined in ClientToServerEvents (line 252)
```

### Pattern 1: JRPG-Themed Empty State
**What:** Reusable empty state component using RetroCard with JRPG flavor text and actionable CTA
**When to use:** Lobby with no players, no tickets, no abilities unlocked, empty scoreboard
**Example:**
```typescript
// Follows existing pattern from Lobby.tsx line 2095
function EmptyState({ icon, title, message, action, actionLabel }: EmptyStateProps) {
  return (
    <RetroCard>
      <div className="text-center py-8 space-y-3">
        <div className="text-4xl">{icon}</div>
        <h3 className="text-lg font-bold retro-text-glow-light">{title}</h3>
        <p className="text-sm text-gray-400">{message}</p>
        {action && (
          <RetroButton onClick={action} variant="primary">
            {actionLabel}
          </RetroButton>
        )}
      </div>
    </RetroCard>
  );
}
```

### Pattern 2: Loading Skeleton for Player List
**What:** Use existing `Skeleton` component with JRPG styling for lobby player list
**When to use:** When lobby data is loading/connecting
**Example:**
```typescript
// Uses existing Skeleton from client/src/components/ui/skeleton.tsx
function PlayerListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-gray-800 rounded">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Pattern 3: Enhanced Error Boundary with Retry
**What:** Class component error boundary with JRPG-themed fallback and retry button
**When to use:** Wrap each phase component individually for granular error isolation
**Example:**
```typescript
// Enhanced version of existing ErrorBoundary.tsx
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  phaseName?: string;
  onRetry?: () => void;
}

// Default JRPG-themed fallback
function JRPGErrorFallback({ error, onRetry, phaseName }: {
  error?: Error;
  onRetry: () => void;
  phaseName?: string;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <RetroCard>
        <div className="text-center space-y-4 p-6">
          <div className="text-5xl">💀</div>
          <h2 className="text-xl font-bold retro-text-glow text-red-400">
            A Glitch in the Matrix!
          </h2>
          <p className="text-sm text-gray-400">
            {phaseName ? `The ${phaseName} phase encountered a curse.` : 'Something went wrong.'}
          </p>
          <RetroButton onClick={onRetry} variant="primary">
            🔄 Cast Resurrect
          </RetroButton>
        </div>
      </RetroCard>
    </div>
  );
}
```

### Pattern 4: Server Socket Handler (restart_game)
**What:** Add `restart_game` handler following existing `return_to_lobby` / `abandon_quest` pattern
**When to use:** When VictoryPhase "New Game" button is clicked
**Example:**
```typescript
// In server/websocket.ts, modeled after return_to_lobby (line 1118) and abandon_quest (line 1106)
socket.on('restart_game', () => {
  const playerId = socket.data.playerId;
  if (!playerId) return;

  // Option A: Reuse abandonQuest which already resets to lobby state
  const lobby = gameState.abandonQuest(playerId);
  if (lobby) {
    io.to(lobby.id).emit('lobby_updated', { lobby });
  }
});
```

### Anti-Patterns to Avoid
- **Raw "Loading..." text:** Never show unstyled loading text. Always use Skeleton or themed spinner.
- **Silent error swallowing:** Current ErrorBoundary renders empty div on error. Always show themed fallback.
- **Single top-level error boundary:** Wrap each phase individually so one crash does not take down the entire app.
- **Custom spinner implementations:** Use existing `animate-pulse` (Skeleton) or framer-motion for themed spinners.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Loading placeholders | Custom shimmer CSS | `Skeleton` component (shadcn) | Already has animate-pulse, consistent with design system |
| Error boundaries | Custom try-catch wrappers | React ErrorBoundary class component | Only way to catch render errors in React |
| Themed containers | New card components | `RetroCard` / `GamePanel` | Established JRPG theming, CVA variants |
| Themed buttons | New button styles | `RetroButton` / `GameButton` | primary/secondary/accent variants exist |
| Animation | Custom CSS keyframes | `framer-motion` | Already in project, handles mount/unmount animations |

## Common Pitfalls

### Pitfall 1: Error Boundary Reset
**What goes wrong:** Error boundary catches error but has no way to retry, stuck in error state permanently
**Why it happens:** Class component state persists; `hasError: true` never gets reset
**How to avoid:** Add a `resetErrorBoundary` method that sets `hasError: false`, triggered by retry button. Also reset on key/phase change using `getDerivedStateFromProps` or `componentDidUpdate`.
**Warning signs:** Error UI stays even after navigating to a different phase

### Pitfall 2: Skeleton Flash
**What goes wrong:** Skeleton shows for a split second before real content appears, causing visual flicker
**Why it happens:** Data loads fast enough that skeleton is unnecessary but still renders briefly
**How to avoid:** Only show skeletons after a minimum delay (e.g., 200ms) or when data is genuinely pending. For lobby player list, check `currentLobby === null` vs `currentLobby.players.length === 0`.
**Warning signs:** Rapid flash of gray boxes on fast connections

### Pitfall 3: restart_game vs abandonQuest Semantics
**What goes wrong:** New Game button resets too much or too little state
**Why it happens:** `abandonQuest` clears `completedTickets` and resets to lobby. This is exactly what "New Game" means -- but need to ensure tickets (backlog) are preserved if desired.
**How to avoid:** Review `gameState.abandonQuest` (line 870-893) behavior carefully. It resets `currentTicket`, `boss`, `completedTickets`, and all player scores/states but keeps `lobby.tickets` intact. This is the correct behavior for "start a new game with same backlog."
**Warning signs:** Tickets disappearing after New Game

### Pitfall 4: DeveloperMenu Routing vs State
**What goes wrong:** Trying to route to CharacterTools/BossTools via React Router when they should be modal overlays
**Why it happens:** TODO comment says "add to route" but the components take `onBack` prop, suggesting overlay/modal pattern
**How to avoid:** Use React state in App.tsx to show/hide CharacterTools and BossTools as overlay panels, similar to how DeveloperMenu itself works. No routing needed.
**Warning signs:** URL changes when opening dev tools, or navigation breaking

### Pitfall 5: ErrorBoundary Around Three.js/Canvas
**What goes wrong:** Error boundary catches Three.js errors but cannot recover the WebGL context
**Why it happens:** Three.js canvas state is not restorable by React re-render
**How to avoid:** Place error boundaries OUTSIDE canvas components. For battle phase, wrap `PhaseContainer` not individual 3D elements. The existing auto-recovery for DOM errors (lines 28-33 in ErrorBoundary.tsx) should be preserved.
**Warning signs:** Black screen after error recovery in battle phase

## Code Examples

### Where Empty States Are Needed (Verified)
```
1. Lobby player list - when lobby has 0 players (current: no empty state shown)
2. Lobby ticket list - ALREADY HAS empty state (Lobby.tsx line 2095)
3. AbilityBar - returns null when no avatar/abilities (could show "No abilities" in battle)
4. TeamScoreboard - returns null when no teamCompetition data (could show empty state)
5. Battle preparation - BattlePhase.tsx line 39-53 has basic "Preparing Battle..." (needs theming)
```

### Where Error Boundaries Should Go (Verified)
```
1. PhaseRenderer.tsx - wrap <PhaseComponent> (line 99) with per-phase error boundary
2. App.tsx - keep a top-level boundary for non-phase crashes
3. BattleScreen/BossDisplay - around 3D canvas content
```

### restart_game Handler Reference
```typescript
// gameState.abandonQuest (server/gameState.ts line 870-893) already does:
// - Resets gamePhase to 'lobby'
// - Clears currentTicket, boss, completedTickets
// - Resets all player scores, submission state, ready state
// - Preserves lobby.tickets (backlog)
// This is exactly what restart_game needs.
```

### DeveloperMenu Fix Reference
```typescript
// App.tsx lines 206-207 currently:
onOpenCharacterTools={() => { /* Character tools removed from App - TODO: add to route */ }}
onOpenBossTools={() => { /* Boss tools removed from App - TODO: add to route */ }}

// Fix: Add state and render CharacterTools/BossTools as overlays
// CharacterTools and BossTools both accept { onBack: () => void } prop
// Both are standalone full-page components that render their own RetroCards
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single ErrorBoundary at top | Per-feature error boundaries | React 18+ best practice | Granular error isolation |
| `componentDidCatch` only | `getDerivedStateFromError` + recovery | React 16+ | Predictable error UI |
| Raw loading text | Skeleton components | shadcn pattern | Consistent loading UX |

## Open Questions

1. **Should "New Game" preserve or clear the ticket backlog?**
   - What we know: `abandonQuest` preserves `lobby.tickets` but clears `completedTickets`
   - What's unclear: Is this the desired UX for "New Game" on victory screen?
   - Recommendation: Preserve tickets (same backlog, fresh game). This matches `abandonQuest` behavior.

2. **Should CharacterTools/BossTools be routed or overlay?**
   - What we know: Components are full-page with `onBack` prop. App.tsx TODO says "add to route."
   - What's unclear: Whether these should have their own URL or be modal overlays
   - Recommendation: Use overlay/modal pattern (consistent with DeveloperMenu, CheatMenu). Simpler, no routing changes needed. If the tools are deemed unnecessary, removing the buttons from DeveloperMenu is even simpler.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all files referenced above
- `shared/gameEvents.ts` line 252 - `restart_game` event type definition
- `server/websocket.ts` lines 1106-1135 - `abandon_quest` and `return_to_lobby` handler patterns
- `server/gameState.ts` lines 870-930 - `abandonQuest` and `returnToLobby` implementations
- `client/src/components/ui/ErrorBoundary.tsx` - current error boundary (43 lines)
- `client/src/components/ui/skeleton.tsx` - existing Skeleton component
- `client/src/App.tsx` lines 206-207 - broken developer tool wiring
- `client/src/components/utils/CharacterTools.tsx` and `BossTools.tsx` - fully functional components

### Secondary (MEDIUM confidence)
- React ErrorBoundary best practices (React docs - class component pattern is the only option for render error catching)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all components exist in codebase, no new dependencies
- Architecture: HIGH - patterns derived directly from existing code
- Pitfalls: HIGH - based on codebase inspection and React fundamentals
- Bug analysis: HIGH - confirmed by searching server handlers, found exact missing pieces

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable, no external dependencies)
