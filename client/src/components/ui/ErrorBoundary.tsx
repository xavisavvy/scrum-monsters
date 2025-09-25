import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging
    console.error('🚨 ErrorBoundary caught an error:', error, errorInfo);
    
    // For DOM manipulation errors during phase transitions, we'll reset the error immediately
    if (error.message.includes('insertBefore') || error.message.includes('DOM') || error.message.includes('Failed to execute')) {
      console.log('🔄 DOM reconciliation error detected, auto-recovering immediately...');
      // Immediate recovery for DOM errors
      setTimeout(() => {
        this.setState({ hasError: false, error: undefined });
        console.log('✅ DOM error recovery completed');
      }, 10); // Very fast recovery
    }
  }

  public render() {
    if (this.state.hasError) {
      // Return fallback UI or empty div to prevent crash
      return this.props.fallback || <div className="error-recovery" />;
    }

    return this.props.children;
  }
}