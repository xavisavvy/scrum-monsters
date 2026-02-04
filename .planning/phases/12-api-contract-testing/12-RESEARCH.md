# Phase 12: API Contract Testing - Research

**Researched:** 2026-02-03
**Domain:** OpenAPI/AsyncAPI contract testing, TypeScript type generation, CI validation
**Confidence:** HIGH

## Summary

API contract testing ensures that API implementations match their documented specifications through automated validation. For ScrumQuest, this involves documenting REST endpoints with OpenAPI 3.1 and WebSocket events with AsyncAPI 3.0, validating responses against these specs in CI, and generating TypeScript types from the specifications.

The standard approach uses **openapi-typescript** for type generation, **Spectral** for spec linting, and either **Schemathesis** or **express-openapi-validator** for contract testing. For WebSocket validation, **zod-sockets** provides runtime validation with AsyncAPI spec generation. This creates a single source of truth (the spec files) that drives both compile-time types and runtime validation.

The ecosystem has matured around spec-first development where OpenAPI/AsyncAPI documents serve as the contract, with types and validation generated from them rather than the reverse. This prevents documentation drift and ensures breaking changes are caught in CI before merge.

**Primary recommendation:** Use OpenAPI 3.1 spec as source of truth, generate types with openapi-typescript in CI (committed to git), validate with Spectral + Schemathesis, and use zod-sockets for Socket.IO events with AsyncAPI 3.0 documentation.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openapi-typescript | 7.x | Generate TypeScript types from OpenAPI | De facto standard, zero runtime cost, supports OpenAPI 3.0/3.1 |
| Spectral | 6.x | Lint OpenAPI/AsyncAPI specs | Stoplight's industry-standard linter, built-in rulesets |
| Schemathesis | 3.x | Property-based contract testing | Most comprehensive OpenAPI testing tool (1.4-4.5x better defect detection) |
| AsyncAPI | 3.0 | WebSocket event documentation | Official spec for async/event-driven APIs |
| zod-sockets | 4.x | Socket.IO validation + AsyncAPI generation | TypeScript-first, generates AsyncAPI 3.0 from Zod schemas |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| express-openapi-validator | 5.x | Runtime request/response validation | Development/staging validation (not for CI testing) |
| Redoc | 2.x | Static API documentation UI | Read-only documentation serving |
| Swagger UI | 5.x | Interactive API documentation UI | Interactive docs with "Try it out" |
| @redocly/cli | 1.x | OpenAPI bundling and validation | Multi-file spec management |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| openapi-typescript | openapi-typescript-codegen | Codegen generates client SDK with runtime; heavier, unmaintained fork |
| Schemathesis | Dredd | Dredd deprecated in favor of other tools, less active |
| zod-sockets | asyncapi-validator | Runtime-only validation without type generation |
| Spectral | openapi-validator (IBM) | More opinionated, less flexible custom rules |

**Installation:**
```bash
npm install --save-dev openapi-typescript @stoplight/spectral-cli @redocly/cli
npm install zod-sockets zod
pip install schemathesis  # Python-based testing tool
```

## Architecture Patterns

### Recommended Project Structure

```
.
├── specs/
│   ├── openapi.yaml              # REST API OpenAPI 3.1 spec
│   ├── asyncapi.yaml             # WebSocket AsyncAPI 3.0 spec
│   └── .spectral.yaml            # Spectral linting rules
├── shared/
│   ├── api-types.generated.ts    # Generated from OpenAPI
│   └── socket-types.ts           # Zod schemas for Socket.IO
└── server/
    ├── routes.ts                  # Express routes
    └── socketHandlers.ts          # Socket.IO handlers with zod-sockets
```

### Pattern 1: Spec-First Development (RECOMMENDED)

**What:** Write OpenAPI/AsyncAPI spec first, generate types second, implement third.

**When to use:** Always - prevents documentation drift and enables API design reviews before implementation.

