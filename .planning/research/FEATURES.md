# Feature Landscape

**Domain:** JRPG-themed UI redesign, mobile game UX, routing/SEO, and lobby magic systems for real-time multiplayer
**Researched:** 2026-02-11

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **JRPG UI Theming** |
| Stylized ornamental frames | JRPGs have distinctive menu borders - players expect frames around panels, modals, and cards | Medium | Pixel art borders, art deco patterns. CSS-based first, canvas for pixel-perfect |
| Readable busy menus | JRPG menus balance visual flash with readability - information density + style | Medium | Modern JRPGs (Persona series) show menus can be "busy" but still readable |
| Phase-consistent theming | All game phases should share visual language - inconsistent UI breaks immersion | Low | Reusable component library with theme tokens |
| UI sound effects | Every button click, menu transition, action confirmation needs audio feedback | Medium | Prevents fatigue through variation (pitch, volume). User must control volume levels |
| Smooth state transitions | UI elements animate between states (100-500ms ideal) - not instant swaps | Medium | Micro-interactions confirm actions, guide next steps |
| **Mobile Game UX** |
| Touch-friendly tap targets | Buttons must be large enough to prevent accidental taps - minimum 44x44px | Low | CRITICAL: Test on smallest phones, not just tablets |
| Safe area handling | UI must respect notches, rounded corners, home gesture zones | Medium | Portrait: top/bottom insets. Landscape: left/right + bottom insets |
| Landscape + Portrait support | Real-time games typically landscape, but lobby/menus work portrait | High | Different safe areas per orientation. Anchor points for responsive layout |
| No accidental taps | Proper spacing between interactive elements - prevent mis-taps | Low | Part of touch zone sizing |
| Lightweight UI assets | Mobile bandwidth limited - minimize heavy graphics, complex animations | Medium | Cache frequently-used assets locally. Use clean, simple designs |
| Network interruption UX | WebSocket disconnects common on mobile - must notify + reconnect gracefully | High | Exponential backoff, heartbeat, message queue, visible connection status |
| **SPA Routing & SEO** |
| Unique meta tags per route | Each "page" needs distinct title, description for social sharing | Medium | React Helmet Async for dynamic meta tags |
| Open Graph tags | Social platforms expect og: tags for rich previews (image, title, description) | Low | Twitter cards + OG tags for LinkedIn, Slack, Discord |
| Clean URL structure | `/lobby/abc123` not `/#/lobby?id=abc123` - hash routing breaks SEO | Medium | React Router with BrowserRouter, not HashRouter |
| Server-side rendering OR prerendering | Social crawlers don't execute JS - meta tags must be in initial HTML | High | CRITICAL: Not for Google in 2026 (avoid cloaking). For social crawlers only |
| **Lobby Interactions** |
| Emote system | Players expect way to express emotion in waiting periods - keeps engagement up | Low | Already exists (`lobby_emote` event). Enhance visibility/UI |
| Player readiness indicator | Visual cue showing who's ready to start - prevents "waiting on who?" | Low | Checkmark, color change, animation on ready state |
| Idle animations | Characters should animate while waiting - static sprites feel dead | Medium | Idle loops, breathing animations. Don't overwhelm with constant motion |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **JRPG UI Theming** |
| Class-specific UI flourishes | UI accents reflect player's chosen class (color, icons, borders) | Medium | Persona-style personalization. Visual identity reinforcement |
| Pixel-perfect animations | Subtle pixel art animations in UI (sparkles, shimmer, transitions) | High | Requires sprite sheets, careful timing. High polish payoff |
| HP/status bars styled as JRPG | Party status display like classic JRPGs (Final Fantasy, Persona) | Medium | Health bars, status effects, turn indicators during battle |
| Battle UI phase transitions | Unique transition animations between game phases (whoosh, fade, slide) | Medium | View Transitions API in modern browsers. Fallback for older |
| **Mobile Game UX** |
| Gesture controls | Swipe to switch views, pinch to zoom, long-press for context menu | High | Not expected for real-time multiplayer, but elevates mobile feel |
| Adaptive UI density | Switch between compact (mobile) and spacious (desktop) layouts | Medium | Different component variants based on viewport size |
| Haptic feedback | Vibration on button press, attack hit, level up (mobile browsers support) | Low | Navigator Vibration API. Optional, user-controlled |
| Orientation lock hints | Suggest landscape for battle, portrait OK for lobby | Low | Inform users of optimal orientation without forcing |
| **SPA Routing & SEO** |
| Dynamic lobby OG images | Generate unique preview images per lobby (lobby name, player count, boss) | High | Server-side image generation or prerender with canvas |
| Lobby shareable cards | Beautiful, game-themed invite previews when shared on social media | Medium | High engagement - people share what looks good |
| Route-based analytics | Track page views per route (lobby, battle, victory) for insights | Low | React Router + analytics integration |
| **Lobby Interactions** |
| Charge/magic system | Hold key to charge power, release for special effects (fireworks, sparkles) | Medium | Already exists (`player_charge` event). Add visual polish |
| Emote wheel/quick chat | Radial menu or shortcuts for common emotes (thumbs up, laugh, celebrate) | Medium | Faster than typing, works during time pressure |
| Player collision/physics | Characters bounce off each other in lobby, not walk through | High | Physics engine or collision detection. Fun but non-essential |
| Spectator mode enhancements | Spectators can react, cheer, but not interfere with game | Low | Minion system exists. Add emote-only mode for spectators |
| Lobby mini-games | Optional waiting room activities (rock-paper-scissors, quick vote) | Very High | HIGH RISK: Scope creep. Only if lobby wait times are problematic |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Flash/Unity-style intros | Users want to play, not watch 10-second splash screens | Quick fade-in logo (1-2s max) or skip entirely |
| Forced tutorial on first visit | Interrupts flow, annoys returning users | Contextual help, optional tutorial link in menu |
| Auto-play music | Startles users, often inappropriate (meetings, public) | Let user initiate music. Default muted. |
| PWA install prompts | Intrusive, low conversion, users know how to install if they want | Passive "Add to Home Screen" in menu |
| Separate mobile app | Maintenance burden, fragmented user base, unnecessary for web game | Responsive design covers all devices |
| Multiple login methods | Social login increases complexity, privacy concerns, dependency on 3rd party | Anonymous join by name (current system) is perfect |
| Pixel-perfect mobile scaling | Impossible across all devices, wastes time | Fluid layouts, safe areas, tested on 3-4 representative devices |
| Complex onboarding flow | Multi-step wizards for simple multiplayer game confuse | Direct join/create lobby. Settings optional. |
| Loot boxes / IAP | Changes product nature, legal complexity, user trust issues | Keep game free, no monetization in MVP |

