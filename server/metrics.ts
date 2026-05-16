import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from "prom-client";
import type { Request, Response, NextFunction } from "express";

/**
 * Prometheus metrics registry for ScrumQuest
 * All custom metrics should be registered here
 */
export const metricsRegistry = new Registry();

// Set default labels
metricsRegistry.setDefaultLabels({
  app: "scrumquest",
});

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "scrumquest_",
});

// ============================================
// HTTP Metrics
// ============================================

/**
 * HTTP request duration histogram
 * Tracks response time distribution for API endpoints
 */
export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

/**
 * HTTP requests total counter
 */
export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [metricsRegistry],
});

// ============================================
// Game State Metrics
// ============================================

/**
 * Number of active lobbies
 */
export const activeLobbies = new Gauge({
  name: "scrumquest_active_lobbies",
  help: "Current number of active game lobbies",
  registers: [metricsRegistry],
});

/**
 * Number of active players across all lobbies
 */
export const activePlayers = new Gauge({
  name: "scrumquest_active_players",
  help: "Current number of active players",
  registers: [metricsRegistry],
});

/**
 * Players by game phase
 */
export const playersByPhase = new Gauge({
  name: "scrumquest_players_by_phase",
  help: "Number of players by current game phase",
  labelNames: ["phase"],
  registers: [metricsRegistry],
});

// ============================================
// WebSocket Metrics
// ============================================

/**
 * Number of active WebSocket connections, labeled by socket lifecycle state.
 *
 * Labels:
 *   - state="unauthenticated_no_lobby" — connected socket, no user, no lobby
 *     (e.g. a freshly opened browser tab on the landing page, or a
 *      monitoring client that did a WS handshake without joining)
 *   - state="unauthenticated_in_lobby" — guest player in a lobby
 *   - state="authenticated_no_lobby"   — logged-in user not in a lobby
 *   - state="authenticated_in_lobby"   — logged-in user actively playing
 *
 * The sum across all label values equals the raw socket count
 * (`io.sockets.sockets.size`). Recover the legacy single-series view with
 * `sum(scrumquest_websocket_connections)`.
 *
 * Motivation (2026-05-16, debug ws-counter-idle-blue-1): the unlabeled
 * gauge sitting at 1 with `active_players=0` looked like a leak in
 * dashboards but was actually a real browser tab held open on the lobby
 * page after disconnecting from a lobby. Splitting by `state` lets the
 * dashboard distinguish "real player traffic" from "stray sockets" and
 * prevents this false alarm from recurring.
 */
export const websocketConnections = new Gauge({
  name: "scrumquest_websocket_connections",
  help: "Current number of active WebSocket connections, labeled by lifecycle state",
  labelNames: ["state"],
  registers: [metricsRegistry],
});

const WS_STATES = [
  "unauthenticated_no_lobby",
  "unauthenticated_in_lobby",
  "authenticated_no_lobby",
  "authenticated_in_lobby",
] as const;
type WsState = (typeof WS_STATES)[number];

// Initialize all label permutations to 0 so dashboards have stable series
// from process start (avoids "no data" panels for buckets that haven't
// seen traffic yet).
for (const state of WS_STATES) {
  websocketConnections.labels({ state }).set(0);
}

/**
 * WebSocket messages received
 */
export const websocketMessagesReceived = new Counter({
  name: "scrumquest_websocket_messages_received_total",
  help: "Total WebSocket messages received",
  labelNames: ["event_type"],
  registers: [metricsRegistry],
});

/**
 * WebSocket messages sent
 */
export const websocketMessagesSent = new Counter({
  name: "scrumquest_websocket_messages_sent_total",
  help: "Total WebSocket messages sent",
  labelNames: ["event_type"],
  registers: [metricsRegistry],
});

// ============================================
// Game Action Metrics
// ============================================

/**
 * Votes submitted counter by team
 */
export const votesSubmitted = new Counter({
  name: "scrumquest_votes_submitted_total",
  help: "Total number of votes submitted",
  labelNames: ["team"],
  registers: [metricsRegistry],
});

/**
 * Boss battles completed counter
 */
export const bossDefeated = new Counter({
  name: "scrumquest_boss_defeated_total",
  help: "Total number of bosses defeated",
  registers: [metricsRegistry],
});

/**
 * Lobbies created counter
 */
export const lobbiesCreated = new Counter({
  name: "scrumquest_lobbies_created_total",
  help: "Total number of lobbies created",
  registers: [metricsRegistry],
});

/**
 * WebGL context-loss events reported by clients. Each loss is a single
 * canvas dropping its GL context (tab-backgrounded, GPU pressure, driver
 * TDR, extension interference, etc.). The `recovered` label is set to
 * `true` when the matching `webglcontextrestored` event fires within
 * the same tab before the page is reloaded.
 */
export const webglContextLossTotal = new Counter({
  name: "scrumquest_webgl_context_loss_total",
  help: "Total client-reported WebGL context-loss events",
  labelNames: ["recovered"],
  registers: [metricsRegistry],
});

/**
 * Game sessions completed counter
 */
export const gamesCompleted = new Counter({
  name: "scrumquest_games_completed_total",
  help: "Total number of games completed",
  labelNames: ["outcome"], // "victory" or "defeat"
  registers: [metricsRegistry],
});

// ============================================
// Combat Metrics
// ============================================

