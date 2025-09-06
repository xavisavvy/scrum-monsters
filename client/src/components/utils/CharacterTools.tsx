import React, { useState, useEffect } from 'react';
import { RetroButton } from '../ui/retro-button';
import { RetroCard } from '../ui/retro-card';
import { SpriteRenderer } from '../game/SpriteRenderer';
import { AVATAR_CLASSES } from '@/lib/gameTypes';
import type { SpriteAnimation, SpriteDirection, AvatarClass } from '@/hooks/useSpriteAnimation';

interface CharacterToolsProps {
  onBack: () => void;
}

// All available animations and directions
const ANIMATIONS: SpriteAnimation[] = ['idle', 'walk', 'attack', 'cast', 'death', 'victory'];
const DIRECTIONS: SpriteDirection[] = ['down', 'left', 'right', 'up'];

// Sprite configuration that users can edit
interface SpriteConfig {
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, {
    row: number;
    frames: number;
    speed: number;
    loop: boolean;
  }>;
  directions: Record<string, number>;
}

const DEFAULT_CONFIG: SpriteConfig = {
  frameWidth: 256,
  frameHeight: 256,
  animations: {
    idle: { row: 0, frames: 1, speed: 1000, loop: true },
    walk: { row: 0, frames: 4, speed: 200, loop: true },
    attack: { row: 2, frames: 4, speed: 150, loop: false },
    cast: { row: 2, frames: 4, speed: 200, loop: false },
    death: { row: 2, frames: 3, speed: 400, loop: false },
    victory: { row: 2, frames: 1, speed: 1000, loop: false }
  },
  directions: {
    down: 0,
    left: 1,
    right: 2,
    up: 3
  }
};

