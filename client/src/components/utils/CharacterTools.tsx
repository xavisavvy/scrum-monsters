import React, { useState, useEffect } from 'react';
import { RetroButton } from '../ui/retro-button';
import { RetroCard } from '../ui/retro-card';
import { SpriteRenderer } from '../game/SpriteRenderer';
import { AVATAR_CLASSES, AvatarClass } from '@/lib/gameTypes';
import type { SpriteAnimation, SpriteDirection } from '@/hooks/useSpriteAnimation';
import { useAudio } from '@/lib/stores/useAudio';
import { getAvatarImage } from '@/lib/avatarImages';

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
  frameWidth: 64,
  frameHeight: 64,
  animations: {
    idle: { row: 0, frames: 1, speed: 1000, loop: true },
    walk: { row: 0, frames: 4, speed: 200, loop: true },
    attack: { row: 3, frames: 1, speed: 150, loop: false },
    cast: { row: 3, frames: 1, speed: 200, loop: false },
    death: { row: 3, frames: 1, speed: 400, loop: false },
    victory: { row: 0, frames: 1, speed: 1000, loop: false }
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
  
  // Scale and positioning controls
  const [spriteScale, setSpriteScale] = useState(1.0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // Audio system
  const { 
    playHit, 
    playSuccess, 
    playButtonSelect, 
    playExplosion, 
    startWalkingSound, 
    stopWalkingSound,
    setBackgroundMusic,
    playBackgroundMusic,
    stopBackgroundMusic
  } = useAudio();

  // Background music for developer tools
  useEffect(() => {
    const backgroundAudio = new Audio('/sounds/background.mp3');
    backgroundAudio.preload = 'auto';
    setBackgroundMusic(backgroundAudio);
    playBackgroundMusic();

    return () => {
      stopBackgroundMusic();
    };
  }, [setBackgroundMusic, playBackgroundMusic, stopBackgroundMusic]);

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

  // Audio testing functions for different animation types
  const testAnimationAudio = (animation: SpriteAnimation) => {
    switch (animation) {
      case 'attack':
        playHit();
        break;
      case 'cast':
        playExplosion();
        break;
      case 'victory':
        playSuccess();
        break;
      case 'walk':
        // Test walking sound by starting and stopping it after 2 seconds
        startWalkingSound();
        setTimeout(() => stopWalkingSound(), 2000);
        break;
      case 'idle':
      case 'death':
        playButtonSelect(); // Subtle UI sound for these animations
        break;
      default:
        playButtonSelect();
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
                  className="bg-gray-800 rounded-lg p-12 relative overflow-hidden"
                  style={{ 
                    width: '280px',
                    height: '330px',
                    backgroundImage: showingGrid ? 
                      'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)' : 
                      'none',
                    backgroundSize: showingGrid ? '20px 20px' : 'none'
                  }}
                >
                  <div 
                    className="absolute left-1/2 top-1/2"
                    style={{ 
                      transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${spriteScale * 3})`,
                      transformOrigin: 'center center'
                    }}
                  >
                    <SpriteRenderer
                      avatarClass={selectedAvatarClass}
                      animation={selectedAnimation}
                      direction={selectedDirection}
                      isMoving={isMoving}
                      size={1}
                    />
                  </div>
                  
                  {/* Center crosshair */}
                  <div className="absolute left-1/2 top-1/2 w-0.5 h-8 bg-red-500/50 transform -translate-x-0.5 -translate-y-4"></div>
                  <div className="absolute left-1/2 top-1/2 w-8 h-0.5 bg-red-500/50 transform -translate-x-4 -translate-y-0.5"></div>
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
                  {Object.keys(AVATAR_CLASSES).map((avatarClass) => (
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

            {/* Audio Testing Panel */}
            <RetroCard>
              <h2 className="text-xl font-bold mb-4 retro-text-glow-light">Audio Testing</h2>
              <p className="text-sm text-gray-400 mb-4">
                Test sound effects assigned to different animation types
              </p>
              
              {/* Audio mapping info */}
              <div className="mb-4 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-300">Attack:</span>
                  <span className="text-blue-400">Hit Sound</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Cast:</span>
                  <span className="text-purple-400">Explosion Sound</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Victory:</span>
                  <span className="text-green-400">Success Sound</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Walk:</span>
                  <span className="text-orange-400">Walking Sound (Loop)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Idle:</span>
                  <span className="text-cyan-400">UI Sound</span>
                </div>
              </div>

              {/* Test current animation audio */}
              <div className="mb-4">
                <RetroButton
                  onClick={() => testAnimationAudio(selectedAnimation)}
                  variant="accent"
                  className="w-full flex items-center justify-center gap-2"
                >
                  <img 
                    src={getAvatarImage(selectedAvatarClass) || '/images/avatars/warrior.png'} 
                    alt={selectedAvatarClass}
                    className="w-5 h-5 pixelated object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  Test {selectedAnimation.charAt(0).toUpperCase() + selectedAnimation.slice(1)} Audio
                </RetroButton>
              </div>

              {/* Test all audio types */}
              <div className="grid grid-cols-2 gap-2">
                <RetroButton
                  onClick={() => playHit()}
                  variant="secondary"
                  size="sm"
                  title="Attack/Combat sound"
                  className="flex items-center justify-center gap-1"
                >
                  <img 
                    src={getAvatarImage(selectedAvatarClass) || '/images/avatars/warrior.png'} 
                    alt={selectedAvatarClass}
                    className="w-4 h-4 pixelated object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  Hit
                </RetroButton>
                <RetroButton
                  onClick={() => playExplosion()}
                  variant="secondary"
                  size="sm"
                  title="Magic/Explosion sound"
                  className="flex items-center justify-center gap-1"
                >
                  <img 
                    src={getAvatarImage(selectedAvatarClass) || '/images/avatars/warrior.png'} 
                    alt={selectedAvatarClass}
                    className="w-4 h-4 pixelated object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  Explosion
                </RetroButton>
                <RetroButton
                  onClick={() => playSuccess()}
                  variant="secondary"
                  size="sm"
                  title="Victory/Success sound"
                  className="flex items-center justify-center gap-1"
                >
                  <img 
                    src={getAvatarImage(selectedAvatarClass) || '/images/avatars/warrior.png'} 
                    alt={selectedAvatarClass}
                    className="w-4 h-4 pixelated object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  Success
                </RetroButton>
                <RetroButton
                  onClick={() => playButtonSelect()}
                  variant="secondary"
                  size="sm"
                  title="UI/Selection sound"
                  className="flex items-center justify-center gap-1"
                >
                  <img 
                    src={getAvatarImage(selectedAvatarClass) || '/images/avatars/warrior.png'} 
                    alt={selectedAvatarClass}
                    className="w-4 h-4 pixelated object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  UI
                </RetroButton>
              </div>
            </RetroCard>
          </div>

          {/* Middle Panel - Animation Controls */}
          <div className="lg:col-span-1">
            <RetroCard className="mb-6">
              <h2 className="text-xl font-bold mb-4 retro-text-glow-light">Animation Settings</h2>
              
              {/* Scale Control */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" title="Adjust overall sprite size - use this to prevent cutoff">
                  Scale: {spriteScale.toFixed(2)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={spriteScale}
                  onChange={(e) => setSpriteScale(parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-gray-400 mt-1">Shrink sprite if bottom/sides are cut off</p>
              </div>

              {/* Position Offset X */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" title="Move sprite left/right to fix centering">
                  X Offset: {offsetX}px
                </label>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="1"
                  value={offsetX}
                  onChange={(e) => setOffsetX(parseInt(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-gray-400 mt-1">Adjust horizontal position</p>
              </div>

              {/* Position Offset Y */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" title="Move sprite up/down to fix vertical alignment">
                  Y Offset: {offsetY}px
                </label>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="1"
                  value={offsetY}
                  onChange={(e) => setOffsetY(parseInt(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-gray-400 mt-1">Adjust vertical position (+ moves down)</p>
              </div>

              {/* Animation speed */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" title="How fast the animation plays">
                  Animation Speed: {animationSpeed}ms
                </label>
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
                <p className="text-xs text-gray-400 mt-1">Lower = faster animation</p>
              </div>

              {/* Row selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" title="Which row of the sprite sheet to use (0=top, 3=bottom)">
                  Sprite Sheet Row: {currentRow}
                </label>
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
                <p className="text-xs text-gray-400 mt-1">Row 0=down, 1=left, 2=right, 3=up directions</p>
              </div>

              {/* Frame count */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" title="How many frames to use from the sprite sheet">
                  Frame Count: {frameCount}
                </label>
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
                <p className="text-xs text-gray-400 mt-1">Use fewer frames for static poses</p>
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

              {/* Reset Controls */}
              <div className="mb-4">
                <h3 className="text-lg font-bold mb-2">Quick Fixes:</h3>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <RetroButton
                    onClick={() => {
                      setSpriteScale(0.85);
                      setOffsetY(5);
                      setOffsetX(0);
                    }}
                    size="sm"
                    variant="accent"
                  >
                    Fix Cutoff
                  </RetroButton>
                  <RetroButton
                    onClick={() => {
                      setSpriteScale(1.0);
                      setOffsetY(0);
                      setOffsetX(0);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    Reset Position
                  </RetroButton>
                </div>
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
                    Walk Cycle
                  </RetroButton>
                  <RetroButton
                    onClick={() => {
                      setSelectedAnimation('attack');
                      setIsMoving(false);
                    }}
                    size="sm"
                  >
                    Attack
                  </RetroButton>
                  <RetroButton
                    onClick={() => {
                      setSelectedAnimation('cast');
                      setIsMoving(false);
                    }}
                    size="sm"
                  >
                    Cast Spell
                  </RetroButton>
                  <RetroButton
                    onClick={() => {
                      setSelectedAnimation('idle');
                      setIsMoving(false);
                    }}
                    size="sm"
                  >
                    Idle Pose
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
                {Object.keys(AVATAR_CLASSES).map((avatarClass) => (
                  <div 
                    key={avatarClass}
                    className={`p-2 rounded border-2 cursor-pointer transition-all ${
                      selectedAvatarClass === avatarClass 
                        ? 'border-cyan-400 bg-cyan-400/20' 
                        : 'border-gray-600 hover:border-gray-400'
                    }`}
                    onClick={() => setSelectedAvatarClass(avatarClass as AvatarClass)}
                  >
                    <div className="flex justify-center mb-2">
                      <SpriteRenderer
                        avatarClass={avatarClass as AvatarClass}
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
              <h3 className="text-lg font-bold mb-2">Current Settings:</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Animation:</span>
                  <span className="text-cyan-400">{selectedAnimation}</span>
                </div>
                <div className="flex justify-between">
                  <span>Direction:</span>
                  <span className="text-cyan-400">{selectedDirection}</span>
                </div>
                <div className="flex justify-between">
                  <span>Scale:</span>
                  <span className="text-cyan-400">{spriteScale.toFixed(2)}x</span>
                </div>
                <div className="flex justify-between">
                  <span>Offset:</span>
                  <span className="text-cyan-400">{offsetX}, {offsetY}</span>
                </div>
                <div className="flex justify-between">
                  <span>Speed:</span>
                  <span className="text-cyan-400">{animationSpeed}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Frames:</span>
                  <span className="text-cyan-400">{frameCount}</span>
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-gray-600">
                <h4 className="text-sm font-bold mb-2">Animation Config:</h4>
                <pre className="text-xs bg-gray-800 p-2 rounded overflow-auto max-h-24">
                  {JSON.stringify(spriteConfig.animations[selectedAnimation], null, 2)}
                </pre>
              </div>
            </RetroCard>
          </div>
        </div>
      </div>
    </div>
  );
}