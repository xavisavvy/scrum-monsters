/**
 * Socket.IO protocol helpers for k6 load testing
 *
 * Implements Engine.IO and Socket.IO protocol handling for WebSocket tests.
 * Supports Socket.IO v4 with Engine.IO v4 protocol.
 */

/**
 * Perform Engine.IO handshake after WebSocket connection
 *
 * Engine.IO handshake sequence:
 * 1. Send "2probe" (PING with probe)
 * 2. Send "5" (UPGRADE to WebSocket transport)
 *
 * @param {WebSocket} socket - k6 WebSocket connection
 */
export function performHandshake(socket) {
  socket.send('2probe');  // Engine.IO probe
  socket.send('5');       // Engine.IO upgrade
}

/**
 * Emit a Socket.IO event
 *
 * Format: 42["eventName", data]
 * - "4" = Engine.IO MESSAGE packet
 * - "2" = Socket.IO EVENT packet
 *
 * @param {WebSocket} socket - k6 WebSocket connection
 * @param {string} eventName - Event name
 * @param {object} data - Event payload (optional)
 */
export function emitEvent(socket, eventName, data = null) {
  const payload = data !== null
    ? JSON.stringify([eventName, data])
    : JSON.stringify([eventName]);
  socket.send(`42${payload}`);
}

/**
 * Parse a Socket.IO message
 *
 * Engine.IO Packet Types:
 * - "0" = OPEN (server sends connection info)
 * - "2" = PING
 * - "3" = PONG
 * - "4" = MESSAGE (Socket.IO namespace packet)
 * - "5" = UPGRADE
 *
 * Socket.IO MESSAGE Packet Types (after "4"):
 * - "0" = CONNECT
 * - "2" = EVENT (format: 42["event", data])
 * - "3" = ACK
 *
 * @param {string} msg - Raw WebSocket message
 * @returns {object|null} { type: string, eventName?: string, data?: any }
 */
export function parseMessage(msg) {
  if (msg.startsWith('0')) {
    // Engine.IO OPEN packet
    return { type: 'open', data: JSON.parse(msg.substring(1)) };
  }
  if (msg === '2') {
    return { type: 'ping' };
  }
  if (msg === '3') {
    return { type: 'pong' };
  }
  if (msg.startsWith('42')) {
    // Socket.IO EVENT packet
    const payload = JSON.parse(msg.substring(2));
    return {
      type: 'event',
      eventName: payload[0],
      data: payload[1] || null,
    };
  }
  if (msg.startsWith('40')) {
    // Socket.IO CONNECT to namespace
    return { type: 'connect' };
  }
  return { type: 'unknown', raw: msg };
}

/**
 * Send Engine.IO ping (heartbeat)
 *
 * Prevents proxy/infrastructure timeouts during idle connections
 *
 * @param {WebSocket} socket - k6 WebSocket connection
 */
export function sendPing(socket) {
  socket.send('2');
}

/**
 * Get WebSocket URL for Socket.IO
 *
 * Constructs WebSocket URL with Socket.IO query parameters:
 * - EIO=4 (Engine.IO protocol version 4)
 * - transport=websocket (WebSocket transport)
 *
 * @param {string} baseUrl - Base URL (e.g., 'localhost:5000')
 * @returns {string} WebSocket URL with Socket.IO query params
 */
export function getSocketUrl(baseUrl = 'localhost:5000') {
  return `ws://${baseUrl}/socket.io/?EIO=4&transport=websocket`;
}