/**
 * Damage dealt histogram
 */
export const damageDealt = new Histogram({
  name: "scrumquest_damage_dealt",
  help: "Distribution of damage dealt to bosses",
  buckets: [10, 25, 50, 100, 200, 500, 1000],
  registers: [metricsRegistry],
});

/**
 * Consensus bonus rate
 */
export const consensusBonusRate = new Gauge({
  name: "scrumquest_consensus_bonus_rate",
  help: "Rate of votes achieving consensus bonus (0-1)",
  registers: [metricsRegistry],
});

// ============================================
// Estimation Metrics
// ============================================

/**
 * Vote value distribution histogram
 */
export const voteValueDistribution = new Histogram({
  name: "scrumquest_vote_values",
  help: "Distribution of vote values selected",
  buckets: [1, 2, 3, 5, 8, 13, 21],
  registers: [metricsRegistry],
});

/**
 * Time to reach consensus
 */
export const timeToConsensus = new Histogram({
  name: "scrumquest_time_to_consensus_seconds",
  help: "Time taken for all players to submit votes",
  buckets: [5, 10, 20, 30, 60, 120, 300],
  registers: [metricsRegistry],
});

// ============================================
// Helper Functions
// ============================================

/**
 * Update lobby metrics
 */
export function updateLobbyMetrics(count: number): void {
  activeLobbies.set(count);
}

/**
 * Update player metrics
 */
export function updatePlayerMetrics(count: number): void {
  activePlayers.set(count);
}

/**
 * Structural type of the socket.io server surface we need to compute
 * the labeled websocket gauge. Kept narrow so this module doesn't take
 * a direct dependency on socket.io.
 */
export interface WebsocketMetricsSocketIO {
  sockets: {
    sockets: {
      // The `socket.data` shape mirrors `SocketData` in server/websocket.ts:
      // `{ playerId?: string; lobbyId?: string; userId?: number; ... }`.
      // We only read `userId` (auth state) and `lobbyId` (in-lobby state).
      values(): IterableIterator<{ data?: { userId?: unknown; lobbyId?: unknown } }>;
      size: number;
    };
  };
}

/**
 * Update the labeled `scrumquest_websocket_connections` gauge by walking
 * the live socket.io socket map and bucketing each socket by auth + lobby
 * state. Safe to call from `connection`, `disconnect`, and any handler
 * that mutates `socket.data.userId` / `socket.data.lobbyId`.
 *
 * Cost: O(number of open sockets). With our scale (<10k sockets per
 * instance) this is well under 1ms per call and only fires on socket
 * lifecycle events — not on the hot per-message path.
 */
export function updateWebsocketMetrics(io: WebsocketMetricsSocketIO): void {
  const counts: Record<WsState, number> = {
    unauthenticated_no_lobby: 0,
    unauthenticated_in_lobby: 0,
    authenticated_no_lobby: 0,
    authenticated_in_lobby: 0,
  };

  for (const socket of io.sockets.sockets.values()) {
    const data = socket.data ?? {};
    const isAuthed = data.userId != null;
    const inLobby = typeof data.lobbyId === "string" && data.lobbyId.length > 0;
    const key: WsState = isAuthed
      ? inLobby
        ? "authenticated_in_lobby"
        : "authenticated_no_lobby"
      : inLobby
        ? "unauthenticated_in_lobby"
        : "unauthenticated_no_lobby";
    counts[key] += 1;
  }

  for (const state of WS_STATES) {
    websocketConnections.labels({ state }).set(counts[state]);
  }
}

/**
 * Record a vote submission
 */
export function recordVote(team: string, value: number): void {
  votesSubmitted.inc({ team });
  voteValueDistribution.observe(value);
}

/**
 * Record damage dealt
 */
export function recordDamage(damage: number): void {
  damageDealt.observe(damage);
}

/**
 * Record game completion
 */
export function recordGameCompletion(victory: boolean): void {
  gamesCompleted.inc({ outcome: victory ? "victory" : "defeat" });
  if (victory) {
    bossDefeated.inc();
  }
}

/**
 * Normalize route for Prometheus labels to prevent high-cardinality label explosion.
 * Dynamic path segments are replaced with parameter placeholders.
 */
function normalizeRoute(req: Request): string {
  if (req.route?.path) return req.route.path;
  const path: string = req.path;
  if (path.startsWith('/join/')) return '/join/:lobbyId';
  if (path.startsWith('/room/')) return '/room/:roomId';
  if (path.startsWith('/assets/')) return '/assets/*';
  if (path.match(/\.(js|css|png|jpg|svg|woff2?|ico|map|json)$/)) return '/static/*';
  if (path === '/') return '/';
  if (path.startsWith('/api/')) return path;  // API routes are fixed, safe
  return '/other';  // Catch-all for SPA routes served by Vite
}

/**
 * Express middleware for HTTP metrics
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = (Date.now() - startTime) / 1000;
      const route = normalizeRoute(req);
      const labels = {
        method: req.method,
        route: route,
        status_code: res.statusCode.toString(),
      };

      httpRequestDuration.observe(labels, duration);
      httpRequestsTotal.inc(labels);
    });

    next();
  };
}

/**
 * Get metrics endpoint handler
 */
export async function getMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}

/**
 * Get metrics content type
 */
export function getMetricsContentType(): string {
  return metricsRegistry.contentType;
}

export default metricsRegistry;
