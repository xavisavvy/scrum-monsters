#!/bin/bash
# Task 1 commit - server files
cd /c/Users/Preston/git/ScrumMonsters

git add server/index.ts server/websocket.ts server/auth/passport.ts server/config/env.ts
git commit -m "refactor(32-01): strip Replit env detection from server files, harden DATABASE_URL

- Remove REPLIT_DEPLOYMENT/REPLIT_DEV_DOMAIN checks from server/index.ts
- Set fixed keepAliveTimeout=65000 and headersTimeout=66000
- Remove isReplitDeployment/isReplitPreview from server/websocket.ts (both blocks)
- Simplify invite link construction to NODE_ENV check
- Replace getCallbackURL Replit branching with OAUTH_CALLBACK_BASE_URL env var
- Change DATABASE_URL missing in production from warn to process.exit(1)
"

# Task 2 commit - client/vite/package
git rm .replit
git add vite.config.ts client/src/lib/stores/useWebSocket.tsx package.json package-lock.json
git commit -m "refactor(32-01): remove Replit plugin from Vite, strip client Replit detection, remove dead deps

- Remove @replit/vite-plugin-runtime-error-modal import and usage from vite.config.ts
- Remove isReplitProduction detection and extraHeaders from useWebSocket.tsx
- Fix hardcoded timeout to 45000 (was conditional on Replit)
- Remove @replit/vite-plugin-runtime-error-modal from devDependencies
- Remove @neondatabase/serverless from dependencies
- Delete .replit workspace config file
"

echo "Commits done"
