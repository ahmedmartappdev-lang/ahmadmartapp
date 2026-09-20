import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search, ChevronRight, ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAllCategories } from '@/hooks/useCategories';

// Vendor-first browse: vertical category list. Each row shows the
// admin-uploaded image, the optional offer_text chip, name + count of
// vendors in the category, description, and a chevron. Tap → vendor
// list at /category/<slug>.
const AllCategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const { getTotalItems, getTotalAmount } = useCartStore();
  const cartItemsCount = getTotalItems();
  const cartTotal = getTotalAmount();

  const { data: allCategories, isLoading: categoriesLoading } = useAllCategories();
  const rootCategories = (allCategories || []).filter(c => !c.parent_id);

  // Vendor counts per category — single query, grouped client-side.
  // Active vendors only; we don't want a "(0)" row drawing customers to
  // an empty list.
  const { data: vendorCounts } = useQuery({
    queryKey: ['vendor-counts-by-category'],
    queryFn: async () => {
      const { data } = await (supabase.from('vendors') as any)
        .select('category_id')
        .eq('status', 'active');
      const map = new Map<string, number>();
      for (const row of (data || []) as Array<{ category_id: string | null }>) {
        if (!row.category_id) continue;
        map.set(row.category_id, (map.get(row.category_id) || 0) + 1);
      }
      return map;
    },
  });

  return (
    <CustomerLayout hideHeader={true}>
      <div className="bg-white min-h-screen pb-32">
        {/* Title bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3.5 bg-white border-b border-gray-100">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-gray-700 p-1 -ml-1 rounded-md hover:bg-gray-100"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-[18px] font-bold text-gray-900 leading-tight">All Categories</h1>
          </div>
          <button
            onClick={() => navigate('/search')}
            className="text-gray-700 p-1 -mr-1 rounded-md hover:bg-gray-100"
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </button>
        </header>

        <main className="max-w-[1400px] mx-auto px-3 py-3">
          {categoriesLoading ? (
            <ul className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <li
                  key={i}
                  className="rounded-2xl border border-gray-100 bg-white p-3 flex items-center gap-3"
                >
                  <Skeleton className="w-[68px] h-[68px] rounded-xl shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-3">
              {rootCategories.map((cat) => {
                const count = vendorCounts?.get(cat.id) ?? 0;
                const offer = (cat as any).offer_text as string | null | undefined;
                return (
                  <li key={cat.id}>
                    <button
                      onClick={() => navigate(`/category/${cat.slug}`)}
                      className="w-full text-left rounded-2xl border border-gray-100 bg-white p-3 flex items-center gap-3 transition-colors hover:bg-gray-50 active:bg-gray-100"
                    >
                      {/* Thumbnail + offer chip overlay */}
                      <div className="relative w-[68px] h-[68px] rounded-xl bg-gray-50 overflow-hidden shrink-0 border border-gray-100">
                        {cat.image_url ? (
                          <img
                            src={cat.image_url}
                            alt={cat.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-emerald-50 to-emerald-100" />
                        )}
                        {offer && (
                          <span className="absolute top-1 left-1 bg-emerald-600 text-white text-[10px] font-bold leading-none px-1.5 py-1 rounded-md shadow-sm">
                            {offer}
                          </span>
                        )}
                      </div>

                      {/* Title + count + description */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[15px] font-bold text-gray-900 leading-tight">
                          {cat.name}
                          <span className="ml-1 text-gray-500 font-medium">({count})</span>
                        </h3>
                        {(cat as any).description && (
                          <p className="text-[12px] text-gray-500 mt-1 line-clamp-2 leading-snug">
                            {(cat as any).description}
                          </p>
                        )}
                      </div>

                      <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                    </button>
                  </li>
                );
              })}

              {rootCategories.length === 0 && (
                <li className="text-center py-16 text-muted-foreground text-sm">
                  No categories yet.
                </li>
              )}
            </ul>
          )}
        </main>

        {/* Floating cart panel — kept for parity with prior page */}
        {cartItemsCount > 0 && (
          <div
            onClick={() => navigate('/cart')}
            className="fixed bottom-[85px] lg:bottom-8 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-40 bg-[#181d19] backdrop-blur-md rounded-lg px-4 py-3.5 flex items-center justify-between shadow-xl cursor-pointer hover:bg-[#2d322e] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#a3f788] rounded-md flex items-center justify-center">
                <ShoppingCart className="text-[#0d5200] w-4 h-4" />
              </div>
              <span className="text-white font-medium text-sm">
                {cartItemsCount} {cartItemsCount === 1 ? 'Item' : 'Items'} added
              </span>
            </div>
            <div className="flex items-center gap-2 pl-4 border-l border-white/20">
              <span className="text-white font-black text-lg">₹{cartTotal.toFixed(0)}</span>
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
};

export default AllCategoriesPage;
