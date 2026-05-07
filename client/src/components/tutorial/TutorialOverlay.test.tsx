import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useTutorial } from '@/lib/stores/useTutorial';

// Hoisted mocks
const locateTargetMock = vi.fn<(id: string) => DOMRect | null>(() => null);

vi.mock('@/lib/hooks/useHintTarget', () => ({
  useHintTarget: () => ({
    targetRect: null,
    locateTarget: locateTargetMock,
    trackTarget: vi.fn(),
  }),
}));

// Phase mock — controllable per test via setMockPhase
let mockPhase: string | undefined = undefined;
const setMockPhase = (p: string | undefined) => { mockPhase = p; };

vi.mock('@/lib/stores/useGameState', () => ({
  useGameState: (selector: (s: unknown) => unknown) => {
    const state = { currentLobby: mockPhase ? { gamePhase: mockPhase } : null };
    return selector(state);
  },
}));

// Stub child components to avoid rendering complications
vi.mock('./SpotlightMask', () => ({
  SpotlightMask: () => null,
}));
vi.mock('./HintBubble', () => ({
  HintBubble: () => null,
}));

// Import AFTER mocks
import { TutorialOverlay } from './TutorialOverlay';

// Capture pristine action references once so each test gets clean spies.
const PRISTINE = {
  startTutorial: useTutorial.getState().startTutorial,
  advanceStep: useTutorial.getState().advanceStep,
  completeTutorial: useTutorial.getState().completeTutorial,
  dismissHint: useTutorial.getState().dismissHint,
  resetTutorial: useTutorial.getState().resetTutorial,
  resetAllTutorials: useTutorial.getState().resetAllTutorials,
};

describe('TutorialOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    locateTargetMock.mockReset();
    locateTargetMock.mockReturnValue(null);
    setMockPhase(undefined);
    useTutorial.setState({
      ...PRISTINE,
      completedTutorials: {},
      completedHints: {},
      version: 1,
      activeTutorial: null,
      activeStep: 0,
      isSpotlightVisible: false,
      isHydrated: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('auto-starts walkthrough when entering a phase with steps and not completed', () => {
    setMockPhase('lobby');
    const startSpy = vi.spyOn(useTutorial.getState(), 'startTutorial');
    // Use setState to swap startTutorial with a spy-wrapped version
    const realStart = useTutorial.getState().startTutorial;
    const spy = vi.fn(realStart);
    useTutorial.setState({ startTutorial: spy });

    render(<TutorialOverlay />);

    expect(spy).toHaveBeenCalledWith('walkthrough:lobby');
    startSpy.mockRestore();
  });

  it('does not auto-start when activeTutorial is already set', () => {
    setMockPhase('lobby');
    const realStart = useTutorial.getState().startTutorial;
    const spy = vi.fn(realStart);
    useTutorial.setState({ startTutorial: spy, activeTutorial: 'hint:foo', activeStep: 0 });

    render(<TutorialOverlay />);

    expect(spy).not.toHaveBeenCalled();
  });

  it('does not auto-start when completedTutorials[id] is true', () => {
    setMockPhase('lobby');
    const realStart = useTutorial.getState().startTutorial;
    const spy = vi.fn(realStart);
    useTutorial.setState({
      startTutorial: spy,
      completedTutorials: { 'walkthrough:lobby': true },
    });

    render(<TutorialOverlay />);

    expect(spy).not.toHaveBeenCalled();
  });

  it('auto-skips a hint (completeTutorial) when target rect is null after 350ms', () => {
    setMockPhase('battle');
    const realComplete = useTutorial.getState().completeTutorial;
    const completeSpy = vi.fn(realComplete);
    useTutorial.setState({
      completeTutorial: completeSpy,
      activeTutorial: 'hint:first-combo',
      activeStep: 0,
      completedTutorials: { 'walkthrough:battle': true }, // prevent walkthrough auto-start
    });
    locateTargetMock.mockReturnValue(null);

    render(<TutorialOverlay />);
    vi.advanceTimersByTime(400);

    expect(completeSpy).toHaveBeenCalledWith('hint:first-combo');
  });

  it('auto-advances a walkthrough (nextStep) when target rect is null after 350ms and a next step exists', () => {
    setMockPhase('lobby');
    const realAdvance = useTutorial.getState().advanceStep;
    const advanceSpy = vi.fn(realAdvance);
    const realComplete = useTutorial.getState().completeTutorial;
    const completeSpy = vi.fn(realComplete);
    useTutorial.setState({
      advanceStep: advanceSpy,
      completeTutorial: completeSpy,
      activeTutorial: 'walkthrough:lobby',
      activeStep: 0, // 3 steps total, step 0 is not last
    });
    locateTargetMock.mockReturnValue(null);

    render(<TutorialOverlay />);
    vi.advanceTimersByTime(400);

    expect(advanceSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('auto-completes a walkthrough when target rect is null after 350ms on the last step', () => {
    setMockPhase('lobby');
    const realAdvance = useTutorial.getState().advanceStep;
    const advanceSpy = vi.fn(realAdvance);
    const realComplete = useTutorial.getState().completeTutorial;
    const completeSpy = vi.fn(realComplete);
    useTutorial.setState({
      advanceStep: advanceSpy,
      completeTutorial: completeSpy,
      activeTutorial: 'walkthrough:lobby',
      activeStep: 2, // last index for 3-step walkthrough
    });
    locateTargetMock.mockReturnValue(null);

    render(<TutorialOverlay />);
    vi.advanceTimersByTime(400);

    expect(completeSpy).toHaveBeenCalledWith('walkthrough:lobby');
    expect(advanceSpy).not.toHaveBeenCalled();
  });

  it('does not advance/complete a walkthrough when target rect resolves to a real DOMRect', () => {
    setMockPhase('lobby');
    const realAdvance = useTutorial.getState().advanceStep;
    const advanceSpy = vi.fn(realAdvance);
    const realComplete = useTutorial.getState().completeTutorial;
    const completeSpy = vi.fn(realComplete);
    useTutorial.setState({
      advanceStep: advanceSpy,
      completeTutorial: completeSpy,
      activeTutorial: 'walkthrough:lobby',
      activeStep: 0,
    });
    // Return a fake rect (non-null)
    const fakeRect = {
      top: 0, left: 0, width: 10, height: 10, bottom: 10, right: 10,
      x: 0, y: 0, toJSON: () => ({}),
    } as unknown as DOMRect;
    locateTargetMock.mockReturnValue(fakeRect);

    render(<TutorialOverlay />);
    vi.advanceTimersByTime(400);

    expect(advanceSpy).not.toHaveBeenCalled();
    expect(completeSpy).not.toHaveBeenCalled();
  });
});
