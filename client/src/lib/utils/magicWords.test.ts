import { describe, it, expect } from 'vitest';
import {
  detectMagicWords,
  getPrimaryMagicEffect,
  extractHoldTarget,
  getSpellWords,
  extractSpellTargets,
  type MagicEffectType,
} from '@/lib/utils/magicWords';

describe('detectMagicWords', () => {
  it('should detect single magic word', () => {
    expect(detectMagicWords('fire')).toEqual(['fire']);
    expect(detectMagicWords('heal')).toEqual(['heal']);
    expect(detectMagicWords('ice')).toEqual(['ice']);
  });

  it('should be case insensitive', () => {
    expect(detectMagicWords('FIRE')).toEqual(['fire']);
    expect(detectMagicWords('HeAl')).toEqual(['heal']);
    expect(detectMagicWords('IcE')).toEqual(['ice']);
  });

  it('should detect word embedded in sentence', () => {
    expect(detectMagicWords('Time to heal!')).toEqual(['heal']);
    expect(detectMagicWords('Beware the fire!')).toEqual(['fire']);
    expect(detectMagicWords('I love you')).toEqual(['love']);
  });

  it('should detect multiple effects in one message', () => {
    const result = detectMagicWords('fire and ice');
    expect(result).toContain('fire');
    expect(result).toContain('ice');
    expect(result.length).toBe(2);
  });

  it('should return empty array for no magic words', () => {
    expect(detectMagicWords('hello world')).toEqual([]);
    expect(detectMagicWords('just a normal message')).toEqual([]);
  });

  it('should return empty array for empty string', () => {
    expect(detectMagicWords('')).toEqual([]);
  });

  it('should detect multi-word triggers', () => {
    expect(detectMagicWords('avada kedavra')).toEqual(['massacre']);
    expect(detectMagicWords('hold person bob')).toEqual(['hold']);
    expect(detectMagicWords('for the alliance')).toEqual(['massrevive']);
  });

  it('should deduplicate same effect type from multiple trigger words', () => {
    // 'fire' and 'flame' both trigger 'fire' type
    const result = detectMagicWords('fire and flame');
    expect(result).toEqual(['fire']);
  });

  it('should detect overlapping categories correctly', () => {
    // 'freeze' appears in both 'ice' words and 'hold' words
    const result = detectMagicWords('freeze');
    // Should return both 'ice' and 'hold' since 'freeze' is a trigger word for both
    expect(result).toContain('ice');
    expect(result).toContain('hold');
    expect(result.length).toBe(2);
  });

  it('should detect special character triggers', () => {
    expect(detectMagicWords('I <3 you')).toEqual(['love']);
    expect(detectMagicWords('zzz')).toEqual(['sleep']);
    expect(detectMagicWords('x_x')).toEqual(['die']);
  });

  it('should detect phrase triggers', () => {
    expect(detectMagicWords('gotta go fast')).toEqual(['haste']);
    expect(detectMagicWords('clever girl')).toEqual(['dragon']);
    // 'legends never die' contains 'die' which also triggers, so both effects detected
    const result = detectMagicWords('legends never die');
    expect(result).toContain('die');
    expect(result).toContain('massrevive');
  });
});

describe('getPrimaryMagicEffect', () => {
  it('should return first effect from message', () => {
    // Note: order depends on MAGIC_WORD_CONFIG array order
    expect(getPrimaryMagicEffect('fire and ice')).toBe('fire');
    expect(getPrimaryMagicEffect('ice and fire')).toBe('fire');
  });

  it('should return null for no effects', () => {
    expect(getPrimaryMagicEffect('hello')).toBeNull();
    expect(getPrimaryMagicEffect('just a normal message')).toBeNull();
  });

  it('should detect magic word even when embedded in common phrases', () => {
    // 'magic' is a trigger word, so 'no magic here' triggers it
    expect(getPrimaryMagicEffect('no magic here')).toBe('magic');
  });

  it('should return single effect', () => {
    expect(getPrimaryMagicEffect('heal me')).toBe('heal');
    expect(getPrimaryMagicEffect('lightning strikes')).toBe('lightning');
  });

  it('should return null for empty string', () => {
    expect(getPrimaryMagicEffect('')).toBeNull();
  });
});

