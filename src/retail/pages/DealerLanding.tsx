import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { Loader2 } from 'lucide-react';
import Home from './Home';

/**
 * Co-branded dealer landing — renders the main configurator wrapped with
 * the dealer's logo + name, and tags every submission with the dealer's
 * email + slug for attribution. Customer always sees retail pricing;
 * dealer cost / margin is computed in the admin CRM later.
 */
export default function DealerLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) {
      setError('Invalid dealer link.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'dealerProfiles', slug.toLowerCase()));
        if (!snap.exists()) {
          setError("This dealer link doesn't exist or has been deactivated.");
        } else {
          setProfile({ id: snap.id, ...snap.data() });
        }
      } catch (e: any) {
        console.error(e);
        setError('Unable to load this dealer page right now.');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-luxury-paper flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-luxury-gold mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-luxury-paper flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <img src="/logo.png" alt="Eclipse Pergola" className="h-10 mx-auto mb-6 opacity-80" />
          <h1 className="text-xl font-serif text-luxury-black mb-3">Dealer Page Unavailable</h1>
          <p className="text-sm text-gray-500 leading-relaxed">{error || 'Something went wrong.'}</p>
          <a href="/" className="inline-block mt-6 text-xs uppercase tracking-widest font-bold text-luxury-gold hover:underline">
            Continue to Eclipse Pergola →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Co-brand header — sits above the configurator */}
      <div className="bg-white border-b border-luxury-cream relative z-30">
        <div className="max-w-[1920px] mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Eclipse Pergola" className="h-8 object-contain" />
          </div>
          <div className="flex items-center gap-3">
            {profile.logoUrl && (
              <img src={profile.logoUrl} alt={profile.companyName} className="h-8 max-w-[160px] object-contain" />
            )}
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest font-bold text-luxury-gold leading-tight">Designed in partnership with</p>
              <p className="text-sm font-bold text-luxury-black leading-tight">{profile.companyName}</p>
              {profile.phone && <p className="text-[10px] text-gray-500 leading-tight">{profile.phone}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Pass dealer info to Home — Home will use these to tag the submission */}
      <Home
        skipIntro={false}
        dealerSlug={profile.slug}
        dealerEmail={profile.contractorEmail}
        dealerName={profile.companyName}
      />
    </div>
  );
}
