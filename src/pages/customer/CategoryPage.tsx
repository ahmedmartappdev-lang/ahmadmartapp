import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShoppingCart, ChevronRight, Store, ArrowLeft, Star, MapPin } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategory, useSubcategories, useAllCategories } from '@/hooks/useCategories';
import { useVendorsByCategory } from '@/hooks/useVendorCatalog';
import { cn } from '@/lib/utils';

/**
 * Vendor-first browse: /category/:slug now lists VENDORS in that
 * category (not products). Customer taps a vendor card → /store/:vendorId
 * where they see that store's products with subcategory filter pills.
 *
 * Layout preserved from the prior page so the customer feels at home:
 *   - Title bar with back arrow + (optional) parent name + category name
 *   - Sticky root-category switcher pill row (jump between cats)
 *   - Banner image (admin-uploaded)
 *   - Subcategory pill row (filters which vendors show by their declared subs)
 *   - Vendor card list
 *   - Floating cart panel
 */
const CategoryPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { getTotalItems, getTotalAmount } = useCartStore();
  const cartItemsCount = getTotalItems();
  const cartTotal = getTotalAmount();

  const { data: category, isLoading: categoryLoading } = useCategory(slug || '');
  const { data: subcategories } = useSubcategories(category?.id);
  const { data: allCats } = useAllCategories();

  const parentCategory = category?.parent_id
    ? allCats?.find(c => c.id === category.parent_id)
    : null;

  const rootCategories = useMemo(
    () => (allCats || []).filter(c => !c.parent_id),
    [allCats],
  );
  const activeRootId = parentCategory?.id ?? category?.id ?? null;

  // Vendor query: filter by THIS category's id (or parent's id if we drilled
  // into a subcategory). Sub pills removed — no sub narrowing here.
  const browseCategoryId = parentCategory?.id ?? category?.id ?? null;
  const { data: vendors, isLoading: vendorsLoading } = useVendorsByCategory(
    browseCategoryId,
    null,
  );

  const isLoading = categoryLoading || vendorsLoading;

  return (
    <CustomerLayout>
      <div className="bg-white min-h-screen pb-32">
        {/* Title bar */}
        <div className="border-b border-gray-100 px-4 py-3.5 flex items-center gap-3 bg-white">
          <button
            onClick={() => navigate(-1)}
            className="text-gray-700 p-1 -ml-1"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {categoryLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <div className="flex-1">
              {parentCategory && (
                <span className="text-xs text-gray-500 block mb-0.5">
                  {parentCategory.name}
                </span>
              )}
              <h1 className="text-[18px] font-bold text-gray-900 leading-tight">
                {category?.name || 'Stores'}
              </h1>
            </div>
          )}
        </div>

        {/* Root-category switcher pills (sticky) — sibling navigation. */}
        {rootCategories.length > 0 && (
          <div className="border-b border-gray-100 bg-white sticky top-0 z-40 shadow-sm">
            <div className="max-w-[1400px] mx-auto">
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-3 px-4">
                {rootCategories.map((cat) => (
                  <button
                    key={cat.id}
                    className={cn(
                      // Deliberately heavier than the sub pill row below so the
                      // hierarchy (root > sub) reads at a glance.
                      'shrink-0 px-4 py-1.5 rounded-full text-[15px] transition-colors whitespace-nowrap border',
                      activeRootId === cat.id
                        ? 'bg-[#e8f5e9] border-[#2e7d32] text-[#2e7d32] font-bold'
                        : 'bg-white border-gray-200 text-gray-700 font-semibold hover:bg-gray-50',
                    )}
                    onClick={() => {
                      if (cat.slug !== slug) navigate(`/category/${cat.slug}`);
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Category banner */}
        {category?.image_url && (
          <img
            src={category.image_url}
            alt={category.name}
            className="w-full h-[140px] md:h-[220px] object-cover"
          />
        )}

        {/* Subcategory pills removed per client — root-category switcher above
            is the only filter here. Store cards still list each vendor's
            declared subs, and the store page itself filters by section. */}

        <div className="max-w-[1400px] mx-auto">
          {/* Vendor count strip */}
          {!isLoading && vendors && (
            <div className="px-4 py-3 text-[14px] font-bold text-gray-900 border-b border-gray-50 bg-white">
              {vendors.length} {vendors.length === 1 ? 'Store' : 'Stores'}
            </div>
          )}

          {/* Vendor list */}
          {isLoading ? (
            <div className="flex flex-col">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex p-4 border-b border-gray-100 bg-white">
                  <Skeleton className="w-[96px] h-[96px] rounded-xl mr-4 shrink-0" />
                  <div className="flex-1 flex flex-col justify-center space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : vendors && vendors.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {vendors.map((v) => {
                const address = (
                  v.store_address
                  || [v.city, v.pincode].filter(Boolean).join(' · ')
                  || null
                );
                const subTags = (v.subcategory_ids || [])
                  .map(id => subcategories?.find(s => s.id === id)?.name)
                  .filter(Boolean)
                  .slice(0, 4);
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => navigate(`/store/${v.id}`)}
                      className="w-full text-left flex p-4 bg-white hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-[96px] h-[96px] rounded-xl bg-gray-50 mr-4 shrink-0 overflow-hidden border border-gray-100">
                        {v.store_photo_url ? (
                          <img
                            src={v.store_photo_url}
                            alt={v.business_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100">
                            <Store className="w-7 h-7 text-emerald-600/40" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-[15px] font-bold text-gray-900 truncate">
                            {v.business_name}
                          </h3>
                          {v.is_featured && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide">
                              Featured
                            </span>
                          )}
                        </div>
                        {typeof v.rating === 'number' && v.rating > 0 && (
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-gray-700">
                            <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                            <span className="font-semibold text-gray-900">{Number(v.rating).toFixed(1)}</span>
                          </p>
                        )}
                        {subTags.length > 0 && (
                          <p className="mt-1 text-[12px] text-gray-500 line-clamp-1">
                            {subTags.join(' · ')}
                          </p>
                        )}
                        {address && (
                          <p className="mt-1 text-[12px] text-gray-500 inline-flex items-start gap-1 line-clamp-1">
                            <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                            <span className="truncate">{address}</span>
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 self-center shrink-0 ml-2" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-center py-20 flex flex-col items-center">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <Store className="w-10 h-10 text-gray-300" />
              </div>
              <p className="font-semibold text-lg text-gray-900">No stores yet</p>
              <p className="text-sm text-gray-500 max-w-xs">
                Stores in this category will appear here once admin adds them.
              </p>
            </div>
          )}
        </div>

        {/* Floating sticky cart */}
        {cartItemsCount > 0 && (
          <div
            onClick={() => navigate('/cart')}
            className="fixed bottom-[85px] lg:bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-[370px] bg-[#2e7d32] text-white px-5 py-3.5 rounded-xl flex justify-between items-center shadow-[0_8px_20px_rgba(0,0,0,0.2)] z-50 cursor-pointer hover:bg-green-800 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="border-r border-white/30 pr-4 flex items-center gap-2 text-[14px] font-medium">
                <ShoppingCart className="w-[18px] h-[18px]" />
                {cartItemsCount} {cartItemsCount === 1 ? 'Item' : 'Items'}
              </div>
              <div className="font-extrabold text-[17px]">₹{cartTotal.toFixed(0)}</div>
            </div>
            <div className="text-[13px] font-semibold flex items-center gap-1">
              View Cart <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
};

export default CategoryPage;
