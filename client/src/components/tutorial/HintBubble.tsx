import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

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
}

function getPositionStyles(
  targetRect: NonNullable<HintBubbleProps['targetRect']>,
  position: NonNullable<HintBubbleProps['position']>,
): React.CSSProperties {
  const centerX = targetRect.left + targetRect.width / 2;
  const centerY = targetRect.top + targetRect.height / 2;

  switch (position) {
    case 'bottom':
      return {
        top: targetRect.bottom + 12,
        left: centerX,
        transform: 'translateX(-50%)',
      };
    case 'top':
      return {
        top: targetRect.top - 12,
        left: centerX,
        transform: 'translate(-50%, -100%)',
      };
    case 'right':
      return {
        top: centerY,
        left: targetRect.right + 12,
        transform: 'translateY(-50%)',
      };
    case 'left':
      return {
        top: centerY,
        left: targetRect.left - 12,
        transform: 'translate(-100%, -50%)',
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
}: HintBubbleProps) {
  const prefersReducedMotion = useReducedMotion();
  const duration = prefersReducedMotion ? 0 : 0.2;

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
          <div className="bg-gray-900/95 border-2 border-amber-500/60 rounded-lg p-4 shadow-lg shadow-amber-500/10">
            {stepLabel && (
              <div className="text-xs text-amber-400/70 mb-1">{stepLabel}</div>
            )}
            <div className="text-sm text-gray-100">{text}</div>
            {(onDismiss || onNext) && (
              <div className="flex gap-2 mt-3 justify-end">
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
