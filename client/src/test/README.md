# Test Infrastructure

This directory contains enhanced test setup with agent-friendly error messages and debugging context.

## Files

### `setup.ts`
Main test configuration file with custom matchers and debugging hooks.

**Features**:
- ✅ Custom matchers (`toHaveValidDomainSignature`, `toReturnVoidInEventListener`)
- ✅ Automatic related file suggestions on test failures
- ✅ Pattern-based error detection with fix suggestions
- ✅ Rich error context with file locations and commands

**Usage**: Automatically loaded via `vitest.config.ts` setupFiles

### `error-examples.ts`
Documentation file showing common error patterns and their fixes.

**Covers**:
- EventBus listener return types
- Async/await vs done() callbacks
- Domain manager signature errors
- Import path errors
- Type safety patterns

**Usage**: Reference when encountering test errors or writing new tests

### `setup.test.ts`
Validation tests for custom matchers and error helpers.

## Custom Matchers

### `toHaveValidDomainSignature(expectedSignature, filePath?, line?)`

Validates function signatures match domain manager patterns.

```typescript
expect(sessionManager.createLobby).toHaveValidDomainSignature(
  'createLobby(hostName: string, lobbyName: string, options?: CreateLobbyOptions)',
  'server/domains/SessionManager.ts',
  91
);
```

**Error Output**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Domain API Signature Mismatch
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Expected: createLobby(hostName: string, lobbyName: string, ...)
Received: object
📁 See: server/domains/SessionManager.ts:91

💡 Common Fixes:
❌ manager.createLobby({hostName, lobbyName})
✅ manager.createLobby(hostName, lobbyName)
```

### `toReturnVoidInEventListener()`

Validates EventBus listeners return void (not array.push() return values).

```typescript
const handler = () => { events.push(data); };
expect(handler()).toReturnVoidInEventListener();
```

**Error Output**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  EventBus Listener Return Type Error
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Expected: void | Promise<void>
Received: number (value: 1)

💡 Fix: Wrap array.push() in a block statement

❌ Bad: eventBus.on('event', () => events.push(data));
✅ Good: eventBus.on('event', () => { events.push(data); });
```

## Automatic Debug Context

When a test fails, the `afterEach` hook automatically provides:

### 1. Related Files to Check

Based on the test file name, suggests files likely involved:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Debug Context for Failed Test
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Test: should award XP when player votes
📁 File: server/domains/EstimationManager.test.ts

📚 Related files to check:
   • server/domains/EstimationManager.ts
   • server/events/eventTypes.ts
   • server/errors/EstimationErrors.ts
```

### 2. Pattern-Based Suggestions

Detects common error patterns and provides specific fixes:

```
💡 Suggested fix:
   Use async/await instead of done() callback in Vitest tests
```

**Detected Patterns**:
- `Expected.*arguments.*but got` → Check function signature
- `Type.*is not assignable to type.*void` → Wrap array.push()
- `Cannot read.*undefined` → Add null/undefined check
- `done is not a function` → Use async/await
- `ReferenceError.*is not defined` → Missing import

### 3. Quick Commands

Provides copy-paste commands for debugging:

```
🔗 Quick commands:
   npx vitest run server/domains/EstimationManager.test.ts
   npx vitest run --grep "should award XP when player votes"
```

## Example: Full Error Flow

When a test fails with a common error:

**Before** (generic TypeScript error):
```
Error: Expected 2-3 arguments, but got 1
  at SessionManager.test.ts:42:15
```

**After** (with enhanced setup):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Debug Context for Failed Test
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Test: should create lobby with valid parameters
📁 File: server/domains/SessionManager.test.ts

📚 Related files to check:
   • server/domains/SessionManager.ts
   • server/events/eventTypes.ts
   • shared/gameEvents.ts

💡 Suggested fix:
   Check function signature - may need positional args instead of object

🔗 Quick commands:
   npx vitest run server/domains/SessionManager.test.ts
   npx vitest run --grep "should create lobby"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Error: Expected 2-3 arguments, but got 1
```

## Impact on Agentic Development

**Before Enhancement**:
1. See error: "Expected 2-3 arguments, but got 1"
2. Read test file to find failing line
3. Read SessionManager.ts to find method signature
4. Read documentation to understand usage pattern
5. Fix and re-run

**After Enhancement**:
1. See error with context and suggested fix
2. Fix immediately based on suggestion
3. Re-run with provided command

**Result**: ~50% reduction in debugging iterations

## Adding New Patterns

To add new error patterns, update `COMMON_ERROR_PATTERNS` in `setup.ts`:

```typescript
{
  pattern: /your regex pattern/i,
  suggestion: 'Your helpful suggestion here'
}
```

To add related files for new test files, update `RELATED_FILE_PATTERNS`:

```typescript
'YourManager.test.ts': [
  'server/domains/YourManager.ts',
  'server/events/eventTypes.ts'
]
```

## See Also

- `TEST_MANIFEST.md` - Complete test inventory
- `CLAUDE.MD` - Testing section with organization patterns
- `error-examples.ts` - Common error patterns and fixes
