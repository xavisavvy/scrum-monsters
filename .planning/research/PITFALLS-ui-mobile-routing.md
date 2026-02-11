# Domain Pitfalls: JRPG UI, Mobile UX, Routing & SEO

**Domain:** UI/UX redesign for real-time multiplayer game
**Researched:** 2026-02-11

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Testing Only on Desktop/Large Screens
**What goes wrong:** UI works great on laptop, completely broken on iPhone SE. Buttons too small, text unreadable, safe areas ignored.

**Why it happens:** Developers test on their primary device (usually desktop). Mobile testing is "later." By the time it's tested, components are entrenched.

**Consequences:**
- Entire button size system needs refactoring (every component)
- Safe area retrofitting requires CSS architecture changes
- Touch targets fail accessibility, user frustration

**Prevention:**
1. **Test on smallest common device FIRST** (iPhone SE, 375px width)
2. Use browser DevTools mobile emulation during development
3. Add Playwright tests with mobile viewports (375px, 390px, 414px)
4. Make "44px minimum touch target" a linting rule
5. Real device testing before phase completion (borrow phone if needed)

**Detection:**
- Warning signs: "Looks good on my screen," no mobile screenshots in PRs
- Check: Can you tap all buttons accurately with thumb on iPhone SE simulator?
- Test: Do safe areas render correctly on iPhone with notch?

---

### Pitfall 2: Full SSR for SEO (Cloaking Penalty Risk)
**What goes wrong:** Implementing Next.js or Remix SSR to "solve SEO." Google detects different content for crawlers vs. users → cloaking penalty → deindexed.

**Why it happens:** Misunderstanding 2026 SEO landscape. SSR was solution for 2020s, but Google now penalizes serving different HTML to bots vs. users.

**Consequences:**
- Google deindexes site for cloaking
- Major architecture migration (Vite SPA → Next.js)
- SSR adds server complexity for minimal SEO benefit (game sites don't rank on content)
- Social sharing still requires separate solution

**Prevention:**
1. **Social crawler middleware ONLY** (Twitter, Discord, Slack bots)
2. Serve SPA HTML to Google and real users
3. Use meta tags for social sharing, not search ranking
4. Understand: Games rank on backlinks/engagement, not on-page SEO
5. If considering SSR, verify it's not for SEO (it should be for performance, not crawlers)

**Detection:**
- Warning signs: "We need SSR for Google," "SEO is critical for game discovery"
- Check: Are you serving different HTML to bots vs. users?
- Test: Does user-agent switching change HTML structure?

---

### Pitfall 3: Hash Routing Instead of Browser Routing
**What goes wrong:** Using HashRouter (`/#/lobby/abc123`) instead of BrowserRouter (`/lobby/abc123`). URLs break social sharing, look unprofessional, can't do server-side meta tag injection.

**Why it happens:** HashRouter is easier (no server configuration). Developer doesn't realize it breaks SEO/social sharing until too late.

**Consequences:**
- Social crawler middleware can't work (can't detect route from URL hash)
- URLs look broken when shared (e.g., `scrumquest.com/#/lobby/abc123`)
- Can't use Express routing to inject meta tags
- Migration requires changing all route definitions

**Prevention:**
1. **Use BrowserRouter from day 1**
2. Configure server to serve index.html for all routes
3. Add catch-all route in Express: `app.get('*', (req, res) => res.sendFile('index.html'))`
4. Understand tradeoff: BrowserRouter needs server config, but worth it for clean URLs

**Detection:**
- Warning signs: URLs contain `#` before path, server returns 404 on refresh
- Check: Can you share `/lobby/abc123` directly without hash?
- Test: Does refreshing a deep route (e.g., `/lobby/abc123`) work?

---

### Pitfall 4: UI Sound Effects Without Volume Control
**What goes wrong:** Adding sound effects to every button. Users in meetings get startled. No volume control → users mute tab → miss important game audio.

**Why it happens:** Sound effects added for "juice," volume control considered "later." Users can't disable before it annoys them.

**Consequences:**
- Users mute entire tab/browser
- Negative first impression (sounds in meeting/library)
- Accessibility issues (sensory sensitivity)
- Rework audio system to add volume sliders

**Prevention:**
1. **Add volume controls BEFORE any sound plays**
2. Default to muted or low volume (user opts IN to audio)
3. Respect user's system volume/mute state
4. Separate sliders: Master, SFX, Music
5. Persist volume settings to localStorage

