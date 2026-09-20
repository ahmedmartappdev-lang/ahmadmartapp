import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Product, Category } from '@/types/database';

const PRODUCT_SELECT = `
  *,
  category:categories(*),
  vendor:vendors(business_name, rating)
`;

type ProductWithRelations = Product & { category: Category };

// Customer-facing storefront rule: a product is visible only when the
// admin has explicitly set a price. NULL or 0 means "not yet priced" —
// hide it. Vendor's selling_price never reaches the customer-side UI.
//
// Helper applied to every customer query in this file. Admin / vendor
// dashboards use their own queries and are unaffected.
function applyCustomerVisibility<T extends { not: any; gt: any }>(query: T): T {
  return query
    .not('admin_selling_price', 'is', null)
    .gt('admin_selling_price', 0) as T;
}

export function useProducts(categorySlug?: string) {
  return useQuery({
    queryKey: ['products', categorySlug],
    queryFn: async () => {
      let query: any = supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .in('status', ['active', 'out_of_stock'])
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });

      query = applyCustomerVisibility(query);

      if (categorySlug) {
        query = query.eq('category.slug', categorySlug);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as ProductWithRelations[];
    },
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: async () => {
      const { data, error } = await applyCustomerVisibility(
        supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .eq('slug', slug)
      ).maybeSingle();

      if (error) throw error;
      return data as unknown as ProductWithRelations | null;
    },
    enabled: !!slug,
  });
}

export function useFeaturedProducts() {
  return useQuery({
    queryKey: ['products', 'featured'],
    queryFn: async () => {
      const { data, error } = await applyCustomerVisibility(
        supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .in('status', ['active', 'out_of_stock'])
          .eq('is_featured', true)
      ).limit(10);

      if (error) throw error;
      return data as unknown as ProductWithRelations[];
    },
  });
}

export function useTrendingProducts() {
  return useQuery({
    queryKey: ['products', 'trending'],
    queryFn: async () => {
      const { data, error } = await applyCustomerVisibility(
        supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .in('status', ['active', 'out_of_stock'])
          .eq('is_trending', true)
      ).limit(10);

      if (error) throw error;
      return data as unknown as ProductWithRelations[];
    },
  });
}

// Blinkit-style: each active category with up to 10 products embedded.
// Single round-trip — PostgREST nests the products select inside categories.
export interface HomeCategorySection {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  display_order: number | null;
  products: ProductWithRelations[];
}

export function useHomeCategorySections() {
  return useQuery({
    queryKey: ['home', 'category-sections'],
    queryFn: async () => {
      // The visibility filter on nested products goes through the
      // foreignTable-aware filter helpers, not the regular .not()/.gt().
      const { data, error } = await supabase
        .from('categories')
        .select(`
          id, name, slug, image_url, display_order,
          products!inner(
            *,
            category:categories(*),
            vendor:vendors(business_name, rating)
          )
        `)
        .eq('is_active', true)
        .eq('products.status', 'active')
        .not('products.admin_selling_price', 'is', null)
        .gt('products.admin_selling_price', 0)
        .order('display_order', { ascending: true });

      if (error) throw error;

      // Cap each category to 10 products and skip empties
      const sections = (data as any[])
        .map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          image_url: c.image_url,
          display_order: c.display_order,
          products: (c.products || []).slice(0, 10),
        }))
        .filter((c) => c.products.length > 0);

      return sections as HomeCategorySection[];
    },
  });
}

export function useSearchProducts(query: string) {
  return useQuery({
    queryKey: ['products', 'search', query],
    queryFn: async () => {
      if (!query || query.length < 1) return [];

      const { data, error } = await applyCustomerVisibility(
        supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .in('status', ['active', 'out_of_stock'])
          .or(`name.ilike.%${query}%,brand.ilike.%${query}%,description.ilike.%${query}%`)
      ).limit(20);

      if (error) throw error;
      return data as unknown as ProductWithRelations[];
    },
    enabled: query.length >= 1,
  });
}

export function useProductSuggestions(query: string) {
  return useQuery({
    queryKey: ['products', 'suggestions', query],
    queryFn: async () => {
      if (!query || query.length < 1) return [];

      const { data, error } = await applyCustomerVisibility(
        supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .in('status', ['active', 'out_of_stock'])
          .or(`name.ilike.%${query}%`)
      ).limit(5);

      if (error) throw error;
      return data as unknown as ProductWithRelations[];
    },
    enabled: query.length >= 1,
  });
}

export function useRelatedProducts(categoryId: string | undefined, currentProductId: string | undefined) {
  return useQuery({
    queryKey: ['products', 'related', categoryId, currentProductId],
    queryFn: async () => {
      if (!categoryId) return [];

      const { data, error } = await applyCustomerVisibility(
        supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .eq('category_id', categoryId)
          .neq('id', currentProductId || '')
          .in('status', ['active', 'out_of_stock'])
      ).limit(10);

      if (error) throw error;
      return data as unknown as ProductWithRelations[];
    },
    enabled: !!categoryId,
  });
}