**Example:**
```yaml
# specs/openapi.yaml
openapi: 3.1.0
info:
  title: ScrumQuest API
  version: 1.0.0
paths:
  /api/health:
    get:
      summary: Health check endpoint
      operationId: getHealth
      tags: [health]
      responses:
        '200':
          description: Service is healthy
          content:
            application/json:
              schema:
                type: object
                required: [status, timestamp]
                properties:
                  status:
                    type: string
                    enum: [ok]
                  timestamp:
                    type: string
                    format: date-time
```

```bash
# Generate types from spec
npx openapi-typescript specs/openapi.yaml -o shared/api-types.generated.ts
```

```typescript
// Use generated types in implementation
import type { paths } from '../shared/api-types.generated';

type HealthResponse = paths['/api/health']['get']['responses']['200']['content']['application/json'];

app.get('/api/health', (req, res) => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString()
  };
  res.json(response);
});
```

### Pattern 2: Zod-First Socket.IO with AsyncAPI Generation

**What:** Define Socket.IO event schemas with Zod, validate at runtime, generate AsyncAPI spec.

**When to use:** For WebSocket/Socket.IO events where runtime validation is critical.

**Example:**
```typescript
// Source: https://github.com/RobinTail/zod-sockets
import { withZod } from "zod-sockets";
import { z } from "zod";

// Define emission schemas (outgoing events)
const emissions = {
  lobby_updated: z.tuple([
    z.object({
      lobbyId: z.string(),
      players: z.array(z.object({
        id: z.string(),
        name: z.string(),
      })),
    }),
  ]),
};

// Create actions factory
const actionsFactory = new ActionsFactory(emissions);

// Define action with input validation
const joinLobbyAction = actionsFactory.build({
  input: z.object({
    lobbyId: z.string(),
    playerName: z.string().min(1).max(50),
  }),
  handler: async ({ input, client }) => {
    // Input is type-safe and validated
    const { lobbyId, playerName } = input;
    // ... join lobby logic
    client.emit("lobby_updated", { lobbyId, players: [...] });
  },
});

// Generate AsyncAPI spec
const spec = new Documentation({
  title: "ScrumQuest WebSocket API",
  version: "1.0.0",
  description: "Real-time multiplayer scrum poker events",
  servers: {
    production: { url: "wss://scrumquest.com", protocol: "socket.io" },
  },
})
  .addEmission("lobby_updated", emissions.lobby_updated)
  .addAction("join_lobby", joinLobbyAction)
  .getSpecAsYaml();
```

### Pattern 3: CI Validation Workflow

**What:** Multi-stage validation in GitHub Actions - lint spec, validate contracts, check type generation.

**When to use:** Every PR to prevent spec drift and breaking changes.

**Example:**
```yaml
# Source: https://vladimirgorej.com/blog/how-to-validate-openapi-definitions-in-swagger-editor-using-github-actions/
name: API Contract Testing
on: [pull_request]

jobs:
  validate-specs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Lint OpenAPI spec
      - name: Lint OpenAPI with Spectral
        uses: stoplightio/spectral-action@latest
        with:
          file_glob: 'specs/openapi.yaml'

      # Lint AsyncAPI spec
      - name: Lint AsyncAPI with Spectral
        run: |
          npm install -g @stoplight/spectral-cli
          spectral lint specs/asyncapi.yaml --ruleset asyncapi

      # Validate spec is valid OpenAPI 3.1
      - name: Validate OpenAPI spec
        uses: swaggerexpert/swagger-editor-validate@v1
        with:
          definition-file: specs/openapi.yaml

  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Start API server
      - name: Start server
        run: npm run build && npm run start &

      # Run contract tests with Schemathesis
      - name: Install Schemathesis
        run: pip install schemathesis

      - name: Run contract tests
        run: |
          schemathesis run specs/openapi.yaml \
            --base-url=http://localhost:5000 \
            --checks all \
            --hypothesis-max-examples=50

  type-generation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Generate types and check for drift
      - name: Generate TypeScript types
        run: npx openapi-typescript specs/openapi.yaml -o shared/api-types.generated.ts

      - name: Check for uncommitted changes
        run: |
          if [[ -n $(git status --porcelain shared/api-types.generated.ts) ]]; then
            echo "Generated types differ from committed types"
            git diff shared/api-types.generated.ts
            exit 1
          fi
```

