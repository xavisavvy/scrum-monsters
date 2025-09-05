import React from 'react';
import { AVATAR_CLASSES, AvatarClass, CharacterStats } from '@/lib/gameTypes';

interface CharacterDetailsPanelProps {
  selectedClass: AvatarClass;
}

export function CharacterDetailsPanel({ selectedClass }: CharacterDetailsPanelProps) {
  const classData = AVATAR_CLASSES[selectedClass];
  
  const renderStatBar = (label: string, value: number, maxValue: number = 22) => {
    const percentage = (value / maxValue) * 100;
    return (
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-bold text-gray-300">{label}</span>
          <span className="text-sm font-bold text-white">{value}</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className="h-2 rounded-full transition-all duration-300"
            style={{ 
              width: `${percentage}%`, 
              backgroundColor: classData.color 
            }}
          />
        </div>
      </div>
    );
  };

  const renderCharacterPortrait = () => {
    return (
      <div 
        className="w-32 h-32 mx-auto mb-4 rounded-lg border-4 flex items-center justify-center relative overflow-hidden"
        style={{ 
          borderColor: classData.color,
          backgroundColor: `${classData.color}15`
        }}
      >
        {/* Character silhouette/icon */}
        <div 
          className="w-24 h-24 rounded-lg flex items-center justify-center text-4xl font-bold"
          style={{ 
            backgroundColor: classData.color,
            color: 'white',
            textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
          }}
        >
          {getClassIcon(selectedClass)}
        </div>
        
        {/* Decorative border effect */}
        <div 
          className="absolute inset-0 rounded-lg opacity-30"
          style={{ 
            background: `linear-gradient(45deg, ${classData.color}40, transparent, ${classData.color}40)`
          }}
        />
      </div>
    );
  };

  const getClassIcon = (avatarClass: AvatarClass): string => {
    const icons: Record<AvatarClass, string> = {
      ranger: '🏹',
      rogue: '🗡️', 
      bard: '🎵',
      sorcerer: '🔥',
      wizard: '🧙',
      warrior: '⚔️',
      paladin: '🛡️',
      cleric: '✨'
    };
    return icons[avatarClass];
  };

  const getTotalStats = (stats: CharacterStats) => {
    return stats.str + stats.dex + stats.con + stats.wis + stats.int + stats.cha;
  };

  return (
    <div className="bg-gray-800 border-2 border-gray-600 rounded-lg p-6 w-full lg:w-80 max-w-md mx-auto">
      <div className="text-center mb-6">
        {renderCharacterPortrait()}
        
        <h2 
          className="text-2xl font-bold mb-2 retro-text-glow"
          style={{ color: classData.color }}
        >
          {classData.name}
        </h2>
        
        <p className="text-gray-400 text-sm mb-4">{classData.description}</p>
        
        <div className="text-xs text-gray-500">
          Total Points: {getTotalStats(classData.stats)} / 78
        </div>
      </div>

      {/* Character Stats */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-yellow-400 mb-4 text-center">
          Character Stats
        </h3>
        
        {renderStatBar('STR', classData.stats.str)}
        {renderStatBar('DEX', classData.stats.dex)}
        {renderStatBar('CON', classData.stats.con)}
        {renderStatBar('WIS', classData.stats.wis)}
        {renderStatBar('INT', classData.stats.int)}
        {renderStatBar('CHA', classData.stats.cha)}
      </div>

      {/* Specialties */}
      <div>
        <h3 className="text-lg font-bold text-yellow-400 mb-3 text-center">
          Specialties
        </h3>
        <div className="space-y-2">
          {classData.specialties.map((specialty, index) => (
            <div 
              key={index}
              className="text-center py-2 px-3 rounded-md text-sm font-medium"
              style={{ 
                backgroundColor: `${classData.color}20`,
                border: `1px solid ${classData.color}40`,
                color: classData.color
              }}
            >
              {specialty}
            </div>
          ))}
        </div>
      </div>

      {/* Game Mechanics Info */}
      <div className="mt-6 pt-4 border-t border-gray-600">
        <h4 className="text-sm font-bold text-gray-400 mb-2">Combat Effects:</h4>
        <div className="text-xs text-gray-500 space-y-1">
          <div>• Physical Damage: {Math.round(classData.stats.str * 2.5)}%</div>
          <div>• Spell Damage: {Math.round(classData.stats.int * 2.5)}%</div>
          <div>• Critical Chance: {Math.round(classData.stats.dex * 1.5)}%</div>
          <div>• Health Points: {classData.stats.con * 5}</div>
          <div>• Mana Points: {classData.stats.int * 3}</div>
          <div>• Team Bonus: +{Math.round(classData.stats.cha * 0.5)}%</div>
        </div>
      </div>
    </div>
  );
}