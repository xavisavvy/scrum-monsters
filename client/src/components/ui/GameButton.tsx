import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { useAudio } from '@/lib/stores/useAudio';

const gameButtonVariants = cva(
  'jrpg-btn inline-flex items-center justify-center font-jrpg font-bold uppercase cursor-pointer transition-all duration-200 border-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none',
  {
    variants: {
      variant: {
        primary: 'retro-button text-jrpg-btn-primary-text',
        secondary: 'retro-button bg-gray-600 hover:bg-gray-500 text-white',
        accent: 'retro-button bg-jrpg-btn-danger text-jrpg-btn-danger-text',
        danger: 'retro-button bg-jrpg-btn-danger text-jrpg-btn-danger-text',
        ghost: 'bg-transparent border-gray-600 text-jrpg-text hover:bg-white/5',
      },
      size: {
        sm: 'px-3 py-1 text-xs',
        md: 'px-6 py-3 text-sm',
        lg: 'px-8 py-4 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface GameButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof gameButtonVariants> {
  playSound?: boolean;
}

export const GameButton = React.forwardRef<HTMLButtonElement, GameButtonProps>(
  ({ className, variant, size, playSound = true, onClick, children, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (playSound) {
        useAudio.getState().playButtonSelect();
      }
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        className={cn(gameButtonVariants({ variant, size }), className)}
        onClick={handleClick}
        {...props}
      >
        {children}
      </button>
    );
  }
);

GameButton.displayName = 'GameButton';