### Pattern 4: Shared Error Schema

**What:** Define reusable error response schemas in OpenAPI components.

**When to use:** Consistent error handling across all endpoints.

**Example:**
```yaml
# specs/openapi.yaml
components:
  schemas:
    Error:
      type: object
      required: [message]
      properties:
        message:
          type: string
          description: Human-readable error message
        code:
          type: string
          description: Machine-readable error code
        details:
          type: object
          description: Additional error context

  responses:
    BadRequest:
      description: Invalid request parameters
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

paths:
  /api/user/profile:
    get:
      responses:
        '200':
          description: User profile
          # ... success schema
        '401':
          $ref: '#/components/responses/Unauthorized'
        '400':
          $ref: '#/components/responses/BadRequest'
```

### Anti-Patterns to Avoid

- **Code-first then spec:** Writing implementation first then backfilling docs leads to perpetual drift
- **Skipping AsyncAPI for WebSockets:** Treating WebSocket events as second-class citizens without contracts
- **Runtime validation in production:** Using express-openapi-validator in prod adds latency; CI validation sufficient
- **Not committing generated types:** Forces every developer to run generators, causes inconsistency
- **Example payloads in spec:** Examples become stale; schemas are sufficient and stay accurate
- **One massive spec file:** Split with `$ref` for maintainability (use @redocly/cli to bundle)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript types from OpenAPI | Manual type definitions | openapi-typescript | Handles discriminators, oneOf, allOf, nullable patterns correctly |
| OpenAPI spec validation | Custom JSON schema validator | Spectral | Validates spec correctness AND best practices |
| Contract testing | Custom test assertions | Schemathesis | Property-based testing finds edge cases you'd miss |
| AsyncAPI for Socket.IO | Hand-written AsyncAPI YAML | zod-sockets | Generates spec from runtime validation, single source of truth |
| Request validation | Manual parameter checking | zod (with zod-sockets) | Type-safe runtime validation with inference |
| Multi-file OpenAPI specs | Manual `$ref` resolution | @redocly/cli bundle | Handles circular refs, external refs |
| API documentation UI | Custom docs site | Redoc or Swagger UI | Production-ready, handles OpenAPI 3.1 features |

**Key insight:** OpenAPI/AsyncAPI tooling has matured significantly. Custom solutions miss edge cases (discriminators, oneOf, circular refs) and create maintenance burden. The ecosystem now provides complete workflows from spec to types to validation.

## Common Pitfalls

### Pitfall 1: Documentation Drift

**What goes wrong:** OpenAPI spec becomes outdated as code changes, making it useless for validation.

**Why it happens:** Spec and implementation are separate, no enforcement that they match.

**How to avoid:**
- Make OpenAPI spec the source of truth (spec-first development)
- CI validates implementation matches spec (Schemathesis)
- Block PR merge if spec validation fails
- Generate types from spec so TypeScript compiler enforces contract

**Warning signs:**
- Tests pass but Schemathesis finds mismatches
- Developers avoid updating spec because it's "out of sync anyway"
- Frontend and backend disagree on response shapes

### Pitfall 2: Missing Error Response Definitions

**What goes wrong:** OpenAPI spec documents happy path (200 responses) but omits 4xx/5xx error schemas.

**Why it happens:** Error responses seem boilerplate, developers focus on success cases.

**How to avoid:**
- Define shared error schemas in `components/schemas`
- Create reusable error responses in `components/responses`
- Spectral rule: require 400, 401, 500 responses on all endpoints
- Document each endpoint's specific 4xx error scenarios

**Warning signs:**
- Contract tests fail on error cases
- Frontend error handling is inconsistent
- Error response shapes differ between endpoints

### Pitfall 3: Treating Spec and TypeScript as Independent Sources of Truth

**What goes wrong:** Team generates types from spec AND maintains manual types, leading to conflicts.

**Why it happens:** Unclear which is authoritative - the spec or the TypeScript types.