## Feature Dependencies

```
JRPG UI Theming
├─ Sound effects → Requires asset library, audio system
├─ State transitions → Requires animation framework (Framer Motion exists)
└─ Phase-consistent theming → Requires design system, component library

Mobile UX
├─ Safe areas → Requires viewport detection, CSS custom properties
├─ Touch targets → Requires button size audit across all phases
├─ Network interruption UX → Depends on WebSocket reconnection (EXISTS in shared/gameEvents.ts)
└─ Lightweight assets → Requires asset optimization, lazy loading

SPA Routing & SEO
├─ Meta tags → Requires React Helmet Async
├─ Server-side rendering → MAJOR: Requires SSR setup (Vite SSR or framework switch)
│   └─ Alternative: Middleware for social crawlers only (Vercel Edge)
└─ Clean URLs → Requires React Router update (if using hash routing)

Lobby Interactions
├─ Charge/magic system → Server events EXIST, need UI polish
├─ Emote system → Server events EXIST (`lobby_emote`, `battle_emote`)
└─ Idle animations → Requires sprite sheets or CSS animations
```

## MVP Recommendation

Prioritize **Table Stakes** first. These are expected behaviors that will make or break the user experience.

### Phase 1: JRPG UI Foundation (table stakes only)
1. Ornamental frames/borders on all panels
2. UI sound effects (button clicks, phase transitions)
3. Smooth state transitions (100-500ms animations)
4. Phase-consistent theming (design tokens, component library)
5. JRPG-styled health/status bars

### Phase 2: Mobile UX Critical Path (table stakes only)
1. Touch-friendly tap targets (44px minimum, test on small phones)
2. Safe area handling (notches, rounded corners, home gesture)
3. Landscape + Portrait support with responsive anchors
4. Network interruption UX (reconnection already built, add visible status)
5. Lightweight asset optimization

### Phase 3: Routing & SEO Essentials (table stakes only)
1. React Router with clean URLs (BrowserRouter)
2. React Helmet Async for dynamic meta tags
3. Open Graph + Twitter cards
4. Social crawler middleware (NOT full SSR - avoid cloaking penalty)

