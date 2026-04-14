import { useState, useEffect } from 'react';
import { db, auth, googleProvider, signInWithPopup, onAuthStateChanged, User } from '../shared/firebase';
import { collection, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import { LogOut, Download, Loader2, Mail, Calendar, MapPin, Phone, User as UserIcon } from 'lucide-react';
import { toast, Toaster } from 'sonner';

export default function Admin() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'submissions' | 'jobs'>('submissions');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const fetchData = () => {
    setFetching(true);
    setError(null);
    try {
      const qSubmissions = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
      const unsubSubmissions = onSnapshot(qSubmissions, (snapshot) => {
        setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      const qJobs = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
      const unsubJobs = onSnapshot(qJobs, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' && !fetching) {
            toast.info(`New job request from ${change.doc.data().name}`);
          }
        });
        setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      const qBids = query(collection(db, 'bids'), orderBy('createdAt', 'desc'));
      const unsubBids = onSnapshot(qBids, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' && !fetching) {
            toast.success(`New bid submitted by ${change.doc.data().contractorName}`);
          }
        });
        setBids(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setFetching(false);
      });

      return () => {
        unsubSubmissions();
        unsubJobs();
        unsubBids();
      };
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch data. Make sure you have admin privileges. ' + err.message);
      setFetching(false);
    }
  };

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    if (user) {
      cleanup = fetchData();
    }
    return () => {
      if (cleanup) cleanup();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Failed to log in. ' + err.message);
    }
  };

  const handleLogout = () => {
    auth.signOut();
  };

  const downloadCSV = () => {
    if (submissions.length === 0) return;

    const headers = [
      'Date', 'Type', 'Name', 'Email', 'Phone', 'Address', 'City',
      'Width', 'Depth', 'Height', 'Frame Color', 'Louver Color', 'Total Price', 'Accessories'
    ];

    const rows = submissions.map(sub => {
      const date = sub.createdAt ? new Date(sub.createdAt.toDate()).toLocaleDateString() : 'N/A';
      const config = sub.configuration || {};
      const accessories = config.accessories ? config.accessories.join('; ') : '';
      
      return [
        date,
        sub.type || 'N/A',
        sub.name || 'N/A',
        sub.email || 'N/A',
        sub.phone || 'N/A',
        sub.address || 'N/A',
        sub.city || 'N/A',
        config.width || 'N/A',
        config.depth || 'N/A',
        config.height || 'N/A',
        config.frameColor || 'N/A',
        config.louverColor || 'N/A',
        config.totalPrice || 'N/A',
        accessories
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `submissions_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-xl shadow-sm max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-6">Admin Login</h1>
          <p className="text-gray-600 mb-8">Please sign in with your admin account to view submissions.</p>
          <button
            onClick={handleLogin}
            className="w-full bg-black text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            Sign in with Google
          </button>
          {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <Toaster position="top-center" />
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-gray-600 mt-1">Logged in as {user.email}</p>
          </div>
          <div className="flex gap-4">
            {activeTab === 'submissions' && (
              <button
                onClick={downloadCSV}
                disabled={submissions.length === 0}
                className="flex items-center gap-2 bg-white border border-gray-200 text-gray-800 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-gray-100 text-gray-800 py-2 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('submissions')}
            className={`pb-3 px-2 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'submissions' ? 'border-luxury-black text-luxury-black' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Submissions ({submissions.length})
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`pb-3 px-2 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'jobs' ? 'border-luxury-black text-luxury-black' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Contractor Jobs ({jobs.length})
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8 border border-red-100">
            {error}
          </div>
        )}

        {fetching ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : activeTab === 'submissions' ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-sm text-gray-500">
                    <th className="p-4 font-medium">Date</th>
                    <th className="p-4 font-medium">Type</th>
                    <th className="p-4 font-medium">Customer</th>
                    <th className="p-4 font-medium">Contact</th>
                    <th className="p-4 font-medium">Location</th>
                    <th className="p-4 font-medium">Configuration</th>
                    <th className="p-4 font-medium">Total Price</th>
                    <th className="p-4 font-medium">Email Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        No submissions found.
                      </td>
                    </tr>
                  ) : (
                    submissions.map((sub) => {
                      const config = sub.configuration || {};
                      return (
                        <tr key={sub.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-4 align-top whitespace-nowrap">
                            <div className="flex items-center gap-2 text-gray-600">
                              <Calendar className="w-4 h-4" />
                              {sub.createdAt ? new Date(sub.createdAt.toDate()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                              ${sub.type === 'consultation' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                              {sub.type}
                            </span>
                          </td>
                          <td className="p-4 align-top">
                            <div className="font-medium text-gray-900">{sub.name}</div>
                          </td>
                          <td className="p-4 align-top">
                            <div className="flex flex-col gap-1 text-gray-600">
                              <div className="flex items-center gap-2">
                                <Mail className="w-3.5 h-3.5" />
                                <a href={`mailto:${sub.email}`} className="hover:text-black">{sub.email}</a>
                              </div>
                              {sub.phone && (
                                <div className="flex items-center gap-2">
                                  <Phone className="w-3.5 h-3.5" />
                                  <a href={`tel:${sub.phone}`} className="hover:text-black">{sub.phone}</a>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-4 align-top text-gray-600">
                            {sub.city && sub.address ? (
                              <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <div>
                                  <div>{sub.address}</div>
                                  <div>{sub.city}</div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400">Not provided</span>
                            )}
                          </td>
                          <td className="p-4 align-top">
                            <div className="text-xs space-y-1 text-gray-600">
                              <div><span className="font-medium text-gray-900">Size:</span> {config.width}' × {config.depth}' × {config.height}'</div>
                              <div><span className="font-medium text-gray-900">Frame:</span> {config.frameColor}</div>
                              <div><span className="font-medium text-gray-900">Louvers:</span> {config.louverColor}</div>
                              {config.accessories && config.accessories.length > 0 && (
                                <div className="mt-2">
                                  <span className="font-medium text-gray-900">Accessories:</span>
                                  <ul className="list-disc list-inside mt-1">
                                    {config.accessories.map((acc: string, i: number) => (
                                      <li key={i}>{acc}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-4 align-top font-medium text-gray-900">
                            {config.totalPrice || 'N/A'}
                          </td>
                          <td className="p-4 align-top">
                            <div className="flex flex-col gap-2">
                              {sub.emailStatus === 'sent' ? (
                                <div className="flex items-center gap-1.5 text-green-600 font-medium">
                                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                  Sent
                                </div>
                              ) : (
                                <div className="text-gray-400 italic">Not sent</div>
                              )}
                              
                              {(sub.adminEmailId || sub.customerEmailId) && (
                                <button 
                                  onClick={async (e) => {
                                    const btn = e.currentTarget;
                                    const originalText = btn.innerText;
                                    btn.disabled = true;
                                    btn.innerText = 'Checking...';
                                    
                                    try {
                                      const emailId = sub.customerEmailId || sub.adminEmailId;
                                      const res = await fetch(`/api/email-status/${emailId}`);
                                      const result = await res.json();
                                      
                                      if (result.success && result.data) {
                                        const status = result.data.last_event;
                                        // Resend API returns 'delivered', 'opened', etc.
                                        alert(`Email Status: ${status}\nOpened: ${result.data.opened ? 'Yes' : 'No'}`);
                                      } else {
                                        alert(`Error: ${result.error || 'Failed to fetch status'}`);
                                      }
                                    } catch (err) {
                                      alert('Failed to connect to server');
                                    } finally {
                                      btn.disabled = false;
                                      btn.innerText = originalText;
                                    }
                                  }}
                                  className="text-[10px] text-luxury-gold hover:underline text-left"
                                >
                                  Check Delivery Status
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {jobs.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border border-gray-200 text-center text-gray-500">
                No contractor jobs found.
              </div>
            ) : (
              jobs.map(job => {
                const jobBids = bids.filter(b => b.jobId === job.id);
                const config = job.configuration || {};
                const submission = submissions.find(s => s.id === job.submissionId);
                const customerName = submission ? submission.name : 'Unknown Customer';
                
                return (
                  <div key={job.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">
                            Job: {config.width}' x {config.depth}' Pergola
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Posted: {job.createdAt ? new Date(job.createdAt.toDate()).toLocaleDateString() : 'N/A'}
                            <span className="mx-2">•</span>
                            Status: <span className={`font-medium capitalize ${job.status === 'open' ? 'text-green-600' : 'text-gray-600'}`}>{job.status}</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">{customerName}</div>
                          <div className="text-sm text-gray-500">{job.city || 'Unknown City'}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-6">
                      <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Contractor Bids ({jobBids.length})</h4>
                      
                      {jobBids.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No bids submitted yet.</p>
                      ) : (
                        <div className="space-y-4">
                          {jobBids.map(bid => (
                            <div key={bid.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-gray-200 bg-white">
                              <div>
                                <div className="font-medium text-gray-900">{bid.contractorName}</div>
                                <div className="text-sm text-gray-500 mt-1">{bid.message}</div>
                              </div>
                              <div className="mt-4 sm:mt-0 sm:text-right">
                                <div className="text-lg font-bold text-luxury-black">${bid.amount.toLocaleString()}</div>
                                <div className="text-xs text-gray-400 mt-1">
                                  {bid.createdAt ? new Date(bid.createdAt.toDate()).toLocaleDateString() : ''}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