**Detection:**
- Warning signs: Audio plays on page load, no visible volume control
- Check: Can user mute sounds without muting browser tab?
- Test: Do volume settings persist across sessions?

---

### Pitfall 5: Pixel-Perfect Animation Timing Without Playtesting
**What goes wrong:** Setting all animations to 250ms because "research says 100-500ms." Feels too slow for some actions, too fast for others. Robotic, not game-like.

**Why it happens:** Following guidelines without feeling. Animations tuned on developer's machine (high FPS), not tested on mobile (lower FPS).

**Consequences:**
- Phase transitions feel sluggish or jarring
- Button feedback doesn't match user expectation
- Animations run differently on 60Hz vs. 120Hz displays
- Rework all transition timings after user feedback

**Prevention:**
1. **Vary timing based on action importance:**
   - Fast feedback: 100ms (button press acknowledgment)
   - Normal transitions: 250ms (phase changes)
   - Dramatic moments: 500ms (victory screen)
2. Test on 60Hz displays (most common)
3. Playtest with real users: "Does this feel responsive?"
4. Use easing curves (easeOut for entrances, easeIn for exits)
5. Mobile devices: Test on actual phones, not just simulators

**Detection:**
- Warning signs: All transitions same duration, no easing curves
- Check: Do animations feel responsive or laggy?
- Test: 60 FPS on mobile device during animations?

---

## Moderate Pitfalls

### Pitfall 6: Hardcoded Theme Values
**What goes wrong:** Using `#d4af37` (gold) directly in components instead of `var(--jrpg-frame-primary)`. Theme changes require finding/replacing all instances.

**Prevention:**
- Define all colors, sizes, borders in CSS custom properties
- Lint rule: No hex colors in component files
- Use design tokens from day 1

---

### Pitfall 7: Not Handling Orientation Changes
**What goes wrong:** UI designed for landscape, breaks when user rotates to portrait. Buttons overlap, text clips, layout shifts.

**Prevention:**
- Test both orientations during development
- Use CSS media queries for orientation-specific styles
- Don't force lock orientation (frustrating UX)
- Gracefully adapt: lobby works portrait, battle suggests landscape

---

### Pitfall 8: Assuming Safe Areas Are Static
**What goes wrong:** Calculating safe area insets once on mount. User rotates device → insets change → UI overlaps notch/home gesture.

**Prevention:**
- Use CSS `env()` which updates dynamically
- Listen to orientation change events if using JS detection
- Test on physical device with notch

---

### Pitfall 9: Loading All Audio Assets Upfront
**What goes wrong:** Preloading 10MB of sound effects on lobby load. Mobile users on 3G wait 30 seconds for page load.

**Prevention:**
- Lazy load audio per phase (lobby sounds → load in lobby)
- Use audio sprites (combine related sounds)
- Compress audio (Opus codec for web)
- Show loading state while critical audio loads

---

### Pitfall 10: Overly Complex JRPG Frames
**What goes wrong:** Pixel-perfect borders with 10 layers of SVG/canvas. Looks amazing, tanks mobile frame rate.

**Prevention:**
- Start simple: CSS borders with border-image
- Profile frame rate during animations
- Progressive enhancement: fancy frames on desktop, simple on mobile
- Target: 60 FPS during phase transitions

---

## Minor Pitfalls

### Pitfall 11: Missing Haptic Feedback Fallback
**What goes wrong:** `navigator.vibrate()` throws error on desktop. Unhandled exception.

**Prevention:** Check `navigator.vibrate` exists before calling.

---

### Pitfall 12: Meta Tags Only in React Helmet
**What goes wrong:** Social crawlers don't execute JS → never see meta tags.

**Prevention:** Server-side middleware injects tags for crawlers.

---

### Pitfall 13: Touch Events on Non-Touch Devices
**What goes wrong:** Adding touch event listeners on desktop. Breaks mouse interactions.

**Prevention:** Use React's onClick (handles both). Let browser abstract input.

---

### Pitfall 14: Forgetting viewport-fit=cover
**What goes wrong:** Safe area insets don't work. Missing meta tag.

