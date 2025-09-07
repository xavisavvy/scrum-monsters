import React from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { CinematicBackground } from '@/components/ui/CinematicBackground';
import { FooterSection } from '@/components/marketing/FooterSection';
import { useAudio } from '@/lib/stores/useAudio';

interface AboutPageProps {
  onBackToHome: () => void;
  onNavigate: (page: 'landing' | 'about' | 'features' | 'pricing' | 'support') => void;
}

export function AboutPage({ onBackToHome, onNavigate }: AboutPageProps) {
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
            <div className="flex items-center justify-center gap-4 mb-6">
              <img 
                src="/scrum-monster-icon.png" 
                alt="Scrum Monster" 
                className="w-12 md:w-16 h-12 md:h-16 pixelated object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
              <h1 className="text-4xl md:text-6xl font-bold retro-text-glow">
                About Scrum Monsters
              </h1>
            </div>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Turning sprint planning from a slog into a focused, engaging ritual that teams actually enjoy.
            </p>
          </header>

          {/* Main Content */}
          <div className="space-y-16">
            
            {/* Creator Section */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Meet the Creator</h2>
              
              <div className="grid md:grid-cols-2 gap-8 items-start">
                <div>
                  <div className="mb-6">
                    <img 
                      src="/images/victory/victory-1.png" 
                      alt="Preston Farr" 
                      className="w-24 h-24 pixelated object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <h3 className="text-xl font-bold text-cyan-400 mb-4">Preston Farr</h3>
                  <p className="text-lg text-gray-300 mb-2">Technical Manager of Software Engineering</p>
                  <p className="text-sm text-gray-400 mb-6">Based in Clearfield, Utah</p>
                  
                  <p className="text-gray-300 leading-relaxed mb-4">
                    Native mobile and full stack web developer with a strong UX research and design background. 
                    I lead engineering teams, ship products, and facilitate agile ceremonies.
                  </p>
                  
                  <p className="text-gray-300 leading-relaxed">
                    I built Scrum Monsters after years of seeing planning poker lose energy and focus. 
                    Planning and estimation can feel dry, especially remote. Scrum Monsters keeps ceremonies 
                    short, engaging, and memorable while still producing reliable story points.
                  </p>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-bold text-green-400 mb-3">Technical Expertise</h4>
                    <div className="space-y-2 text-sm">
                      <div><span className="text-cyan-300">Frontend:</span> React, TypeScript, Tailwind</div>
                      <div><span className="text-cyan-300">Backend:</span> Node.js, Express, REST and WebSocket patterns</div>
                      <div><span className="text-cyan-300">Platforms:</span> Replit for build and deploy, Vercel/Netlify friendly</div>
                      <div><span className="text-cyan-300">Methods:</span> Agile and Scrum facilitation, UX research, rapid prototyping</div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-bold text-purple-400 mb-3">Why I'm Credible</h4>
                    <ul className="text-sm text-gray-300 space-y-1">
                      <li>• Lead engineering teams across mobile and web platforms</li>
                      <li>• Ship user-facing software for real teams</li>
                      <li>• Facilitate planning ceremonies regularly</li>
                      <li>• Combine developer, UX, and leadership perspectives</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Technology Section */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Built with Modern Tech</h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                <div className="border border-cyan-500 rounded-lg p-4">
                  <h3 className="text-lg font-bold text-cyan-400 mb-3">Frontend Stack</h3>
                  <ul className="text-sm space-y-1">
                    <li>• React + TypeScript UI</li>
                    <li>• Tailwind for styling</li>
                    <li>• Real-time WebSocket updates</li>
                    <li>• Hand-drawn pixel art assets</li>
                  </ul>
                </div>
                
                <div className="border border-green-500 rounded-lg p-4">
                  <h3 className="text-lg font-bold text-green-400 mb-3">Backend & Infrastructure</h3>
                  <ul className="text-sm space-y-1">
                    <li>• Node.js backend</li>
                    <li>• Express with room sessions</li>
                    <li>• Socket.IO for real-time multiplayer</li>
                    <li>• Designed for Replit deployment</li>
                  </ul>
                </div>
                
                <div className="border border-purple-500 rounded-lg p-4">
                  <h3 className="text-lg font-bold text-purple-400 mb-3">Development Process</h3>
                  <ul className="text-sm space-y-1">
                    <li>• Built on Replit for instant environments</li>
                    <li>• AI-assisted brainstorming and code review</li>
                    <li>• Rapid prototyping approach</li>
                    <li>• Standard web tooling for build/lint</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Roadmap Section */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">What's Coming Next</h2>
              
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Pro Tier Features</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">✓</span>
                      Slack, Jira, and Trello integrations
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">✓</span>
                      Team analytics exports and coach toolkits
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">✓</span>
                      Static room names and password protection
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">✓</span>
                      Purchase history and account management
                    </li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-xl font-bold text-orange-400 mb-4">Community Features</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-blue-400 mr-2">⚡</span>
                      Boss Packs and monthly community monsters
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-400 mr-2">⚡</span>
                      Plugin system for community-made bosses
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-400 mr-2">⚡</span>
                      Open source core gameplay and plugin API
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-400 mr-2">⚡</span>
                      Custom mini-games and battle mechanics
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Target Audience Section */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Built for Agile Teams</h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-4xl mb-4">🎯</div>
                  <h3 className="text-lg font-bold text-blue-400 mb-3">SCRUM Masters</h3>
                  <p className="text-sm text-gray-300">
                    Keep ceremonies engaging and on-track. Turn estimation fatigue into focused energy 
                    that produces reliable story points.
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="text-4xl mb-4">👥</div>
                  <h3 className="text-lg font-bold text-green-400 mb-3">Tech Leaders</h3>
                  <p className="text-sm text-gray-300">
                    Boost team productivity with rituals your developers actually enjoy. 
                    Lightweight process that doesn't get in the way of real work.
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="text-4xl mb-4">💻</div>
                  <h3 className="text-lg font-bold text-purple-400 mb-3">Developers</h3>
                  <p className="text-sm text-gray-300">
                    Finally, estimation that doesn't feel like a waste of time. Battle scope creep, 
                    bugs, and technical debt while you plan.
                  </p>
                </div>
              </div>
            </section>

            {/* Timeline & Open Source */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Project Timeline & Philosophy</h2>
              
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-bold text-cyan-400 mb-4">Development Story</h3>
                  <p className="text-gray-300 leading-relaxed mb-4">
                    Initial playable prototype built on Replit over a few evenings. The goal was rapid iteration 
                    and getting something fun into the hands of real teams quickly.
                  </p>
                  <p className="text-gray-300 leading-relaxed">
                    Ongoing polish and content drops as time allows, driven by community feedback and 
                    real-world usage in agile ceremonies.
                  </p>
                </div>
                
                <div>
                  <h3 className="text-xl font-bold text-green-400 mb-4">Open Source Approach</h3>
                  <p className="text-gray-300 leading-relaxed mb-4">
                    Plan to open source the core gameplay and plugin API so the community can add bosses 
                    and mini-games. This keeps the platform extensible and community-driven.
                  </p>
                  <p className="text-gray-300 leading-relaxed">
                    Paid integrations and trainer assets will remain commercial to support ongoing 
                    development and platform maintenance.
                  </p>
                </div>
              </div>
            </section>

            {/* Contact Section */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8 text-center">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Get In Touch</h2>
              
              <div className="max-w-2xl mx-auto space-y-6">
                <p className="text-gray-300 leading-relaxed">
                  Questions about Scrum Monsters? Want to discuss partnerships or press inquiries? 
                  I'd love to hear from you.
                </p>
                
                <div className="space-y-4">
                  <p className="text-lg">
                    <span className="text-cyan-400">Email:</span> 
                    <span className="text-gray-300"> Use subject "Scrum Monsters" for fastest response</span>
                  </p>
                  
                  <div className="flex justify-center space-x-6 text-sm">
                    <a href="#" className="text-blue-400 hover:text-blue-300 transition-colors">LinkedIn</a>
                    <a href="#" className="text-blue-400 hover:text-blue-300 transition-colors">GitHub</a>
                    <a href="#" className="text-blue-400 hover:text-blue-300 transition-colors">Twitter</a>
                    <a href="#" className="text-blue-400 hover:text-blue-300 transition-colors">Personal Site</a>
                  </div>
                </div>
              </div>
            </section>

          </div>
          
          {/* Bottom CTA */}
          <div className="text-center mt-16 pt-8 border-t border-gray-700">
            <h2 className="text-2xl font-bold retro-text-glow mb-4">Ready to Transform Your Sprint Planning?</h2>
            <p className="text-gray-400 mb-6">
              Join teams who've made estimation engaging, focused, and fun.
            </p>
            <RetroButton
              onClick={handleBackClick}
              size="lg"
              className="text-xl px-8 py-4"
            >
              🎮 Try Scrum Monsters Now
            </RetroButton>
          </div>
          
        </div>
        
        {/* Footer */}
        <FooterSection onNavigate={onNavigate} />
      </div>
    </div>
  );
}