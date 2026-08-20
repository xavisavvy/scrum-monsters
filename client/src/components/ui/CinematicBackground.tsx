import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';

interface CinematicBackgroundProps {
  className?: string;
}

const BOSS_LAIR_IMAGES = [
  '/images/lairs/cave-lair.png',
  '/images/lairs/volcano-lair.png',
  '/images/lairs/clocktower-lair.png',
  '/images/lairs/golem_temple-lair.png',
  '/images/lairs/void-lair.png',
];

// Timing constants for smooth cinematic experience
const DISPLAY_DURATION = 5000; // 5 seconds per image
const CROSSFADE_DURATION = 2000; // 2 second smooth crossfade

/**
 * Test-only escape hatch: `useReducedMotion()` gates the crossfade on
 * `matchMedia`, which Playwright emulates over CDP. Under CI resource
 * contention that emulation can race against this module's first
 * evaluation, occasionally leaving the crossfade running in a supposedly
 * reduced-motion test and producing a nondeterministic background image
 * in visual regression screenshots. e2e/visual/lobby.visual.spec.ts sets
 * this via `page.addInitScript` — guaranteed to run before any page
 * script, so unlike matchMedia it can't lose a timing race.
 */
function crossfadeDisabledForTests(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as { __DISABLE_CINEMATIC_CROSSFADE__?: boolean }).__DISABLE_CINEMATIC_CROSSFADE__ === true
  );
}

export function CinematicBackground({ className = '' }: CinematicBackgroundProps) {
  const prefersReducedMotion = useReducedMotion() || crossfadeDisabledForTests();
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState(-1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
  }, []);

  // Handle smooth crossfade cycling
  const startCrossfade = useCallback(() => {
    setIsTransitioning(true);
    const nextIndex = (activeIndex + 1) % BOSS_LAIR_IMAGES.length;
    setPrevIndex(activeIndex);
    
    // After crossfade completes, update active index
    transitionTimeoutRef.current = setTimeout(() => {
      setActiveIndex(nextIndex);
      setPrevIndex(-1);
      setIsTransitioning(false);
    }, CROSSFADE_DURATION);
  }, [activeIndex]);

  // Setup cycling with seamless timing. Skipped entirely when the user
  // prefers reduced motion, leaving the background on the first lair image
  // instead of continuously crossfading/panning.
  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    intervalRef.current = setInterval(startCrossfade, DISPLAY_DURATION);
    return cleanup;
  }, [startCrossfade, cleanup, prefersReducedMotion]);

  // Get seamless animation style for each layer
  const getLayerStyle = (imageIndex: number): React.CSSProperties => {
    // Alternating pan directions: even indices pan left, odd indices pan right
    const isEven = imageIndex % 2 === 0;
    const animationName = isEven ? 'cinematic-pan-left' : 'cinematic-pan-right';
    
    // Determine opacity for smooth crossfading
    let opacity = 0;
    if (imageIndex === activeIndex) {
      opacity = 1; // Currently active image
    } else if (imageIndex === prevIndex && isTransitioning) {
      opacity = 0; // Previous image fades out (CSS transition handles this)
    } else if (imageIndex === (activeIndex + 1) % BOSS_LAIR_IMAGES.length && isTransitioning) {
      opacity = 1; // Next image fades in
    }
    
    return {
      backgroundImage: `url(${BOSS_LAIR_IMAGES[imageIndex]})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      opacity,
      transition: `opacity ${CROSSFADE_DURATION}ms ease-in-out`,
      // Skip the continuous pan when reduced motion is preferred — both a
      // real accessibility fix (this ran unconditionally regardless of the
      // user's OS-level preference) and a determinism fix: an infinite,
      // alternating-direction animation forced to 0s duration (as visual
      // regression tests do) resolves inconsistently across browser
      // engines, since which iteration/direction it's "at" is ambiguous.
      ...(prefersReducedMotion
        ? { animationName: 'none' }
        : {
            animationName,
            animationDuration: '28s', // Longer duration for seamless looping
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            animationDirection: 'alternate', // Prevents jarring position resets
          }),
      transform: 'scale(1.1)',
      willChange: 'transform, opacity',
      pointerEvents: 'none',
    } as React.CSSProperties;
  };


  return (
    <div className={`fixed inset-0 z-0 overflow-hidden ${className}`} style={{ pointerEvents: 'none' }}>
      {/* Render all boss lair layers for seamless looping */}
      {BOSS_LAIR_IMAGES.map((image, index) => (
        <div
          key={index}
          className={`absolute inset-0 ${index === 0 && activeIndex === 0 ? 'cinematic-fade-in' : ''}`}
          style={getLayerStyle(index)}
          aria-hidden="true"
        />
      ))}
      
      {/* Dark overlay for better text readability */}
      <div 
        className="absolute inset-0 bg-black"
        style={{ opacity: 0.3, pointerEvents: 'none' }}
        aria-hidden="true"
      />
    </div>
  );
}