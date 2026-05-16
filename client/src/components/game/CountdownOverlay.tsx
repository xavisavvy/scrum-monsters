import { useGameState } from '@/lib/stores/useGameState';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * JRPG-style countdown overlay displayed during team attack countdown.
 * Shows "LIMIT BREAK" label, countdown number with pulse animation,
 * and damage multiplier display.
 */
export function CountdownOverlay() {
  const countdown = useGameState((state) => state.countdown);
  const overlayRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (countdown?.active && numberRef.current) {
      // Pulse animation on each tick
      gsap.fromTo(
        numberRef.current,
        { scale: 1.5, opacity: 1 },
        { scale: 1, opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
    }
  }, [countdown?.remainingSeconds, countdown?.active]);

  // Don't render if no countdown
  if (!countdown) {
    return null;
  }

  // Don't render during the gap between active and complete (shouldn't happen but safety check)
  if (!countdown.active && countdown.remainingSeconds > 0) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center pointer-events-none"
      style={{
        background: countdown.active
          ? 'radial-gradient(circle, rgba(255,215,0,0.2) 0%, rgba(0,0,0,0.8) 100%)'
          : 'radial-gradient(circle, rgba(255,100,0,0.3) 0%, rgba(0,0,0,0.9) 100%)',
      }}
    >
      {/* LIMIT BREAK Label */}
      <div className="text-yellow-400 text-4xl font-bold tracking-widest mb-4 animate-pulse">
        LIMIT BREAK
      </div>

      {/* Countdown Number */}
      <div
        ref={numberRef}
        className="text-9xl font-bold text-white"
        style={{
          textShadow: '0 0 40px rgba(255,215,0,0.8), 0 0 80px rgba(255,100,0,0.6)',
        }}
      >
        {countdown.active ? countdown.remainingSeconds : 'STRIKE!'}
      </div>

      {/* Multiplier Display */}
      <div className="mt-8 text-3xl font-bold">
        <span className="text-gray-300">Damage: </span>
        <span
          className="text-yellow-400"
          style={{
            textShadow: '0 0 20px rgba(255,215,0,0.8)',
          }}
        >
          {countdown.multiplier.toFixed(1)}x
        </span>
      </div>

      {/* Urgency message when multiplier is dropping fast */}
      {countdown.active && countdown.remainingSeconds <= 3 && (
        <div className="mt-4 text-red-400 text-xl font-bold animate-bounce">
          Multiplier dropping!
        </div>
      )}
    </div>
  );
}
