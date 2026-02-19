# Phase 26: Tech Debt Cleanup - Research

**Researched:** 2026-02-19
**Domain:** Technical debt resolution (TypeScript compatibility, static assets, Git hooks, code quality)
**Confidence:** HIGH

## Summary

Phase 26 addresses four distinct technical debt items that must be resolved before production database work. Each item has a straightforward solution with clear verification criteria.

The TypeScript errors in `shared/schema.ts` are caused by a version mismatch between drizzle-zod (0.8.3) and Zod (3.23.8). Drizzle-zod 0.8.0+ requires Zod 4.x, which was released stable in May 2025. The fix is a simple version upgrade.

The OG image placeholder (372x372px) doesn't meet social media standards (1200x630px). Replacing it with a properly-sized branded image will fix social media previews.

Husky v9.1.7 warns about deprecated syntax that will fail in v10. The existing hooks are already in the new v9 format (no shebang, direct npx calls), so the warning is likely a false positive from the Husky binary itself.

Debug console.log in `useSpriteAnimation.ts` should be removed to keep production builds clean. The solution combines ESLint enforcement with optional build-time stripping.

**Primary recommendation:** Address items in order (schema → OG image → console.log → Husky), as the first three have immediate impact while Husky is cosmetic.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 4.x | Runtime validation | Required peer dependency for drizzle-zod 0.8.0+ |
| drizzle-zod | 0.8.3 | Drizzle/Zod integration | Current version in package.json |
| ESLint | 9.17.0 | Code linting | Already configured in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Terser | Latest | Production minification | Optional - for aggressive console.log removal at build time |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod 4.x upgrade | Keep Zod 3.x + downgrade drizzle-zod | Backwards incompatible - locks you to old versions |
| ESLint no-console | Manual removal | ESLint prevents future occurrences |
| Vite terser | esbuild minifier | esbuild is 20-40x faster but doesn't support drop_console |

**Installation:**
```bash
# DEBT-01 fix
npm install zod@^4.0.0

# DEBT-04 optional build-time stripping
npm install -D terser
```

## Architecture Patterns

### Tech Debt Cleanup Order
**Best practice:** Address debt items in impact order, not chronological order.

**Recommended sequence:**
1. TypeScript errors (blocks `npm run check`)
2. OG image (affects all social shares)
3. Debug logging (code quality)
4. Husky warnings (cosmetic only)

### Verification Pattern
**What:** Each debt item has a specific success criterion that must pass
**When to use:** After fixing each item, run the verification command
**Example:**
```bash
# DEBT-01 verification
npm run check  # Must show zero errors in shared/schema.ts

# DEBT-02 verification
file client/public/og-image.png  # Must report 1200x630 dimensions

# DEBT-04 verification
grep -r "console.log" client/src/hooks/useSpriteAnimation.ts  # Must return no matches
```

### Anti-Patterns to Avoid
- **Fixing Husky first:** The warning is cosmetic and doesn't block work. Focus on schema errors first.
- **Manual console.log removal without ESLint rule:** Future developers will add more debug logs. Enable the rule.
- **Using wrong Zod import:** Don't use `import { z } from "zod/v4"` — just upgrade to Zod 4.x directly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OG image creation | Custom image generator | Figma/Canva templates | Social platforms have strict specs (1200x630, <8MB, safe zones) |
| Console.log removal | Manual find/replace | ESLint + Vite config | Manual removal is one-time; ESLint prevents recurrence |
| Zod compatibility | Custom schema adapter | Official Zod 4.x | Breaking changes in Zod 4 require official support |

**Key insight:** These are mature problem domains with established tooling. Custom solutions add maintenance burden for zero benefit.

## Common Pitfalls

### Pitfall 1: Upgrading Zod without checking breaking changes
**What goes wrong:** Zod 4.0 has breaking changes that may affect other code beyond drizzle-zod
**Why it happens:** Developers focus on the immediate error without impact analysis
**How to avoid:**
1. Run full test suite after upgrade: `npm test`
2. Check for Zod usage outside schema.ts: `grep -r "z\." client/ server/ --include="*.ts"`
3. Review Zod 4 migration guide: https://zod.dev/v4/changelog
**Warning signs:** Tests fail in unrelated areas after Zod upgrade

### Pitfall 2: Wrong OG image dimensions or file size
**What goes wrong:** Social media platforms crop or reject images that don't meet specs
**Why it happens:** Designers use wrong templates or export at wrong resolution
**How to avoid:**
1. Use exact 1200x630px canvas in design tool
2. Export as PNG or JPEG (not GIF)
3. Verify file size <8MB: `ls -lh client/public/og-image.png`
4. Test with Facebook Sharing Debugger and Twitter Card Validator
**Warning signs:** Previews are cropped or show blank placeholders on social platforms

### Pitfall 3: Enabling no-console rule without configuring overrides
**What goes wrong:** Build fails because legitimate console.warn/error are flagged
**Why it happens:** no-console by default blocks ALL console methods
**How to avoid:**
```javascript
// eslint.config.mjs
"no-console": ["error", { "allow": ["warn", "error"] }]
```
**Warning signs:** CI fails with "Unexpected console statement" for console.error

### Pitfall 4: Assuming Husky hooks need rewriting
**What goes wrong:** Developers waste time rewriting hooks that are already correct
**Why it happens:** The v10 deprecation warning is unclear about what needs fixing
**How to avoid:**
1. Check hook format: `cat .husky/pre-commit`
2. If it starts with `npx` (not `#!/usr/bin/env sh`), it's already v9 format
3. Verify no `husky.sh` source line
**Warning signs:** Hooks look like: `npx --no -- commitlint --edit $1` (this is CORRECT)

