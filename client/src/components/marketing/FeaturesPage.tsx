import React from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { CinematicBackground } from '@/components/ui/CinematicBackground';
import { FooterSection } from '@/components/marketing/FooterSection';
import { useAudio } from '@/lib/stores/useAudio';

interface FeaturesPageProps {
  onBackToHome: () => void;
  onNavigate: (page: 'landing' | 'about' | 'features' | 'pricing' | 'support') => void;
}

export function FeaturesPage({ onBackToHome, onNavigate }: FeaturesPageProps) {
  const { playButtonSelect } = useAudio();

  const handleBackClick = () => {
    playButtonSelect();
    onBackToHome();
  };

  return (
    <div className="relative min-h-screen">
      <CinematicBackground />
      
      {/* Back Button */}
      <div className="absolute top-4 left-4 z-[100]">
        <RetroButton
          onClick={handleBackClick}
          size="sm"
          variant="secondary"
        >
          ← Back to Home
        </RetroButton>
      </div>
      
      <div className="relative z-20 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 py-16">
          
          {/* Header Section */}
          <header className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-bold retro-text-glow mb-6">
              Features
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Everything you need to make sprint planning engaging, efficient, and fun.
            </p>
          </header>

          {/* Main Content */}
          <div className="space-y-16">
            
            {/* Core Features Section */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Core Features</h2>
              
              <div className="grid md:grid-cols-2 gap-8">
                <div className="border border-cyan-500 rounded-lg p-6">
                  <div className="text-4xl mb-4">⚔️</div>
                  <h3 className="text-xl font-bold text-cyan-400 mb-3">Fast Planning Poker</h3>
                  <p className="text-gray-300 leading-relaxed">
                    Run estimation sessions with built-in mini-games that keep your team engaged and focused. 
                    No more awkward silences or checking phones during planning.
                  </p>
                </div>
                
                <div className="border border-green-500 rounded-lg p-6">
                  <div className="text-4xl mb-4">🎮</div>
                  <h3 className="text-xl font-bold text-green-400 mb-3">Browser-Based</h3>
                  <p className="text-gray-300 leading-relaxed">
                    No downloads required. Share a link and your team is ready to battle in seconds. 
                    Works on any device - desktop, tablet, or mobile.
                  </p>
                </div>
                
                <div className="border border-purple-500 rounded-lg p-6">
                  <div className="text-4xl mb-4">📊</div>
                  <h3 className="text-xl font-bold text-purple-400 mb-3">Team Stats</h3>
                  <p className="text-gray-300 leading-relaxed">
                    Track estimation accuracy, consensus rates, and team performance over time. 
                    Identify patterns and improve your planning process.
                  </p>
                </div>
                
                <div className="border border-orange-500 rounded-lg p-6">
                  <div className="text-4xl mb-4">⚡</div>
                  <h3 className="text-xl font-bold text-orange-400 mb-3">Quick Ceremonies</h3>
                  <p className="text-gray-300 leading-relaxed">
                    Keep sprint planning lively and focused without getting in the way of real work. 
                    Designed for teams who value their time.
                  </p>
                </div>
              </div>
            </section>

            {/* Game Features */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Game Mechanics</h2>
              
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">🏰</div>
                  <div>
                    <h3 className="text-lg font-bold text-yellow-400 mb-2">Epic Boss Battles</h3>
                    <p className="text-gray-300">Battle iconic software development monsters like Bug Hydra, Technical Debt Golem, and Scope Creep Beast while estimating story points.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">🎭</div>
                  <div>
                    <h3 className="text-lg font-bold text-pink-400 mb-2">Avatar Classes</h3>
                    <p className="text-gray-300">Choose from warrior, wizard, ranger, and more. Each class brings unique personality to your team's planning sessions.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">🎯</div>
                  <div>
                    <h3 className="text-lg font-bold text-blue-400 mb-2">Real-time Multiplayer</h3>
                    <p className="text-gray-300">See your teammates' actions in real-time. Coordinate attacks, share reactions, and build team cohesion through play.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">🏆</div>
                  <div>
                    <h3 className="text-lg font-bold text-green-400 mb-2">Team Achievements</h3>
                    <p className="text-gray-300">Unlock achievements for reaching consensus quickly, accurate estimations, and teamwork milestones.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Technical Features */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Built for Teams</h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <h3 className="text-lg font-bold text-cyan-400 mb-3">🔒 Secure Rooms</h3>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>• Private lobby codes</li>
                    <li>• Host controls</li>
                    <li>• Team role assignments</li>
                    <li>• Session management</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-green-400 mb-3">📱 Cross-Platform</h3>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>• Works on any device</li>
                    <li>• No app downloads</li>
                    <li>• Responsive design</li>
                    <li>• Touch-friendly controls</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-purple-400 mb-3">⚙️ Customizable</h3>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>• Custom story point scales</li>
                    <li>• Boss difficulty settings</li>
                    <li>• Timer configurations</li>
                    <li>• Team preferences</li>
                  </ul>
                </div>
              </div>
            </section>

          </div>
          
          {/* Bottom CTA */}
          <div className="text-center mt-16 pt-8 border-t border-gray-700">
            <h2 className="text-2xl font-bold retro-text-glow mb-4">Ready to Level Up Your Planning?</h2>
            <p className="text-gray-400 mb-6">
              Join teams who've transformed their estimation process from boring to engaging.
            </p>
            <RetroButton
              onClick={handleBackClick}
              size="lg"
              className="text-xl px-8 py-4"
            >
              🎮 Start Your First Battle
            </RetroButton>
          </div>
          
        </div>
        
        {/* Footer */}
        <FooterSection onNavigate={onNavigate} />
      </div>
    </div>
  );
}