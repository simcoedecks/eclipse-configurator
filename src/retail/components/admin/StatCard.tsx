import { motion } from 'motion/react';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: string; positive?: boolean };
  icon?: ReactNode;
  accent?: 'gold' | 'emerald' | 'indigo' | 'rose' | 'slate' | 'sky';
}

const accentMap = {
  gold:    { bg: 'bg-gradient-to-br from-luxury-gold/15 to-luxury-gold/5', border: 'border-luxury-gold/30', text: 'text-luxury-gold', dot: 'bg-luxury-gold' },
  emerald: { bg: 'bg-gradient-to-br from-emerald-500/15 to-emerald-500/5', border: 'border-emerald-500/30', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  indigo:  { bg: 'bg-gradient-to-br from-indigo-500/15 to-indigo-500/5',   border: 'border-indigo-500/30',  text: 'text-indigo-600',  dot: 'bg-indigo-500' },
  rose:    { bg: 'bg-gradient-to-br from-rose-500/15 to-rose-500/5',       border: 'border-rose-500/30',    text: 'text-rose-600',    dot: 'bg-rose-500' },
  slate:   { bg: 'bg-gradient-to-br from-slate-200/40 to-slate-100/20',    border: 'border-slate-300/50',   text: 'text-slate-700',   dot: 'bg-slate-400' },
  sky:     { bg: 'bg-gradient-to-br from-sky-500/15 to-sky-500/5',         border: 'border-sky-500/30',     text: 'text-sky-600',     dot: 'bg-sky-500' },
};

export default function StatCard({ label, value, sub, trend, icon, accent = 'slate' }: StatCardProps) {
  const a = accentMap[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border ${a.border} ${a.bg} p-5 backdrop-blur-sm`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-luxury-black/50">{label}</span>
        {icon && <div className={`${a.text} opacity-70`}>{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-serif font-medium text-luxury-black">{value}</span>
        {trend && (
          <span className={`text-xs font-bold ${trend.positive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-luxury-black/50 mt-1">{sub}</p>}
    </motion.div>
  );
}