describe('extractHoldTarget', () => {
  it('should extract target from hold person pattern', () => {
    expect(extractHoldTarget('hold person bob')).toBe('bob');
    expect(extractHoldTarget('hold person Alice')).toBe('alice');
  });

  it('should extract target from paralyze pattern', () => {
    expect(extractHoldTarget('paralyze alice')).toBe('alice');
    expect(extractHoldTarget('paralyze Bob')).toBe('bob');
  });

  it('should extract target from freeze pattern', () => {
    expect(extractHoldTarget('freeze charlie')).toBe('charlie');
    expect(extractHoldTarget('freeze Dave')).toBe('dave');
  });

  it('should handle multi-word target names', () => {
    expect(extractHoldTarget('hold person john smith')).toBe('john smith');
    expect(extractHoldTarget('paralyze mary jane')).toBe('mary jane');
  });

  it('should return null for no matching pattern', () => {
    expect(extractHoldTarget('hello world')).toBeNull();
    expect(extractHoldTarget('fire')).toBeNull();
  });

  it('should return null when pattern matches but no target follows', () => {
    // Implementation behavior: patterns without space after them don't match the regex
    // 'hold person' requires a space + capture group, so no match returns null
    expect(extractHoldTarget('hold person')).toBeNull();
    expect(extractHoldTarget('paralyze')).toBeNull();
    expect(extractHoldTarget('freeze')).toBeNull();
  });

  it('should be case insensitive for pattern matching', () => {
    expect(extractHoldTarget('HOLD PERSON bob')).toBe('bob');
    expect(extractHoldTarget('Paralyze alice')).toBe('alice');
  });
});

describe('getSpellWords', () => {
  it('should return trigger words for known effect type', () => {
    const fireWords = getSpellWords('fire');
    expect(fireWords).toEqual(['fire', 'flame', 'burn', 'hot', 'inferno']);
    expect(fireWords).toBeInstanceOf(Array);
  });

  it('should return heal trigger words', () => {
    const healWords = getSpellWords('heal');
    expect(healWords).toEqual(['heal', 'cure', 'health', 'restore', 'mend']);
  });

  it('should return ice trigger words', () => {
    const iceWords = getSpellWords('ice');
    expect(iceWords).toEqual(['ice', 'freeze', 'cold', 'snow', 'frozen', 'chill']);
  });

  it('should return empty array for unknown effect type', () => {
    // Cast to MagicEffectType to bypass TypeScript checking
    const result = getSpellWords('nonexistent' as MagicEffectType);
    expect(result).toEqual([]);
    expect(result).toBeInstanceOf(Array);
  });

  it('should return array (not undefined) for all cases', () => {
    expect(Array.isArray(getSpellWords('fire'))).toBe(true);
    expect(Array.isArray(getSpellWords('unknown' as MagicEffectType))).toBe(true);
  });
});

describe('extractSpellTargets', () => {
  it('should extract single target', () => {
    const petrifyWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify bob', petrifyWords)).toEqual(['bob']);
  });

  it('should extract comma-separated targets', () => {
    const petrifyWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify bob, alice, charlie', petrifyWords)).toEqual([
      'bob',
      'alice',
      'charlie',
    ]);
  });

  it('should extract and-separated targets', () => {
    const petrifyWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify bob and alice', petrifyWords)).toEqual(['bob', 'alice']);
  });

  it('should return null for self-cast (no targets)', () => {
    const petrifyWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify', petrifyWords)).toBeNull();
  });

  it('should extract mixed separator targets', () => {
    const petrifyWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify bob, alice and charlie', petrifyWords)).toEqual([
      'bob',
      'alice',
      'charlie',
    ]);
  });

  it('should extract ampersand-separated targets', () => {
    const petrifyWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify bob & alice', petrifyWords)).toEqual(['bob', 'alice']);
  });

  it('should handle case insensitive spell word matching', () => {
    const fireWords = getSpellWords('fire');
    expect(extractSpellTargets('FIRE bob', fireWords)).toEqual(['bob']);
    expect(extractSpellTargets('Flame alice', fireWords)).toEqual(['alice']);
  });

  it('should return null when spell word not found in message', () => {
    const fireWords = getSpellWords('fire');
    expect(extractSpellTargets('heal bob', fireWords)).toBeNull();
  });

  it('should handle spell word with extra whitespace', () => {
    const petrifyWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify    bob', petrifyWords)).toEqual(['bob']);
  });

  it('should trim whitespace from target names', () => {
    const petrifyWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify  bob  ,  alice  ', petrifyWords)).toEqual([
      'bob',
      'alice',
    ]);
  });

  it('should handle multi-word spell triggers', () => {
    const massReviveWords = getSpellWords('massrevive');
    expect(extractSpellTargets('for the alliance bob, alice', massReviveWords)).toEqual([
      'bob',
      'alice',
    ]);
  });

  it('should preserve case of target names', () => {
    const petrifyWords = getSpellWords('petrify');
    expect(extractSpellTargets('petrify Bob', petrifyWords)).toEqual(['Bob']);
  });
});
