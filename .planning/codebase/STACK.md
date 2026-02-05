# Technology Stack

**Analysis Date:** 2026-02-01

## Languages

**Primary:**
- **TypeScript** 5.6.3 - Full stack (client, server, shared types)

**Secondary:**
- **JavaScript** - Configuration files and build tooling

## Runtime

**Environment:**
- **Node.js** - Server runtime (no specific version pinned, defaults to latest LTS)
- **Browser** - Client runtime (React 18.3.1 with Vite)

**Package Manager:**
- **npm** - Version management via package-lock.json (present in repo)

## Frameworks

**Core:**
- **Express.js** 4.21.2 - HTTP server and REST API
- **React** 18.3.1 - Frontend UI framework
- **Vite** 6.3.6 - Frontend build tool and dev server
- **Socket.IO** 4.8.1 - Real-time WebSocket communication (server and client)

**3D & Graphics:**
- **Three.js** 0.170.0 - 3D WebGL rendering engine
- **@react-three/fiber** 8.18.0 - React renderer for Three.js
- **@react-three/drei** 9.122.0 - Three.js helpers and utilities
- **Pixi.js** 8.8.1 - 2D WebGL renderer (alternative to Three.js)
- **postprocessing** 6.36.0 - Post-processing effects for Three.js

**State Management:**
- **Zustand** 5.0.3 - Lightweight client-side state management
- **@tanstack/react-query** 5.60.5 - Server state and data fetching

**UI Components:**
- **Radix UI** (extensive collection) - Headless component library (accordion, dialog, dropdown, select, tabs, etc.)
- **Tailwind CSS** 3.4.14 - Utility-first CSS framework
- **tailwindcss-animate** 1.0.7 - Animation utilities for Tailwind
- **class-variance-authority** 0.7.0 - CSS class composition
- **tailwind-merge** 2.5.4 - Intelligent class merging
- **embla-carousel-react** 8.3.0 - Headless carousel component

**Forms & Validation:**
- **react-hook-form** 7.53.1 - Form state management
- **Zod** 3.23.8 - TypeScript-first schema validation
- **drizzle-zod** 0.7.0 - Zod schema generation from Drizzle ORM

**Animations & Visual Effects:**
- **Framer Motion** 11.13.1 - React animation library
- **GSAP** 3.12.5 - JavaScript animation library
- **react-confetti** 6.4.0 - Confetti animation component
- **react-useanimations** 2.10.0 - Reusable animation components

**Audio:**
- **howler** 2.2.4 - Web audio API wrapper

**Charts & Data Viz:**
- **recharts** 2.13.0 - React charting library
- **react-leaflet** 4.2.1 - Map integration (Leaflet for React)

**Utilities:**
- **date-fns** 3.6.0 - Date manipulation
- **clsx** 2.1.1 - Conditional className builder
- **cmdk** 1.0.0 - Command palette component
- **lucide-react** 0.453.0 - Icon library
- **react-syntax-highlighter** 15.5.0 - Code syntax highlighting
- **react-qr-code** 2.0.18 - QR code generation
- **react-helmet-async** 2.0.5 - Head tag management
- **sonner** 1.7.1 - Toast notifications
- **vaul** 1.1.0 - Drawer component

**Testing:**
- **Vitest** 4.0.17 - Unit/integration test runner
- **@vitest/coverage-v8** 4.0.17 - Coverage reporting
- **@testing-library/react** 16.3.1 - React component testing utilities
- **@testing-library/jest-dom** 6.9.1 - DOM matchers
- **happy-dom** 20.3.1 - Lightweight DOM implementation for tests

**Build & Development:**
- **esbuild** 0.25.0 - JavaScript bundler (used for server build)
- **tsx** 4.19.1 - TypeScript executable runner (for dev server)
- **vite-plugin-react** 4.3.2 - React plugin for Vite
- **vite-plugin-glsl** 1.3.1 - GLSL shader support in Vite
- **@replit/vite-plugin-runtime-error-modal** 0.0.3 - Runtime error overlay

**Authentication & Security:**
- **Passport.js** 0.7.0 - Authentication middleware
- **passport-local** 1.0.0 - Local username/password strategy
- **passport-google-oauth20** 2.0.0 - Google OAuth 2.0 strategy
- **passport-github2** 0.1.12 - GitHub OAuth strategy
- **bcryptjs** 3.0.3 - Password hashing
- **express-session** 1.18.2 - Session management

