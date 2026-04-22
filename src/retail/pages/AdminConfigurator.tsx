import React, { Component, ErrorInfo } from 'react';
import Home from './Home';

interface BoundaryState {
  error: Error | null;
  info: ErrorInfo | null;
}

/** Top-level boundary so a crash in the admin configurator shows a
 *  useful message instead of a blank page, and the admin can copy
 *  the stack trace to share for debugging. */
class AdminErrorBoundary extends Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null, info: null };
  static getDerivedStateFromError(error: Error) { return { error, info: null }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AdminConfigurator] Crash:', error, info);
    this.setState({ error, info });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-luxury-paper p-4">
          <div className="max-w-2xl w-full bg-white border border-rose-300 rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-serif text-rose-700 mb-2">Configurator Error</h2>
            <p className="text-sm text-slate-600 mb-4">
              Something broke in the admin configurator. The details below help debug what happened.
            </p>
            <pre className="text-[10px] bg-slate-50 border border-slate-200 rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap">
{String(this.state.error?.message || this.state.error)}
{'\n\n'}
{String(this.state.error?.stack || '').slice(0, 2000)}
{this.state.info?.componentStack ? '\n\n--- Component stack ---' + this.state.info.componentStack.slice(0, 2000) : ''}
            </pre>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { this.setState({ error: null, info: null }); }}
                className="luxury-button-outline flex-1 !py-2 text-[11px]"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="luxury-button flex-1 !py-2 text-[11px]"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Admin variant of the pergola configurator — exposes the advanced
 * controls that are hidden from the public /configurator route.
 *
 * Access is by URL only — no sign-in gate. Share the link internally.
 *
 * URL: /admin/configurator
 */
export default function AdminConfigurator() {
  return (
    <AdminErrorBoundary>
      <Home skipIntro adminMode />
    </AdminErrorBoundary>
  );
}
