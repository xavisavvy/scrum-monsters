/**
 * Server-side mock socket helper for unit-testing socket handlers without
 * a live Socket.IO server.
 *
 * Mirrors the client-side pattern in client/src/lib/socket/eventHandlers.test.ts
 * and extends it with the server-specific fields that socket handlers access:
 *   - socket.data (read/written during handler execution for playerId, lobbyId, userId)
 *   - socket.join (called in create_lobby and reconnect_with_token)
 *
 * Usage:
 *   const { socket, emitted, joinedRooms } = makeMockSocket();
 *   await handleCreateLobby(socket as any, { lobbyName: 'Sprint', hostName: 'Alice' }, deps);
 *   expect(joinedRooms).toContain(lobbyId);
 *   expect(emitted.find(e => e.event === 'lobby_created')).toBeDefined();
 */

import { vi } from 'vitest';

export function makeMockSocket() {
  const handlers = new Map<string, (data: unknown) => void>();
  const emitted: Array<{ event: string; data: unknown }> = [];
  const joinedRooms: string[] = [];
  const socket = {
    data: {} as Record<string, unknown>,
    on: vi.fn((event: string, handler: (data: unknown) => void) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
    emit: vi.fn((event: string, data: unknown) => {
      emitted.push({ event, data });
    }),
    join: vi.fn((room: string) => {
      joinedRooms.push(room);
    }),
    listeners: vi.fn((event: string) => (handlers.has(event) ? [handlers.get(event)!] : [])),
    id: 'mock-socket-id',
  };
  return { socket, handlers, emitted, joinedRooms };
}
