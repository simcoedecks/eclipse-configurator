import { useState, useEffect } from 'react';
import { db, auth, googleProvider, signInWithPopup, onAuthStateChanged, User, collection, addDoc, serverTimestamp, doc, setDoc } from '../shared/firebase';
import { getDocs, query, orderBy, where, onSnapshot } from 'firebase/firestore';
import { LogOut, Loader2, DollarSign, CheckCircle } from 'lucide-react';
import { toast, Toaster } from 'sonner';

export default function Contractor() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [myBids, setMyBids] = useState<any[]>([]);
  const [myQuotes, setMyQuotes] = useState<any[]>([]);
  const [biddingJobId, setBiddingJobId] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidMessage, setBidMessage] = useState('');
  const [submittingBid, setSubmittingBid] = useState(false);
  const [activeTab, setActiveTab] = useState<'jobs' | 'quotes'>('jobs');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Ensure user record exists with contractor role
    const userRef = doc(db, 'users', user.uid);
    setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      role: 'contractor',
      lastLogin: serverTimestamp()
    }, { merge: true });

    // Listen to open jobs
    const qJobs = query(collection(db, 'jobs'), where('status', '==', 'open'), orderBy('createdAt', 'desc'));
    const unsubJobs = onSnapshot(qJobs, (snapshot) => {
      setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to my bids
    const qBids = query(collection(db, 'bids'), where('contractorId', '==', user.uid));
    const unsubBids = onSnapshot(qBids, (snapshot) => {
      setMyBids(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to my quotes
    const qQuotes = query(collection(db, 'jobs'), where('contractorId', '==', user.uid));
    const unsubQuotes = onSnapshot(qQuotes, (snapshot) => {
      const allMyJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      const quotes = allMyJobs.filter(j => j.status === 'contractor_quote');
      quotes.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setMyQuotes(quotes);
    });

    return () => {
      unsubJobs();
      unsubBids();
      unsubQuotes();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      toast.error('Failed to log in: ' + err.message);
    }
  };

  const submitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !biddingJobId) return;

    setSubmittingBid(true);
    try {
      await addDoc(collection(db, 'bids'), {
        jobId: biddingJobId,
        contractorId: user.uid,
        contractorName: user.displayName || user.email,
        amount: Number(bidAmount),
        message: bidMessage,
        createdAt: serverTimestamp()
      });
      toast.success('Bid submitted successfully!');
      setBiddingJobId(null);
      setBidAmount('');
      setBidMessage('');
    } catch (err: any) {
      toast.error('Failed to submit bid: ' + err.message);
    } finally {
      setSubmittingBid(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f1f5f9]">
        <Loader2 className="w-8 h-8 animate-spin text-luxury-black" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f1f5f9] p-4">
        <div className="bg-white p-8 rounded-xl shadow-xl max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-2 font-sans tracking-tight text-luxury-black">Contractor Portal</h1>
          <p className="text-gray-500 mb-8 text-sm">Sign in to view available jobs and submit bids.</p>
          <button 
            onClick={handleLogin}
            className="w-full luxury-button py-3 flex items-center justify-center gap-2"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] font-sans">
      <Toaster position="top-center" />
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight text-luxury-black">Contractor Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:inline-block">{user.email}</span>
            <button 
              onClick={() => auth.signOut()}
              className="p-2 text-gray-500 hover:text-luxury-black transition-colors rounded-full hover:bg-gray-100"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <div className="flex gap-6">
                <button
                  onClick={() => setActiveTab('jobs')}
                  className={`text-lg font-bold uppercase tracking-widest pb-4 -mb-4 border-b-2 transition-colors ${
                    activeTab === 'jobs' ? 'border-luxury-black text-luxury-black' : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Available Jobs
                </button>
                <button
                  onClick={() => setActiveTab('quotes')}
                  className={`text-lg font-bold uppercase tracking-widest pb-4 -mb-4 border-b-2 transition-colors ${
                    activeTab === 'quotes' ? 'border-luxury-black text-luxury-black' : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  My Quotes
                </button>
              </div>
              <a 
                href="/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="luxury-button py-2 px-4 text-xs flex items-center gap-2"
              >
                New Quote
              </a>
            </div>
            
            {activeTab === 'jobs' ? (
              jobs.length === 0 ? (
                <div className="bg-white p-8 rounded-xl border border-gray-200 text-center text-gray-500">
                  No open jobs available at the moment.
                </div>
              ) : (
                jobs.map(job => {
                  const hasBid = myBids.some(b => b.jobId === job.id);
                  const config = job.configuration || {};
                  
                  return (
                    <div key={job.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-luxury-black">
                            {config.width}' x {config.depth}' Pergola in {job.city || 'Unknown'}
                          </h3>
                          <p className="text-sm text-gray-500">
                            Posted: {job.createdAt ? new Date(job.createdAt.toDate()).toLocaleDateString() : 'Recently'}
                          </p>
                        </div>
                        {hasBid ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                            <CheckCircle className="w-3 h-3" /> Bid Submitted
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                            Open for Bids
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-sm">
                        <div>
                          <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Height</span>
                          <span className="font-medium">{config.height}'</span>
                        </div>
                        <div>
                          <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Frame Color</span>
                          <span className="font-medium">{config.frameColor}</span>
                        </div>
                        <div>
                          <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Louver Color</span>
                          <span className="font-medium">{config.louverColor}</span>
                        </div>
                        <div>
                          <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Accessories</span>
                          <span className="font-medium">{config.accessories?.length || 0} items</span>
                        </div>
                      </div>

                      {!hasBid && biddingJobId !== job.id && (
                        <button 
                          onClick={() => setBiddingJobId(job.id)}
                          className="luxury-button-outline w-full py-2 text-sm"
                        >
                          Submit a Bid
                        </button>
                      )}

                      {biddingJobId === job.id && (
                        <form onSubmit={submitBid} className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <h4 className="font-bold text-sm mb-4">Submit Your Bid</h4>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Bid Amount ($)</label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <DollarSign className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                  type="number"
                                  required
                                  min="0"
                                  step="0.01"
                                  value={bidAmount}
                                  onChange={(e) => setBidAmount(e.target.value)}
                                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-luxury-black focus:border-luxury-black sm:text-sm"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Message to Homeowner</label>
                              <textarea
                                required
                                rows={3}
                                value={bidMessage}
                                onChange={(e) => setBidMessage(e.target.value)}
                                className="block w-full p-3 border border-gray-300 rounded-md focus:ring-luxury-black focus:border-luxury-black sm:text-sm"
                                placeholder="Describe your timeline, inclusions, etc."
                              />
                            </div>
                            <div className="flex gap-3">
                              <button 
                                type="button"
                                onClick={() => setBiddingJobId(null)}
                                className="flex-1 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                              <button 
                                type="submit"
                                disabled={submittingBid}
                                className="flex-1 luxury-button py-2 text-sm flex items-center justify-center gap-2"
                              >
                                {submittingBid ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Bid'}
                              </button>
                            </div>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })
            ) ) : (
              myQuotes.length === 0 ? (
                <div className="bg-white p-8 rounded-xl border border-gray-200 text-center text-gray-500">
                  You haven't created any quotes yet.
                </div>
              ) : (
                myQuotes.map(quote => {
                  const config = quote.configuration || {};
                  
                  return (
                    <div key={quote.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-luxury-black">
                              {quote.customerName || 'Client'} - {config.width}' x {config.depth}' Pergola
                            </h3>
                            <p className="text-sm text-gray-500">
                              Created: {quote.createdAt ? new Date(quote.createdAt.toDate()).toLocaleDateString() : 'Recently'}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
                            <CheckCircle className="w-3 h-3" /> Saved Quote
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-sm">
                          <div>
                            <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Height</span>
                            <span className="font-medium">{config.height}'</span>
                          </div>
                          <div>
                            <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Frame Color</span>
                            <span className="font-medium">{config.frameColor}</span>
                          </div>
                          <div>
                            <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Louver Color</span>
                            <span className="font-medium">{config.louverColor}</span>
                          </div>
                          <div>
                            <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Price</span>
                            <span className="font-medium">{config.totalPrice}</span>
                          </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg text-sm">
                          <h4 className="font-bold mb-2">Customer Details</h4>
                          <p><strong>Name:</strong> {quote.customerName}</p>
                          <p><strong>Email:</strong> {quote.customerEmail}</p>
                          <p><strong>Phone:</strong> {quote.customerPhone}</p>
                          <p><strong>Location:</strong> {quote.city}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>

          {/* My Bids Sidebar */}
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-luxury-black uppercase tracking-widest">My Bids</h2>
            
            {myBids.length === 0 ? (
              <div className="bg-white p-6 rounded-xl border border-gray-200 text-center text-gray-500 text-sm">
                You haven't submitted any bids yet.
              </div>
            ) : (
              <div className="space-y-4">
                {myBids.map(bid => (
                  <div key={bid.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-luxury-black">${bid.amount.toLocaleString()}</span>
                      <span className="text-xs text-gray-500">
                        {bid.createdAt ? new Date(bid.createdAt.toDate()).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">{bid.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
