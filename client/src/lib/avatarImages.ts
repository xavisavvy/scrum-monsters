import { AvatarClass } from './gameTypes';

// Map of available avatar images (organized in public/images/avatars/)
const AVATAR_IMAGES: Record<string, string> = {
  bard: '/images/avatars/bard.png',
  cleric: '/images/avatars/cleric.png', 
  monk: '/images/avatars/monk.png',
  oathbreaker: '/images/avatars/oathbreaker.png',
  paladin: '/images/avatars/paladin.png',
  ranger: '/images/avatars/ranger.png',
  rogue: '/images/avatars/rogue.png',
  sorcerer: '/images/avatars/sorcerer.png',
  warrior: '/images/avatars/warrior.png',
  wizard: '/images/avatars/wizard.png'
};

/**
 * Get the static avatar image URL for a given class
 * Returns null if no image exists for that class
 */
export function getAvatarImage(avatarClass: AvatarClass): string | null {
  return AVATAR_IMAGES[avatarClass] || null;
}

/**
 * Check if an avatar image exists for the given class
 */
export function hasAvatarImage(avatarClass: AvatarClass): boolean {
  return avatarClass in AVATAR_IMAGES;
}