**Database:**
- **Drizzle ORM** 0.39.1 - TypeScript ORM (database-agnostic)
- **drizzle-kit** 0.31.4 - Drizzle schema management and migrations
- **postgres** 3.4.8 - PostgreSQL client (native protocol support)
- **@neondatabase/serverless** 0.10.4 - Serverless PostgreSQL client
- **connect-pg-simple** 10.0.0 - PostgreSQL session store for express-session

**Caching:**
- **@upstash/redis** 1.36.1 - Serverless Redis client (cloud-based caching)
- **ioredis** 5.9.2 - Traditional Redis client (optional)
- **memorystore** 1.6.7 - In-memory session store (fallback)

**AI/ML:**
- **openai** 5.19.1 - OpenAI API client

**Routing:**
- **react-router-dom** 6.26.0 - Client-side routing
- **wouter** 3.3.5 - Minimal router library

**Code Quality:**
- **commitlint** 20.3.1 - Git commit message linting
- **@commitlint/config-conventional** 20.3.1 - Conventional commits config
- **husky** 9.1.7 - Git hooks framework
- **standard-version** 9.5.0 - Semantic versioning and changelog

**Styling & Fonts:**
- **@fontsource/inter** 5.2.5 - Inter font family
- **postcss** 8.4.47 - CSS transformation
- **autoprefixer** 10.4.20 - CSS vendor prefixes
- **tailwind-scrollbar** 3.1.0 - Tailwind scrollbar styling

**Utilities:**
- **gl-matrix** 3.4.3 - Matrix/vector math library
- **matter-js** 0.20.0 - Physics simulation engine
- **meshline** 3.3.1 - Line rendering for Three.js
- **ogl** 1.0.11 - WebGL library
- **react-haiku** 2.2.0 - Haiku animations
- **react-icons** 5.4.0 - Icon library
- **react-use-gesture** 9.1.3 - Gesture detection
- **r3f-perf** 7.2.3 - Three.js performance profiler
- **next-themes** 0.4.5 - Theme management
- **input-otp** 1.2.4 - One-time password input
- **react-day-picker** 8.10.1 - Date picker component
- **react-resizable-panels** 2.1.4 - Resizable panel layout

## Configuration

**Environment:**
- `.env.example` defines all configurable settings (can be overridden at runtime)
- Key configs:
  - `DATABASE_URL` - PostgreSQL connection string (optional, defaults to in-memory)
  - `SESSION_SECRET` - Session encryption key
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth credentials
  - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - GitHub OAuth credentials
  - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` - Serverless Redis caching
  - `PORT` - Server port (defaults to 5000)
  - `NODE_ENV` - Environment (development/production)
  - `ALLOWED_ORIGINS` - CORS whitelist (comma-separated)
  - `REPLIT_DEPLOYMENT` - Replit platform indicator

**Build:**
- `vite.config.ts` - Vite build configuration (React, GLSL shader support, asset handling for .gltf, .glb, .mp3, .ogg, .wav)
- `tsconfig.json` - TypeScript compiler options (strict mode, ES2015 target, ESNext modules)
- `drizzle.config.ts` - Drizzle ORM configuration (PostgreSQL dialect, schema location)

**CSS & Styling:**
- `tailwind.config.ts` (inferred) - Tailwind configuration
- `postcss.config.ts` (inferred) - PostCSS configuration (autoprefixer)

## Platform Requirements

**Development:**
- Node.js with npm
- TypeScript 5.6.3
- Modern browser with WebGL support (for 3D graphics)

**Production:**
- Node.js server
- PostgreSQL (optional - in-memory fallback available)
- Upstash Redis REST API (optional - Redis caching, defaults to no cache)
- HTTPS support (recommended for production session cookies)
- Replit deployment (detected via `REPLIT_DEPLOYMENT` env var) or standard Node.js hosting

## Key Deployment Targets

**Supported:**
- Replit (with special timeout configurations)
- Standard Node.js servers (HTTP/HTTPS)
- Serverless platforms (via Node.js compatibility)

**Database Flexibility:**
- Full feature parity with PostgreSQL connection
- Graceful degradation to in-memory storage when `DATABASE_URL` not set
- Session store auto-selection: PostgreSQL or in-memory based on `DATABASE_URL`

---

*Stack analysis: 2026-02-01*
