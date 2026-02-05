import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Canvas } from '@react-three/fiber';
import { FloatingXP } from './FloatingXP';

// Wrapper for R3F components
const R3FWrapper = ({ children }: { children: React.ReactNode }) => (
  <Canvas>
    {children}
  </Canvas>
);

describe('FloatingXP', () => {
  // Note: R3F components have limited testability due to WebGL requirements
  // These are smoke tests to ensure components render without errors
  // Visual verification happens during integration testing

  it('renders without errors for vote source', () => {
    expect(() => {
      render(
        <R3FWrapper>
          <FloatingXP
            amount={10}
            source="vote"
            startPosition={[0, 0, 0]}
            onComplete={() => {}}
          />
        </R3FWrapper>
      );
    }).not.toThrow();
  });

  it('renders without errors for consensus source', () => {
    expect(() => {
      render(
        <R3FWrapper>
          <FloatingXP
            amount={50}
            source="consensus"
            startPosition={[0, 0, 0]}
            onComplete={() => {}}
          />
        </R3FWrapper>
      );
    }).not.toThrow();
  });

  it('renders without errors for boss_damage source', () => {
    expect(() => {
      render(
        <R3FWrapper>
          <FloatingXP
            amount={20}
            source="boss_damage"
            startPosition={[0, 0, 0]}
            onComplete={() => {}}
          />
        </R3FWrapper>
      );
    }).not.toThrow();
  });

  it('renders without errors for revival source', () => {
    expect(() => {
      render(
        <R3FWrapper>
          <FloatingXP
            amount={30}
            source="revival"
            startPosition={[0, 0, 0]}
            onComplete={() => {}}
          />
        </R3FWrapper>
      );
    }).not.toThrow();
  });
});
