import React from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { CinematicBackground } from '@/components/ui/CinematicBackground';
import { FooterSection } from '@/components/marketing/FooterSection';
import { useAudio } from '@/lib/stores/useAudio';

interface SupportPageProps {
  onBackToHome: () => void;
}

export function SupportPage({ onBackToHome }: SupportPageProps) {
  const { playButtonSelect } = useAudio();

  const handleBackClick = () => {
    playButtonSelect();
    onBackToHome();
  };

  return (
    <div className="relative min-h-screen">
      <CinematicBackground />
      
      {/* Back Button */}
      <div className="absolute top-4 left-4 z-50">
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
              Support
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Need help? We're here to help you get the most out of Scrum Monsters.
            </p>
          </header>

          {/* Main Content */}
          <div className="space-y-16">
            
            {/* Quick Help Section */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Quick Help</h2>
              
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-bold text-cyan-400 mb-4">Getting Started</h3>
                  <ul className="space-y-3 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-cyan-400 mr-2">1.</span>
                      <span>Click "🎮 Start a Battle" to create a new lobby</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-cyan-400 mr-2">2.</span>
                      <span>Share the 6-character lobby code with your team</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-cyan-400 mr-2">3.</span>
                      <span>Choose your avatar class and start estimating!</span>
                    </li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-xl font-bold text-green-400 mb-4">Common Issues</h3>
                  <ul className="space-y-3 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">•</span>
                      <span><strong>Can't hear audio?</strong> Check the mute button in the game menu</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">•</span>
                      <span><strong>Lobby not found?</strong> Double-check the 6-character code</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">•</span>
                      <span><strong>Connection issues?</strong> Try refreshing your browser</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Contact Options */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Get In Touch</h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                <div className="border border-blue-500 rounded-lg p-6 text-center">
                  <div className="text-4xl mb-4">📧</div>
                  <h3 className="text-lg font-bold text-blue-400 mb-3">Email Support</h3>
                  <p className="text-gray-300 text-sm mb-4">
                    Get help with technical issues, billing questions, or feature requests.
                  </p>
                  <p className="text-cyan-300 text-sm">
                    Subject: "Scrum Monsters Support"
                  </p>
                  <p className="text-gray-400 text-xs mt-2">
                    Response within 24 hours
                  </p>
                </div>
                
                <div className="border border-purple-500 rounded-lg p-6 text-center">
                  <div className="text-4xl mb-4">💬</div>
                  <h3 className="text-lg font-bold text-purple-400 mb-3">Community</h3>
                  <p className="text-gray-300 text-sm mb-4">
                    Join other teams, share tips, and get help from the community.
                  </p>
                  <RetroButton size="sm" variant="secondary">
                    Join Discord
                  </RetroButton>
                  <p className="text-gray-400 text-xs mt-2">
                    Coming soon
                  </p>
                </div>
                
                <div className="border border-orange-500 rounded-lg p-6 text-center">
                  <div className="text-4xl mb-4">🚀</div>
                  <h3 className="text-lg font-bold text-orange-400 mb-3">Feature Requests</h3>
                  <p className="text-gray-300 text-sm mb-4">
                    Have an idea for a new boss, feature, or improvement?
                  </p>
                  <RetroButton size="sm" variant="secondary">
                    Submit Idea
                  </RetroButton>
                  <p className="text-gray-400 text-xs mt-2">
                    Community voting
                  </p>
                </div>
              </div>
            </section>

            {/* FAQ Section */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Frequently Asked Questions</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-yellow-400 mb-2">How many people can join a lobby?</h3>
                  <p className="text-gray-300">Free lobbies support up to 8 players. Pro accounts (coming soon) will support unlimited players.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-yellow-400 mb-2">Can I use this with my existing tools?</h3>
                  <p className="text-gray-300">Currently, Scrum Monsters works standalone. Pro features will include integrations with Slack, Jira, and Trello.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-yellow-400 mb-2">Is my data secure?</h3>
                  <p className="text-gray-300">Yes! We don't store any sensitive project data. Only basic session information is kept temporarily for the game to function.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-yellow-400 mb-2">Can I customize the bosses or story points?</h3>
                  <p className="text-gray-300">Custom story point scales are available in lobby settings. Custom bosses will be part of the plugin system (coming soon).</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-yellow-400 mb-2">Does this work on mobile devices?</h3>
                  <p className="text-gray-300">Absolutely! Scrum Monsters is fully responsive and works great on phones, tablets, and desktops.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-yellow-400 mb-2">Can I use this for remote teams?</h3>
                  <p className="text-gray-300">Yes! Scrum Monsters was designed with remote and hybrid teams in mind. Share a link and everyone can join from anywhere.</p>
                </div>
              </div>
            </section>

            {/* Troubleshooting */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Troubleshooting</h2>
              
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-bold text-red-400 mb-4">Connection Issues</h3>
                  <ul className="space-y-2 text-sm text-gray-300">
                    <li>• Check your internet connection</li>
                    <li>• Disable browser extensions that block websockets</li>
                    <li>• Try a different browser (Chrome, Firefox, Safari)</li>
                    <li>• Refresh the page and rejoin the lobby</li>
                    <li>• Check if your firewall blocks websocket connections</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-blue-400 mb-4">Game Performance</h3>
                  <ul className="space-y-2 text-sm text-gray-300">
                    <li>• Close other browser tabs to free up memory</li>
                    <li>• Try turning off music if audio is lagging</li>
                    <li>• Use a desktop/laptop for best performance</li>
                    <li>• Ensure your browser is up to date</li>
                    <li>• Clear browser cache if experiencing issues</li>
                  </ul>
                </div>
              </div>
            </section>

          </div>
          
          {/* Bottom CTA */}
          <div className="text-center mt-16 pt-8 border-t border-gray-700">
            <h2 className="text-2xl font-bold retro-text-glow mb-4">Still Need Help?</h2>
            <p className="text-gray-400 mb-6">
              Can't find what you're looking for? We're here to help.
            </p>
            <RetroButton
              onClick={() => {}}
              size="lg"
              className="text-xl px-8 py-4"
            >
              📧 Contact Support
            </RetroButton>
          </div>
          
        </div>
        
        {/* Footer */}
        <FooterSection />
      </div>
    </div>
  );
}