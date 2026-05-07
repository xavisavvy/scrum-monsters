import { describe, it, expect, beforeEach } from 'vitest';
import { LobbySettingsStorage } from './lobbySettingsStorage';
import { EstimationSettingsSchema } from '@shared/socket-schemas';

describe('LobbySettingsStorage autoAdvance (Phase 42-02a / FIX-05)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('default settings have autoAdvance === false', () => {
    const s = LobbySettingsStorage.loadSettings();
    expect(s.estimationSettings?.autoAdvance).toBe(false);
  });

  it('round-trips autoAdvance: true through saveSettings/loadSettings', () => {
    LobbySettingsStorage.updateEstimationSettings({
      scaleType: 'fibonacci',
      autoAdvance: true,
    });
    const s = LobbySettingsStorage.loadSettings();
    expect(s.estimationSettings?.autoAdvance).toBe(true);
  });

  it('preserves autoAdvance: true when validating well-formed payload', () => {
    localStorage.setItem(
      'scrum-monsters-lobby-settings',
      JSON.stringify({
        estimationSettings: { scaleType: 'fibonacci', autoAdvance: true },
      }),
    );
    const s = LobbySettingsStorage.loadSettings();
    expect(s.estimationSettings?.autoAdvance).toBe(true);
  });

  it('coerces non-boolean autoAdvance to false (tampered storage)', () => {
    localStorage.setItem(
      'scrum-monsters-lobby-settings',
      JSON.stringify({
        estimationSettings: { scaleType: 'fibonacci', autoAdvance: 'not-a-bool' },
      }),
    );
    const s = LobbySettingsStorage.loadSettings();
    expect(s.estimationSettings?.autoAdvance).toBe(false);
  });
});

describe('EstimationSettingsSchema autoAdvance (Phase 42-02a / FIX-05)', () => {
  it('parses without autoAdvance and defaults to false', () => {
    const result = EstimationSettingsSchema.parse({ scaleType: 'fibonacci' });
    expect(result.autoAdvance).toBe(false);
  });

  it('preserves autoAdvance: true when provided', () => {
    const result = EstimationSettingsSchema.parse({
      scaleType: 'fibonacci',
      autoAdvance: true,
    });
    expect(result.autoAdvance).toBe(true);
  });

  it('rejects non-boolean autoAdvance via zod validation', () => {
    expect(() =>
      EstimationSettingsSchema.parse({
        scaleType: 'fibonacci',
        autoAdvance: 'oops' as any,
      }),
    ).toThrow();
  });
});
