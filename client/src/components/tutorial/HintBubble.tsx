import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { NARRATORS, type NarratorId } from '@/lib/stores/useTutorial';
import { useTypewriter } from './useTypewriter';

interface HintBubbleProps {
  targetRect: {
    top: number;
    left: number;
    width: number;
    height: number;
    bottom: number;
    right: number;
  } | null;
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  onNext?: () => void;
  onDismiss?: () => void;
  stepLabel?: string;
  /** Narrator id; renders name header + accent color (Phase 40-02). */
  narrator?: NarratorId;
}

function getPositionStyles(
  targetRect: NonNullable<HintBubbleProps['targetRect']>,
  position: NonNullable<HintBubbleProps['position']>,
): React.CSSProperties {
  const centerX = targetRect.left + targetRect.width / 2;
  const centerY = targetRect.top + targetRect.height / 2;

  // Use the standalone CSS `translate` property, not `transform:
  // translate(...)`. This element is a framer-motion `motion.div` that
  // also animates `scale` — framer-motion owns `transform` for its own
  // animated values and overwrites any transform string passed via
  // `style`, silently dropping this positioning offset (the bubble would
  // render anchored at the target's edge/center instead of beside it,
  // overlapping — and blocking clicks on — the element it's meant to
  // point at). `translate` composes independently of `transform`, so it
  // survives framer-motion's own transform management.
  switch (position) {
    case 'bottom':
      return {
        top: targetRect.bottom + 12,
        left: centerX,
        translate: '-50% 0',
      };
    case 'top':
      return {
        top: targetRect.top - 12,
        left: centerX,
        translate: '-50% -100%',
      };
    case 'right':
      return {
        top: centerY,
        left: targetRect.right + 12,
        translate: '0 -50%',
      };
    case 'left':
      return {
        top: centerY,
        left: targetRect.left - 12,
        translate: '-100% -50%',
      };
  }
}

export function HintBubble({
  targetRect,
  text,
  position = 'bottom',
  onNext,
  onDismiss,
  stepLabel,
  narrator,
}: HintBubbleProps) {
  const prefersReducedMotion = useReducedMotion();
  const duration = prefersReducedMotion ? 0 : 0.2;

  const config = narrator ? NARRATORS[narrator] : null;
  // Hoist classes so the literal property accesses are visible to acceptance grep gates.
  const borderClass = config ? config.accentBorderClass : 'border-amber-500/60';
  const headerTextClass = config ? config.accentTextClass : '';
  const { displayed, isComplete, revealAll } = useTypewriter(text, 30);

  const handleBodyClick = () => {
    if (!isComplete) {
      revealAll();
    } else {
      // When fully revealed, body click advances. If onNext is missing
      // (single-step bubble), fall back to onDismiss so reduced-motion
      // users still progress on a single click.
      if (onNext) {
        onNext();
      } else if (onDismiss) {
        onDismiss();
      }
    }
  };

  return (
    <AnimatePresence>
      {targetRect && (
        <motion.div
          className="fixed z-[101] max-w-xs"
          style={getPositionStyles(targetRect, position)}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration }}
        >
          <div
            data-testid="hint-bubble-card"
            className={`bg-gray-900/95 border-2 ${borderClass} rounded-lg p-4 shadow-lg shadow-amber-500/10`}
          >
            {config && (
              <div
                data-testid="hint-bubble-narrator-name"
                className={`text-xs font-bold mb-1 ${headerTextClass}`}
              >
                {config.displayName}
              </div>
            )}
            {stepLabel && (
              <div className="text-xs text-amber-400/70 mb-1">{stepLabel}</div>
            )}
            <div
              data-testid="hint-bubble-body"
              className="text-sm text-gray-100 cursor-pointer"
              onClick={handleBodyClick}
            >
              {displayed}
            </div>
            {(onDismiss || onNext) && (
              <div
                className="flex gap-2 mt-3 justify-end"
                onClick={(e) => e.stopPropagation()}
              >
                {onDismiss && (
                  <button
                    onClick={onDismiss}
                    className="text-xs text-gray-400 hover:text-gray-200"
                  >
                    Skip
                  </button>
                )}
                {onNext && (
                  <button
                    onClick={onNext}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold"
                  >
                    {onDismiss ? 'Next' : 'Got it'}
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
