import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { ProductCard } from '@/components/customer/ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, MapPin, Star, Store } from 'lucide-react';
import type { Product } from '@/types/database';
import { useVendorWithCatalog } from '@/hooks/useVendorCatalog';
import { VendorReviewsSection } from '@/components/customer/VendorReviewsSection';
import { cn } from '@/lib/utils';

const StorePage: React.FC = () => {
  const { vendorId } = useParams<{ vendorId: string }>();
  const navigate = useNavigate();

  // Subcategory pill state — "All" by default.
  const [activeSubId, setActiveSubId] = useState<string | null>(null);

  // Vendor + catalog (category + subcategory names) in one shot.
  const { data: catalog, isLoading: catalogLoading } = useVendorWithCatalog(vendorId);
  const vendor = catalog?.vendor || null;

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['vendor-products', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, category:categories(name, slug), vendor:vendors(business_name, rating)')
        .eq('vendor_id', vendorId!)
        .in('status', ['active', 'out_of_stock'])
        // Keep in sync with applyCustomerVisibility in src/hooks/useProducts.tsx
        // — admin must have set a positive price; null OR 0 means "not approved
        // yet" and the product must not show on the store page.
        .not('admin_selling_price', 'is', null)
        .gt('admin_selling_price', 0)
        .order('is_featured', { ascending: false });
      if (error) throw error;
      return data as unknown as Product[];
    },
    enabled: !!vendorId,
  });

  // Only show pills for subcategories that actually contain a visible product
  // in this store — an empty pill would just lead to "0 Products". Held back
  // until products load so pills don't appear and then vanish.
  const subcategoryPills = useMemo(() => {
    if (!products) return [];
    const usedIds = new Set(products.map(p => (p as any).category_id));
    return (catalog?.subcategories || []).filter(sub => usedIds.has(sub.id));
  }, [catalog?.subcategories, products]);

  // Filter products by the active subcategory pill — products' category_id
  // points to the vendor's subcategory (or the vendor's root) per the
  // refactored ProductForm.
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!activeSubId) return products;
    return products.filter(p => (p as any).category_id === activeSubId);
  }, [products, activeSubId]);

  return (
    <CustomerLayout>
      <div className="min-h-screen bg-secondary md:bg-background">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1" aria-label="Back">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          {/* Store name intentionally not repeated here — it's on the
              banner card right below. */}
        </div>

        {/* Vendor Info Banner */}
        {vendor && (
          <div className="bg-card mx-4 mt-4 rounded-2xl overflow-hidden shadow-sm border border-border">
            {(vendor.store_photo_url || vendor.owner_photo_url) ? (
              <img
                src={vendor.store_photo_url || vendor.owner_photo_url || ''}
                alt={vendor.business_name}
                className="w-full h-40 object-cover"
              />
            ) : (
              <div className="w-full h-40 bg-primary/10 flex items-center justify-center">
                <Store className="w-16 h-16 text-primary/40" />
              </div>
            )}
            <div className="p-4">
              <h2 className="text-lg font-bold text-foreground">{vendor.business_name}</h2>
              {vendor.store_address && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3" /> {vendor.store_address}
                </p>
              )}
              {vendor.rating != null && vendor.rating > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {Number(vendor.rating).toFixed(1)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Subcategory pill row — between vendor banner and products.
            Only renders when the vendor declared subcategories. Drives
            the products filter below. */}
        {subcategoryPills.length > 0 && (
          <div className="mx-4 mt-3 bg-card rounded-2xl border border-border">
            <div className="flex gap-2 overflow-x-auto no-scrollbar p-3">
              <button
                onClick={() => setActiveSubId(null)}
                className={cn(
                  'shrink-0 px-4 h-9 rounded-full text-[13px] whitespace-nowrap border transition-colors',
                  activeSubId === null
                    ? 'bg-[#e8f5e9] border-[#2e7d32] text-[#2e7d32] font-semibold'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50',
                )}
              >
                All
              </button>
              {subcategoryPills.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setActiveSubId(sub.id)}
                  className={cn(
                    'shrink-0 px-4 h-9 rounded-full text-[13px] whitespace-nowrap border transition-colors',
                    activeSubId === sub.id
                      ? 'bg-[#e8f5e9] border-[#2e7d32] text-[#2e7d32] font-semibold'
                      : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50',
                  )}
                >
                  {sub.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Products list — vertical, one product per row. Vendor name is hidden
            since the shopper is already inside this vendor's store page. */}
        <div className="px-4 mt-4">
          <h3 className="text-sm font-bold text-foreground mb-3">
            {productsLoading ? '' : `${filteredProducts.length} Products`}
          </h3>
          <div className="flex flex-col gap-2.5">
            {productsLoading
              ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
              : filteredProducts.map((product) => (
                  <div key={product.id} onClick={() => navigate(`/product/${product.slug}`)} className="cursor-pointer">
                    <ProductCard product={product} layout="list" hideVendor />
                  </div>
                ))}
          </div>
          {!productsLoading && filteredProducts.length === 0 && (
            <p className="text-center text-muted-foreground py-12 text-sm">
              {activeSubId
                ? 'No products under this section.'
                : 'No products available from this store.'}
            </p>
          )}
        </div>

        {/* Customer-facing reviews — quiet when there are none. */}
        {vendorId && <VendorReviewsSection vendorId={vendorId} vendorRating={vendor?.rating ?? null} />}
      </div>
    </CustomerLayout>
  );
};

export default StorePage;
