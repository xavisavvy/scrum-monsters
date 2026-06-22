import { describe, it, expect } from 'vitest';
import { AVATAR_CLASSES, AvatarClass } from './gameEvents';

describe('AVATAR_CLASSES registry', () => {
  it('contains exactly 10 classes', () => {
    expect(Object.keys(AVATAR_CLASSES).length).toBe(10);
  });

  it('carries role, baseDamage, and icon for every class', () => {
    const classes = Object.values(AVATAR_CLASSES);
    for (const def of classes) {
      expect(typeof def.role).toBe('string');
      expect(['tank', 'healer', 'dps']).toContain(def.role);
      expect(typeof def.baseDamage).toBe('number');
      expect(def.baseDamage).toBeGreaterThan(0);
      expect(typeof def.icon).toBe('string');
      expect(def.icon.length).toBeGreaterThan(0);
    }
  });

  it('derives HEALER_CLASSES as exactly {cleric, paladin, bard}', () => {
    const healerClasses = (Object.entries(AVATAR_CLASSES) as [AvatarClass, typeof AVATAR_CLASSES[AvatarClass]][])
      .filter(([, def]) => def.role === 'healer')
      .map(([cls]) => cls);

    expect(healerClasses.sort()).toEqual(['bard', 'cleric', 'paladin'].sort());
  });

  it('has correct baseDamage for tank classes (warrior, paladin, oathbreaker => 15)', () => {
    expect(AVATAR_CLASSES.warrior.baseDamage).toBe(15);
    expect(AVATAR_CLASSES.paladin.baseDamage).toBe(15);
    expect(AVATAR_CLASSES.oathbreaker.baseDamage).toBe(15);
  });

  it('has correct baseDamage for dps classes (ranger, rogue, monk => 20)', () => {
    expect(AVATAR_CLASSES.ranger.baseDamage).toBe(20);
    expect(AVATAR_CLASSES.rogue.baseDamage).toBe(20);
    expect(AVATAR_CLASSES.monk.baseDamage).toBe(20);
  });

  it('has correct baseDamage for glass cannons (sorcerer, wizard => 25)', () => {
    expect(AVATAR_CLASSES.sorcerer.baseDamage).toBe(25);
    expect(AVATAR_CLASSES.wizard.baseDamage).toBe(25);
  });

  it('has correct baseDamage for healer classes (cleric, bard => 12)', () => {
    expect(AVATAR_CLASSES.cleric.baseDamage).toBe(12);
    expect(AVATAR_CLASSES.bard.baseDamage).toBe(12);
  });

  it('monk icon is 🥋', () => {
    expect(AVATAR_CLASSES.monk.icon).toBe('🥋');
  });

  it('non-healer classes do not have healer role', () => {
    expect(AVATAR_CLASSES.warrior.role).not.toBe('healer');
    expect(AVATAR_CLASSES.ranger.role).not.toBe('healer');
    expect(AVATAR_CLASSES.wizard.role).not.toBe('healer');
  });
});
