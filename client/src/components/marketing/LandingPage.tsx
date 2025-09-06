import React from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { CinematicBackground } from '@/components/ui/CinematicBackground';
import { FooterSection } from '@/components/marketing/FooterSection';
import { useAudio } from '@/lib/stores/useAudio';

// Import boss images
import bugHydraImg from '@/assets/bosses/Bug_Hydra_Boss_transparent.png';
import sprintDemonImg from '@/assets/bosses/Sprint_Demon_Boss_transparent.png';
import deadlineDragonImg from '@/assets/bosses/Deadline_Dragon_Boss_transparent.png';
import techDebtGolemImg from '@/assets/bosses/Technical_Debt_Golem_transparent.png';
import scopeCreepBeastImg from '@/assets/bosses/Scope_Creep_Beast_transparent.png';

interface LandingPageProps {
  onStartGame: () => void;
  onNavigate?: (page: 'landing' | 'about' | 'features' | 'pricing' | 'support') => void;
}

export function LandingPage({ onStartGame, onNavigate }: LandingPageProps) {
  const { playButtonSelect } = useAudio();

  const handleGetStarted = () => {
    playButtonSelect();
    onStartGame();
  };

  const features = [
    {
      icon: '⚔️',
      title: 'Fast Planning Poker',
      description: 'Run estimation sessions with built-in mini-games that keep your team engaged and focused.'
    },
    {
      icon: '🎮',
      title: 'Browser-Based',
      description: 'No downloads required. Share a link and your team is ready to battle in seconds.'
    },
    {
      icon: '📊',
      title: 'Team Stats',
      description: 'Track estimation accuracy, consensus rates, and team performance over time.'
    },
    {
      icon: '⚡',
      title: 'Quick Ceremonies',
      description: 'Keep sprint planning lively and focused without getting in the way of real work.'
    }
  ];

  const bosses = [
    { name: 'Bug Hydra', image: bugHydraImg, description: 'The beast of persistent defects' },
    { name: 'Sprint Demon', image: sprintDemonImg, description: 'Master of tight deadlines' },
    { name: 'Technical Debt Golem', image: techDebtGolemImg, description: 'Guardian of legacy code' },
    { name: 'Scope Creep Beast', image: scopeCreepBeastImg, description: 'Endless feature expansion' },
    { name: 'Deadline Dragon', image: deadlineDragonImg, description: 'The timekeeper of doom' }
  ];

  return (
    <div className="relative">
      <CinematicBackground />
      
      <div className="relative z-20">
        {/* Hero Section */}
        <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 text-center">
          <div className="max-w-4xl mx-auto">
            {/* Main Title */}
            <div className="flex items-center justify-center gap-6 mb-6">
              <img 
                src="/scrum-monster-icon.png" 
                alt="Scrum Monster" 
                className="w-16 sm:w-24 md:w-32 h-16 sm:h-24 md:h-32 pixelated object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
              <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold retro-text-glow">
                SCRUM MONSTERS
              </h1>
              <img 
                src="/scrum-monster-icon.png" 
                alt="Scrum Monster" 
                className="w-16 sm:w-24 md:w-32 h-16 sm:h-24 md:h-32 pixelated object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            
            {/* Tagline */}
            <h2 className="text-xl sm:text-2xl md:text-3xl text-gray-300 mb-4">
              Slay the beasts of bad software development
            </h2>
            
            {/* Description */}
            <p className="text-base sm:text-lg md:text-xl text-gray-400 mb-8 max-w-3xl mx-auto leading-relaxed">
              Turn sprint planning and estimation into a quick, fun ritual. Your team assigns story points 
              while battling cheeky pixel bosses in this lightweight web game that takes seconds to start.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <RetroButton
                onClick={handleGetStarted}
                size="lg"
                className="text-xl px-8 py-4"
              >
                🎮 Start a Battle
              </RetroButton>
              <RetroButton
                onClick={() => {
                  playButtonSelect();
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
                variant="secondary"
                size="lg"
                className="text-xl px-8 py-4"
              >
                📖 Learn More
              </RetroButton>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto">
              <div className="retro-card bg-opacity-80">
                <div className="text-2xl font-bold text-green-400">Seconds</div>
                <div className="text-sm text-gray-400">to start playing</div>
              </div>
              <div className="retro-card bg-opacity-80">
                <div className="text-2xl font-bold text-blue-400">Browser</div>
                <div className="text-sm text-gray-400">no downloads needed</div>
              </div>
              <div className="retro-card bg-opacity-80">
                <div className="text-2xl font-bold text-purple-400">Fun</div>
                <div className="text-sm text-gray-400">planning poker</div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div id="features" className="px-4 py-12 sm:py-16 bg-black bg-opacity-60">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 retro-text-glow">
              Why Teams Love It
            </h2>
            <p className="text-xl text-gray-400 text-center mb-12 max-w-3xl mx-auto">
              It lowers meeting fatigue, creates repeatable rituals, and is memorable enough 
              to increase attendance and engagement.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <div key={index} className="retro-card text-center h-full">
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h3 className="text-xl font-bold mb-3 text-blue-400">{feature.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Boss Gallery */}
        <div className="px-4 py-12 sm:py-16">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 retro-text-glow">
              Meet the Bosses
            </h2>
            <p className="text-xl text-gray-400 text-center mb-12 max-w-3xl mx-auto">
              Battle epic pixel bosses that represent the challenges every development team faces.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
              {bosses.map((boss, index) => (
                <div key={index} className="retro-card text-center hover:scale-105 transition-transform">
                  <div className="relative mb-4">
                    <img 
                      src={boss.image} 
                      alt={boss.name}
                      className="w-full h-32 object-contain pixelated"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <h3 className="text-lg font-bold mb-2 text-yellow-400">{boss.name}</h3>
                  <p className="text-xs text-gray-400">{boss.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="px-4 py-12 sm:py-16 bg-black bg-opacity-60">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 retro-text-glow">
              How It Works
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-blue-500 rounded-full flex items-center justify-center text-2xl font-bold">
                  1
                </div>
                <h3 className="text-xl font-bold mb-2">Share Link</h3>
                <p className="text-gray-400 text-sm">Players join via a simple share link</p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-500 rounded-full flex items-center justify-center text-2xl font-bold">
                  2
                </div>
                <h3 className="text-xl font-bold mb-2">Vote & Battle</h3>
                <p className="text-gray-400 text-sm">Estimate story points while fighting bosses</p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-purple-500 rounded-full flex items-center justify-center text-2xl font-bold">
                  3
                </div>
                <h3 className="text-xl font-bold mb-2">Reveal & Discuss</h3>
                <p className="text-gray-400 text-sm">See team estimates and discuss differences</p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-yellow-500 rounded-full flex items-center justify-center text-2xl font-bold">
                  4
                </div>
                <h3 className="text-xl font-bold mb-2">Track Stats</h3>
                <p className="text-gray-400 text-sm">Optional team performance tracking</p>
              </div>
            </div>
          </div>
        </div>

        {/* Final CTA */}
        <div className="px-4 py-12 sm:py-16 text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 retro-text-glow">
              Ready to Transform Your Sprint Planning?
            </h2>
            <p className="text-xl text-gray-400 mb-8">
              Start a room. Fight a boss. Estimate faster.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <RetroButton
                onClick={handleGetStarted}
                size="lg"
                className="text-2xl px-12 py-6"
              >
                🏆 Battle Now - It's Free!
              </RetroButton>
            </div>

            <p className="text-sm text-gray-500 mt-6">
              No downloads • No signups • Works on any device
            </p>
          </div>
        </div>

        {/* Footer */}
        <FooterSection onNavigate={onNavigate} />
      </div>
    </div>
  );
}