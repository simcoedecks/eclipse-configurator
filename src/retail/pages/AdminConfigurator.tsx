import React, { Component, ErrorInfo, useEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import Home from './Home';
import { auth, onAuthStateChanged, User } from '../../shared/firebase';
import { isAuthorizedAdmin } from '../../shared/lib/adminAuth';

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
 * controls (and dealer cost / showroom pricing) hidden from the public
 * /configurator route.
 *
 * Requires an authorized admin to be signed in. Anyone who isn't gets an
 * access-denied screen with a link to sign in at /admin. (firestore.rules
 * independently block all writes for non-admins.)
 *
 * URL: /admin/configurator
 */
export default function AdminConfigurator() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
    return () => unsub();
  }, []);

  // Read ?submissionId=... so the admin can re-open an existing quote
  // in the configurator for editing. Home's hydration effect takes
  // over from there.
  const submissionId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('submissionId') || undefined
    : undefined;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-luxury-paper">
        <Loader2 className="w-8 h-8 animate-spin text-luxury-gold" />
      </div>
    );
  }

  // Gate access: must be a signed-in, authorized admin.
  if (!isAuthorizedAdmin(user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-luxury-paper via-luxury-cream to-luxury-paper p-6">
        <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-xl max-w-md w-full border border-luxury-cream text-center">
          <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-rose-500" />
          </div>
          <h1 className="text-2xl font-serif text-luxury-black mb-2">Access Denied</h1>
          <p className="text-sm text-gray-600 mb-6">
            {user
              ? <><span className="font-medium text-luxury-black break-all">{user.email}</span> isn't authorized to use the admin configurator.</>
              : 'Sign in with an authorized admin account to use the admin configurator.'}
          </p>
          <div className="flex flex-col gap-2">
            <a
              href="/admin"
              className="w-full bg-luxury-black text-white px-6 py-3 rounded-lg text-sm font-bold uppercase tracking-widest hover:bg-luxury-gold hover:text-luxury-black transition-colors"
            >
              Go to Admin Sign-In
            </a>
            {user && (
              <button
                onClick={() => auth.signOut()}
                className="w-full text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-luxury-gold py-2"
              >
                Sign out {user.email}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminErrorBoundary>
      <Home skipIntro adminMode editSubmissionId={submissionId} />
    </AdminErrorBoundary>
  );
}
