# Contract-First Development

This document explains our contract-first API development workflow using OpenAPI and AsyncAPI specifications.

## Overview

**Contract-first** means defining API contracts (types, schemas, endpoints, events) *before* implementing them. This ensures:

- **Type safety**: Auto-generated TypeScript types from specs
- **No drift**: Specs and code stay in sync via validation
- **Better collaboration**: Agents and humans work from same source of truth
- **Documentation**: Specs serve as living documentation

## Architecture

```
specs/
  openapi.yaml      → REST API contract (12 endpoints)
  asyncapi.yaml     → WebSocket contract (Socket.IO events)
  .spectral.yaml    → Linting rules for both specs

Generates ↓

shared/
  api-types.generated.ts   ← Auto-generated from openapi.yaml
  gameEvents.ts            ← Manually maintained (validated against asyncapi.yaml)
```

## Workflow

### 1. Define the Contract First

**Before writing any implementation code:**

```bash
# Edit the spec
vim specs/openapi.yaml     # For REST endpoints
vim specs/asyncapi.yaml    # For WebSocket events

# Lint the spec
npm run lint:api-spec
npm run lint:asyncapi-spec
```

**Example: Adding a new REST endpoint**

```yaml
# specs/openapi.yaml
paths:
  /api/users/{userId}/stats:
    get:
      operationId: getUserStats
      summary: Get user statistics
      parameters:
        - name: userId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: User stats
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserStats'
```

### 2. Generate Types

```bash
# Auto-generate TypeScript types from OpenAPI spec
npm run generate:api-types

# This creates/updates shared/api-types.generated.ts
```

**Usage in code:**

```typescript
import type { paths } from '@shared/api-types.generated';

// Type for GET /api/users/{userId}/stats response
type UserStats = paths['/api/users/{userId}/stats']['get']['responses']['200']['content']['application/json'];
```

### 3. Implement Against the Contract

Now implement the endpoint/handler using the generated types:

```typescript
// server/routes/users.ts
import type { paths } from '@shared/api-types.generated';

type UserStatsResponse = paths['/api/users/{userId}/stats']['get']['responses']['200']['content']['application/json'];

app.get('/api/users/:userId/stats', async (req, res) => {
  const stats: UserStatsResponse = {
    totalGames: 42,
    wins: 30,
    // TypeScript ensures this matches the spec!
  };
  res.json(stats);
});
```

### 4. Validate Compliance

```bash
# Check that implementation matches specs
npm run validate:contracts
```

This validates:
- ✅ OpenAPI spec is valid YAML
- ✅ AsyncAPI spec is valid YAML  
- ✅ Generated types are up to date
- ⚠️  WebSocket events in `gameEvents.ts` match `asyncapi.yaml`

### 5. Pre-commit Hook

Contract validation runs automatically before every commit:

```bash
git commit -m "feat: add user stats endpoint"
# Runs:
# 1. Secret detection (gitleaks)
# 2. Contract validation ← Catches spec drift
# 3. All tests
```

**If validation fails:**

```
❌ ERROR: API types are stale
ℹ️  Run: npm run generate:api-types
```

Fix it:

```bash
npm run generate:api-types
git add shared/api-types.generated.ts
git commit --amend --no-edit
```

## WebSocket Events (AsyncAPI)

WebSocket events require **manual alignment** (no auto-generation yet).

### Process

1. **Define event in spec:**

```yaml
# specs/asyncapi.yaml
channels:
  clientToServer:
    messages:
      submitScore:
        payload:
          type: object
          properties:
            score:
              type: number
            playerId:
              type: string
```

2. **Add to TypeScript interface:**

```typescript
// shared/gameEvents.ts
export interface ClientToServerEvents {
  submit_score: (data: { score: number; playerId: string }) => void;
  // ...
}
```

3. **Validate alignment:**

```bash
npm run validate:contracts
# ⚠️ WARNING: Events in code but not in AsyncAPI spec: ...
```

**Important:** Event names use different conventions:
- **Spec**: `camelCase` (e.g., `submitScore`)
- **Code**: `snake_case` (e.g., `submit_score`)

Our validator warns about mismatches but doesn't enforce (Socket.IO uses snake_case by convention).

## CI/CD Integration

### Contract Validation Workflow

`.github/workflows/contract-validation.yml` runs on:
- PRs touching `specs/`, `shared/gameEvents.ts`, or server code
- Pushes to `main` or `develop`

**Steps:**
1. Lint OpenAPI spec
2. Lint AsyncAPI spec
3. Generate types
4. Validate compliance
5. Check for uncommitted type changes (fails if types out of sync)