### Phase 4: Lobby Polish (table stakes + one differentiator)
1. Enhanced emote UI (already built, make more visible)
2. Player readiness indicators
3. Idle animations
4. **Differentiator:** Charge/magic system polish (events exist, add visuals)

### Defer to Post-MVP
- Class-specific UI flourishes (differentiator, not critical)
- Gesture controls (differentiator, complex)
- Dynamic OG images (differentiator, requires server-side image gen)
- Lobby mini-games (very high complexity, scope creep risk)
- Player collision physics (fun but non-essential)

## Complexity Assessment

| Category | Overall Complexity | Notes |
|----------|-------------------|-------|
| JRPG UI Theming | **Medium** | CSS + existing animation framework. Sound effects need sourcing/integration |
| Mobile UX | **Medium-High** | Safe areas straightforward. Network UX already built. Dual orientation tricky |
| SPA Routing & SEO | **High** | Social crawler middleware requires server-side logic. Full SSR is VERY HIGH |
| Lobby Interactions | **Low-Medium** | Server events already exist. UI polish is primary work |

## Integration with Existing Features

### Already Built (Leverage These)
- **WebSocket reconnection system** (`reconnect_with_token`, `LobbySync`) - Mobile network interruption UX already handled
- **Emote events** (`lobby_emote`, `battle_emote`) - Just need better UI
- **Charge system** (`player_charge`) - Server events ready, add visual polish
- **Phase transitions** (GamePhase type) - Hook into existing phase changes for animations
- **Real-time sync** (`lobby_updated`) - All state changes broadcast, UI just needs to react smoothly
- **Spectator system** (minions) - Foundation for spectator-mode enhancements

### Gaps to Fill
- **No routing** - Currently single-page, entire app in one route
- **No meta tags** - No React Helmet, no social sharing previews
- **No mobile-specific layout** - Likely responsive, but not optimized for touch/safe areas
- **No JRPG UI theming** - Functional UI, not game-themed
- **No UI sound effects** - Silent interactions
- **No idle animations** - Static lobby experience

## Success Criteria

### JRPG UI Theming
- [ ] All major panels/modals have ornamental frames
- [ ] Sound effects on all button interactions (with volume control)
- [ ] Phase transitions animate smoothly (100-500ms duration)
- [ ] Visual consistency across all phases (lobby → battle → victory)
- [ ] Health bars styled like classic JRPG party status

### Mobile UX
- [ ] All buttons meet 44x44px minimum (tested on iPhone SE sized screens)
- [ ] UI respects safe areas in both portrait and landscape
- [ ] Network disconnection shows visible status + reconnection progress
- [ ] No heavy graphics causing bandwidth issues on mobile networks
- [ ] Game playable in landscape (battle) and portrait (lobby/menus)

### SPA Routing & SEO
- [ ] Clean URLs without hash fragments (`/lobby/abc123`)
- [ ] Unique title and description per route
- [ ] Open Graph tags generate rich previews on Twitter, Discord, Slack
- [ ] Social crawler middleware serves meta tags in initial HTML (not full SSR)

### Lobby Interactions
- [ ] Emotes clearly visible to all players in lobby
- [ ] Readiness indicators show who's ready to start battle
- [ ] Character idle animations during waiting periods
- [ ] Charge/magic system has polished visual effects

## Sources