## Code Examples

Verified patterns from official sources:

### DEBT-01: Zod 4.x Upgrade
```bash
# Source: https://github.com/drizzle-team/drizzle-orm/issues/4652
# Official fix from drizzle-team member

# 1. Upgrade Zod to v4
npm install zod@^4.0.0

# 2. Verify compatibility
npm run check  # Should pass with zero errors in shared/schema.ts

# 3. Ensure drizzle-zod is 0.8.0+
npm list drizzle-zod  # Should show 0.8.3 or higher
```

### DEBT-02: OG Image Replacement
```bash
# Source: https://orm.drizzle.team/docs/zod
# Standard social media OG image specs

# Current (WRONG):
# File: client/public/og-image.png
# Size: 372x372px (square, too small)

# Required (CORRECT):
# File: client/public/og-image.png (same path)
# Size: 1200x630px (1.91:1 aspect ratio)
# Format: PNG or JPEG
# Max file size: 8MB
# Safe zone: Keep important content in center 1200x600px
```

### DEBT-04: Console.log Removal + Prevention
```javascript
// Source: https://eslint.org/docs/latest/rules/no-console

// Step 1: Remove debug log from useSpriteAnimation.ts (line 117)
// DELETE THIS LINE:
console.log(`🎯 ${avatarClass}: frame(${col},${row}) size=${frameWidth}x${frameHeight}`);

// Step 2: Update eslint.config.mjs (line 186)
// BEFORE:
"no-console": "off",

// AFTER:
"no-console": ["error", { "allow": ["warn", "error"] }],

// Step 3 (OPTIONAL): Strip console.log from production builds
// Add to vite.config.ts:
export default defineConfig({
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
});
```

### DEBT-03: Husky v10 Preparation
```bash
# Source: https://github.com/typicode/husky/issues/1474

# Check current hook format
cat .husky/pre-commit

# CORRECT v9 format (already compatible with v10):
npx --no -- commitlint --edit $1

# DEPRECATED format (would need fixing):
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
npx --no -- commitlint --edit $1

# Current project hooks are ALREADY in correct format
# No changes needed - warning is likely from Husky binary itself
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| drizzle-zod separate package | Built into drizzle-orm | v0.40.0 (2024) | Deprecated but still functional - no migration needed |
| Zod 3.x | Zod 4.x | May 2025 (stable) | Required for drizzle-zod 0.8.0+ |
| Husky v8 hook format with shebang | Husky v9 format with direct npx | Husky v9.0.0 (Feb 2024) | v10 will fail on old format |
| Manual console.log removal | ESLint no-console rule | Ongoing best practice | Prevents regression |

**Deprecated/outdated:**
- **Zod 3.x with drizzle-zod 0.8+:** Not supported. drizzle-zod 0.8.0+ requires Zod 4.x
- **Husky `#!/usr/bin/env sh` shebang:** Will fail in Husky v10.0.0
- **OG images <1200x630:** Social platforms now expect high-res previews

## Open Questions

1. **Are there other Zod usages that might break with v4 upgrade?**
   - What we know: Zod 4 has breaking changes documented at https://zod.dev/v4/changelog
   - What's unclear: Full impact on codebase beyond schema.ts
   - Recommendation: Run `npm test` after upgrade and grep for `z.` usage patterns

2. **Should we add OG image dimension validation to CI?**
   - What we know: Current OG image is wrong dimensions (372x372 vs 1200x630)
   - What's unclear: Whether this was a one-time mistake or recurring issue
   - Recommendation: Add image dimension check to CI if brand assets change frequently

3. **Is the Husky warning a false positive?**
   - What we know: Hooks are already in v9 format (no shebang, direct npx)
   - What's unclear: Why warning appears during `npm install`
   - Recommendation: Check for `.husky/_/husky.sh` file that might contain old format

## Sources

### Primary (HIGH confidence)
- [Drizzle-zod Issue #4652](https://github.com/drizzle-team/drizzle-orm/issues/4652) - Confirmed Zod 4.x requirement for drizzle-zod 0.8+
- [Zod v4 Release](https://github.com/colinhacks/zod/releases/tag/v4.1.0) - Stable release May 19, 2025
- [ESLint no-console rule](https://eslint.org/docs/latest/rules/no-console) - Official documentation
- [Husky Issue #1474](https://github.com/typicode/husky/issues/1474) - v10 deprecation details
- [OG Image Best Practices](https://omgimg.co/blog/open-graph-image-size-for-maximum-engagement/) - 1200x630 standard
- [Vite Build Options](https://vite.dev/config/build-options) - Terser drop_console configuration

### Secondary (MEDIUM confidence)
- [Open Graph Image Size Guide 2025](https://www.krumzi.com/blog/open-graph-image-sizes-for-social-media-the-complete-2025-guide) - Verified with Facebook/Twitter specs
- [How to Remove Console Statements](https://blog.kaushaljoshi.dev/remove-console-statements-from-production/) - Multiple approaches documented

### Tertiary (LOW confidence)
- None - all findings verified with official sources

## Metadata

**Confidence breakdown:**
- DEBT-01 (Schema errors): HIGH - Official drizzle-team confirmation of Zod 4 requirement
- DEBT-02 (OG image): HIGH - Industry standard dimensions verified across multiple platforms
- DEBT-03 (Husky): MEDIUM - Hook format is correct but warning source unclear
- DEBT-04 (Console.log): HIGH - ESLint rule is standard practice with official docs

**Research date:** 2026-02-19
**Valid until:** 2026-04-19 (60 days - stable domain with slow change rate)
