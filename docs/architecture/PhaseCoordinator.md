# PhaseCoordinator Architecture

## Overview

`PhaseCoordinator` is the centralized phase management system for ScrumQuest. It replaces scattered `lobby.gamePhase = ...` mutations with a single, auditable, event-driven state machine.

## Design Principles

1. **Single Responsibility**: PhaseCoordinator is the ONLY component that mutates `lobby.gamePhase`
2. **Event-Driven**: Domain events trigger phase transitions
3. **Validation**: All transitions validated against domain state
4. **Observability**: Every transition logged with context
5. **Decoupling**: Domains emit events and react to `phase:changed`

## State Machine Diagram

```
lobby → avatar_selection → battle → reveal → discussion → victory → lobby
                             ↓         ↓         ↓
                         game_over     ↓      next_level → battle
                             ↓    game_over
                           lobby      ↓
                                   lobby
```

**Emergency Exit**: Any phase → lobby (abandon quest)

## Testing

- Unit tests: `server/domains/PhaseCoordinator.test.ts` (30 tests)
- Integration tests: `server/domains/PhaseCoordinator.integration.test.ts` (18 tests)

Run: `npm test PhaseCoordinator`

## Best Practices

✅ **DO**: Use `phaseCoordinator.transitionTo()` for all phase changes
❌ **DON'T**: Mutate `lobby.gamePhase` directly

See inline documentation in `PhaseCoordinator.ts` for details.
