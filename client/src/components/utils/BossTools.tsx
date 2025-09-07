import React, { useState } from 'react';
import { RetroButton } from '../ui/retro-button';
import { RetroCard } from '../ui/retro-card';
import { BossDisplay } from '../game/BossDisplay';
import { Boss } from '@/lib/gameTypes';
import { useAudio } from '@/lib/stores/useAudio';

interface BossToolsProps {
  onBack: () => void;
}

// Available boss types (matching server-side data)
const AVAILABLE_BOSSES = [
  { 
    sprite: 'bug-hydra.png', 
    name: 'Bug Hydra', 
    description: 'Legendary Beast of Endless Bugs' 
  },
  { 
    sprite: 'sprint-demon.png', 
    name: 'Sprint Demon', 
    description: 'Infernal Master of Rushed Deadlines' 
  },
  { 
    sprite: 'deadline-dragon.png', 
    name: 'Deadline Dragon', 
    description: 'Ancient Terror of Time Constraints' 
  },
  { 
    sprite: 'technical-debt-golem.png', 
    name: 'Technical Debt Golem', 
    description: 'Crushing Burden of Legacy Code' 
  },
  { 
    sprite: 'scope-creep-beast.png', 
    name: 'Scope Creep Beast', 
    description: 'Ever-Expanding Horror of Feature Bloat' 
  }
];

export function BossTools({ onBack }: BossToolsProps) {
  const [selectedBossIndex, setSelectedBossIndex] = useState(0);
  const [bossHealth, setBossHealth] = useState(1000);
  const [bossPhase, setBossPhase] = useState(1);
  const [maxPhases, setMaxPhases] = useState(3);
  const [isDefeated, setIsDefeated] = useState(false);
  const [currentHealth, setCurrentHealth] = useState(1000);
  
  const { playExplosion, playHit } = useAudio();

  const selectedBoss = AVAILABLE_BOSSES[selectedBossIndex];

  // Create test boss object
  const testBoss: Boss = {
    id: 'test-boss',
    name: selectedBoss.name,
    maxHealth: bossHealth,
    currentHealth: currentHealth,
    phase: bossPhase,
    maxPhases: maxPhases,
    sprite: selectedBoss.sprite,
    defeated: isDefeated
  };

  const handleAttackBoss = () => {
    if (!isDefeated) {
      const damage = Math.floor(Math.random() * 100) + 50;
      const newHealth = Math.max(0, currentHealth - damage);
      setCurrentHealth(newHealth);
      
      if (newHealth === 0) {
        setIsDefeated(true);
      }
      
      playHit();
      console.log(`🎯 Boss attacked for ${damage} damage! Health: ${newHealth}/${bossHealth}`);
    }
  };

  const resetBoss = () => {
    setCurrentHealth(bossHealth);
    setIsDefeated(false);
    console.log('🔄 Boss reset');
  };

  const testExplosion = () => {
    playExplosion();
    console.log('💥 Explosion sound test');
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-4">
      <div className="max-w-6xl mx-auto">
        <RetroCard>
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold retro-text-glow">Boss Testing Tools</h1>
            <RetroButton onClick={onBack} variant="secondary">
              ← Back to Menu
            </RetroButton>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Boss Controls */}
            <div className="space-y-6">
              <RetroCard title="Boss Configuration">
                <div className="space-y-4">
                  {/* Boss Selection */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Boss Type:</label>
                    <select
                      value={selectedBossIndex}
                      onChange={(e) => setSelectedBossIndex(Number(e.target.value))}
                      className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                    >
                      {AVAILABLE_BOSSES.map((boss, index) => (
                        <option key={index} value={index}>
                          {boss.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">{selectedBoss.description}</p>
                  </div>

                  {/* Health Controls */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Max Health: {bossHealth}
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="5000"
                      step="100"
                      value={bossHealth}
                      onChange={(e) => {
                        const newMax = Number(e.target.value);
                        setBossHealth(newMax);
                        setCurrentHealth(Math.min(currentHealth, newMax));
                      }}
                      className="w-full"
                    />
                  </div>

                  {/* Current Health */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Current Health: {currentHealth}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max={bossHealth}
                      step="10"
                      value={currentHealth}
                      onChange={(e) => setCurrentHealth(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  {/* Phase Controls */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Current Phase: {bossPhase}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max={maxPhases}
                        value={bossPhase}
                        onChange={(e) => setBossPhase(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Max Phases: {maxPhases}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={maxPhases}
                        onChange={(e) => {
                          const newMax = Number(e.target.value);
                          setMaxPhases(newMax);
                          setBossPhase(Math.min(bossPhase, newMax));
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* State Controls */}
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={isDefeated}
                        onChange={(e) => setIsDefeated(e.target.checked)}
                        className="mr-2"
                      />
                      Boss Defeated
                    </label>
                  </div>
                </div>
              </RetroCard>

              {/* Action Controls */}
              <RetroCard title="Actions">
                <div className="space-y-3">
                  <RetroButton onClick={handleAttackBoss} disabled={isDefeated} className="w-full">
                    🗡️ Attack Boss (Random Damage)
                  </RetroButton>
                  <RetroButton onClick={resetBoss} variant="secondary" className="w-full">
                    🔄 Reset Boss
                  </RetroButton>
                  <RetroButton onClick={testExplosion} variant="secondary" className="w-full">
                    💥 Test Explosion Sound
                  </RetroButton>
                </div>
              </RetroCard>

              {/* Info Display */}
              <RetroCard title="Boss Stats">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">Sprite:</div>
                    <div className="font-mono">{selectedBoss.sprite}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Health:</div>
                    <div className="font-mono">{currentHealth}/{bossHealth}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Phase:</div>
                    <div className="font-mono">{bossPhase}/{maxPhases}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Status:</div>
                    <div className={`font-mono ${isDefeated ? 'text-red-400' : 'text-green-400'}`}>
                      {isDefeated ? 'Defeated' : 'Active'}
                    </div>
                  </div>
                </div>
              </RetroCard>
            </div>

            {/* Boss Display */}
            <div className="space-y-6">
              <RetroCard title="Boss Preview">
                <div className="flex justify-center p-8">
                  <div className="relative" style={{ minHeight: '300px' }}>
                    <BossDisplay 
                      boss={testBoss} 
                      onAttack={handleAttackBoss}
                      fullscreen={false}
                    />
                  </div>
                </div>
              </RetroCard>

              {/* Tips */}
              <RetroCard title="Testing Tips">
                <div className="text-sm space-y-2">
                  <p>• Use the sliders to adjust boss stats in real-time</p>
                  <p>• Click the boss image to attack it directly</p>
                  <p>• Watch the death animation when health reaches 0</p>
                  <p>• Test different boss types and their sprites</p>
                  <p>• Check phase indicators for multi-phase bosses</p>
                </div>
              </RetroCard>
            </div>
          </div>
        </RetroCard>
      </div>
    </div>
  );
}