**How to avoid:**
- Choose ONE source of truth (recommended: OpenAPI spec for REST, Zod schemas for WebSocket)
- Generate types from source of truth (never hand-edit generated files)
- Commit generated files to git for code review visibility
- CI check fails if generated types don't match spec

**Warning signs:**
- Developers modify both spec and types for same change
- Generated types files have manual edits
- "Type generation" appears in PR review comments

### Pitfall 4: Over-Specifying with Examples Instead of Schemas

**What goes wrong:** Spec includes extensive example payloads that become stale, while schemas remain loose.

**Why it happens:** Examples feel concrete and helpful for documentation.

**How to avoid:**
- Use JSON Schema constraints (required, enum, pattern, min/max) instead of examples
- If examples are needed, generate them from schemas (not vice versa)
- Spectral rule: warn on examples without matching schema constraints

**Warning signs:**
- Examples contradict schema (e.g., example has field not in schema)
- Contract tests pass but real API returns different shapes
- Developers copy-paste examples without checking schema

### Pitfall 5: AsyncAPI 2.x vs 3.x Confusion

**What goes wrong:** Using AsyncAPI 2.x patterns (publish/subscribe) with 3.x spec version.

**Why it happens:** AsyncAPI 3.0 has breaking changes; old tutorials use 2.x terminology.

**How to avoid:**
- Use AsyncAPI 3.0 with `send`/`receive` actions (not publish/subscribe)
- Channel address is separate from channel key in v3
- Use migration guide: https://www.asyncapi.com/docs/migration/migrating-to-v3
- Spectral validates AsyncAPI version compatibility

**Warning signs:**
- Spec uses `publish`/`subscribe` operations (v2 syntax)
- Channel keys look like paths (v2 pattern)
- Tools report AsyncAPI version incompatibility

### Pitfall 6: Validating Only Responses, Not Requests

**What goes wrong:** Contract tests validate API responses match spec but ignore request validation.

**Why it happens:** Response validation seems more important; request validation feels redundant.

**How to avoid:**
- Enable request body validation in Schemathesis
- Document all request parameters (path, query, header, body)
- Use `required` property correctly in parameter definitions
- Test both valid and invalid request payloads

**Warning signs:**
- API accepts invalid requests that should be rejected
- No 400 errors in contract tests
- Parameter documentation missing in OpenAPI spec

## Code Examples

Verified patterns from official sources:

### Type Generation with openapi-typescript

```typescript
// Source: https://openapi-ts.dev/node
import openapiTS, { astToString } from "openapi-typescript";

// Generate from local file
const ast = await openapiTS(new URL("./specs/openapi.yaml", import.meta.url));
const types = astToString(ast);

// Write to file
import fs from "fs/promises";
await fs.writeFile("shared/api-types.generated.ts", types);

// Use in package.json scripts:
// "generate:types": "openapi-typescript specs/openapi.yaml -o shared/api-types.generated.ts"
```

### Using Generated Types

```typescript
// Source: https://openapi-ts.dev/introduction
import type { paths, components } from './api-types.generated';

// Extract operation types
type GetHealthResponse = paths['/api/health']['get']['responses']['200']['content']['application/json'];

// Extract schema types
type User = components['schemas']['User'];

// Extract all operation IDs
type Operations = paths['/api/health']['get'] | paths['/api/user/profile']['get'];
```

### Spectral Linting Configuration

```yaml
# Source: https://stoplight.io/open-source/spectral
# .spectral.yaml
extends:
  - spectral:oas  # OpenAPI built-in rules
  - spectral:asyncapi  # AsyncAPI built-in rules

rules:
  # Require operationId on all operations
  operation-operationId: error

  # Require descriptions
  operation-description: warn
  info-description: error

  # Require examples to match schema
  oas3-valid-schema-example: error

  # Custom rule: require error responses
  operation-error-responses:
    description: Operations must define 4xx and 5xx responses
    severity: warn
    given: $.paths[*][*]
    then:
      - field: responses
        function: schema
        functionOptions:
          schema:
            type: object
            required: ["400", "500"]
```

### Contract Testing with Schemathesis

