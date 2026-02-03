import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from "prom-client";

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
 * Number of active WebSocket connections
 */
export const websocketConnections = new Gauge({
  name: "scrumquest_websocket_connections",
  help: "Current number of active WebSocket connections",
  registers: [metricsRegistry],
});

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
 * Update WebSocket connection count
 */
export function updateWebsocketMetrics(count: number): void {
  websocketConnections.set(count);
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
 * Express middleware for HTTP metrics
 */
export function metricsMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const route = req.route?.path || req.path;

    res.on("finish", () => {
      const duration = (Date.now() - startTime) / 1000;
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
