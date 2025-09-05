import { useEffect, useState } from 'react';

const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp', 
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA'
];

export function useKonamiCode(onUnlock: () => void) {
  const [sequence, setSequence] = useState<string[]>([]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Prevent triggering on form inputs
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      setSequence(prevSequence => {
        const newSequence = [...prevSequence, event.code];
        
        // Keep only the last 10 keys (length of Konami code)
        const trimmedSequence = newSequence.slice(-KONAMI_CODE.length);
        
        // Check if the sequence matches the Konami code
        if (trimmedSequence.length === KONAMI_CODE.length) {
          const matches = trimmedSequence.every((key, index) => key === KONAMI_CODE[index]);
          if (matches) {
            onUnlock();
            return []; // Reset sequence after successful match
          }
        }
        
        return trimmedSequence;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUnlock]);

  return { sequence };
}