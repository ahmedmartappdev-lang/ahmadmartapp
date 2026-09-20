import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Lightweight shape the new browse pages need from a vendor row.
export interface VendorBrowseRow {
  id: string;
  business_name: string;
  store_photo_url: string | null;
  owner_photo_url: string | null;
  store_address: string | null;
  city: string | null;
  pincode: string | null;
  rating: number | null;
  is_featured: boolean | null;
  is_accepting_orders: boolean | null;
  status: string | null;
  category_id: string | null;
  subcategory_ids: string[] | null;
}

const VENDOR_BROWSE_SELECT =
  'id, business_name, store_photo_url, owner_photo_url, store_address, city, pincode, rating, is_featured, is_accepting_orders, status, category_id, subcategory_ids';

/**
 * Vendors filtered by a category (Swiggy "restaurants in this cuisine"
 * model). Optionally narrows further by a subcategory using PostgREST's
 * `cs` (contains) operator against the `subcategory_ids` array.
 *
 * Active + accepting-orders vendors only. Featured first, then alpha.
 */
export function useVendorsByCategory(categoryId?: string | null, subId?: string | null) {
  return useQuery<VendorBrowseRow[]>({
    queryKey: ['vendors-by-category', categoryId, subId || null],
    enabled: !!categoryId,
    queryFn: async () => {
      let q = (supabase.from('vendors') as any)
        .select(VENDOR_BROWSE_SELECT)
        .eq('category_id', categoryId)
        .eq('status', 'active')
        .order('is_featured', { ascending: false })
        .order('business_name', { ascending: true });
      if (subId) {
        // Postgres array contains: vendor.subcategory_ids @> [subId]
        q = q.contains('subcategory_ids', [subId]);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as VendorBrowseRow[];
    },
  });
}

/**
 * Vendor reviews list — customer-facing variant. Reads only `vendor`-type
 * reviews and resolves the reviewer's first-name initial for display.
 */
export interface VendorReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  customer_id: string;
  reviewer_name: string | null;
}

export function useVendorReviews(vendorId?: string | null, limit = 50) {
  return useQuery<VendorReviewRow[]>({
    queryKey: ['vendor-reviews', vendorId, limit],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at, customer_id')
        .eq('vendor_id', vendorId!)
        .eq('review_type', 'vendor')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const reviews = (rows || []) as Array<{ id: string; rating: number; comment: string | null; created_at: string; customer_id: string }>;
      if (reviews.length === 0) return [];

      // Lookup reviewer names in one shot.
      const customerIds = Array.from(new Set(reviews.map(r => r.customer_id).filter(Boolean)));
      const nameByUser = new Map<string, string>();
      if (customerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', customerIds);
        for (const p of (profiles || []) as Array<{ user_id: string; full_name: string | null }>) {
          if (p.full_name) nameByUser.set(p.user_id, p.full_name);
        }
      }
      return reviews.map(r => ({
        ...r,
        reviewer_name: nameByUser.get(r.customer_id) || null,
      }));
    },
  });
}

/**
 * Single vendor + category + subcategory NAMES resolved.
 * Used by StorePage so the subcategory pills can render labels without
 * a second round-trip per pill.
 */
export interface VendorWithCatalog {
  vendor: VendorBrowseRow | null;
  categoryName: string | null;
  subcategories: Array<{ id: string; name: string }>;
}

export function useVendorWithCatalog(vendorId?: string | null) {
  return useQuery<VendorWithCatalog>({
    queryKey: ['vendor-with-catalog', vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data: vendor, error: vErr } = await (supabase.from('vendors') as any)
        .select(VENDOR_BROWSE_SELECT)
        .eq('id', vendorId)
        .single();
      if (vErr) throw vErr;
      if (!vendor) return { vendor: null, categoryName: null, subcategories: [] };
      const v = vendor as VendorBrowseRow;
      if (!v.category_id) {
        return { vendor: v, categoryName: null, subcategories: [] };
      }
      // Pills = ALL active subcategories under the vendor's root category.
      // Products can be filed under any of them (not just the vendor's
      // declared subcategory_ids, which only drive category-page discovery).
      const [{ data: rootRow }, { data: subRows }] = await Promise.all([
        supabase.from('categories').select('id, name').eq('id', v.category_id).maybeSingle(),
        supabase
          .from('categories')
          .select('id, name, display_order')
          .eq('parent_id', v.category_id)
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .order('name', { ascending: true }),
      ]);
      const categoryName = (rootRow as { id: string; name: string } | null)?.name ?? null;
      const subs = ((subRows || []) as Array<{ id: string; name: string }>).map(
        ({ id, name }) => ({ id, name }),
      );
      return { vendor: v, categoryName, subcategories: subs };
    },
  });
}
