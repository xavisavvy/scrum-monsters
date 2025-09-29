import React from 'react';
import { Wifi, WifiOff, RotateCcw, AlertTriangle } from 'lucide-react';
import { useWebSocket } from '@/lib/stores/useWebSocket';

export function ConnectionIndicator() {
  const { isConnected, reconnection } = useWebSocket();

  const getIndicatorProps = () => {
    if (isConnected && reconnection.status === 'connected') {
      return {
        icon: <Wifi className="w-3 h-3" />,
        title: 'Connected',
        className: 'bg-green-600 text-green-100 border-green-400',
        pulse: false
      };
    }

    switch (reconnection.status) {
      case 'reconnecting':
        return {
          icon: <RotateCcw className="w-3 h-3 animate-spin" />,
          title: `Reconnecting... (${reconnection.attempt}/${reconnection.maxAttempts})`,
          className: 'bg-yellow-600 text-yellow-100 border-yellow-400',
          pulse: true
        };

      case 'failed':
        return {
          icon: <WifiOff className="w-3 h-3" />,
          title: 'Connection Failed',
          className: 'bg-red-600 text-red-100 border-red-400',
          pulse: false
        };

      default:
        return {
          icon: <AlertTriangle className="w-3 h-3" />,
          title: 'Connection Issues',
          className: 'bg-orange-600 text-orange-100 border-orange-400',
          pulse: false
        };
    }
  };

  const { icon, title, className, pulse } = getIndicatorProps();

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div
        className={`
          flex items-center gap-2 px-2 py-1 rounded-md border text-xs font-medium
          ${className}
          ${pulse ? 'animate-pulse' : ''}
          transition-all duration-300
          shadow-lg backdrop-blur-sm
        `}
        title={title}
      >
        {icon}
        <span className="hidden sm:inline">
          {isConnected && reconnection.status === 'connected' ? 'Online' : 
           reconnection.status === 'reconnecting' ? 'Reconnecting' :
           reconnection.status === 'failed' ? 'Offline' : 'Issues'}
        </span>
      </div>
    </div>
  );
}