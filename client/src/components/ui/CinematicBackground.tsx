import React, { useState, useEffect, useRef, useCallback } from 'react';

interface CinematicBackgroundProps {
  className?: string;
}

const BOSS_LAIR_IMAGES = [
  '/images/lairs/Bug_Hydra_Cave_Lair_a07f8108.png',
  '/images/lairs/Sprint_Demon_Volcano_Lair_01853ccf.png',
  '/images/lairs/Deadline_Dragon_Clocktower_Lair_5c2916e4.png',
  '/images/lairs/Technical_Debt_Golem_Temple_f7e377fe.png',
  '/images/lairs/Scope_Creep_Beast_Void_bd13cec0.png',
];

// Timing constants for smooth cinematic experience
const DISPLAY_DURATION = 5000; // 5 seconds per image
const CROSSFADE_DURATION = 2000; // 2 second smooth crossfade

export function CinematicBackground({ className = '' }: CinematicBackgroundProps) {
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

  // Setup cycling with seamless timing
  useEffect(() => {
    intervalRef.current = setInterval(startCrossfade, DISPLAY_DURATION);
    return cleanup;
  }, [startCrossfade, cleanup]);

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
      animationName,
      animationDuration: '28s', // Longer duration for seamless looping
      animationTimingFunction: 'linear',
      animationIterationCount: 'infinite',
      animationDirection: 'alternate', // Prevents jarring position resets
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