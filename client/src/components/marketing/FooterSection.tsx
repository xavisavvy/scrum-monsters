import React from 'react';
import { useAudio } from '@/lib/stores/useAudio';

interface FooterSectionProps {
  onNavigate?: (page: 'landing' | 'about' | 'features' | 'pricing' | 'support') => void;
}

export function FooterSection({ onNavigate }: FooterSectionProps) {
  const { playButtonSelect } = useAudio();
  return (
    <div className="px-4 py-8 border-t border-gray-700 bg-black bg-opacity-80">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-gray-400 text-sm mb-4">
          Built with ❤️ for agile teams who love games<br />
          (and hate boring meetings)
        </p>
        <div className="flex flex-wrap justify-center gap-6 text-sm">
          <button 
            onClick={() => {
              playButtonSelect();
              window.scrollTo({ top: 0, behavior: 'smooth' });
              onNavigate?.('about');
            }}
            className="text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
          >
            About
          </button>
          <button 
            onClick={() => {
              playButtonSelect();
              window.scrollTo({ top: 0, behavior: 'smooth' });
              onNavigate?.('features');
            }}
            className="text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
          >
            Features
          </button>
          <button 
            onClick={() => {
              playButtonSelect();
              window.scrollTo({ top: 0, behavior: 'smooth' });
              onNavigate?.('pricing');
            }}
            className="text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
          >
            Pricing
          </button>
          <button 
            onClick={() => {
              playButtonSelect();
              window.scrollTo({ top: 0, behavior: 'smooth' });
              onNavigate?.('support');
            }}
            className="text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
          >
            Support
          </button>
          <a 
            href="https://github.com/xavisavvy/scrum-monsters" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            Open Source
          </a>
        </div>
      </div>
    </div>
  );
}