```bash
# Source: https://schemathesis.io/
# Install
pip install schemathesis

# Run against live server
schemathesis run specs/openapi.yaml \
  --base-url=http://localhost:5000 \
  --checks all \
  --hypothesis-max-examples=100 \
  --hypothesis-seed=42

# Run specific endpoint
schemathesis run specs/openapi.yaml \
  --base-url=http://localhost:5000 \
  --endpoint=/api/health

# Generate test report
schemathesis run specs/openapi.yaml \
  --base-url=http://localhost:5000 \
  --report=junit \
  --junit-xml=schemathesis-report.xml
```

### Zod-Sockets AsyncAPI Generation

```typescript
// Source: https://github.com/RobinTail/zod-sockets
import { createServer } from "http";
import { Server } from "socket.io";
import { z } from "zod";
import { Documentatoin, ActionsFactory, withZod } from "zod-sockets";

// Define emissions (server -> client)
const emissions = {
  lobby_updated: z.tuple([
    z.object({
      lobbyId: z.string(),
      players: z.array(z.object({
        id: z.string(),
        name: z.string(),
      })),
    }),
  ]),
  error: z.tuple([z.object({ message: z.string() })]),
};

// Create actions factory
const factory = new ActionsFactory(emissions);

// Define actions (client -> server)
const joinLobby = factory.build({
  input: z.object({
    lobbyId: z.string(),
    playerName: z.string().min(1).max(50),
  }),
  output: z.object({ success: z.boolean() }),
  handler: async ({ input, client }) => {
    // Validated input is type-safe
    const { lobbyId, playerName } = input;
    // ... lobby logic
    client.emit("lobby_updated", { lobbyId, players: [] });
    return { success: true };
  },
});

// Setup Socket.IO with zod-sockets
const httpServer = createServer();
const io = new Server(httpServer);

io.on("connection", (socket) => {
  const { client } = withZod(socket, emissions);

  client.on("join_lobby", joinLobby);
});

// Generate AsyncAPI spec
const docs = new Documentation({
  title: "ScrumQuest WebSocket API",
  version: "1.0.0",
  servers: {
    local: { url: "ws://localhost:5000", protocol: "socket.io" },
  },
});

docs.addEmission("lobby_updated", emissions.lobby_updated);
docs.addEmission("error", emissions.error);
docs.addAction("join_lobby", joinLobby);

// Export as YAML
const spec = docs.getSpecAsYaml();
console.log(spec);
```

### Express OpenAPI Documentation

