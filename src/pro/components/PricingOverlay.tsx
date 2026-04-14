import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '../../shared/lib/pricing';

export interface PricingLineItem {
  name: string;
  retailPrice: number;
  contractorCost: number;
}

interface PricingOverlayProps {
  items: PricingLineItem[];
  discountPercentage: number;
}

export default function PricingOverlay({ items, discountPercentage }: PricingOverlayProps) {
  const [collapsed, setCollapsed] = useState(false);

  const retailTotal = items.reduce((sum, i) => sum + i.retailPrice, 0);
  const contractorTotal = items.reduce((sum, i) => sum + i.contractorCost, 0);
  const marginTotal = retailTotal - contractorTotal;

  const hstRetail = retailTotal * 0.13;
  const hstContractor = contractorTotal * 0.13;
  const hstMargin = hstRetail - hstContractor;

  const grandRetail = retailTotal + hstRetail;
  const grandContractor = contractorTotal + hstContractor;
  const grandMargin = grandRetail - grandContractor;

  const marginPct = retailTotal > 0 ? ((marginTotal / retailTotal) * 100).toFixed(1) : '0.0';

  return (
    <div className="border border-[#222] rounded-lg overflow-hidden bg-[#0a0a0a]">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#C5A059]/20 to-[#C5A059]/5 border-b border-[#222] hover:from-[#C5A059]/30 transition-colors"
      >
        <span className="text-sm font-bold text-[#C5A059] tracking-wide">
          Pricing Breakdown &mdash; {discountPercentage}% Contractor Discount
        </span>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-[#C5A059]" />
        ) : (
          <ChevronUp className="w-4 h-4 text-[#C5A059]" />
        )}
      </button>

      {!collapsed && (
        <div className="p-4 space-y-3">
          {/* Table header */}
          <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider font-bold text-gray-500 pb-2 border-b border-[#222]">
            <span>Item Description</span>
            <span className="text-right">Retail Price</span>
            <span className="text-right">Your Cost</span>
            <span className="text-right">Your Margin</span>
          </div>

          {/* Line items */}
          {items.map((item, idx) => {
            const margin = item.retailPrice - item.contractorCost;
            return (
              <div key={idx} className="grid grid-cols-4 gap-2 text-xs py-1.5 border-b border-[#222]/50">
                <span className="text-gray-300 truncate" title={item.name}>{item.name}</span>
                <span className="text-right text-gray-400">{formatCurrency(item.retailPrice)}</span>
                <span className="text-right text-white">{formatCurrency(item.contractorCost)}</span>
                <span className="text-right text-emerald-400 font-medium">{formatCurrency(margin)}</span>
              </div>
            );
          })}

          {/* HST row */}
          <div className="grid grid-cols-4 gap-2 text-xs py-1.5 border-b border-[#222]/50 text-gray-500 italic">
            <span>HST (13%)</span>
            <span className="text-right">{formatCurrency(hstRetail)}</span>
            <span className="text-right">{formatCurrency(hstContractor)}</span>
            <span className="text-right text-emerald-400/60">{formatCurrency(hstMargin)}</span>
          </div>

          {/* Totals row */}
          <div className="grid grid-cols-4 gap-2 text-sm py-3 border-t-2 border-[#C5A059]/40 font-bold">
            <span className="text-[#C5A059]">Total</span>
            <span className="text-right text-gray-300">{formatCurrency(grandRetail)}</span>
            <span className="text-right text-white">{formatCurrency(grandContractor)}</span>
            <span className="text-right text-emerald-400">{formatCurrency(grandMargin)}</span>
          </div>

          {/* Margin summary */}
          <div className="pt-2 border-t border-[#222] text-center">
            <span className="text-xs text-gray-400">
              Your margin:{' '}
              <span className="text-emerald-400 font-bold">{marginPct}%</span>
              {' '}
              <span className="text-emerald-400/80">
                ({formatCurrency(marginTotal)} before tax)
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
