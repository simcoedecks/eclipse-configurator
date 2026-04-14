import { Link } from 'react-router-dom';
import { FilePlus } from 'lucide-react';
import type { ContractorData } from '../components/AuthGuard';

const statCards = [
  { label: 'Quotes This Month', value: '\u2014' },
  { label: 'Pipeline Value', value: '\u2014' },
  { label: 'Quotes Sent', value: '\u2014' },
  { label: 'Quotes Accepted', value: '\u2014' },
];

type DashboardProps = {
  contractor: ContractorData;
};

export default function Dashboard({ contractor }: DashboardProps) {
  return (
    <div className="p-8">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {contractor.contactName}
        </h1>
        <p className="text-gray-400 mt-1">
          {contractor.companyName} &middot; {contractor.discountPercentage}% contractor discount
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value }) => (
          <div
            key={label}
            className="bg-[#0a0a0a] border border-[#222] rounded-xl p-5"
          >
            <p className="text-sm text-gray-400 mb-1">{label}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* New Quote CTA */}
      <Link
        to="/quote/new"
        className="inline-flex items-center gap-2 bg-[#C5A059] hover:bg-[#b8933f] text-black font-semibold rounded-lg px-6 py-3 transition-colors"
      >
        <FilePlus className="h-5 w-5" />
        New Quote
      </Link>
    </div>
  );
}
