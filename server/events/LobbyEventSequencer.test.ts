import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyEventSequencer } from './LobbyEventSequencer';

describe('LobbyEventSequencer', () => {
  let sequencer: LobbyEventSequencer;

  beforeEach(() => {
    sequencer = new LobbyEventSequencer();
  });

  describe('Sequence generation', () => {
    it('should start sequences at 1 for new lobby', () => {
      const seq = sequencer.nextSeq('lobby-1');
      expect(seq).toBe(1);
    });

    it('should increment sequences correctly', () => {
      const seq1 = sequencer.nextSeq('lobby-1');
      const seq2 = sequencer.nextSeq('lobby-1');
      const seq3 = sequencer.nextSeq('lobby-1');

      expect(seq1).toBe(1);
      expect(seq2).toBe(2);
      expect(seq3).toBe(3);
    });

    it('should maintain independent sequences for different lobbies', () => {
      sequencer.nextSeq('lobby-1'); // 1
      sequencer.nextSeq('lobby-1'); // 2
      const lobby1Seq = sequencer.nextSeq('lobby-1'); // 3

      const lobby2Seq1 = sequencer.nextSeq('lobby-2'); // 1
      const lobby2Seq2 = sequencer.nextSeq('lobby-2'); // 2

      expect(lobby1Seq).toBe(3);
      expect(lobby2Seq1).toBe(1);
      expect(lobby2Seq2).toBe(2);
    });

    it('should return current sequence with getCurrentSeq', () => {
      sequencer.nextSeq('lobby-1'); // 1
      sequencer.nextSeq('lobby-1'); // 2
      sequencer.nextSeq('lobby-1'); // 3

      expect(sequencer.getCurrentSeq('lobby-1')).toBe(3);
    });

    it('should return 0 for lobby with no sequences yet', () => {
      expect(sequencer.getCurrentSeq('unknown-lobby')).toBe(0);
    });
  });

  describe('Event buffering', () => {
    it('should buffer events with correct structure', () => {
      const seq = sequencer.nextSeq('lobby-1');
      sequencer.bufferEvent('lobby-1', seq, 'session:player_joined', { playerId: 'p1' });

      const missed = sequencer.getMissedEvents('lobby-1', 0);
      expect(missed).toHaveLength(1);
      expect(missed![0]).toMatchObject({
        seq: 1,
        event: 'session:player_joined',
        data: { playerId: 'p1' },
      });
      expect(missed![0].timestamp).toBeTypeOf('number');
    });

    it('should maintain buffer size limit', () => {
      // Buffer 150 events (exceeds BUFFER_SIZE of 100)
      for (let i = 1; i <= 150; i++) {
        const seq = sequencer.nextSeq('lobby-1');
        sequencer.bufferEvent('lobby-1', seq, 'test:event', { index: i });
      }

      // Request from seq 50 (just before oldest buffered event)
      const buffer = sequencer.getMissedEvents('lobby-1', 50);
      expect(buffer).toHaveLength(100); // Should only keep last 100

      // Oldest event should be #51 (150 - 100 + 1)
      expect(buffer![0].seq).toBe(51);
      expect((buffer![0].data as { index: number }).index).toBe(51);

      // Newest event should be #150
      expect(buffer![99].seq).toBe(150);
      expect((buffer![99].data as { index: number }).index).toBe(150);
    });

    it('should include timestamp in buffered events', () => {
      const before = Date.now();
      const seq = sequencer.nextSeq('lobby-1');
      sequencer.bufferEvent('lobby-1', seq, 'test:event', {});
      const after = Date.now();

      const missed = sequencer.getMissedEvents('lobby-1', 0);
      expect(missed).toHaveLength(1);
      expect(missed![0].timestamp).toBeGreaterThanOrEqual(before);
      expect(missed![0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('Missed event recovery', () => {
    beforeEach(() => {
      // Buffer 5 events
      for (let i = 1; i <= 5; i++) {
        const seq = sequencer.nextSeq('lobby-1');
        sequencer.bufferEvent('lobby-1', seq, 'test:event', { index: i });
      }
    });

    it('should return events after lastSeq', () => {
      const missed = sequencer.getMissedEvents('lobby-1', 2);
      expect(missed).toHaveLength(3);
      expect(missed![0].seq).toBe(3);
      expect(missed![1].seq).toBe(4);
      expect(missed![2].seq).toBe(5);
    });

    it('should return empty array if no events missed', () => {
      const missed = sequencer.getMissedEvents('lobby-1', 5);
      expect(missed).toEqual([]);
    });

    it('should return null if lobby not found', () => {
      const missed = sequencer.getMissedEvents('unknown-lobby', 0);
      expect(missed).toBeNull();
    });

    it('should return null if gap exceeds buffer capacity', () => {
      // Buffer 150 more events (total 155, but only last 100 kept)
      for (let i = 6; i <= 155; i++) {
        const seq = sequencer.nextSeq('lobby-1');
        sequencer.bufferEvent('lobby-1', seq, 'test:event', { index: i });
      }

      // Oldest buffered event is now seq 56 (155 - 100 + 1)
      // Requesting from seq 50 should return null (gap too large)
      const missed = sequencer.getMissedEvents('lobby-1', 50);
      expect(missed).toBeNull();
    });

    it('should return empty array when lastSeq equals current', () => {
      const currentSeq = sequencer.getCurrentSeq('lobby-1');
      const missed = sequencer.getMissedEvents('lobby-1', currentSeq);
      expect(missed).toEqual([]);
    });

    it('should handle lastSeq at buffer boundary', () => {
      // Clear and buffer exactly 100 events
      sequencer.cleanup('lobby-1');
      for (let i = 1; i <= 100; i++) {
        const seq = sequencer.nextSeq('lobby-1');
        sequencer.bufferEvent('lobby-1', seq, 'test:event', { index: i });
      }

      // Request from seq 1 (oldest in buffer)
      const missed = sequencer.getMissedEvents('lobby-1', 1);
      expect(missed).toHaveLength(99);
      expect(missed![0].seq).toBe(2);
      expect(missed![98].seq).toBe(100);
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      // Create sequences and buffer for two lobbies
      for (let i = 1; i <= 3; i++) {
        const seq1 = sequencer.nextSeq('lobby-1');
        sequencer.bufferEvent('lobby-1', seq1, 'test:event', { index: i });

        const seq2 = sequencer.nextSeq('lobby-2');
        sequencer.bufferEvent('lobby-2', seq2, 'test:event', { index: i });
      }
    });

    it('should remove lobby from sequences map', () => {
      sequencer.cleanup('lobby-1');
      expect(sequencer.getCurrentSeq('lobby-1')).toBe(0);
    });

    it('should remove lobby from buffers map', () => {
      sequencer.cleanup('lobby-1');
      const missed = sequencer.getMissedEvents('lobby-1', 0);
      expect(missed).toBeNull();
    });

    it('should not affect other lobbies', () => {
      sequencer.cleanup('lobby-1');

      // Lobby 2 should still be intact
      expect(sequencer.getCurrentSeq('lobby-2')).toBe(3);
      const missed = sequencer.getMissedEvents('lobby-2', 0);
      expect(missed).toHaveLength(3);
    });

    it('should be idempotent', () => {
      sequencer.cleanup('lobby-1');
      sequencer.cleanup('lobby-1'); // Second cleanup should not throw
      expect(sequencer.getCurrentSeq('lobby-1')).toBe(0);
    });

    it('should allow fresh sequence after cleanup', () => {
      sequencer.cleanup('lobby-1');

      // New sequences should start at 1 again
      const newSeq1 = sequencer.nextSeq('lobby-1');
      const newSeq2 = sequencer.nextSeq('lobby-1');

      expect(newSeq1).toBe(1);
      expect(newSeq2).toBe(2);
    });

    it('should not error when cleaning up non-existent lobby', () => {
      expect(() => {
        sequencer.cleanup('unknown-lobby');
      }).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty buffer when requesting missed events', () => {
      // Create sequence but don't buffer anything
      sequencer.nextSeq('lobby-1');

      const missed = sequencer.getMissedEvents('lobby-1', 0);
      expect(missed).toEqual([]);
    });

    it('should handle multiple lobbies independently', () => {
      // Create different event sequences for multiple lobbies
      const seq1a = sequencer.nextSeq('lobby-1');
      sequencer.bufferEvent('lobby-1', seq1a, 'event:a', {});

      const seq2a = sequencer.nextSeq('lobby-2');
      sequencer.bufferEvent('lobby-2', seq2a, 'event:b', {});

      const seq1b = sequencer.nextSeq('lobby-1');
      sequencer.bufferEvent('lobby-1', seq1b, 'event:c', {});

      const missed1 = sequencer.getMissedEvents('lobby-1', 0);
      const missed2 = sequencer.getMissedEvents('lobby-2', 0);

      expect(missed1).toHaveLength(2);
      expect(missed1![0].event).toBe('event:a');
      expect(missed1![1].event).toBe('event:c');

      expect(missed2).toHaveLength(1);
      expect(missed2![0].event).toBe('event:b');
    });

    it('should handle very large lastSeq values', () => {
      const seq = sequencer.nextSeq('lobby-1');
      sequencer.bufferEvent('lobby-1', seq, 'test:event', {});

      // Request from a much higher seq than exists
      const missed = sequencer.getMissedEvents('lobby-1', 999999);
      expect(missed).toEqual([]);
    });
  });
});
