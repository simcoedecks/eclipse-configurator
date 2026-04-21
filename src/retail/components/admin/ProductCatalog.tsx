import { useState, useMemo } from 'react';
import { CUSTOM_PRODUCT_CATALOG, type CatalogProduct } from '../../../shared/lib/crm';
import { formatCurrencyUSD } from '../../../shared/lib/pricingMath';
import { X, Search, Plus, CheckCircle2 } from 'lucide-react';

interface Props {
  onClose: () => void;
  /** Called when admin clicks a product — adds it as a custom line item */
  onAdd: (p: { name: string; description?: string; amount: number; kind: 'add' | 'discount' }) => void;
  /** Optional: IDs of products already added (highlighted with a checkmark) */
  existingNames?: string[];
}

export default function ProductCatalog({ onClose, onAdd, existingNames = [] }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>(CUSTOM_PRODUCT_CATALOG[0].id);
  const [q, setQ] = useState('');
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);

  // Filter products across ALL categories when searching
  const searchResults = useMemo(() => {
    if (!q.trim()) return null;
    const ql = q.toLowerCase();
    const hits: Array<{ cat: typeof CUSTOM_PRODUCT_CATALOG[0]; product: CatalogProduct }> = [];
    CUSTOM_PRODUCT_CATALOG.forEach(cat => {
      cat.products.forEach(p => {
        const hay = `${p.name} ${p.description || ''} ${cat.label}`.toLowerCase();
        if (ql.split(/\s+/).every(tok => hay.includes(tok))) hits.push({ cat, product: p });
      });
    });
    return hits;
  }, [q]);

  const currentCategory = CUSTOM_PRODUCT_CATALOG.find(c => c.id === activeCategory)!;

  const handleAdd = (p: CatalogProduct, isDiscount: boolean) => {
    onAdd({
      name: p.name,
      description: p.description,
      amount: Math.abs(p.price),
      kind: isDiscount ? 'discount' : 'add',
    });
    setRecentlyAddedId(p.id);
    setTimeout(() => setRecentlyAddedId(null), 1500);
  };

  const renderProduct = (cat: typeof CUSTOM_PRODUCT_CATALOG[0], p: CatalogProduct) => {
    const isDiscount = cat.id === 'adjustments';
    const alreadyAdded = existingNames.some(n => n.toLowerCase() === p.name.toLowerCase());
    const justAdded = recentlyAddedId === p.id;
    return (
      <button
        key={p.id}
        onClick={() => handleAdd(p, isDiscount)}
        className={`group relative text-left p-3 border rounded-lg transition-all ${
          justAdded
            ? 'border-emerald-500 bg-emerald-50 scale-[0.98]'
            : 'border-slate-200 bg-white hover:border-luxury-gold hover:shadow-md hover:-translate-y-0.5'
        }`}
      >
        <div className="flex items-start gap-2 mb-1">
          <span className="text-lg">{p.icon || '·'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-luxury-black truncate">{p.name}</p>
            {p.description && <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">{p.description}</p>}
          </div>
          {(alreadyAdded || justAdded) && (
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${justAdded ? 'text-emerald-500' : 'text-emerald-300'}`} />
          )}
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
          <span className={`text-sm font-bold ${isDiscount ? 'text-emerald-700' : 'text-luxury-black'}`}>
            {p.price > 0 ? `${isDiscount ? '−' : ''}${formatCurrencyUSD(p.price)}` : 'Quote on site'}
            {p.unit && p.unit !== 'flat' && p.unit !== 'each' && <span className="text-[10px] text-gray-400 font-normal"> / {p.unit}</span>}
          </span>
          <Plus className={`w-4 h-4 ${justAdded ? 'text-emerald-500' : 'text-gray-400 group-hover:text-luxury-gold'} transition-colors`} />
        </div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-luxury-paper to-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-serif text-luxury-black">Product Catalog</h2>
              <p className="text-xs text-gray-500 mt-0.5">Browse pre-built line items to add to this proposal. Click to add — you can edit prices after.</p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search across all categories…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-luxury-gold focus:border-transparent"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex">
          {!searchResults && (
            <>
              {/* Category rail */}
              <nav className="w-56 border-r border-slate-200 bg-slate-50 overflow-y-auto shrink-0">
                {CUSTOM_PRODUCT_CATALOG.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full flex items-start gap-2.5 text-left px-4 py-3 border-l-4 transition-colors ${
                      activeCategory === cat.id
                        ? 'border-luxury-gold bg-white'
                        : 'border-transparent hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xl">{cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-luxury-black">{cat.label}</p>
                      <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{cat.products.length} items</p>
                    </div>
                  </button>
                ))}
              </nav>

              {/* Product grid */}
              <div className="flex-1 overflow-y-auto p-5">
                <div className="mb-4">
                  <h3 className="font-serif text-lg text-luxury-black flex items-center gap-2">
                    <span>{currentCategory.icon}</span>
                    {currentCategory.label}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">{currentCategory.description}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {currentCategory.products.map(p => renderProduct(currentCategory, p))}
                </div>
              </div>
            </>
          )}

          {/* Search results */}
          {searchResults && (
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs text-gray-500 mb-3">{searchResults.length} result{searchResults.length === 1 ? '' : 's'} for "{q}"</p>
              {searchResults.length === 0 ? (
                <p className="text-center text-sm text-gray-400 italic py-10">No matches. Try a different term or browse by category.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {searchResults.map(({ cat, product }) => (
                    <div key={product.id}>
                      <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">{cat.icon} {cat.label}</p>
                      {renderProduct(cat, product)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <p className="text-[11px] text-gray-500">
            💡 Prices are defaults — you can edit amount &amp; quantity after adding.
          </p>
          <button onClick={onClose} className="px-4 py-1.5 bg-luxury-black text-white rounded-lg text-xs font-bold hover:bg-luxury-black/90">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
