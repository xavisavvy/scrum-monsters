import React from 'react';
import { RetroCard } from './retro-card';
import { RetroButton } from './retro-button';
import { useAudio } from '@/lib/stores/useAudio';
import { useGameState } from '@/lib/stores/useGameState';

interface CheatMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CheatMenu({ isOpen, onClose }: CheatMenuProps) {
  const { playButtonSelect } = useAudio();
  const { currentLobby, setError } = useGameState();

  if (!isOpen) return null;

  const handleCheatAction = (cheatName: string, action: () => void) => {
    playButtonSelect();
    console.log(`🎮 CHEAT ACTIVATED: ${cheatName}`);
    action();
  };

  const addFakePlayer = () => {
    setError('Nice try! But adding fake players is beyond even a cheater\'s power! 😈');
    setTimeout(() => setError(null), 3000);
  };

  const giveUnlimitedVotes = () => {
    setError('Unlimited votes? What is this, a democracy? 🗳️');
    setTimeout(() => setError(null), 3000);
  };

  const skipToVictory = () => {
    setError('Victory must be earned! Even cheaters have standards! 🏆');
    setTimeout(() => setError(null), 3000);
  };

  const revealAllCards = () => {
    setError('The mystery is half the fun! Keep guessing! 🃏');
    setTimeout(() => setError(null), 3000);
  };

  const autoWinTickets = () => {
    setError('Auto-win? Where\'s the fun in that? Get back to work! 💻');
    setTimeout(() => setError(null), 3000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <RetroCard 
        title="🕹️ CHEATER'S PARADISE 🕹️" 
        className="w-full max-w-md relative animate-bounce-in"
      >
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-red-400 font-bold text-lg mb-2">
              🚨 CHEAT DETECTED! 🚨
            </div>
            <p className="text-yellow-300 text-sm">
              Well, well, well... someone knows the ancient ways! 
            </p>
            <p className="text-gray-400 text-xs mt-2">
              You've unlocked the forbidden cheat menu, but don't expect much...
            </p>
          </div>

          <div className="border-t border-gray-600 pt-4">
            <h3 className="text-center text-white font-bold mb-3">
              "CHEAT" OPTIONS
            </h3>
            
            <div className="space-y-2">
              <RetroButton
                onClick={() => handleCheatAction('Add Fake Player', addFakePlayer)}
                className="w-full text-sm"
                variant="secondary"
              >
                👥 Add Fake Player
              </RetroButton>
              
              <RetroButton
                onClick={() => handleCheatAction('Unlimited Votes', giveUnlimitedVotes)}
                className="w-full text-sm"
                variant="secondary"
              >
                🗳️ Unlimited Votes
              </RetroButton>
              
              <RetroButton
                onClick={() => handleCheatAction('Skip to Victory', skipToVictory)}
                className="w-full text-sm"
                variant="secondary"
              >
                🏆 Skip to Victory
              </RetroButton>
              
              <RetroButton
                onClick={() => handleCheatAction('Reveal All Cards', revealAllCards)}
                className="w-full text-sm"
                variant="secondary"
              >
                🃏 Reveal All Cards
              </RetroButton>
              
              <RetroButton
                onClick={() => handleCheatAction('Auto-Win Tickets', autoWinTickets)}
                className="w-full text-sm"
                variant="secondary"
              >
                🎫 Auto-Win Tickets
              </RetroButton>
            </div>
          </div>

          <div className="border-t border-gray-600 pt-4 space-y-3">
            <div className="text-center text-xs text-gray-500">
              🎭 "Cheating is just another form of creativity!" 🎭
            </div>
            
            <RetroButton
              onClick={() => {
                playButtonSelect();
                onClose();
              }}
              className="w-full"
            >
              Close (and Pretend This Never Happened)
            </RetroButton>
          </div>
        </div>
      </RetroCard>
    </div>
  );
}