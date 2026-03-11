import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { RetroCard } from '@/components/ui/retro-card';
import { motion } from 'framer-motion';

interface PlayerListSkeletonProps {
  count?: number;
}

export function PlayerListSkeleton({ count = 3 }: PlayerListSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-gray-800/50 rounded p-3 flex items-center gap-3"
        >
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BattleLoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <RetroCard>
        <div className="text-center py-8 space-y-4">
          <motion.div
            className="text-5xl inline-block"
            animate={{ rotate: 360 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
          >
            🛡️
          </motion.div>
          <div className="retro-text-glow text-xl font-bold">
            Preparing for Battle...
          </div>
          <div className="text-sm text-gray-400">
            Summoning the boss...
          </div>
        </div>
      </RetroCard>
    </div>
  );
}
