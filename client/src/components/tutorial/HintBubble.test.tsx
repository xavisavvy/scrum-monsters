import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';

// In component tests we want full text rendered immediately (no typewriter
// animation) and click-to-advance with no intermediate reveal click.
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: () => true };
});

import { HintBubble } from './HintBubble';

const TARGET_RECT = {
  top: 100,
  left: 100,
  width: 80,
  height: 40,
  bottom: 140,
  right: 180,
};

describe('HintBubble', () => {
  it('renders Guild Master name and amber accent classes when narrator=guild_master', () => {
    render(
      <HintBubble
        targetRect={TARGET_RECT}
        text="Welcome adventurer"
        narrator="guild_master"
        onNext={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByTestId('hint-bubble-narrator-name')).toHaveTextContent('Guild Master');
    const card = screen.getByTestId('hint-bubble-card');
    expect(card.className).toContain('border-amber-500/60');
    expect(screen.getByTestId('hint-bubble-narrator-name').className).toContain('text-amber-400');
  });

  it('renders Battle Advisor name and red accent classes when narrator=battle_advisor', () => {
    render(
      <HintBubble
        targetRect={TARGET_RECT}
        text="Target acquired"
        narrator="battle_advisor"
        onNext={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByTestId('hint-bubble-narrator-name')).toHaveTextContent('Battle Advisor');
    const card = screen.getByTestId('hint-bubble-card');
    expect(card.className).toContain('border-red-500/60');
    expect(screen.getByTestId('hint-bubble-narrator-name').className).toContain('text-red-400');
  });

  it('renders Sage name and purple accent classes when narrator=sage', () => {
    render(
      <HintBubble
        targetRect={TARGET_RECT}
        text="The voice of many"
        narrator="sage"
        onNext={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByTestId('hint-bubble-narrator-name')).toHaveTextContent('Sage');
    const card = screen.getByTestId('hint-bubble-card');
    expect(card.className).toContain('border-purple-500/60');
    expect(screen.getByTestId('hint-bubble-narrator-name').className).toContain('text-purple-400');
  });

  it('omits the name header when narrator is undefined (back-compat)', () => {
    render(
      <HintBubble
        targetRect={TARGET_RECT}
        text="No narrator here"
        onNext={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('hint-bubble-narrator-name')).toBeNull();
    // Body still renders
    expect(screen.getByTestId('hint-bubble-body')).toHaveTextContent('No narrator here');
  });

  it('clicking body when isComplete (reduced-motion makes this true on render) calls onNext', () => {
    const onNext = vi.fn();
    render(
      <HintBubble
        targetRect={TARGET_RECT}
        text="Long enough to type"
        narrator="guild_master"
        onNext={onNext}
        onDismiss={vi.fn()}
      />,
    );

    const body = screen.getByTestId('hint-bubble-body');
    fireEvent.click(body);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('clicking the Next button calls onNext exactly once and does NOT also trigger body handler (no double fire)', () => {
    const onNext = vi.fn();
    render(
      <HintBubble
        targetRect={TARGET_RECT}
        text="Next button test"
        narrator="guild_master"
        onNext={onNext}
        onDismiss={vi.fn()}
      />,
    );

    const nextBtn = screen.getByText('Next');
    fireEvent.click(nextBtn);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('under reduced-motion, a single body click advances without an intermediate reveal click', () => {
    const onNext = vi.fn();
    const text = 'Long enough to type';
    render(
      <HintBubble
        targetRect={TARGET_RECT}
        text={text}
        narrator="guild_master"
        onNext={onNext}
        onDismiss={vi.fn()}
      />,
    );

    // Full text shown immediately under reduced-motion
    expect(screen.getByTestId('hint-bubble-body')).toHaveTextContent(text);

    // Single body click advances — NO intermediate reveal click required
    fireEvent.click(screen.getByTestId('hint-bubble-body'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('under reduced-motion on a single-step bubble (no onNext, only onDismiss), a single body click dismisses', () => {
    const onDismiss = vi.fn();
    render(
      <HintBubble
        targetRect={TARGET_RECT}
        text="Single step hint"
        narrator="sage"
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByTestId('hint-bubble-body'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
