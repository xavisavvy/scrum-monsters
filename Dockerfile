# Multi-stage build for ScrumQuest
# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npm run build

# Stage 2: Production
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 scrumquest

# Copy built assets (includes dist/public from vite build)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install only production dependencies — devDeps (vite, esbuild, typescript, etc.)
# are not needed at runtime and are a large source of CVEs in the image.
RUN npm ci --omit=dev --legacy-peer-deps

# Copy drizzle config + schema for db:push
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/shared ./shared

# Set ownership
RUN chown -R scrumquest:nodejs /app

USER scrumquest

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

CMD ["node", "dist/index.js"]
