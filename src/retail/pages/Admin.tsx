import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { db, auth, googleProvider, signInWithPopup, onAuthStateChanged, User } from '../../shared/firebase';
import { collection, getDocs, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { LogOut, Download, Loader2, Mail, Calendar, MapPin, Phone, User as UserIcon, Plus, Building2, Send, Search, FileText, ArrowUpDown, X, Eye, EyeOff, CheckCheck } from 'lucide-react';
import { toast, Toaster } from 'sonner';

export default function Admin() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'submissions' | 'jobs' | 'contractors'>('submissions');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  // Submissions search + filter + sort
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'email' | 'consultation'>('all');
  const [duplicateFilter, setDuplicateFilter] = useState<'all' | 'duplicates' | 'unique'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'price-desc' | 'price-asc' | 'name'>('date-desc');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [signedFilter, setSignedFilter] = useState<'all' | 'signed' | 'pending'>('all');
  const [detailSub, setDetailSub] = useState<any | null>(null);

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

      const unsubContractors = onSnapshot(collection(db, 'contractors'), (snapshot) => {
        setContractors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      return () => {
        unsubSubmissions();
        unsubJobs();
        unsubBids();
        unsubContractors();
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

  // Apply search + filters + sort to submissions
  const filteredSubmissions = useMemo(() => {
    const parsePrice = (s: any): number => {
      if (typeof s === 'number') return s;
      if (!s) return 0;
      return parseFloat(String(s).replace(/[^0-9.-]+/g, '')) || 0;
    };
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const q = searchQuery.trim().toLowerCase();

    let list = submissions.filter(sub => {
      // Search
      if (q) {
        const hay = [sub.name, sub.email, sub.phone, sub.city, sub.address]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Type filter
      if (typeFilter !== 'all' && sub.type !== typeFilter) return false;
      // Duplicate filter
      if (duplicateFilter === 'duplicates' && !sub.isDuplicate) return false;
      if (duplicateFilter === 'unique' && sub.isDuplicate) return false;
      // Read filter
      if (readFilter === 'unread' && sub.viewedAt) return false;
      if (readFilter === 'read' && !sub.viewedAt) return false;
      // Signed filter
      if (signedFilter === 'signed' && !sub.acceptance?.signedAt) return false;
      if (signedFilter === 'pending' && sub.acceptance?.signedAt) return false;
      // Date filter
      if (dateFilter !== 'all' && sub.createdAt?.toDate) {
        const created = sub.createdAt.toDate().getTime();
        const cutoff = dateFilter === '7d' ? 7 : dateFilter === '30d' ? 30 : 90;
        if (nowMs - created > cutoff * dayMs) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const aDate = a.createdAt?.toDate?.()?.getTime() || 0;
      const bDate = b.createdAt?.toDate?.()?.getTime() || 0;
      const aPrice = parsePrice(a.configuration?.totalPrice);
      const bPrice = parsePrice(b.configuration?.totalPrice);
      switch (sortBy) {
        case 'date-asc':  return aDate - bDate;
        case 'price-desc': return bPrice - aPrice;
        case 'price-asc':  return aPrice - bPrice;
        case 'name':       return (a.name || '').localeCompare(b.name || '');
        case 'date-desc':
        default:           return bDate - aDate;
      }
    });
    return list;
  }, [submissions, searchQuery, typeFilter, duplicateFilter, dateFilter, sortBy, readFilter, signedFilter]);

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setDuplicateFilter('all');
    setDateFilter('all');
    setSortBy('date-desc');
    setReadFilter('all');
    setSignedFilter('all');
  };
  const hasActiveFilters = searchQuery || typeFilter !== 'all' || duplicateFilter !== 'all' || dateFilter !== 'all' || sortBy !== 'date-desc' || readFilter !== 'all' || signedFilter !== 'all';

  const unreadCount = useMemo(() => submissions.filter(s => !s.viewedAt).length, [submissions]);

  const markAsViewed = async (submissionId: string) => {
    try {
      await setDoc(doc(db, 'submissions', submissionId), { viewedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error('Failed to mark as viewed', e);
    }
  };

  const markAsUnread = async (submissionId: string) => {
    try {
      await setDoc(doc(db, 'submissions', submissionId), { viewedAt: null }, { merge: true });
    } catch (e) {
      console.error('Failed to mark as unread', e);
    }
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0) return;
    if (!confirm(`Mark all ${unreadCount} unread submissions as read?`)) return;
    try {
      const batch = writeBatch(db);
      submissions.filter(s => !s.viewedAt).forEach(s => {
        batch.set(doc(db, 'submissions', s.id), { viewedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
      toast.success('All submissions marked as read');
    } catch (e) {
      console.error('Failed to mark all as read', e);
      toast.error('Failed to mark all as read');
    }
  };

  const downloadCSV = () => {
    const dataset = filteredSubmissions.length > 0 ? filteredSubmissions : submissions;
    if (dataset.length === 0) return;

    const headers = [
      'Date', 'Type', 'Duplicate', 'Name', 'Email', 'Phone', 'Address', 'City',
      'Width', 'Depth', 'Height', 'Frame Color', 'Louver Color', 'Total Price', 'Accessories', 'PDF URL'
    ];

    const rows = dataset.map(sub => {
      const date = sub.createdAt ? new Date(sub.createdAt.toDate()).toLocaleDateString() : 'N/A';
      const config = sub.configuration || {};
      const accessories = config.accessories ? config.accessories.join('; ') : '';
      
      return [
        date,
        sub.type || 'N/A',
        sub.isDuplicate ? 'Yes' : 'No',
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
        accessories,
        sub.pdfUrl || ''
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
            {unreadCount > 0 && activeTab !== 'submissions' && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-luxury-gold text-white text-[10px] font-bold">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`pb-3 px-2 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'jobs' ? 'border-luxury-black text-luxury-black' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Contractor Jobs ({jobs.length})
          </button>
          <button
            onClick={() => setActiveTab('contractors')}
            className={`pb-3 px-2 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'contractors' ? 'border-luxury-black text-luxury-black' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Contractors ({contractors.length})
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
        ) : activeTab === 'contractors' ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">Contractor Management</h2>
              <button
                onClick={() => setShowInviteForm(!showInviteForm)}
                className="flex items-center gap-2 bg-black text-white py-2 px-4 rounded-lg font-medium hover:bg-gray-800 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Invite Contractor
              </button>
            </div>

            {showInviteForm && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 mb-4">New Contractor Invite</h3>
                <form
                  onSubmit={async (e: FormEvent) => {
                    e.preventDefault();
                    setInviteLoading(true);
                    const form = e.target as HTMLFormElement;
                    const formData = new FormData(form);
                    const adminSecret = localStorage.getItem('adminSecret') || prompt('Enter admin secret (EXPORT_SECRET):');
                    if (!adminSecret) {
                      toast.error('Admin secret is required');
                      setInviteLoading(false);
                      return;
                    }
                    localStorage.setItem('adminSecret', adminSecret);

                    try {
                      const res = await fetch('/api/pro/invite-contractor', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          companyName: formData.get('companyName'),
                          contactName: formData.get('contactName'),
                          email: formData.get('email'),
                          phone: formData.get('phone'),
                          discountPercentage: formData.get('discountPercentage'),
                          adminSecret,
                        }),
                      });
                      const result = await res.json();
                      if (result.success) {
                        toast.success(`Invite sent to ${formData.get('email')}`);
                        form.reset();
                        setShowInviteForm(false);
                      } else {
                        toast.error(result.error || 'Failed to send invite');
                        if (res.status === 401) localStorage.removeItem('adminSecret');
                      }
                    } catch {
                      toast.error('Failed to connect to server');
                    } finally {
                      setInviteLoading(false);
                    }
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                    <input name="companyName" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
                    <input name="contactName" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input name="email" type="email" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input name="phone" type="tel" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Discount %</label>
                    <input name="discountPercentage" type="number" min="0" max="100" defaultValue="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black transition-colors" />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={inviteLoading}
                      className="flex items-center gap-2 bg-black text-white py-2 px-6 rounded-lg font-medium hover:bg-gray-800 transition-colors text-sm disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      {inviteLoading ? 'Sending...' : 'Send Invite'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-sm text-gray-500">
                      <th className="p-4 font-medium">Company</th>
                      <th className="p-4 font-medium">Contact</th>
                      <th className="p-4 font-medium">Email</th>
                      <th className="p-4 font-medium">Status</th>
                      <th className="p-4 font-medium">Discount</th>
                      <th className="p-4 font-medium">Last Login</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-gray-100">
                    {contractors.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500">
                          No contractors found. Invite your first contractor above.
                        </td>
                      </tr>
                    ) : (
                      contractors.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-4 align-top">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-gray-400" />
                              <span className="font-medium text-gray-900">{c.companyName}</span>
                            </div>
                          </td>
                          <td className="p-4 align-top text-gray-600">{c.contactName}</td>
                          <td className="p-4 align-top text-gray-600">
                            <a href={`mailto:${c.email}`} className="hover:text-black">{c.email}</a>
                          </td>
                          <td className="p-4 align-top">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                              c.status === 'active' ? 'bg-green-100 text-green-800' :
                              c.status === 'invited' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="p-4 align-top text-gray-600">{c.discountPercentage || 0}%</td>
                          <td className="p-4 align-top text-gray-500 text-xs">
                            {c.lastLogin ? new Date(c.lastLogin.toDate()).toLocaleDateString() : 'Never'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'submissions' ? (
          <>
            {/* Search + Filters + Sort */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, phone, city, or address…"
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-luxury-gold focus:border-transparent"
                  />
                </div>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-luxury-gold">
                  <option value="all">All Types</option>
                  <option value="email">Email Quote</option>
                  <option value="consultation">Consultation</option>
                </select>
                <select value={duplicateFilter} onChange={e => setDuplicateFilter(e.target.value as any)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-luxury-gold">
                  <option value="all">All Submissions</option>
                  <option value="unique">Unique Only</option>
                  <option value="duplicates">Duplicates Only</option>
                </select>
                <select value={readFilter} onChange={e => setReadFilter(e.target.value as any)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-luxury-gold">
                  <option value="all">All (Read & Unread)</option>
                  <option value="unread">Unread Only</option>
                  <option value="read">Read Only</option>
                </select>
                <select value={signedFilter} onChange={e => setSignedFilter(e.target.value as any)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-luxury-gold">
                  <option value="all">All Statuses</option>
                  <option value="signed">✓ Signed</option>
                  <option value="pending">Awaiting Signature</option>
                </select>
                <select value={dateFilter} onChange={e => setDateFilter(e.target.value as any)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-luxury-gold">
                  <option value="all">Any Time</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                </select>
                <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-luxury-gold">
                  <option value="date-desc">Newest First</option>
                  <option value="date-asc">Oldest First</option>
                  <option value="price-desc">Price: High → Low</option>
                  <option value="price-asc">Price: Low → High</option>
                  <option value="name">Name A–Z</option>
                </select>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-gray-500">
                  Showing <span className="font-semibold text-gray-800">{filteredSubmissions.length}</span> of {submissions.length} submissions
                  {unreadCount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-luxury-gold/10 text-luxury-gold text-[10px] font-bold uppercase tracking-wider">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-luxury-gold font-medium"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>
            </div>
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
                    <th className="p-4 font-medium">PDF</th>
                    <th className="p-4 font-medium">Email Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  {filteredSubmissions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-gray-500">
                        {submissions.length === 0 ? 'No submissions found.' : 'No submissions match your filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredSubmissions.map((sub) => {
                      const config = sub.configuration || {};
                      const isUnread = !sub.viewedAt;
                      return (
                        <tr
                          key={sub.id}
                          onClick={() => {
                            setDetailSub(sub);
                            if (isUnread) markAsViewed(sub.id);
                          }}
                          className={`cursor-pointer transition-colors ${isUnread ? 'bg-luxury-gold/[0.04] hover:bg-luxury-gold/10 border-l-4 border-luxury-gold' : 'hover:bg-gray-50/50 border-l-4 border-transparent'}`}
                        >
                          <td className="p-4 align-top whitespace-nowrap">
                            <div className="flex items-center gap-2 text-gray-600">
                              {isUnread && <span className="w-2 h-2 rounded-full bg-luxury-gold" title="Unread" />}
                              <Calendar className="w-4 h-4" />
                              <span className={isUnread ? 'font-semibold text-gray-900' : ''}>
                                {sub.createdAt ? new Date(sub.createdAt.toDate()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize w-fit
                                ${sub.type === 'consultation' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                {sub.type}
                              </span>
                              {sub.acceptance?.signedAt && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 w-fit">
                                  ✓ Signed
                                </span>
                              )}
                              {sub.isDuplicate && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 w-fit">
                                  ⚠ Duplicate
                                </span>
                              )}
                            </div>
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
                            {sub.pdfUrl ? (
                              <a
                                href={sub.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={sub.pdfFilename || undefined}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-luxury-gold/10 text-luxury-gold hover:bg-luxury-gold hover:text-white font-medium text-xs transition-colors border border-luxury-gold/20"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                View PDF
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Not available</span>
                            )}
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
                                    e.stopPropagation();
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
          </>
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

      {/* Submission Detail Modal */}
      {detailSub && (() => {
        const d = detailSub;
        const cfg = d.configuration || {};
        const pb = d.pricingBreakdown || {};
        const fmt = (n: number) => typeof n === 'number' ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDetailSub(null)}>
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[92vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="text-xl font-bold text-gray-900">{d.name}</h2>
                    {d.acceptance?.signedAt && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">✓ Signed</span>
                    )}
                    {d.isDuplicate && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">⚠ Duplicate</span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${d.type === 'consultation' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{d.type}</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Submitted {d.createdAt ? new Date(d.createdAt.toDate()).toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/proposal/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-luxury-black bg-luxury-gold/10 hover:bg-luxury-gold hover:text-white rounded-lg border border-luxury-gold/20"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Open Customer View
                  </a>
                  <button
                    onClick={() => { markAsUnread(d.id); setDetailSub(null); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    Mark unread
                  </button>
                  <button
                    onClick={() => setDetailSub(null)}
                    className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left column: details + pricing */}
                <div className="space-y-5">
                  {/* Contact */}
                  <section>
                    <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Contact</h3>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /><a href={`mailto:${d.email}`} className="text-gray-900 hover:underline">{d.email}</a></div>
                      {d.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /><a href={`tel:${d.phone}`} className="text-gray-900 hover:underline">{d.phone}</a></div>}
                      {(d.address || d.city) && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-gray-400 mt-0.5" /><span className="text-gray-900">{[d.address, d.city].filter(Boolean).join(', ')}</span></div>}
                    </div>
                  </section>

                  {/* Configuration */}
                  <section>
                    <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Configuration</h3>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                      <div><span className="text-gray-500">Size:</span> <span className="font-medium">{cfg.width}' × {cfg.depth}' × {cfg.height}'</span></div>
                      <div><span className="text-gray-500">Frame:</span> <span className="font-medium">{cfg.frameColor}</span></div>
                      <div><span className="text-gray-500">Louvers:</span> <span className="font-medium">{cfg.louverColor}</span></div>
                    </div>
                  </section>

                  {/* Pricing Breakdown */}
                  <section>
                    <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Pricing Breakdown</h3>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                          <tr>
                            <td className="px-3 py-2 text-gray-700">Bespoke Pergola</td>
                            <td className="px-3 py-2 text-right font-medium">{fmt(pb.basePrice)}</td>
                          </tr>
                          {(pb.itemizedAccessories || []).map((a: any, i: number) => (
                            <tr key={i}>
                              <td className="px-3 py-2 text-gray-700 pl-6">{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</td>
                              <td className="px-3 py-2 text-right font-medium">{fmt(a.cost)}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50">
                            <td className="px-3 py-2 font-medium">Subtotal</td>
                            <td className="px-3 py-2 text-right font-semibold">{fmt(pb.subtotal)}</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 text-gray-500">HST (13%)</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmt(pb.hst)}</td>
                          </tr>
                          <tr className="bg-luxury-gold/5 border-t-2 border-luxury-gold/30">
                            <td className="px-3 py-3 font-bold text-luxury-black">Total</td>
                            <td className="px-3 py-3 text-right font-bold text-luxury-gold text-lg">{fmt(pb.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {!pb.basePrice && (
                      <p className="text-xs text-gray-400 italic mt-2">Detailed breakdown unavailable for submissions created before this feature was added.</p>
                    )}
                  </section>

                  {/* Acceptance / Signature */}
                  {d.acceptance?.signedAt && (
                    <section>
                      <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Acceptance &amp; Signature</h3>
                      <div className="border-2 border-emerald-200 bg-emerald-50/40 rounded-lg p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
                            <CheckCheck className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-emerald-800">Accepted by {d.acceptance.signedName}</p>
                            <p className="text-[11px] text-gray-600">
                              {d.acceptance.signedAt?.toDate ? d.acceptance.signedAt.toDate().toLocaleString() : 'Unknown date'}
                            </p>
                          </div>
                        </div>
                        {d.acceptance.signatureDataUrl ? (
                          <div className="bg-white border border-emerald-200 rounded p-3 mb-2">
                            <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-1">Drawn Signature</p>
                            <img src={d.acceptance.signatureDataUrl} alt="Signature" className="h-16" />
                          </div>
                        ) : (
                          <div className="bg-white border border-emerald-200 rounded p-3 mb-2">
                            <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-1">Typed Signature</p>
                            <p className="text-xl italic text-luxury-black" style={{ fontFamily: "'Outfit', 'Brush Script MT', cursive" }}>
                              {d.acceptance.signedName}
                            </p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-600 mt-2">
                          <div>
                            <span className="font-semibold text-gray-400 block">IP Address</span>
                            {d.acceptance.signerIp || 'unknown'}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-400 block">Device</span>
                            <span className="break-all">{d.acceptance.signerUserAgent?.slice(0, 60) || 'unknown'}{(d.acceptance.signerUserAgent?.length || 0) > 60 ? '…' : ''}</span>
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                  {d.summary && (
                    <section>
                      <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Full Summary</h3>
                      <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap font-sans text-gray-700">{d.summary}</pre>
                    </section>
                  )}
                </div>

                {/* Right column: PDF */}
                <div>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Proposal Document</h3>
                  {d.pdfUrl ? (
                    <div className="space-y-2">
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-100" style={{ height: '65vh' }}>
                        <iframe src={d.pdfUrl} className="w-full h-full" title={`Proposal ${d.name}`} />
                      </div>
                      <a
                        href={d.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={d.pdfFilename || undefined}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-luxury-gold text-white hover:bg-luxury-gold/90 font-medium text-sm"
                      >
                        <Download className="w-4 h-4" />
                        Download PDF
                      </a>
                    </div>
                  ) : (
                    <div className="h-64 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-sm italic">
                      PDF not available for this submission
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
