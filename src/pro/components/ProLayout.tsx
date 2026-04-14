import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { LayoutDashboard, FilePlus, FileText, UserCircle, LogOut } from 'lucide-react';
import { auth } from '../../shared/firebase';
import type { ContractorData } from './AuthGuard';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/quote/new', label: 'New Quote', icon: FilePlus },
  { to: '/quotes', label: 'My Quotes', icon: FileText },
  { to: '/account', label: 'Account', icon: UserCircle },
];

type ProLayoutProps = {
  contractor: ContractorData;
  children: ReactNode;
};

export default function ProLayout({ contractor, children }: ProLayoutProps) {
  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <div className="flex min-h-screen bg-[#111] text-white">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0a0a0a] border-r border-[#222] flex flex-col">
        {/* Branding */}
        <div className="p-6 border-b border-[#222]">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Eclipse Pro" className="h-8 w-8" />
            <div>
              <h1 className="text-lg font-bold text-[#C5A059]">Eclipse Pro</h1>
              <p className="text-xs text-gray-500">Contractor Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#C5A059]/10 text-[#C5A059]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User Info + Sign Out */}
        <div className="p-4 border-t border-[#222]">
          <div className="mb-3">
            <p className="text-sm font-medium text-white truncate">{contractor.contactName}</p>
            <p className="text-xs text-gray-500 truncate">{contractor.companyName}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
