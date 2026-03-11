import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RetroCard } from '@/components/ui/retro-card';
import { RetroButton } from '@/components/ui/retro-button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  phaseName?: string;
  onRetry?: () => void;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error?: Error;
}

function JRPGErrorFallback({
  error,
  phaseName,
  onRetry,
}: {
  error?: Error;
  phaseName?: string;
  onRetry: () => void;
}) {
  const message = phaseName
    ? `The ${phaseName} phase encountered a curse.`
    : 'Something went wrong.';

  const errorText = error?.message
    ? error.message.length > 100
      ? error.message.slice(0, 100) + '...'
      : error.message
    : 'Unknown error';

  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <RetroCard className="max-w-md w-full">
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="text-5xl">💀</div>
          <h2 className="retro-text-glow text-red-400 text-xl font-bold">
            A Glitch in the Matrix!
          </h2>
          <p className="text-gray-300">{message}</p>
          <p className="text-xs text-gray-500 font-mono break-all">
            {errorText}
          </p>
          <RetroButton variant="primary" onClick={onRetry}>
            Cast Resurrect
          </RetroButton>
        </div>
      </RetroCard>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  public componentDidUpdate(prevProps: Readonly<Props>) {
    // Reset error state when resetKey changes (e.g., phase transitions)
    if (
      this.state.hasError &&
      prevProps.resetKey !== undefined &&
      this.props.resetKey !== undefined &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging
    console.error('🚨 ErrorBoundary caught an error:', error, errorInfo);

    // For DOM manipulation errors during phase transitions, we'll reset the error immediately
    if (error.message.includes('insertBefore') || error.message.includes('DOM') || error.message.includes('Failed to execute')) {
      // Immediate recovery for DOM errors
      setTimeout(() => {
        this.setState({ hasError: false, error: undefined });
      }, 10); // Very fast recovery
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onRetry?.();
  };

  public render() {
    if (this.state.hasError) {
      // Return custom fallback, provided fallback, or JRPG-themed error UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <JRPGErrorFallback
          error={this.state.error}
          phaseName={this.props.phaseName}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}
