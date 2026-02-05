import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';

interface MinionDisplayProps {
  className?: string;
}

export function MinionDisplay({ className }: MinionDisplayProps) {
  const minions = useGameState((state) => state.minions);
  const { emit } = useWebSocket();

  const handleAttackMinion = (minionPlayerId: string) => {
    emit('attack_minion', { minionPlayerId });
  };

  const minionArray = Array.from(minions.values());

  if (minionArray.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <div className="text-sm font-bold text-purple-400 mb-1">Enemy Minions</div>
      {minionArray.map((minion) => (
        <div
          key={minion.playerId}
          className={`
            relative p-3 rounded-lg border-2 cursor-pointer transition-all
            ${minion.isAlive
              ? 'border-purple-600 bg-purple-900/50 hover:border-purple-400 hover:bg-purple-800/50'
              : 'border-gray-600 bg-gray-900/50 opacity-50 cursor-not-allowed'
            }
          `}
          onClick={() => minion.isAlive && handleAttackMinion(minion.playerId)}
        >
          {/* Dark aura effect for alive minions */}
          {minion.isAlive && (
            <div className="absolute inset-0 rounded-lg bg-purple-500/20 animate-pulse pointer-events-none" />
          )}

          {/* Minion content */}
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium">
                {minion.isAlive ? 'Corrupted Minion' : 'Defeated'}
              </span>
              <span className="text-purple-300 text-sm">
                {minion.hp}/{minion.maxHp}
              </span>
            </div>

            {/* HP Bar */}
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${(minion.hp / minion.maxHp) * 100}%` }}
              />
            </div>

            {/* Attack hint */}
            {minion.isAlive && (
              <div className="text-xs text-purple-300 mt-1 text-center">
                Click to attack
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
