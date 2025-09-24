import React from 'react';
import { GamePhase } from '@shared/gameEvents';
import { PhaseComponentProps } from './index';
import { BattlePhase } from './BattlePhase';
import { RevealPhase } from './RevealPhase';
import { DiscussionPhase } from './DiscussionPhase';
import { VictoryPhase } from './VictoryPhase';
import { NextLevelPhase } from './NextLevelPhase';

export interface PhaseConfig {
  name: string;
  component: React.ComponentType<PhaseComponentProps>;
  description: string;
  supportsTransitions: boolean;
  requiresBoss: boolean;
  requiresPlayer: boolean;
}

/**
 * Registry of all available game phases.
 * This makes it easy to add, remove, or modify phases without touching the core rendering logic.
 */
export class PhaseRegistry {
  private static phases = new Map<GamePhase, PhaseConfig>();

  static {
    // Register all available phases
    this.register('battle', {
      name: 'Battle',
      component: BattlePhase,
      description: 'Active combat phase where players submit estimates and attack the boss',
      supportsTransitions: true,
      requiresBoss: true,
      requiresPlayer: true
    });

    this.register('reveal', {
      name: 'Reveal',
      component: RevealPhase,
      description: 'Transitional phase showing estimate reveal animation',
      supportsTransitions: true,
      requiresBoss: false,
      requiresPlayer: false
    });

    this.register('discussion', {
      name: 'Discussion',
      component: DiscussionPhase,
      description: 'Discussion phase where players review and update their estimates',
      supportsTransitions: true,
      requiresBoss: true,
      requiresPlayer: false
    });

    this.register('victory', {
      name: 'Victory',
      component: VictoryPhase,
      description: 'Final victory screen showing complete game results',
      supportsTransitions: false,
      requiresBoss: false,
      requiresPlayer: false
    });

    this.register('next_level', {
      name: 'Next Level',
      component: NextLevelPhase,
      description: 'Transition screen between completed objectives',
      supportsTransitions: true,
      requiresBoss: false,
      requiresPlayer: false
    });
  }

  /**
   * Register a new phase component
   */
  static register(phase: GamePhase, config: PhaseConfig): void {
    this.phases.set(phase, config);
  }

  /**
   * Unregister a phase (useful for removing phases or during testing)
   */
  static unregister(phase: GamePhase): boolean {
    return this.phases.delete(phase);
  }

  /**
   * Get phase configuration
   */
  static getConfig(phase: GamePhase): PhaseConfig | undefined {
    return this.phases.get(phase);
  }

  /**
   * Get phase component
   */
  static getComponent(phase: GamePhase): React.ComponentType<PhaseComponentProps> | undefined {
    return this.phases.get(phase)?.component;
  }

  /**
   * Get all registered phases
   */
  static getAllPhases(): Array<{ phase: GamePhase; config: PhaseConfig }> {
    return Array.from(this.phases.entries()).map(([phase, config]) => ({ phase, config }));
  }

  /**
   * Check if a phase exists
   */
  static hasPhase(phase: GamePhase): boolean {
    return this.phases.has(phase);
  }

  /**
   * Validate phase requirements
   */
  static validatePhase(phase: GamePhase, context: {
    hasBoss: boolean;
    hasPlayer: boolean;
  }): { valid: boolean; missingRequirements: string[] } {
    const config = this.getConfig(phase);
    if (!config) {
      return { valid: false, missingRequirements: ['Phase not registered'] };
    }

    const missingRequirements: string[] = [];

    if (config.requiresBoss && !context.hasBoss) {
      missingRequirements.push('Boss data required');
    }

    if (config.requiresPlayer && !context.hasPlayer) {
      missingRequirements.push('Player data required');
    }

    return {
      valid: missingRequirements.length === 0,
      missingRequirements
    };
  }

  /**
   * Get phases that support transitions
   */
  static getTransitionablePhases(): GamePhase[] {
    return Array.from(this.phases.entries())
      .filter(([, config]) => config.supportsTransitions)
      .map(([phase]) => phase);
  }
}

/**
 * Hook for accessing phase registry data
 */
export function usePhaseRegistry() {
  return {
    getConfig: PhaseRegistry.getConfig.bind(PhaseRegistry),
    getComponent: PhaseRegistry.getComponent.bind(PhaseRegistry),
    hasPhase: PhaseRegistry.hasPhase.bind(PhaseRegistry),
    validatePhase: PhaseRegistry.validatePhase.bind(PhaseRegistry),
    getAllPhases: PhaseRegistry.getAllPhases.bind(PhaseRegistry),
    getTransitionablePhases: PhaseRegistry.getTransitionablePhases.bind(PhaseRegistry)
  };
}