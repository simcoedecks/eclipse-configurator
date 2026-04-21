import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { db, auth, googleProvider, signInWithPopup, onAuthStateChanged, User } from '../../shared/firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp, writeBatch, deleteDoc } from 'firebase/firestore';
import {
  LogOut, Download, Loader2, Mail, Calendar, MapPin, Phone, Plus, Building2, Send,
  Search, FileText, ArrowUpDown, ArrowUp, ArrowDown, X, Eye, EyeOff, CheckCheck,
  Map as MapIcon, Trash2, CheckSquare, Square, LayoutGrid, List, Home, Kanban, Users, MessageSquare, Command,
  Bookmark, Save, Copy,
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

import LeadMap from '../components/LeadMap';
import DashboardHome from '../components/admin/DashboardHome';
import { useTheme } from '../../shared/hooks/useTheme';
import { Moon, Sun } from 'lucide-react';
import KanbanBoard from '../components/admin/KanbanBoard';
import ActivityTimeline from '../components/admin/ActivityTimeline';
import NotesPanel from '../components/admin/NotesPanel';
import TasksPanel from '../components/admin/TasksPanel';
import PipelineStageSelector from '../components/admin/PipelineStageSelector';
import TagManager from '../components/admin/TagManager';
import ComposeModal from '../components/admin/ComposeModal';
import FilesPanel from '../components/admin/FilesPanel';
import CommandPalette from '../components/admin/CommandPalette';
import AssignedToSelector, { Avatar } from '../components/admin/AssignedToSelector';
import SourceSelector from '../components/admin/SourceSelector';
import ContractorInviteForm from '../components/admin/ContractorInviteForm';
import { PIPELINE_STAGES, stageById, defaultStageFor, LEAD_SOURCES, TEAM_MEMBERS, teamMemberByEmail } from '../../shared/lib/crm';
import { logActivity } from '../lib/crmHelpers';

type TabKey = 'dashboard' | 'submissions' | 'kanban' | 'map' | 'jobs' | 'contractors';

export default function Admin() {
  const { toggleTheme, isDark } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Submissions search + filter + sort
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'email' | 'consultation'>('all');
  const [duplicateFilter, setDuplicateFilter] = useState<'all' | 'duplicates' | 'unique'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'price-desc' | 'price-asc' | 'name'>('date-desc');
  const [columnSort, setColumnSort] = useState<{ key: 'date' | 'type' | 'name' | 'email' | 'city' | 'price' | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'desc' });
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [signedFilter, setSignedFilter] = useState<'all' | 'signed' | 'pending'>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [detailSub, setDetailSub] = useState<any | null>(null);
  const [composeMode, setComposeMode] = useState<'email' | 'sms' | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Saved views
  const [savedViews, setSavedViews] = useState<Array<{ id: string; name: string; state: any }>>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('eclipse-admin-saved-views');
      if (raw) setSavedViews(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('eclipse-admin-saved-views', JSON.stringify(savedViews));
    } catch {}
  }, [savedViews]);

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data listeners
  useEffect(() => {
    if (!user) return;
    const cleanups: Array<() => void> = [];
    try {
      const qSub = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
      cleanups.push(onSnapshot(qSub, (snap) => setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })))));

      const qJobs = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
      cleanups.push(onSnapshot(qJobs, (snap) => {
        snap.docChanges().forEach(c => { if (c.type === 'added') toast.info(`New job request: ${c.doc.data().customerName || 'Unknown'}`); });
        setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }));

      const qBids = query(collection(db, 'bids'), orderBy('createdAt', 'desc'));
      cleanups.push(onSnapshot(qBids, (snap) => setBids(snap.docs.map(d => ({ id: d.id, ...d.data() })))));

      cleanups.push(onSnapshot(collection(db, 'contractors'), (snap) => setContractors(snap.docs.map(d => ({ id: d.id, ...d.data() })))));
    } catch (err: any) {
      console.error(err);
      setError('Failed to load data. Ensure you have admin privileges. ' + err?.message);
    }
    return () => cleanups.forEach(fn => fn());
  }, [user]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(true); }
      if (e.key === '?' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        toast.message('Keyboard shortcuts', {
          description: '⌘K: command palette · ⌘E: email · D: dashboard · L: list · K: kanban · M: map',
          duration: 5000,
        });
      }
      if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && !e.metaKey && !e.ctrlKey) {
        if (e.key === 'd') setActiveTab('dashboard');
        if (e.key === 'l') setActiveTab('submissions');
        if (e.key === 'k' && !detailSub) setActiveTab('kanban');
        if (e.key === 'm' && !detailSub) setActiveTab('map');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [detailSub]);

  // Helpers
  const parsePrice = (s: any): number => typeof s === 'number' ? s : parseFloat(String(s || '').replace(/[^0-9.-]+/g, '')) || 0;
  const formatCurrency = (n: number | undefined | null): string => typeof n === 'number' ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—';

  // Filtered + sorted submissions
  const filteredSubmissions = useMemo(() => {
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const q = searchQuery.trim().toLowerCase();

    let list = submissions.filter(sub => {
      if (q) {
        const hay = [sub.name, sub.email, sub.phone, sub.city, sub.address, ...(sub.tags || [])].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter !== 'all' && sub.type !== typeFilter) return false;
      if (duplicateFilter === 'duplicates' && !sub.isDuplicate) return false;
      if (duplicateFilter === 'unique' && sub.isDuplicate) return false;
      if (readFilter === 'unread' && sub.viewedAt) return false;
      if (readFilter === 'read' && !sub.viewedAt) return false;
      if (signedFilter === 'signed' && !sub.acceptance?.signedAt) return false;
      if (signedFilter === 'pending' && sub.acceptance?.signedAt) return false;
      if (stageFilter !== 'all' && (sub.pipelineStage || defaultStageFor(sub)) !== stageFilter) return false;
      if (tagFilter !== 'all' && !(sub.tags || []).includes(tagFilter)) return false;
      if (assignedFilter !== 'all') {
        if (assignedFilter === 'unassigned') { if (sub.assignedTo) return false; }
        else if (sub.assignedTo !== assignedFilter) return false;
      }
      if (sourceFilter !== 'all' && (sub.source || 'organic') !== sourceFilter) return false;
      if (dateFilter !== 'all' && sub.createdAt?.toDate) {
        const created = sub.createdAt.toDate().getTime();
        const cutoff = dateFilter === '7d' ? 7 : dateFilter === '30d' ? 30 : 90;
        if (nowMs - created > cutoff * dayMs) return false;
      }
      return true;
    });

    if (columnSort.key) {
      const dir = columnSort.dir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        switch (columnSort.key) {
          case 'date':  return dir * ((a.createdAt?.toDate?.()?.getTime() || 0) - (b.createdAt?.toDate?.()?.getTime() || 0));
          case 'price': return dir * (parsePrice(a.configuration?.totalPrice) - parsePrice(b.configuration?.totalPrice));
          case 'name':  return dir * (a.name || '').localeCompare(b.name || '');
          case 'type':  return dir * (a.type || '').localeCompare(b.type || '');
          case 'email': return dir * (a.email || '').localeCompare(b.email || '');
          case 'city':  return dir * (a.city || '').localeCompare(b.city || '');
          default:      return 0;
        }
      });
    } else {
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
          default:           return bDate - aDate;
        }
      });
    }
    return list;
  }, [submissions, searchQuery, typeFilter, duplicateFilter, dateFilter, sortBy, readFilter, signedFilter, stageFilter, tagFilter, assignedFilter, sourceFilter, columnSort]);

  const clearFilters = () => {
    setSearchQuery(''); setTypeFilter('all'); setDuplicateFilter('all'); setDateFilter('all');
    setSortBy('date-desc'); setReadFilter('all'); setSignedFilter('all'); setStageFilter('all'); setTagFilter('all');
    setAssignedFilter('all'); setSourceFilter('all');
  };
  const hasActiveFilters = searchQuery || typeFilter !== 'all' || duplicateFilter !== 'all' || dateFilter !== 'all' || sortBy !== 'date-desc' || readFilter !== 'all' || signedFilter !== 'all' || stageFilter !== 'all' || tagFilter !== 'all' || assignedFilter !== 'all' || sourceFilter !== 'all';

  const unreadCount = useMemo(() => submissions.filter(s => !s.viewedAt).length, [submissions]);
  const pendingCount = useMemo(() => submissions.filter(s => !s.acceptance?.signedAt).length, [submissions]);
  const acceptedCount = useMemo(() => submissions.filter(s => !!s.acceptance?.signedAt).length, [submissions]);
  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach(s => (s.tags || []).forEach((t: string) => set.add(t)));
    return Array.from(set).sort();
  }, [submissions]);

  // Actions
  const markAsViewed = async (id: string) => { try { await setDoc(doc(db, 'submissions', id), { viewedAt: serverTimestamp() }, { merge: true }); } catch (e) { console.error(e); } };
  const markAsUnread = async (id: string) => { try { await setDoc(doc(db, 'submissions', id), { viewedAt: null }, { merge: true }); } catch (e) { console.error(e); } };
  const markAllAsRead = async () => {
    if (unreadCount === 0) return;
    if (!confirm(`Mark all ${unreadCount} unread as read?`)) return;
    const batch = writeBatch(db);
    submissions.filter(s => !s.viewedAt).forEach(s => batch.set(doc(db, 'submissions', s.id), { viewedAt: serverTimestamp() }, { merge: true }));
    await batch.commit();
    toast.success('All marked read');
  };
  const openDetail = (sub: any) => {
    setDetailSub(sub);
    if (!sub.viewedAt) {
      markAsViewed(sub.id);
      logActivity(sub.id, 'viewed_by_admin', `Viewed by ${auth.currentUser?.email || 'admin'}`);
    }
  };

  // Column sort
  const toggleColumnSort = (key: 'date' | 'type' | 'name' | 'email' | 'city' | 'price') => {
    setColumnSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'desc' };
    });
  };
  const SortIcon = ({ col }: { col: 'date' | 'type' | 'name' | 'email' | 'city' | 'price' }) => {
    if (columnSort.key !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return columnSort.dir === 'asc' ? <ArrowUp className="w-3 h-3 text-luxury-gold" /> : <ArrowDown className="w-3 h-3 text-luxury-gold" />;
  };

  // Bulk selection
  const toggleSelected = (id: string) => { const n = new Set(selectedIds); n.has(id) ? n.delete(id) : n.add(id); setSelectedIds(n); };
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllVisible = (rows: any[]) => setSelectedIds(new Set(rows.map(r => r.id)));
  const allVisibleSelected = (rows: any[]) => rows.length > 0 && rows.every(r => selectedIds.has(r.id));
  const bulkMarkRead = async () => {
    if (selectedIds.size === 0) return;
    const batch = writeBatch(db);
    selectedIds.forEach(id => batch.set(doc(db, 'submissions', id), { viewedAt: serverTimestamp() }, { merge: true }));
    await batch.commit(); clearSelection();
    toast.success(`Marked ${selectedIds.size} as read`);
  };
  const bulkMarkUnread = async () => {
    if (selectedIds.size === 0) return;
    const batch = writeBatch(db);
    selectedIds.forEach(id => batch.set(doc(db, 'submissions', id), { viewedAt: null }, { merge: true }));
    await batch.commit(); clearSelection();
    toast.success(`Marked ${selectedIds.size} as unread`);
  };
  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`Permanently delete ${count} submission${count === 1 ? '' : 's'}? This cannot be undone.`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteDoc(doc(db, 'submissions', id))));
      clearSelection();
      toast.success(`Deleted ${count}`);
    } catch (e) { console.error(e); toast.error('Some could not be deleted.'); }
  };
  const bulkMoveToStage = async (stageId: string) => {
    if (selectedIds.size === 0) return;
    const batch = writeBatch(db);
    selectedIds.forEach(id => batch.set(doc(db, 'submissions', id), { pipelineStage: stageId }, { merge: true }));
    await batch.commit(); clearSelection();
    toast.success(`Moved ${selectedIds.size} to ${stageById(stageId)?.label}`);
  };

  const downloadCSV = () => {
    const dataset = filteredSubmissions.length > 0 ? filteredSubmissions : submissions;
    if (dataset.length === 0) return;
    const headers = ['Date', 'Stage', 'Type', 'Signed', 'Duplicate', 'Name', 'Email', 'Phone', 'Address', 'City', 'Width', 'Depth', 'Height', 'Frame', 'Louver', 'Total', 'Tags', 'Source', 'PDF URL'];
    const rows = dataset.map(s => {
      const d = s.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A';
      const c = s.configuration || {};
      return [
        d, stageById(s.pipelineStage || defaultStageFor(s))?.label || '', s.type || '',
        s.acceptance?.signedAt ? 'Yes' : 'No', s.isDuplicate ? 'Yes' : 'No',
        s.name || '', s.email || '', s.phone || '', s.address || '', s.city || '',
        c.width || '', c.depth || '', c.height || '', c.frameColor || '', c.louverColor || '',
        c.totalPrice || '', (s.tags || []).join('; '), s.source || '', s.pdfUrl || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `submissions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Saved views
  const saveCurrentView = () => {
    const name = prompt('Save this filter view as:');
    if (!name?.trim()) return;
    const id = Date.now().toString(36);
    setSavedViews([...savedViews, {
      id, name: name.trim(),
      state: { searchQuery, typeFilter, duplicateFilter, dateFilter, sortBy, readFilter, signedFilter, stageFilter, tagFilter }
    }]);
    toast.success(`Saved view "${name}"`);
  };
  const applyView = (view: { state: any }) => {
    const s = view.state;
    setSearchQuery(s.searchQuery || ''); setTypeFilter(s.typeFilter || 'all');
    setDuplicateFilter(s.duplicateFilter || 'all'); setDateFilter(s.dateFilter || 'all');
    setSortBy(s.sortBy || 'date-desc'); setReadFilter(s.readFilter || 'all');
    setSignedFilter(s.signedFilter || 'all'); setStageFilter(s.stageFilter || 'all');
    setTagFilter(s.tagFilter || 'all');
  };
  const deleteView = (id: string) => setSavedViews(savedViews.filter(v => v.id !== id));

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-luxury-paper">
        <Loader2 className="w-8 h-8 animate-spin text-luxury-gold" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-luxury-paper via-luxury-cream to-luxury-paper p-6">
        <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full text-center border border-luxury-cream">
          <img src="/logo.png" alt="Eclipse Pergola" className="h-12 mx-auto mb-6" />
          <h1 className="text-2xl font-serif text-luxury-black mb-2">Admin Portal</h1>
          <p className="text-sm text-gray-500 mb-8">Sign in with your admin Google account to access the CRM.</p>
          <button
            onClick={async () => { try { await signInWithPopup(auth, googleProvider); } catch (e: any) { setError('Failed: ' + e.message); } }}
            className="w-full bg-luxury-black text-white py-3 px-4 rounded-lg font-medium hover:bg-luxury-black/90 transition-colors"
          >
            Sign in with Google
          </button>
          {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
        </div>
      </div>
    );
  }

  const navItems: Array<{ key: TabKey; label: string; icon: any; badge?: number | string; sub?: string }> = [
    { key: 'dashboard',   label: 'Dashboard',   icon: Home,     sub: 'Overview' },
    { key: 'submissions', label: 'Leads',       icon: List,     badge: unreadCount > 0 ? unreadCount : undefined, sub: `${submissions.length} total` },
    { key: 'kanban',      label: 'Pipeline',    icon: Kanban,   sub: `${pendingCount} active` },
    { key: 'map',         label: 'Map',         icon: MapIcon,  sub: 'Geography' },
    { key: 'jobs',        label: 'Jobs',        icon: Building2, badge: jobs.length || undefined, sub: 'Contractor board' },
    { key: 'contractors', label: 'Team',        icon: Users,    sub: `${contractors.length} contractors` },
  ];

  return (
    <div className={`min-h-screen flex ${isDark ? 'dark bg-[#0a0a0a]' : 'bg-gradient-to-br from-luxury-paper via-white to-luxury-paper'}`}>
      <Toaster position="top-right" theme={isDark ? 'dark' : 'light'} />

      {/* ─── SIDEBAR ─── */}
      <aside className="w-64 bg-luxury-black text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Eclipse" className="h-9 object-contain brightness-0 invert" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-luxury-gold mt-3">CRM · Admin</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  active
                    ? 'bg-luxury-gold text-luxury-black shadow-lg'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{item.label}</span>
                    {item.badge != null && (
                      <span className={`text-[10px] font-bold px-1.5 py-0 rounded-full min-w-[18px] h-[16px] inline-flex items-center justify-center ${active ? 'bg-luxury-black text-luxury-gold' : 'bg-luxury-gold text-luxury-black'}`}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.sub && <p className={`text-[10px] ${active ? 'text-luxury-black/60' : 'text-white/40'}`}>{item.sub}</p>}
                </div>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3 space-y-1">
          <button
            onClick={() => setCmdOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/5 rounded-lg"
          >
            <Command className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Quick search</span>
            <kbd className="text-[9px] font-mono bg-white/10 px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/5 rounded-lg"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span className="flex-1 text-left">{isDark ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>

        <div className="border-t border-white/10 p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-luxury-gold flex items-center justify-center shrink-0">
            <span className="text-luxury-black font-bold text-xs">
              {(user.email || 'A').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{user.displayName || 'Admin'}</p>
            <p className="text-[10px] text-white/50 truncate">{user.email}</p>
          </div>
          <button onClick={() => auth.signOut()} className="text-white/40 hover:text-white" title="Sign out">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 overflow-x-hidden">
        {/* Page header */}
        <header className={`sticky top-0 z-30 backdrop-blur-md border-b ${isDark ? 'bg-[#0a0a0a]/80 border-white/10' : 'bg-white/80 border-slate-200'}`}>
          <div className="px-8 py-4 flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-serif ${isDark ? 'text-white' : 'text-luxury-black'}`}>
                {navItems.find(n => n.key === activeTab)?.label || 'Dashboard'}
              </h1>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                {activeTab === 'dashboard' && "Here's what's happening today."}
                {activeTab === 'submissions' && `Manage and filter all ${submissions.length} quote submissions.`}
                {activeTab === 'kanban' && 'Drag leads between stages.'}
                {activeTab === 'map' && 'Geographic distribution of all leads.'}
                {activeTab === 'jobs' && 'Contractor job board and bids.'}
                {activeTab === 'contractors' && 'Invite and manage contractors.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === 'submissions' && (
                <button onClick={downloadCSV} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50">
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              )}
              <button onClick={() => setCmdOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-black text-white rounded-lg text-xs font-semibold hover:bg-luxury-black/90">
                <Command className="w-3.5 h-3.5" />
                ⌘K
              </button>
            </div>
          </div>
        </header>

        {/* Page body */}
        <div className="px-8 py-6">
          {error && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm">{error}</div>
          )}

          {/* Dashboard */}
          {activeTab === 'dashboard' && (
            <DashboardHome
              submissions={submissions}
              onOpenSubmission={openDetail}
              onGoToSubmissions={() => setActiveTab('submissions')}
              onGoToKanban={() => setActiveTab('kanban')}
            />
          )}

          {/* Kanban */}
          {activeTab === 'kanban' && (
            <KanbanBoard submissions={submissions} onOpen={openDetail} />
          )}

          {/* Map */}
          {activeTab === 'map' && <LeadMap submissions={submissions} />}

          {/* Submissions */}
          {activeTab === 'submissions' && (
            <>
              {/* Status tabs */}
              <div className="flex gap-1 mb-4 border-b border-slate-200">
                {[
                  { key: 'all',     label: 'All Leads',        count: submissions.length, icon: '📋' },
                  { key: 'pending', label: 'Pending Signature', count: pendingCount,       icon: '⏳' },
                  { key: 'signed',  label: 'Accepted',          count: acceptedCount,      icon: '✅' },
                ].map(tab => {
                  const active = signedFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setSignedFilter(tab.key as any)}
                      className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                        active
                          ? (tab.key === 'signed' ? 'border-emerald-500 text-emerald-700 bg-emerald-50/60'
                            : tab.key === 'pending' ? 'border-luxury-gold text-luxury-black bg-luxury-gold/10'
                            : 'border-luxury-black text-luxury-black bg-slate-50')
                          : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                      } rounded-t-lg`}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                      <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold inline-flex items-center justify-center ${
                        active ? (tab.key === 'signed' ? 'bg-emerald-500 text-white' : tab.key === 'pending' ? 'bg-luxury-gold text-white' : 'bg-luxury-black text-white') : 'bg-slate-200 text-slate-700'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Filters + saved views */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name, email, phone, city, tag…"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-luxury-gold focus:border-transparent"
                    />
                  </div>
                  <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-luxury-gold">
                    <option value="all">All Stages</option>
                    {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-luxury-gold">
                    <option value="all">All Tags</option>
                    {uniqueTags.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-luxury-gold">
                    <option value="all">Anyone</option>
                    <option value="unassigned">Unassigned</option>
                    {TEAM_MEMBERS.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
                  </select>
                  <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-luxury-gold">
                    <option value="all">All Sources</option>
                    {LEAD_SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <select value={readFilter} onChange={e => setReadFilter(e.target.value as any)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-luxury-gold">
                    <option value="all">Read & Unread</option>
                    <option value="unread">Unread</option>
                    <option value="read">Read</option>
                  </select>
                  <select value={dateFilter} onChange={e => setDateFilter(e.target.value as any)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-luxury-gold">
                    <option value="all">Any Time</option>
                    <option value="7d">7 Days</option>
                    <option value="30d">30 Days</option>
                    <option value="90d">90 Days</option>
                  </select>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg border border-slate-200">
                      <X className="w-3.5 h-3.5" />Clear
                    </button>
                  )}
                </div>

                {/* Saved views */}
                <div className="flex items-center flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-luxury-gold">
                    <Bookmark className="w-3 h-3" />
                    Saved Views
                  </div>
                  {savedViews.length === 0 ? (
                    <span className="text-[11px] text-gray-400 italic">None yet</span>
                  ) : (
                    savedViews.map(v => (
                      <span key={v.id} className="inline-flex items-center gap-1 bg-luxury-black/5 hover:bg-luxury-black/10 rounded-full pl-3 pr-1 py-0.5 text-xs font-semibold text-luxury-black group">
                        <button onClick={() => applyView(v)}>{v.name}</button>
                        <button onClick={() => deleteView(v.id)} className="opacity-40 group-hover:opacity-100 hover:text-rose-600 p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                  {hasActiveFilters && (
                    <button onClick={saveCurrentView} className="inline-flex items-center gap-1 text-xs font-semibold text-luxury-gold hover:text-luxury-black">
                      <Save className="w-3 h-3" />
                      Save current
                    </button>
                  )}
                  <div className="flex-1" />
                  <div className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-800">{filteredSubmissions.length}</span> of {submissions.length}
                    {unreadCount > 0 && <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-luxury-gold/10 text-luxury-gold text-[10px] font-bold uppercase">{unreadCount} new</span>}
                  </div>
                  {unreadCount > 0 && (
                    <button onClick={markAllAsRead} className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-luxury-gold font-medium">
                      <CheckCheck className="w-3.5 h-3.5" />Mark all read
                    </button>
                  )}
                </div>
              </div>

              {/* Bulk toolbar */}
              {selectedIds.size > 0 && (
                <div className="bg-luxury-black text-white rounded-xl p-3 mb-3 flex items-center justify-between flex-wrap gap-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-luxury-gold/20 rounded-lg text-luxury-gold font-bold text-sm">
                      <CheckSquare className="w-4 h-4" />{selectedIds.size} selected
                    </span>
                    <button onClick={clearSelection} className="text-xs text-white/60 hover:text-white">Clear</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select onChange={(e) => { if (e.target.value) bulkMoveToStage(e.target.value); e.target.value = ''; }} className="bg-white/10 text-white text-xs font-semibold rounded-lg px-3 py-1.5 border border-white/20">
                      <option value="">Move to stage…</option>
                      {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <button onClick={bulkMarkRead} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold"><Eye className="w-3.5 h-3.5" />Read</button>
                    <button onClick={bulkMarkUnread} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold"><EyeOff className="w-3.5 h-3.5" />Unread</button>
                    <button onClick={bulkDelete} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-semibold"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs text-gray-500 uppercase tracking-wider">
                        <th className="p-3 w-10">
                          <button onClick={() => allVisibleSelected(filteredSubmissions) ? clearSelection() : selectAllVisible(filteredSubmissions)}>
                            {allVisibleSelected(filteredSubmissions) ? <CheckSquare className="w-4 h-4 text-luxury-gold" /> : <Square className="w-4 h-4" />}
                          </button>
                        </th>
                        <th className="p-3 font-semibold"><button onClick={() => toggleColumnSort('date')} className="inline-flex items-center gap-1 hover:text-luxury-black">Date <SortIcon col="date" /></button></th>
                        <th className="p-3 font-semibold">Stage</th>
                        <th className="p-3 font-semibold"><button onClick={() => toggleColumnSort('name')} className="inline-flex items-center gap-1 hover:text-luxury-black">Customer <SortIcon col="name" /></button></th>
                        <th className="p-3 font-semibold"><button onClick={() => toggleColumnSort('email')} className="inline-flex items-center gap-1 hover:text-luxury-black">Contact <SortIcon col="email" /></button></th>
                        <th className="p-3 font-semibold"><button onClick={() => toggleColumnSort('city')} className="inline-flex items-center gap-1 hover:text-luxury-black">Location <SortIcon col="city" /></button></th>
                        <th className="p-3 font-semibold"><button onClick={() => toggleColumnSort('price')} className="inline-flex items-center gap-1 hover:text-luxury-black">Value <SortIcon col="price" /></button></th>
                        <th className="p-3 font-semibold">Owner</th>
                        <th className="p-3 font-semibold">Tags</th>
                        <th className="p-3 font-semibold">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-100">
                      {filteredSubmissions.length === 0 ? (
                        <tr><td colSpan={10} className="p-8 text-center text-gray-500 italic">{submissions.length === 0 ? 'No submissions yet.' : 'No submissions match your filters.'}</td></tr>
                      ) : filteredSubmissions.map(sub => {
                        const config = sub.configuration || {};
                        const isUnread = !sub.viewedAt;
                        const isChecked = selectedIds.has(sub.id);
                        return (
                          <tr
                            key={sub.id}
                            onClick={() => openDetail(sub)}
                            className={`cursor-pointer transition-colors ${isChecked ? 'bg-luxury-gold/20' : isUnread ? 'bg-luxury-gold/[0.04] hover:bg-luxury-gold/10' : 'hover:bg-slate-50'}`}
                          >
                            <td className="p-3 w-10" onClick={(e) => { e.stopPropagation(); toggleSelected(sub.id); }}>
                              {isChecked ? <CheckSquare className="w-4 h-4 text-luxury-gold" /> : <Square className="w-4 h-4 text-gray-400 hover:text-luxury-gold" />}
                            </td>
                            <td className="p-3 align-top whitespace-nowrap">
                              <div className="flex items-center gap-2 text-gray-600">
                                {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-luxury-gold animate-pulse" />}
                                <span className={isUnread ? 'font-semibold text-luxury-black' : ''}>
                                  {sub.createdAt?.toDate?.()?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || '—'}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 align-top">
                              <PipelineStageSelector submission={sub} />
                              <div className="flex gap-1 mt-1">
                                {sub.acceptance?.signedAt && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800">Signed</span>}
                                {sub.isDuplicate && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-100 text-amber-800">⚠ Dup</span>}
                              </div>
                            </td>
                            <td className="p-3 align-top">
                              <p className="font-semibold text-luxury-black">{sub.name}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{config.width}' × {config.depth}' × {config.height}'</p>
                            </td>
                            <td className="p-3 align-top">
                              <div className="flex flex-col gap-0.5 text-xs text-gray-600">
                                <a href={`mailto:${sub.email}`} onClick={(e) => e.stopPropagation()} className="hover:text-luxury-gold inline-flex items-center gap-1.5"><Mail className="w-3 h-3" />{sub.email}</a>
                                {sub.phone && <a href={`tel:${sub.phone}`} onClick={(e) => e.stopPropagation()} className="hover:text-luxury-gold inline-flex items-center gap-1.5"><Phone className="w-3 h-3" />{sub.phone}</a>}
                              </div>
                            </td>
                            <td className="p-3 align-top text-xs text-gray-600">
                              {sub.city ? <div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{sub.city}</div> : <span className="text-gray-400 italic">—</span>}
                            </td>
                            <td className="p-3 align-top font-bold text-luxury-black">{config.totalPrice || '—'}</td>
                            <td className="p-3 align-top">
                              <AssignedToSelector submission={sub} compact />
                            </td>
                            <td className="p-3 align-top">
                              <div className="flex flex-wrap gap-0.5 max-w-[140px]">
                                {(sub.tags || []).slice(0, 2).map((t: string) => (
                                  <span key={t} className="text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">{t}</span>
                                ))}
                                {(sub.tags || []).length > 2 && <span className="text-[9px] text-gray-400">+{sub.tags.length - 2}</span>}
                              </div>
                            </td>
                            <td className="p-3 align-top">
                              {sub.pdfUrl ? (
                                <a href={sub.pdfUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-luxury-gold/10 text-luxury-gold hover:bg-luxury-gold hover:text-white text-[11px] font-semibold border border-luxury-gold/20">
                                  <FileText className="w-3 h-3" />View
                                </a>
                              ) : <span className="text-[11px] text-gray-400 italic">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Contractors */}
          {activeTab === 'contractors' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">Contractor Management</h2>
                <button onClick={() => setShowInviteForm(!showInviteForm)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-luxury-black text-white rounded-lg font-semibold text-sm hover:bg-luxury-black/90">
                  <Plus className="w-4 h-4" />Invite Contractor
                </button>
              </div>
              {showInviteForm && <ContractorInviteForm onClose={() => setShowInviteForm(false)} />}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                  <thead><tr className="bg-slate-50 text-xs text-gray-500 uppercase"><th className="p-3">Dealer</th><th className="p-3">Contact</th><th className="p-3">Status</th><th className="p-3">Discount</th><th className="p-3">Customer Link</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {contractors.length === 0
                      ? <tr><td colSpan={5} className="p-8 text-center text-gray-500 italic">No contractors yet.</td></tr>
                      : contractors.map(c => {
                        const dealerLink = c.slug ? `${window.location.origin}/dealer/${c.slug}` : null;
                        return (
                          <tr key={c.id}>
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                {c.logoUrl ? (
                                  <img src={c.logoUrl} alt={c.companyName} className="w-10 h-10 object-contain rounded bg-slate-50 border border-slate-200 p-1" />
                                ) : (
                                  <div className="w-10 h-10 bg-luxury-gold/10 rounded flex items-center justify-center text-luxury-gold font-bold text-sm border border-luxury-gold/20">
                                    {(c.companyName || '?').slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <p className="font-semibold text-luxury-black">{c.companyName}</p>
                                  {c.slug && <p className="text-[10px] text-gray-400 font-mono">/dealer/{c.slug}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-sm">
                              <p className="text-luxury-black">{c.contactName}</p>
                              <a href={`mailto:${c.email}`} className="text-xs text-gray-500 hover:text-luxury-gold">{c.email}</a>
                            </td>
                            <td className="p-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${c.status === 'active' ? 'bg-emerald-100 text-emerald-800' : c.status === 'invited' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{c.status}</span></td>
                            <td className="p-3 text-luxury-black font-semibold">{c.discountPercentage || 0}%</td>
                            <td className="p-3">
                              {dealerLink ? (
                                <button
                                  onClick={() => { navigator.clipboard.writeText(dealerLink); toast.success('Link copied'); }}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-luxury-gold/10 text-luxury-black border border-luxury-gold/30 rounded-md text-xs font-semibold hover:bg-luxury-gold hover:text-white transition-colors"
                                  title="Copy dealer link to clipboard"
                                >
                                  <Copy className="w-3 h-3" />
                                  Copy Link
                                </button>
                              ) : <span className="text-xs text-gray-400 italic">No slug</span>}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Jobs */}
          {activeTab === 'jobs' && (
            <div className="space-y-4">
              {jobs.length === 0 ? (
                <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-gray-500 italic">No contractor jobs yet.</div>
              ) : jobs.map(job => {
                const jobBids = bids.filter(b => b.jobId === job.id);
                return (
                  <div key={job.id} className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-luxury-black">{job.customerName || 'Customer'}</p>
                        <p className="text-xs text-gray-500">{job.city}</p>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${job.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : job.status === 'in-progress' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'}`}>{job.status}</span>
                    </div>
                    {jobBids.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">Bids ({jobBids.length})</h4>
                        <ul className="space-y-1">
                          {jobBids.map(bid => <li key={bid.id} className="text-sm flex justify-between"><span>{bid.contractorName}</span><span className="font-bold">{formatCurrency(bid.amount)}</span></li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Command palette */}
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        submissions={submissions}
        onOpenSubmission={openDetail}
        onNav={(tab) => setActiveTab(tab)}
      />

      {/* Detail modal */}
      <AnimatePresence>
        {detailSub && <SubmissionDetail key={detailSub.id} sub={detailSub} contractors={contractors} onClose={() => setDetailSub(null)} onCompose={setComposeMode} onMarkUnread={() => { markAsUnread(detailSub.id); setDetailSub(null); }} />}
      </AnimatePresence>

      {/* Compose modal */}
      {composeMode && detailSub && (
        <ComposeModal submission={detailSub} initialMode={composeMode} onClose={() => setComposeMode(null)} />
      )}
    </div>
  );
}

// ─── SUBMISSION DETAIL MODAL ───────────────────────────────────────────────
function SubmissionDetail({ sub, onClose, onCompose, onMarkUnread, contractors }: { sub: any; onClose: () => void; onCompose: (m: 'email' | 'sms') => void; onMarkUnread: () => void; contractors: any[] }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'notes' | 'tasks' | 'files' | 'pdf'>('overview');
  const cfg = sub.configuration || {};
  const pb = sub.pricingBreakdown || {};
  const fmt = (n: number) => typeof n === 'number' ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—';
  const sourceLabel = LEAD_SOURCES.find(s => s.id === sub.source)?.label || sub.source || '—';

  // If this lead came through a dealer, compute dealer cost + margin (admin-only view)
  const dealer = sub.dealerSlug
    ? contractors.find(c => c.slug === sub.dealerSlug)
    : sub.assignedTo
      ? contractors.find(c => c.email === sub.assignedTo)
      : null;
  const dealerDiscountPct = dealer?.discountPercentage ?? null;
  const customerTotal = pb.total || 0;
  const dealerCost = dealerDiscountPct != null ? customerTotal * (1 - dealerDiscountPct / 100) : null;
  const dealerMargin = dealerCost != null ? customerTotal - dealerCost : null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[94vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h2 className="text-2xl font-serif text-luxury-black">{sub.name}</h2>
                <PipelineStageSelector submission={sub} />
                {sub.acceptance?.signedAt && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">✓ Signed</span>}
                {sub.isDuplicate && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800">⚠ Duplicate</span>}
              </div>
              <p className="text-xs text-gray-500">
                Submitted {sub.createdAt?.toDate?.()?.toLocaleString() || '—'} · Source: {sourceLabel} · ID {sub.id.slice(0, 8)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onCompose('email')} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-black text-white rounded-lg text-xs font-bold hover:bg-luxury-black/90">
                <Mail className="w-3.5 h-3.5" />Email
              </button>
              <button onClick={() => onCompose('sms')} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-black/80 text-white rounded-lg text-xs font-bold hover:bg-luxury-black">
                <MessageSquare className="w-3.5 h-3.5" />SMS
              </button>
              <a href={`/proposal/${sub.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-gold/10 text-luxury-black border border-luxury-gold/30 rounded-lg text-xs font-bold hover:bg-luxury-gold hover:text-white">
                <Eye className="w-3.5 h-3.5" />Customer View
              </a>
              <button onClick={onMarkUnread} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-slate-100 rounded-lg" title="Mark unread & close">
                <EyeOff className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-slate-100 rounded-lg" title="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Inner tabs */}
        <div className="px-6 pt-3 border-b border-slate-100 flex gap-1 bg-white">
          {[
            { k: 'overview', label: 'Overview' },
            { k: 'activity', label: 'Activity' },
            { k: 'notes', label: 'Notes' },
            { k: 'tasks', label: 'Tasks' },
            { k: 'files', label: 'Files' },
            { k: 'pdf', label: 'Proposal PDF' },
          ].map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k as any)} className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${activeTab === t.k ? 'border-luxury-gold text-luxury-black' : 'border-transparent text-gray-500 hover:text-luxury-black'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-5">
                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Contact</h3>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /><a href={`mailto:${sub.email}`} className="hover:underline">{sub.email}</a></div>
                    {sub.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /><a href={`tel:${sub.phone}`} className="hover:underline">{sub.phone}</a></div>}
                    {(sub.address || sub.city) && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-gray-400 mt-0.5" /><span>{[sub.address, sub.city].filter(Boolean).join(', ')}</span></div>}
                  </div>
                </section>
                <section className="grid grid-cols-2 gap-3">
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Owner</h3>
                    <AssignedToSelector submission={sub} />
                  </div>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Source</h3>
                    <SourceSelector submission={sub} />
                  </div>
                </section>
                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Tags</h3>
                  <TagManager submission={sub} />
                </section>
                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Configuration</h3>
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-sm">
                    <div><span className="text-gray-500">Size:</span> <span className="font-semibold">{cfg.width}' × {cfg.depth}' × {cfg.height}'</span></div>
                    <div><span className="text-gray-500">Frame:</span> <span className="font-semibold">{cfg.frameColor}</span></div>
                    <div><span className="text-gray-500">Louvers:</span> <span className="font-semibold">{cfg.louverColor}</span></div>
                    <div><span className="text-gray-500">Source:</span> <span className="font-semibold">{sourceLabel}</span></div>
                  </div>
                </section>
                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Pricing Breakdown</h3>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        <tr><td className="px-3 py-2">Bespoke Pergola</td><td className="px-3 py-2 text-right font-semibold">{fmt(pb.basePrice)}</td></tr>
                        {(pb.itemizedAccessories || []).map((a: any, i: number) => (
                          <tr key={i}><td className="px-3 py-2 pl-6 text-gray-600">{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</td><td className="px-3 py-2 text-right">{fmt(a.cost)}</td></tr>
                        ))}
                        <tr className="bg-slate-50"><td className="px-3 py-2 font-semibold">Subtotal</td><td className="px-3 py-2 text-right font-bold">{fmt(pb.subtotal)}</td></tr>
                        <tr><td className="px-3 py-2 text-gray-500">HST</td><td className="px-3 py-2 text-right">{fmt(pb.hst)}</td></tr>
                        <tr className="bg-luxury-gold/5 border-t-2 border-luxury-gold/30">
                          <td className="px-3 py-3 font-bold">Total</td><td className="px-3 py-3 text-right font-bold text-luxury-gold text-lg">{fmt(pb.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
                {dealer && dealerCost != null && (
                  <section className="border-2 border-luxury-gold/30 bg-luxury-gold/5 rounded-lg p-4">
                    <div className="flex items-start gap-3 mb-3">
                      {dealer.logoUrl ? (
                        <img src={dealer.logoUrl} alt={dealer.companyName} className="w-10 h-10 rounded bg-white p-1 object-contain border border-luxury-gold/20" />
                      ) : (
                        <div className="w-10 h-10 bg-luxury-gold/20 text-luxury-gold rounded font-bold flex items-center justify-center text-sm">
                          {(dealer.companyName || '?').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-bold text-luxury-black">Dealer-Sourced Lead</p>
                        <p className="text-xs text-gray-600">{dealer.companyName} · {dealer.contactName}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Internal numbers — never shown to customer</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white rounded-md p-2 border border-slate-200">
                        <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400">Customer Price</p>
                        <p className="text-sm font-bold text-luxury-black">{fmt(customerTotal)}</p>
                      </div>
                      <div className="bg-white rounded-md p-2 border border-slate-200">
                        <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400">Dealer Cost</p>
                        <p className="text-sm font-bold text-rose-600">{fmt(dealerCost)}</p>
                        <p className="text-[10px] text-gray-400">at {dealerDiscountPct}% disc.</p>
                      </div>
                      <div className="bg-white rounded-md p-2 border border-slate-200">
                        <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400">Margin</p>
                        <p className="text-sm font-bold text-emerald-600">{fmt(dealerMargin || 0)}</p>
                        <p className="text-[10px] text-gray-400">{customerTotal > 0 ? `${(((dealerMargin || 0) / customerTotal) * 100).toFixed(1)}%` : ''}</p>
                      </div>
                    </div>
                  </section>
                )}

                {sub.acceptance?.signedAt && (
                  <section className="border-2 border-emerald-200 bg-emerald-50/40 rounded-lg p-4">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shrink-0"><CheckCheck className="w-4 h-4 text-white" /></div>
                      <div>
                        <p className="font-bold text-emerald-800">Accepted by {sub.acceptance.signedName}</p>
                        <p className="text-[11px] text-gray-600">{sub.acceptance.signedAt?.toDate?.()?.toLocaleString()}</p>
                      </div>
                    </div>
                    {sub.acceptance.signatureDataUrl ? <img src={sub.acceptance.signatureDataUrl} alt="Signature" className="h-12 bg-white rounded p-1 border" /> : <p className="italic text-lg" style={{ fontFamily: "'Outfit', cursive" }}>{sub.acceptance.signedName}</p>}
                    <p className="text-[10px] text-gray-500 mt-2">IP: {sub.acceptance.signerIp}</p>
                  </section>
                )}
              </div>
              <div className="space-y-5">
                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Open Tasks</h3>
                  <TasksPanel submissionId={sub.id} />
                </section>
                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Internal Notes</h3>
                  <NotesPanel submissionId={sub.id} />
                </section>
              </div>
            </div>
          )}
          {activeTab === 'activity' && <ActivityTimeline submissionId={sub.id} />}
          {activeTab === 'notes' && <NotesPanel submissionId={sub.id} />}
          {activeTab === 'tasks' && <TasksPanel submissionId={sub.id} />}
          {activeTab === 'files' && <FilesPanel submissionId={sub.id} />}
          {activeTab === 'pdf' && (
            sub.pdfUrl ? (
              <div className="space-y-2">
                <iframe src={sub.pdfUrl} className="w-full rounded-lg border border-slate-200" style={{ height: '75vh' }} title={`Proposal ${sub.name}`} />
                <a href={sub.pdfUrl} target="_blank" rel="noopener noreferrer" download={sub.pdfFilename} className="inline-flex items-center gap-1.5 px-3 py-2 bg-luxury-gold text-white rounded-lg text-xs font-bold"><Download className="w-4 h-4" />Download</a>
              </div>
            ) : <p className="text-sm text-gray-400 italic text-center py-10">No PDF attached to this submission.</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
