# Test Manifest

This file provides a complete inventory of all test files in the project, organized by type and purpose. Use this as a reference when creating new tests or finding existing ones.

## Test Statistics

- **Total Test Files**: 23
- **Unit Tests**: 12
- **Integration Tests**: 1
- **E2E Tests**: 10 (4 functional, 4 visual, 2 a11y)

## Server Tests (13 files)

### Domain Manager Tests (Unit)
**Location**: `server/domains/`
**Pattern**: Co-located with source (`*.test.ts` next to `*.ts`)

| File | Purpose | Test Count |
|------|---------|------------|
| `SessionManager.test.ts` | Lobby lifecycle, player management, reconnection | 60 |
| `EstimationManager.test.ts` | Voting, consensus, team estimation | 64 |
| `CombatManager.test.ts` | Battle mechanics, boss fights, player states | 108 |
| `ProgressionManager.test.ts` | XP curves, level calculations, XP awards | 37 |
| `index.test.ts` | Domain manager integration, wiring | 12 |

### Event System Tests (Unit)
**Location**: `server/events/`
**Pattern**: Co-located with source

| File | Purpose | Test Count |
|------|---------|------------|
| `EventBus.test.ts` | Type-safe event emission, scoping | 15 |
| `LobbyEventSequencer.test.ts` | Event ordering, sequence numbers | 23 |
| `ClientEventEmitter.test.ts` | Server-to-client event forwarding | 20 |

### Integration Tests
**Location**: `server/integration/`
**Pattern**: Cross-domain workflow tests

| File | Purpose | Test Count |
|------|---------|------------|
| `gameFlow.test.ts` | End-to-end game phase transitions | 9 |

## Client Tests (6 files)

### Store Tests (Unit)
**Location**: `client/src/lib/stores/`
**Pattern**: Co-located with source

| File | Purpose | Test Count |
|------|---------|------------|
| `useProgression.test.ts` | XP state management, level-up handling | 13 |
| `useEventSync.test.ts` | Event sequencing, gap recovery | 24 |

### Component Tests (Unit)
**Location**: `client/src/components/game/`
**Pattern**: Co-located with component

| File | Purpose | Test Count |
|------|---------|------------|
| `XPBar.test.tsx` | XP bar rendering, tooltips | 4 |
| `LevelUpCelebration.test.tsx` | Level-up modal, class colors | 5 |
| `FloatingXP.test.tsx` | Floating XP numbers, animations | 4 |

### Utility Tests (Unit)
**Location**: `client/src/lib/`
**Pattern**: Co-located with utils

| File | Purpose | Test Count |
|------|---------|------------|
| `utils.test.ts` | Helper functions (cn, etc.) | 5 |

## E2E Tests (10 files)

### Functional E2E
**Location**: `e2e/`
**Pattern**: Feature-based organization

| File | Purpose | Browser | Complexity |
|------|---------|---------|------------|
| `lobby.spec.ts` | Lobby creation, joining, player management | Chromium | Medium |
| `battle.spec.ts` | Combat flow, boss battles, victory | Chromium | High |

### Visual Regression
**Location**: `e2e/visual/`
**Pattern**: Screenshot comparison tests

| File | Purpose | Snapshots |
|------|---------|-----------|
| `lobby.visual.spec.ts` | Lobby UI consistency | 3 |
| `voting.visual.spec.ts` | Voting phase UI | 2 |
| `reveal.visual.spec.ts` | Reveal phase UI | 2 |
| `victory.visual.spec.ts` | Victory screen UI | 2 |

### Accessibility Tests
**Location**: `e2e/a11y/`
**Pattern**: WCAG compliance checks

| File | Purpose | WCAG Level |
|------|---------|------------|
| `lobby.a11y.spec.ts` | Lobby accessibility (keyboard nav, ARIA) | AA |
| `battle.a11y.spec.ts` | Battle accessibility | AA |

## Test Patterns & Best Practices

### Unit Test Structure
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SomeManager } from './SomeManager';

describe('SomeManager', () => {
  let manager: SomeManager;

  beforeEach(() => {
    manager = new SomeManager();
  });

  describe('someMethod', () => {
    it('should do the expected thing', () => {
      const result = manager.someMethod();
      expect(result).toBe(expected);
    });
  });
});
```

### Integration Test Structure
```typescript
describe('Cross-Domain Integration', () => {
  let sessionManager: SessionManager;
  let estimationManager: EstimationManager;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    sessionManager = new SessionManager({ eventBus });
    estimationManager = new EstimationManager({ eventBus, ... });
  });

  it('should handle full estimation flow', () => {
    // Setup lobby via sessionManager
    // Start estimation via estimationManager
    // Verify events propagate correctly
  });
});
```

### E2E Test Structure
```typescript
import { test, expect } from '@playwright/test';

test('user can create and join lobby', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create Lobby' }).click();
  await expect(page.getByText('Lobby Code')).toBeVisible();
});
```

## Adding New Tests

### For New Features
1. **Start with unit tests** - Test the domain logic first
2. **Add integration tests** - If feature spans multiple domains
3. **Add E2E tests** - For user-facing workflows
4. **Consider visual tests** - For UI changes
5. **Add a11y tests** - For new interactive components

### Test File Checklist
- [ ] Test file co-located with source (unit tests)
- [ ] Follows naming convention (*.test.ts or *.spec.ts)
- [ ] Uses async/await (not done() callbacks)
- [ ] Event listeners return void (wrap array.push if needed)
- [ ] Coverage meets thresholds (8.5% branches minimum)
- [ ] Added to this manifest if creating new test type

## Quick Commands

```bash
# Run specific test file
npx vitest run server/domains/SessionManager.test.ts

# Run all tests in a directory
npx vitest run server/domains/

# Run tests matching a pattern
npx vitest run --grep "XP award"

# Update visual regression baselines
npm run test:visual:update

# Run accessibility tests only
npm run test:a11y

# Coverage for specific file
npx vitest run --coverage server/domains/SessionManager.ts
```

## CI Integration

All tests run automatically in GitHub Actions:
- **Unit tests**: `.github/workflows/ci.yml` (job: `test`)
- **E2E tests**: `.github/workflows/e2e.yml`
- **Visual tests**: `.github/workflows/visual-regression.yml`
- **A11y tests**: `.github/workflows/accessibility.yml`

## Maintenance

**When to update this manifest**:
- [ ] Adding a new test file
- [ ] Removing a test file
- [ ] Changing test organization structure
- [ ] Adding new test patterns or conventions

**Last Updated**: 2026-02-06
**Maintained by**: Automated/Manual (update when adding tests)
