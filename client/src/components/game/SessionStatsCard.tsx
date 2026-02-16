import React from 'react';
import { RetroCard } from '@/components/ui/retro-card';

interface SessionSummary {
  totalVotes: number;
  consensusCount: number;
  averageVotingSpeedMs: number;
  totalDamageDealt: number;
  bossesDefeated: number;
  revives: number;
  deaths: number;
  itemsUsed: number;
}

interface SessionStatsCardProps {
  summary: SessionSummary;
  title?: string;
}

export function SessionStatsCard({ summary, title = "Session Stats" }: SessionStatsCardProps) {
  return (
    <RetroCard title={title} className="max-w-2xl mx-auto mb-6">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <h3 className="text-amber-400 font-bold uppercase text-xs tracking-wider">Estimation</h3>
          <div className="flex justify-between">
            <span className="text-gray-400">Votes Cast</span>
            <span className="text-white font-bold">{summary.totalVotes}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Consensus Hits</span>
            <span className="text-green-400 font-bold">{summary.consensusCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Avg Vote Speed</span>
            <span className="text-white font-bold">
              {summary.averageVotingSpeedMs > 0 ? `${(summary.averageVotingSpeedMs / 1000).toFixed(1)}s` : '--'}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-amber-400 font-bold uppercase text-xs tracking-wider">Combat</h3>
          <div className="flex justify-between">
            <span className="text-gray-400">Damage Dealt</span>
            <span className="text-red-400 font-bold">{summary.totalDamageDealt}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Bosses Slain</span>
            <span className="text-amber-400 font-bold">{summary.bossesDefeated}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Revives</span>
            <span className="text-green-400 font-bold">{summary.revives}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Deaths</span>
            <span className="text-red-400 font-bold">{summary.deaths}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Items Used</span>
            <span className="text-blue-400 font-bold">{summary.itemsUsed}</span>
          </div>
        </div>
      </div>
    </RetroCard>
  );
}