**JRPG UI Design:**
- [Let's talk about the importance of UI design in JRPG's | ResetEra](https://www.resetera.com/threads/lets-talk-about-the-importance-of-ui-design-in-jrpgs.59286/)
- [Persona devs' new JPRG has got everyone hyped about its menus | GamesRadar+](https://www.gamesradar.com/games/jrpg/persona-devs-new-jprg-has-got-everyone-hyped-about-its-menus-this-is-why-you-invest-in-ui/)
- [Game UI Database](https://www.gameuidatabase.com/)
- [Game UI Database - Player Vitals](https://www.gameuidatabase.com/index.php?tag=83&scrn=133)

**Mobile Game UX:**
- [Responsive UI design for games – Game Development Studio](https://genieee.com/responsive-ui-design-for-games/)
- [Best Examples in Mobile Game UI Designs (2026 Review)](https://pixune.com/blog/best-examples-mobile-game-ui-design/)
- [Best Practices for Game UI/UX Design – Game Development Studio](https://genieee.com/best-practices-for-game-ui-ux-design/)
- [7 Crucial Mobile Game UI/UX Principles to Follow - Sunday](https://sunday.gg/7-crucial-mobile-game-ui-ux-principles-to-follow/)
- [How do you make responsive mobile games that take safe areas into account - Unity Discussions](https://discussions.unity.com/t/how-do-you-make-responsive-mobile-games-that-take-safe-areas-into-account-and-scale-game-world-appropriately/1494290)
- [Touch Control Design: Ways Of Playing On Mobile](https://mobilefreetoplay.com/control-mechanics/)
- [Allow play in both landscape and portrait – Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/allow-play-in-both-landscape-and-portrait/)

**Real-time Latency & Network UX:**
- [7 Mobile UX/UI Design Patterns Dominating 2026](https://www.sanjaydey.com/mobile-ux-ui-design-patterns-2026-data-backed/)
- [Handling Latency and Performance Challenges in Real-Time Apps](https://erbis.com/blog/real-time-apps/)
- [How to Implement Reconnection Logic for WebSockets](https://oneuptime.com/blog/post/2026-01-27-websocket-reconnection-logic/view)
- [How to Handle WebSocket Reconnection Logic](https://oneuptime.com/blog/post/2026-01-24-websocket-reconnection-logic/view)
- [Building Games that Run on Poor Mobile Connections](https://www.gamedeveloper.com/programming/building-games-that-run-on-poor-mobile-connections)

**UI Animation & Transitions:**
- [Motion UI Trends 2026: Interactive Design & Examples](https://lomatechnology.com/blog/motion-ui-trends-2026/2911)
- [The View Transitions API And Delightful UI Animations - Smashing Magazine](https://www.smashingmagazine.com/2023/12/view-transitions-api-ui-animations-part1/)

**Audio Feedback:**
- [Ross Tregenza's 3 Essential Ingredients to Great Game UI Sound Design | A Sound Effect](https://www.asoundeffect.com/game-ui-sound-design/)
- [Lessons learned in audio feedback for game and app design | Medium](https://medium.com/@fernando1lins/lessons-learned-in-audio-feedback-for-game-and-app-design-e4818c9b72fd)

**React SPA Routing & SEO:**
- [React SEO Guide: SSR, Performance & Rankings (2026)](https://www.linkgraph.com/blog/seo-for-react-applications/)
- [How to Make a React Website SEO-Friendly in 2025 | Best Practices & Tools](https://www.creolestudios.com/how-to-make-react-website-seo-friendly/)
- [Improving React App SEO with React Helmet](https://talent500.com/blog/improve-react-seo-with-react-helmet/)
- [7 Common SPA SEO Challenges and Solutions](https://prerender.io/blog/spa-javascript-seo-challenges-and-solutions/)
- [Dynamic OG Tags for React SPA on Vercel with Serverless and Vite - VibeIt Blog](https://blog.vibeit.hr/blog/dynamic-og-tags)

**Responsive Canvas & Anchors:**
- [Responsive HTML5 Canvas Game](https://blog.sklambert.com/responsive-html5-canvas-game/)
- [Unity - Manage screen size and anchors](https://learn.unity.com/pathway/creative-core/unit/creative-core-ui/tutorial/manage-screen-size-and-anchors)
- [Designing UI for Multiple Resolutions | Unity UI](https://docs.unity3d.com/Packages/com.unity.ugui@1.0/manual/HOWTO-UIMultiResolution.html)

**Lobby & Waiting Room UX:**
- [The Lobby as a Liminal Space: How Pre-Game UX Design Shapes Player Mindset](https://kidlantis.com/the-lobby-as-a-liminal-space-how-pre-game-ux-design-shapes-player-mindset-in-online-slot-2025/)
- [Game UI Database - Pre-Game & Lobby](https://gameuidatabase.com/index.php?scrn=43)
- [Game UI Database - Chat Shortcuts & Emotes](https://www.gameuidatabase.com/index.php?scrn=113)
- [Multiplayer: Waiting Lobby | Medium](https://medium.com/@ahtashamali263/multiplayer-waiting-lobby-e652b82793b5)

**Pixel Art UI Assets:**
- [Pixel Art Game User UI Templates | GraphicRiver](https://graphicriver.net/graphics-with-pixel+art-in-game-assets/user-interfaces)
- [Top game assets tagged Pixel Art and User Interface - itch.io](https://itch.io/game-assets/tag-pixel-art/tag-user-interface)
- [User Interface (UI) Art Collection | OpenGameArt.org](https://opengameart.org/content/user-interface-ui-art-collection)