```typescript
// Source: https://github.com/wesleytodd/express-openapi
import express from 'express';
import { initialize } from 'express-openapi';

const app = express();

initialize({
  app,
  apiDoc: {
    openapi: '3.1.0',
    info: {
      title: 'ScrumQuest API',
      version: '1.0.0',
    },
    paths: {},
  },
  paths: './server/routes',  // Auto-discover route files
});

// In route file: server/routes/health.ts
export const GET = {
  apiDoc: {
    summary: 'Health check',
    operationId: 'getHealth',
    tags: ['health'],
    responses: {
      200: {
        description: 'Healthy',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['ok'] },
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  },
  handler: (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  },
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenAPI 2.0 (Swagger) | OpenAPI 3.1 | 2021 | JSON Schema compatibility, oneOf/anyOf support |
| openapi-typescript-codegen | openapi-typescript | 2022 | Zero runtime, type-only generation |
| AsyncAPI 2.x publish/subscribe | AsyncAPI 3.0 send/receive | 2024 | Clearer semantics, channel reusability |
| Runtime validation everywhere | CI-only contract testing | 2023-2024 | Lower prod latency, faster feedback |
| Manual type definitions | Generated from spec | 2020-2021 | Single source of truth |
| Postman/Newman | Schemathesis property-based | 2023 | 1.4-4.5x better defect detection |

**Deprecated/outdated:**
- **openapi-typescript-codegen**: Unmaintained, use openapi-typescript or @hey-api/openapi-ts instead
- **Dredd**: HTTP API testing tool, project maintenance ceased
- **AsyncAPI 2.x**: Use 3.0 for new projects (migration guide available)
- **Swagger UI 4.x**: Upgrade to 5.x for OpenAPI 3.1 support

## Open Questions

1. **Prometheus /metrics endpoint in OpenAPI?**
   - What we know: /metrics returns text/plain Prometheus format, not JSON
   - What's unclear: Whether to document in OpenAPI (non-standard content type)
   - Recommendation: Document as separate endpoint with custom `text/plain; version=0.0.4` content-type, or exclude from OpenAPI and document separately

2. **Generated file commit strategy impact on code review**
   - What we know: Committing shows changes in PRs; not committing requires all devs to generate
   - What's unclear: Whether large generated files create noise in reviews
   - Recommendation: Commit generated files, use GitHub linguist to mark as generated (`.gitattributes`)

3. **WebSocket acknowledgment validation coverage**
   - What we know: zod-sockets validates ack schemas
   - What's unclear: How comprehensive the validation is for complex ack flows
   - Recommendation: Test with ScrumQuest's existing Socket.IO ack patterns before full adoption

## Sources

### Primary (HIGH confidence)

- **openapi-typescript official docs** - https://openapi-ts.dev/introduction - Type generation patterns, Node.js API
- **Spectral GitHub** - https://github.com/stoplightio/spectral - Supports OpenAPI 2.0/3.0/3.1, AsyncAPI 2.x
- **zod-sockets GitHub** - https://github.com/RobinTail/zod-sockets - Socket.IO validation with AsyncAPI 3.0 generation
- **AsyncAPI 3.0 release notes** - https://www.asyncapi.com/blog/release-notes-3.0.0 - Breaking changes (send/receive, channel decoupling)
- **AsyncAPI migration guide** - https://www.asyncapi.com/docs/migration/migrating-to-v3 - v2 to v3 migration
- **AsyncAPI message validation** - https://www.asyncapi.com/docs/guides/message-validation - Runtime validation approaches
- **Schemathesis docs** - https://schemathesis.io/ - Property-based OpenAPI testing
- **express-openapi-validator GitHub** - https://github.com/cdimascio/express-openapi-validator - Request/response validation, OAS 3.0/3.1 support

### Secondary (MEDIUM confidence)

- **OpenAPI contract testing pitfalls** - https://www.linkedin.com/advice/0/what-some-common-pitfalls-anti-patterns-avoid-contract - Common mistakes (vague contracts, one-sided testing)
- **GitHub Actions OpenAPI validation** - https://vladimirgorej.com/blog/how-to-validate-openapi-definitions-in-swagger-editor-using-github-actions/ - CI workflow examples
- **Redoc docs** - https://redocly.com/docs/redoc - Static documentation UI, OpenAPI 3.0/3.1 support
- **Setting up Husky pre-commit** - https://dev.to/etorralbab/setting-up-an-express-api-with-typescript-and-pre-commit-hooks-using-husky-87m - Pre-commit hook patterns
- **Express OpenAPI integration** - https://github.com/wesleytodd/express-openapi - Auto-discovery route documentation

### Tertiary (LOW confidence)

- **WebSearch results on TypeScript best practices 2026** - General TypeScript + OpenAPI patterns
- **WebSearch results on AsyncAPI tools** - Ecosystem tooling overview

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools verified with official documentation and GitHub repos
- Architecture: HIGH - Patterns sourced from official docs (openapi-ts.dev, AsyncAPI, zod-sockets)
- Pitfalls: MEDIUM - Some from community sources (LinkedIn, blog posts), core issues verified across multiple sources
- Code examples: HIGH - All examples sourced from official documentation with attribution

**Research date:** 2026-02-03
**Valid until:** ~30 days (stable ecosystem, but Schemathesis and tooling actively updated)

**ScrumQuest-specific notes:**
- Current REST endpoints: /api/health, /api/ws-health, /api/auth/*, /api/user/*
- Current WebSocket events: Extensive Socket.IO events in shared/gameEvents.ts
- Existing Prometheus metrics in server/metrics.ts (custom /metrics endpoint to consider)
- Project uses TypeScript with path aliases (@/, @shared)
- GitHub Actions workflows already established (ci.yml, pr-checks.yml)
- Conventional commits enforced with commitlint/husky