### Pretest Hook

API types are auto-generated before tests:

```json
// package.json
{
  "scripts": {
    "pretest": "npm run generate:api-types --if-present"
  }
}
```

This ensures tests always run against latest contract.

### Predev Hook

Contract validation runs before starting dev server:

```json
{
  "scripts": {
    "predev": "npm run validate:contracts"
  }
}
```

Catches drift early in development loop.

## Tools & Commands

### Scripts

```bash
# Linting
npm run lint:api-spec          # Lint OpenAPI only
npm run lint:asyncapi-spec     # Lint AsyncAPI only  
npm run lint:specs             # Lint both specs

# Type generation
npm run generate:api-types     # Generate from OpenAPI spec

# Validation
npm run validate:specs         # Lint + generate (legacy)
npm run validate:contracts     # Full compliance check

# Development
npm run dev                    # Validates contracts first
npm test                       # Generates types first
```

### Manual Validation

```bash
# Check if types are stale
node scripts/validate-contract-compliance.js

# Force regeneration
npm run generate:api-types

# Compare spec with code
diff <(grep -o 'submit.*:' shared/gameEvents.ts) \
     <(grep -o 'submit.*:' specs/asyncapi.yaml)
```

## Best Practices

### For Agents

1. **Always start with the spec** when adding endpoints/events
2. **Run `npm run generate:api-types`** after editing `openapi.yaml`
3. **Check validation output** - warnings are OK, errors block commits
4. **Use generated types** in implementation (import from `@shared/api-types.generated`)
5. **Don't manually edit** `api-types.generated.ts` (it's auto-generated)

### For Humans

1. **Review spec changes carefully** in PRs (they define the contract!)
2. **Update specs first**, implementation second
3. **Keep asyncapi.yaml in sync** with `gameEvents.ts` (manual process)
4. **Run validation locally** before pushing

## Common Issues

### Types out of sync

**Symptom:**
```
⚠️ WARNING: API types are stale (spec modified after types generated)
```

**Fix:**
```bash
npm run generate:api-types
git add shared/api-types.generated.ts
```

### WebSocket event mismatch

**Symptom:**
```
⚠️ WARNING: Events in code but not in AsyncAPI spec:
  client→server: submit_score
```

**Fix:** Add to `specs/asyncapi.yaml`:
```yaml
messages:
  submitScore:  # camelCase in spec
    # ...
```

### Pre-commit hook fails

**Symptom:**
```
❌ Contract compliance validation FAILED
```

**Fix:** Check the specific error and address it:
- Regenerate types if stale
- Fix YAML syntax errors
- Add missing events to spec

**Skip hook (emergency only):**
```bash
git commit --no-verify
```

### Dev server won't start

**Symptom:**
```
> predev
> npm run validate:contracts
❌ Contract compliance validation FAILED
```

**Fix:** Same as pre-commit fix above. Server won't start until contracts are valid.

## Trade-offs

### Pros ✅

- **Zero manual type syncing** (OpenAPI → TypeScript automatic)
- **Catches drift early** (pre-commit + CI)
- **Specs are source of truth** (not code comments)
- **Better agent workflow** (clear contracts to implement against)
- **Versioning built-in** (specs in git)

### Cons ⚠️

- **WebSocket events manual** (no auto-generation for AsyncAPI → TypeScript yet)
- **Learning curve** for spec syntax (OpenAPI/AsyncAPI)
- **Extra step** when adding endpoints (spec → generate → implement)
- **Validation can be slow** (~5 sec for full compliance check)

### When to bend the rules

- **Rapid prototyping**: Skip spec, write code, backfill spec later (but before PR)
- **Internal endpoints**: Health checks, debugging endpoints don't need specs
- **One-off scripts**: Admin tools, migrations don't need contract validation

## Metrics

Track in PRs:
- **Spec-first %**: How many PRs update spec before implementation
- **Type drift incidents**: How often `api-types.generated.ts` gets out of sync
- **Validation failures**: How often pre-commit hook catches issues

## Related

- `specs/openapi.yaml` - REST API specification
- `specs/asyncapi.yaml` - WebSocket API specification
- `shared/api-types.generated.ts` - Auto-generated types
- `shared/gameEvents.ts` - WebSocket event interfaces
- `scripts/validate-contract-compliance.js` - Validation script
- `.github/workflows/contract-validation.yml` - CI validation
- `.husky/pre-commit` - Pre-commit hook with validation
