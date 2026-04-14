import { useState, type FormEvent } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../../shared/firebase';

export default function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen bg-[#111] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8">
            <img src="/logo.png" alt="Eclipse Pro" className="h-12 w-12 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-[#C5A059]">Eclipse Pro</h1>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
            Invalid signup link. A valid invite token is required. Please check the link in your invitation email.
          </div>
          <a
            href="/login"
            className="inline-block mt-6 text-[#C5A059] text-sm hover:underline"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // Activate contractor account on server
      const res = await fetch('/api/pro/activate-contractor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken: token, uid }),
      });

      const result = await res.json();

      if (!result.success) {
        setError(result.error || 'Failed to activate account. Please contact support.');
        return;
      }

      navigate('/', { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes('email-already-in-use')) {
          setError('This email is already registered. Please use the login page instead.');
        } else if (err.message.includes('invalid-email')) {
          setError('Invalid email address.');
        } else if (err.message.includes('weak-password')) {
          setError('Password is too weak. Use at least 8 characters.');
        } else {
          setError('Something went wrong. Please try again.');
        }
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Eclipse Pro" className="h-12 w-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#C5A059]">Eclipse Pro</h1>
          <p className="text-gray-400 text-sm mt-1">Create Your Contractor Account</p>
        </div>

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#C5A059] transition-colors"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#C5A059] transition-colors"
              placeholder="Min. 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1.5">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#C5A059] transition-colors"
              placeholder="Re-enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#C5A059] hover:bg-[#b8933f] text-black font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-gray-500 text-xs mt-8">
          Already have an account?{' '}
          <a href="/login" className="text-[#C5A059] hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}
