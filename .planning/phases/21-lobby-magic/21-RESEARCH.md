# Phase 21: Production Security Hardening - Research

**Researched:** 2026-02-17
**Domain:** Express.js security hardening, GitHub Actions permissions, Node.js cryptography
**Confidence:** HIGH

## Summary

Phase 21 closes all CodeQL code scanning alerts on a live production Express/Socket.IO application. The alerts fall into five categories: missing rate limiting on auth and API routes, missing CSRF protection on state-changing endpoints, insecure pseudo-random number generation for lobby codes and player IDs, improperly sanitized URL construction (open redirect risk), and GitHub Actions workflows missing top-level permissions blocks.

The codebase is well-structured but was built without security middleware as a priority. No rate limiting or CSRF middleware is installed. `express-rate-limit` and `csrf-sync` (the session-based CSRF option) are absent from `package.json`. The good news: `crypto` is already imported in `SessionManager.ts` for `createHmac` and `randomBytes`, so migrating away from `Math.random()` is a targeted change rather than a new dependency. The GitHub Actions fix is almost trivially small — only `rollback.yml` is missing a top-level `permissions:` block.

The app uses `express-session` with optional PostgreSQL store. This means CSRF protection should use `csrf-sync` (Synchronizer Token Pattern, stateful) rather than `csrf-csrf` (Double Submit Cookie, stateless), since the documentation for `csrf-csrf` explicitly recommends `csrf-sync` for session-based applications.

**Primary recommendation:** Install `express-rate-limit` and `csrf-sync`, replace `Math.random()` with `crypto.randomBytes()` in lobby/player ID generation, add lobbyId sanitization in `/join/:lobbyId`, and add `permissions: contents: read` at the top of `rollback.yml`. Then run CodeQL and `npm audit` to verify closure.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `express-rate-limit` | ^7.5.x (latest: 8.2.1) | Rate limiting middleware for Express | Industry standard, zero deps, TypeScript built-in |
| `csrf-sync` | latest (v4.x) | Synchronizer Token Pattern CSRF for session apps | Recommended over csrf-csrf for session-based apps |
| Node.js `crypto` | built-in | Cryptographically secure randomness | No install needed; already imported in SessionManager.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cookie-parser` | existing or install | Required by csrf-sync to read cookies | Only if not already registered — check if needed |

**Note on express-rate-limit version:** The codebase targets Node 20 (per `ci.yml`). `express-rate-limit` v7.x is the current stable major for Express 4.x apps. v8.x also works. Either is acceptable; v7.5.0+ has built-in TypeScript types.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `csrf-sync` | `csrf-csrf` | csrf-csrf uses stateless double-submit cookie pattern; documentation explicitly says to use csrf-sync with express-session |
| `csrf-sync` | `csurf` (deprecated) | csurf is deprecated and unmaintained since 2023; do not use |
| `crypto.randomBytes` | `nanoid` / `uuid` | nanoid and uuid are also cryptographically secure, but crypto is built-in with zero install cost |

**Installation:**
```bash
npm install express-rate-limit csrf-sync
```

## Architecture Patterns

### Recommended Project Structure
```
server/
├── middleware/
│   ├── rateLimiter.ts       # Rate limiter instances (auth, api, general)
│   └── csrf.ts              # CSRF middleware setup and token endpoint
├── auth/
│   ├── routes.ts            # POST /login, POST /register, POST /logout (rate-limited + CSRF)
│   └── profileRoutes.ts     # PUT /profile, PUT /display-name (rate-limited + CSRF)
├── routes.ts                # Mount middleware, register route groups
└── index.ts                 # App setup — rate limiters apply before routes
```

### Pattern 1: Rate Limiting with express-rate-limit v7

**What:** Create specific limiter instances for different route sensitivity levels, apply them before route handlers.
**When to use:** Auth endpoints (strict limits), profile mutation endpoints (moderate), general API (loose).

```typescript
// Source: https://express-rate-limit.mintlify.app/reference/configuration
import { rateLimit } from 'express-rate-limit';

// Strict: auth endpoints (brute-force protection)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,                  // max 10 attempts per window
  standardHeaders: 'draft-8', // modern RateLimit header
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skipSuccessfulRequests: false,
});

