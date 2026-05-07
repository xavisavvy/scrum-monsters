import { useEffect, useRef } from 'react';
import {
  useTutorial,
  TUTORIAL_STEPS,
  type TutorialStep,
} from '@/lib/stores/useTutorial';
import { useGameState } from '@/lib/stores/useGameState';
import { useHintTarget } from '@/lib/hooks/useHintTarget';
import { SpotlightMask } from './SpotlightMask';
import { HintBubble } from './HintBubble';

// Re-export for any legacy consumers; canonical home is now useTutorial.tsx.
export type { TutorialStep };

export function TutorialOverlay() {
  const activeTutorial = useTutorial((s) => s.activeTutorial);
  const activeStep = useTutorial((s) => s.activeStep);
  const isSpotlightVisible = useTutorial((s) => s.isSpotlightVisible);
  const isHydrated = useTutorial((s) => s.isHydrated);
  const advanceStep = useTutorial((s) => s.advanceStep);
  const completeTutorial = useTutorial((s) => s.completeTutorial);
  const startTutorial = useTutorial((s) => s.startTutorial);
  const completedTutorials = useTutorial((s) => s.completedTutorials);

  const currentPhase = useGameState((s) => s.currentLobby?.gamePhase);

  const { targetRect, locateTarget } = useHintTarget();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStartedPhaseRef = useRef<string | null>(null);

  const steps: TutorialStep[] = activeTutorial
    ? (TUTORIAL_STEPS[activeTutorial] ?? [])
    : [];
  const currentStep = steps[activeStep] ?? null;
  const isLastStep = activeStep >= steps.length - 1;

  // Auto-start walkthrough on phase entry (Pitfall 6: in-flight tutorial wins).
  useEffect(() => {
    if (!currentPhase) return;
    if (!isHydrated) return;
    if (activeTutorial) return;
    const tutorialId = `walkthrough:${currentPhase}`;
    if (!TUTORIAL_STEPS[tutorialId]) return;
    if (completedTutorials[tutorialId]) return;
    if (lastStartedPhaseRef.current === currentPhase) return;
    lastStartedPhaseRef.current = currentPhase;
    startTutorial(tutorialId);
  }, [
    currentPhase,
    isHydrated,
    activeTutorial,
    completedTutorials,
    startTutorial,
  ]);

  // Locate target after phase transition animation (350ms).
  // If target missing, apply self-skip policy:
  //   - hint:* → completeTutorial (clears zombie state)
  //   - walkthrough:* with next step → advanceStep
  //   - walkthrough:* on last step → completeTutorial
  useEffect(() => {
    if (!currentStep) return;

    timeoutRef.current = setTimeout(() => {
      const rect = locateTarget(currentStep.targetId);
      if (rect !== null) return;

      if (activeTutorial?.startsWith('hint:')) {
        completeTutorial(activeTutorial);
        return;
      }

      if (activeTutorial?.startsWith('walkthrough:')) {
        const onLastStep = activeStep >= steps.length - 1;
        if (onLastStep) {
          completeTutorial(activeTutorial);
        } else {
          advanceStep();
        }
      }
    }, 350);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [
    activeTutorial,
    activeStep,
    currentStep,
    steps.length,
    locateTarget,
    completeTutorial,
    advanceStep,
  ]);

  // Hydration guard
  if (!isHydrated) return null;

  // No active tutorial
  if (!activeTutorial) return null;

  // No steps defined
  if (steps.length === 0) return null;

  const handleNext = () => {
    if (isLastStep) {
      completeTutorial(activeTutorial);
    } else {
      advanceStep();
    }
  };

  const handleDismiss = () => {
    completeTutorial(activeTutorial);
  };

  const stepLabel =
    steps.length > 1 ? `Step ${activeStep + 1} of ${steps.length}` : undefined;

  return (
    <>
      <SpotlightMask
        targetRect={targetRect}
        visible={isSpotlightVisible}
        onClickOverlay={handleDismiss}
      />
      <HintBubble
        targetRect={targetRect}
        text={currentStep?.text ?? ''}
        position={currentStep?.position}
        narrator={currentStep?.narrator}
        onNext={handleNext}
        onDismiss={steps.length > 1 ? handleDismiss : undefined}
        stepLabel={stepLabel}
      />
    </>
  );
}
