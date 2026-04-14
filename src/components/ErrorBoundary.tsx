import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-[#FAF9F6] w-full h-full flex flex-col items-center justify-center text-center">
          <img src="/logo.png" alt="Eclipse Pergola" className="h-10 mb-6 opacity-60" />
          <h2 className="text-lg font-serif text-[#1A1A1A] mb-2">3D Preview Unavailable</h2>
          <p className="text-sm text-[#1A1A1A]/50 max-w-xs">
            Your browser may not support 3D rendering. Please try a modern browser with GPU acceleration enabled.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