export function CharacterTools({ onBack }: CharacterToolsProps) {
  const [selectedAvatarClass, setSelectedAvatarClass] = useState<AvatarClass>('warrior');
  const [selectedAnimation, setSelectedAnimation] = useState<SpriteAnimation>('walk');
  const [selectedDirection, setSelectedDirection] = useState<SpriteDirection>('down');
  const [isMoving, setIsMoving] = useState(true);
  const [spriteConfig, setSpriteConfig] = useState<SpriteConfig>(DEFAULT_CONFIG);
  const [showingGrid, setShowingGrid] = useState(false);

  // Animation controls
  const [animationSpeed, setAnimationSpeed] = useState(200);
  const [currentRow, setCurrentRow] = useState(0);
  const [frameCount, setFrameCount] = useState(4);

  useEffect(() => {
    const config = spriteConfig.animations[selectedAnimation];
    if (config) {
      setAnimationSpeed(config.speed);
      setCurrentRow(config.row);
      setFrameCount(config.frames);
    }
  }, [selectedAnimation, spriteConfig]);

  const updateAnimationConfig = (animation: string, updates: Partial<typeof DEFAULT_CONFIG.animations.walk>) => {
    setSpriteConfig(prev => ({
      ...prev,
      animations: {
        ...prev.animations,
        [animation]: {
          ...prev.animations[animation],
          ...updates
        }
      }
    }));
  };

  const exportConfig = () => {
    const configString = JSON.stringify(spriteConfig, null, 2);
    navigator.clipboard.writeText(configString);
    alert('Configuration copied to clipboard!');
  };

  const importConfig = () => {
    const input = prompt('Paste sprite configuration JSON:');
    if (input) {
      try {
        const newConfig = JSON.parse(input);
        setSpriteConfig(newConfig);
        alert('Configuration imported successfully!');
      } catch (error) {
        alert('Invalid JSON configuration');
      }
    }
  };

  return (
    <div className="retro-container min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold retro-text-glow">Character Sprite Tools</h1>
          <RetroButton onClick={onBack} variant="secondary">
            ← Back to Menu
          </RetroButton>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Character Selection & Preview */}
          <div className="lg:col-span-1">
            <RetroCard className="mb-6">
              <h2 className="text-xl font-bold mb-4 retro-text-glow-light">Character Preview</h2>
              
              {/* Large character display */}
              <div className="flex justify-center mb-6">
                <div 
                  className="bg-gray-800 rounded-lg p-8 relative"
                  style={{ 
                    backgroundImage: showingGrid ? 
                      'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)' : 
                      'none',
                    backgroundSize: showingGrid ? '20px 20px' : 'none'
                  }}
                >
                  <div style={{ transform: 'scale(3)' }}>
                    <SpriteRenderer
                      avatarClass={selectedAvatarClass}
                      animation={selectedAnimation}
                      direction={selectedDirection}
                      isMoving={isMoving}
                      size={1}
                    />
                  </div>
                </div>
              </div>

              {/* Grid toggle */}
              <div className="flex justify-center mb-4">
                <RetroButton
                  onClick={() => setShowingGrid(!showingGrid)}
                  variant={showingGrid ? "accent" : "secondary"}
                  size="sm"
                >
                  {showingGrid ? 'Hide' : 'Show'} Grid
                </RetroButton>
              </div>

              {/* Character class selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Character Class:</label>
                <select 
                  value={selectedAvatarClass}
                  onChange={(e) => setSelectedAvatarClass(e.target.value as AvatarClass)}
                  className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                >
                  {AVATAR_CLASSES.map(avatarClass => (
                    <option key={avatarClass} value={avatarClass}>
                      {avatarClass.charAt(0).toUpperCase() + avatarClass.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Animation selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Animation:</label>
                <select 
                  value={selectedAnimation}
                  onChange={(e) => setSelectedAnimation(e.target.value as SpriteAnimation)}
                  className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                >
                  {ANIMATIONS.map(animation => (
                    <option key={animation} value={animation}>
                      {animation.charAt(0).toUpperCase() + animation.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Direction selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Direction:</label>
                <div className="grid grid-cols-2 gap-2">
                  {DIRECTIONS.map(direction => (
                    <RetroButton
                      key={direction}
                      onClick={() => setSelectedDirection(direction)}
                      variant={selectedDirection === direction ? "accent" : "secondary"}
                      size="sm"
                    >
                      {direction}
                    </RetroButton>
                  ))}
                </div>
              </div>

              {/* Movement toggle */}
              <div className="mb-4">
                <RetroButton
                  onClick={() => setIsMoving(!isMoving)}
                  variant={isMoving ? "accent" : "secondary"}
                  className="w-full"
                >
                  {isMoving ? 'Moving' : 'Static'}
                </RetroButton>
              </div>
            </RetroCard>
          </div>

          {/* Middle Panel - Animation Controls */}
          <div className="lg:col-span-1">
            <RetroCard className="mb-6">
              <h2 className="text-xl font-bold mb-4 retro-text-glow-light">Animation Settings</h2>
              
              {/* Animation speed */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Animation Speed (ms): {animationSpeed}</label>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="50"
                  value={animationSpeed}
                  onChange={(e) => {
                    const speed = parseInt(e.target.value);
                    setAnimationSpeed(speed);
                    updateAnimationConfig(selectedAnimation, { speed });
                  }}
                  className="w-full"
                />
              </div>

              {/* Row selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Sprite Sheet Row: {currentRow}</label>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="1"
                  value={currentRow}
                  onChange={(e) => {
                    const row = parseInt(e.target.value);
                    setCurrentRow(row);
                    updateAnimationConfig(selectedAnimation, { row });
                  }}
                  className="w-full"
                />
              </div>

              {/* Frame count */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Frame Count: {frameCount}</label>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="1"
                  value={frameCount}
                  onChange={(e) => {
                    const frames = parseInt(e.target.value);
                    setFrameCount(frames);
                    updateAnimationConfig(selectedAnimation, { frames });
                  }}
                  className="w-full"
                />
              </div>

              {/* Loop toggle */}
              <div className="mb-4">
                <RetroButton
                  onClick={() => {
                    const currentLoop = spriteConfig.animations[selectedAnimation]?.loop ?? true;
                    updateAnimationConfig(selectedAnimation, { loop: !currentLoop });
                  }}
                  variant={spriteConfig.animations[selectedAnimation]?.loop ? "accent" : "secondary"}
                  className="w-full"
                >
                  {spriteConfig.animations[selectedAnimation]?.loop ? 'Looping' : 'One-shot'}
                </RetroButton>
              </div>

              {/* Quick animation test buttons */}
              <div className="mb-4">
                <h3 className="text-lg font-bold mb-2">Quick Tests:</h3>
                <div className="grid grid-cols-2 gap-2">
                  <RetroButton
                    onClick={() => {
                      setSelectedAnimation('walk');
                      setIsMoving(true);
                    }}
                    size="sm"
                  >
                    Test Walk
                  </RetroButton>
                  <RetroButton
                    onClick={() => {
                      setSelectedAnimation('attack');
                      setIsMoving(false);
                    }}
                    size="sm"
                  >
                    Test Attack
                  </RetroButton>
                  <RetroButton
                    onClick={() => {
                      setSelectedAnimation('cast');
                      setIsMoving(false);
                    }}
                    size="sm"
                  >
                    Test Cast
                  </RetroButton>
                  <RetroButton
                    onClick={() => {
                      setSelectedAnimation('death');
                      setIsMoving(false);
                    }}
                    size="sm"
                  >
                    Test Death
                  </RetroButton>
                </div>
              </div>
            </RetroCard>
          </div>

          {/* Right Panel - All Characters Grid */}
          <div className="lg:col-span-1">
            <RetroCard className="mb-6">
              <h2 className="text-xl font-bold mb-4 retro-text-glow-light">All Characters</h2>
              
              <div className="grid grid-cols-3 gap-4 mb-6">
                {AVATAR_CLASSES.map(avatarClass => (
                  <div 
                    key={avatarClass}
                    className={`p-2 rounded border-2 cursor-pointer transition-all ${
                      selectedAvatarClass === avatarClass 
                        ? 'border-cyan-400 bg-cyan-400/20' 
                        : 'border-gray-600 hover:border-gray-400'
                    }`}
                    onClick={() => setSelectedAvatarClass(avatarClass)}
                  >
                    <div className="flex justify-center mb-2">
                      <SpriteRenderer
                        avatarClass={avatarClass}
                        animation={selectedAnimation}
                        direction={selectedDirection}
                        isMoving={isMoving}
                        size={1}
                      />
                    </div>
                    <div className="text-xs text-center">
                      {avatarClass}
                    </div>
                  </div>
                ))}
              </div>

              {/* Configuration tools */}
              <h3 className="text-lg font-bold mb-2">Configuration:</h3>
              <div className="space-y-2">
                <RetroButton
                  onClick={exportConfig}
                  variant="secondary"
                  className="w-full"
                  size="sm"
                >
                  📋 Export Config
                </RetroButton>
                <RetroButton
                  onClick={importConfig}
                  variant="secondary"
                  className="w-full"
                  size="sm"
                >
                  📁 Import Config
                </RetroButton>
                <RetroButton
                  onClick={() => setSpriteConfig(DEFAULT_CONFIG)}
                  variant="secondary"
                  className="w-full"
                  size="sm"
                >
                  🔄 Reset to Default
                </RetroButton>
              </div>
            </RetroCard>

            {/* Current config display */}
            <RetroCard>
              <h3 className="text-lg font-bold mb-2">Current Animation Config:</h3>
              <pre className="text-xs bg-gray-800 p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(spriteConfig.animations[selectedAnimation], null, 2)}
              </pre>
            </RetroCard>
          </div>
        </div>
      </div>
    </div>
  );
}