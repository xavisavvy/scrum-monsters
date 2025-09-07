import React, { useEffect, useState } from 'react';

interface SpeechBubbleProps {
  message: string;
  x: number; // Position relative to character
  y: number; // Position relative to character  
  onComplete: () => void; // Callback when bubble should disappear
  duration?: number; // Duration in milliseconds (default 3500ms)
}

export function SpeechBubble({ 
  message, 
  x, 
  y, 
  onComplete, 
  duration = 3500 
}: SpeechBubbleProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    // Start fade out animation 500ms before completion
    const fadeOutTimer = setTimeout(() => {
      setOpacity(0);
    }, duration - 500);

    // Complete and trigger callback
    const completeTimer = setTimeout(() => {
      setIsVisible(false);
      onComplete();
    }, duration);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(completeTimer);
    };
  }, [duration, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        left: `${x}px`,
        bottom: `${y + 80}px`, // Position above character (character is ~60px tall)
        transform: 'translateX(-50%)', // Center horizontally on character
        transition: 'opacity 0.5s ease-out',
        opacity
      }}
    >
      {/* Speech bubble */}
      <div className="relative bg-white text-black rounded-lg px-3 py-2 shadow-lg max-w-xs">
        {/* Message text */}
        <p className="text-sm font-medium text-center break-words">
          {message}
        </p>
        
        {/* Speech bubble tail pointing down */}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2">
          <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-white"></div>
        </div>
      </div>
    </div>
  );
}