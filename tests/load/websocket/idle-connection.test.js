/**
 * k6 WebSocket Idle Connection Stability Test
 *
 * Tests long-running connection stability (5 minutes) with periodic heartbeats.
 * Validates that WebSocket connections survive inactivity periods.
 *
 * Runs nightly on schedule AND via manual trigger.
 * Informational only - never blocks releases.
 */

import ws from 'k6/ws';
import { check } from 'k6';
import {
  performHandshake,
  emitEvent,
  sendPing,
  getSocketUrl
} from '../utils/socketio.js';

export const options = {
  scenarios: {
    idle_stability: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
    },
  },
  thresholds: {
    ws_session_duration: ['min>295000'], // Sessions last nearly full 5min
    ws_msgs_sent: ['count>0'], // Heartbeats sent
  },
};

export default function () {
  const url = getSocketUrl();
  const lobbyName = `IdleTest-${__VU}-${Date.now()}`;
  const playerName = `IdlePlayer-${__VU}`;

  const res = ws.connect(url, function (socket) {
    socket.on('open', function () {
      performHandshake(socket);

      // Create lobby to establish session
      emitEvent(socket, 'create_lobby', {
        lobbyName,
        hostName: playerName,
      });

      // Send periodic heartbeat every 25 seconds
      // This prevents proxy/infrastructure timeouts
      socket.setInterval(function () {
        sendPing(socket);
      }, 25000);
    });

    socket.on('message', function (_msg) {
      // Minimal processing - just keep alive
      // Log pong responses if needed for debugging
    });

    socket.on('close', function () {
      console.log(`VU ${__VU}: Connection closed`);
    });

    socket.on('error', function (e) {
      console.error(`VU ${__VU}: Error: ${e}`);
    });

    // Keep connection open for full 5 minutes
    socket.setTimeout(function () {
      socket.close();
    }, 300000);
  });

  check(res, {
    'websocket connected': (r) => r && r.status === 101,
  });
}
