import React from 'react';
import { cn } from '@/lib/utils';

interface RetroCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function RetroCard({ children, className, title }: RetroCardProps) {
  return (
    <div className={cn('retro-card', className)}>
      {title && (
        <h3 className="text-lg font-bold mb-4 retro-text-glow">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
