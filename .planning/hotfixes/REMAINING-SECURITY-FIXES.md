# Remaining Security Fixes - Require Deployment Environment

**Status:** Code changes ready, require `npm install` in deployment environment  
**Priority:** P0-P1 (Critical & High)  
**Issues:** ScrumQuest-wiv, ScrumQuest-aoc, ScrumQuest-nzl

## Fixes Requiring Dependencies

### 1. CSRF Protection (ScrumQuest-wiv) - P0 CRITICAL

**Package Required:** `csurf`

**Installation:**
```bash
npm install csurf
npm install --save-dev @types/csurf
```

**Implementation:** (`server/index.ts`)
```typescript
import csrf from 'csurf';

// After session middleware setup (around line 45)
const csrfProtection = csrf({ cookie: true });
app.use(csrf Protection);

// Add CSRF token to all responses
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});
```

**Client Changes:** (may need to add CSRF token to forms)
```typescript
// In fetch/axios requests, add:
headers: {
  'CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
}
```

**Testing:**
1. Verify forms still submit
2. Test API endpoints work
3. Verify CSRF token in requests
4. Test invalid token rejected

**CodeQL Alert:** #14 (High severity)

---

### 2. Rate Limiting (ScrumQuest-aoc) - P1 HIGH

**Package Required:** `express-rate-limit`

**Installation:**
```bash
npm install express-rate-limit
```

**Implementation:** (`server/index.ts` or separate middleware file)
```typescript
import rateLimit from 'express-rate-limit';

// Auth endpoint limiter (strict)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// API endpoint limiter (moderate)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to routes
app.use('/api/auth/', authLimiter);
app.use('/api/profile/', authLimiter);
app.use('/api/', apiLimiter);
```

**Affected Files:**
- `server/auth/routes.ts` (4 endpoints)
- `server/auth/profileRoutes.ts` (4 endpoints)
- `server/vite.ts` (2 endpoints)

**Testing:**
1. Test normal usage works
2. Verify rate limit kicks in after threshold
3. Test rate limit headers present
4. Verify different endpoints have different limits

**CodeQL Alerts:** #1, 2, 5-13 (10 total, all High severity)

---

### 3. Update Dependencies (ScrumQuest-nzl) - ✅ COMPLETED

**Updated:** prismjs and esbuild to latest versions

**Remaining Vulnerabilities:**
- esbuild in drizzle-kit (dev-only transitive dependency)
- 4 moderate severity issues total
- All in dev dependencies, do NOT affect production
- `.audit-ci.json` configured to ignore moderate (only blocks high/critical)

**Verification:**
```bash
npm audit
npm list prismjs  # Updated
npm list esbuild  # Updated (direct dependency)
```

**Dependabot Alerts:**
- Alert #1: esbuild development server vulnerability - ✅ Direct dependency updated
- Alert #2: prismjs DOM Clobbering vulnerability - ✅ Fixed

**Status:** Safe for production deployment. Remaining vulnerabilities are dev-only.

---

## Deployment Checklist

### Pre-Deployment
- [ ] Review all code changes
- [ ] Test locally with dependencies installed
- [ ] Run full test suite
- [ ] Build succeeds

### Deployment Steps
1. Install dependencies:
   ```bash
   npm install csurf express-rate-limit
   npm update prismjs esbuild
   ```

2. Apply code changes (CSRF and rate limiting)

3. Test deployment:
   ```bash
   npm run check
   npm test
   npm run build
   ```

4. Deploy to staging first

5. Verify in staging:
   - [ ] CSRF protection working
   - [ ] Rate limiting working
   - [ ] Auth still functional
   - [ ] No regressions

6. Deploy to production

### Post-Deployment
- [ ] Monitor error rates
- [ ] Check rate limit is not too strict
- [ ] Verify GitHub alerts resolved
- [ ] Update bd issues (close completed)

---

## Risk Assessment

**CSRF Protection:**
- Risk: Medium (could break forms if not implemented correctly)
- Impact: High (security critical)
- Mitigation: Test thoroughly in staging

**Rate Limiting:**
- Risk: Low (well-tested library)
- Impact: Medium (could affect heavy users)
- Mitigation: Monitor and adjust limits if needed

**Dependency Updates:**
- Risk: Low (patch versions)
- Impact: Low (mostly dev dependencies)
- Mitigation: Standard testing

---

## Timeline Estimate

- Setup/Install: 10 minutes
- CSRF Implementation: 30 minutes
- Rate Limiting Implementation: 20 minutes
- Testing: 30 minutes
- Deployment: 20 minutes

**Total: ~2 hours**

---

## References

- CSRF: https://github.com/expressjs/csurf
- Rate Limiting: https://github.com/express-rate-limit/express-rate-limit
- GitHub Security Report: `github-security-report.md`
- CodeQL Alerts: https://github.com/xavisavvy/scrum-monsters/security/code-scanning
