import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../shared/firebase';

export type ContractorData = {
  uid: string;
  companyName: string;
  contactName: string;
  email: string;
  discountPercentage: number;
  status: 'invited' | 'active' | 'suspended';
};

type AuthGuardProps = {
  children: (contractor: ContractorData) => ReactNode;
};

export default function AuthGuard({ children }: AuthGuardProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [contractor, setContractor] = useState<ContractorData | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        navigate('/login', { replace: true });
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'contractors', user.uid));
        if (snap.exists()) {
          const data = snap.data() as Omit<ContractorData, 'uid'>;
          if (data.status === 'active') {
            setContractor({ ...data, uid: user.uid });
            setLoading(false);
            return;
          }
        }
        // Contractor doc missing or not active
        setLoading(false);
        navigate('/login', { replace: true });
      } catch {
        setLoading(false);
        navigate('/login', { replace: true });
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#C5A059] border-t-transparent" />
      </div>
    );
  }

  if (!contractor) return null;

  return <>{children(contractor)}</>;
}
