import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout, vendorNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { CatalogCategorySection } from '@/components/vendor/CatalogCategorySection';

/**
 * Vendor-side dedicated subcategories page.
 *
 * Reuses CatalogCategorySection (the same component VendorSettings renders
 * under Business Profile) — keeps a single source of truth for the catalog
 * management UX. This page just gives it a top-level home in the sidebar
 * so vendors don't have to dig into Settings to add a menu section.
 */
const VendorSubcategories: React.FC = () => {
  const { user } = useAuthStore();

  const { data: vendor, isLoading } = useQuery({
    queryKey: ['vendor-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('vendors')
        .select('*')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  return (
    <DashboardLayout
      title="Subcategories"
      navItems={vendorNavItems}
      roleColor="bg-blue-500 text-white"
      roleName="Vendor Panel"
    >
      <Card>
        <CardHeader>
          <CardTitle>Menu sections for your store</CardTitle>
          <CardDescription>
            These show up as filter pills on your store page (e.g. Breakfast, Lunch, Dinner).
            Customers tap a pill to narrow down to just that section. Each product you add
            can be filed under one of these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your catalog…</p>
          ) : !vendor ? (
            <p className="text-sm text-muted-foreground">No vendor profile found for your account.</p>
          ) : (
            <CatalogCategorySection vendor={vendor as any} />
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default VendorSubcategories;
