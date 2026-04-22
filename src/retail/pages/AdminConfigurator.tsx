import { useState, useEffect } from 'react';
import { auth, googleProvider, signInWithPopup, onAuthStateChanged, User } from '../../shared/firebase';
import { Loader2, Shield } from 'lucide-react';
import Home from './Home';

/**
 * Admin-only variant of the pergola configurator. Wrapped in a Firebase
 * auth gate so only signed-in admins can access the advanced controls:
 *
 *   - Partial-length structure walls (length + anchor + end-style)
 *   - Phase 5 customer notes & change requests textarea
 *
 * The public /configurator route renders the same Home component without
 * adminMode, so these controls stay hidden from retail customers.
 *
 * URL: /admin/configurator
 */
export default function AdminConfigurator() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSignIn = async () => {
    setSignInError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Admin sign-in failed', err);
      setSignInError(err?.message || 'Sign-in failed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-luxury-paper">
        <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-luxury-paper via-white to-luxury-paper p-4">
        <div className="max-w-md w-full bg-white border border-luxury-cream rounded-2xl shadow-xl p-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-luxury-gold/10 flex items-center justify-center mb-4">
              <Shield className="w-7 h-7 text-luxury-gold" />
            </div>
            <h1 className="text-xl font-serif text-luxury-black mb-1">Admin Configurator</h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-6 max-w-xs">
              This extended configurator is reserved for Eclipse admins. Sign in with your authorized Google account to continue.
            </p>
            <button
              type="button"
              onClick={handleSignIn}
              className="luxury-button w-full !py-2.5 text-[11px] inline-flex items-center justify-center gap-2"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032 s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2 C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
              </svg>
              Sign in with Google
            </button>
            {signInError && (
              <p className="text-xs text-rose-600 mt-3">{signInError}</p>
            )}
            <a
              href="/configurator"
              className="mt-6 text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 hover:text-luxury-gold"
            >
              Use public configurator instead →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <Home skipIntro adminMode />;
}
