import { useState, useEffect } from 'react';

interface ImageDimensions {
  width: number;
  height: number;
  loaded: boolean;
}

export function useImageDimensions(src: string): ImageDimensions {
  const [dimensions, setDimensions] = useState<ImageDimensions>({
    width: 0,
    height: 0,
    loaded: false
  });

  useEffect(() => {
    if (!src) return;

    const img = new Image();
    img.onload = () => {
      console.log(`📏 Image dimensions for ${src}: ${img.naturalWidth}x${img.naturalHeight}`);
      setDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight,
        loaded: true
      });
    };
    
    img.onerror = () => {
      console.error(`❌ Failed to load image: ${src}`);
      setDimensions({
        width: 0,
        height: 0,
        loaded: false
      });
    };
    
    img.src = src;
  }, [src]);

  return dimensions;
}