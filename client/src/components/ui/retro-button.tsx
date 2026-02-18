import React from 'react';
import { GameButton, type GameButtonProps } from './GameButton';

interface RetroButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent';
  size?: 'sm' | 'md' | 'lg';
}

const variantMap: Record<string, GameButtonProps['variant']> = {
  primary: 'primary',
  secondary: 'secondary',
  accent: 'danger',
};

export const RetroButton = React.forwardRef<HTMLButtonElement, RetroButtonProps>(
  ({ variant = 'primary', ...props }, ref) => (
    <GameButton ref={ref} variant={variantMap[variant] ?? 'primary'} {...props} />
  )
);

RetroButton.displayName = 'RetroButton';

// Re-export for gradual migration
export { GameButton } from './GameButton';
export type { GameButtonProps } from './GameButton';
