import React from 'react';
import { RetroCard } from '@/components/ui/retro-card';
import { RetroButton } from '@/components/ui/retro-button';

interface EmptyStateProps {
  icon: string;
  title: string;
  message: string;
  action?: () => void;
  actionLabel?: string;
}

export function EmptyState({ icon, title, message, action, actionLabel }: EmptyStateProps) {
  return (
    <RetroCard>
      <div className="text-center py-8 space-y-3">
        <div className="text-4xl">{icon}</div>
        <div className="retro-text-glow-light text-lg font-bold">{title}</div>
        <div className="text-sm text-gray-400">{message}</div>
        {action && actionLabel && (
          <div className="pt-2">
            <RetroButton variant="primary" onClick={action}>
              {actionLabel}
            </RetroButton>
          </div>
        )}
      </div>
    </RetroCard>
  );
}
