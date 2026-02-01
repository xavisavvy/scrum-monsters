# Testing Patterns

**Analysis Date:** 2026-02-01

## Test Framework

**Runner:**
- Vitest 4.0.17
- Config: `vitest.config.ts`
- Environment: happy-dom

**Assertion Library:**
- Vitest built-in (uses Node assertion library)
- @testing-library/jest-dom for additional matchers

**Run Commands:**
```bash
npm test              # Run all tests once
npm run test:watch   # Watch mode (re-run on file changes)
npm run test:coverage # Run with coverage report
npx vitest run path/to/file.test.ts  # Run single test file
```

## Test File Organization

**Location:**
- Co-located with source files
- Test files in same directory as implementation

**Naming:**
- Test files: `.test.ts` or `.spec.ts` suffix
- Example: `utils.ts` → `utils.test.ts`

**Structure:**
- Client tests: `client/src/**/*.{test,spec}.{ts,tsx}`
- Server tests: `server/**/*.{test,spec}.ts`
- Shared tests: `shared/**/*.{test,spec}.ts`

## Test Structure

**Suite Organization:**
```typescript
describe("cn utility", () => {
  it("merges class names correctly", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", true && "active", false && "hidden")).toBe("base active");
  });

  it("handles arrays and objects", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
    expect(cn({ active: true, disabled: false })).toBe("active");
  });
});
```

**Patterns:**
- `describe()` blocks group related tests
- `it()` statements for individual test cases
- Descriptive test names starting with verb (e.g., "merges", "handles", "resolves")
- One assertion concept per test when possible
- Setup/teardown handled via hooks if needed (not yet seen in codebase)

## Mocking

**Framework:**
- Vitest has built-in mocking via `vi` object
- No mocking library configured yet (would typically use `vi.mock()` or `vitest` mocking)

**Patterns:**
- No explicit mocking patterns found in existing test files
- Socket.IO events could be mocked using `vi.mock('socket.io-client')`
- State stores can be tested directly without mocking due to Zustand's design

**What to Mock:**
- External API calls (Socket.IO events, HTTP requests)
- File system operations
- localStorage/sessionStorage
- Timers (setTimeout, setInterval)

**What NOT to Mock:**
- Pure utility functions (test directly)
- Component state management (use real stores for integration tests)
- Local state hooks (test behavior, not implementation)

## Fixtures and Factories

**Test Data:**
```typescript
// Example pattern (not yet in codebase but recommended):
const createMockLobby = (): Lobby => ({
  id: 'test-lobby-1',
  name: 'Test Lobby',
  hostId: 'host-1',
  players: [],
  gamePhase: 'lobby',
  // ... rest of properties
});
```

**Location:**
- Could be placed in `client/src/test/fixtures/` or `server/test/fixtures/`
- Or inline in test files for simple cases

**Current Setup:**
- Setup file: `client/src/test/setup.ts`
- Imports `@testing-library/jest-dom/vitest` for DOM matchers
- Globals enabled in Vitest config

## Coverage

**Requirements:** Not enforced

**View Coverage:**
```bash
npm run test:coverage
```

**Coverage Output:**
- Reporter: text, json, html
- Excludes: node_modules, test files, test directories
- HTML report: accessible for detailed analysis

**Coverage Config** (from `vitest.config.ts`):
```typescript
coverage: {
  provider: "v8",
  reporter: ["text", "json", "html"],
  include: ["client/src/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
  exclude: [
    "node_modules",
    "**/*.test.{ts,tsx}",
    "**/*.spec.{ts,tsx}",
    "**/test/**",
  ],
}
```

## Test Types

**Unit Tests:**
- Scope: Individual functions and utilities
- Approach: Test pure functions directly
- Example: `cn()` utility in `utils.test.ts`
- Run in isolation without external dependencies

**Integration Tests:**
- Scope: Store interactions, Socket.IO event flows
- Approach: Use real store instances and mock socket events
- Not yet extensively written (only basic utility test found)
- Would test: lobby state transitions, team competition updates

**E2E Tests:**
- Framework: Not used
- Alternative approach: Manual testing via UI or future Cypress/Playwright setup

## Common Patterns

**Utility Testing:**
```typescript
describe("cn utility", () => {
  it("merges class names correctly", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("merges tailwind classes intelligently", () => {
    // twMerge should resolve conflicting classes
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles undefined and null values", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });
});
```

**Async Testing:**
- Use `async/await` in test functions
- Vitest automatically waits for promises
- Example pattern (not in codebase yet):
```typescript
it("resolves async operation", async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});
```

**Error Testing:**
- Test error conditions with try-catch
- Expect thrown errors or error emissions
- Example pattern (not in codebase yet):
```typescript
it("throws on invalid input", () => {
  expect(() => {
    functionThatThrows(null);
  }).toThrow();
});
```

## Recommendations for Expansion

**Missing Coverage Areas:**
- Socket.IO event handlers (`websocket.ts`, `socketHandlers.ts`)
- Game state transitions (`gameState.ts`)
- Store interactions (Zustand stores)
- Team competition calculations (`teamStatsManager.ts`)
- Authentication flows (`server/auth/routes.ts`)

**Recommended Setup:**
1. Add mocking utility for Socket.IO sockets
2. Create test fixtures for Lobby, Player, Boss entities
3. Add integration tests for critical game flows
4. Mock Redis operations for storage tests

---

*Testing analysis: 2026-02-01*
