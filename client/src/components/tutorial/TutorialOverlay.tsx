import { useEffect, useRef } from 'react';
import { useTutorial } from '@/lib/stores/useTutorial';
import { useHintTarget } from '@/lib/hooks/useHintTarget';
import { SpotlightMask } from './SpotlightMask';
import { HintBubble } from './HintBubble';

export interface TutorialStep {
  targetId: string;
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

/** Placeholder — Phase 40 will populate with actual tutorial content. */
const TUTORIAL_STEPS: Record<string, TutorialStep[]> = {};

export function TutorialOverlay() {
  const {
    activeTutorial,
    activeStep,
    isSpotlightVisible,
    isHydrated,
    advanceStep,
    completeTutorial,
  } = useTutorial();

  const { targetRect, locateTarget } = useHintTarget();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const steps = activeTutorial ? (TUTORIAL_STEPS[activeTutorial] ?? []) : [];
  const currentStep = steps[activeStep] ?? null;
  const isLastStep = activeStep >= steps.length - 1;

  // Locate target element after phase transition animation (350ms delay)
  useEffect(() => {
    if (!currentStep) return;

    timeoutRef.current = setTimeout(() => {
      locateTarget(currentStep.targetId);
    }, 350);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [activeTutorial, activeStep, currentStep, locateTarget]);

  // Hydration guard
  if (!isHydrated) return null;

  // No active tutorial
  if (!activeTutorial) return null;

  // No steps defined yet (Phase 40 will add content)
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
        onNext={handleNext}
        onDismiss={steps.length > 1 ? handleDismiss : undefined}
        stepLabel={stepLabel}
      />
    </>
  );
}
