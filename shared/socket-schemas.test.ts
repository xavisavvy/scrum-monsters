import { describe, it, expect } from 'vitest';
import { ClientEventSchemas } from './socket-schemas';

describe('ClientEventSchemas', () => {
  it('has exactly 48 entries (parity with ClientToServerEvents)', () => {
    expect(Object.keys(ClientEventSchemas).length).toBe(48);
  });
});
