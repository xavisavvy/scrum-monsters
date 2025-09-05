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

// Timing constants
const DISPLAY_DURATION = 5000; // 5 seconds per image
const TRANSITION_DURATION = 1000; // 1 second fade transition

export function CinematicBackground({ className = '' }: CinematicBackgroundProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [nextImageIndex, setNextImageIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [panDirections, setPanDirections] = useState<boolean[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Generate random pan directions for each image
  useEffect(() => {
    const directions = BOSS_LAIR_IMAGES.map(() => Math.random() > 0.5);
    setPanDirections(directions);
  }, []);

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

  // Handle image cycling with stable intervals
  useEffect(() => {
    const startTransition = () => {
      setIsTransitioning(true);
      
      transitionTimeoutRef.current = setTimeout(() => {
        setCurrentImageIndex(nextImageIndex);
        setNextImageIndex((nextImageIndex + 1) % BOSS_LAIR_IMAGES.length);
        setIsTransitioning(false);
      }, TRANSITION_DURATION);
    };

    // Start first cycle after component mounts
    intervalRef.current = setInterval(startTransition, DISPLAY_DURATION);

    return cleanup;
  }, [nextImageIndex, cleanup]);

  const getAnimationStyle = (imageIndex: number, isNext = false) => {
    const panLeft = panDirections[imageIndex];
    const animationName = panLeft ? 'cinematic-pan-left' : 'cinematic-pan-right';
    
    let opacity: number;
    if (isNext) {
      opacity = isTransitioning ? 1 : 0;
    } else {
      opacity = isTransitioning ? 0 : 1;
    }
    
    return {
      opacity,
      transition: `opacity ${TRANSITION_DURATION}ms ease-in-out`,
      animationName: isNext && !isTransitioning ? 'none' : animationName,
      animationDuration: '20s',
      animationTimingFunction: 'linear' as const,
      animationIterationCount: 'infinite' as const,
      animationPlayState: (isNext && !isTransitioning) ? 'paused' : 'running',
    } as React.CSSProperties;
  };


  return (
    <div className={`fixed inset-0 z-0 overflow-hidden ${className}`}>
      {/* Current background image */}
      <div
        className={`absolute inset-0 bg-cover bg-center bg-no-repeat ${currentImageIndex === 0 ? 'cinematic-fade-in' : ''}`}
        style={{
          backgroundImage: `url(${BOSS_LAIR_IMAGES[currentImageIndex]})`,
          pointerEvents: 'none',
          ...getAnimationStyle(currentImageIndex),
        }}
        aria-hidden="true"
      />
      
      {/* Next background image for crossfade */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${BOSS_LAIR_IMAGES[nextImageIndex]})`,
          pointerEvents: 'none',
          ...getAnimationStyle(nextImageIndex, true),
        }}
        aria-hidden="true"
      />
      
      {/* Dark overlay for better text readability */}
      <div 
        className="absolute inset-0 bg-black"
        style={{ opacity: 0.3, pointerEvents: 'none' }}
        aria-hidden="true"
      />
    </div>
  );
}