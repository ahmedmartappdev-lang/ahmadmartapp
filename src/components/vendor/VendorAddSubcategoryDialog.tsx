import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootCategoryName: string | null;
}

const slugPreview = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const friendlyError = (raw: string): string => {
  const m = raw || '';
  if (m.includes('vendor_no_root_category'))
    return 'Your store needs a catalog category before you can add subcategories. Ask admin to set one.';
  if (m.includes('vendor_not_found'))
    return 'Could not find your vendor profile. Please refresh.';
  if (m.includes('name_required')) return 'Subcategory name is required.';
  if (m.includes('name_too_long')) return 'Subcategory name must be 64 characters or fewer.';
  if (m.includes('name_invalid')) return 'Use letters or numbers in the name.';
  if (m.includes('slug_collision')) return 'Too many similar names exist. Try a different one.';
  return m || 'Could not create subcategory.';
};

export const VendorAddSubcategoryDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  rootCategoryName,
}) => {
  const [name, setName] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (trimmed: string) => {
      const { data, error } = await supabase.rpc('vendor_create_subcategory' as any, {
        p_name: trimmed,
      });
      if (error) throw new Error(error.message);
      return data as { id: string; name: string; slug: string; parent_id: string; created: boolean };
    },
    onSuccess: (data) => {
      toast({
        title: data.created ? 'Subcategory created' : 'Subcategory added',
        description: data.created
          ? `"${data.name}" is now available to your store.`
          : `"${data.name}" already existed — it's now attached to your store.`,
      });
      setName('');
      onOpenChange(false);
      // Refresh anything that lists subcategories or the vendor profile.
      queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-subcats'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-catalog-names'] });
      queryClient.invalidateQueries({ queryKey: ['categories-for-products'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Could not add subcategory',
        description: friendlyError(err?.message || String(err)),
        variant: 'destructive',
      });
    },
  });

  const trimmed = name.trim();
  const preview = slugPreview(trimmed);
  const canSubmit = trimmed.length > 0 && trimmed.length <= 64 && preview.length > 0 && !mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!mutation.isPending) onOpenChange(o);
        if (!o) setName('');
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add subcategory</DialogTitle>
          <DialogDescription>
            {rootCategoryName
              ? <>Adds a new subcategory under <span className="font-medium">{rootCategoryName}</span>. It becomes visible to other vendors in the same category and to admin, and is auto-attached to your store.</>
              : 'Adds a new subcategory under your store\'s catalog category.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="sub-name">Subcategory name</Label>
            <Input
              id="sub-name"
              autoFocus
              placeholder="e.g. Spices"
              value={name}
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) {
                  e.preventDefault();
                  mutation.mutate(trimmed);
                }
              }}
            />
            {preview && (
              <p className="text-[11px] text-muted-foreground">
                slug: <span className="font-mono">{preview}</span>
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate(trimmed)}
            disabled={!canSubmit}
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