// Moderate: profile mutation endpoints
export const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

// General: all /api routes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
```

Apply in `routes.ts`:
```typescript
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/user', profileLimiter);
app.use('/api', apiLimiter);  // catch-all for /api/health etc.
```

### Pattern 2: CSRF with csrf-sync (Synchronizer Token Pattern)

**What:** Session-bound CSRF token issued at a GET endpoint, submitted as a header on state-changing requests.
**When to use:** All POST/PUT/DELETE API endpoints that change state. NOT needed for WebSocket events (not HTTP).

```typescript
// Source: https://github.com/Psifi-Solutions/csrf-sync
import { csrfSync } from 'csrf-sync';

const { generateToken, csrfSynchronisedProtection } = csrfSync({
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
});

// Expose token endpoint (GET — no protection needed)
app.get('/api/csrf-token', (req, res) => {
  const token = generateToken(req);
  res.json({ csrfToken: token });
});

// Apply CSRF protection to state-changing routes
app.use('/api/auth/login', csrfSynchronisedProtection);     // POST
app.use('/api/auth/register', csrfSynchronisedProtection);  // POST
app.use('/api/auth/logout', csrfSynchronisedProtection);    // POST
app.use('/api/user', csrfSynchronisedProtection);           // PUT routes
```

Client (React) fetches token on mount:
```typescript
// Fetch once, store in React state or Zustand, add to all mutation request headers
const { csrfToken } = await fetch('/api/csrf-token').then(r => r.json());
// On each mutation request:
headers: { 'x-csrf-token': csrfToken }
```

### Pattern 3: Cryptographically Secure Randomness

**What:** Replace `Math.random()` with `crypto.randomBytes()` for all security-sensitive identifiers.
**When to use:** Any ID that determines access control (lobby codes, player IDs, host IDs).

```typescript
// Source: Node.js docs https://nodejs.org/api/crypto.html
import { randomBytes } from 'crypto';

// Lobby code: 6-char uppercase (replaces Math.random().toString(36))
function generateLobbyCode(): string {
  // 4 bytes = 8 hex chars; slice to 6, uppercase
  return randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
}

// Player/host ID: 13-char URL-safe (replaces Math.random().toString(36))
function generatePlayerId(): string {
  return randomBytes(8).toString('hex').substring(0, 13);
}
```

**Already uses crypto:** `SessionManager.ts` already imports `randomBytes` from `crypto` (line 15) for `TOKEN_SECRET`. The change is adding it to `generateLobbyCode()` and `createLobby()` on lines 99 and 102.

`gameState.ts` also uses `Math.random().toString(36)` on lines 78, 459, 550, 1208 — these need the same fix.

**Do NOT change:** `Math.random()` in Boss AI, CombatManager game logic (positioning, damage variance, RNG for game mechanics). These are gameplay randomness, not security-sensitive.

### Pattern 4: Open Redirect Sanitization

**What:** The `/join/:lobbyId` route in `server/routes.ts` redirects to `/?join=${lobbyId}` without validating `lobbyId` format. CodeQL flags this as unvalidated redirect.
**When to use:** Any route that takes URL parameters and uses them in a redirect target.

```typescript
// Current (vulnerable):
app.get('/join/:lobbyId', (req, res) => {
  const { lobbyId } = req.params;
  res.redirect(`/?join=${lobbyId}`);  // CodeQL alert: unvalidated redirect
});

// Fixed (safe):
app.get('/join/:lobbyId', (req, res) => {
  const { lobbyId } = req.params;
  // Lobby codes are 6 uppercase alphanumeric chars; reject anything else
  if (!/^[A-Z0-9]{6}$/.test(lobbyId)) {
    return res.redirect('/?error=invalid-invite');
  }
  res.redirect(`/?join=${lobbyId}`);
});
```

The `room/:roomId` route already validates format correctly (line 106 in `routes.ts`): `!/^[a-zA-Z0-9-]{3,30}$/.test(roomId)`. Same pattern must be applied to `/join/:lobbyId`.

### Pattern 5: GitHub Actions Permissions Lockdown

**What:** Every workflow MUST have a top-level `permissions:` block. Job-level overrides are additive.
**The issue:** `rollback.yml` has permissions only at job level (line 307), not at the workflow top level. This triggers the CodeQL "Workflow does not contain permissions" alert.

The fix is to add a top-level restrictive block and keep job-level overrides for jobs that need write:

```yaml
# rollback.yml - add near top, after `concurrency:` block
permissions:
  contents: read  # Default: read-only

