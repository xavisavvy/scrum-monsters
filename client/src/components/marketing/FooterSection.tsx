import React from 'react';

export function FooterSection() {
  return (
    <div className="px-4 py-8 border-t border-gray-700 bg-black bg-opacity-80">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-gray-400 text-sm mb-4">
          Built with ❤️ for agile teams who love games<br />
          (and hate boring meetings)
        </p>
        <div className="flex flex-wrap justify-center gap-6 text-sm">
          <a href="/about" className="text-blue-400 hover:text-blue-300 transition-colors">About</a>
          <a href="/features" className="text-blue-400 hover:text-blue-300 transition-colors">Features</a>
          <a href="/pricing" className="text-blue-400 hover:text-blue-300 transition-colors">Pricing</a>
          <a href="/support" className="text-blue-400 hover:text-blue-300 transition-colors">Support</a>
          <a href="#" className="text-blue-400 hover:text-blue-300 transition-colors">Open Source</a>
        </div>
      </div>
    </div>
  );
}