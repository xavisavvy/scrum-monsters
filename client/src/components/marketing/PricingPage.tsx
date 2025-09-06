import React from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { CinematicBackground } from '@/components/ui/CinematicBackground';
import { FooterSection } from '@/components/marketing/FooterSection';
import { useAudio } from '@/lib/stores/useAudio';

interface PricingPageProps {
  onBackToHome: () => void;
}

export function PricingPage({ onBackToHome }: PricingPageProps) {
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
              Pricing
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Simple, transparent pricing that scales with your team. Start free, upgrade when you're ready.
            </p>
          </header>

          {/* Main Content */}
          <div className="space-y-16">
            
            {/* Pricing Tiers */}
            <section className="grid md:grid-cols-2 gap-8">
              
              {/* Free Tier */}
              <div className="bg-black bg-opacity-60 rounded-lg p-8 border border-gray-600">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-green-400 mb-2">Free Forever</h2>
                  <div className="text-4xl font-bold retro-text-glow-light mb-2">$0</div>
                  <p className="text-gray-400">Perfect for getting started</p>
                </div>
                
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start">
                    <span className="text-green-400 mr-2">✓</span>
                    <span className="text-gray-300">Up to 8 players per session</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-400 mr-2">✓</span>
                    <span className="text-gray-300">All 5 boss battles included</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-400 mr-2">✓</span>
                    <span className="text-gray-300">Basic avatar classes</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-400 mr-2">✓</span>
                    <span className="text-gray-300">Real-time multiplayer</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-400 mr-2">✓</span>
                    <span className="text-gray-300">Planning poker & estimation</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-400 mr-2">✓</span>
                    <span className="text-gray-300">Works on any device</span>
                  </li>
                </ul>
                
                <RetroButton 
                  onClick={handleBackClick}
                  className="w-full"
                  variant="secondary"
                >
                  Start Playing Free
                </RetroButton>
              </div>
              
              {/* Pro Tier */}
              <div className="bg-black bg-opacity-60 rounded-lg p-8 border-2 border-purple-500 relative">
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-purple-500 text-white px-4 py-1 rounded-full text-sm font-bold">
                    Coming Soon
                  </span>
                </div>
                
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-purple-400 mb-2">Pro Team</h2>
                  <div className="text-4xl font-bold retro-text-glow-light mb-2">$5</div>
                  <p className="text-gray-400">per user/month • billed annually</p>
                </div>
                
                <div className="text-sm text-gray-500 mb-4 text-center">
                  Everything in Free, plus:
                </div>
                
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start">
                    <span className="text-purple-400 mr-2">✓</span>
                    <span className="text-gray-300">Unlimited players per session</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-400 mr-2">✓</span>
                    <span className="text-gray-300">Slack, Jira & Trello integrations</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-400 mr-2">✓</span>
                    <span className="text-gray-300">Team analytics & reports</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-400 mr-2">✓</span>
                    <span className="text-gray-300">Custom room names & passwords</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-400 mr-2">✓</span>
                    <span className="text-gray-300">Priority support</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-400 mr-2">✓</span>
                    <span className="text-gray-300">Premium boss packs</span>
                  </li>
                </ul>
                
                <RetroButton 
                  onClick={() => {}}
                  className="w-full opacity-60 cursor-not-allowed"
                  disabled
                >
                  Coming Q2 2025
                </RetroButton>
              </div>
            </section>

            {/* Boss Packs */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Boss Packs & Add-ons</h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                <div className="border border-orange-500 rounded-lg p-6">
                  <div className="text-center mb-4">
                    <div className="text-3xl mb-2">👹</div>
                    <h3 className="text-lg font-bold text-orange-400 mb-2">Season Boss Pack</h3>
                    <div className="text-2xl font-bold">$2.99</div>
                    <p className="text-sm text-gray-400">per pack</p>
                  </div>
                  <ul className="text-sm space-y-2">
                    <li>• 3 new seasonal bosses</li>
                    <li>• Unique battle mechanics</li>
                    <li>• Themed achievements</li>
                    <li>• Community-voted content</li>
                  </ul>
                </div>
                
                <div className="border border-cyan-500 rounded-lg p-6">
                  <div className="text-center mb-4">
                    <div className="text-3xl mb-2">🎨</div>
                    <h3 className="text-lg font-bold text-cyan-400 mb-2">Avatar Themes</h3>
                    <div className="text-2xl font-bold">$1.99</div>
                    <p className="text-sm text-gray-400">per theme</p>
                  </div>
                  <ul className="text-sm space-y-2">
                    <li>• Premium avatar designs</li>
                    <li>• Animated sprites</li>
                    <li>• Custom color schemes</li>
                    <li>• Team branding options</li>
                  </ul>
                </div>
                
                <div className="border border-green-500 rounded-lg p-6">
                  <div className="text-center mb-4">
                    <div className="text-3xl mb-2">🏢</div>
                    <h3 className="text-lg font-bold text-green-400 mb-2">Enterprise</h3>
                    <div className="text-2xl font-bold">Custom</div>
                    <p className="text-sm text-gray-400">contact us</p>
                  </div>
                  <ul className="text-sm space-y-2">
                    <li>• SSO integration</li>
                    <li>• Custom boss creation</li>
                    <li>• White-label options</li>
                    <li>• Dedicated support</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* FAQ Section */}
            <section className="bg-black bg-opacity-60 rounded-lg p-8">
              <h2 className="text-3xl font-bold retro-text-glow mb-6">Frequently Asked Questions</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-yellow-400 mb-2">Can I try Pro features before subscribing?</h3>
                  <p className="text-gray-300">Absolutely! We'll offer a 14-day free trial of Pro features when they launch. No credit card required.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-yellow-400 mb-2">What payment methods do you accept?</h3>
                  <p className="text-gray-300">We accept all major credit cards, PayPal, and can arrange invoicing for enterprise customers. All payments are processed securely through Stripe.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-yellow-400 mb-2">Can I cancel anytime?</h3>
                  <p className="text-gray-300">Yes! Cancel your subscription anytime through your account settings. You'll keep Pro features until the end of your billing period.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-yellow-400 mb-2">Do you offer team discounts?</h3>
                  <p className="text-gray-300">Teams of 10+ users get automatic volume discounts. Enterprise customers receive custom pricing based on their needs.</p>
                </div>
              </div>
            </section>

          </div>
          
          {/* Bottom CTA */}
          <div className="text-center mt-16 pt-8 border-t border-gray-700">
            <h2 className="text-2xl font-bold retro-text-glow mb-4">Ready to Start Your Quest?</h2>
            <p className="text-gray-400 mb-6">
              Join thousands of teams making sprint planning engaging and efficient.
            </p>
            <RetroButton
              onClick={handleBackClick}
              size="lg"
              className="text-xl px-8 py-4"
            >
              🎮 Play Free Forever
            </RetroButton>
          </div>
          
        </div>
        
        {/* Footer */}
        <FooterSection />
      </div>
    </div>
  );
}