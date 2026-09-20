import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2, Copy } from 'lucide-react';
import { VendorAddSubcategoryDialog } from '@/components/vendor/VendorAddSubcategoryDialog';

interface Props {
  vendor: any;
}

interface CategoryRow {
  id: string;
  name: string;
  slug?: string;
}

/**
 * Vendor-facing catalog section.
 *
 * Root category is admin-assigned (read-only). Vendor manages which
 * subcategories under that root apply to their store + can create new
 * subcategories via the RPC (auto-attaches on create).
 */
export const CatalogCategorySection: React.FC<Props> = ({ vendor }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const vendorId: string | null = vendor?.id ?? null;
  const rootId: string | null = vendor?.category_id ?? null;
  const persistedSubs: string[] = useMemo(
    () => (Array.isArray(vendor?.subcategory_ids) ? vendor.subcategory_ids : []),
    [vendor?.subcategory_ids],
  );

  const [localSubs, setLocalSubs] = useState<string[]>(persistedSubs);
  const [addOpen, setAddOpen] = useState(false);

  // Re-sync when the persisted array changes (e.g. after a +Add).
  useEffect(() => {
    setLocalSubs(persistedSubs);
  }, [persistedSubs]);

  // Root category name (read-only).
  const { data: rootRow } = useQuery({
    queryKey: ['vendor-catalog-root', rootId],
    queryFn: async () => {
      if (!rootId) return null;
      const { data } = await supabase
        .from('categories')
        .select('id, name')
        .eq('id', rootId)
        .maybeSingle();
      return data as CategoryRow | null;
    },
    enabled: !!rootId,
  });

  // All active subcategories under the root — shared across vendors.
  const { data: subs = [], isLoading: subsLoading } = useQuery({
    queryKey: ['vendor-subcats', rootId],
    queryFn: async () => {
      if (!rootId) return [] as CategoryRow[];
      const { data } = await supabase
        .from('categories')
        .select('id, name, slug, display_order')
        .eq('parent_id', rootId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });
      return (data || []) as (CategoryRow & { display_order: number })[];
    },
    enabled: !!rootId,
  });

  const saveMutation = useMutation({
    mutationFn: async (next: string[]) => {
      if (!vendorId) throw new Error('No vendor id');
      const { error } = await supabase
        .from('vendors')
        .update({ subcategory_ids: next })
        .eq('id', vendorId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({
        title: 'Subcategories saved',
        description: 'Your store\'s subcategories were updated.',
      });
      queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Could not save subcategories',
        description: err?.message || 'Try again.',
        variant: 'destructive',
      });
    },
  });

  const isDirty = useMemo(() => {
    if (localSubs.length !== persistedSubs.length) return true;
    const a = [...localSubs].sort();
    const b = [...persistedSubs].sort();
    return a.some((v, i) => v !== b[i]);
  }, [localSubs, persistedSubs]);

  const toggle = (subId: string, checked: boolean) => {
    setLocalSubs((prev) =>
      checked ? Array.from(new Set([...prev, subId])) : prev.filter((id) => id !== subId),
    );
  };

  // No root set yet — admin hasn't assigned a category.
  if (!rootId) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 space-y-1">
        <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Catalog category</p>
        <p className="text-sm">
          <em className="text-amber-700">Not set by admin yet</em>
        </p>
        <p className="text-[11px] text-muted-foreground">
          Once admin assigns a category, you can add and manage subcategories here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Catalog category</p>
        <p className="text-sm">
          <span className="font-medium">{rootRow?.name || '…'}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          Set by admin. Drives where your store appears on the customer browse.
        </p>
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between gap-2">
          <Label>My subcategories</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add subcategory
          </Button>
        </div>

        {subsLoading ? (
          <p className="text-[11px] text-muted-foreground italic">Loading…</p>
        ) : subs.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {subs.map((sub) => {
              const checked = localSubs.includes(sub.id);
              return (
                <label
                  key={sub.id}
                  className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-sm cursor-pointer transition-colors ${
                    checked
                      ? 'border-primary bg-primary/5'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-primary mt-0.5 shrink-0"
                    checked={checked}
                    onChange={(e) => toggle(sub.id, e.target.checked)}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate">{sub.name}</span>
                    {sub.slug && (
                      <button
                        type="button"
                        title="Click to copy — paste into bulk-upload subcategory_slug"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          (async () => {
                            try {
                              await navigator.clipboard.writeText(sub.slug!);
                              toast({ title: 'Slug copied', description: sub.slug });
                            } catch {
                              toast({ title: 'Copy failed', description: 'Select and copy manually.', variant: 'destructive' });
                            }
                          })();
                        }}
                        className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 hover:text-slate-700"
                      >
                        <span className="truncate max-w-[120px]">{sub.slug}</span>
                        <Copy className="w-2.5 h-2.5 shrink-0" />
                      </button>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">
            No subcategories yet — use "Add subcategory" above to create one.
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">
          Visible to other vendors in this category and to admin. Customers filter products by these.
        </p>

        {isDirty && (
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setLocalSubs(persistedSubs)}
              disabled={saveMutation.isPending}
            >
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => saveMutation.mutate(localSubs)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Save subcategories
            </Button>
          </div>
        )}
      </div>

      <VendorAddSubcategoryDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        rootCategoryName={rootRow?.name ?? null}
      />
    </div>
  );
};
