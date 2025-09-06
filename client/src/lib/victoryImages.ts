import { useState, useMemo } from 'react';

// Victory images - pixel art for celebrations
const VICTORY_IMAGES = [
  '/images/victory-1.png',
  '/images/victory-2.png', 
  '/images/victory-3.png'
] as const;

// Utility to handle base URL for production builds
const withBase = (path: string) => {
  const base = import.meta.env.BASE_URL ?? '/';
  return base + path.replace(/^\//, '');
};

// Victory image utility - randomly selects from pixel art victory images
export const getRandomVictoryImage = () => {
  const randomIndex = Math.floor(Math.random() * VICTORY_IMAGES.length);
  return withBase(VICTORY_IMAGES[randomIndex]);
};

// Hook to get a consistent random victory image for a component lifecycle
export const useRandomVictoryImage = () => {
  const [victoryImage] = useState(() => getRandomVictoryImage());
  return victoryImage;
};

// Hook to get a fresh victory image per game phase
export const usePhaseVictoryImage = (gamePhase?: string) => {
  return useMemo(() => getRandomVictoryImage(), [gamePhase]);
};