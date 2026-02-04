/**
 * Magic words detection for emote special effects
 */

export type MagicEffectType =
  | 'fire'
  | 'ice'
  | 'heal'
  | 'lightning'
  | 'magic'
  | 'love'
  | 'confetti'
  | 'rage'
  | 'sleep'
  | 'sparkle'
  | 'die'
  | 'revive'
  | 'haste'
  | 'slow'
  | 'fly'
  | 'hold'
  | 'earthbind'
  | 'massacre'
  | 'massrevive'
  | 'dragon'
  | 'dispel'
  | 'chaos'
  | 'invisibility'
  | 'enlarge'
  | 'reduce'
  | 'petrify';

interface MagicWordConfig {
  type: MagicEffectType;
  words: string[];
}

const MAGIC_WORD_CONFIG: MagicWordConfig[] = [
  { type: 'fire', words: ['fire', 'flame', 'burn', 'hot', 'inferno'] },
  { type: 'ice', words: ['ice', 'freeze', 'cold', 'snow', 'frozen', 'chill'] },
  { type: 'heal', words: ['heal', 'cure', 'health', 'restore', 'mend'] },
  { type: 'lightning', words: ['lightning', 'thunder', 'shock', 'zap', 'electric', 'bolt'] },
  { type: 'magic', words: ['magic', 'spell', 'cast', 'wizard', 'abracadabra', 'poof'] },
  { type: 'love', words: ['love', 'heart', '<3', 'xoxo', 'kiss', 'hug'] },
  { type: 'confetti', words: ['confetti', 'party', 'celebrate', 'yay', 'woohoo', 'congrats', 'gg'] },
  { type: 'rage', words: ['rage', 'angry', 'mad', 'fury', 'grr', 'argh'] },
  { type: 'sleep', words: ['sleep', 'zzz', 'tired', 'sleepy', 'nap', 'yawn'] },
  { type: 'sparkle', words: ['sparkle', 'shine', 'glow', 'star', 'twinkle', 'glitter'] },
  { type: 'die', words: ['die', 'dead', 'death', 'kill', 'rip', 'ded', 'x_x', 'xx'] },
  { type: 'revive', words: ['revive', 'resurrect', 'arise', 'awaken', 'phoenix', 'rebirth', 'live'] },
  { type: 'haste', words: ['haste', 'speed', 'fast', 'quick', 'swift', 'zoom', 'nyoom', 'gotta go fast'] },
  { type: 'slow', words: ['slow', 'sluggish', 'crawl', 'snail', 'turtle', 'molasses'] },
  { type: 'fly', words: ['fly', 'flight', 'soar', 'levitate', 'float', 'wings', 'ascend'] },
  { type: 'hold', words: ['hold person', 'paralyze', 'freeze'] },
  { type: 'earthbind', words: ['earthbind', 'grounded', 'ground', 'gravity', 'fall'] },
  { type: 'massacre', words: ['avada kedavra', 'avadakadavra', 'avada kadavra', 'killing curse'] },
  { type: 'massrevive', words: ['for the alliance', 'for the horde', 'legends never die', 'mass resurrection', 'rally'] },
  { type: 'dragon', words: ['clever girl', 'dracarys', 'summon dragon', 'release the dragon'] },
  { type: 'dispel', words: ['dispel magic', 'dispel', 'cleanse', 'purify', 'remove curse'] },
  { type: 'chaos', words: ['chaos mode', 'disco', 'party mode', 'rave', 'rainbow'] },
  { type: 'invisibility', words: ['invisibility', 'invisible', 'vanish', 'stealth', 'fade', 'shadow walk'] },
  { type: 'enlarge', words: ['enlarge', 'grow', 'giant', 'big', 'expand', 'embiggen'] },
  { type: 'reduce', words: ['reduce', 'shrink', 'tiny', 'small', 'minimize', 'diminish'] },
  { type: 'petrify', words: ['petrify', 'stone', 'medusa', 'basilisk', 'statue', 'flesh to stone'] },
];

/**
 * Detects magic words in a message and returns the effect types to trigger
 * @param message The emote message to scan
 * @returns Array of effect types found in the message
 */
export function detectMagicWords(message: string): MagicEffectType[] {
  const lowerMessage = message.toLowerCase();
  const detectedEffects: MagicEffectType[] = [];

  for (const config of MAGIC_WORD_CONFIG) {
    for (const word of config.words) {
      if (lowerMessage.includes(word)) {
        if (!detectedEffects.includes(config.type)) {
          detectedEffects.push(config.type);
        }
        break; // Found a match for this effect type, move to next
      }
    }
  }

  return detectedEffects;
}

/**
 * Get the primary (first) magic effect from a message
 * @param message The emote message to scan
 * @returns The first effect type found, or null if none
 */
export function getPrimaryMagicEffect(message: string): MagicEffectType | null {
  const effects = detectMagicWords(message);
  return effects.length > 0 ? effects[0] : null;
}

/**
 * Extract target player name from a "hold person <name>" style message
 * @param message The emote message to scan
 * @returns The target player name if found, or null
 */
export function extractHoldTarget(message: string): string | null {
  const lowerMessage = message.toLowerCase();

  // Match "hold person <name>" pattern
  const holdPersonMatch = lowerMessage.match(/hold person\s+(.+)/i);
  if (holdPersonMatch) {
    return holdPersonMatch[1].trim();
  }

  // Match "paralyze <name>" pattern
  const paralyzeMatch = lowerMessage.match(/paralyze\s+(.+)/i);
  if (paralyzeMatch) {
    return paralyzeMatch[1].trim();
  }

  // Match "freeze <name>" pattern
  const freezeMatch = lowerMessage.match(/freeze\s+(.+)/i);
  if (freezeMatch) {
    return freezeMatch[1].trim();
  }

  return null;
}

/**
 * Get the trigger words for a specific effect type
 * @param effectType The magic effect type
 * @returns Array of trigger words, or empty array if not found
 */
export function getSpellWords(effectType: MagicEffectType): string[] {
  const config = MAGIC_WORD_CONFIG.find(c => c.type === effectType);
  return config?.words || [];
}

/**
 * Extract one or multiple target player names from a spell message
 * Supports patterns like:
 * - "petrify bob" -> ["bob"]
 * - "petrify bob, alice, charlie" -> ["bob", "alice", "charlie"]
 * - "petrify bob and alice" -> ["bob", "alice"]
 * - "petrify" (no targets) -> null (self-cast)
 *
 * @param message The emote message to scan
 * @param spellWords Array of words that trigger this spell
 * @returns Array of target names, or null if no targets (self-cast)
 */
export function extractSpellTargets(message: string, spellWords: string[]): string[] | null {
  const lowerMessage = message.toLowerCase();

  for (const spellWord of spellWords) {
    const spellIndex = lowerMessage.indexOf(spellWord.toLowerCase());
    if (spellIndex !== -1) {
      // Get everything after the spell word
      const afterSpell = message.slice(spellIndex + spellWord.length).trim();

      if (!afterSpell) {
        return null; // No targets, self-cast
      }

      // Split by comma, "and", or "&"
      const targets = afterSpell
        .split(/[,&]|\band\b/i)
        .map(t => t.trim())
        .filter(t => t.length > 0);

      return targets.length > 0 ? targets : null;
    }
  }

  return null;
}