**Prevention:** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`

---

### Pitfall 15: No Loading State for Route Transitions
**What goes wrong:** Clicking lobby link → blank screen for 2 seconds → lobby appears. Feels broken.

**Prevention:** Suspense boundaries with loading fallback.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Phase 1: JRPG Theme** | Hardcoded theme values, inconsistent borders across components | CSS custom properties, component library, design review |
| **Phase 2: Mobile UX** | Desktop-only testing, safe areas ignored, touch targets too small | Mobile-first testing, 44px minimum enforced, real device validation |
| **Phase 3: Routing/SEO** | Hash routing, full SSR attempt, missing crawler middleware | BrowserRouter from start, social crawlers only, no Google SSR |
| **Phase 4: Lobby Polish** | Sound without volume control, animation timing not playtested | Volume sliders first, playtest timings, varied durations |

## Cross-Cutting Concerns

### Performance Budget
- **Risk:** JRPG frames + animations + audio = slow mobile load
- **Mitigation:** Lighthouse mobile score > 90, lazy load non-critical assets
- **Detection:** Run Lighthouse on every PR

### Accessibility
- **Risk:** Ornamental frames hide focus indicators, color-only state
- **Mitigation:** Visible focus states, ARIA labels, don't rely only on color
- **Detection:** Keyboard navigation testing, screen reader spot-checks

### Backward Compatibility
- **Risk:** View Transitions API, CSS env() don't work on older browsers
- **Mitigation:** Feature detection, fallbacks (Framer Motion, fixed padding)
- **Detection:** Test on Safari 15, Chrome 90 (older but still used)

## Testing Checklist

Before claiming "mobile-ready":
- [ ] Tested on iPhone SE (375px width)
- [ ] Tested in landscape and portrait
- [ ] All buttons meet 44px minimum
- [ ] Safe areas respected (notch, home gesture, rounded corners)
- [ ] Works offline (WebSocket reconnection tested)
- [ ] Volume controls functional before sounds play
- [ ] Meta tags visible to Twitter/Discord crawlers
- [ ] Clean URLs (no hash routing)
- [ ] 60 FPS during animations on mid-range phone
- [ ] Audio loads in < 2 seconds on 3G

## Red Flags During Code Review

| Red Flag | What It Means | Fix |
|----------|---------------|-----|
| `position: fixed` without safe area padding | Will overlap notch/home gesture | Add `env(safe-area-inset-*)` |
| `min-width: 32px` on buttons | Touch target too small | Increase to 44px minimum |
| `<HashRouter>` in code | URLs will have hashes | Switch to `<BrowserRouter>` |
| `playSound()` with no volume check | Audio plays at full volume | Add volume control first |
| Hardcoded colors in JSX | Theme changes = find/replace nightmare | Use CSS custom properties |
| SSR for "SEO" in proposal | Cloaking risk, overkill | Social crawler middleware only |
| All transitions `duration: 0.25s` | Robotic, not playtested | Vary by action, playtest |
| No `<Helmet>` in route components | Missing meta tags | Add per route |
| Desktop-only screenshots in PR | Not tested on mobile | Require mobile screenshots |

## Sources

**Mobile UX Pitfalls:**
- [Best Practices for Game UI/UX Design](https://genieee.com/best-practices-for-game-ui-ux-design/)
- [7 Crucial Mobile Game UI/UX Principles to Follow](https://sunday.gg/7-crucial-mobile-game-ui-ux-principles-to-follow/)
- [Touch Control Design: Ways Of Playing On Mobile](https://mobilefreetoplay.com/control-mechanics/)

**SEO & Routing Pitfalls:**
- [React SEO Guide: SSR, Performance & Rankings (2026)](https://www.linkgraph.com/blog/seo-for-react-applications/)
- [7 Common SPA SEO Challenges and Solutions](https://prerender.io/blog/spa-javascript-seo-challenges-and-solutions/)
- [How to Make a React Website SEO-Friendly in 2025](https://www.creolestudios.com/how-to-make-react-website-seo-friendly/)

**Audio & Animation Pitfalls:**
- [Lessons learned in audio feedback for game and app design](https://medium.com/@fernando1lins/lessons-learned-in-audio-feedback-for-game-and-app-design-e4818c9b72fd)
- [Motion UI Trends 2026](https://lomatechnology.com/blog/motion-ui-trends-2026/2911)

**Performance Pitfalls:**
- [Building Games that Run on Poor Mobile Connections](https://www.gamedeveloper.com/programming/building-games-that-run-on-poor-mobile-connections)
- [Handling Latency and Performance Challenges in Real-Time Apps](https://erbis.com/blog/real-time-apps/)
