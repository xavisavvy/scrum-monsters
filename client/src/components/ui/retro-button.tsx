import React from 'react';
import { cn } from '@/lib/utils';

interface RetroButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent';
  size?: 'sm' | 'md' | 'lg';
}

export const RetroButton = React.forwardRef<HTMLButtonElement, RetroButtonProps>(({ 
  className, 
  variant = 'primary', 
  size = 'md', 
  children, 
  ...props 
}, ref) => {
  const sizeClasses = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg'
  };

  const variantClasses = {
    primary: 'retro-button',
    secondary: 'retro-button bg-gray-600 hover:bg-gray-500',
    accent: 'retro-button bg-red-600 hover:bg-red-500'
  };

  return (
    <button
      ref={ref}
      className={cn(
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

RetroButton.displayName = "RetroButton";
