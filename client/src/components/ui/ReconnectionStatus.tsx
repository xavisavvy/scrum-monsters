import React, { useEffect, useState } from 'react';
import { AlertTriangle, Wifi, WifiOff, RotateCcw, X } from 'lucide-react';
import { RetroButton } from './retro-button';
import { useWebSocket } from '@/lib/stores/useWebSocket';

export function ReconnectionStatus() {
  const { reconnection, isConnected, manualRetry, clearReconnectionState } = useWebSocket();
  const [countdown, setCountdown] = useState(0);

  // Update countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (reconnection.status === 'reconnecting' && reconnection.nextRetryIn > 0) {
      setCountdown(reconnection.nextRetryIn);
      
      interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [reconnection.nextRetryIn, reconnection.status]);

  // Don't show anything if connected normally
  if (isConnected && reconnection.status === 'connected') {
    return null;
  }

  // Don't show if disconnected intentionally (not attempting reconnect)
  if (reconnection.status === 'disconnected' && reconnection.attempt === 0) {
    return null;
  }

  const getStatusContent = () => {
    switch (reconnection.status) {
      case 'reconnecting':
        return {
          icon: <RotateCcw className="w-5 h-5 animate-spin" />,
          title: `Reconnecting... (${reconnection.attempt}/${reconnection.maxAttempts})`,
          message: countdown > 0 
            ? `Next attempt in ${countdown} seconds`
            : 'Attempting to reconnect...',
          variant: 'warning' as const,
          showRetry: false
        };

      case 'failed':
        return {
          icon: <WifiOff className="w-5 h-5" />,
          title: 'Connection Failed',
          message: 'Unable to reconnect to the game. You may need to refresh the page.',
          variant: 'error' as const,
          showRetry: true
        };

      default:
        return {
          icon: <AlertTriangle className="w-5 h-5" />,
          title: 'Connection Issues',
          message: 'Experiencing connectivity problems.',
          variant: 'warning' as const,
          showRetry: true
        };
    }
  };

  const { icon, title, message, variant, showRetry } = getStatusContent();

  const handleRetry = () => {
    console.log('🔄 Manual retry triggered by user');
    manualRetry();
  };

  const handleDismiss = () => {
    if (reconnection.status === 'failed') {
      clearReconnectionState();
    }
  };

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 min-w-[320px] max-w-md">
      <div className={`
        retro-card p-4 border-2 shadow-retro
        ${variant === 'error' 
          ? 'bg-red-900/90 border-red-400 text-red-100' 
          : 'bg-yellow-900/90 border-yellow-400 text-yellow-100'
        }
        backdrop-blur-sm
      `}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {icon}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm mb-1">
              {title}
            </div>
            <div className="text-xs opacity-90 leading-relaxed">
              {message}
            </div>
            
            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3">
              {showRetry && (
                <RetroButton
                  variant="primary"
                  size="sm"
                  onClick={handleRetry}
                  className="text-xs px-3 py-1"
                  disabled={reconnection.status === 'reconnecting'}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Retry Now
                </RetroButton>
              )}
              
              {reconnection.status === 'failed' && (
                <RetroButton
                  variant="secondary"
                  size="sm"
                  onClick={handleDismiss}
                  className="text-xs px-3 py-1"
                >
                  <X className="w-3 h-3 mr-1" />
                  Dismiss
                </RetroButton>
              )}
            </div>
          </div>
        </div>
        
        {/* Progress indicator for reconnecting */}
        {reconnection.status === 'reconnecting' && (
          <div className="mt-3 w-full bg-yellow-800/50 rounded-full h-2">
            <div 
              className="bg-yellow-400 h-2 rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: countdown > 0 
                  ? `${((reconnection.nextRetryIn - countdown) / reconnection.nextRetryIn) * 100}%`
                  : '100%'
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Hook for showing reconnection-related toast notifications
export function useReconnectionToasts() {
  const { reconnection } = useWebSocket();
  const [lastStatus, setLastStatus] = useState(reconnection.status);

  useEffect(() => {
    if (lastStatus !== reconnection.status) {
      // This could be used for additional toast notifications if needed
      // Currently the persistent banner handles most cases
      setLastStatus(reconnection.status);
    }
  }, [reconnection.status, lastStatus]);
}