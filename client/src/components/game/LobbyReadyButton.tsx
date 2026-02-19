import { GameButton } from '@/components/ui/GameButton';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';

export function LobbyReadyButton() {
  const { emit } = useWebSocket();
  const currentPlayer = useGameState((s) => s.currentPlayer);
  const isReady = currentPlayer?.isReady ?? false;

  const handleToggle = () => {
    emit('toggle_ready', { ready: !isReady });
  };

  return (
    <GameButton
      onClick={handleToggle}
      variant={isReady ? 'primary' : 'secondary'}
      size="md"
      aria-pressed={isReady}
      aria-label={isReady ? 'Ready - click to unready' : 'Not ready - click to ready up'}
      className="min-w-[120px]"
    >
      {isReady ? '\u2713 Ready' : 'Ready Up'}
    </GameButton>
  );
}
