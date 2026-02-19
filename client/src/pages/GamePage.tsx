import { useParams } from 'react-router';

/**
 * Game route component - handles /game/:lobbyId
 * Manages all game phases: avatar_selection, lobby, battle
 * URL stays stable during phase transitions (server state drives rendering)
 *
 * Will be fully implemented in Task 2
 */
export default function GamePage() {
  const { lobbyId } = useParams<{ lobbyId: string }>();

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="retro-card text-center">
        <h2 className="text-xl font-bold mb-4">Game Page (Task 2)</h2>
        <p>Lobby ID: {lobbyId}</p>
      </div>
    </div>
  );
}
