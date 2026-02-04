/**
 * k6 WebSocket Game Flow Load Test
 *
 * Simulates full game flow with 100 concurrent WebSocket connections:
 * connect → create lobby → start battle → vote → reveal
 *
 * Tests real-time responsiveness with stricter latency requirements (p95 < 100ms in prod)
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import {
  performHandshake,
  emitEvent,
  parseMessage,
  getSocketUrl
} from '../utils/socketio.js';
import { getWsThresholds } from '../utils/thresholds.js';

export const options = {
  scenarios: {
    game_flow: {
      executor: 'constant-vus',
      vus: 100,
      duration: '30s',
    },
  },
  thresholds: getWsThresholds(__ENV.ENVIRONMENT || 'ci'),
};

const VOTE_OPTIONS = [1, 2, 3, 5, 8, 13, 21];

export default function () {
  const url = getSocketUrl();
  const lobbyName = `LoadTest-${__VU}-${Date.now()}`;
  const playerName = `Player-${__VU}`;

  const res = ws.connect(url, function (socket) {
    let lobbyCreated = false;
    let battleStarted = false;

    socket.on('open', function () {
      performHandshake(socket);
      sleep(0.1); // Small delay after handshake

      // Create lobby
      emitEvent(socket, 'create_lobby', {
        lobbyName,
        hostName: playerName,
      });
    });

    socket.on('message', function (msg) {
      const parsed = parseMessage(msg);

      if (parsed.type === 'event') {
        if (parsed.eventName === 'lobby_created') {
          lobbyCreated = true;
          check(parsed.data, {
            'lobby has id': (d) => d.lobby && d.lobby.id,
          });

          // Start battle
          emitEvent(socket, 'start_battle');
        }

        if (parsed.eventName === 'battle_started') {
          battleStarted = true;
          check(parsed.data, {
            'battle has boss': (d) => d.boss && d.boss.id,
          });

          // Submit random vote
          const vote = VOTE_OPTIONS[Math.floor(Math.random() * VOTE_OPTIONS.length)];
          emitEvent(socket, 'submit_score', { score: vote });
        }

        if (parsed.eventName === 'scores_revealed') {
          check(parsed.data, {
            'has team scores': (d) => d.teamScores,
          });
        }
      }
    });

    socket.setTimeout(function () {
      socket.close();
    }, 28000); // Close before 30s to capture clean metrics
  });

  check(res, {
    'websocket connected': (r) => r && r.status === 101,
  });
}
