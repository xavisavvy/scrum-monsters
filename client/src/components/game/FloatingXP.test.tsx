import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FloatingXP } from './FloatingXP';

describe('FloatingXP', () => {
  it('renders without errors for vote source', () => {
    expect(() => {
      render(
        <FloatingXP
          amount={10}
          source="vote"
          startPosition={{ x: 100, y: 200 }}
          onComplete={() => {}}
        />
      );
    }).not.toThrow();
  });

  it('renders without errors for consensus source', () => {
    expect(() => {
      render(
        <FloatingXP
          amount={50}
          source="consensus"
          startPosition={{ x: 100, y: 200 }}
          onComplete={() => {}}
        />
      );
    }).not.toThrow();
  });

  it('renders without errors for boss_damage source', () => {
    expect(() => {
      render(
        <FloatingXP
          amount={20}
          source="boss_damage"
          startPosition={{ x: 100, y: 200 }}
          onComplete={() => {}}
        />
      );
    }).not.toThrow();
  });

  it('renders without errors for revival source', () => {
    expect(() => {
      render(
        <FloatingXP
          amount={30}
          source="revival"
          startPosition={{ x: 100, y: 200 }}
          onComplete={() => {}}
        />
      );
    }).not.toThrow();
  });
});
