import React, { useState, useEffect } from 'react';

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

export function CinematicBackground({ className = '' }: CinematicBackgroundProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [nextImageIndex, setNextImageIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [panDirections, setPanDirections] = useState<boolean[]>([]);

  // Generate random pan directions for each image
  useEffect(() => {
    const directions = BOSS_LAIR_IMAGES.map(() => Math.random() > 0.5);
    setPanDirections(directions);
  }, []);

  // Handle image cycling
  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      
      setTimeout(() => {
        setCurrentImageIndex(nextImageIndex);
        setNextImageIndex((nextImageIndex + 1) % BOSS_LAIR_IMAGES.length);
        setIsTransitioning(false);
      }, 1000); // Transition duration
    }, 5000); // 5 seconds per image

    return () => clearInterval(interval);
  }, [nextImageIndex]);

  const getAnimationStyle = (imageIndex: number, isNext = false) => {
    const panLeft = panDirections[imageIndex];
    const animationName = panLeft ? 'cinematic-pan-left' : 'cinematic-pan-right';
    
    return {
      animationName,
      animationDuration: '20s',
      animationTimingFunction: 'linear' as const,
      animationIterationCount: 'infinite' as const,
      opacity: isNext && isTransitioning ? 1 : (isNext ? 0 : 1),
      transition: 'opacity 1s ease-in-out',
      transform: 'scale(1.1)',
    };
  };

  return (
    <div className={`fixed top-0 left-0 w-screen h-screen overflow-hidden -z-10 ${className}`}>
      {/* Current background image */}
      <div
        className={`absolute inset-0 bg-cover bg-center bg-no-repeat ${currentImageIndex === 0 ? 'cinematic-fade-in' : ''}`}
        style={{
          backgroundImage: `url(${BOSS_LAIR_IMAGES[currentImageIndex]})`,
          ...getAnimationStyle(currentImageIndex),
        }}
      />
      
      {/* Next background image for crossfade */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${BOSS_LAIR_IMAGES[nextImageIndex]})`,
          ...getAnimationStyle(nextImageIndex, true),
        }}
      />
      
      {/* Dark overlay for better text readability */}
      <div 
        className="absolute inset-0 bg-black"
        style={{ opacity: 0.4 }}
      />
    </div>
  );
}