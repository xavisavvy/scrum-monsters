import { AnimatePresence, motion } from 'framer-motion';
import type { ActiveInterstitial } from '@/lib/hooks/usePhaseInterstitial';

interface PhaseInterstitialProps {
  activeInterstitial: ActiveInterstitial | null;
  onDismiss: () => void;
}

/**
 * Fullscreen JRPG-themed interstitial overlay that displays phase transition text.
 * Purely presentational — timing and state are managed by usePhaseInterstitial hook.
 * Click anywhere to dismiss early.
 */
export function PhaseInterstitial({ activeInterstitial, onDismiss }: PhaseInterstitialProps) {
  return (
    <AnimatePresence>
      {activeInterstitial && (
        <motion.div
          key="phase-interstitial"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onDismiss}
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-4">
            <motion.h1
              className="font-jrpg text-3xl md:text-5xl font-bold text-yellow-400 text-center"
              style={{
                textShadow:
                  '0 0 20px rgba(250, 204, 21, 0.6), 0 0 40px rgba(250, 204, 21, 0.3)',
              }}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              {activeInterstitial.text}
            </motion.h1>

            {activeInterstitial.subtext && (
              <motion.p
                className="font-jrpg text-sm md:text-base text-gray-300 text-center"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                {activeInterstitial.subtext}
              </motion.p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
