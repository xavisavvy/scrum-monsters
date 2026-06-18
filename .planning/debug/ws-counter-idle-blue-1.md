---
slug: ws-counter-idle-blue-1
status: resolved
trigger: scrumquest_websocket_connections on idle app-blue shows 1 connection / 0 players since 15:27 UTC
created: 2026-05-16
updated: 2026-05-16
---

# Debug: ws-counter-idle-blue-1

## Symptoms

<DATA_START>
- **Observed in Prometheus / Grafana Cloud:** all three of
  `scrumquest_websocket_connections`, `scrumquest_active_players`, and
  `scrumquest_active_lobbies` show data only for the **idle** color
  `app-blue:5000`. `app-green` (the live color) shows nothing for these
  metrics in the current window.
- **Stuck value:** `scrumquest_websocket_connections{color="blue"} == 1`
  since approximately **2026-05-16T15:27Z**, never dropping back to 0,
  with `active_players == 0` and `active_lobbies == 0` alongside it.
- **Corroborating signal:** the `/api/ws-health` endpoint has been hit
  exactly **once total** (per `http_requests_total`) — timing aligns
  with the 15:27Z connection.

- **External hypothesis pasted by user** (treat as background context to
  validate, not as ground truth):

  > Three metrics (websocket_connections, active_players, active_lobbies)
  > are only on app-blue:5000 — the idle slot. Connection appeared at
  > 15:27 UTC and has been sitting at exactly 1 ever since. Almost
  > certainly the blackbox exporter or `/api/ws-health` check — opens a
  > WebSocket to confirm the endpoint is alive but never joins a lobby
  > or registers as a player.
  >
  > `/api/ws-health` only hit once total (count=1) — lines up with the
  > connection appearing at 15:27 and never going away — a health check
  > that opened a WS connection and didn't close it, or a monitoring
  > client keeping a persistent connection.
  >
  > Real question: does `scrumquest_websocket_connections` count any
  > open socket (including unauthenticated/pre-lobby) or only players
  > in a session? If the app increments as soon as the WebSocket
  > handshake completes — before any game join/auth — then a health
  > check or stray browser tab would show as 1 WS / 0 players. That's
  > the most likely explanation.
  >
  > Fix suggestion: tag the metric more granularly —
  > `websocket_connections{state="authenticated"}` vs `state="unauthenticated"`
  > — so the dashboard can distinguish health-check noise from real
  > players.

- **Why `app-blue` (idle) and not `app-green` (live)?** This is the
  weird part. The deploy contract (Phase 44) keeps exactly one color up
  at a time; the other is profile-gated off. If `app-blue` has *no*
  process bound to port 5000, prometheus scrapes should fail (`up=0`
  on the blue scrape target) and there would be no series at all — yet
  there are series, showing exactly 1 connection.

- **Repro:** Observational only.

