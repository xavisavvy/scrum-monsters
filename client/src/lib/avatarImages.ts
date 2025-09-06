import { AvatarClass } from './gameTypes';

// Map of available avatar images
const AVATAR_IMAGES: Record<string, string> = {
  bard: '/avatars/bard.png',
  cleric: '/avatars/cleric.png', 
  monk: '/avatars/monk.png',
  paladin: '/avatars/paladin.png',
  ranger: '/avatars/ranger.png',
  rogue: '/avatars/rogue.png',
  sorcerer: '/avatars/sorcerer.png',
  warrior: '/avatars/warrior.png',
  wizard: '/avatars/wizard.png'
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