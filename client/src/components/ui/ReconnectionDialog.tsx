import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, HelpCircle, X } from 'lucide-react';
import { RetroButton } from './retro-button';
import { useWebSocket } from '@/lib/stores/useWebSocket';

interface ReconnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshPage: () => void;
}

export function ReconnectionDialog({ isOpen, onClose, onRefreshPage }: ReconnectionDialogProps) {
  const { reconnection, manualRetry, clearReconnectionState } = useWebSocket();
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  if (!isOpen) return null;

  const handleRetry = () => {
    console.log('🔄 Manual retry from dialog');
    manualRetry();
  };

  const handleDismiss = () => {
    clearReconnectionState();
    onClose();
  };

  const handleRefresh = () => {
    onRefreshPage();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="retro-card bg-gray-900 border-red-400 border-2 max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <h2 className="text-xl font-bold text-red-400">Connection Lost</h2>
          <button 
            onClick={onClose}
            className="ml-auto text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="text-gray-200 mb-6">
          <p className="mb-3">
            We've lost connection to the game server after {reconnection.maxAttempts} attempts. 
            Your game progress is saved and you can continue once reconnected.
          </p>
          
          {!showTroubleshooting ? (
            <button
              onClick={() => setShowTroubleshooting(true)}
              className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
            >
              <HelpCircle className="w-4 h-4" />
              Show troubleshooting tips
            </button>
          ) : (
            <div className="bg-gray-800 p-3 rounded border border-gray-600 text-sm">
              <h4 className="font-semibold text-gray-300 mb-2">Troubleshooting:</h4>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>Check your internet connection</li>
                <li>Disable VPN if using one</li>
                <li>Try refreshing the page</li>
                <li>Contact support if issues persist</li>
              </ul>
              <button
                onClick={() => setShowTroubleshooting(false)}
                className="text-blue-400 hover:text-blue-300 text-xs mt-2"
              >
                Hide tips
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <RetroButton
            onClick={handleRetry}
            variant="primary"
            className="flex-1 flex items-center justify-center gap-2"
            disabled={reconnection.status === 'reconnecting'}
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </RetroButton>
          
          <RetroButton
            onClick={handleRefresh}
            variant="secondary"
            className="flex-1 flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Page
          </RetroButton>
        </div>

        <div className="flex justify-center mt-4">
          <RetroButton
            onClick={handleDismiss}
            variant="secondary"
            size="sm"
            className="text-gray-400 hover:text-gray-200"
          >
            Dismiss
          </RetroButton>
        </div>
      </div>
    </div>
  );
}