jobs:
  rollback:
    permissions:
      contents: write      # For git push
      pull-requests: write # For PR comments
```

**What CodeQL checks:** The query `actions/missing-workflow-permissions` flags workflows where no `permissions` key exists at the top level of the workflow. Even `permissions: {}` (deny all) satisfies the check. The recommended fix is `permissions: contents: read` as the baseline.

### Anti-Patterns to Avoid
- **Applying rate limiters after routes:** Express middleware order matters. Mount limiters BEFORE `app.use('/api/auth', authRoutes)`.
- **Global CSRF on all routes including GET:** CSRF protection should only apply to state-changing methods (POST/PUT/DELETE/PATCH). GET requests are idempotent.
- **Applying CSRF to WebSocket events:** CSRF is an HTTP-layer protection. Socket.IO events are not HTTP requests and are already origin-checked via CORS config in `websocket.ts`.
- **Replacing gameplay Math.random() with crypto:** Boss AI targeting, damage variance, and other gameplay RNG do not need crypto randomness. Only security-sensitive IDs need it.
- **Using csurf:** It was deprecated in 2023 and has known vulnerabilities. Do not use it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting | Custom IP counter with Redis/memory | `express-rate-limit` | Handles window reset, header compliance, proxy trust, bypass attempts |
| CSRF token generation/validation | Custom token store + hmac | `csrf-sync` | Constant-time comparison, session binding, proper entropy |
| Secure lobby codes | `Math.random().toString(36)` tricks | `crypto.randomBytes()` | Math.random is not cryptographically secure; predictable with enough samples |
| GitHub token security | Nothing | Explicit `permissions:` block | Automatic token scoping; CodeQL enforces this |

**Key insight:** Rate limiting and CSRF are solved problems with many edge cases (clock skew, proxy IP headers, double-spending token attacks). The value of established libraries is handling cases that will definitely be missed in hand-rolled solutions.

## Common Pitfalls

### Pitfall 1: Trust Proxy Setting for Rate Limiting
**What goes wrong:** Rate limiter sees the proxy IP (e.g., Cloudflare's IP) instead of the real client IP, causing all requests to share one limit.
**Why it happens:** Express apps behind load balancers/proxies have `x-forwarded-for` headers, but Express doesn't use them unless `trust proxy` is configured.
**How to avoid:** Check if `app.set('trust proxy', ...)` is configured in `server/index.ts`. For Kubernetes + Cloudflare (as this app uses), `app.set('trust proxy', 1)` is typically correct. Verify with the proxy hop count.
**Warning signs:** All requests from different IPs hitting the rate limit simultaneously, or limit never triggering even with high traffic from one IP.

### Pitfall 2: CSRF Token Expiry on Session Regeneration
**What goes wrong:** Session regenerates (e.g., after login), making the old CSRF token invalid. Client gets 403 on next mutation.
**Why it happens:** csrf-sync binds tokens to session ID. Session ID changes on regeneration (which is good security practice for session fixation).
**How to avoid:** The client must re-fetch the CSRF token after login/logout. The React app should call `/api/csrf-token` after auth state changes.
**Warning signs:** Users see 403 errors immediately after logging in; works fine on refresh.

### Pitfall 3: Lobby Code Collision with Crypto
**What goes wrong:** `randomBytes(4).toString('hex').substring(0, 6).toUpperCase()` generates hex chars (0-9, A-F), giving only 16^6 = 16M combinations vs 36^6 = 2B with full alphanumeric.
**Why it happens:** Hex output is only 16 characters wide. For a 6-char lobby code that humans type, this means only uppercase letters A-F plus digits.
**How to avoid:** Either accept hex-format codes (fine for this use case — lobby codes are temporary), or use base32/base36 encoding. The simplest secure approach that preserves the existing uppercase alphanumeric format:
```typescript
const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateLobbyCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes).map(b => charset[b % 36]).join('');
}
```
**Warning signs:** Users complain about confusing codes (e.g., hex gives codes like "B3A4F2" — actually fine for display).

### Pitfall 4: Rate Limiter Blocking OAuth Redirects
**What goes wrong:** OAuth callback routes (`/api/auth/google/callback`, `/api/auth/github/callback`) get rate-limited during normal OAuth flow.
**Why it happens:** All `/api/auth/*` routes get the auth limiter if applied broadly.
**How to avoid:** Apply the strict `authLimiter` only to `/api/auth/login` and `/api/auth/register` (the brute-force targets). OAuth callback routes should use the general `apiLimiter` or no limiter at all.
**Warning signs:** OAuth login fails with 429 after a few attempts within 15 minutes.

### Pitfall 5: CSRF Double-Apply on Read Routes
**What goes wrong:** Applying `csrfSynchronisedProtection` to `app.use('/api/user')` blocks GET `/api/user/profile` because the middleware runs on all methods.
**Why it happens:** `app.use()` applies middleware to all HTTP methods.
**How to avoid:** csrf-sync's `csrfSynchronisedProtection` by default ignores safe methods (GET, HEAD, OPTIONS). Verify this in the csrf-sync docs/source before applying broadly.
**Warning signs:** GET requests to profile return 403.

## Code Examples

Verified patterns from official sources:

### express-rate-limit v7 — TypeScript Setup
```typescript
// Source: https://express-rate-limit.mintlify.app/reference/configuration
import { rateLimit, Options } from 'express-rate-limit';
import type { Request } from 'express';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  // Skip rate limiting in test environment
  skip: (req: Request) => process.env.NODE_ENV === 'test',
});
```

### csrf-sync — Session-Based Setup
```typescript
// Source: https://github.com/Psifi-Solutions/csrf-sync
import { csrfSync } from 'csrf-sync';

const { generateToken, csrfSynchronisedProtection } = csrfSync({
  // Read token from header (SPA pattern — not form body)
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
  // Optional: token size (default 128 bits)
  size: 128,
  // Optional: error response
  errorConfig: {
    statusCode: 403,
    message: 'CSRF validation failed',
  },
});

export { generateToken, csrfSynchronisedProtection };
```

### crypto.randomBytes — Lobby Code Generation
```typescript
// Source: Node.js crypto documentation
import { randomBytes } from 'crypto';

// 6-char lobby code with full alphanumeric charset
const LOBBY_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateLobbyCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes)
    .map(b => LOBBY_CODE_CHARSET[b % LOBBY_CODE_CHARSET.length])
    .join('');
}

// Player/host ID (13 hex chars = 6.5 bytes)
function generatePlayerId(): string {
  return randomBytes(8).toString('hex').substring(0, 13);
}
```

### GitHub Actions — Rollback Workflow Fix
```yaml
# Add after concurrency block in rollback.yml
permissions:
  contents: read   # Baseline: read-only

jobs:
  execute-rollback:
    permissions:
      contents: write      # Needed: git push for rollback
      pull-requests: write # Needed: PR comments/notifications
```

### Open Redirect Fix for /join/:lobbyId
```typescript
// server/routes.ts
app.get('/join/:lobbyId', (req, res) => {
  const { lobbyId } = req.params;
  // Validate: 6 uppercase alphanumeric chars (matches generateLobbyCode output)
  if (!/^[A-Z0-9]{6}$/.test(lobbyId)) {
    return res.redirect('/?error=invalid-invite');
  }
  res.redirect(`/?join=${encodeURIComponent(lobbyId)}`);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `csurf` npm package | `csrf-sync` or `csrf-csrf` | 2023 (csurf deprecated) | csurf has CVEs; must migrate to maintained alternatives |
| `Math.random()` for IDs | `crypto.randomBytes()` | Always best practice | CodeQL flags insecure randomness in security-sensitive contexts |
| Broad `write` permissions on all GH Actions jobs | Least-privilege per job | GitHub Actions security guidelines 2022+ | CodeQL scans workflows and flags missing/broad permissions |
| No permissions block | Explicit `permissions: contents: read` | GitHub default changed Feb 2023 | Repos created before Feb 2023 had read-write defaults |

**Deprecated/outdated:**
- `csurf`: Deprecated 2023, unmaintained, do not use. Replaced by `csrf-sync` (session) or `csrf-csrf` (stateless).
- `Math.random()` for security tokens: Always was wrong but CodeQL now explicitly flags it in Node.js security analysis.

## Open Questions

1. **Does csrf-sync require cookie-parser?**
   - What we know: csrf-csrf requires cookie-parser. csrf-sync uses session storage, not cookies for the token.
   - What's unclear: Whether csrf-sync still needs cookie-parser as a peer dependency or if express-session is sufficient.
   - Recommendation: Check csrf-sync README. If no cookie-parser needed, skip installing it. The app does not currently have cookie-parser installed.

2. **What are all 16 CodeQL alerts?**
   - What we know: The phase description mentions "16 CodeQL alerts" but we can only identify the categories from the success criteria: rate limiting, CSRF, insecure randomness, open redirect, GitHub Actions permissions.
   - What's unclear: Whether there are other alert types not listed (e.g., SQL injection, prototype pollution, path traversal).
   - Recommendation: Run CodeQL locally or check GitHub Security tab before planning sub-plans. Plan 21-03 (secure randomness and URL sanitization) may need expanding if other alert types exist.

3. **Trust proxy configuration for rate limiting**
   - What we know: App is deployed on Kubernetes behind Cloudflare. `index.ts` does not show `app.set('trust proxy', ...)`.
   - What's unclear: Current trust proxy setting. Without it, rate limiting may not work correctly behind the proxy.
   - Recommendation: Add `app.set('trust proxy', 1)` in `index.ts` before rate limiters are applied, and document it. Verify it doesn't break existing IP logging.

4. **CSRF and OAuth flow interaction**
   - What we know: OAuth routes (`/api/auth/google`, `/api/auth/github`) use GET (initiation) and GET callback. POST state-changing routes are `/login`, `/register`, `/logout`.
   - What's unclear: Whether the OAuth callback changes session state in a way that invalidates the CSRF token before the client can re-fetch it.
   - Recommendation: Exclude OAuth routes from CSRF protection (they use `state` parameter for CSRF at the OAuth level). Apply CSRF only to `/login`, `/register`, `/logout`, and `/api/user/*` mutations.

## Sources

### Primary (HIGH confidence)
- Node.js crypto documentation (built-in, v20) — `randomBytes()` API, entropy source
- GitHub repository: `Psifi-Solutions/csrf-sync` — installation, session usage, Synchronizer Token Pattern
- GitHub repository: `express-rate-limit/express-rate-limit` — v7/v8 configuration, TypeScript support

### Secondary (MEDIUM confidence)
- [express-rate-limit npm page](https://www.npmjs.com/package/express-rate-limit) — version 8.2.1 confirmed as latest
- [csrf-csrf GitHub](https://github.com/Psifi-Solutions/csrf-csrf) — confirmed csrf-sync recommendation for session-based apps
- [CodeQL query: actions/missing-workflow-permissions](https://codeql.github.com/codeql-query-help/actions/actions-missing-workflow-permissions/) — exact trigger condition for the GitHub Actions alert
- [GitHub Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) — least privilege permissions guidance

### Tertiary (LOW confidence)
- WebSearch results on trust proxy and rate limiting interaction — recommend validating in practice
- 16 specific CodeQL alerts not confirmed — count comes from phase description, not direct observation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm packages verified by direct repo inspection and release pages
- Architecture: HIGH — patterns drawn from official library documentation and existing codebase analysis
- Pitfalls: MEDIUM — trust proxy and CSRF token invalidation from login based on known Express patterns, not directly tested
- GitHub Actions fix: HIGH — CodeQL query documentation directly confirmed the trigger condition

**Research date:** 2026-02-17
**Valid until:** 2026-05-17 (90 days — these are stable security patterns; library APIs may change sooner)
