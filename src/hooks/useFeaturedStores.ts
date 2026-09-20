import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Customer-side: only vendors that admin has explicitly featured AND are
// inside their feature window (featured_until NULL or in the future).
// No client-side cap — the customer Top Picks section is horizontally
// scrollable; the admin Top Picks page is the source of truth for how
// many appear.
export function useFeaturedStores() {
  return useQuery({
    queryKey: ['featured-stores'],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('vendors')
        .select('id, business_name, owner_photo_url, store_photo_url, store_address, rating')
        .eq('status', 'active')
        .eq('is_accepting_orders', true)
        .eq('is_featured', true)
        .or(`featured_until.is.null,featured_until.gt.${nowIso}`)
        .order('featured_order', { ascending: true, nullsFirst: false })
        .order('featured_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });
}