- **Timeline:** First observed 2026-05-16. Aligns with the deploy of
  `4702704` (PR #130 vote-indicator fix) earlier today.

- **Environment:** Production VPS `34.199.135.244`
  (`/opt/scrummonsters/`), Docker Compose stack, Prometheus
  remote-writing to Grafana Cloud (`prometheus-prod-67-prod-us-west-0`).
- **No console errors** reported from real users; this is an ops
  observation.
<DATA_END>

## Suspect components / files

- `server/metrics.ts` — `websocketConnections` gauge definition.
- `server/websocket.ts` — `updateWebsocketMetrics` call sites.
- `server/routes.ts` — `/api/ws-health` route handler.
- `docker/prometheus/prometheus.yml` — scrape config and color labels.

## Current Focus

- hypothesis: see Resolution — the premise was wrong on multiple points.
- next_action: (resolved)

## Evidence

- timestamp: 2026-05-16T15:41Z, source: lightsail SSH `cat /opt/scrummonsters/.active-color`, fact: returned `blue`. **Blue is the live color**, not idle. `docker ps` shows only `app-blue` running; `app-green` is not up.
- timestamp: 2026-05-16T15:41Z, source: prometheus query `up{job="scrumquest"}`, fact: `up{color="blue"}=1`, `up{color="green"}=0`. The series only appears for blue because blue is the live slot.
- timestamp: 2026-05-16T15:41Z, source: prometheus query, fact: `scrumquest_websocket_connections{color="blue"}=1`, `scrumquest_active_lobbies=0`, `scrumquest_active_players=0`.
- timestamp: 2026-05-16T15:41Z, source: `docker exec app-blue ss -tn state established`, fact: 2 inbound TCP connections to port 5000 — one from nginx-proxy-manager (172.18.0.12), one from prometheus (172.18.0.3). Only one of these is a Socket.IO session (NPM-proxied); the prom one is the `/metrics` scrape.
- timestamp: 2026-05-16T15:41Z, source: `docker logs app-blue` log analysis (connect/disconnect socketIds diff), fact: socketId `‹redacted-socket-id›` connected at 2026-05-16T15:31:51Z from IP `‹redacted-client-ip›` (Chrome/Windows) as host of lobby `‹redacted-lobby›`, `authenticated:false`. No matching disconnect log — this is the currently-open socket. Approximately 10 minutes alive at investigation time, NOT "since 15:27Z" as the symptom report claimed.
- timestamp: 2026-05-16T15:41Z, source: `server/routes.ts:134`, fact: `/api/ws-health` is a plain Express HTTP GET that reads `io.sockets.sockets.size`. It does NOT open a WebSocket. The external hypothesis blaming it for the leak is wrong; the `http_requests_total{route="/api/ws-health"}=1` is an unrelated HTTP probe.
- timestamp: 2026-05-16T15:41Z, source: `server/websocket.ts:302,2229` plus `server/metrics.ts:221`, fact: the gauge contract is `updateWebsocketMetrics(io.sockets.sockets.size)` (set-from-live-count, not inc/dec). Inc/dec mismatch is impossible by construction — the gauge equals Socket.IO's authoritative count.

## Eliminated

- "Missing dec() on disconnect causes leak" — the gauge is set() from `io.sockets.sockets.size`, not inc/dec. Leak-proof by construction.
- "/api/ws-health opens a WS and forgets to close it" — endpoint is plain HTTP, no socket upgrade.
- "Prometheus relabel mis-tags green as blue" — direct query confirms `up{color=blue}=1, up{color=green}=0` consistent with only `app-blue` running. Labels are correct.
- "Both colors running and metrics mixed" — only `app-blue` container is up.
- "Stuck since 15:27Z" — log analysis shows a chain of distinct short-lived sessions from the same browser IP. The CURRENT open socket only dates to 15:31:51Z. The gauge stayed at 1 because successive reconnects overlapped, making the time series look flat.

## Resolution

### Root cause

The "leak" is not a leak. The investigation premise was wrong on three points:

1. **app-blue is the LIVE color, not idle.** `.active-color` reads `blue`; `up{color=blue}=1`; only `app-blue` is running. The series only appears on blue because blue is where traffic is.
2. **The gauge contract is leak-proof.** `updateWebsocketMetrics(io.sockets.sockets.size)` sets the gauge to the authoritative socket count on every connect AND disconnect. Inc/dec mismatch is structurally impossible.
3. **The currently-open socket is a real browser tab**, not a probe. Socket `‹redacted-socket-id›` from IP `‹redacted-client-ip›` (Chrome/Windows, almost certainly the operator's own session) opened at 2026-05-16T15:31:51Z as the host of lobby `‹redacted-lobby›`, disconnected from the lobby, but kept the browser tab open. The WS socket persists; `active_players` correctly reports 0 because the player left the lobby.

`active_players` counts players-in-lobbies; `websocket_connections` counts all open sockets including pre-lobby/post-lobby tabs. The divergence is by design and is exactly the diagnostic gap the external hypothesis suggested closing — by splitting the metric by lifecycle state.

### Fix applied (label-only, diagnostic improvement)

Split `scrumquest_websocket_connections` by a new `state` label with four values:

- `unauthenticated_no_lobby` — open tab, no user, no lobby (this case)
- `unauthenticated_in_lobby` — guest player in a lobby
- `authenticated_no_lobby`   — logged-in user not in a lobby
- `authenticated_in_lobby`   — logged-in user actively playing

The sum across labels equals the legacy unlabeled count (`sum(scrumquest_websocket_connections)`), so existing dashboard panels migrate with a `sum()` wrapper. New panels can distinguish "real player traffic" from "page-open / pre-lobby" sockets and won't trigger this false alarm again.

### Files changed

- `server/metrics.ts` — `websocketConnections` now has `labelNames: ["state"]`. New `updateWebsocketMetrics(io)` walks `io.sockets.sockets` once per call and buckets each socket by `(socket.data.userId ? auth : unauth, socket.data.lobbyId ? in_lobby : no_lobby)`. Module-local `WebsocketMetricsSocketIO` structural type avoids a direct `socket.io` import. All four label permutations are zero-initialized at module load for stable dashboard series from process start.
- `server/websocket.ts` — both existing call sites updated from `updateWebsocketMetrics(io.sockets.sockets.size)` to `updateWebsocketMetrics(io)`. Added a 5s `setInterval` that recomputes the gauge so labels stay accurate when other handlers mutate `socket.data.lobbyId` (e.g. `create_lobby`, `join_lobby`, `leave_lobby`, reconnect) without explicitly re-calling the helper. Recompute is O(open sockets) and well within Prometheus's 15s scrape window. Cleanup registered via `clearInterval(websocketMetricsInterval)` in the existing cleanup block.

### Verification

- `npm run check` passes (tsc clean).
- `npx vitest run server/websocket` passes (existing reconnect autoAdvance test green).

### Follow-up for operators

On next deploy:
1. The legacy unlabeled `scrumquest_websocket_connections` series will disappear and be replaced by four labeled series.
2. Wrap existing dashboard queries in `sum(scrumquest_websocket_connections)` to preserve the legacy total view, OR migrate panels to the new breakdown.
3. Suggested alert (future): `sum(scrumquest_websocket_connections{state=~".*_in_lobby"}) == 0 and scrumquest_active_lobbies > 0` would catch a real divergence between socket and player state.
