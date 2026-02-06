# CSRF Protection Implementation

## Overview

Added CSRF (Cross-Site Request Forgery) protection using the Double Submit Cookie Pattern via `csrf-csrf` package (modern replacement for deprecated `csurf`).

## Implementation

### Server-side

**Middleware Stack** (server/index.ts):
1. `cookie-parser` - Parses cookies (required by csrf-csrf)
2. Session middleware
3. CSRF token generation endpoint
4. Rate limiters
5. CSRF protection middleware (applied to all POST/PUT/DELETE/PATCH requests)

**Configuration**:
```typescript
const {
  invalidCsrfTokenError,
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => sessionSecret,
  getSessionIdentifier: (req) => req.sessionID || "",
  cookieName: "x-csrf-token",
  cookieOptions: {
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
});
```

**Token Endpoint**:
- `GET /api/csrf-token` - Returns fresh CSRF token
- Sets cookie: `x-csrf-token` (HttpOnly, SameSite=lax)
- Returns: `{ csrfToken: "..." }`

**Error Handling**:
- Invalid token → 403 with user-friendly message
- Token required for: POST, PUT, DELETE, PATCH
- Token NOT required for: GET, HEAD, OPTIONS

### Client-side Integration

**Fetch CSRF token** (on app init or before mutations):
```typescript
const response = await fetch('/api/csrf-token');
const { csrfToken } = await response.json();
```

**Include in requests**:
```typescript
await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-csrf-token': csrfToken, // Required!
  },
  body: JSON.stringify({ email, password }),
});
```

**Token lifecycle**:
- Tokens are stateless (HMAC-based)
- Cookie rotation: On every token generation
- Session-bound: Tokens tied to session ID
- Expiry: Follows session cookie expiry (7 days)

## Rate Limiting

Also implemented rate limiting to prevent brute force attacks.

**Auth Endpoints** (`/api/auth/*`, `/api/profile/*`):
- 5 requests per 15 minutes
- Covers: register, login, logout, profile updates

**API Endpoints** (`/api/*`):
- 100 requests per 15 minutes
- Excludes health checks

**Headers**:
- `RateLimit-Limit`: Max requests allowed
- `RateLimit-Remaining`: Requests left in window
- `RateLimit-Reset`: Timestamp when limit resets

**Error Response**:
```json
{
  "error": "Too many authentication attempts, please try again later"
}
```

## Security Improvements

### Before
- ❌ No CSRF protection
- ❌ No rate limiting
- ❌ Vulnerable to cross-site request attacks
- ❌ Vulnerable to brute force auth attacks

### After
- ✅ Double Submit Cookie CSRF protection
- ✅ Session-bound tokens
- ✅ Rate limiting on auth and API routes
- ✅ Proper error messages
- ✅ Production-ready cookie settings

## Testing

### Manual Testing

1. **Get CSRF token**:
   ```bash
   curl http://localhost:5000/api/csrf-token \
     -c cookies.txt
   ```

2. **Try mutation without token** (should fail):
   ```bash
   curl http://localhost:5000/api/auth/login \
     -X POST \
     -H "Content-Type: application/json" \
     -b cookies.txt \
     -d '{"email":"test@test.com","password":"password"}'
   # Expected: 403 Invalid CSRF token
   ```

3. **Try mutation with token** (should succeed):
   ```bash
   TOKEN=$(curl -s http://localhost:5000/api/csrf-token -b cookies.txt | jq -r '.csrfToken')
   curl http://localhost:5000/api/auth/login \
     -X POST \
     -H "Content-Type: application/json" \
     -H "x-csrf-token: $TOKEN" \
     -b cookies.txt \
     -d '{"email":"test@test.com","password":"password"}'
   ```

4. **Test rate limiting**:
   ```bash
   for i in {1..6}; do
     curl http://localhost:5000/api/auth/login \
       -X POST \
       -H "Content-Type: application/json" \
       -H "x-csrf-token: $TOKEN" \
       -b cookies.txt \
       -d '{"email":"test@test.com","password":"wrong"}' \
       -w "\nStatus: %{http_code}\n"
   done
   # 6th request should be rate limited (429)
   ```

### Client Integration

**React example** (useEffect on mount):
```typescript
useEffect(() => {
  const fetchCsrfToken = async () => {
    const res = await fetch('/api/csrf-token');
    const { csrfToken } = await res.json();
    // Store in state or context
    setCsrfToken(csrfToken);
  };
  fetchCsrfToken();
}, []);
```

**Axios interceptor**:
```typescript
axios.interceptors.request.use((config) => {
  if (config.method !== 'get') {
    config.headers['x-csrf-token'] = csrfToken;
  }
  return config;
});
```

## Dependencies Added

- `csrf-csrf` ^4.0.3 - Modern CSRF protection (Double Submit Cookie)
- `cookie-parser` ^1.4.7 - Cookie parsing middleware
- `express-rate-limit` ^7.5.0 - Rate limiting middleware
- `@types/cookie-parser` ^1.4.7 - TypeScript types

## Migration Notes

### From No CSRF Protection

Clients MUST update to include CSRF tokens:

1. Fetch token from `/api/csrf-token` on app load
2. Include `x-csrf-token` header in all POST/PUT/DELETE/PATCH requests
3. Handle 403 errors (token expired/invalid) by refetching token and retrying

### Backwards Compatibility

- GET requests unaffected (no token required)
- OAuth flows unaffected (use redirects, not JSON API)
- Health endpoints exempt from rate limiting

## Troubleshooting

**Error: Invalid CSRF token**
- Solution: Fetch fresh token from `/api/csrf-token`
- Check cookie is being sent with request
- Verify session is valid

**Error: Too many requests**
- Solution: Wait 15 minutes or implement exponential backoff
- Check rate limit headers for reset time

**Tokens not working in production**
- Ensure `SESSION_SECRET` env var is set
- Verify `secure` cookie option (requires HTTPS)
- Check `sameSite` setting for cross-origin scenarios

## References

- [csrf-csrf GitHub](https://github.com/Psifi-Solutions/csrf-csrf)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Double Submit Cookie Pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie)
- [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)
