import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface SpotlightMaskProps {
  targetRect: { top: number; left: number; width: number; height: number } | null;
  visible: boolean;
  padding?: number;
  onClickOverlay?: () => void;
}

export function SpotlightMask({
  targetRect,
  visible,
  padding = 8,
  onClickOverlay,
}: SpotlightMaskProps) {
  const prefersReducedMotion = useReducedMotion();
  const duration = prefersReducedMotion ? 0 : 0.3;

  return (
    <AnimatePresence>
      {visible && targetRect && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration }}
          onClick={onClickOverlay}
        >
          <svg width="100%" height="100%">
            <defs>
              <mask id="spotlight-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.left - padding}
                  y={targetRect.top - padding}
                  width={targetRect.width + padding * 2}
                  height={targetRect.height + padding * 2}
                  rx={8}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.75)"
              mask="url(#spotlight-mask)"
            />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
